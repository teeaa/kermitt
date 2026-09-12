package ipc

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/teeaa/kermitt/pkg/kube"
	"github.com/teeaa/kermitt/pkg/logger"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// KubeBridge provides the live IPC bridge connecting Wails to Kubernetes via client-go.
type KubeBridge struct {
	ctx             context.Context
	mu              sync.RWMutex
	clientManager   *kube.ClientManager
	logManager      *kube.LogStreamManager
	execManager     *kube.ExecSessionManager
	informerManager *kube.InformerManager
	bootstrapper    *Bootstrapper
	workloadCache   *WorkloadCache
	activeContext   string
	activeNamespace string
	emitter         EventEmitter
	streamSequence  uint64
}

// Compile-time interface verification.
var _ KubeBridgeContract = (*KubeBridge)(nil)

// NewKubeBridge initializes a new KubeBridge backed by the live ClientManager.
func NewKubeBridge(cm *kube.ClientManager, emitter ...EventEmitter) *KubeBridge {
	var em EventEmitter = NoopEventEmitter{}
	if len(emitter) > 0 && emitter[0] != nil {
		em = emitter[0]
	}

	activeCtx := ""
	if cm != nil {
		activeCtx = cm.GetCurrentContext()
	}

	cache := NewWorkloadCache()

	b := &KubeBridge{
		clientManager:   cm,
		logManager:      kube.NewLogStreamManager(),
		execManager:     kube.NewExecSessionManager(),
		workloadCache:   cache,
		activeContext:   activeCtx,
		activeNamespace: "all",
		emitter:         em,
	}

	var cs kubernetes.Interface
	if cm != nil {
		if c, err := cm.GetClientset(); err == nil {
			cs = c
		}
	}
	b.informerManager = kube.NewInformerManager(cs, func(eventName string, optionalData ...interface{}) {
		b.emit(eventName, optionalData...)
	})
	b.bootstrapper = NewBootstrapper(cm, func(eventName string, optionalData ...interface{}) {
		b.emit(eventName, optionalData...)
	}, b.informerManager, cache)

	return b
}

// SetWailsContext stores the Wails application context on the bridge instance and logger.
// Note: Informers are NOT started immediately here. They are started after Phase 2 initial background
// lists complete, preventing initial event bursts from overwhelming IPC channels.
func SetWailsContext(bridge *KubeBridge, ctx context.Context) {
	if bridge != nil {
		bridge.mu.Lock()
		bridge.ctx = ctx
		bridge.mu.Unlock()
	}
	logger.SetWailsContext(ctx)
}

// SetWailsContext stores the Wails application context on the bridge instance.
func (b *KubeBridge) SetWailsContext(ctx context.Context) {
	SetWailsContext(b, ctx)
}

// GetWorkloadCache returns the attached WorkloadCache.
func (b *KubeBridge) GetWorkloadCache() *WorkloadCache {
	return b.workloadCache
}

// SetCustomEmitter configures an external EventEmitter (useful for unit testing).
func (b *KubeBridge) SetCustomEmitter(emitter EventEmitter) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if emitter == nil {
		b.emitter = NoopEventEmitter{}
	} else {
		b.emitter = emitter
	}
}

// getContext returns the Wails context or a background context fallback.
func (b *KubeBridge) getContext() context.Context {
	b.mu.RLock()
	defer b.mu.RUnlock()
	if b.ctx != nil {
		return b.ctx
	}
	return context.Background()
}

// emit dispatches an event to the custom emitter (if any) and Wails runtime (if context available).
func (b *KubeBridge) emit(eventName string, optionalData ...interface{}) {
	b.mu.RLock()
	ctx := b.ctx
	em := b.emitter
	b.mu.RUnlock()

	if em != nil {
		em.Emit(eventName, optionalData...)
	}
	if ctx != nil {
		defer func() {
			if r := recover(); r != nil {
				slog.Debug("[IPC] Recovered from EventsEmit", "error", r)
			}
		}()
		wailsRuntime.EventsEmit(ctx, eventName, optionalData...)
	}
}

// ============================================================================
// Real Kubernetes Client Implementation
// ============================================================================

// GetInitialState executes the Phase 1 Critical Path to resolve active context,
// active namespace, and active pods immediately, returning to the UI in <300ms,
// while kicking off Phase 2 background warm-up goroutines.
func (b *KubeBridge) GetInitialState() (*InitialBootstrapState, error) {
	slog.Info("GetInitialState called")
	ctx := b.getContext()

	if b.bootstrapper == nil {
		b.mu.RLock()
		actCtx := b.activeContext
		actNs := b.activeNamespace
		b.mu.RUnlock()
		slog.Info("GetInitialState returned", "context", actCtx, "namespace", actNs, "count", 0, "pods", []string{})
		return &InitialBootstrapState{
			ActiveContext:   actCtx,
			ActiveNamespace: actNs,
			Pods:            make([]PodSummary, 0),
		}, nil
	}

	state, err := b.bootstrapper.GetInitialState(ctx)
	if err != nil {
		slog.Error("GetInitialState failed", "error", err)
		return nil, NewAppError(ErrCodeInternalError, "Failed to bootstrap initial state", err.Error(), true)
	}

	b.mu.Lock()
	if state.ActiveContext != "" {
		b.activeContext = state.ActiveContext
	}
	if state.ActiveNamespace != "" {
		b.activeNamespace = state.ActiveNamespace
	}
	b.mu.Unlock()

	podNames := make([]string, 0, len(state.Pods))
	for _, p := range state.Pods {
		podNames = append(podNames, p.Name)
	}
	slog.Info("GetInitialState returned", "context", state.ActiveContext, "namespace", state.ActiveNamespace, "count", len(state.Pods), "pods", podNames)
	return state, nil
}

