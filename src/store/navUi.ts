import { create } from "zustand";
import { persist } from "zustand/middleware";

import { ssrSafeJsonStorage } from "@/lib/storage/ssr-safe-json-storage";

interface NavUIStore {
  isNavOpen: boolean;
  isHydrated: boolean;
  setNavOpen: (isOpen: boolean) => void;
  setHydrated: (hydrated: boolean) => void;
}

/** Top-bar collapse state, persisted like the calendar sidebar (store/calendar.ts).
 *  isHydrated suppresses the collapse animation on first paint. */
export const useNavUIStore = create<NavUIStore>()(
  persist(
    (set) => ({
      isNavOpen: true,
      isHydrated: false,
      setNavOpen: (isOpen) => set({ isNavOpen: isOpen }),
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
