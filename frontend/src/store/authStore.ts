import { create } from 'zustand'
import { api, API_PREFIX } from '@/lib/api'
import { clearToken, getToken, setToken } from '@/lib/utils'
import type { Tenant, User } from '@/types'
import { useTenantStore } from './tenantStore'

interface LoginResponse {
  access_token: string
  token_type: string
  user: User
  tenant: Tenant
}

interface MeResponse {
  user: User
  tenant: Tenant
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User | null) => void
  loadFromStorage: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: getToken(),
  isLoading: false,

  login: async (email, password) => {
    set({ isLoading: true })
    try {
      const data = await api.post<LoginResponse>(`${API_PREFIX}/auth/login`, {
        email,
        password,
      })
      setToken(data.access_token)
      useTenantStore.getState().setTenant(data.tenant)
      set({ user: data.user, token: data.access_token })
    } finally {
      set({ isLoading: false })
    }
  },

  logout: async () => {
    try {
      await api.post(`${API_PREFIX}/auth/logout`)
    } catch {
      // ignore network errors on logout
    }
    clearToken()
    useTenantStore.getState().setTenant(null)
    set({ user: null, token: null })
  },

  setUser: (user) => set({ user }),

  loadFromStorage: async () => {
    const token = getToken()
    if (!token) {
      set({ user: null, token: null, isLoading: false })
      return
    }
    set({ isLoading: true, token })
    try {
      const data = await api.get<MeResponse>(`${API_PREFIX}/auth/me`)
      useTenantStore.getState().setTenant(data.tenant)
      set({ user: data.user, token })
    } catch {
      clearToken()
      set({ user: null, token: null })
    } finally {
      set({ isLoading: false })
    }
  },
}))
