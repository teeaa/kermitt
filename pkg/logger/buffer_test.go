package logger

import (
	"bytes"
	"fmt"
	"log/slog"
	"sync"
	"testing"
)

func TestRingBuffer_BasicAndCapacity(t *testing.T) {
	buf := NewRingBuffer(3)

	if buf.Len() != 0 {
		t.Fatalf("expected initial len 0, got %d", buf.Len())
	}

	buf.Add("line 1")
	buf.Add("line 2")

	logs := buf.GetAll()
	if len(logs) != 2 {
		t.Fatalf("expected 2 logs, got %d", len(logs))
	}
	if logs[0] != "line 1" || logs[1] != "line 2" {
		t.Fatalf("unexpected logs: %v", logs)
	}

	buf.Add("line 3")
	logs = buf.GetAll()
	if len(logs) != 3 || logs[0] != "line 1" || logs[2] != "line 3" {
		t.Fatalf("unexpected logs after 3 adds: %v", logs)
	}

	// Adding 4th line should drop "line 1"
	buf.Add("line 4")
	logs = buf.GetAll()
	if len(logs) != 3 {
		t.Fatalf("expected 3 logs, got %d", len(logs))
	}
	if logs[0] != "line 2" || logs[1] != "line 3" || logs[2] != "line 4" {
		t.Fatalf("expected [line 2, line 3, line 4], got %v", logs)
	}

	// Adding 5th line should drop "line 2"
	buf.Add("line 5")
	logs = buf.GetAll()
	if len(logs) != 3 || logs[0] != "line 3" || logs[1] != "line 4" || logs[2] != "line 5" {
		t.Fatalf("expected [line 3, line 4, line 5], got %v", logs)
	}

	buf.Clear()
	if buf.Len() != 0 {
		t.Fatalf("expected len 0 after Clear, got %d", buf.Len())
	}
	if len(buf.GetAll()) != 0 {
		t.Fatalf("expected 0 entries after Clear, got %d", len(buf.GetAll()))
	}
}

func TestRingBuffer_ConcurrentSafety(t *testing.T) {
	buf := NewRingBuffer(100)
	const numGoroutines = 20
	const itemsPerGoroutine = 50

	var wg sync.WaitGroup
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(gID int) {
			defer wg.Done()
			for j := 0; j < itemsPerGoroutine; j++ {
				buf.Add(fmt.Sprintf("g%d-item%d", gID, j))
				_ = buf.Len()
				_ = buf.GetAll()
			}
		}(i)
	}

	wg.Wait()

	if buf.Len() != 100 {
		t.Fatalf("expected buffer len 100, got %d", buf.Len())
	}
	if len(buf.GetAll()) != 100 {
		t.Fatalf("expected 100 logs from GetAll, got %d", len(buf.GetAll()))
	}
}

func TestBroadcastWriter_IntegrationWithSlog(t *testing.T) {
	out := &bytes.Buffer{}
	buf := NewRingBuffer(10)
	writer := NewBroadcastWriter(out, buf)

	testLogger := slog.New(slog.NewTextHandler(writer, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	testLogger.Info("Test info message", "key", "val")
	testLogger.Error("Test error message", "code", 500)

	// Verify written to underlying writer
	outStr := out.String()
	if !bytes.Contains(out.Bytes(), []byte("Test info message")) {
		t.Fatalf("expected stdout to contain info message, got %q", outStr)
	}
	if !bytes.Contains(out.Bytes(), []byte("Test error message")) {
		t.Fatalf("expected stdout to contain error message, got %q", outStr)
	}

	// Verify recorded in RingBuffer
	logs := buf.GetAll()
	if len(logs) != 2 {
		t.Fatalf("expected 2 buffer entries, got %d", len(logs))
	}
	if logs[0] == "" || logs[1] == "" {
		t.Fatalf("expected non-empty log entries, got %v", logs)
	}
}