// GetContexts returns all available Kubernetes contexts discovered from kubeconfig.
// Wails-compatible signature (without ctx parameter to prevent JSON unmarshaling errors).
// GetContexts extracts all defined contexts from the raw config,
// identifies the currently active context, and returns them.
func (b *KubeBridge) GetContexts() ([]KubeContext, error) {
	slog.Info("GetContexts called")

	if b.clientManager == nil {
		slog.Warn("GetContexts: client manager is nil, returning empty context list")
		slog.Info("GetContexts returned", "count", 0, "contexts", []string{})
		return make([]KubeContext, 0), nil
	}

	rawConfig, err := b.clientManager.GetRawConfig()
	if err != nil {
		slog.Error("GetContexts failed: error reading raw kubeconfig", "error", err)
		return nil, NewAppError(ErrCodeInternalError, "Failed to read kubeconfig", err.Error(), true)
	}

	activeCtx := b.clientManager.GetCurrentContext()

	contexts := make([]KubeContext, 0, len(rawConfig.Contexts))
	for name, ctxEntry := range rawConfig.Contexts {
		if ctxEntry == nil {
			continue
		}
		ns := ctxEntry.Namespace
		if ns == "" {
			ns = "default"
		}
		contexts = append(contexts, KubeContext{
			Name:        name,
			ClusterName: ctxEntry.Cluster,
			UserName:    ctxEntry.AuthInfo,
			IsActive:    name == activeCtx,
			Namespace:   ns,
			Environment: ClassifyEnvironment(name),
		})
	}

	// Deterministic sorting: active context first, then alphabetically by name
	sort.Slice(contexts, func(i, j int) bool {
		if contexts[i].IsActive != contexts[j].IsActive {
			return contexts[i].IsActive
		}
		return contexts[i].Name < contexts[j].Name
	})

	names := make([]string, 0, len(contexts))
	for _, c := range contexts {
		names = append(names, c.Name)
	}

	if len(contexts) == 0 {
		slog.Warn("GetContexts: no contexts found in kubeconfig; returning empty context list")
	}

	slog.Info("GetContexts returned", "count", len(contexts), "contexts", names)
	return contexts, nil
}

// SwitchContext switches the active Kubernetes context.
// Wails-compatible signature (without ctx parameter to prevent JSON unmarshaling errors).
// SwitchContext calls ClientManager.SwitchContext() to rebuild the clientset.
func (b *KubeBridge) SwitchContext(contextName string) error {
	b.mu.RLock()
	oldContext := b.activeContext
	b.mu.RUnlock()

	slog.Info("SwitchContext called", "from", oldContext, "to", contextName)

	if contextName == "" {
		slog.Error("SwitchContext failed: context name cannot be empty")
		return NewAppError(ErrCodeInvalidRequest, "Context name cannot be empty", "", false)
	}

	if b.workloadCache != nil {
		b.workloadCache.Clear()
	}

	if b.clientManager == nil {
		b.mu.Lock()
		b.activeContext = contextName
		b.mu.Unlock()
		b.emit(EventContextChanged, KubeContext{Name: contextName, IsActive: true})
		slog.Info("SwitchContext returned", "context", contextName)
		return nil
	}

	if err := b.clientManager.SwitchContext(contextName); err != nil {
		slog.Error("SwitchContext failed", "context", contextName, "error", err)
		return NewAppError(ErrCodeContextNotFound, fmt.Sprintf("Failed to switch context to %q", contextName), err.Error(), false)
	}

	if b.logManager != nil {
		b.logManager.StopAll()
	}
	if b.execManager != nil {
		b.execManager.StopAll()
	}

	// Update informers with newly built clientset
	if b.informerManager != nil {
		if cs, err := b.clientManager.GetClientset(); err == nil {
			b.informerManager.UpdateClientset(cs)
		}
	}

	b.mu.Lock()
	b.activeContext = contextName
	b.activeNamespace = "all"
	b.mu.Unlock()

	// Notify frontend listeners about the context change
	b.emit(EventContextChanged, KubeContext{
		Name:      contextName,
		IsActive:  true,
		Namespace: b.clientManager.GetCurrentNamespace(),
	})
	b.emit(EventClusterRefresh, nil)

	slog.Info("SwitchContext returned", "from", oldContext, "to", contextName)
	return nil
}

// SetNamespace updates the active namespace in session memory and triggers change notifications.
func (b *KubeBridge) SetNamespace(namespace string) error {
	slog.Info("SetNamespace called", "namespace", namespace)
	b.mu.Lock()
	b.activeNamespace = namespace
	b.mu.Unlock()

	if b.clientManager != nil {
		b.clientManager.SetActiveNamespace(namespace)
	}

	b.emit(EventNamespaceChanged, map[string]string{"namespace": namespace})
	b.emit(EventClusterRefresh, nil)
	slog.Info("SetNamespace returned", "namespace", namespace)
	return nil
}

