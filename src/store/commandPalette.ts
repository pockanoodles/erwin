import { create } from "zustand";

interface CommandPaletteStore {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

/**
 * Open state for the ⌘K palette.
 *
 * This used to live as `useState` in the (common) layout, which meant anything
 * outside that component could only reach it by dispatching a synthetic
 * `keydown` at `document` and hoping the layout's listener caught it — the nav
 * rail, the scroll FAB and the first-run hint each carried their own copy of
 * that trick. The top bar's search field needs the same thing, so the state
 * moved here and the fake keystrokes went away.
 */
export const useCommandPaletteStore = create<CommandPaletteStore>((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
