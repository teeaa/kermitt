package kube

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/remotecommand"
)

// terminalSizeQueue implements remotecommand.TerminalSizeQueue to dynamically
// transmit PTY dimension resize events from xterm.js to client-go SPDY stream.
type terminalSizeQueue struct {
	sizeChan chan *remotecommand.TerminalSize
}

func newTerminalSizeQueue() *terminalSizeQueue {
	return &terminalSizeQueue{
		sizeChan: make(chan *remotecommand.TerminalSize, 16),
	}
}

// Next blocks until a new terminal size is pushed, or returns nil when closed.
func (q *terminalSizeQueue) Next() *remotecommand.TerminalSize {
	size, ok := <-q.sizeChan
	if !ok {
		return nil
	}
	return size
}

// resize pushes new columns and rows dimensions.
func (q *terminalSizeQueue) resize(cols, rows uint16) {
	if cols == 0 || rows == 0 {
		return
	}
	size := &remotecommand.TerminalSize{Width: cols, Height: rows}
	select {
	case q.sizeChan <- size:
	default:
		// Drain older size if queue is full, then push the newest dimensions
		select {
		case <-q.sizeChan:
		default:
		}
		q.sizeChan <- size
	}
}

// chunkWriter routes raw stdout/stderr bytes directly to an event callback.
type chunkWriter struct {
	onChunk func(data []byte)
}

func (w *chunkWriter) Write(p []byte) (n int, err error) {
	if len(p) > 0 && w.onChunk != nil {
		cp := make([]byte, len(p))
		copy(cp, p)
		w.onChunk(cp)
	}
	return len(p), nil
}

// ExecSession tracks the active state of an interactive PTY session.
type ExecSession struct {
	sessionID   string
	namespace   string
	podName     string
	container   string
	stdinWriter io.WriteCloser
	sizeQueue   *terminalSizeQueue
	ctx         context.Context
	cancel      context.CancelFunc
	closed      atomic.Bool
}

// ExecSessionManager orchestrates concurrent interactive Pod Exec sessions in a thread-safe manner.
type ExecSessionManager struct {
	mu       sync.RWMutex
	sessions map[string]*ExecSession
}

// NewExecSessionManager initializes an ExecSessionManager instance.
func NewExecSessionManager() *ExecSessionManager {
	return &ExecSessionManager{
		sessions: make(map[string]*ExecSession),
	}
}

