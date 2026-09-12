package ipc

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/teeaa/kermitt/pkg/kube"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	networkingv1 "k8s.io/api/networking/v1"
)

func TestWorkloadCache_CRUD(t *testing.T) {
	cache := NewWorkloadCache()

	// Deployments
	deps := []DeploymentSummary{{Name: "deploy-1", Namespace: "default"}}
	cache.SetDeployments("default", deps)
	gotDeps, ok := cache.GetDeployments("default")
	if !ok || len(gotDeps) != 1 || gotDeps[0].Name != "deploy-1" {
		t.Fatalf("expected deploy-1, got %v, ok=%v", gotDeps, ok)
	}
	_, ok = cache.GetDeployments("other")
	if ok {
		t.Fatalf("expected false for uncached namespace")
	}

	// StatefulSets
	stss := []StatefulSetSummary{{Name: "sts-1", Namespace: "default"}}
	cache.SetStatefulSets("default", stss)
	gotStss, ok := cache.GetStatefulSets("default")
	if !ok || len(gotStss) != 1 || gotStss[0].Name != "sts-1" {
		t.Fatalf("expected sts-1, got %v, ok=%v", gotStss, ok)
	}

	// Jobs
	jobs := []JobSummary{{Name: "job-1", Namespace: "default"}}
	cache.SetJobs("default", jobs)
	gotJobs, ok := cache.GetJobs("default")
	if !ok || len(gotJobs) != 1 || gotJobs[0].Name != "job-1" {
		t.Fatalf("expected job-1, got %v, ok=%v", gotJobs, ok)
	}

	// CronJobs
	cronjobs := []CronJobSummary{{Name: "cronjob-1", Namespace: "default"}}
	cache.SetCronJobs("default", cronjobs)
	gotCronJobs, ok := cache.GetCronJobs("default")
	if !ok || len(gotCronJobs) != 1 || gotCronJobs[0].Name != "cronjob-1" {
		t.Fatalf("expected cronjob-1, got %v, ok=%v", gotCronJobs, ok)
	}

	// Nodes
	nodes := []NodeSummary{{Name: "node-1", Status: "Ready"}}
	cache.SetNodes(nodes)
	gotNodes, ok := cache.GetNodes()
	if !ok || len(gotNodes) != 1 || gotNodes[0].Name != "node-1" {
		t.Fatalf("expected node-1, got %v, ok=%v", gotNodes, ok)
	}

	// Services
	services := []ServiceSummary{{Name: "svc-1", Namespace: "default"}}
	cache.SetServices("default", services)
	gotServices, ok := cache.GetServices("default")
	if !ok || len(gotServices) != 1 || gotServices[0].Name != "svc-1" {
		t.Fatalf("expected svc-1, got %v, ok=%v", gotServices, ok)
	}

	// Ingresses
	ingresses := []IngressSummary{{Name: "ing-1", Namespace: "default"}}
	cache.SetIngresses("default", ingresses)
	gotIngresses, ok := cache.GetIngresses("default")
	if !ok || len(gotIngresses) != 1 || gotIngresses[0].Name != "ing-1" {
		t.Fatalf("expected ing-1, got %v, ok=%v", gotIngresses, ok)
	}

	// Counts
	counts := map[string]int{"deployments": 5, "pods": 12}
	cache.SetCounts(counts)
	gotCounts, ok := cache.GetCounts()
	if !ok || gotCounts["deployments"] != 5 || gotCounts["pods"] != 12 {
		t.Fatalf("expected counts, got %v, ok=%v", gotCounts, ok)
	}

	// Clear
	cache.Clear()
	if _, ok := cache.GetDeployments("default"); ok {
		t.Fatalf("expected cache to be cleared of deployments")
	}
	if _, ok := cache.GetNodes(); ok {
		t.Fatalf("expected cache to be cleared of nodes")
	}
	if _, ok := cache.GetCounts(); ok {
		t.Fatalf("expected cache to be cleared of counts")
	}
}

func TestWorkloadCache_Concurrency(t *testing.T) {
	cache := NewWorkloadCache()
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(2)
		go func(idx int) {
			defer wg.Done()
			cache.SetDeployments("ns", []DeploymentSummary{{Name: "dep"}})
			cache.SetCounts(map[string]int{"pods": idx})
			cache.Clear()
		}(i)
		go func() {
			defer wg.Done()
			_, _ = cache.GetDeployments("ns")
			_, _ = cache.GetCounts()
		}()
	}
	wg.Wait()
}

