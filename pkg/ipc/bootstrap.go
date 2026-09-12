package ipc

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/teeaa/kermitt/pkg/kube"
	"golang.org/x/sync/errgroup"
	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// ============================================================================
// WorkloadCache: In-Memory Cache for Instant Tab Switching
// ============================================================================

// WorkloadCache caches auxiliary workloads and counts in memory.
type WorkloadCache struct {
	mu           sync.RWMutex
	deployments  map[string][]DeploymentSummary
	statefulSets map[string][]StatefulSetSummary
	jobs         map[string][]JobSummary
	cronJobs     map[string][]CronJobSummary
	nodes        []NodeSummary
	services     map[string][]ServiceSummary
	ingresses    map[string][]IngressSummary
	namespaces   []Namespace
	counts       map[string]int
}

// NewWorkloadCache initializes a clean WorkloadCache instance.
func NewWorkloadCache() *WorkloadCache {
	return &WorkloadCache{
		deployments:  make(map[string][]DeploymentSummary),
		statefulSets: make(map[string][]StatefulSetSummary),
		jobs:         make(map[string][]JobSummary),
		cronJobs:     make(map[string][]CronJobSummary),
		services:     make(map[string][]ServiceSummary),
		ingresses:    make(map[string][]IngressSummary),
		counts:       make(map[string]int),
	}
}

// Clear flushes all cached workloads (e.g. upon context switch).
func (c *WorkloadCache) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.deployments = make(map[string][]DeploymentSummary)
	c.statefulSets = make(map[string][]StatefulSetSummary)
	c.jobs = make(map[string][]JobSummary)
	c.cronJobs = make(map[string][]CronJobSummary)
	c.nodes = nil
	c.services = make(map[string][]ServiceSummary)
	c.ingresses = make(map[string][]IngressSummary)
	c.namespaces = nil
	c.counts = make(map[string]int)
}

func (c *WorkloadCache) SetDeployments(ns string, items []DeploymentSummary) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.deployments[ns] = items
}

func (c *WorkloadCache) GetDeployments(ns string) ([]DeploymentSummary, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	items, ok := c.deployments[ns]
	return items, ok
}

func (c *WorkloadCache) SetStatefulSets(ns string, items []StatefulSetSummary) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.statefulSets[ns] = items
}

func (c *WorkloadCache) GetStatefulSets(ns string) ([]StatefulSetSummary, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	items, ok := c.statefulSets[ns]
	return items, ok
}

func (c *WorkloadCache) SetJobs(ns string, items []JobSummary) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.jobs[ns] = items
}

func (c *WorkloadCache) GetJobs(ns string) ([]JobSummary, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	items, ok := c.jobs[ns]
	return items, ok
}

func (c *WorkloadCache) SetCronJobs(ns string, items []CronJobSummary) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cronJobs[ns] = items
}

func (c *WorkloadCache) GetCronJobs(ns string) ([]CronJobSummary, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	items, ok := c.cronJobs[ns]
	return items, ok
}

func (c *WorkloadCache) SetNodes(items []NodeSummary) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.nodes = items
}

func (c *WorkloadCache) GetNodes() ([]NodeSummary, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.nodes == nil {
		return nil, false
	}
	return c.nodes, true
}

func (c *WorkloadCache) SetServices(ns string, items []ServiceSummary) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.services[ns] = items
}

func (c *WorkloadCache) GetServices(ns string) ([]ServiceSummary, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	items, ok := c.services[ns]
	return items, ok
}

func (c *WorkloadCache) SetIngresses(ns string, items []IngressSummary) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.ingresses[ns] = items
}

func (c *WorkloadCache) GetIngresses(ns string) ([]IngressSummary, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	items, ok := c.ingresses[ns]
	return items, ok
}

func (c *WorkloadCache) SetNamespaces(items []Namespace) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.namespaces = items
}

func (c *WorkloadCache) GetNamespaces() ([]Namespace, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.namespaces == nil {
		return nil, false
	}
	return c.namespaces, true
}

func (c *WorkloadCache) SetCounts(counts map[string]int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.counts = counts
}

func (c *WorkloadCache) GetCounts() (map[string]int, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if len(c.counts) == 0 {
		return nil, false
	}
	res := make(map[string]int, len(c.counts))
	for k, v := range c.counts {
		res[k] = v
	}
	return res, true
}

