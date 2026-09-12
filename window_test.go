package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWindowSizePersistence(t *testing.T) {
	// Test load with defaults when file doesn't exist or custom path
	tmpDir, err := os.MkdirTemp("", "kermitt-window-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Test default fallback
	w, h := loadWindowSize(1350, 850)
	if w < 800 || h < 600 {
		t.Errorf("expected loaded window size to be at least 800x600, got %dx%d", w, h)
	}

	// Test saving valid size
	saveWindowSize(1400, 900)
	wSaved, hSaved := loadWindowSize(1350, 850)
	if wSaved != 1400 || hSaved != 900 {
		t.Errorf("expected loaded size 1400x900, got %dx%d", wSaved, hSaved)
	}

	// Test saving too-small size (should be ignored)
	saveWindowSize(400, 300)
	wIgnored, hIgnored := loadWindowSize(1350, 850)
	if wIgnored != 1400 || hIgnored != 900 {
		t.Errorf("expected size to remain 1400x900, got %dx%d", wIgnored, hIgnored)
	}

	// Clean up persisted file for testing environment
	configPath := getWindowConfigPath()
	_ = os.Remove(configPath)
}

func TestGetWindowConfigPath(t *testing.T) {
	path := getWindowConfigPath()
	if path == "" {
		t.Fatal("expected non-empty config path")
	}
	if filepath.Base(path) != "window.json" && filepath.Base(path) != "window-state.json" {
		t.Errorf("unexpected filename: %s", filepath.Base(path))
	}
}
