import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ssrSafeJsonStorage } from "@/lib/storage/ssr-safe-json-storage";

interface NavUIStore {
  isNavOpen: boolean;
  isDrawerOpen: boolean;
  isHydrated: boolean;
  setNavOpen: (isOpen: boolean) => void;
  setDrawerOpen: (isOpen: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
}

/** Top-bar collapse state, persisted like the calendar sidebar (store/calendar.ts).
 *  isHydrated suppresses the collapse animation on first paint.
 *
 *  `isNavOpen` is the desktop rail and persists. `isDrawerOpen` is the mobile
 *  overlay and deliberately does not (see `partialize`): a drawer restored open
 *  would cover the page on every phone load, and sharing one flag with the rail
 *  would mean closing the drawer also collapsed the rail left open on desktop. */
export const useNavUIStore = create<NavUIStore>()(
  persist(
    (set) => ({
      isNavOpen: true,
      isDrawerOpen: false,
      isHydrated: false,
      setNavOpen: (isOpen) => set({ isNavOpen: isOpen }),
      setDrawerOpen: (isOpen) => set({ isDrawerOpen: isOpen }),
      setHydrated: (hydrated) => set({ isHydrated: hydrated }),
    }),
    {
      name: "nav-ui-store",
      storage: ssrSafeJsonStorage,
      partialize: (state) => ({ isNavOpen: state.isNavOpen }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHydrated(true);
        }
      },
    }
  )
);