// ============================================================================
// Bootstrapper: Two-Phase Startup Engine
// ============================================================================

// Bootstrapper coordinates fast-path startup and asynchronous Phase 2 warm-up.
type Bootstrapper struct {
	cm        *kube.ClientManager
	emitter   func(eventName string, optionalData ...interface{})
	informers *kube.InformerManager
	cache     *WorkloadCache
	bgStarted sync.Once
}

// NewBootstrapper creates a new Bootstrapper.
func NewBootstrapper(
	cm *kube.ClientManager,
	emitter func(eventName string, optionalData ...interface{}),
	informers *kube.InformerManager,
	cache *WorkloadCache,
) *Bootstrapper {
	if cache == nil {
		cache = NewWorkloadCache()
	}
	return &Bootstrapper{
		cm:        cm,
		emitter:   emitter,
		informers: informers,
		cache:     cache,
	}
}

// GetCache returns the attached WorkloadCache.
func (b *Bootstrapper) GetCache() *WorkloadCache {
	return b.cache
}

// GetInitialState executes the Phase 1 Critical Path and triggers Phase 2 warm-up.
func (b *Bootstrapper) GetInitialState(ctx context.Context) (*InitialBootstrapState, error) {
	start := time.Now()
	slog.Info("GetInitialState called")

	if b.cm == nil {
		slog.Info("GetInitialState returned", "context", "", "namespace", "default", "count", 0, "pods", []string{})
		return &InitialBootstrapState{
			ActiveContext:   "",
			ActiveNamespace: "default",
			Pods:            make([]PodSummary, 0),
		}, nil
	}

	// 1. Parse Minimal Kubeconfig
	rawConfig, err := b.cm.GetRawConfig()
	if err != nil {
		slog.Warn("GetInitialState: failed to read raw kubeconfig", "error", err)
	}

	currentContext := rawConfig.CurrentContext
	currentNamespace := "default"
	if ctxEntry, ok := rawConfig.Contexts[currentContext]; ok && ctxEntry != nil {
		if ctxEntry.Namespace != "" {
			currentNamespace = ctxEntry.Namespace
		}
	}
	b.cm.SetActiveNamespace(currentNamespace)

	// 2. Initialize Scoped Clientset strictly for active context
	var clientset *kubernetes.Clientset
	if currentContext != "" {
		cs, err := b.cm.GetClientset()
		if err != nil {
			slog.Warn("GetInitialState: failed to acquire clientset for context", "context", currentContext, "error", err)
		} else {
			clientset = cs
		}
	}

	// 3. Fetch Active Pods Concurrently
	pods := make([]PodSummary, 0)
	if clientset != nil {
		podCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
		defer cancel()

		podList, err := clientset.CoreV1().Pods(currentNamespace).List(podCtx, metav1.ListOptions{})
		if err != nil {
			slog.Warn("GetInitialState: failed to list pods on critical path", "namespace", currentNamespace, "error", err)
		} else if podList != nil {
			pods = make([]PodSummary, 0, len(podList.Items))
			for _, p := range podList.Items {
				pods = append(pods, MapPodToSummary(p))
			}
			sort.Slice(pods, func(i, j int) bool {
				return pods[i].Name < pods[j].Name
			})
		}
	}

	state := &InitialBootstrapState{
		ActiveContext:   currentContext,
		ActiveNamespace: currentNamespace,
		Pods:            pods,
	}

	podNames := make([]string, 0, len(pods))
	for _, p := range pods {
		podNames = append(podNames, p.Name)
	}
	slog.Info("GetInitialState returned",
		"duration", time.Since(start).String(),
		"context", currentContext,
		"namespace", currentNamespace,
		"count", len(pods),
		"pods", podNames,
	)

	// 4. Trigger Phase 2: Kick off background warm-up goroutines
	b.TriggerPhase2(currentContext, currentNamespace, clientset)

	return state, nil
}

// TriggerPhase2 spawns background warm-up routines once.
func (b *Bootstrapper) TriggerPhase2(activeContext, activeNamespace string, clientset *kubernetes.Clientset) {
	b.bgStarted.Do(func() {
		go b.runBackgroundWarmUp(activeContext, activeNamespace, clientset)
	})
}

