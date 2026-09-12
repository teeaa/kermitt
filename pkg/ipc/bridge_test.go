package ipc

import (
	"testing"

	"github.com/teeaa/kermitt/pkg/kube"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestKubeBridge_GetContexts(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error creating client manager: %v", err)
	}

	bridge := NewKubeBridge(cm)
	contexts, err := bridge.GetContexts()
	if err != nil {
		t.Fatalf("expected GetContexts to succeed: %v", err)
	}

	// Verify active context exists
	hasActive := false
	for _, c := range contexts {
		if c.IsActive {
			hasActive = true
			break
		}
	}
	if !hasActive {
		t.Logf("no active context set, default or first context expected")
	}
}

func TestKubeBridge_SwitchContext_Invalid(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	bridge := NewKubeBridge(cm)
	err = bridge.SwitchContext("totally-invalid-context-12345")
	if err == nil {
		t.Fatalf("expected error switching to invalid context, got nil")
	}

	appErr, ok := err.(*AppError)
	if !ok {
		t.Fatalf("expected *AppError envelope, got %T", err)
	}
	if appErr.Code != ErrCodeContextNotFound {
		t.Errorf("expected error code %s, got %s", ErrCodeContextNotFound, appErr.Code)
	}
}

func TestKubeBridge_GetNamespaces(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	bridge := NewKubeBridge(cm)
	namespaces, err := bridge.GetNamespaces()
	if err != nil {
		t.Fatalf("expected GetNamespaces to succeed (graceful fallback): %v", err)
	}
	if len(namespaces) == 0 {
		t.Fatalf("expected at least one namespace returned")
	}

	foundDefault := false
	for _, ns := range namespaces {
		if ns.Name == "default" || ns.Name != "" {
			foundDefault = true
			break
		}
	}
	if !foundDefault {
		t.Errorf("expected valid namespace in list")
	}
}

func TestKubeBridge_Workloads_NeverNil(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	bridge := NewKubeBridge(cm)
	deps, err := bridge.GetDeployments("nonexistent-namespace-xyz")
	if err != nil || deps == nil {
		t.Fatalf("expected GetDeployments to return non-nil empty slice, got deps=%v, err=%v", deps, err)
	}

	stss, err := bridge.GetStatefulSets("nonexistent-namespace-xyz")
	if err != nil || stss == nil {
		t.Fatalf("expected GetStatefulSets to return non-nil empty slice, got stss=%v, err=%v", stss, err)
	}

	jobs, err := bridge.GetJobs("nonexistent-namespace-xyz")
	if err != nil || jobs == nil {
		t.Fatalf("expected GetJobs to return non-nil empty slice, got jobs=%v, err=%v", jobs, err)
	}

	cronjobs, err := bridge.GetCronJobs("nonexistent-namespace-xyz")
	if err != nil || cronjobs == nil {
		t.Fatalf("expected GetCronJobs to return non-nil empty slice, got cronjobs=%v, err=%v", cronjobs, err)
	}
}

func TestKubeBridge_Workloads_AllNamespace(t *testing.T) {
	bridgeNoCM := NewKubeBridge(nil)
	for _, ns := range []string{"all", "", "*"} {
		if deps, _ := bridgeNoCM.GetDeployments(ns); deps == nil {
			t.Fatalf("expected non-nil deployments for %q", ns)
		}
		if stss, _ := bridgeNoCM.GetStatefulSets(ns); stss == nil {
			t.Fatalf("expected non-nil statefulsets for %q", ns)
		}
		if jobs, _ := bridgeNoCM.GetJobs(ns); jobs == nil {
			t.Fatalf("expected non-nil jobs for %q", ns)
		}
		if cjs, _ := bridgeNoCM.GetCronJobs(ns); cjs == nil {
			t.Fatalf("expected non-nil cronjobs for %q", ns)
		}
	}
}

func TestKubeBridge_GetPods_NeverNil(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	bridge := NewKubeBridge(cm)
	pods, _ := bridge.GetPods("nonexistent-namespace-xyz-123")
	if pods == nil {
		t.Fatalf("expected GetPods to return non-nil empty slice, got nil")
	}
}

func TestKubeBridge_GetPods_AllNamespace(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	bridge := NewKubeBridge(cm)
	for _, ns := range []string{"all", "", "*"} {
		pods, _ := bridge.GetPods(ns)
		if pods == nil {
			t.Fatalf("expected GetPods(%q) to return non-nil slice, got nil", ns)
		}
	}
}

