package ipc

import (
	"fmt"
	"time"
)

// ============================================================================
// Wails Runtime Event Constants
// ============================================================================

const (
	// EventLogStreamData is fired when a new log line arrives for a stream session.
	// Payload: LogPayload
	EventLogStreamData = "k8s:log:data"

	// EventLogStreamError is fired when a log stream encounters a non-recoverable error.
	// Payload: StreamErrorPayload
	EventLogStreamError = "k8s:log:error"

	// EventLogStreamEnd is fired when a log stream reaches EOF or is closed.
	// Payload: StreamEndPayload
	EventLogStreamEnd = "k8s:log:end"

	// EventContextChanged is fired when the active Kubernetes context is changed.
	// Payload: KubeContext
	EventContextChanged = "k8s:context:changed"

	// EventContextsReady is fired when all kubeconfig contexts have been loaded and classified.
	// Payload: []KubeContext
	EventContextsReady = "k8s:contexts:ready"

	// EventNamespacesReady is fired when cluster namespaces have been loaded.
	// Payload: []string
	EventNamespacesReady = "k8s:namespaces:ready"

	// EventSidebarCountsUpdated is fired when resource counts for sidebar badges are updated.
	// Payload: map[string]int
	EventSidebarCountsUpdated = "k8s:sidebar-counts:updated"

	// EventResourceChanged is fired when a Kubernetes resource is added, updated, or deleted via informers.
	// Payload: ResourceChangeEvent
	EventResourceChanged = "k8s:resource:changed"

	// EventClusterRefresh is a debounced signal fired when cluster state changes and views should refresh.
	EventClusterRefresh = "k8s:cluster:refresh"

	// EventNamespaceChanged is fired when the active namespace is switched in session memory.
	EventNamespaceChanged = "k8s:namespace:changed"

	// EventExecStdoutPrefix is the prefix for exec stdout data events: "k8s:exec:stdout:" + sessionID
	EventExecStdoutPrefix = "k8s:exec:stdout:"

	// EventExecExitPrefix is the prefix for exec exit events: "k8s:exec:exit:" + sessionID
	EventExecExitPrefix = "k8s:exec:exit:"
)

// ResourceChangeEvent represents a real-time event dispatched when a Kubernetes resource changes.
type ResourceChangeEvent struct {
	ResourceType string `json:"resourceType"` // "pod", "namespace", etc.
	Action       string `json:"action"`       // "add", "update", "delete"
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Phase        string `json:"phase,omitempty"`
}

// ============================================================================
// Error Envelope & Types
// ============================================================================

// ErrorCode defines standardized machine-readable error codes across the IPC bridge.
type ErrorCode string

const (
	ErrCodeAuthFailed        ErrorCode = "AUTH_FAILED"
	ErrCodeForbidden         ErrorCode = "FORBIDDEN"
	ErrCodeContextNotFound   ErrorCode = "CONTEXT_NOT_FOUND"
	ErrCodeConnectionRefused ErrorCode = "CONNECTION_REFUSED"
	ErrCodeClusterTimeout    ErrorCode = "CLUSTER_TIMEOUT"
	ErrCodeNamespaceNotFound ErrorCode = "NAMESPACE_NOT_FOUND"
	ErrCodePodNotFound       ErrorCode = "POD_NOT_FOUND"
	ErrCodeContainerNotFound ErrorCode = "CONTAINER_NOT_FOUND"
	ErrCodeStreamNotFound    ErrorCode = "STREAM_NOT_FOUND"
	ErrCodeStreamTerminated  ErrorCode = "STREAM_TERMINATED"
	ErrCodeInternalError     ErrorCode = "INTERNAL_ERROR"
	ErrCodeInvalidRequest    ErrorCode = "INVALID_REQUEST"
)

// AppError represents the standard error envelope passed across the Wails IPC bridge.
// All backend errors returned to TypeScript are serialized to or match this structure.
type AppError struct {
	Code      ErrorCode `json:"code"`
	Message   string    `json:"message"`
	Details   string    `json:"details,omitempty"`
	Retryable bool      `json:"retryable"`
	Timestamp time.Time `json:"timestamp"`
}