// GetNamespaces returns all namespaces in the currently active cluster context.
// Wails-compatible signature (without ctx parameter to prevent JSON unmarshaling errors).
// GetNamespaces queries clientset.CoreV1().Namespaces().List().
// If the user lacks cluster-wide RBAC list permissions for namespaces, it falls back gracefully
// to returning the namespace defined in the active context (or "default") rather than failing.
func (b *KubeBridge) GetNamespaces() ([]Namespace, error) {
	ctx := b.getContext()
	activeCtx := ""
	if b.clientManager != nil {
		activeCtx = b.clientManager.GetCurrentContext()
	}

	slog.Info("GetNamespaces called", "context", activeCtx)

	if b.workloadCache != nil {
		if cached, ok := b.workloadCache.GetNamespaces(); ok && len(cached) > 0 {
			names := make([]string, 0, len(cached))
			for _, ns := range cached {
				names = append(names, ns.Name)
			}
			slog.Info("GetNamespaces returned", "count", len(cached), "namespaces", names, "cached", true)
			return cached, nil
		}
	}

	if b.clientManager == nil {
		slog.Warn("GetNamespaces: client manager is nil; returning empty namespace list")
		slog.Info("GetNamespaces returned", "count", 0, "namespaces", []string{})
		return make([]Namespace, 0), nil
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Warn("GetNamespaces: unable to acquire Clientset; falling back to context namespace", "context", activeCtx, "error", err)
		fallback := b.fallbackNamespaceList()
		names := make([]string, 0, len(fallback))
		for _, ns := range fallback {
			names = append(names, ns.Name)
		}
		slog.Info("GetNamespaces returned", "count", len(fallback), "namespaces", names, "fallback", true)
		return fallback, nil
	}

	// 5-second timeout for the cluster request
	listCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	nsList, err := clientset.CoreV1().Namespaces().List(listCtx, metav1.ListOptions{})
	if err != nil {
		if apierrors.IsForbidden(err) || apierrors.IsUnauthorized(err) {
			slog.Warn("GetNamespaces: RBAC restriction: cluster-wide namespace list forbidden; falling back to active namespace", "context", activeCtx, "error", err)
		} else {
			slog.Warn("GetNamespaces: error querying namespaces from cluster; falling back to active namespace", "context", activeCtx, "error", err)
		}
		fallback := b.fallbackNamespaceList()
		names := make([]string, 0, len(fallback))
		for _, ns := range fallback {
			names = append(names, ns.Name)
		}
		slog.Info("GetNamespaces returned", "count", len(fallback), "namespaces", names, "fallback", true)
		return fallback, nil
	}

	namespaces := make([]Namespace, 0, len(nsList.Items))
	for _, ns := range nsList.Items {
		status := NamespaceActive
		if ns.Status.Phase == "Terminating" {
			status = NamespaceTerminating
		}
		createdAt := ns.CreationTimestamp.Time
		namespaces = append(namespaces, Namespace{
			Name:      ns.Name,
			Status:    status,
			Age:       FormatAge(createdAt),
			CreatedAt: createdAt,
		})
	}

	sort.Slice(namespaces, func(i, j int) bool {
		return namespaces[i].Name < namespaces[j].Name
	})

	if b.workloadCache != nil {
		b.workloadCache.SetNamespaces(namespaces)
	}

	names := make([]string, 0, len(namespaces))
	for _, ns := range namespaces {
		names = append(names, ns.Name)
	}
	slog.Info("GetNamespaces returned", "count", len(namespaces), "namespaces", names)
	return namespaces, nil
}

// fallbackNamespaceList returns the active context namespace as a safe fallback when RBAC blocks List.
func (b *KubeBridge) fallbackNamespaceList() []Namespace {
	activeNs := "default"
	if b.clientManager != nil {
		activeNs = b.clientManager.GetCurrentNamespace()
	}
	if activeNs == "" {
		activeNs = "default"
	}

	now := time.Now().UTC()
	list := []Namespace{
		{
			Name:      activeNs,
			Status:    NamespaceActive,
			Age:       "active",
			CreatedAt: now,
		},
	}
	if activeNs != "default" {
		list = append(list, Namespace{
			Name:      "default",
			Status:    NamespaceActive,
			Age:       "default",
			CreatedAt: now,
		})
	}
	return list
}

// FormatAge converts a timestamp into a concise, human-readable age string.
func FormatAge(t time.Time) string {
	if t.IsZero() {
		return "Unknown"
	}
	d := time.Since(t)
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh", int(d.Hours()))
	}
	return fmt.Sprintf("%dd", int(d.Hours()/24))
}

// ============================================================================
// Workload & Telemetry Methods (Maintained for Pod Table & Log Drawer)
// ============================================================================