// runBackgroundWarmUp dispatches non-blocking worker goroutines.
func (b *Bootstrapper) runBackgroundWarmUp(activeContext, activeNamespace string, clientset *kubernetes.Clientset) {
	bgStart := time.Now()
	slog.Info("[BOOTSTRAP] Phase 2 Background Warm-Up started")
	bgCtx := context.Background()

	// 1. Contexts Loader (go b.loadAllContexts())
	go b.loadAllContexts(activeContext)

	// If no clientset available, we cannot query cluster resources
	if clientset == nil {
		slog.Warn("[BOOTSTRAP] Phase 2 skipping cluster queries: no active clientset")
		return
	}

	// 2. Namespaces Loader (go b.loadAllNamespaces(clientset))
	go b.loadAllNamespaces(bgCtx, clientset, activeNamespace)

	// 3. Auxiliary Workloads & Counts Loader
	b.loadAuxiliaryWorkloads(bgCtx, clientset, activeNamespace)

	// 4. Informer Bootstrapping: Start SharedInformerFactory watchers ONLY after
	// the initial background list calls complete, preventing initial event bursts from overwhelming IPC channels.
	if b.informers != nil {
		slog.Info("[BOOTSTRAP] Bootstrapping SharedInformerFactory after auxiliary lists completed")
		b.informers.Start()
	}

	slog.Info("[BOOTSTRAP] Phase 2 Background Warm-Up complete", "duration", time.Since(bgStart).String())
}

// loadAllContexts parses all contexts from kubeconfig, classifies environment types, and emits k8s:contexts:ready.
func (b *Bootstrapper) loadAllContexts(activeContext string) {
	slog.Info("loadAllContexts called", "activeContext", activeContext)
	rawConfig, err := b.cm.GetRawConfig()
	if err != nil {
		slog.Warn("loadAllContexts: failed to load kubeconfig for contexts warm-up", "error", err)
		return
	}

	contexts := make([]KubeContext, 0, len(rawConfig.Contexts))
	for name, ctxEntry := range rawConfig.Contexts {
		if ctxEntry == nil {
			continue
		}
		ns := ctxEntry.Namespace
		if ns == "" {
			ns = "default"
		}
		env := ClassifyEnvironment(name)
		contexts = append(contexts, KubeContext{
			Name:        name,
			ClusterName: ctxEntry.Cluster,
			UserName:    ctxEntry.AuthInfo,
			IsActive:    name == activeContext,
			Namespace:   ns,
			Environment: env,
		})
	}

	// Deterministic sorting: active context first, then alphabetically by name
	sort.Slice(contexts, func(i, j int) bool {
		if contexts[i].IsActive != contexts[j].IsActive {
			return contexts[i].IsActive
		}
		return contexts[i].Name < contexts[j].Name
	})

	if b.emitter != nil {
		b.emitter(EventContextsReady, contexts)
	}

	names := make([]string, 0, len(contexts))
	for _, c := range contexts {
		names = append(names, c.Name)
	}
	slog.Info("loadAllContexts returned", "count", len(contexts), "contexts", names)
}

// loadAllNamespaces queries cluster namespaces, caches them, and emits k8s:namespaces:ready.
func (b *Bootstrapper) loadAllNamespaces(ctx context.Context, cs kubernetes.Interface, activeNamespace string) {
	slog.Info("loadAllNamespaces called", "activeNamespace", activeNamespace)
	nsCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var namespaceNames []string
	var namespaceObjs []Namespace
	nsList, err := cs.CoreV1().Namespaces().List(nsCtx, metav1.ListOptions{})
	if err != nil {
		slog.Warn("loadAllNamespaces: listing cluster namespaces not available or failed; falling back to active namespace", "error", err)
		namespaceNames = []string{activeNamespace}
		if activeNamespace != "default" {
			namespaceNames = append(namespaceNames, "default")
		}
		for _, name := range namespaceNames {
			namespaceObjs = append(namespaceObjs, Namespace{
				Name:      name,
				Status:    NamespaceActive,
				Age:       "Unknown",
				CreatedAt: time.Now().UTC(),
			})
		}
	} else {
		namespaceNames = make([]string, 0, len(nsList.Items))
		namespaceObjs = make([]Namespace, 0, len(nsList.Items))
		for _, ns := range nsList.Items {
			namespaceNames = append(namespaceNames, ns.Name)
			status := NamespaceActive
			if ns.Status.Phase == "Terminating" {
				status = NamespaceTerminating
			}
			createdAt := ns.CreationTimestamp.Time
			namespaceObjs = append(namespaceObjs, Namespace{
				Name:      ns.Name,
				Status:    status,
				Age:       FormatAge(createdAt),
				CreatedAt: createdAt,
			})
		}
		sort.Strings(namespaceNames)
		sort.Slice(namespaceObjs, func(i, j int) bool {
			return namespaceObjs[i].Name < namespaceObjs[j].Name
		})
	}

	b.cache.SetNamespaces(namespaceObjs)

	if b.emitter != nil {
		b.emitter(EventNamespacesReady, namespaceNames)
	}
	slog.Info("loadAllNamespaces returned", "count", len(namespaceNames), "namespaces", namespaceNames)
}

