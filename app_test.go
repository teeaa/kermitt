package main

import (
	"testing"
)

func TestGetAppVersion(t *testing.T) {
	app := NewApp()
	v := app.GetAppVersion()
	if v == "" {
		t.Fatal("expected non-empty version string")
	}
	if v != version {
		t.Fatalf("expected version %q, got %q", version, v)
	}

	// Test overridden version
	originalVersion := version
	defer func() { version = originalVersion }()

	version = "v1.2.3"
	if got := app.GetAppVersion(); got != "v1.2.3" {
		t.Fatalf("expected overridden version 'v1.2.3', got %q", got)
	}
}
