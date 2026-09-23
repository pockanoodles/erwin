"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface TaskRowExpansionValue {
  expandedId: string | null;
  toggle: (id: string) => void;
  collapse: () => void;
  isExpanded: (id: string) => boolean;
}

const TaskRowExpansionContext = createContext<TaskRowExpansionValue | null>(
  null
);

/**
 * Accordion for the task list: only one row is expanded at a time. Escape
 * collapses the open row unless a nested overlay (date picker, menu) ate the
 * key.
 */
export function TaskRowExpansionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setExpandedId((current) => (current === id ? null : id));
  }, []);

  const collapse = useCallback(() => setExpandedId(null), []);

  const isExpanded = useCallback(
    (id: string) => expandedId === id,
    [expandedId]
  );

  useEffect(() => {
    if (!expandedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      collapse();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedId, collapse]);

  const value = useMemo(
    () => ({ expandedId, toggle, collapse, isExpanded }),
    [expandedId, toggle, collapse, isExpanded]
  );

  return (
    <TaskRowExpansionContext.Provider value={value}>
      {children}
    </TaskRowExpansionContext.Provider>
  );
}

export function useTaskRowExpansion(): TaskRowExpansionValue {
  const context = useContext(TaskRowExpansionContext);
  if (!context) {
    throw new Error(
      "useTaskRowExpansion must be used within TaskRowExpansionProvider"
    );
  }
  return context;
}