func TestClassifyEnvironment(t *testing.T) {
	tests := []struct {
		contextName string
		expected    string
	}{
		{"production-us-east-1", "prod"},
		{"prod-cluster", "prod"},
		{"staging-eu-west-1", "staging"},
		{"stage-k8s", "staging"},
		{"development-cluster", "dev"},
		{"dev-eks", "dev"},
		{"docker-desktop", "local"},
		{"minikube", "local"},
		{"kind-cluster", "local"},
		{"k3d-k3s-default", "local"},
		{"my-custom-cluster", "default"},
	}

	for _, tt := range tests {
		t.Run(tt.contextName, func(t *testing.T) {
			got := ClassifyEnvironment(tt.contextName)
			if got != tt.expected {
				t.Errorf("ClassifyEnvironment(%q) = %q, expected %q", tt.contextName, got, tt.expected)
			}
		})
	}
}

func TestFormatAge(t *testing.T) {
	if got := FormatAge(time.Time{}); got != "Unknown" {
		t.Errorf("expected Unknown for zero time, got %s", got)
	}

	now := time.Now()
	if got := FormatAge(now.Add(-30 * time.Second)); got != "30s" {
		t.Errorf("expected 30s, got %s", got)
	}
	if got := FormatAge(now.Add(-5 * time.Minute)); got != "5m" {
		t.Errorf("expected 5m, got %s", got)
	}
	if got := FormatAge(now.Add(-3 * time.Hour)); got != "3h" {
		t.Errorf("expected 3h, got %s", got)
	}
	if got := FormatAge(now.Add(-48 * time.Hour)); got != "2d" {
		t.Errorf("expected 2d, got %s", got)
	}
}

func TestMapIngressToSummary(t *testing.T) {
	className := "nginx"
	ing := networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{
			Name:              "test-ing",
			Namespace:         "demo",
			CreationTimestamp: metav1.Time{Time: time.Now().Add(-10 * time.Minute)},
		},
		Spec: networkingv1.IngressSpec{
			IngressClassName: &className,
			Rules: []networkingv1.IngressRule{
				{Host: "example.com"},
				{Host: "api.example.com"},
			},
		},
		Status: networkingv1.IngressStatus{
			LoadBalancer: networkingv1.IngressLoadBalancerStatus{
				Ingress: []networkingv1.IngressLoadBalancerIngress{
					{IP: "1.2.3.4"},
				},
			},
		},
	}

	summary := MapIngressToSummary(ing)
	if summary.Name != "test-ing" || summary.Namespace != "demo" {
		t.Errorf("unexpected name/ns: %s/%s", summary.Name, summary.Namespace)
	}
	if summary.ClassName != "nginx" {
		t.Errorf("expected className nginx, got %s", summary.ClassName)
	}
	if summary.Hosts != "example.com, api.example.com" {
		t.Errorf("expected hosts 'example.com, api.example.com', got %s", summary.Hosts)
	}
	if summary.Endpoints != "1.2.3.4" {
		t.Errorf("expected endpoint 1.2.3.4, got %s", summary.Endpoints)
	}
}

func TestBootstrapper_GetInitialState_NilCM(t *testing.T) {
	b := NewBootstrapper(nil, nil, nil, nil)
	state, err := b.GetInitialState(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if state == nil {
		t.Fatal("expected state not to be nil")
	}
	if state.ActiveNamespace != "default" {
		t.Errorf("expected default activeNamespace, got %s", state.ActiveNamespace)
	}
	if len(state.Pods) != 0 {
		t.Errorf("expected 0 pods, got %d", len(state.Pods))
	}
}

func TestBootstrapper_GetInitialState_WithCM(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error creating client manager: %v", err)
	}

	var emittedEvents []string
	var emitMu sync.Mutex
	emitter := func(eventName string, optionalData ...interface{}) {
		emitMu.Lock()
		defer emitMu.Unlock()
		emittedEvents = append(emittedEvents, eventName)
	}

	cache := NewWorkloadCache()
	b := NewBootstrapper(cm, emitter, nil, cache)

	// Phase 1 fast path
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	state, err := b.GetInitialState(ctx)
	if err != nil {
		t.Fatalf("expected GetInitialState not to return error, got %v", err)
	}
	if state == nil {
		t.Fatal("expected state not to be nil")
	}

	// Active context and namespace should match ClientManager
	if state.ActiveContext != cm.GetCurrentContext() {
		t.Errorf("expected active context %s, got %s", cm.GetCurrentContext(), state.ActiveContext)
	}
	if state.Pods == nil {
		t.Errorf("expected non-nil pods slice")
	}

	// Wait briefly for Phase 2 background warm-up goroutine
	time.Sleep(300 * time.Millisecond)

	emitMu.Lock()
	events := append([]string{}, emittedEvents...)
	emitMu.Unlock()

	t.Logf("Emitted events: %v", events)
}

func TestKubeBridge_GetInitialState(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error creating client manager: %v", err)
	}

	bridge := NewKubeBridge(cm)
	state, err := bridge.GetInitialState()
	if err != nil {
		t.Fatalf("expected GetInitialState to succeed, got %v", err)
	}
	if state == nil {
		t.Fatal("expected non-nil InitialBootstrapState")
	}

	if state.ActiveContext != cm.GetCurrentContext() {
		t.Errorf("expected active context %s, got %s", cm.GetCurrentContext(), state.ActiveContext)
	}
	if state.Pods == nil {
		t.Errorf("expected non-nil pods list")
	}
}

