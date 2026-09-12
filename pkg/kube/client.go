package kube

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"k8s.io/client-go/kubernetes"
	_ "k8s.io/client-go/plugin/pkg/client/auth"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	clientcmdapi "k8s.io/client-go/tools/clientcmd/api"
	metricsv1beta1 "k8s.io/metrics/pkg/client/clientset/versioned"
)

// ClientManager manages Kubernetes configuration discovery, active context switching,
// and thread-safe access to the client-go Clientset and REST config.
type ClientManager struct {
	mu                 sync.RWMutex
	loadingRules       *clientcmd.ClientConfigLoadingRules
	clientConfig       clientcmd.ClientConfig
	restConfig         *rest.Config
	clientset          *kubernetes.Clientset
	streamingClientset *kubernetes.Clientset
	metricsClientset   *metricsv1beta1.Clientset
	rawConfig          clientcmdapi.Config
	currentContext     string
	activeNamespace    string
}

// NewClientManager initializes a new ClientManager, discovering kubeconfig files from
// KUBECONFIG env or ~/.kube/config and loading the active context.
func NewClientManager() (*ClientManager, error) {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	configOverrides := &clientcmd.ConfigOverrides{}
	clientConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, configOverrides)

	cm := &ClientManager{
		loadingRules: loadingRules,
		clientConfig: clientConfig,
	}

	// Discover and load kubeconfig
	rawConfig, err := loadingRules.Load()
	if err != nil {
		slog.Warn("Failed to load kubeconfig via loading rules", "error", err)
	} else if rawConfig != nil {
		cm.rawConfig = *rawConfig
		cm.currentContext = rawConfig.CurrentContext
	}

	contextNames := make([]string, 0, len(cm.rawConfig.Contexts))
	for name := range cm.rawConfig.Contexts {
		contextNames = append(contextNames, name)
	}

	slog.Debug("Discovered kubeconfig",
		"precedence", loadingRules.GetLoadingPrecedence(),
		"defaultContext", cm.currentContext,
		"discoveredContexts", contextNames,
	)

	// Attempt to build clientset for the active context if one exists
	if cm.currentContext != "" {
		if err := cm.buildClientsetLocked(cm.currentContext); err != nil {
			slog.Warn("Failed to initialize clientset for default context", "context", cm.currentContext, "error", err)
		} else {
			slog.Info("Initialized Kubernetes client for context", "context", cm.currentContext)
		}
	} else {
		slog.Warn("No active context set in discovered kubeconfig")
	}

	return cm, nil
}

// buildClientsetLocked rebuilds the REST config and Clientset for a specified context.
// Caller must hold cm.mu write lock.
func (cm *ClientManager) buildClientsetLocked(contextName string) error {
	overrides := &clientcmd.ConfigOverrides{
		CurrentContext: contextName,
	}
	clientConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(cm.loadingRules, overrides)

	restConfig, err := clientConfig.ClientConfig()
	if err != nil {
		return fmt.Errorf("failed to build rest.Config for context %q: %w", contextName, err)
	}

	// Apply a sensible timeout to prevent hanging UI on unreachable networks
	restConfig.Timeout = 10 * time.Second

	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return fmt.Errorf("failed to instantiate kubernetes.Clientset: %w", err)
	}

	// Disable HTTP client timeout for streaming operations (logs, port-forward)
	streamConfig := rest.CopyConfig(restConfig)
	streamConfig.Timeout = 0
	streamingClientset, err := kubernetes.NewForConfig(streamConfig)
	if err != nil {
		return fmt.Errorf("failed to instantiate streaming kubernetes.Clientset: %w", err)
	}

	cm.clientConfig = clientConfig
	cm.restConfig = restConfig
	cm.clientset = clientset
	cm.streamingClientset = streamingClientset

	// Initialize metrics clientset if supported by cluster
	metricsClientset, err := metricsv1beta1.NewForConfig(restConfig)
	if err != nil {
		slog.Warn("[METRICS] Failed to instantiate metrics clientset", "error", err)
	}
	cm.metricsClientset = metricsClientset

	cm.currentContext = contextName
	return nil
}