// GetPods returns live PodSummary items filtered by namespace.
// Wails-compatible signature (without ctx parameter to prevent JSON unmarshaling errors).
// GetPods returns live PodSummary items filtered by namespace.
// Wails-compatible signature (without ctx parameter to prevent JSON unmarshaling errors).
// GetPods queries clientset.CoreV1().Pods(namespace).List() to retrieve real pods.
// It returns an empty slice make([]PodSummary, 0) (never nil) if no pods exist.
func (b *KubeBridge) GetPods(namespace string) ([]PodSummary, error) {
	ctx := b.getContext()
	start := time.Now()
	activeCtx := ""
	if b.clientManager != nil {
		activeCtx = b.clientManager.GetCurrentContext()
	}

	slog.Info("GetPods called", "namespace", namespace, "context", activeCtx)

	if b.clientManager == nil {
		slog.Warn("GetPods: client manager is nil; returning empty pod list")
		slog.Info("GetPods returned", "count", 0, "pods", []string{})
		return make([]PodSummary, 0), nil
	}

	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetPods failed: unable to acquire clientset", "namespace", namespace, "context", activeCtx, "error", err)
		return make([]PodSummary, 0), NewAppError(ErrCodeClusterTimeout, "Failed to connect to cluster clientset", err.Error(), true)
	}

	targetNs := namespace
	if targetNs == "all" || targetNs == "" || targetNs == "*" {
		targetNs = metav1.NamespaceAll
	}

	listCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	podList, err := clientset.CoreV1().Pods(targetNs).List(listCtx, metav1.ListOptions{})
	if err != nil {
		slog.Error("GetPods failed: kubernetes API error during Pods.List", "namespace", targetNs, "context", activeCtx, "error", err)
		if apierrors.IsForbidden(err) {
			return make([]PodSummary, 0), NewAppError(ErrCodeForbidden, fmt.Sprintf("Access forbidden listing pods in namespace %q", namespace), err.Error(), false)
		}
		return make([]PodSummary, 0), NewAppError(ErrCodeInternalError, fmt.Sprintf("Failed to list pods in namespace %q", namespace), err.Error(), true)
	}

	pods := make([]PodSummary, 0, len(podList.Items))
	for _, p := range podList.Items {
		pods = append(pods, mapPodToSummary(p))
	}

	// Query metrics server for live CPU and memory usage if available
	if b.clientManager != nil {
		if metricsClient, err := b.clientManager.GetMetricsClientset(); err == nil && metricsClient != nil {
			if metricsMap, _ := kube.FetchPodMetrics(ctx, metricsClient, targetNs); len(metricsMap) > 0 {
				for i := range pods {
					key := fmt.Sprintf("%s/%s", pods[i].Namespace, pods[i].Name)
					if usage, exists := metricsMap[key]; exists {
						pods[i].CPUUsage = usage.CPUUsage
						pods[i].MemoryUsage = usage.MemoryUsage
					}
				}
			}
		}
	}

	sort.Slice(pods, func(i, j int) bool {
		return pods[i].Name < pods[j].Name
	})

	podNames := make([]string, 0, len(pods))
	for _, p := range pods {
		podNames = append(podNames, p.Name)
	}
	slog.Info("GetPods returned", "count", len(pods), "pods", podNames, "namespace", namespace, "duration", time.Since(start).String())
	return pods, nil
}

// mapPodToSummary converts a raw Kubernetes Pod into our IPC PodSummary DTO.
func mapPodToSummary(pod corev1.Pod) PodSummary {
	return MapPodToSummary(pod)
}

// determinePodStatus evaluates container waiting/terminated reasons to match realistic pod status.
func determinePodStatus(pod *corev1.Pod) string {
	return DeterminePodStatus(pod)
}