// loadAuxiliaryWorkloads queries deployments, statefulsets, jobs, cronjobs, nodes, and services/ingress concurrently.
func (b *Bootstrapper) loadAuxiliaryWorkloads(ctx context.Context, cs kubernetes.Interface, activeNamespace string) {
	slog.Info("loadAuxiliaryWorkloads called", "namespace", activeNamespace)
	workloadCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()

	var (
		deployments  []DeploymentSummary
		statefulSets []StatefulSetSummary
		jobs         []JobSummary
		cronJobs     []CronJobSummary
		nodes        []NodeSummary
		services     []ServiceSummary
		ingresses    []IngressSummary
		mu           sync.Mutex
	)

	g, gCtx := errgroup.WithContext(workloadCtx)

	// 1. Deployments
	g.Go(func() error {
		list, err := cs.AppsV1().Deployments(activeNamespace).List(gCtx, metav1.ListOptions{})
		if err != nil {
			slog.Warn("loadAuxiliaryWorkloads: deployments not available or failed", "namespace", activeNamespace, "error", err)
			return nil
		}
		if list != nil {
			summaries := make([]DeploymentSummary, 0, len(list.Items))
			for _, d := range list.Items {
				summaries = append(summaries, MapDeploymentToSummary(d))
			}
			mu.Lock()
			deployments = summaries
			mu.Unlock()
			b.cache.SetDeployments(activeNamespace, summaries)
		}
		return nil
	})

	// 2. StatefulSets
	g.Go(func() error {
		list, err := cs.AppsV1().StatefulSets(activeNamespace).List(gCtx, metav1.ListOptions{})
		if err != nil {
			slog.Warn("loadAuxiliaryWorkloads: statefulsets not available or failed", "namespace", activeNamespace, "error", err)
			return nil
		}
		if list != nil {
			summaries := make([]StatefulSetSummary, 0, len(list.Items))
			for _, s := range list.Items {
				summaries = append(summaries, MapStatefulSetToSummary(s))
			}
			mu.Lock()
			statefulSets = summaries
			mu.Unlock()
			b.cache.SetStatefulSets(activeNamespace, summaries)
		}
		return nil
	})

	// 3. Jobs
	g.Go(func() error {
		list, err := cs.BatchV1().Jobs(activeNamespace).List(gCtx, metav1.ListOptions{})
		if err != nil {
			slog.Warn("loadAuxiliaryWorkloads: jobs not available or failed", "namespace", activeNamespace, "error", err)
			return nil
		}
		if list != nil {
			summaries := make([]JobSummary, 0, len(list.Items))
			for _, j := range list.Items {
				summaries = append(summaries, MapJobToSummary(j))
			}
			mu.Lock()
			jobs = summaries
			mu.Unlock()
			b.cache.SetJobs(activeNamespace, summaries)
		}
		return nil
	})

	// 4. CronJobs
	g.Go(func() error {
		list, err := cs.BatchV1().CronJobs(activeNamespace).List(gCtx, metav1.ListOptions{})
		if err != nil {
			slog.Warn("loadAuxiliaryWorkloads: cronjobs not available or failed", "namespace", activeNamespace, "error", err)
			return nil
		}
		if list != nil {
			summaries := make([]CronJobSummary, 0, len(list.Items))
			for _, cj := range list.Items {
				summaries = append(summaries, MapCronJobToSummary(cj))
			}
			mu.Lock()
			cronJobs = summaries
			mu.Unlock()
			b.cache.SetCronJobs(activeNamespace, summaries)
		}
		return nil
	})

	// 5. Nodes (Cluster-scoped)
	g.Go(func() error {
		list, err := cs.CoreV1().Nodes().List(gCtx, metav1.ListOptions{})
		if err != nil {
			slog.Warn("loadAuxiliaryWorkloads: nodes not available or failed", "error", err)
			return nil
		}
		if list != nil {
			summaries := make([]NodeSummary, 0, len(list.Items))
			for _, n := range list.Items {
				summaries = append(summaries, MapNodeToSummary(n))
			}
			mu.Lock()
			nodes = summaries
			mu.Unlock()
			b.cache.SetNodes(summaries)
		}
		return nil
	})

	// 6. Services & Ingresses
	g.Go(func() error {
		svcList, err := cs.CoreV1().Services(activeNamespace).List(gCtx, metav1.ListOptions{})
		if err != nil {
			slog.Warn("loadAuxiliaryWorkloads: services not available or failed", "namespace", activeNamespace, "error", err)
			return nil
		}
		if svcList != nil {
			summaries := make([]ServiceSummary, 0, len(svcList.Items))
			for _, s := range svcList.Items {
				summaries = append(summaries, MapServiceToSummary(s))
			}
			mu.Lock()
			services = summaries
			mu.Unlock()
			b.cache.SetServices(activeNamespace, summaries)
		}
		return nil
	})

	g.Go(func() error {
		ingList, err := cs.NetworkingV1().Ingresses(activeNamespace).List(gCtx, metav1.ListOptions{})
		if err != nil {
			slog.Warn("loadAuxiliaryWorkloads: ingresses not available or failed", "namespace", activeNamespace, "error", err)
			return nil
		}
		if ingList != nil {
			summaries := make([]IngressSummary, 0, len(ingList.Items))
			for _, ing := range ingList.Items {
				summaries = append(summaries, MapIngressToSummary(ing))
			}
			mu.Lock()
			ingresses = summaries
			mu.Unlock()
			b.cache.SetIngresses(activeNamespace, summaries)
		}
		return nil
	})

	_ = g.Wait()

	// Calculate countsMap for dynamic sidebar badges
	countsMap := map[string]int{
		"deployments":          len(deployments),
		"deploymentCount":      len(deployments),
		"statefulsets":         len(statefulSets),
		"statefulSetCount":     len(statefulSets),
		"jobs":                 len(jobs),
		"jobCount":             len(jobs),
		"cronjobs":             len(cronJobs),
		"cronJobCount":         len(cronJobs),
		"nodes":                len(nodes),
		"nodeCount":            len(nodes),
		"services":             len(services),
		"serviceCount":         len(services),
		"ingresses":            len(ingresses),
		"ingressCount":         len(ingresses),
		"servicesIngress":      len(services) + len(ingresses),
		"servicesIngressCount": len(services) + len(ingresses),
	}

	b.cache.SetCounts(countsMap)

	if b.emitter != nil {
		b.emitter(EventSidebarCountsUpdated, countsMap)
	}
	slog.Info("loadAuxiliaryWorkloads returned", "namespace", activeNamespace, "counts", countsMap)
}