// SwitchContext updates the active Kubernetes context, rebuilds the Clientset,
// and resets cached clients in a thread-safe manner.
func (cm *ClientManager) SwitchContext(contextName string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	oldContext := cm.currentContext
	slog.Debug("Switching context", "from", oldContext, "to", contextName)

	// Reload raw config to pick up any external changes to kubeconfig
	rawConfig, err := cm.loadingRules.Load()
	if err != nil {
		slog.Error("Failed to reload kubeconfig during context switch", "error", err)
		return fmt.Errorf("failed to reload kubeconfig: %w", err)
	}
	if rawConfig == nil {
		slog.Error("Loaded kubeconfig is nil during context switch")
		return fmt.Errorf("loaded kubeconfig is nil")
	}
	cm.rawConfig = *rawConfig

	if _, exists := cm.rawConfig.Contexts[contextName]; !exists {
		slog.Error("Target context not found in kubeconfig", "context", contextName)
		return fmt.Errorf("context %q not found in kubeconfig", contextName)
	}

	if err := cm.buildClientsetLocked(contextName); err != nil {
		slog.Error("Failed to build clientset for context", "context", contextName, "error", err)
		return fmt.Errorf("failed to switch context to %q: %w", contextName, err)
	}

	cm.activeNamespace = ""
	slog.Info("Active context successfully switched", "from", oldContext, "to", contextName)
	return nil
}

// GetClientset returns the active kubernetes.Clientset in a thread-safe manner.
func (cm *ClientManager) GetClientset() (*kubernetes.Clientset, error) {
	cm.mu.RLock()
	cs := cm.clientset
	ctxName := cm.currentContext
	cm.mu.RUnlock()

	if cs != nil {
		return cs, nil
	}

	if ctxName == "" {
		return nil, fmt.Errorf("no active Kubernetes context configured")
	}

	// Try rebuilding if nil
	cm.mu.Lock()
	defer cm.mu.Unlock()
	if cm.clientset != nil {
		return cm.clientset, nil
	}
	if err := cm.buildClientsetLocked(ctxName); err != nil {
		return nil, err
	}
	return cm.clientset, nil
}

// GetStreamingClientset returns a kubernetes.Clientset configured with Timeout: 0,
// specifically intended for long-lived streaming operations (such as container logs)
// where client-go should not forcibly terminate connections after 10 seconds.
func (cm *ClientManager) GetStreamingClientset() (*kubernetes.Clientset, error) {
	cm.mu.RLock()
	cs := cm.streamingClientset
	ctxName := cm.currentContext
	cm.mu.RUnlock()

	if cs != nil {
		return cs, nil
	}

	if ctxName == "" {
		return nil, fmt.Errorf("no active Kubernetes context configured")
	}

	cm.mu.Lock()
	defer cm.mu.Unlock()
	if cm.streamingClientset != nil {
		return cm.streamingClientset, nil
	}
	if err := cm.buildClientsetLocked(ctxName); err != nil {
		return nil, err
	}
	return cm.streamingClientset, nil
}

// GetRestConfig returns the active rest.Config in a thread-safe manner.
func (cm *ClientManager) GetRestConfig() (*rest.Config, error) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	if cm.restConfig == nil {
		return nil, fmt.Errorf("no active rest.Config available")
	}
	return cm.restConfig, nil
}

// GetCurrentContext returns the name of the currently active context.
func (cm *ClientManager) GetCurrentContext() string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.currentContext
}

// GetCurrentNamespace returns the namespace defined for the active context,
// or "default" if omitted or unavailable.
func (cm *ClientManager) GetCurrentNamespace() string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	if cm.clientConfig == nil {
		return "default"
	}
	ns, _, err := cm.clientConfig.Namespace()
	if err != nil || ns == "" {
		return "default"
	}
	return ns
}

