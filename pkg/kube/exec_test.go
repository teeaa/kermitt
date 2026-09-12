package kube

import (
	"context"
	"fmt"
	"sync"
	"testing"
)

func TestTerminalSizeQueue_Resize(t *testing.T) {
	q := newTerminalSizeQueue()

	q.resize(80, 24)
	size := q.Next()
	if size == nil {
		t.Fatal("expected non-nil terminal size")
	}
	if size.Width != 80 || size.Height != 24 {
		t.Fatalf("expected 80x24, got %dx%d", size.Width, size.Height)
	}

	// Zero dimensions should be ignored
	q.resize(0, 0)
	select {
	case <-q.sizeChan:
		t.Fatal("expected zero dimensions to be ignored")
	default:
	}
}

func TestExecSessionManager_Validation(t *testing.T) {
	mgr := NewExecSessionManager()
	ctx := context.Background()

	// Missing clientset
	_, err := mgr.StartSession(ctx, "default", "pod-1", "c-1", nil, 80, 24, nil, nil, nil, nil)
	if err == nil {
		t.Fatal("expected error with nil clientset")
	}
}

func TestExecSessionManager_LifecycleAndConcurrency(t *testing.T) {
	mgr := NewExecSessionManager()

	// Stop non-existent session should be idempotent
	if err := mgr.StopSession("non-existent"); err != nil {
		t.Fatalf("expected nil error stopping nonexistent session, got %v", err)
	}

	// Write to non-existent session
	if err := mgr.Write("non-existent", "ls\n"); err == nil {
		t.Fatal("expected error writing to non-existent session")
	}

	// Resize non-existent session
	if err := mgr.Resize("non-existent", 100, 40); err == nil {
		t.Fatal("expected error resizing non-existent session")
	}

	// Concurrent StopSession and StopAll
	const numGoroutines = 30
	var wg sync.WaitGroup
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		sessionID := fmt.Sprintf("session-%d", i)
		go func(id string) {
			defer wg.Done()
			_ = mgr.StopSession(id)
			_ = mgr.Write(id, "data")
			_ = mgr.Resize(id, 80, 24)
		}(sessionID)
	}
	wg.Wait()

	mgr.StopAll()
}

func TestExecSessionManager_WriteAndResizeClosed(t *testing.T) {
	mgr := NewExecSessionManager()
	sessionID := "test-session-1"

	mgr.mu.Lock()
	sessionCtx, cancel := context.WithCancel(context.Background())
	mgr.sessions[sessionID] = &ExecSession{
		sessionID: sessionID,
		sizeQueue: newTerminalSizeQueue(),
		ctx:       sessionCtx,
		cancel:    cancel,
	}
	mgr.mu.Unlock()

	// Resize active
	if err := mgr.Resize(sessionID, 120, 30); err != nil {
		t.Fatalf("expected resize to succeed, got %v", err)
	}

	// Stop session
	if err := mgr.StopSession(sessionID); err != nil {
		t.Fatalf("expected stop to succeed, got %v", err)
	}

	// Write after stop should return error
	if err := mgr.Write(sessionID, "test"); err == nil {
		t.Fatal("expected write to return error on closed session")
	}
}
