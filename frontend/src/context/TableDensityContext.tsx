import React, { createContext, useContext, useState } from "react";

export type TableDensity = "comfortable" | "compact";

export interface DensityClasses {
  rowHeight: string;
  cellPadding: string;
  headerPadding: string;
  textSize: string;
  iconSize: string;
  badgePadding: string;
}

interface TableDensityContextValue {
  density: TableDensity;
  setDensity: (density: TableDensity) => void;
  densityClasses: DensityClasses;
}

const STORAGE_KEY = "kermitt_table_density";

const TableDensityContext = createContext<TableDensityContextValue | null>(null);

export const TableDensityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [density, setDensityState] = useState<TableDensity>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "compact" || saved === "comfortable") {
        return saved;
      }
    } catch {}
    return "comfortable";
  });

  const setDensity = (newDensity: TableDensity) => {
    setDensityState(newDensity);
    try {
      localStorage.setItem(STORAGE_KEY, newDensity);
    } catch {}
  };

  const densityClasses: DensityClasses =
    density === "compact"
      ? {
          rowHeight: "h-8",
          cellPadding: "py-1 px-2.5",
          headerPadding: "py-1.5 px-2.5",
          textSize: "text-[11px]",
          iconSize: "w-3.5 h-3.5",
          badgePadding: "px-1.5 py-0.2",
        }
      : {
          rowHeight: "h-11",
          cellPadding: "py-2.5 px-3.5",
          headerPadding: "py-2.5 px-3.5",
          textSize: "text-xs",
          iconSize: "w-4 h-4",
          badgePadding: "px-2 py-0.5",
        };

  return (
    <TableDensityContext.Provider value={{ density, setDensity, densityClasses }}>
      {children}
    </TableDensityContext.Provider>
  );
};

export const useTableDensity = (): TableDensityContextValue => {
  const ctx = useContext(TableDensityContext);
  if (!ctx) {
    return {
      density: "comfortable",
      setDensity: () => {},
      densityClasses: {
        rowHeight: "h-11",
        cellPadding: "py-2.5 px-3.5",
        headerPadding: "py-2.5 px-3.5",
        textSize: "text-xs",
        iconSize: "w-4 h-4",
        badgePadding: "px-2 py-0.5",
      },
    };
  }
  return ctx;
};
