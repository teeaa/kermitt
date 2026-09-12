package logger

import (
	"context"
	"io"
	"log/slog"
	"os"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// RingBuffer is a thread-safe circular buffer that stores up to a fixed capacity of log lines.
type RingBuffer struct {
	mu       sync.RWMutex
	capacity int
	entries  []string
	start    int
	size     int
}

// NewRingBuffer initializes a new RingBuffer with the given maximum capacity.
func NewRingBuffer(capacity int) *RingBuffer {
	if capacity <= 0 {
		capacity = 1000
	}
	return &RingBuffer{
		capacity: capacity,
		entries:  make([]string, capacity),
	}
}

// Add appends a new line to the ring buffer, overwriting the oldest entry if capacity is reached.
func (r *RingBuffer) Add(line string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.size < r.capacity {
		r.entries[r.size] = line
		r.size++
	} else {
		r.entries[r.start] = line
		r.start = (r.start + 1) % r.capacity
	}
}

// GetAll returns a slice of all stored log lines in chronological order.
func (r *RingBuffer) GetAll() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	result := make([]string, r.size)
	if r.size < r.capacity {
		copy(result, r.entries[:r.size])
	} else {
		firstPart := r.capacity - r.start
		copy(result[:firstPart], r.entries[r.start:])
		copy(result[firstPart:], r.entries[:r.start])
	}
	return result
}

// Clear removes all stored log lines from the buffer.
func (r *RingBuffer) Clear() {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.entries = make([]string, r.capacity)
	r.start = 0
	r.size = 0
}

// Len returns the current count of stored entries.
func (r *RingBuffer) Len() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.size
}

// BroadcastWriter is an io.Writer that writes to a destination (e.g. os.Stdout),
// stores lines into an in-memory RingBuffer, and emits real-time events via Wails runtime.
type BroadcastWriter struct {
	out      io.Writer
	buffer   *RingBuffer
	appCtxMu sync.RWMutex
	appCtx   context.Context
}

// NewBroadcastWriter creates a new BroadcastWriter.
func NewBroadcastWriter(out io.Writer, buffer *RingBuffer) *BroadcastWriter {
	if out == nil {
		out = os.Stdout
	}
	if buffer == nil {
		buffer = NewRingBuffer(1000)
	}
	return &BroadcastWriter{
		out:    out,
		buffer: buffer,
	}
}

// SetContext sets the active Wails application context used for event emission.
func (w *BroadcastWriter) SetContext(ctx context.Context) {
	w.appCtxMu.Lock()
	defer w.appCtxMu.Unlock()
	w.appCtx = ctx
}

// Write writes to the underlying writer, appends to the ring buffer, and emits a Wails event.
func (w *BroadcastWriter) Write(p []byte) (n int, err error) {
	if w.out != nil {
		n, err = w.out.Write(p)
	} else {
		n = len(p)
	}

	line := strings.TrimRight(string(p), "\r\n")
	if line != "" {
		w.buffer.Add(line)

		w.appCtxMu.RLock()
		ctx := w.appCtx
		w.appCtxMu.RUnlock()

		if ctx != nil {
			runtime.EventsEmit(ctx, "app:log:entry", line)
		}
	}

	return n, err
}

var (
	defaultBuffer = NewRingBuffer(1000)
	defaultWriter = NewBroadcastWriter(os.Stdout, defaultBuffer)
)

// SetWailsContext registers the Wails application context with the default BroadcastWriter.
func SetWailsContext(ctx context.Context) {
	defaultWriter.SetContext(ctx)
}

// GetLogs returns all log entries currently stored in the default application buffer.
func GetLogs() []string {
	return defaultBuffer.GetAll()
}

// ClearLogs empties the default application buffer.
func ClearLogs() {
	defaultBuffer.Clear()
}

// InitDefaultLogger configures log/slog with a TextHandler writing to the default BroadcastWriter
// at LevelDebug, setting it as the global slog default logger and returning it.
func InitDefaultLogger() *slog.Logger {
	logger := slog.New(slog.NewTextHandler(defaultWriter, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))
	slog.SetDefault(logger)
	return logger
}
