import { useQuery } from '@tanstack/react-query'
import { api, API_PREFIX } from '@/lib/api'
import type { PaginatedResponse, DocumentSummary } from '@/types'

export const PIPELINE_STAGES = [
  'captured',
  'ocr',
  'classifying',
  'extracting',
  'validating',
  'complete',
] as const

export type StageCounts = Record<string, number>

/** Fetch live document counts per pipeline stage (one lightweight query each). */
export function usePipelineCounts() {
  return useQuery({
    queryKey: ['documents', 'pipeline-counts'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const results = await Promise.all(
        PIPELINE_STAGES.map((stage) =>
          api.get<PaginatedResponse<DocumentSummary>>(`${API_PREFIX}/documents`, {
            params: { status: stage, page_size: 1 },
          }),
        ),
      )
      const counts: StageCounts = {}
      PIPELINE_STAGES.forEach((stage, i) => {
        counts[stage] = results[i].total
      })
      return counts
    },
  })
}