// StartSession initiates an interactive PTY shell session via client-go SPDY executor.
func (m *ExecSessionManager) StartSession(
	ctx context.Context,
	namespace string,
	podName string,
	containerName string,
	command []string,
	cols uint16,
	rows uint16,
	clientset kubernetes.Interface,
	restConfig *rest.Config,
	onStdout func(sessionID string, chunk string),
	onExit func(sessionID string, exitCode int, err error),
) (string, error) {
	if clientset == nil {
		return "", fmt.Errorf("kubernetes clientset is nil")
	}
	if restConfig == nil {
		return "", fmt.Errorf("kubernetes rest.Config is nil")
	}
	if namespace == "" {
		return "", fmt.Errorf("namespace is required")
	}
	if podName == "" {
		return "", fmt.Errorf("podName is required")
	}

	// Auto-resolve first container if not explicitly specified
	if containerName == "" {
		pod, err := clientset.CoreV1().Pods(namespace).Get(ctx, podName, metav1.GetOptions{})
		if err == nil && len(pod.Spec.Containers) > 0 {
			containerName = pod.Spec.Containers[0].Name
		}
	}

	sessionID := fmt.Sprintf("exec-%d-%s", time.Now().UnixNano(), podName)

	stdinReader, stdinWriter := io.Pipe()
	sizeQueue := newTerminalSizeQueue()
	if cols > 0 && rows > 0 {
		sizeQueue.resize(cols, rows)
	}

	sessionCtx, cancel := context.WithCancel(context.Background())

	session := &ExecSession{
		sessionID:   sessionID,
		namespace:   namespace,
		podName:     podName,
		container:   containerName,
		stdinWriter: stdinWriter,
		sizeQueue:   sizeQueue,
		ctx:         sessionCtx,
		cancel:      cancel,
	}

	m.mu.Lock()
	m.sessions[sessionID] = session
	m.mu.Unlock()

	slog.Info("Starting pod exec session",
		"sessionID", sessionID,
		"pod", podName,
		"namespace", namespace,
		"container", containerName,
	)

	// Launch background SPDY streaming executor
	go func() {
		defer func() {
			_ = m.StopSession(sessionID)
		}()

		// Copy rest.Config and zero out timeout for long-lived interactive terminal stream
		streamConfig := rest.CopyConfig(restConfig)
		streamConfig.Timeout = 0

		commandsToTry := [][]string{
			{"/bin/bash"},
			{"/bin/sh"},
		}
		if len(command) > 0 {
			commandsToTry = [][]string{command}
		}

		var finalErr error
		var finalExitCode int

		for i, cmd := range commandsToTry {
			if sessionCtx.Err() != nil {
				return
			}

			slog.Debug("Executing shell command attempt",
				"sessionID", sessionID,
				"command", cmd,
				"attempt", i+1,
			)

			req := clientset.CoreV1().RESTClient().Post().
				Resource("pods").
				Namespace(namespace).
				Name(podName).
				SubResource("exec").
				VersionedParams(&corev1.PodExecOptions{
					Container: containerName,
					Command:   cmd,
					Stdin:     true,
					Stdout:    true,
					Stderr:    true,
					TTY:       true,
				}, scheme.ParameterCodec)

			executor, err := remotecommand.NewSPDYExecutor(streamConfig, "POST", req.URL())
			if err != nil {
				slog.Warn("Failed to create SPDY executor", "error", err, "command", cmd)
				finalErr = err
				continue
			}

			var bytesReceived atomic.Int64
			stdoutWriter := &chunkWriter{
				onChunk: func(chunk []byte) {
					bytesReceived.Add(int64(len(chunk)))
					if onStdout != nil {
						onStdout(sessionID, string(chunk))
					}
				},
			}

			streamStart := time.Now()
			streamErr := executor.StreamWithContext(sessionCtx, remotecommand.StreamOptions{
				Stdin:             stdinReader,
				Stdout:            stdoutWriter,
				Stderr:            stdoutWriter,
				Tty:               true,
				TerminalSizeQueue: sizeQueue,
			})

			duration := time.Since(streamStart)

			// Determine if execution failed due to missing binary / exit status 127/126
			isMissingBinary := false
			if streamErr != nil {
				errStr := strings.ToLower(streamErr.Error())
				isExit127 := false
				if exitErr, ok := streamErr.(interface{ ExitStatus() int }); ok && (exitErr.ExitStatus() == 127 || exitErr.ExitStatus() == 126) {
					isExit127 = true
				}

				if strings.Contains(errStr, "not found") ||
					strings.Contains(errStr, "stat") ||
					strings.Contains(errStr, "executable") ||
					strings.Contains(errStr, "no such file") ||
					strings.Contains(errStr, "exit code 126") ||
					strings.Contains(errStr, "exit code 127") ||
					strings.Contains(errStr, "exit status 126") ||
					strings.Contains(errStr, "exit status 127") ||
					isExit127 ||
					(duration < 1500*time.Millisecond && bytesReceived.Load() == 0) {
					isMissingBinary = true
				}
			}

			if isMissingBinary && i < len(commandsToTry)-1 {
				slog.Info("Exec attempt failed, falling back to next shell",
					"sessionID", sessionID,
					"failedCmd", cmd,
					"nextCmd", commandsToTry[i+1],
					"error", streamErr,
				)
				// Re-create stdin pipe for clean fallback attempt
				_ = stdinWriter.Close()
				stdinReader, stdinWriter = io.Pipe()
				m.mu.Lock()
				if curr, ok := m.sessions[sessionID]; ok {
					curr.stdinWriter = stdinWriter
				}
				m.mu.Unlock()
				continue
			}

			if isMissingBinary && len(commandsToTry) > 1 && i == len(commandsToTry)-1 {
				// All fallback shells failed (distroless or scratch container)
				slog.Warn("No compatible shell found in container",
					"sessionID", sessionID,
					"pod", podName,
					"container", containerName,
					"error", streamErr,
				)
				if onStdout != nil {
					onStdout(sessionID,
						"\r\n\x1b[31m[EXEC ERROR] No compatible shell (/bin/bash, /bin/sh) found in container '"+containerName+"'.\x1b[0m\r\n"+
							"\x1b[33mNote: Distroless or scratch-based images (such as etcd) do not include shell binaries.\x1b[0m\r\n")
				}
				finalExitCode = 127
				finalErr = fmt.Errorf("no compatible shell (/bin/bash, /bin/sh) found in container %s", containerName)
				break
			}

			finalErr = streamErr
			if streamErr != nil {
				if exitErr, ok := streamErr.(interface{ ExitStatus() int }); ok {
					finalExitCode = exitErr.ExitStatus()
				} else {
					finalExitCode = 1
				}
			} else {
				finalExitCode = 0
			}
			break
		}

		slog.Info("Pod exec session terminated",
			"sessionID", sessionID,
			"exitCode", finalExitCode,
			"error", finalErr,
		)

		if onExit != nil {
			onExit(sessionID, finalExitCode, finalErr)
		}
	}()

	return sessionID, nil
}

