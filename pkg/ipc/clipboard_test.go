package ipc

import (
	"context"
	"testing"
)

func TestKubeBridge_CopyToClipboard_NoContext(t *testing.T) {
	bridge := NewKubeBridge(nil)
	err := bridge.CopyToClipboard("hello world")
	if err == nil {
		t.Fatalf("expected error when context is not initialized, got nil")
	}

	appErr, ok := err.(*AppError)
	if !ok {
		t.Fatalf("expected *AppError envelope, got %T", err)
	}
	if appErr.Code != ErrCodeInternalError {
		t.Errorf("expected error code %s, got %s", ErrCodeInternalError, appErr.Code)
	}
}

func TestKubeBridge_CopyToClipboard_InvalidContext(t *testing.T) {
	bridge := NewKubeBridge(nil)
	// Passing a standard context without Wails "frontend" lifecycle key
	ctx := context.Background()
	SetWailsContext(bridge, ctx)

	err := bridge.CopyToClipboard("test log line")
	if err == nil {
		t.Fatalf("expected error when context lacks Wails frontend, got nil")
	}

	appErr, ok := err.(*AppError)
	if !ok {
		t.Fatalf("expected *AppError envelope, got %T", err)
	}
	if appErr.Code != ErrCodeInternalError {
		t.Errorf("expected error code %s, got %s", ErrCodeInternalError, appErr.Code)
	}
}
