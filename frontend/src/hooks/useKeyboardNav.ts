import { useState, useEffect, useCallback, RefObject } from "react";

export interface UseKeyboardNavOptions<T> {
  items: T[];
  onFocusChange?: (item: T, index: number) => void;
  onEnter?: (item: T, index: number) => void;
  onOpenLogs?: (item: T, index: number) => void;
  onInspect?: (item: T, index: number) => void;
  onEscape?: () => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  containerRef?: RefObject<HTMLElement | null>;
  disabled?: boolean;
}

export interface UseKeyboardNavReturn {
  focusedIndex: number;
  setFocusedIndex: (index: number | ((prev: number) => number)) => void;
  clearFocus: () => void;
}

export function useKeyboardNav<T>({
  items,
  onFocusChange,
  onEnter,
  onOpenLogs,
  onInspect,
  onEscape,
  searchInputRef,
  containerRef,
  disabled = false,
}: UseKeyboardNavOptions<T>): UseKeyboardNavReturn {
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  // Keep focusedIndex bounded when items change
  useEffect(() => {
    if (items.length === 0) {
      setFocusedIndex(-1);
    } else if (focusedIndex >= items.length) {
      setFocusedIndex(items.length - 1);
    }
  }, [items.length, focusedIndex]);

  const scrollToRow = useCallback(
    (index: number) => {
      if (!containerRef?.current || index < 0) return;
      const row = containerRef.current.querySelector<HTMLElement>(`[data-row-index="${index}"]`);
      if (row) {
        row.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    },
    [containerRef]
  );

  const clearFocus = useCallback(() => {
    setFocusedIndex(-1);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;

      const target = e.target as HTMLElement | null;
      const tagName = (target?.tagName || "").toLowerCase();
      const isInputActive =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable;

      // When search input or another input is focused, Escape blurs it
      if (isInputActive) {
        if (e.key === "Escape") {
          e.preventDefault();
          target?.blur();
          onEscape?.();
        }
        return;
      }

      // Check if any modal or overlay dialog is open in the DOM
      const isModalOpen =
        document.querySelector('[role="dialog"]') !== null ||
        document.querySelector(".fixed.inset-0.z-50") !== null;
      if (isModalOpen) {
        return;
      }

      const hasModifiers = e.metaKey || e.ctrlKey || e.altKey;

      // 1. "/" focuses the search bar
      if (e.key === "/" && !hasModifiers) {
        e.preventDefault();
        if (searchInputRef?.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
        return;
      }

      // 2. "Escape" clears focus and selection
      if (e.key === "Escape" && !hasModifiers) {
        e.preventDefault();
        setFocusedIndex(-1);
        onEscape?.();
        return;
      }

      if (items.length === 0) return;

      // 3. "j" or "ArrowDown": Move visual row focus down ONLY (no log streaming side effect)
      if ((e.key === "j" || e.key === "ArrowDown") && !hasModifiers) {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev < items.length - 1 ? (prev < 0 ? 0 : prev + 1) : prev;
          scrollToRow(next);
          if (items[next]) {
            onFocusChange?.(items[next], next);
          }
          return next;
        });
        return;
      }

      // 4. "k" or "ArrowUp": Move visual row focus up ONLY (no log streaming side effect)
      if ((e.key === "k" || e.key === "ArrowUp") && !hasModifiers) {
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : 0;
          scrollToRow(next);
          if (items[next]) {
            onFocusChange?.(items[next], next);
          }
          return next;
        });
        return;
      }

      // 5. "Enter": Open log drawer and connect stream for focused item
      if (e.key === "Enter" && !hasModifiers) {
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          e.preventDefault();
          if (onEnter) {
            onEnter(items[focusedIndex], focusedIndex);
          } else if (onOpenLogs) {
            onOpenLogs(items[focusedIndex], focusedIndex);
          }
        }
        return;
      }

      // 6. "l" or "L": Secondary shortcut to open log drawer
      if ((e.key === "l" || e.key === "L") && !hasModifiers) {
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          e.preventDefault();
          if (onOpenLogs) {
            onOpenLogs(items[focusedIndex], focusedIndex);
          } else if (onEnter) {
            onEnter(items[focusedIndex], focusedIndex);
          }
        }
        return;
      }

      // 7. "i" or "I": Inspect details for focused item
      if ((e.key === "i" || e.key === "I") && !hasModifiers) {
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          e.preventDefault();
          onInspect?.(items[focusedIndex], focusedIndex);
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    disabled,
    items,
    focusedIndex,
    onFocusChange,
    onEnter,
    onOpenLogs,
    onInspect,
    onEscape,
    searchInputRef,
    containerRef,
    scrollToRow,
  ]);

  return {
    focusedIndex,
    setFocusedIndex,
    clearFocus,
  };
}