// Write transmits keystrokes or data from the UI directly into the remote stdin pipe.
func (m *ExecSessionManager) Write(sessionID string, data string) error {
	m.mu.RLock()
	session, exists := m.sessions[sessionID]
	m.mu.RUnlock()

	if !exists || session == nil {
		return fmt.Errorf("exec session %q not found", sessionID)
	}
	if session.closed.Load() {
		return fmt.Errorf("exec session %q is closed", sessionID)
	}

	if session.stdinWriter == nil {
		return fmt.Errorf("exec session %q has no stdin writer", sessionID)
	}

	_, err := session.stdinWriter.Write([]byte(data))
	return err
}

// Resize pushes new columns and rows dimensions to the active terminal size queue.
func (m *ExecSessionManager) Resize(sessionID string, cols, rows uint16) error {
	m.mu.RLock()
	session, exists := m.sessions[sessionID]
	m.mu.RUnlock()

	if !exists || session == nil {
		return fmt.Errorf("exec session %q not found", sessionID)
	}
	if session.closed.Load() {
		return nil
	}

	session.sizeQueue.resize(cols, rows)
	return nil
}

// StopSession closes an active exec session by its sessionID.
func (m *ExecSessionManager) StopSession(sessionID string) error {
	m.mu.Lock()
	session, exists := m.sessions[sessionID]
	delete(m.sessions, sessionID)
	m.mu.Unlock()

	if !exists || session == nil {
		return nil // Idempotent termination
	}

	if session.closed.CompareAndSwap(false, true) {
		if session.cancel != nil {
			session.cancel()
		}
		if session.stdinWriter != nil {
			_ = session.stdinWriter.Close()
		}
	}
	return nil
}

// StopAll terminates all running exec sessions and frees active resources.
func (m *ExecSessionManager) StopAll() {
	m.mu.Lock()
	sessions := make([]*ExecSession, 0, len(m.sessions))
	for _, s := range m.sessions {
		sessions = append(sessions, s)
	}
	m.sessions = make(map[string]*ExecSession)
	m.mu.Unlock()

	for _, s := range sessions {
		if s.closed.CompareAndSwap(false, true) {
			if s.cancel != nil {
				s.cancel()
			}
			if s.stdinWriter != nil {
				_ = s.stdinWriter.Close()
			}
		}
	}
}
