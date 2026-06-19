import type { ReactNode } from 'react'

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-900 px-4">
      <div className="w-full max-w-sm">
        <div className="flow-rail mb-8" />
        <h1 className="text-xl font-semibold text-surface-50">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-surface-muted">{subtitle}</p>}
        <div className="card-elevated mt-6 p-6">{children}</div>
      </div>
    </div>
  )
}
