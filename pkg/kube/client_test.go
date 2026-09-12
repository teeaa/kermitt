package kube

import (
	"sync"
	"testing"
)

func TestNewClientManager(t *testing.T) {
	cm, err := NewClientManager()
	if err != nil {
		t.Fatalf("expected NewClientManager not to fail critically: %v", err)
	}
	if cm == nil {
		t.Fatal("expected ClientManager not to be nil")
	}

	// Test default namespace resolution
	ns := cm.GetCurrentNamespace()
	if ns == "" {
		t.Errorf("expected non-empty default namespace, got empty")
	}

	// Test switching to non-existent context
	err = cm.SwitchContext("non-existent-test-context-xyz-999")
	if err == nil {
		t.Errorf("expected error when switching to invalid context, got nil")
	}
}

func TestClientManager_ConcurrentAccess(t *testing.T) {
	cm, err := NewClientManager()
	if err != nil {
		t.Fatalf("failed to create client manager: %v", err)
	}

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_ = cm.GetCurrentContext()
			_ = cm.GetCurrentNamespace()
			_, _ = cm.GetRawConfig()
			_, _ = cm.GetClientset()
		}()
	}
	wg.Wait()
}

func TestClientManager_ActiveNamespace(t *testing.T) {
	cm, err := NewClientManager()
	if err != nil {
		t.Fatalf("failed to create client manager: %v", err)
	}

	cm.SetActiveNamespace("custom-ns")
	if cm.GetActiveNamespace() != "custom-ns" {
		t.Errorf("expected custom-ns, got %s", cm.GetActiveNamespace())
	}
}