// ============================================================================
// DTO Mapping Helpers
// ============================================================================

// ClassifyEnvironment determines the tier for a context name.
func ClassifyEnvironment(contextName string) string {
	lower := strings.ToLower(strings.TrimSpace(contextName))
	if lower == "" {
		return "default"
	}
	if strings.Contains(lower, "prod") || strings.Contains(lower, "live") || strings.Contains(lower, "main") || strings.Contains(lower, "prd") {
		if !strings.Contains(lower, "test") && !strings.Contains(lower, "dev") && !strings.Contains(lower, "stage") {
			return "prod"
		}
	}
	if strings.Contains(lower, "stage") || strings.Contains(lower, "staging") || strings.Contains(lower, "qa") {
		return "staging"
	}
	if strings.Contains(lower, "local") || strings.Contains(lower, "kind") || strings.Contains(lower, "minikube") || strings.Contains(lower, "k3d") || strings.Contains(lower, "docker-desktop") {
		return "local"
	}
	if strings.Contains(lower, "dev") || strings.Contains(lower, "test") {
		return "dev"
	}
	return "default"
}

// MapPodToSummary converts a raw Kubernetes Pod into our PodSummary DTO.
func MapPodToSummary(pod corev1.Pod) PodSummary {
	status := DeterminePodStatus(&pod)
	readyCount := 0
	restartCount := int32(0)

	for _, cs := range pod.Status.ContainerStatuses {
		if cs.Ready {
			readyCount++
		}
		restartCount += cs.RestartCount
	}
	for _, cs := range pod.Status.InitContainerStatuses {
		restartCount += cs.RestartCount
	}

	totalContainers := len(pod.Spec.Containers)
	containers := make([]string, 0, totalContainers)
	for _, c := range pod.Spec.Containers {
		containers = append(containers, c.Name)
	}

	var initContainers []string
	if len(pod.Spec.InitContainers) > 0 {
		initContainers = make([]string, 0, len(pod.Spec.InitContainers))
		for _, ic := range pod.Spec.InitContainers {
			initContainers = append(initContainers, ic.Name)
		}
	}

	createdAt := pod.CreationTimestamp.Time
	age := FormatAge(createdAt)
	cpuReq, cpuLim, memReq, memLim := kube.CalculateContainerResources(pod.Spec.Containers)

	return PodSummary{
		Name:            pod.Name,
		Namespace:       pod.Namespace,
		Status:          PodPhase(status),
		TotalContainers: totalContainers,
		ReadyContainers: readyCount,
		RestartCount:    restartCount,
		Age:             age,
		CreatedAt:       createdAt,
		IP:              pod.Status.PodIP,
		NodeName:        pod.Spec.NodeName,
		Containers:      containers,
		InitContainers:  initContainers,
		CPURequest:      cpuReq,
		CPULimit:        cpuLim,
		MemoryRequest:   memReq,
		MemoryLimit:     memLim,
	}
}

