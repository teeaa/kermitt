import React, { useState, useEffect, useCallback } from "react";
import { X, ExternalLink } from "lucide-react";
import { EventsOn, BrowserOpenURL } from "../../../wailsjs/runtime/runtime";
import { GetAppVersion } from "../../../wailsjs/go/main/App";
import appIcon from "../../assets/images/appicon.png";

export interface AboutModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  version?: string;
}

export const GITHUB_REPO_URL = "https://github.com/teeaa/kermitt";

export function AboutModal({
  isOpen: propIsOpen,
  onClose: propOnClose,
  version: propVersion,
}: AboutModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [appVersion, setAppVersion] = useState<string>(propVersion || "dev");

  // Support both controlled mode (via props) and uncontrolled mode (via menu events)
  const isControlled = propIsOpen !== undefined;
  const isOpen = isControlled ? propIsOpen : internalOpen;

  // Fetch app version on mount if not provided via props
  useEffect(() => {
    if (propVersion) {
      setAppVersion(propVersion);
      return;
    }
    let active = true;
    GetAppVersion()
      .then((v) => {
        if (active && v) {
          setAppVersion(v);
        }
      })
      .catch((err) => {
        console.warn("[ABOUT] Could not fetch app version:", err);
      });
    return () => {
      active = false;
    };
  }, [propVersion]);

  const handleClose = useCallback(() => {
    if (propOnClose) {
      propOnClose();
    }
    setInternalOpen(false);
  }, [propOnClose]);

  // Listen for native menu "About Kermitt" event
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && (window as any).runtime) {
        return EventsOn("menu:open-about", () => {
          setInternalOpen(true);
        });
      }
    } catch (err) {
      console.warn("[ABOUT] Could not subscribe to menu:open-about event:", err);
    }
  }, []);

  // Dismiss on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  // Open repository in default external system browser
  const handleOpenRepo = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    try {
      if (typeof (window as any)?.runtime?.BrowserOpenURL === "function") {
        (window as any).runtime.BrowserOpenURL(GITHUB_REPO_URL);
      } else if (typeof BrowserOpenURL === "function") {
        BrowserOpenURL(GITHUB_REPO_URL);
      } else {
        window.open(GITHUB_REPO_URL, "_blank");
      }
    } catch {
      window.open(GITHUB_REPO_URL, "_blank");
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-modal-title"
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={handleClose}
    >
      <div
        className="bg-[#111827] border border-slate-700/60 rounded-xl p-6 w-[380px] max-w-full text-center shadow-2xl relative animate-in zoom-in-95 duration-150 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close dialog"
          title="Close (Esc)"
          className="absolute top-3.5 right-3.5 p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* App Frog Icon */}
        <div className="relative">
          <img
            src={appIcon || "/appicon.png"}
            alt="Kermitt Frog Logo"
            className="w-20 h-20 mx-auto mb-4 drop-shadow-md select-none pointer-events-none object-contain"
          />
        </div>

        {/* Title & Subtitle */}
        <h2
          id="about-modal-title"
          className="text-xl font-bold text-white tracking-tight"
        >
          Kermitt
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Kubernetes Desktop Application
        </p>
        <p className="text-xs text-slate-400 mt-1 mb-5">
          version {appVersion.replace(/^v/, "")}
        </p>

        {/* GitHub Repository Link */}
        <div className="pt-1">
          <a
            href={GITHUB_REPO_URL}
            onClick={handleOpenRepo}
            className="text-emerald-400 hover:text-emerald-300 underline underline-offset-4 text-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer font-medium"
            title="Open Kermitt on GitHub"
          >
            <span>{GITHUB_REPO_URL}</span>
            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
          </a>
        </div>
      </div>
    </div>
  );
}
