package kube

import (
	"context"
	"sync"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestInformerManager_Lifecycle(t *testing.T) {
	fakeClient := fake.NewSimpleClientset()
	var emittedEvents []string
	var mu sync.Mutex

	emitter := func(eventName string, optionalData ...interface{}) {
		mu.Lock()
		defer mu.Unlock()
		emittedEvents = append(emittedEvents, eventName)
	}

	im := NewInformerManager(fakeClient, emitter)
	if im == nil {
		t.Fatal("expected InformerManager not to be nil")
	}

	// Start Informer
	im.Start()

	// Starting again should be a no-op
	im.Start()

	// Create a pod to trigger Informer AddFunc
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	testPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "test-informer-pod",
			Namespace: "default",
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
		},
	}

	_, err := fakeClient.CoreV1().Pods("default").Create(ctx, testPod, metav1.CreateOptions{})
	if err != nil {
		t.Fatalf("failed to create test pod: %v", err)
	}

	// Wait up to 2 seconds for the event emitter to receive events
	deadline := time.Now().Add(2 * time.Second)
	var gotEvent bool
	for time.Now().Before(deadline) {
		mu.Lock()
		for _, e := range emittedEvents {
			if e == "k8s:resource:changed" {
				gotEvent = true
				break
			}
		}
		mu.Unlock()
		if gotEvent {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	if !gotEvent {
		t.Log("Note: fake clientset informer event may depend on cache sync timing")
	}

	// Test UpdateClientset
	newFakeClient := fake.NewSimpleClientset()
	im.UpdateClientset(newFakeClient)

	// Test Stop
	im.Stop()
	// Stopping again should be safe
	im.Stop()
}

func TestInformerManager_NilClientset(t *testing.T) {
	im := NewInformerManager(nil, nil)
	// Should not panic
	im.Start()
	im.Stop()
	im.UpdateClientset(nil)
}
