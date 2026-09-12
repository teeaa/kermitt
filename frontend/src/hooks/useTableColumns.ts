import { useState, useEffect, useRef, useMemo, useCallback } from "react";

export interface ColumnDefinition<TKey extends string = string> {
  key: TKey;
  label: string;
  defaultWidth: number;
  minWidth: number;
  align?: "left" | "center" | "right";
  required?: boolean; // Primary column (e.g., Name) cannot be hidden
  resizable?: boolean;
  sortable?: boolean;
}

export interface SortConfig<TKey extends string = string> {
  column: TKey;
  direction: "asc" | "desc";
}

export interface UseTableColumnsOptions<TKey extends string = string> {
  resourceKey: string; // e.g. "pods", "deployments", "statefulsets", "jobs", "cronjobs"
  columns: ColumnDefinition<TKey>[];
  defaultSort?: SortConfig<TKey> | null;
}

export interface UseTableColumnsReturn<TKey extends string = string> {
  columns: ColumnDefinition<TKey>[];
  visibleColumns: ColumnDefinition<TKey>[];
  columnWidths: Record<TKey, number>;
  columnVisibility: Record<TKey, boolean>;
  sortConfig: SortConfig<TKey> | null;
  resizingColKey: TKey | null;
  contextMenu: { x: number; y: number } | null;
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
  handleResizeStart: (e: React.MouseEvent, col: ColumnDefinition<TKey>) => void;
  handleAutoFitColumn: (
    colKey: TKey,
    rows: any[],
    extractValue?: (row: any, key: TKey) => string
  ) => void;
  handleSortClick: (col: ColumnDefinition<TKey>) => void;
  handleHeaderContextMenu: (e: React.MouseEvent) => void;
  toggleColumnVisibility: (key: TKey) => void;
  resetToDefaults: () => void;
  closeContextMenu: () => void;
  setSortConfig: React.Dispatch<React.SetStateAction<SortConfig<TKey> | null>>;
  setContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
}