// DeterminePodStatus evaluates container waiting/terminated reasons to match realistic pod status.
func DeterminePodStatus(pod *corev1.Pod) string {
	if pod.DeletionTimestamp != nil {
		return "Terminating"
	}

	// 1. Check init container statuses
	for _, cs := range pod.Status.InitContainerStatuses {
		if cs.State.Terminated != nil && cs.State.Terminated.ExitCode != 0 {
			if cs.State.Terminated.Reason != "" {
				return "Init:" + cs.State.Terminated.Reason
			}
			return fmt.Sprintf("Init:ExitCode%d", cs.State.Terminated.ExitCode)
		}
		if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" && cs.State.Waiting.Reason != "PodInitializing" {
			return "Init:" + cs.State.Waiting.Reason
		}
	}

	// 2. Check regular container statuses
	hasRunning := false
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
			return cs.State.Waiting.Reason
		}
		if cs.State.Terminated != nil {
			if cs.State.Terminated.Reason != "" {
				return cs.State.Terminated.Reason
			}
			if cs.State.Terminated.ExitCode != 0 {
				return fmt.Sprintf("ExitCode:%d", cs.State.Terminated.ExitCode)
			}
		}
		if cs.State.Running != nil && cs.Ready {
			hasRunning = true
		}
	}

	if pod.Status.Reason != "" {
		return pod.Status.Reason
	}
	phase := string(pod.Status.Phase)
	if phase != "" {
		return phase
	}
	if hasRunning {
		return "Running"
	}
	return "Unknown"
}

// MapDeploymentToSummary converts an apps/v1 Deployment to DeploymentSummary.
func MapDeploymentToSummary(d appsv1.Deployment) DeploymentSummary {
	totalReplicas := int32(1)
	if d.Spec.Replicas != nil {
		totalReplicas = *d.Spec.Replicas
	}
	readyReplicas := d.Status.ReadyReplicas
	status := "Ready"
	if readyReplicas < totalReplicas {
		if d.Status.UnavailableReplicas > 0 {
			status = "Degraded"
		} else {
			status = "Progressing"
		}
	}
	if totalReplicas == 0 {
		status = "Ready"
	}

	conditions := "Available: True"
	for _, c := range d.Status.Conditions {
		if c.Type == appsv1.DeploymentAvailable && c.Status != corev1.ConditionTrue {
			conditions = fmt.Sprintf("Available: %s (%s)", c.Status, c.Reason)
		}
	}

	return DeploymentSummary{
		Name:          d.Name,
		Namespace:     d.Namespace,
		Status:        status,
		Ready:         fmt.Sprintf("%d/%d", readyReplicas, totalReplicas),
		ReadyReplicas: readyReplicas,
		TotalReplicas: totalReplicas,
		UpToDate:      d.Status.UpdatedReplicas,
		Available:     d.Status.AvailableReplicas,
		Age:           FormatAge(d.CreationTimestamp.Time),
		Conditions:    conditions,
	}
}

