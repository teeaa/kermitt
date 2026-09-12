package kube

import (
	"log/slog"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
)

// ResourceChangeEvent represents a lightweight event emitted when a Kubernetes resource changes.
type ResourceChangeEvent struct {
	ResourceType string `json:"resourceType"` // e.g. "pod", "namespace"
	Action       string `json:"action"`       // "add", "update", "delete"
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Phase        string `json:"phase,omitempty"`
}

// InformerManager manages client-go SharedInformerFactory, registers event handlers
// for real-time resource synchronization, and dispatches debounced cluster refresh events.
type InformerManager struct {
	mu        sync.Mutex
	clientset kubernetes.Interface
	emitter   func(eventName string, optionalData ...interface{})
	stopCh    chan struct{}
	refreshCh chan struct{}
	running   bool
}

// NewInformerManager creates a new InformerManager.
func NewInformerManager(clientset kubernetes.Interface, emitter func(eventName string, optionalData ...interface{})) *InformerManager {
	return &InformerManager{
		clientset: clientset,
		emitter:   emitter,
	}
}

// Start initializes informers for pods and namespaces, launching background watch goroutines
// and the throttled cluster refresh debouncer.
func (im *InformerManager) Start() {
	im.mu.Lock()
	defer im.mu.Unlock()

	if im.running {
		return
	}
	if im.clientset == nil {
		slog.Debug("[INFORMER] Cannot start InformerManager: clientset is nil")
		return
	}

	im.stopCh = make(chan struct{})
	im.refreshCh = make(chan struct{}, 1)
	im.running = true

	factory := informers.NewSharedInformerFactory(im.clientset, 30*time.Second)

	// 1. Pod Informer
	podInformer := factory.Core().V1().Pods().Informer()
	_, _ = podInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			pod, ok := obj.(*corev1.Pod)
			if !ok || pod == nil {
				return
			}
			im.emitResourceChange(ResourceChangeEvent{
				ResourceType: "pod",
				Action:       "add",
				Name:         pod.Name,
				Namespace:    pod.Namespace,
				Phase:        string(pod.Status.Phase),
			})
			im.scheduleRefresh()
		},
		UpdateFunc: func(oldObj, newObj interface{}) {
			oldPod, okOld := oldObj.(*corev1.Pod)
			newPod, okNew := newObj.(*corev1.Pod)
			if !okOld || !okNew || oldPod == nil || newPod == nil {
				return
			}
			// Only emit if meaningful state changed (ResourceVersion, Phase, or DeletionTimestamp)
			if oldPod.ResourceVersion != newPod.ResourceVersion ||
				oldPod.Status.Phase != newPod.Status.Phase ||
				(oldPod.DeletionTimestamp == nil && newPod.DeletionTimestamp != nil) {
				phase := string(newPod.Status.Phase)
				if newPod.DeletionTimestamp != nil {
					phase = "Terminating"
				}
				im.emitResourceChange(ResourceChangeEvent{
					ResourceType: "pod",
					Action:       "update",
					Name:         newPod.Name,
					Namespace:    newPod.Namespace,
					Phase:        phase,
				})
				im.scheduleRefresh()
			}
		},
		DeleteFunc: func(obj interface{}) {
			var pod *corev1.Pod
			switch t := obj.(type) {
			case *corev1.Pod:
				pod = t
			case cache.DeletedFinalStateUnknown:
				if p, ok := t.Obj.(*corev1.Pod); ok {
					pod = p
				}
			}
			if pod == nil {
				return
			}
			im.emitResourceChange(ResourceChangeEvent{
				ResourceType: "pod",
				Action:       "delete",
				Name:         pod.Name,
				Namespace:    pod.Namespace,
				Phase:        "Terminated",
			})
			im.scheduleRefresh()
		},
	})

	// 2. Namespace Informer
	nsInformer := factory.Core().V1().Namespaces().Informer()
	_, _ = nsInformer.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc: func(obj interface{}) {
			ns, ok := obj.(*corev1.Namespace)
			if !ok || ns == nil {
				return
			}
			im.emitResourceChange(ResourceChangeEvent{
				ResourceType: "namespace",
				Action:       "add",
				Name:         ns.Name,
				Namespace:    "",
			})
			im.scheduleRefresh()
		},
		DeleteFunc: func(obj interface{}) {
			var ns *corev1.Namespace
			switch t := obj.(type) {
			case *corev1.Namespace:
				ns = t
			case cache.DeletedFinalStateUnknown:
				if n, ok := t.Obj.(*corev1.Namespace); ok {
					ns = n
				}
			}
			if ns == nil {
				return
			}
			im.emitResourceChange(ResourceChangeEvent{
				ResourceType: "namespace",
				Action:       "delete",
				Name:         ns.Name,
				Namespace:    "",
			})
			im.scheduleRefresh()
		},
	})

	// Start informers
	factory.Start(im.stopCh)

	// Start 500ms debouncing loop for cluster refresh events
	go im.debounceLoop(im.stopCh, im.refreshCh)

	slog.Info("[INFORMER] Started SharedInformerFactory for active cluster")
}

// Stop terminates all running informers and cleanup channels.
func (im *InformerManager) Stop() {
	im.mu.Lock()
	defer im.mu.Unlock()

	if !im.running {
		return
	}

	im.running = false
	if im.stopCh != nil {
		close(im.stopCh)
		im.stopCh = nil
	}
	slog.Info("[INFORMER] Stopped SharedInformerFactory")
}

// UpdateClientset swaps the clientset, restarting informers if currently running.
func (im *InformerManager) UpdateClientset(newClientset kubernetes.Interface) {
	im.Stop()
	im.mu.Lock()
	im.clientset = newClientset
	im.mu.Unlock()
	if newClientset != nil {
		im.Start()
	}
}

func (im *InformerManager) emitResourceChange(event ResourceChangeEvent) {
	if im.emitter != nil {
		im.emitter("k8s:resource:changed", event)
	}
}

func (im *InformerManager) scheduleRefresh() {
	im.mu.Lock()
	ch := im.refreshCh
	running := im.running
	im.mu.Unlock()

	if !running || ch == nil {
		return
	}

	select {
	case ch <- struct{}{}:
	default:
	}
}

func (im *InformerManager) debounceLoop(stopCh <-chan struct{}, refreshCh <-chan struct{}) {
	var timer *time.Timer
	for {
		select {
		case <-stopCh:
			if timer != nil {
				timer.Stop()
			}
			return
		case <-refreshCh:
			if timer != nil {
				timer.Stop()
			}
			timer = time.NewTimer(500 * time.Millisecond)
			select {
			case <-stopCh:
				timer.Stop()
				return
			case <-timer.C:
				if im.emitter != nil {
					im.emitter("k8s:cluster:refresh", nil)
				}
			}
		}
	}
}