// GetContainerDetails returns detailed container statuses for a specific pod.
// GetContainerDetails queries the live Kubernetes pod spec and status to return real ContainerDetail objects.
func (b *KubeBridge) GetContainerDetails(namespace, podName string) ([]ContainerDetail, error) {
	slog.Info("GetContainerDetails called", "namespace", namespace, "pod", podName)
	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Warn("GetContainerDetails: client manager is nil")
		slog.Info("GetContainerDetails returned", "namespace", namespace, "pod", podName, "count", 0, "containers", []string{})
		return make([]ContainerDetail, 0), nil
	}

	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetContainerDetails failed: unable to acquire clientset", "namespace", namespace, "pod", podName, "error", err)
		return make([]ContainerDetail, 0), NewAppError(ErrCodeConnectionRefused, "unable to acquire clientset", err.Error(), false)
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	pod, err := clientset.CoreV1().Pods(namespace).Get(timeoutCtx, podName, metav1.GetOptions{})
	if err != nil {
		slog.Error("GetContainerDetails failed: pod not found", "namespace", namespace, "pod", podName, "error", err)
		return make([]ContainerDetail, 0), NewAppError(ErrCodePodNotFound, fmt.Sprintf("pod %s/%s not found", namespace, podName), err.Error(), false)
	}

	statusMap := make(map[string]corev1.ContainerStatus)
	for _, cs := range pod.Status.ContainerStatuses {
		statusMap[cs.Name] = cs
	}
	for _, ics := range pod.Status.InitContainerStatuses {
		statusMap[ics.Name] = ics
	}

	total := len(pod.Spec.Containers) + len(pod.Spec.InitContainers)
	details := make([]ContainerDetail, 0, total)

	mapContainer := func(name, image string) ContainerDetail {
		detail := ContainerDetail{
			Name:  name,
			Image: image,
		}
		if cs, ok := statusMap[name]; ok {
			detail.Ready = cs.Ready
			detail.RestartCount = cs.RestartCount

			if cs.State.Running != nil {
				detail.State = ContainerState{
					Status: "running",
					Running: &ContainerStateRunning{
						StartedAt: cs.State.Running.StartedAt.Time,
					},
				}
			} else if cs.State.Waiting != nil {
				detail.State = ContainerState{
					Status: "waiting",
					Waiting: &ContainerStateWaiting{
						Reason:  cs.State.Waiting.Reason,
						Message: cs.State.Waiting.Message,
					},
				}
			} else if cs.State.Terminated != nil {
				var startedAt, finishedAt *time.Time
				if !cs.State.Terminated.StartedAt.IsZero() {
					t := cs.State.Terminated.StartedAt.Time
					startedAt = &t
				}
				if !cs.State.Terminated.FinishedAt.IsZero() {
					t := cs.State.Terminated.FinishedAt.Time
					finishedAt = &t
				}
				detail.State = ContainerState{
					Status: "terminated",
					Terminated: &ContainerStateTerminated{
						ExitCode:    cs.State.Terminated.ExitCode,
						Signal:      cs.State.Terminated.Signal,
						Reason:      cs.State.Terminated.Reason,
						Message:     cs.State.Terminated.Message,
						StartedAt:   startedAt,
						FinishedAt:  finishedAt,
						ContainerID: cs.State.Terminated.ContainerID,
					},
				}
			} else {
				detail.State = ContainerState{Status: "waiting"}
			}
		} else {
			detail.State = ContainerState{Status: "waiting"}
		}
		return detail
	}

	for _, c := range pod.Spec.Containers {
		details = append(details, mapContainer(c.Name, c.Image))
	}
	for _, ic := range pod.Spec.InitContainers {
		details = append(details, mapContainer(ic.Name, ic.Image))
	}

	containerNames := make([]string, 0, len(details))
	for _, c := range details {
		containerNames = append(containerNames, c.Name)
	}
	slog.Info("GetContainerDetails returned", "namespace", namespace, "pod", podName, "count", len(details), "containers", containerNames)
	return details, nil
}

// StartLogStream initiates an asynchronous log stream and returns a unique stream session ID.
// StartLogStream connects to Kubernetes via client-go and streams container logs line-by-line.
func (b *KubeBridge) StartLogStream(req LogStreamRequest) (string, error) {
	slog.Info("StartLogStream called", "namespace", req.Namespace, "pod", req.PodName, "container", req.ContainerName)
	ctx := b.getContext()
	if req.PodName == "" {
		slog.Error("StartLogStream failed: podName is required")
		return "", NewAppError(ErrCodeInvalidRequest, "podName is required", "", false)
	}

	streamID := fmt.Sprintf("stream-%d-%s", atomic.AddUint64(&b.streamSequence, 1), req.PodName)

	if b.clientManager == nil {
		slog.Error("StartLogStream failed: no active Kubernetes client manager")
		return "", NewAppError(ErrCodeConnectionRefused, "no active Kubernetes client manager", "", false)
	}

	clientset, err := b.clientManager.GetStreamingClientset()
	if err != nil {
		clientset, err = b.clientManager.GetClientset()
		if err != nil {
			slog.Error("StartLogStream failed: unable to acquire clientset", "error", err)
			return "", NewAppError(ErrCodeConnectionRefused, "unable to acquire clientset", err.Error(), false)
		}
	}

	targetContainer := req.ContainerName
	if targetContainer == "" {
		timeoutCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		if p, err := clientset.CoreV1().Pods(req.Namespace).Get(timeoutCtx, req.PodName, metav1.GetOptions{}); err == nil && len(p.Spec.Containers) > 0 {
			targetContainer = p.Spec.Containers[0].Name
			slog.Info("[LOGS] Auto-resolved default container for pod log stream", "pod", req.PodName, "container", targetContainer)
		}
		cancel()
	}

	opts := kube.LogStreamOptions{
		Namespace:     req.Namespace,
		PodName:       req.PodName,
		ContainerName: targetContainer,
		TailLines:     req.TailLines,
		Follow:        !req.Previous,
		Timestamps:    true,
		Previous:      req.Previous,
		SinceSeconds:  req.SinceSeconds,
	}

	err = b.logManager.StartStream(
		ctx,
		clientset,
		streamID,
		opts,
		func(rawLine string) {
			line := rawLine
			timestamp := ""
			if idx := strings.IndexByte(rawLine, ' '); idx >= 19 {
				possibleTS := rawLine[:idx]
				if possibleTS[4] == '-' && possibleTS[7] == '-' {
					if _, err := time.Parse(time.RFC3339Nano, possibleTS); err == nil {
						timestamp = possibleTS
						line = rawLine[idx+1:]
					} else if _, err := time.Parse(time.RFC3339, possibleTS); err == nil {
						timestamp = possibleTS
						line = rawLine[idx+1:]
					}
				}
			}

			payload := LogPayload{
				StreamID:      streamID,
				Line:          line,
				Timestamp:     timestamp,
				PodName:       req.PodName,
				ContainerName: targetContainer,
				IsStderr:      false,
			}
			b.emit("k8s:log:"+streamID, payload)
			b.emit(EventLogStreamData, payload)
		},
		func(reason string) {
			b.emit("k8s:log:end:"+streamID, StreamEndPayload{StreamID: streamID, Reason: reason})
			b.emit(EventLogStreamEnd, StreamEndPayload{StreamID: streamID, Reason: reason})
		},
		func(streamErr error) {
			slog.Warn("[LOGS] Log stream reader encountered error", "streamId", streamID, "pod", req.PodName, "error", streamErr)
			errorMap := map[string]string{
				"streamId": streamID,
				"podName":  req.PodName,
				"error":    streamErr.Error(),
			}
			b.emit("k8s:log:error:"+streamID, errorMap)
			b.emit(EventLogStreamError, StreamErrorPayload{
				StreamID: streamID,
				Error:    NewAppError(ErrCodeInternalError, "log stream error", streamErr.Error(), false),
			})
		},
	)
	if err != nil {
		slog.Error("StartLogStream failed", "streamId", streamID, "pod", req.PodName, "error", err)
		return "", fmt.Errorf("failed to open log stream: %w", err)
	}

	slog.Info("StartLogStream returned", "streamId", streamID, "pod", req.PodName)
	return streamID, nil
}

