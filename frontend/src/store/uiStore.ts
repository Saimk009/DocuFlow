import { create } from 'zustand'

interface UIState {
  sidebarCollapsed: boolean
  commandOpen: boolean
  toggleSidebar: () => void
  openCommand: () => void
  closeCommand: () => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  commandOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  openCommand: () => set({ commandOpen: true }),
  closeCommand: () => set({ commandOpen: false }),
}))