// MapStatefulSetToSummary converts an apps/v1 StatefulSet to StatefulSetSummary.
func MapStatefulSetToSummary(s appsv1.StatefulSet) StatefulSetSummary {
	totalReplicas := int32(1)
	if s.Spec.Replicas != nil {
		totalReplicas = *s.Spec.Replicas
	}
	readyReplicas := s.Status.ReadyReplicas
	status := "Ready"
	if readyReplicas < totalReplicas {
		if readyReplicas == 0 && totalReplicas > 0 {
			status = "Degraded"
		} else {
			status = "Progressing"
		}
	}
	if totalReplicas == 0 {
		status = "Ready"
	}

	return StatefulSetSummary{
		Name:          s.Name,
		Namespace:     s.Namespace,
		Status:        status,
		Ready:         fmt.Sprintf("%d/%d", readyReplicas, totalReplicas),
		ReadyReplicas: readyReplicas,
		TotalReplicas: totalReplicas,
		Age:           FormatAge(s.CreationTimestamp.Time),
		ServiceName:   s.Spec.ServiceName,
	}
}

// MapJobToSummary converts a batch/v1 Job to JobSummary.
func MapJobToSummary(j batchv1.Job) JobSummary {
	status := "Running"
	if j.Status.Succeeded > 0 {
		status = "Completed"
	} else if j.Status.Failed > 0 {
		status = "Failed"
	}

	completionsReq := int32(1)
	if j.Spec.Completions != nil {
		completionsReq = *j.Spec.Completions
	}
	completions := fmt.Sprintf("%d/%d", j.Status.Succeeded, completionsReq)

	duration := "-"
	if j.Status.StartTime != nil {
		if j.Status.CompletionTime != nil {
			d := j.Status.CompletionTime.Sub(j.Status.StartTime.Time).Round(time.Second)
			duration = d.String()
		} else {
			d := time.Since(j.Status.StartTime.Time).Round(time.Second)
			duration = fmt.Sprintf("%s (running)", d.String())
		}
	}

	image := ""
	if len(j.Spec.Template.Spec.Containers) > 0 {
		image = j.Spec.Template.Spec.Containers[0].Image
	}

	return JobSummary{
		Name:        j.Name,
		Namespace:   j.Namespace,
		Status:      status,
		Completions: completions,
		Duration:    duration,
		Age:         FormatAge(j.CreationTimestamp.Time),
		Image:       image,
	}
}

// MapCronJobToSummary converts a batch/v1 CronJob to CronJobSummary.
func MapCronJobToSummary(cj batchv1.CronJob) CronJobSummary {
	suspend := false
	if cj.Spec.Suspend != nil {
		suspend = *cj.Spec.Suspend
	}

	lastSchedule := "-"
	if cj.Status.LastScheduleTime != nil {
		lastSchedule = FormatAge(cj.Status.LastScheduleTime.Time) + " ago"
	}

	return CronJobSummary{
		Name:                cj.Name,
		Namespace:           cj.Namespace,
		Schedule:            cj.Spec.Schedule,
		ScheduleDescription: FormatCronScheduleDescription(cj.Spec.Schedule),
		Suspend:             suspend,
		ActiveJobs:          len(cj.Status.Active),
		LastSchedule:        lastSchedule,
		Age:                 FormatAge(cj.CreationTimestamp.Time),
	}
}

// FormatCronScheduleDescription converts common cron strings to human text.
func FormatCronScheduleDescription(schedule string) string {
	switch schedule {
	case "0 * * * *":
		return "Every hour at minute 0"
	case "0 0 * * *":
		return "Every day at midnight"
	case "0 2 * * *":
		return "Every day at 02:00 UTC"
	case "0 0 * * 0":
		return "Every Sunday at midnight"
	case "*/5 * * * *":
		return "Every 5 minutes"
	case "*/15 * * * *":
		return "Every 15 minutes"
	default:
		return fmt.Sprintf("Cron: %s", schedule)
	}
}

