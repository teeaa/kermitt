package main

import (
	"context"
	"embed"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	goRuntime "runtime"
	"strings"
	"sync"

	"github.com/teeaa/kermitt/pkg/ipc"
	"github.com/teeaa/kermitt/pkg/kube"
	"github.com/teeaa/kermitt/pkg/logger"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

// version is injected at build time via -ldflags "-X 'main.version=...'".
var version = "dev"

// WindowConfig stores persisted window dimensions.
type WindowConfig struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

func getWindowConfigPath() string {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "window-state.json"
	}
	dir := filepath.Join(configDir, "kermitt")
	_ = os.MkdirAll(dir, 0o755)
	return filepath.Join(dir, "window.json")
}

func loadWindowSize(defaultW, defaultH int) (int, int) {
	path := getWindowConfigPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return defaultW, defaultH
	}
	var cfg WindowConfig
	if err := json.Unmarshal(data, &cfg); err != nil || cfg.Width < 800 || cfg.Height < 600 {
		return defaultW, defaultH
	}
	return cfg.Width, cfg.Height
}

func saveWindowSize(w, h int) {
	if w < 800 || h < 600 {
		return
	}
	path := getWindowConfigPath()
	cfg := WindowConfig{Width: w, Height: h}
	data, _ := json.MarshalIndent(cfg, "", "  ")
	_ = os.WriteFile(path, data, 0o644)
}

