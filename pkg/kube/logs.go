package kube

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"sync"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
)

// LogStreamOptions specifies parameters for retrieving container logs from Kubernetes.
type LogStreamOptions struct {
	Namespace     string
	PodName       string
	ContainerName string
	TailLines     *int64
	Follow        bool
	Timestamps    bool
	Previous      bool
	SinceSeconds  *int64
}

type streamEntry struct {
	cancel context.CancelFunc
	closer io.Closer
}

// LogStreamManager manages active Kubernetes log stream goroutines and their cancellation tokens.
type LogStreamManager struct {
	mu            sync.RWMutex
	activeStreams map[string]*streamEntry
}

// NewLogStreamManager initializes a new LogStreamManager instance.
func NewLogStreamManager() *LogStreamManager {
	return &LogStreamManager{
		activeStreams: make(map[string]*streamEntry),
	}
}

// StartStream begins streaming container logs from client-go line-by-line in a background goroutine.
func (m *LogStreamManager) StartStream(
	ctx context.Context,
	clientset kubernetes.Interface,
	streamID string,
	opts LogStreamOptions,
	onLine func(line string),
	onEnd func(reason string),
	onError func(err error),
) error {
	if clientset == nil {
		return fmt.Errorf("kubernetes clientset is nil")
	}
	if opts.PodName == "" {
		return fmt.Errorf("podName is required")
	}
	if opts.Namespace == "" {
		return fmt.Errorf("namespace is required")
	}
	if streamID == "" {
		return fmt.Errorf("streamID is required")
	}

	tailLines := opts.TailLines
	if tailLines == nil || *tailLines <= 0 {
		defaultTail := int64(500)
		tailLines = &defaultTail
	}

	follow := opts.Follow
	if opts.Previous {
		follow = false // Previous logs cannot be followed; stream until EOF
	}

	podLogOpts := corev1.PodLogOptions{
		Follow:     follow,
		TailLines:  tailLines,
		Previous:   opts.Previous,
		Timestamps: opts.Timestamps,
	}
	if opts.ContainerName != "" {
		podLogOpts.Container = opts.ContainerName
	}
	if opts.SinceSeconds != nil && *opts.SinceSeconds > 0 {
		podLogOpts.SinceSeconds = opts.SinceSeconds
	}

	// Safely terminate any previous stream registered under the exact same streamID
	m.mu.Lock()
	if oldEntry, exists := m.activeStreams[streamID]; exists {
		oldEntry.cancel()
		if oldEntry.closer != nil {
			_ = oldEntry.closer.Close()
		}
		delete(m.activeStreams, streamID)
	}

	// Create cancellable stream context decoupled from caller request context
	streamCtx, cancel := context.WithCancel(context.Background())
	entry := &streamEntry{cancel: cancel}
	m.activeStreams[streamID] = entry
	m.mu.Unlock()

	req := clientset.CoreV1().Pods(opts.Namespace).GetLogs(opts.PodName, &podLogOpts)
	stream, err := req.Stream(streamCtx)
	if err != nil {
		m.mu.Lock()
		if current, ok := m.activeStreams[streamID]; ok && current == entry {
			delete(m.activeStreams, streamID)
		}
		m.mu.Unlock()
		cancel()
		slog.Warn("[LOGS] Failed to open log stream",
			"streamId", streamID,
			"namespace", opts.Namespace,
			"pod", opts.PodName,
			"container", opts.ContainerName,
			"previous", opts.Previous,
			"error", err,
		)
		return fmt.Errorf("failed to open log stream for pod %s/%s (container=%q): %w", opts.Namespace, opts.PodName, opts.ContainerName, err)
	}

	m.mu.Lock()
	// Ensure stream was not stopped while req.Stream was connecting
	if current, ok := m.activeStreams[streamID]; ok && current == entry {
		entry.closer = stream
	} else {
		m.mu.Unlock()
		_ = stream.Close()
		cancel()
		return fmt.Errorf("stream %q was cancelled during initialization", streamID)
	}
	m.mu.Unlock()

	slog.Info("[LOGS] Started log stream session", "streamId", streamID, "pod", opts.PodName, "container", opts.ContainerName, "previous", opts.Previous)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Error("[LOGS] Panic recovered in log stream reader", "streamId", streamID, "panic", r)
			}
		}()
		defer stream.Close()
		defer func() {
			m.mu.Lock()
			if current, ok := m.activeStreams[streamID]; ok && current == entry {
				delete(m.activeStreams, streamID)
			}
			m.mu.Unlock()
			cancel()
		}()

		scanner := bufio.NewScanner(stream)
		// Set initial buffer to 64KB and max token size to 1MB to accommodate long JSON log payloads
		buf := make([]byte, 64*1024)
		scanner.Buffer(buf, 1024*1024)

		for scanner.Scan() {
			select {
			case <-streamCtx.Done():
				slog.Debug("[LOGS] Stream context cancelled", "streamId", streamID)
				if onEnd != nil {
					onEnd("context_cancelled")
				}
				return
			default:
			}

			line := scanner.Text()
			if onLine != nil {
				onLine(line)
			}
		}

		if scanErr := scanner.Err(); scanErr != nil && streamCtx.Err() == nil && scanErr != io.EOF {
			slog.Warn("[LOGS] Stream scanner encountered error", "streamId", streamID, "error", scanErr)
			if onError != nil {
				onError(scanErr)
			}
		}

		if onEnd != nil {
			onEnd("eof")
		}
		slog.Debug("[LOGS] Stream session concluded", "streamId", streamID)
	}()

	return nil
}

// StopStream cancels the context for an active log stream and releases resources.
// It is idempotent: if the stream has already finished, concluded, or does not exist,
// it logs at debug level and returns nil without error.
func (m *LogStreamManager) StopStream(streamID string) error {
	m.mu.Lock()
	entry, exists := m.activeStreams[streamID]
	if exists {
		delete(m.activeStreams, streamID)
	}
	m.mu.Unlock()

	if !exists {
		slog.Debug("StopLogStream called on inactive or concluded stream", "streamId", streamID)
		return nil
	}

	entry.cancel()
	if entry.closer != nil {
		_ = entry.closer.Close()
	}
	slog.Info("[LOGS] Stopped log stream session", "streamId", streamID)
	return nil
}

// StopAll cancels and closes all active log streams immediately.
func (m *LogStreamManager) StopAll() {
	m.mu.Lock()
	entries := make([]*streamEntry, 0, len(m.activeStreams))
	for id, entry := range m.activeStreams {
		entries = append(entries, entry)
		delete(m.activeStreams, id)
	}
	m.mu.Unlock()

	for _, entry := range entries {
		entry.cancel()
		if entry.closer != nil {
			_ = entry.closer.Close()
		}
	}
	slog.Info("[LOGS] Stopped all active log stream sessions", "count", len(entries))
}

// ActiveStreamCount returns the count of ongoing log streaming sessions.
func (m *LogStreamManager) ActiveStreamCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.activeStreams)
}

// HasStream checks if a stream session is currently active.
func (m *LogStreamManager) HasStream(streamID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, exists := m.activeStreams[streamID]
	return exists
}
