import { useEffect, useState } from 'react'

const ROOT_DOMAIN = 'docuflow.com'
const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api'])
const ACTIVE_SLUG_KEY = 'docuflow:tenant_slug'

function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.localhost')
  )
}

/** Parse the tenant slug from the current hostname. */
export function getTenantSlug(): string | null {
  const hostname = window.location.hostname

  if (isLocalHost(hostname)) {
    // Support acme.localhost during local development.
    const parts = hostname.split('.')
    if (parts.length >= 2 && parts[parts.length - 1] === 'localhost') {
      const sub = parts[0]
      return RESERVED_SUBDOMAINS.has(sub) ? null : sub
    }
    return null
  }

  const parts = hostname.split('.')
  if (parts.length < 3) return null // bare apex e.g. docuflow.com

  const sub = parts[0]
  if (RESERVED_SUBDOMAINS.has(sub)) return null
  return sub
}

/** True when on the marketing/public apex (no tenant subdomain). */
export function isPublicDomain(): boolean {
  const hostname = window.location.hostname
  if (isLocalHost(hostname)) {
    return getTenantSlug() === null
  }
  return hostname === ROOT_DOMAIN || hostname === `www.${ROOT_DOMAIN}`
}

/**
 * The active tenant slug used to scope API requests. Subdomain wins in
 * production; in dev (no subdomain) we fall back to the slug persisted from the
 * login/auth response so the backend middleware can still resolve the tenant.
 */
export function getActiveTenantSlug(): string | null {
  return getTenantSlug() ?? localStorage.getItem(ACTIVE_SLUG_KEY)
}

export function setActiveTenantSlug(slug: string | null): void {
  if (slug) localStorage.setItem(ACTIVE_SLUG_KEY, slug)
  else localStorage.removeItem(ACTIVE_SLUG_KEY)
}

export interface TenantRouting {
  /** Resolved slug from the hostname, if any. */
  slug: string | null
  /** True on the public apex (no tenant subdomain) — show landing/org selector. */
  isPublic: boolean
}

/**
 * Resolve tenant context on app boot. Reads the hostname, extracts the slug,
 * and persists it so every API call carries the correct tenant header.
 */
export function useTenantRouter(): TenantRouting {
  const [routing, setRouting] = useState<TenantRouting>(() => ({
    slug: getTenantSlug(),
    isPublic: isPublicDomain(),
  }))

  useEffect(() => {
    const slug = getTenantSlug()
    if (slug) setActiveTenantSlug(slug)
    setRouting({ slug, isPublic: isPublicDomain() })
  }, [])

  return routing
}