func main() {
	// Initialize standard log/slog logger writing to os.Stdout and in-memory ring buffer
	logger.InitDefaultLogger()
	slog.Debug("Starting Kermitt application...")

	// Fix PATH for macOS
	fixPath()

	// Create an instance of the app structure
	app := NewApp()

	// Initialize live Kubernetes ClientManager
	clientMgr, err := kube.NewClientManager()
	if err != nil {
		slog.Error("Failed to initialize Kubernetes ClientManager", "error", err)
	}

	// Initialize live IPC bridge
	kubeBridge := ipc.NewKubeBridge(clientMgr)
	app.SetKubeBridge(kubeBridge)

	// Thread-safe Wails application context reference for native menu callbacks
	var appCtx context.Context
	var appCtxMu sync.RWMutex

	setContext := func(ctx context.Context) {
		appCtxMu.Lock()
		defer appCtxMu.Unlock()
		appCtx = ctx
	}

	getContext := func() context.Context {
		appCtxMu.RLock()
		defer appCtxMu.RUnlock()
		return appCtx
	}

	emitEvent := func(name string, optionalData ...interface{}) {
		ctx := getContext()
		if ctx != nil {
			wailsRuntime.EventsEmit(ctx, name, optionalData...)
		}
	}

	// ========================================================================
	// Native macOS Application Menu
	// ========================================================================
	appMenu := menu.NewMenu()

	// 1. Kermitt App Menu (Becomes Application Menu on macOS)
	kermittMenu := appMenu.AddSubmenu("Kermitt")
	kermittMenu.AddText("About Kermitt", nil, func(_ *menu.CallbackData) {
		emitEvent("menu:open-about")
	})
	kermittMenu.AddSeparator()
	kermittMenu.AddText("Settings...", keys.CmdOrCtrl(","), func(_ *menu.CallbackData) {
		emitEvent("menu:open-settings")
	})
	kermittMenu.AddSeparator()
	kermittMenu.AddText("Hide Kermitt", keys.CmdOrCtrl("h"), func(_ *menu.CallbackData) {
		ctx := getContext()
		if ctx != nil {
			wailsRuntime.WindowHide(ctx)
		}
	})
	kermittMenu.AddSeparator()
	kermittMenu.AddText("Quit Kermitt", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		ctx := getContext()
		if ctx != nil {
			wailsRuntime.Quit(ctx)
		}
	})

	// 2. Edit Menu (Standard macOS Clipboard, Undo/Redo)
	appMenu.Append(menu.EditMenu())

	// 3. View Menu (Zoom In, Zoom Out, Actual Size, Fullscreen)
	viewMenu := appMenu.AddSubmenu("View")
	viewMenu.AddText("Zoom In", keys.CmdOrCtrl("plus"), func(_ *menu.CallbackData) {
		emitEvent("menu:zoom-in")
	})
	viewMenu.AddText("Zoom Out", keys.CmdOrCtrl("-"), func(_ *menu.CallbackData) {
		emitEvent("menu:zoom-out")
	})
	viewMenu.AddText("Actual Size", keys.CmdOrCtrl("0"), func(_ *menu.CallbackData) {
		emitEvent("menu:zoom-reset")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("Toggle Full Screen", keys.CmdOrCtrl("f"), func(_ *menu.CallbackData) {
		ctx := getContext()
		if ctx != nil {
			if wailsRuntime.WindowIsFullscreen(ctx) {
				wailsRuntime.WindowUnfullscreen(ctx)
			} else {
				wailsRuntime.WindowFullscreen(ctx)
			}
		}
	})
	viewMenu.AddSeparator()
	var devToolsShortcut *keys.Accelerator
	if goRuntime.GOOS == "darwin" {
		devToolsShortcut = keys.Combo("i", keys.CmdOrCtrlKey, keys.OptionOrAltKey)
	} else {
		devToolsShortcut = keys.Combo("i", keys.CmdOrCtrlKey, keys.ShiftKey)
	}
	viewMenu.AddText("Developer Tools", devToolsShortcut, func(_ *menu.CallbackData) {
		emitEvent("menu:toggle-devtools")
	})

	// 4. Window Menu (Minimize, Zoom, Application Logs)
	windowMenu := appMenu.AddSubmenu("Window")
	windowMenu.AddText("Minimize", keys.CmdOrCtrl("m"), func(_ *menu.CallbackData) {
		ctx := getContext()
		if ctx != nil {
			wailsRuntime.WindowMinimise(ctx)
		}
	})
	windowMenu.AddText("Zoom", nil, func(_ *menu.CallbackData) {
		ctx := getContext()
		if ctx != nil {
			wailsRuntime.WindowToggleMaximise(ctx)
		}
	})
	windowMenu.AddSeparator()
	windowMenu.AddText("Show Application Log", keys.CmdOrCtrl("l"), func(_ *menu.CallbackData) {
		emitEvent("menu:open-app-logs")
	})

	startWidth, startHeight := loadWindowSize(1350, 850)

	// Create application with options
	err = wails.Run(&options.App{
		Title:     "kermitt",
		Width:     startWidth,
		Height:    startHeight,
		MinWidth:  1024,
		MinHeight: 700,
		Menu:      appMenu,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup: func(ctx context.Context) {
			setContext(ctx)
			app.startup(ctx)
			logger.SetWailsContext(ctx)
			ipc.SetWailsContext(kubeBridge, ctx)
			wailsRuntime.EventsOn(ctx, "menu:toggle-devtools", func(optionalData ...interface{}) {
				wailsRuntime.WindowExecJS(ctx, "if (window.WailsInvoke) { window.WailsInvoke('wails:openInspector'); }")
			})
		},
		OnBeforeClose: func(ctx context.Context) (prevent bool) {
			if !wailsRuntime.WindowIsFullscreen(ctx) && !wailsRuntime.WindowIsMinimised(ctx) {
				w, h := wailsRuntime.WindowGetSize(ctx)
				saveWindowSize(w, h)
			}
			return false
		},
		Bind: []interface{}{
			app,
			kubeBridge,
		},
	})
	if err != nil {
		println("Error:", err.Error())
	}
}

func fixPath() {
	if runtime.GOOS == "darwin" {
		extraPaths := []string{
			"/usr/local/bin",
			"/opt/homebrew/bin",
			"/opt/homebrew/sbin",
		}
		currentPath := os.Getenv("PATH")
		os.Setenv("PATH", strings.Join(extraPaths, ":")+":"+currentPath)
	}
}
