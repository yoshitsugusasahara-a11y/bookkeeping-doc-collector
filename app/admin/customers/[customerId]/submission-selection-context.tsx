"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SelectionContextValue = {
  selectedIds: string[];
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SubmissionSelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const value = useMemo<SelectionContextValue>(
    () => ({
      selectedIds: Array.from(selected),
      isSelected: (id: string) => selected.has(id),
      toggle,
      selectAll,
      clear,
    }),
    [selected, toggle, selectAll, clear],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSubmissionSelection() {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error(
      "useSubmissionSelection must be used within a SubmissionSelectionProvider",
    );
  }
  return context;
}