// MapNodeToSummary converts a core/v1 Node to NodeSummary.
func MapNodeToSummary(n corev1.Node) NodeSummary {
	status := "NotReady"
	for _, cond := range n.Status.Conditions {
		if cond.Type == corev1.NodeReady && cond.Status == corev1.ConditionTrue {
			status = "Ready"
			break
		}
	}

	var roles []string
	for k := range n.Labels {
		if strings.HasPrefix(k, "node-role.kubernetes.io/") {
			role := strings.TrimPrefix(k, "node-role.kubernetes.io/")
			if role != "" {
				roles = append(roles, role)
			}
		}
	}
	if len(roles) == 0 {
		if r, ok := n.Labels["kubernetes.io/role"]; ok && r != "" {
			roles = append(roles, r)
		} else {
			roles = append(roles, "worker")
		}
	}
	sort.Strings(roles)

	internalIP := "<none>"
	for _, addr := range n.Status.Addresses {
		if addr.Type == corev1.NodeInternalIP {
			internalIP = addr.Address
			break
		}
	}
	if internalIP == "<none>" && len(n.Status.Addresses) > 0 {
		internalIP = n.Status.Addresses[0].Address
	}

	return NodeSummary{
		Name:       n.Name,
		Status:     status,
		Roles:      strings.Join(roles, ", "),
		Version:    n.Status.NodeInfo.KubeletVersion,
		InternalIP: internalIP,
		OSImage:    n.Status.NodeInfo.OSImage,
		Age:        FormatAge(n.CreationTimestamp.Time),
	}
}

// MapServiceToSummary converts a core/v1 Service to ServiceSummary.
func MapServiceToSummary(s corev1.Service) ServiceSummary {
	var externalIPs []string
	for _, ing := range s.Status.LoadBalancer.Ingress {
		if ing.IP != "" {
			externalIPs = append(externalIPs, ing.IP)
		} else if ing.Hostname != "" {
			externalIPs = append(externalIPs, ing.Hostname)
		}
	}
	if len(externalIPs) == 0 && len(s.Spec.ExternalIPs) > 0 {
		externalIPs = append(externalIPs, s.Spec.ExternalIPs...)
	}
	extIPStr := "<none>"
	if len(externalIPs) > 0 {
		extIPStr = strings.Join(externalIPs, ", ")
	} else if s.Spec.Type == corev1.ServiceTypeLoadBalancer {
		extIPStr = "<pending>"
	}

	var portStrs []string
	for _, p := range s.Spec.Ports {
		proto := string(p.Protocol)
		if proto == "" {
			proto = "TCP"
		}
		if p.NodePort != 0 {
			portStrs = append(portStrs, fmt.Sprintf("%d:%d/%s", p.Port, p.NodePort, proto))
		} else {
			portStrs = append(portStrs, fmt.Sprintf("%d/%s", p.Port, proto))
		}
	}
	portsStr := "<none>"
	if len(portStrs) > 0 {
		portsStr = strings.Join(portStrs, ", ")
	}

	clusterIP := s.Spec.ClusterIP
	if clusterIP == "" {
		clusterIP = "<none>"
	}

	return ServiceSummary{
		Name:       s.Name,
		Namespace:  s.Namespace,
		Type:       string(s.Spec.Type),
		ClusterIP:  clusterIP,
		ExternalIP: extIPStr,
		Ports:      portsStr,
		Age:        FormatAge(s.CreationTimestamp.Time),
		Selector:   s.Spec.Selector,
	}
}

// MapIngressToSummary converts an Ingress to IngressSummary.
func MapIngressToSummary(ing networkingv1.Ingress) IngressSummary {
	var hosts []string
	for _, r := range ing.Spec.Rules {
		if r.Host != "" {
			hosts = append(hosts, r.Host)
		}
	}
	hostsStr := "*"
	if len(hosts) > 0 {
		hostsStr = strings.Join(hosts, ", ")
	}
	var endpoints []string
	for _, lb := range ing.Status.LoadBalancer.Ingress {
		if lb.IP != "" {
			endpoints = append(endpoints, lb.IP)
		} else if lb.Hostname != "" {
			endpoints = append(endpoints, lb.Hostname)
		}
	}
	endpointStr := "<none>"
	if len(endpoints) > 0 {
		endpointStr = strings.Join(endpoints, ", ")
	}
	className := "<default>"
	if ing.Spec.IngressClassName != nil && *ing.Spec.IngressClassName != "" {
		className = *ing.Spec.IngressClassName
	}
	return IngressSummary{
		Name:      ing.Name,
		Namespace: ing.Namespace,
		Hosts:     hostsStr,
		Endpoints: endpointStr,
		ClassName: className,
		Age:       FormatAge(ing.CreationTimestamp.Time),
	}
}