// StopLogStream terminates an active log stream by its session ID.
// It is idempotent: if the stream has already finished, concluded, or does not exist, it returns nil.
func (b *KubeBridge) StopLogStream(streamID string) error {
	slog.Info("StopLogStream called", "streamId", streamID)
	if b.logManager == nil {
		slog.Info("StopLogStream returned", "streamId", streamID)
		return nil
	}
	_ = b.logManager.StopStream(streamID)

	b.emit("k8s:log:end:"+streamID, StreamEndPayload{
		StreamID: streamID,
		Reason:   "stopped",
	})
	b.emit(EventLogStreamEnd, StreamEndPayload{
		StreamID: streamID,
		Reason:   "stopped",
	})

	slog.Info("StopLogStream returned", "streamId", streamID)
	return nil
}

// StartPodExec initiates an interactive PTY exec session and returns a unique session ID.
// StartPodExec connects to Kubernetes via client-go SPDY and runs an interactive shell session.
func (b *KubeBridge) StartPodExec(req ExecRequest) (string, error) {
	slog.Info("StartPodExec called", "namespace", req.Namespace, "pod", req.PodName, "container", req.ContainerName)
	if req.PodName == "" {
		slog.Error("StartPodExec failed: podName is required")
		return "", NewAppError(ErrCodeInvalidRequest, "podName is required", "", false)
	}
	if req.Namespace == "" {
		slog.Error("StartPodExec failed: namespace is required")
		return "", NewAppError(ErrCodeInvalidRequest, "namespace is required", "", false)
	}
	if b.clientManager == nil {
		slog.Error("StartPodExec failed: no active Kubernetes client manager")
		return "", NewAppError(ErrCodeConnectionRefused, "no active Kubernetes client manager", "", false)
	}
	if b.execManager == nil {
		slog.Error("StartPodExec failed: exec manager is nil")
		return "", NewAppError(ErrCodeInternalError, "exec manager is nil", "", false)
	}

	clientset, err := b.clientManager.GetStreamingClientset()
	if err != nil {
		clientset, err = b.clientManager.GetClientset()
		if err != nil {
			slog.Error("StartPodExec failed: unable to acquire clientset", "error", err)
			return "", NewAppError(ErrCodeConnectionRefused, "unable to acquire clientset", err.Error(), false)
		}
	}

	restConfig, err := b.clientManager.GetRestConfig()
	if err != nil {
		slog.Error("StartPodExec failed: unable to acquire rest.Config", "error", err)
		return "", NewAppError(ErrCodeConnectionRefused, "unable to acquire rest.Config", err.Error(), false)
	}

	var cmd []string
	if req.Command != "" {
		cmd = strings.Fields(req.Command)
	}

	sessionID, err := b.execManager.StartSession(
		b.getContext(),
		req.Namespace,
		req.PodName,
		req.ContainerName,
		cmd,
		req.Cols,
		req.Rows,
		clientset,
		restConfig,
		func(sessionID string, chunk string) {
			b.emit(EventExecStdoutPrefix+sessionID, chunk)
		},
		func(sessionID string, exitCode int, exitErr error) {
			errStr := ""
			if exitErr != nil {
				errStr = exitErr.Error()
			}
			b.emit(EventExecExitPrefix+sessionID, ExecExitPayload{
				SessionID: sessionID,
				ExitCode:  exitCode,
				Error:     errStr,
			})
		},
	)
	if err != nil {
		slog.Error("StartPodExec failed", "pod", req.PodName, "namespace", req.Namespace, "error", err)
		return "", fmt.Errorf("failed to start pod exec session: %w", err)
	}

	slog.Info("StartPodExec returned", "sessionId", sessionID, "pod", req.PodName)
	return sessionID, nil
}

