package main

import (
	"context"
	"fmt"

	"github.com/teeaa/kermitt/pkg/ipc"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx        context.Context
	kubeBridge *ipc.KubeBridge
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// SetKubeBridge attaches the live KubeBridge instance.
func (a *App) SetKubeBridge(bridge *ipc.KubeBridge) {
	a.kubeBridge = bridge
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// GetInitialState delegates to KubeBridge.GetInitialState.
func (a *App) GetInitialState() (*ipc.InitialBootstrapState, error) {
	if a.kubeBridge != nil {
		return a.kubeBridge.GetInitialState()
	}
	return nil, fmt.Errorf("kube bridge not initialized")
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// CopyToClipboard copies text to the system clipboard using Wails runtime.
func (a *App) CopyToClipboard(text string) error {
	if a.ctx == nil || a.ctx.Value("frontend") == nil {
		return fmt.Errorf("application context not initialized")
	}
	return wailsRuntime.ClipboardSetText(a.ctx, text)
}

// GetAppVersion returns the application version exposed to the frontend.
func (a *App) GetAppVersion() string {
	return version
}

