import { create } from 'zustand'
import { api, API_PREFIX } from '@/lib/api'
import { setActiveTenantSlug } from '@/lib/tenant'
import type { AIProvider, Tenant } from '@/types'

interface TenantState {
  tenant: Tenant | null
  aiProvider: AIProvider
  setTenant: (tenant: Tenant | null) => void
  fetchTenant: () => Promise<void>
}

interface SettingsResponse {
  id: string
  slug: string
  name: string
  plan: string
  ai_provider: AIProvider
  has_api_key: boolean
  logo_url?: string | null
}

export const useTenantStore = create<TenantState>((set) => ({
  tenant: null,
  aiProvider: 'claude',

  setTenant: (tenant) => {
    setActiveTenantSlug(tenant?.slug ?? null)
    set({ tenant, aiProvider: tenant?.ai_provider ?? 'claude' })
  },

  fetchTenant: async () => {
    const data = await api.get<SettingsResponse>(`${API_PREFIX}/settings`)
    const tenant: Tenant = {
      id: data.id,
      slug: data.slug,
      name: data.name,
      plan: data.plan,
      ai_provider: data.ai_provider,
      logo_url: data.logo_url,
    }
    set({ tenant, aiProvider: data.ai_provider })
  },
}))