func (e *AppError) Error() string {
	if e.Details != "" {
		return fmt.Sprintf("[%s] %s: %s", e.Code, e.Message, e.Details)
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

// NewAppError constructs a new standard AppError instance.
func NewAppError(code ErrorCode, message string, details string, retryable bool) *AppError {
	return &AppError{
		Code:      code,
		Message:   message,
		Details:   details,
		Retryable: retryable,
		Timestamp: time.Now().UTC(),
	}
}

// ============================================================================
// Kubernetes Data Transfer Objects (DTOs)
// ============================================================================

// KubeContext represents a parsed kubeconfig context entry.
type KubeContext struct {
	Name        string `json:"name"`
	ClusterName string `json:"clusterName"`
	UserName    string `json:"userName"`
	IsActive    bool   `json:"isActive"`
	Namespace   string `json:"namespace,omitempty"`
	Environment string `json:"environment,omitempty"` // "prod", "staging", "dev", "local", "default"
}

// InitialBootstrapState holds the minimal critical path data required to paint the UI immediately.
type InitialBootstrapState struct {
	ActiveContext   string       `json:"activeContext"`
	ActiveNamespace string       `json:"activeNamespace"`
	Pods            []PodSummary `json:"pods"`
}

// NamespaceStatus represents the lifecycle phase of a Kubernetes namespace.
type NamespaceStatus string

const (
	NamespaceActive      NamespaceStatus = "Active"
	NamespaceTerminating NamespaceStatus = "Terminating"
	NamespaceUnknown     NamespaceStatus = "Unknown"
)

// Namespace represents a stripped, lightweight Kubernetes namespace DTO.
type Namespace struct {
	Name      string          `json:"name"`
	Status    NamespaceStatus `json:"status"`
	Age       string          `json:"age"`
	CreatedAt time.Time       `json:"createdAt"`
}

// PodPhase represents the high-level pod health classification.
type PodPhase string

const (
	PodPhaseRunning          PodPhase = "Running"
	PodPhasePending          PodPhase = "Pending"
	PodPhaseFailed           PodPhase = "Failed"
	PodPhaseSucceeded        PodPhase = "Succeeded"
	PodPhaseCrashLoopBackOff PodPhase = "CrashLoopBackOff"
	PodPhaseUnknown          PodPhase = "Unknown"
)

// PodSummary represents a flattened, performant DTO tailored for virtualized list views.
type PodSummary struct {
	Name            string    `json:"name"`
	Namespace       string    `json:"namespace"`
	Status          PodPhase  `json:"status"`
	TotalContainers int       `json:"totalContainers"`
	ReadyContainers int       `json:"readyContainers"`
	RestartCount    int32     `json:"restartCount"`
	Age             string    `json:"age"`
	CreatedAt       time.Time `json:"createdAt"`
	IP              string    `json:"ip"`
	NodeName        string    `json:"nodeName"`
	Containers      []string  `json:"containers"`
	InitContainers  []string  `json:"initContainers,omitempty"`

	// Resource metrics & requests/limits
	CPUUsage      string `json:"cpuUsage,omitempty"`
	CPULimit      string `json:"cpuLimit,omitempty"`
	CPURequest    string `json:"cpuRequest,omitempty"`
	MemoryUsage   string `json:"memoryUsage,omitempty"`
	MemoryLimit   string `json:"memoryLimit,omitempty"`
	MemoryRequest string `json:"memoryRequest,omitempty"`
}

// ContainerStateRunning holds timing details for a running container.
type ContainerStateRunning struct {
	StartedAt time.Time `json:"startedAt"`
}

// ContainerStateWaiting holds the reason and message for a waiting container (e.g. CrashLoopBackOff, ContainerCreating).
type ContainerStateWaiting struct {
	Reason  string `json:"reason,omitempty"`
	Message string `json:"message,omitempty"`
}

// ContainerStateTerminated holds exit status and metadata for a terminated container.
type ContainerStateTerminated struct {
	ExitCode    int32      `json:"exitCode"`
	Signal      int32      `json:"signal,omitempty"`
	Reason      string     `json:"reason,omitempty"`
	Message     string     `json:"message,omitempty"`
	StartedAt   *time.Time `json:"startedAt,omitempty"`
	FinishedAt  *time.Time `json:"finishedAt,omitempty"`
	ContainerID string     `json:"containerId,omitempty"`
}

// ContainerState encapsulates running, waiting, or terminated container statuses.
type ContainerState struct {
	Status     string                    `json:"status"` // "running", "waiting", "terminated"
	Running    *ContainerStateRunning    `json:"running,omitempty"`
	Waiting    *ContainerStateWaiting    `json:"waiting,omitempty"`
	Terminated *ContainerStateTerminated `json:"terminated,omitempty"`
}

// ContainerDetail represents detailed state for a container inside a pod.
type ContainerDetail struct {
	Name         string         `json:"name"`
	Image        string         `json:"image"`
	Ready        bool           `json:"ready"`
	RestartCount int32          `json:"restartCount"`
	State        ContainerState `json:"state"`
}

// DeploymentSummary represents a flattened Kubernetes apps/v1 Deployment DTO.
type DeploymentSummary struct {
	Name          string `json:"name"`
	Namespace     string `json:"namespace"`
	Status        string `json:"status"`
	Ready         string `json:"ready"`
	ReadyReplicas int32  `json:"readyReplicas"`
	TotalReplicas int32  `json:"totalReplicas"`
	UpToDate      int32  `json:"upToDate"`
	Available     int32  `json:"available"`
	Age           string `json:"age"`
	Conditions    string `json:"conditions"`
}

// StatefulSetSummary represents a flattened Kubernetes apps/v1 StatefulSet DTO.
type StatefulSetSummary struct {
	Name          string `json:"name"`
	Namespace     string `json:"namespace"`
	Status        string `json:"status"`
	Ready         string `json:"ready"`
	ReadyReplicas int32  `json:"readyReplicas"`
	TotalReplicas int32  `json:"totalReplicas"`
	Age           string `json:"age"`
	ServiceName   string `json:"serviceName"`
}

// JobSummary represents a flattened Kubernetes batch/v1 Job DTO.
type JobSummary struct {
	Name        string `json:"name"`
	Namespace   string `json:"namespace"`
	Status      string `json:"status"`
	Completions string `json:"completions"`
	Duration    string `json:"duration"`
	Age         string `json:"age"`
	Image       string `json:"image"`
}

// CronJobSummary represents a flattened Kubernetes batch/v1 CronJob DTO.
type CronJobSummary struct {
	Name                string `json:"name"`
	Namespace           string `json:"namespace"`
	Schedule            string `json:"schedule"`
	ScheduleDescription string `json:"scheduleDescription"`
	Suspend             bool   `json:"suspend"`
	ActiveJobs          int    `json:"activeJobs"`
	LastSchedule        string `json:"lastSchedule"`
	Age                 string `json:"age"`
}

// LogStreamRequest defines the parameters required to establish an event-driven log stream.
type LogStreamRequest struct {
	Namespace     string `json:"namespace"`
	PodName       string `json:"podName"`
	ContainerName string `json:"containerName"`
	TailLines     *int64 `json:"tailLines,omitempty"`
	Follow        bool   `json:"follow"`
	Timestamps    bool   `json:"timestamps"`
	SinceSeconds  *int64 `json:"sinceSeconds,omitempty"`
	Previous      bool   `json:"previous,omitempty"`
}

// LogPayload represents a single log line emitted via Wails runtime events to the frontend.
type LogPayload struct {
	StreamID      string `json:"streamId"`
	PodName       string `json:"podName,omitempty"`
	Timestamp     string `json:"timestamp,omitempty"`
	Line          string `json:"line"`
	ContainerName string `json:"containerName"`
	IsStderr      bool   `json:"isStderr"`
}

// StreamErrorPayload describes an error that forced an active log stream to abort.
type StreamErrorPayload struct {
	StreamID string    `json:"streamId"`
	Error    *AppError `json:"error"`
}

// StreamEndPayload indicates that a log stream completed gracefully (EOF or stopped).
type StreamEndPayload struct {
	StreamID string `json:"streamId"`
	Reason   string `json:"reason"` // "eof", "stopped", "context_switched"
}

// ExecRequest defines the parameters required to establish an interactive pod exec session.
type ExecRequest struct {
	Namespace     string `json:"namespace"`
	PodName       string `json:"podName"`
	ContainerName string `json:"containerName,omitempty"`
	Command       string `json:"command,omitempty"`
	Cols          uint16 `json:"cols"`
	Rows          uint16 `json:"rows"`
}

// ExecExitPayload indicates that an interactive exec session has exited.
type ExecExitPayload struct {
	SessionID string `json:"sessionId"`
	ExitCode  int    `json:"exitCode"`
	Error     string `json:"error,omitempty"`
}

// ClusterOverview provides a high-level summary of the connected cluster.
type ClusterOverview struct {
	ContextName    string `json:"contextName"`
	NodeCount      int    `json:"nodeCount"`
	NamespaceCount int    `json:"namespaceCount"`
	PodCount       int    `json:"podCount"`
	RunningPods    int    `json:"runningPods"`
	PendingPods    int    `json:"pendingPods"`
	FailedPods     int    `json:"failedPods"`
}

// ClusterHealthInfo provides detailed connectivity, latency, and identity metadata for the active context.
type ClusterHealthInfo struct {
	Endpoint      string `json:"endpoint"`
	ServerVersion string `json:"serverVersion"`
	LatencyMs     int64  `json:"latencyMs"`
	AuthIdentity  string `json:"authIdentity"`
	Status        string `json:"status"` // "connected", "degraded", "disconnected"
	Error         string `json:"error,omitempty"`
}

// NodeSummary represents a flattened Kubernetes core/v1 Node DTO.
type NodeSummary struct {
	Name       string `json:"name"`
	Status     string `json:"status"`
	Roles      string `json:"roles"`
	Version    string `json:"version"`
	InternalIP string `json:"internalIp"`
	OSImage    string `json:"osImage"`
	Age        string `json:"age"`
}

// ServiceSummary represents a flattened Kubernetes core/v1 Service DTO.
type ServiceSummary struct {
	Name       string            `json:"name"`
	Namespace  string            `json:"namespace"`
	Type       string            `json:"type"`
	ClusterIP  string            `json:"clusterIp"`
	ExternalIP string            `json:"externalIp"`
	Ports      string            `json:"ports"`
	Age        string            `json:"age"`
	Selector   map[string]string `json:"selector,omitempty"`
}

// IngressSummary represents a flattened Kubernetes networking/v1 Ingress DTO.
type IngressSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Hosts     string `json:"hosts"`
	Endpoints string `json:"endpoints"`
	ClassName string `json:"className"`
	Age       string `json:"age"`
}

// ConfigMapSummary represents a flattened Kubernetes core/v1 ConfigMap DTO.
type ConfigMapSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	KeysCount int    `json:"keysCount"`
	Age       string `json:"age"`
}

