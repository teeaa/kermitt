/**
 * Multi-tiered clipboard utility for Wails / macOS WebKit webview and browser environments.
 *
 * In desktop webviews, navigator.clipboard.writeText() often silently fails due to
 * sandboxing, missing permissions, or focus loss. This utility attempts:
 * 1. Wails native runtime clipboard (window.runtime.ClipboardSetText)
 * 2. Wails backend IPC bridge (KubeBridge / App CopyToClipboard)
 * 3. Web Clipboard API (navigator.clipboard.writeText)
 * 4. Fallback hidden textarea with document.execCommand("copy")
 */

declare global {
  interface Window {
    runtime?: {
      ClipboardSetText?: (text: string) => Promise<boolean>;
      ClipboardGetText?: () => Promise<string>;
      [key: string]: any;
    };
    go?: any;
  }
}

export async function copyText(text: string): Promise<boolean> {
  // 1. Try Wails native runtime clipboard
  try {
    if (window.runtime?.ClipboardSetText) {
      await window.runtime.ClipboardSetText(text);
      return true;
    }
  } catch {
    // Fall through
  }

  // 1b. Try Wails backend IPC bridge
  try {
    const win = window as any;
    if (win?.go?.ipc?.KubeBridge?.CopyToClipboard) {
      await win.go.ipc.KubeBridge.CopyToClipboard(text);
      return true;
    }
    if (win?.go?.main?.App?.CopyToClipboard) {
      await win.go.main.App.CopyToClipboard(text);
      return true;
    }
  } catch {
    // Fall through
  }

  // 2. Try Web Clipboard API
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through
  }

  // 3. Fallback textarea execCommand
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "absolute";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    const success = document.execCommand("copy");
    document.body.removeChild(el);
    return success;
  } catch {
    return false;
  }
}