// ExecWrite transmits keystrokes or data from the UI directly into the remote stdin pipe.
func (b *KubeBridge) ExecWrite(sessionID, data string) error {
	if b.execManager == nil {
		return fmt.Errorf("exec manager is nil")
	}
	return b.execManager.Write(sessionID, data)
}

// ExecResize pushes new columns and rows dimensions to the active terminal size queue.
func (b *KubeBridge) ExecResize(sessionID string, cols, rows uint16) error {
	if b.execManager == nil {
		return fmt.Errorf("exec manager is nil")
	}
	return b.execManager.Resize(sessionID, cols, rows)
}

// StopPodExec gracefully terminates an active pod exec session.
func (b *KubeBridge) StopPodExec(sessionID string) error {
	slog.Info("StopPodExec called", "sessionId", sessionID)
	if b.execManager == nil {
		slog.Info("StopPodExec returned", "sessionId", sessionID)
		return nil
	}
	err := b.execManager.StopSession(sessionID)
	slog.Info("StopPodExec returned", "sessionId", sessionID)
	return err
}

// GetApplicationLogs returns all log lines currently stored in the in-memory ring buffer.
func (b *KubeBridge) GetApplicationLogs() ([]string, error) {
	return logger.GetLogs(), nil
}

// ClearApplicationLogs clears the in-memory ring buffer.
func (b *KubeBridge) ClearApplicationLogs() error {
	logger.ClearLogs()
	return nil
}

// GetClusterOverview returns aggregate cluster metrics.
// GetClusterOverview queries live nodes, namespaces, and pods from the cluster.
func (b *KubeBridge) GetClusterOverview() (ClusterOverview, error) {
	b.mu.RLock()
	current := b.activeContext
	b.mu.RUnlock()

	slog.Info("GetClusterOverview called", "context", current)
	ctx := b.getContext()

	overview := ClusterOverview{
		ContextName: current,
	}

	if b.clientManager == nil {
		slog.Info("GetClusterOverview returned", "context", current, "podCount", 0, "nodeCount", 0)
		return overview, nil
	}

	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetClusterOverview failed: unable to acquire clientset", "context", current, "error", err)
		return overview, err
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// 1. Nodes Count (graceful if RBAC restricts node listing)
	if nodeList, err := clientset.CoreV1().Nodes().List(timeoutCtx, metav1.ListOptions{}); err == nil {
		overview.NodeCount = len(nodeList.Items)
	}

	// 2. Namespaces Count (graceful if RBAC restricts namespace listing)
	if nsList, err := clientset.CoreV1().Namespaces().List(timeoutCtx, metav1.ListOptions{}); err == nil {
		overview.NamespaceCount = len(nsList.Items)
	} else {
		overview.NamespaceCount = 1
	}

	// 3. Pods across all namespaces
	podList, err := clientset.CoreV1().Pods(metav1.NamespaceAll).List(timeoutCtx, metav1.ListOptions{})
	if err != nil {
		slog.Error("GetClusterOverview failed: pods list failed", "context", current, "error", err)
		return overview, err
	}

	overview.PodCount = len(podList.Items)
	for _, p := range podList.Items {
		status := determinePodStatus(&p)
		switch status {
		case "Running":
			overview.RunningPods++
		case "Pending", "ContainerCreating":
			overview.PendingPods++
		case "Completed", "Succeeded":
			// Completed job pods
		default:
			overview.FailedPods++
		}
	}

	slog.Info("GetClusterOverview returned", "context", current, "podCount", overview.PodCount, "nodeCount", overview.NodeCount)
	return overview, nil
}

// GetClusterHealthInfo returns detailed cluster connectivity, endpoint, latency, and auth identity.
// GetClusterHealthInfo queries the active cluster for live health, latency, server version, and auth identity.
func (b *KubeBridge) GetClusterHealthInfo() (ClusterHealthInfo, error) {
	slog.Info("GetClusterHealthInfo called")
	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Info("GetClusterHealthInfo returned", "status", "disconnected")
		return ClusterHealthInfo{
			Status: "disconnected",
			Error:  "Client manager is not initialized",
		}, nil
	}

	endpoint, version, latency, identity, err := b.clientManager.GetHealthDetails(ctx)
	status := "connected"
	errMsg := ""
	if err != nil {
		status = "disconnected"
		errMsg = err.Error()
		slog.Warn("GetClusterHealthInfo: cluster health check not available or failed", "error", err)
	}

	slog.Info("GetClusterHealthInfo returned", "status", status, "endpoint", endpoint)
	return ClusterHealthInfo{
		Endpoint:      endpoint,
		ServerVersion: version,
		LatencyMs:     latency,
		AuthIdentity:  identity,
		Status:        status,
		Error:         errMsg,
	}, nil
}