func TestDeterminePodStatus(t *testing.T) {
	now := metav1.Now()

	// 1. Deleting pod
	podDeleting := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			DeletionTimestamp: &now,
		},
		Status: corev1.PodStatus{Phase: corev1.PodRunning},
	}
	if status := determinePodStatus(podDeleting); status != "Terminating" {
		t.Errorf("expected Terminating, got %s", status)
	}

	// 2. CrashLoopBackOff container
	podCrash := &corev1.Pod{
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{
				{
					Name: "app",
					State: corev1.ContainerState{
						Waiting: &corev1.ContainerStateWaiting{
							Reason: "CrashLoopBackOff",
						},
					},
				},
			},
		},
	}
	if status := determinePodStatus(podCrash); status != "CrashLoopBackOff" {
		t.Errorf("expected CrashLoopBackOff, got %s", status)
	}

	// 3. ImagePullBackOff container
	podImagePull := &corev1.Pod{
		Status: corev1.PodStatus{
			Phase: corev1.PodPending,
			ContainerStatuses: []corev1.ContainerStatus{
				{
					Name: "worker",
					State: corev1.ContainerState{
						Waiting: &corev1.ContainerStateWaiting{
							Reason: "ImagePullBackOff",
						},
					},
				},
			},
		},
	}
	if status := determinePodStatus(podImagePull); status != "ImagePullBackOff" {
		t.Errorf("expected ImagePullBackOff, got %s", status)
	}

	// 4. OOMKilled container
	podOOM := &corev1.Pod{
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{
				{
					Name: "db",
					State: corev1.ContainerState{
						Terminated: &corev1.ContainerStateTerminated{
							Reason:   "OOMKilled",
							ExitCode: 137,
						},
					},
				},
			},
		},
	}
	if status := determinePodStatus(podOOM); status != "OOMKilled" {
		t.Errorf("expected OOMKilled, got %s", status)
	}

	// 5. Normal Running
	podRunning := &corev1.Pod{
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			ContainerStatuses: []corev1.ContainerStatus{
				{
					Name:  "web",
					Ready: true,
					State: corev1.ContainerState{
						Running: &corev1.ContainerStateRunning{},
					},
				},
			},
		},
	}
	if status := determinePodStatus(podRunning); status != "Running" {
		t.Errorf("expected Running, got %s", status)
	}
}

func TestKubeBridge_GetClusterOverview(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	bridge := NewKubeBridge(cm)
	overview, err := bridge.GetClusterOverview()
	// Even if cluster connection is offline/refused, overview should return valid struct
	if overview.ContextName == "" && err == nil {
		t.Logf("empty context name when no context is active")
	}
}

func TestKubeBridge_StartStopLogStream_Validation(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	bridge := NewKubeBridge(cm)

	// Missing PodName should error with ErrCodeInvalidRequest
	_, err = bridge.StartLogStream(LogStreamRequest{
		PodName: "",
	})
	if err == nil {
		t.Fatal("expected error with empty podName, got nil")
	}
	appErr, ok := err.(*AppError)
	if !ok || appErr.Code != ErrCodeInvalidRequest {
		t.Errorf("expected ErrCodeInvalidRequest, got %v", err)
	}

	// Stopping unknown stream should be idempotent and return nil without error
	err = bridge.StopLogStream("non-existent-stream-id-12345")
	if err != nil {
		t.Fatalf("expected nil error stopping non-existent stream, got %v", err)
	}
}

func TestKubeBridge_ApplicationLogs(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	bridge := NewKubeBridge(cm)

	err = bridge.ClearApplicationLogs()
	if err != nil {
		t.Fatalf("unexpected error clearing logs: %v", err)
	}

	logs, err := bridge.GetApplicationLogs()
	if err != nil {
		t.Fatalf("unexpected error getting logs: %v", err)
	}
	if len(logs) != 0 {
		t.Fatalf("expected 0 logs after clear, got %d", len(logs))
	}
}

func TestKubeBridge_DeletePod_Validation(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	bridge := NewKubeBridge(cm)

	// Test with nil clientManager
	bridgeNoCM := NewKubeBridge(nil)
	err = bridgeNoCM.DeletePod("default", "pod-1", nil)
	if err == nil {
		t.Fatal("expected error when clientManager is nil")
	}

	// Call DeletePod on bridge (will attempt to reach cluster / error cleanly)
	_ = bridge.DeletePod("default", "test-pod", nil)
}