export function useTableColumns<TKey extends string = string>({
  resourceKey,
  columns,
  defaultSort = null,
}: UseTableColumnsOptions<TKey>): UseTableColumnsReturn<TKey> {
  const storageKey = `kermitt_cols_${resourceKey}`;

  const getDefaultWidths = useCallback((): Record<TKey, number> => {
    const map = {} as Record<TKey, number>;
    columns.forEach((c) => {
      map[c.key] = c.defaultWidth;
    });
    return map;
  }, [columns]);

  const getDefaultVisibility = useCallback((): Record<TKey, boolean> => {
    const map = {} as Record<TKey, boolean>;
    columns.forEach((c) => {
      map[c.key] = true;
    });
    return map;
  }, [columns]);

  // 1. Column Widths State (persisted to localStorage)
  const [columnWidths, setColumnWidths] = useState<Record<TKey, number>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.widths) {
          return { ...getDefaultWidths(), ...parsed.widths };
        }
      }
    } catch (e) {
      console.warn(`Failed to load column widths for ${resourceKey}:`, e);
    }
    return getDefaultWidths();
  });

  // 2. Column Visibility State (persisted to localStorage with Name guardrail)
  const [columnVisibility, setColumnVisibility] = useState<Record<TKey, boolean>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.visibility) {
          const vis = { ...getDefaultVisibility(), ...parsed.visibility };
          // Guardrail: Ensure required or name column is always visible
          columns.forEach((c) => {
            if (c.required || c.key === "name") {
              vis[c.key] = true;
            }
          });
          return vis;
        }
      }
    } catch (e) {
      console.warn(`Failed to load column visibility for ${resourceKey}:`, e);
    }
    return getDefaultVisibility();
  });

  // 3. Sorting State
  const [sortConfig, setSortConfig] = useState<SortConfig<TKey> | null>(defaultSort || null);

  // 4. Persist to localStorage whenever widths or visibility change
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          widths: columnWidths,
          visibility: columnVisibility,
        })
      );
    } catch (e) {
      console.warn(`Failed to persist columns for ${resourceKey}:`, e);
    }
  }, [columnWidths, columnVisibility, storageKey, resourceKey]);

  // 5. Context Menu State for right-click column customization
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  // Close context menu on outside click or Escape key
  useEffect(() => {
    if (!contextMenu) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenu(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  // 6. Interactive Drag Resizing
  const [resizingColKey, setResizingColKey] = useState<TKey | null>(null);
  const resizeStateRef = useRef<{
    colKey: TKey;
    startX: number;
    startWidth: number;
    minWidth: number;
  } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, col: ColumnDefinition<TKey>) => {
      e.preventDefault();
      e.stopPropagation(); // Avoid triggering sorting

      resizeStateRef.current = {
        colKey: col.key,
        startX: e.clientX,
        startWidth: columnWidths[col.key] || col.defaultWidth,
        minWidth: col.minWidth,
      };
      setResizingColKey(col.key);

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!resizeStateRef.current) return;
        const { colKey, startX, startWidth, minWidth } = resizeStateRef.current;

        // Account for container zoom scale so dragging tracks cursor 1:1
        let zoomFactor = 1.0;
        if (typeof document !== "undefined") {
          const docZoom = document.documentElement.style.getPropertyValue("--app-zoom");
          if (docZoom) {
            const parsed = parseFloat(docZoom);
            if (!isNaN(parsed) && parsed > 0) zoomFactor = parsed;
          }
        }

        const deltaX = (moveEvent.clientX - startX) / zoomFactor;
        const nextWidth = Math.max(minWidth, Math.round(startWidth + deltaX));

        setColumnWidths((prev) => ({
          ...prev,
          [colKey]: nextWidth,
        }));
      };

      const onMouseUp = () => {
        setResizingColKey(null);
        resizeStateRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.removeProperty("user-select");
        document.body.style.removeProperty("cursor");
      };

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [columnWidths]
  );

  // 7. Auto-Fit Column on Double-Click
  const handleAutoFitColumn = useCallback(
    (
      colKey: TKey,
      rows: any[],
      extractValue?: (row: any, key: TKey) => string
    ) => {
      const col = columns.find((c) => c.key === colKey);
      if (!col) return;

      let maxContentChars = col.label.length;

      rows.forEach((row) => {
        let valStr = "";
        if (extractValue) {
          valStr = extractValue(row, colKey);
        } else if (typeof row === "object" && row !== null) {
          valStr = String(row[colKey] ?? "");
        }
        if (valStr.length > maxContentChars) {
          maxContentChars = valStr.length;
        }
      });

      let calculatedWidth = maxContentChars * 8.5 + 44;
      if (col.required || colKey === "name") {
        calculatedWidth += 40; // Copy button or icon space
      }

      const finalWidth = Math.min(
        600,
        Math.max(col.minWidth, Math.round(calculatedWidth))
      );

      setColumnWidths((prev) => ({
        ...prev,
        [colKey]: finalWidth,
      }));
    },
    [columns]
  );

  // 8. Sorting Handler (toggles asc -> desc -> asc)
  const handleSortClick = useCallback((col: ColumnDefinition<TKey>) => {
    if (!col.sortable) return;

    setSortConfig((prev) => {
      if (!prev || prev.column !== col.key) {
        return { column: col.key, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { column: col.key, direction: "desc" };
      }
      return { column: col.key, direction: "asc" };
    });
  }, []);

  // 9. Context Menu Trigger Handler
  const handleHeaderContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const clampedX = Math.min(e.clientX, window.innerWidth - 250);
    const clampedY = Math.min(e.clientY, window.innerHeight - 350);
    setContextMenu({ x: clampedX, y: clampedY });
  }, []);

  // 10. Toggle Column Visibility with Required Guardrail
  const toggleColumnVisibility = useCallback(
    (key: TKey) => {
      const col = columns.find((c) => c.key === key);
      if (col?.required || key === "name") {
        return; // Locked primary column
      }
      setColumnVisibility((prev) => ({
        ...prev,
        [key]: !prev[key],
      }));
    },
    [columns]
  );

  // 11. Reset Columns to Default Widths and Visibility
  const resetToDefaults = useCallback(() => {
    const defaultW = getDefaultWidths();
    const defaultV = getDefaultVisibility();
    setColumnWidths(defaultW);
    setColumnVisibility(defaultV);
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }, [getDefaultWidths, getDefaultVisibility, storageKey]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 12. Visible Columns Array
  const visibleColumns = useMemo(() => {
    return columns.filter((c) => columnVisibility[c.key]);
  }, [columns, columnVisibility]);

  return {
    columns,
    visibleColumns,
    columnWidths,
    columnVisibility,
    sortConfig,
    resizingColKey,
    contextMenu,
    contextMenuRef,
    handleResizeStart,
    handleAutoFitColumn,
    handleSortClick,
    handleHeaderContextMenu,
    toggleColumnVisibility,
    resetToDefaults,
    closeContextMenu,
    setSortConfig,
    setContextMenu,
  };
}

export function parseAgeToSeconds(ageStr: string): number {
  if (!ageStr) return 0;
  let total = 0;
  const matches = ageStr.match(/(\d+)([dhms])/gi);
  if (matches) {
    for (const m of matches) {
      const val = parseInt(m, 10);
      const unit = m.slice(-1).toLowerCase();
      if (unit === "d") total += val * 86400;
      else if (unit === "h") total += val * 3600;
      else if (unit === "m") total += val * 60;
      else if (unit === "s") total += val;
    }
    return total;
  }
  return 0;
}