// SetActiveNamespace updates the session-active namespace.
func (cm *ClientManager) SetActiveNamespace(namespace string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.activeNamespace = namespace
}

// GetActiveNamespace returns the session-active namespace if set,
// otherwise falling back to the active context's configured namespace.
func (cm *ClientManager) GetActiveNamespace() string {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	if cm.activeNamespace != "" {
		return cm.activeNamespace
	}
	if cm.clientConfig == nil {
		return "default"
	}
	ns, _, err := cm.clientConfig.Namespace()
	if err != nil || ns == "" {
		return "default"
	}
	return ns
}

// GetRawConfig returns a fresh copy of the raw parsed kubeconfig.
func (cm *ClientManager) GetRawConfig() (clientcmdapi.Config, error) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	rawConfig, err := cm.loadingRules.Load()
	if err != nil {
		return cm.rawConfig, err
	}
	if rawConfig != nil {
		cm.rawConfig = *rawConfig
	}
	return cm.rawConfig, nil
}

// GetMetricsClientset returns the cached metrics.k8s.io Clientset if available.
func (cm *ClientManager) GetMetricsClientset() (*metricsv1beta1.Clientset, error) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	if cm.metricsClientset == nil {
		return nil, fmt.Errorf("metrics clientset is not initialized")
	}
	return cm.metricsClientset, nil
}

// GetHealthDetails queries the Kubernetes API server for the active context,
// measuring round-trip latency, reading server version, endpoint URL, and active auth identity.
func (cm *ClientManager) GetHealthDetails(ctx context.Context) (endpoint string, serverVersion string, latencyMs int64, authIdentity string, err error) {
	cm.mu.RLock()
	clientset := cm.clientset
	restConfig := cm.restConfig
	currentContext := cm.currentContext
	rawConfig := cm.rawConfig
	cm.mu.RUnlock()

	if clientset == nil || restConfig == nil {
		return "", "", 0, "", fmt.Errorf("no active cluster connection")
	}

	endpoint = restConfig.Host

	// Resolve active auth identity from kubeconfig context
	if ctxObj, ok := rawConfig.Contexts[currentContext]; ok && ctxObj != nil {
		authInfoName := ctxObj.AuthInfo
		if authInfo, authOk := rawConfig.AuthInfos[authInfoName]; authOk && authInfo != nil {
			if authInfo.Username != "" {
				authIdentity = authInfo.Username
			} else if authInfo.Exec != nil {
				// Search for IAM role or identity in exec args/env
				for _, arg := range authInfo.Exec.Args {
					if len(arg) > 8 && (arg[:4] == "arn:" || arg[:3] == "k8s") {
						authIdentity = arg
						break
					}
				}
				if authIdentity == "" && len(authInfo.Exec.Args) > 0 {
					authIdentity = authInfo.Exec.Command
				}
			}
			if authIdentity == "" {
				authIdentity = authInfoName
			}
		} else {
			authIdentity = authInfoName
		}
	}
	if authIdentity == "" {
		authIdentity = restConfig.Username
	}
	if authIdentity == "" {
		authIdentity = "default"
	}

	// Ping cluster and measure round-trip latency via discovery
	start := time.Now()
	timeoutCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	type verResult struct {
		verInfo interface{ String() string }
		gitVer  string
		err     error
	}
	ch := make(chan verResult, 1)

	go func() {
		info, err := clientset.Discovery().ServerVersion()
		gitVer := ""
		if info != nil {
			gitVer = info.GitVersion
		}
		ch <- verResult{verInfo: info, gitVer: gitVer, err: err}
	}()

	select {
	case res := <-ch:
		latencyMs = time.Since(start).Milliseconds()
		if res.err != nil {
			return endpoint, "", latencyMs, authIdentity, res.err
		}
		return endpoint, res.gitVer, latencyMs, authIdentity, nil
	case <-timeoutCtx.Done():
		latencyMs = time.Since(start).Milliseconds()
		return endpoint, "", latencyMs, authIdentity, timeoutCtx.Err()
	}
}
