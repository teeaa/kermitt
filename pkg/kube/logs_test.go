package kube

import (
	"fmt"
	"sync"
	"testing"
)

func TestLogStreamManager_Lifecycle(t *testing.T) {
	mgr := NewLogStreamManager()

	if count := mgr.ActiveStreamCount(); count != 0 {
		t.Fatalf("expected 0 active streams, got %d", count)
	}

	// Verify StopStream is idempotent and returns nil for nonexistent stream
	if err := mgr.StopStream("nonexistent"); err != nil {
		t.Fatalf("expected nil error stopping nonexistent stream, got %v", err)
	}

	if mgr.HasStream("test-stream") {
		t.Fatal("expected HasStream to return false")
	}
}

func TestLogStreamManager_ConcurrentSafety(t *testing.T) {
	mgr := NewLogStreamManager()

	const numGoroutines = 50
	var wg sync.WaitGroup

	// Concurrently test HasStream, ActiveStreamCount, and StopStream
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		streamID := fmt.Sprintf("stream-%d", i)
		go func(id string) {
			defer wg.Done()
			_ = mgr.HasStream(id)
			_ = mgr.ActiveStreamCount()
			_ = mgr.StopStream(id)
		}(streamID)
	}

	wg.Wait()
	mgr.StopAll()

	if count := mgr.ActiveStreamCount(); count != 0 {
		t.Fatalf("expected 0 active streams after StopAll, got %d", count)
	}
}