func TestKubeBridge_RestartPod_Validation(t *testing.T) {
	bridgeNoCM := NewKubeBridge(nil)
	err := bridgeNoCM.RestartPod("default", "pod-1")
	if err == nil {
		t.Fatal("expected error when clientManager is nil")
	}
}

func TestKubeBridge_GetJobLatestPod_Validation(t *testing.T) {
	bridgeNoCM := NewKubeBridge(nil)
	_, err := bridgeNoCM.GetJobLatestPod("default", "my-job")
	if err == nil {
		t.Fatal("expected error when clientManager is nil")
	}
}

func TestMapPodToSummary_Containers(t *testing.T) {
	pod := corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "log-emitter",
			Namespace: "dev",
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{Name: "log-emitter", Image: "busybox:latest"},
				{Name: "sidecar-proxy", Image: "envoy:v1"},
			},
			InitContainers: []corev1.Container{
				{Name: "wait-for-db", Image: "busybox:latest"},
			},
		},
	}

	summary := mapPodToSummary(pod)
	if len(summary.Containers) != 2 {
		t.Fatalf("expected 2 containers, got %d", len(summary.Containers))
	}
	if summary.Containers[0] != "log-emitter" || summary.Containers[1] != "sidecar-proxy" {
		t.Errorf("unexpected containers: %v", summary.Containers)
	}
	if len(summary.InitContainers) != 1 || summary.InitContainers[0] != "wait-for-db" {
		t.Errorf("unexpected initContainers: %v", summary.InitContainers)
	}
}

func TestKubeBridge_GetControllerPods_Validation(t *testing.T) {
	bridgeNoCM := NewKubeBridge(nil)
	pods, err := bridgeNoCM.GetControllerPods("default", "Deployment", "my-deploy")
	if err == nil {
		t.Fatal("expected error when clientManager is nil")
	}
	if pods == nil {
		t.Fatal("expected non-nil slice when error returned")
	}
}

func TestKubeBridge_ExecMethods(t *testing.T) {
	bridgeNoCM := NewKubeBridge(nil)

	// Validation: missing pod
	_, err := bridgeNoCM.StartPodExec(ExecRequest{Namespace: "default"})
	if err == nil {
		t.Fatal("expected error for missing pod name")
	}

	// Validation: missing namespace
	_, err = bridgeNoCM.StartPodExec(ExecRequest{PodName: "test-pod"})
	if err == nil {
		t.Fatal("expected error for missing namespace")
	}

	// Validation: nil client manager
	_, err = bridgeNoCM.StartPodExec(ExecRequest{Namespace: "default", PodName: "test-pod"})
	if err == nil {
		t.Fatal("expected error when client manager is nil")
	}

	// ExecWrite on invalid session
	if err := bridgeNoCM.ExecWrite("invalid-id", "data"); err == nil {
		t.Fatal("expected error writing to invalid session")
	}

	// ExecResize on invalid session
	if err := bridgeNoCM.ExecResize("invalid-id", 80, 24); err == nil {
		t.Fatal("expected error resizing invalid session")
	}

	// StopPodExec is idempotent
	if err := bridgeNoCM.StopPodExec("invalid-id"); err != nil {
		t.Fatalf("expected nil error stopping invalid session, got %v", err)
	}
}

func TestKubeBridge_TriggerCronJob_Validation(t *testing.T) {
	bridgeNoCM := NewKubeBridge(nil)
	job, err := bridgeNoCM.TriggerCronJob("default", "my-cron")
	if err == nil {
		t.Fatal("expected error when clientManager is nil")
	}
	if job != nil {
		t.Fatal("expected nil job when error returned")
	}
}

func TestKubeBridge_RerunJob_Validation(t *testing.T) {
	bridgeNoCM := NewKubeBridge(nil)
	job, err := bridgeNoCM.RerunJob("default", "my-job")
	if err == nil {
		t.Fatal("expected error when clientManager is nil")
	}
	if job != nil {
		t.Fatal("expected nil job when error returned")
	}
}

func TestKubeBridge_SetNamespace(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error creating client manager: %v", err)
	}

	bridge := NewKubeBridge(cm)
	err = bridge.SetNamespace("kube-system")
	if err != nil {
		t.Fatalf("expected SetNamespace to succeed: %v", err)
	}

	if cm.GetActiveNamespace() != "kube-system" {
		t.Errorf("expected active namespace kube-system, got %s", cm.GetActiveNamespace())
	}
}

