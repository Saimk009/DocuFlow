import { useQuery } from '@tanstack/react-query'
import { api, API_PREFIX } from '@/lib/api'
import type {
  ExceptionGroupDetail,
  ExceptionGroupSummary,
  ExceptionSummary,
} from '@/types'

export function useExceptionSummary() {
  return useQuery({
    queryKey: ['exceptions', 'summary'],
    queryFn: () => api.get<ExceptionSummary>(`${API_PREFIX}/exceptions/summary`),
    refetchInterval: 30_000,
  })
}

export function useExceptionGroups(params: { status?: string; category?: string } = {}) {
  return useQuery({
    queryKey: ['exceptions', 'groups', params],
    queryFn: () =>
      api.get<ExceptionGroupSummary[]>(`${API_PREFIX}/exceptions/groups`, { params }),
    refetchInterval: 30_000,
  })
}

export function useExceptionGroup(id: string | undefined) {
  return useQuery({
    queryKey: ['exceptions', 'group', id],
    enabled: Boolean(id),
    queryFn: () =>
      api.get<ExceptionGroupDetail>(`${API_PREFIX}/exceptions/groups/${id}`),
  })
}

/** Live count of open exception groups — drives the sidebar badge. */
export function useOpenExceptionCount() {
  return useQuery({
    queryKey: ['exceptions', 'summary'],
    queryFn: () => api.get<ExceptionSummary>(`${API_PREFIX}/exceptions/summary`),
    refetchInterval: 30_000,
    select: (s) => s.total_open_groups,
  })
}