// DeletePod deletes a pod by name in the given namespace with an optional grace period.
// DeletePod deletes a pod using the given context.
func (b *KubeBridge) DeletePod(namespace, podName string, gracePeriodSeconds *int64) error {
	slog.Info("DeletePod called", "namespace", namespace, "pod", podName)
	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Error("DeletePod failed: no active Kubernetes client manager", "namespace", namespace, "pod", podName)
		return NewAppError(ErrCodeConnectionRefused, "no active Kubernetes client manager", "", false)
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("DeletePod failed: unable to acquire clientset", "namespace", namespace, "pod", podName, "error", err)
		return NewAppError(ErrCodeConnectionRefused, "unable to acquire clientset", err.Error(), false)
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	err = kube.DeletePod(timeoutCtx, clientset, namespace, podName, gracePeriodSeconds)
	if err != nil {
		slog.Error("DeletePod failed", "namespace", namespace, "podName", podName, "error", err)
		return NewAppError(ErrCodeInternalError, fmt.Sprintf("failed to delete pod %s/%s", namespace, podName), err.Error(), false)
	}
	slog.Info("DeletePod returned", "namespace", namespace, "pod", podName)
	return nil
}

// RestartPod restarts a pod by initiating standard deletion, prompting managing controllers to recreate it.
// RestartPod restarts a pod using the given context.
func (b *KubeBridge) RestartPod(namespace, podName string) error {
	slog.Info("RestartPod called", "namespace", namespace, "pod", podName)
	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Error("RestartPod failed: no active Kubernetes client manager", "namespace", namespace, "pod", podName)
		return NewAppError(ErrCodeConnectionRefused, "no active Kubernetes client manager", "", false)
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("RestartPod failed: unable to acquire clientset", "namespace", namespace, "pod", podName, "error", err)
		return NewAppError(ErrCodeConnectionRefused, "unable to acquire clientset", err.Error(), false)
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	err = kube.RestartPod(timeoutCtx, clientset, namespace, podName)
	if err != nil {
		slog.Error("RestartPod failed", "namespace", namespace, "podName", podName, "error", err)
		return NewAppError(ErrCodeInternalError, fmt.Sprintf("failed to restart pod %s/%s", namespace, podName), err.Error(), false)
	}
	slog.Info("RestartPod returned", "namespace", namespace, "pod", podName)
	return nil
}

// GetJobLatestPod returns the most recently created pod summary associated with a batch/v1 Job.
// GetJobLatestPod returns the most recently created pod summary associated with a batch/v1 Job using the given context.
func (b *KubeBridge) GetJobLatestPod(namespace, jobName string) (*PodSummary, error) {
	slog.Info("GetJobLatestPod called", "namespace", namespace, "job", jobName)
	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Error("GetJobLatestPod failed: no active Kubernetes client manager", "namespace", namespace, "job", jobName)
		return nil, NewAppError(ErrCodeConnectionRefused, "no active Kubernetes client manager", "", false)
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetJobLatestPod failed: unable to acquire clientset", "namespace", namespace, "job", jobName, "error", err)
		return nil, NewAppError(ErrCodeConnectionRefused, "unable to acquire clientset", err.Error(), false)
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	pod, err := kube.GetJobLatestPod(timeoutCtx, clientset, namespace, jobName)
	if err != nil {
		slog.Error("GetJobLatestPod failed", "namespace", namespace, "jobName", jobName, "error", err)
		return nil, NewAppError(ErrCodePodNotFound, fmt.Sprintf("no pods found for job %s/%s", namespace, jobName), err.Error(), false)
	}

	summary := mapPodToSummary(*pod)
	slog.Info("GetJobLatestPod returned", "namespace", namespace, "job", jobName, "pod", summary.Name)
	return &summary, nil
}

// GetControllerPods returns all active matching pods belonging to a controller workload (Deployment, StatefulSet, DaemonSet, Job, or Pod).
func (b *KubeBridge) GetControllerPods(namespace, kind, name string) ([]PodSummary, error) {
	slog.Info("GetControllerPods called", "kind", kind, "namespace", namespace, "name", name)
	ctx := b.getContext()
	if b.clientManager == nil {
		slog.Error("GetControllerPods failed: no active Kubernetes client manager", "kind", kind, "namespace", namespace, "name", name)
		return make([]PodSummary, 0), NewAppError(ErrCodeConnectionRefused, "no active Kubernetes client manager", "", false)
	}
	clientset, err := b.clientManager.GetClientset()
	if err != nil {
		slog.Error("GetControllerPods failed: unable to acquire clientset", "kind", kind, "namespace", namespace, "name", name, "error", err)
		return make([]PodSummary, 0), NewAppError(ErrCodeConnectionRefused, "unable to acquire clientset", err.Error(), false)
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	pods, err := kube.GetControllerPods(timeoutCtx, clientset, namespace, kind, name)
	if err != nil {
		slog.Error("GetControllerPods failed", "kind", kind, "namespace", namespace, "name", name, "error", err)
		return make([]PodSummary, 0), NewAppError(ErrCodePodNotFound, fmt.Sprintf("failed to get pods for %s %s/%s", kind, namespace, name), err.Error(), false)
	}

	summaries := make([]PodSummary, 0, len(pods))
	for _, p := range pods {
		summaries = append(summaries, mapPodToSummary(p))
	}

	sort.Slice(summaries, func(i, j int) bool {
		return summaries[i].Name < summaries[j].Name
	})

	podNames := make([]string, 0, len(summaries))
	for _, p := range summaries {
		podNames = append(podNames, p.Name)
	}
	slog.Info("GetControllerPods returned", "kind", kind, "namespace", namespace, "name", name, "count", len(summaries), "pods", podNames)
	return summaries, nil
}
