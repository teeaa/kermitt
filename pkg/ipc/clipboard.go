package ipc

import (
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// CopyToClipboard copies text to the native system clipboard using Wails runtime.
func (b *KubeBridge) CopyToClipboard(text string) error {
	b.mu.RLock()
	ctx := b.ctx
	b.mu.RUnlock()

	if ctx == nil || ctx.Value("frontend") == nil {
		return NewAppError(ErrCodeInternalError, "Wails context not initialized", "", false)
	}

	return wailsRuntime.ClipboardSetText(ctx, text)
}
