import { useQuery } from '@tanstack/react-query'
import { api, API_PREFIX } from '@/lib/api'
import type { DocumentDetail, DocumentSummary, PaginatedResponse } from '@/types'

export interface DocumentFilters {
  status?: string
  doc_type?: string
  batch_id?: string
  workflow_id?: string
  search?: string
  sort?: string
  date_from?: string
  date_to?: string
  page?: number
  page_size?: number
}

export function useDocuments(
  filters: DocumentFilters = {},
  options?: { refetchInterval?: number },
) {
  return useQuery({
    queryKey: ['documents', filters],
    refetchInterval: options?.refetchInterval,
    queryFn: () =>
      api.get<PaginatedResponse<DocumentSummary>>(`${API_PREFIX}/documents`, {
        params: filters,
      }),
  })
}

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: ['documents', 'detail', id],
    enabled: Boolean(id),
    queryFn: () => api.get<DocumentDetail>(`${API_PREFIX}/documents/${id}`),
  })
}
