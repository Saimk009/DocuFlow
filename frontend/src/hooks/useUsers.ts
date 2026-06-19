import { useQuery } from '@tanstack/react-query'
import { api, API_PREFIX } from '@/lib/api'
import type { User } from '@/types'

export function useUsers() {
  return useQuery({
    queryKey: ['settings', 'users'],
    queryFn: () => api.get<User[]>(`${API_PREFIX}/settings/users`),
  })
}

export function useUserMap() {
  const { data } = useUsers()
  const map = new Map<string, User>()
  data?.forEach((u) => map.set(u.id, u))
  return map
}