// SecretSummary represents a flattened Kubernetes core/v1 Secret DTO.
type SecretSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Type      string `json:"type"` // "Opaque", "kubernetes.io/tls", etc.
	KeysCount int    `json:"keysCount"`
	Age       string `json:"age"`
}

// ClusterConfigCounts holds live dynamic counts for cluster & config resources.
type ClusterConfigCounts struct {
	NodeCount      int `json:"nodeCount"`
	ServiceCount   int `json:"serviceCount"`
	IngressCount   int `json:"ingressCount"`
	ConfigMapCount int `json:"configMapCount"`
	SecretCount    int `json:"secretCount"`
}

// ============================================================================
// Service Interface Contract
// ============================================================================

// KubeBridgeContract defines the rigid IPC contract between the Go backend and React frontend.
// In Wails v2, methods bound to the frontend cannot take context.Context as a method parameter,
// as Wails attempts to unmarshal frontend JSON arguments into all method parameters.
// Context is maintained within the service instance via SetWailsContext during application startup.
type KubeBridgeContract interface {
	// GetInitialState executes the Phase 1 Critical Path (active context, namespace, pods)
	// and triggers Phase 2 background warm-up goroutines.
	GetInitialState() (*InitialBootstrapState, error)

	// GetContexts returns all available Kubernetes contexts discovered from kubeconfig.
	GetContexts() ([]KubeContext, error)

	// SwitchContext switches the active Kubernetes context.
	SwitchContext(contextName string) error

	// SetNamespace updates the active namespace in session memory.
	SetNamespace(namespace string) error

	// GetNamespaces returns all namespaces in the currently active cluster context.
	GetNamespaces() ([]Namespace, error)

	// GetPods returns a stripped list of pods for a given namespace (or "" for all namespaces).
	GetPods(namespace string) ([]PodSummary, error)

	// GetDeployments returns all deployments in the specified namespace (or all if namespace is empty or "all").
	GetDeployments(namespace string) ([]DeploymentSummary, error)

	// GetStatefulSets returns all statefulsets in the specified namespace (or all if namespace is empty or "all").
	GetStatefulSets(namespace string) ([]StatefulSetSummary, error)

	// GetJobs returns all jobs in the specified namespace (or all if namespace is empty or "all").
	GetJobs(namespace string) ([]JobSummary, error)

	// GetCronJobs returns all cronjobs in the specified namespace (or all if namespace is empty or "all").
	GetCronJobs(namespace string) ([]CronJobSummary, error)

	// TriggerCronJob creates a new manual Job run from an existing CronJob.
	TriggerCronJob(namespace, cronJobName string) (*JobSummary, error)

	// RerunJob creates a new Job clone to rerun an existing Job.
	RerunJob(namespace, jobName string) (*JobSummary, error)

	// GetContainerDetails returns detailed container statuses for a specific pod.
	GetContainerDetails(namespace, podName string) ([]ContainerDetail, error)

	// StartLogStream initiates an asynchronous log stream and returns a unique stream session ID.
	// Log lines are emitted asynchronously via the Wails runtime event "k8s:log:data".
	StartLogStream(req LogStreamRequest) (string, error)

	// StopLogStream terminates an active log stream by its session ID.
	StopLogStream(streamID string) error

	// GetClusterOverview returns aggregate cluster metrics for the active context.
	GetClusterOverview() (ClusterOverview, error)

	// GetClusterHealthInfo returns connectivity, latency, endpoint, and server version details for active context.
	GetClusterHealthInfo() (ClusterHealthInfo, error)

	// DeletePod deletes a pod by name in the given namespace with an optional grace period.
	DeletePod(namespace, podName string, gracePeriodSeconds *int64) error

	// RestartPod restarts a pod by initiating standard deletion, triggering controller recreation.
	RestartPod(namespace, podName string) error

	// GetJobLatestPod returns the most recently created pod summary associated with a batch/v1 Job.
	GetJobLatestPod(namespace, jobName string) (*PodSummary, error)

	// GetControllerPods returns all active matching pods for a given workload controller.
	GetControllerPods(namespace, kind, name string) ([]PodSummary, error)

	// GetApplicationLogs returns all log lines currently stored in the in-memory application ring buffer.
	GetApplicationLogs() ([]string, error)

	// ClearApplicationLogs clears all log lines currently stored in the in-memory application ring buffer.
	ClearApplicationLogs() error

	// GetNodes returns all cluster nodes.
	GetNodes() ([]NodeSummary, error)

	// GetServices returns all services in the specified namespace (or all if namespace is "all" or "").
	GetServices(namespace string) ([]ServiceSummary, error)

	// GetIngresses returns all ingresses in the specified namespace (or all if namespace is "all" or "").
	GetIngresses(namespace string) ([]IngressSummary, error)

	// GetConfigMaps returns all configmaps in the specified namespace (or all if namespace is "all" or "").
	GetConfigMaps(namespace string) ([]ConfigMapSummary, error)

	// GetSecrets returns all secrets in the specified namespace (or all if namespace is "all" or "").
	GetSecrets(namespace string) ([]SecretSummary, error)

	// GetClusterConfigCounts returns live dynamic counts for cluster & config resources.
	GetClusterConfigCounts(namespace string) (ClusterConfigCounts, error)

	// GetResourceYAML fetches a resource by kind, namespace, and name, returning its authentic YAML manifest.
	GetResourceYAML(kind, namespace, name string) (string, error)

	// GetConfigMapData returns all key-value entries for a configmap.
	GetConfigMapData(namespace, name string) (map[string]string, error)

	// GetSecretData returns all decoded key-value entries for a secret.
	GetSecretData(namespace, name string) (map[string]string, error)

	// DeleteConfigMap deletes a configmap by name in the specified namespace.
	DeleteConfigMap(namespace, name string) error

	// DeleteSecret deletes a secret by name in the specified namespace.
	DeleteSecret(namespace, name string) error

	// StartPodExec starts an interactive PTY exec session in the specified pod container.
	StartPodExec(req ExecRequest) (string, error)

	// ExecWrite sends raw input characters (stdin) to the active exec session.
	ExecWrite(sessionID, data string) error

	// ExecResize adjusts the PTY terminal window dimensions for the active exec session.
	ExecResize(sessionID string, cols, rows uint16) error

	// StopPodExec gracefully terminates an active pod exec session.
	StopPodExec(sessionID string) error

	// CopyToClipboard copies text to the native system clipboard using Wails runtime.
	CopyToClipboard(text string) error
}

// ============================================================================
// EventEmitter Hook (Allows Wails Runtime or Mock Driver Injection)
// ============================================================================

// EventEmitter is an optional callback interface used to broadcast IPC events.
type EventEmitter interface {
	Emit(eventName string, optionalData ...interface{})
}

// NoopEventEmitter is a default null-object implementation of EventEmitter.
type NoopEventEmitter struct{}

func (NoopEventEmitter) Emit(string, ...interface{}) {}
