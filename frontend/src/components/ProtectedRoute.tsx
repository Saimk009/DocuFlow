import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { getToken } from '@/lib/utils'
import { CenteredSpinner } from '@/components/shared/common'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)
  const token = getToken()

  if (!token) return <Navigate to="/login" replace />
  if (isLoading && !user) return <CenteredSpinner label="Authenticating" />
  return <>{children}</>
}

export function RoleRoute({
  children,
  allow,
}: {
  children: ReactNode
  allow: string[]
}) {
  const user = useAuthStore((s) => s.user)
  if (user && !allow.includes(user.role)) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