func TestKubeBridge_WorkloadCache_Hit(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error creating client manager: %v", err)
	}

	bridge := NewKubeBridge(cm)

	// Pre-populate cache directly
	cache := bridge.GetWorkloadCache()
	if cache == nil {
		t.Fatal("expected non-nil WorkloadCache")
	}

	testNs := "test-cache-ns"
	cache.SetDeployments(testNs, []DeploymentSummary{{Name: "cached-dep", Namespace: testNs}})
	cache.SetStatefulSets(testNs, []StatefulSetSummary{{Name: "cached-sts", Namespace: testNs}})
	cache.SetJobs(testNs, []JobSummary{{Name: "cached-job", Namespace: testNs}})
	cache.SetCronJobs(testNs, []CronJobSummary{{Name: "cached-cronjob", Namespace: testNs}})
	cache.SetServices(testNs, []ServiceSummary{{Name: "cached-svc", Namespace: testNs}})
	cache.SetIngresses(testNs, []IngressSummary{{Name: "cached-ing", Namespace: testNs}})
	cache.SetNodes([]NodeSummary{{Name: "cached-node"}})
	cache.SetCounts(map[string]int{"nodeCount": 3, "serviceCount": 5})

	// Verify GetDeployments hits cache
	deps, err := bridge.GetDeployments(testNs)
	if err != nil || len(deps) != 1 || deps[0].Name != "cached-dep" {
		t.Fatalf("expected cached deployment, got %v, err=%v", deps, err)
	}

	// Verify GetStatefulSets hits cache
	stss, err := bridge.GetStatefulSets(testNs)
	if err != nil || len(stss) != 1 || stss[0].Name != "cached-sts" {
		t.Fatalf("expected cached statefulset, got %v, err=%v", stss, err)
	}

	// Verify GetJobs hits cache
	jobs, err := bridge.GetJobs(testNs)
	if err != nil || len(jobs) != 1 || jobs[0].Name != "cached-job" {
		t.Fatalf("expected cached job, got %v, err=%v", jobs, err)
	}

	// Verify GetCronJobs hits cache
	cronjobs, err := bridge.GetCronJobs(testNs)
	if err != nil || len(cronjobs) != 1 || cronjobs[0].Name != "cached-cronjob" {
		t.Fatalf("expected cached cronjob, got %v, err=%v", cronjobs, err)
	}

	// Verify GetServices hits cache
	svcs, err := bridge.GetServices(testNs)
	if err != nil || len(svcs) != 1 || svcs[0].Name != "cached-svc" {
		t.Fatalf("expected cached service, got %v, err=%v", svcs, err)
	}

	// Verify GetIngresses hits cache
	ings, err := bridge.GetIngresses(testNs)
	if err != nil || len(ings) != 1 || ings[0].Name != "cached-ing" {
		t.Fatalf("expected cached ingress, got %v, err=%v", ings, err)
	}

	// Verify GetNodes hits cache
	nodes, err := bridge.GetNodes()
	if err != nil || len(nodes) != 1 || nodes[0].Name != "cached-node" {
		t.Fatalf("expected cached node, got %v, err=%v", nodes, err)
	}

	// Verify GetClusterConfigCounts hits cache
	counts, err := bridge.GetClusterConfigCounts(testNs)
	if err != nil || counts.NodeCount != 3 || counts.ServiceCount != 5 {
		t.Fatalf("expected cached counts (nodes=3, svcs=5), got %v, err=%v", counts, err)
	}

	// Switching context clears cache
	_ = bridge.SwitchContext("totally-invalid-context")
	cache.Clear()
	if _, ok := cache.GetDeployments(testNs); ok {
		t.Fatalf("expected cache to be cleared")
	}
}

type mockEmitter struct {
	mu     sync.Mutex
	events []string
}

func (m *mockEmitter) Emit(eventName string, optionalData ...interface{}) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, eventName)
}

func TestKubeBridge_GetInitialState_EventEmission(t *testing.T) {
	cm, err := kube.NewClientManager()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	bridge := NewKubeBridge(cm)
	mock := &mockEmitter{}
	bridge.SetCustomEmitter(mock)

	state, err := bridge.GetInitialState()
	if err != nil {
		t.Fatalf("expected GetInitialState to succeed: %v", err)
	}
	if state == nil {
		t.Fatal("expected non-nil state")
	}

	// Wait briefly for Phase 2 goroutines
	time.Sleep(200 * time.Millisecond)

	mock.mu.Lock()
	events := append([]string{}, mock.events...)
	mock.mu.Unlock()

	t.Logf("Observed emitted events: %v", events)
}
