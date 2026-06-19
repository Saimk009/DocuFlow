import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'
import { getActiveTenantSlug, getTenantSlug } from './tenant'
import { clearToken, getToken } from './utils'

const DEV = import.meta.env.DEV

/**
 * Resolve the API base URL.
 *  - Dev: always hit the local backend (Vite proxies /api too).
 *  - Prod: map ``acme.docuflow.com`` -> ``https://api.acme.docuflow.com``.
 */
function resolveBaseURL(): string {
  if (DEV) return 'http://localhost:8000'

  const slug = getTenantSlug()
  if (slug) return `https://api.${slug}.docuflow.com`
  return 'https://api.docuflow.com'
}

const client: AxiosInstance = axios.create({
  baseURL: resolveBaseURL(),
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  config.headers = config.headers ?? {}
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // Carry tenant context explicitly so the backend middleware can resolve the
  // tenant even when there is no subdomain (e.g. local dev on localhost).
  const slug = getActiveTenantSlug()
  if (slug) {
    config.headers['X-Tenant-Slug'] = slug
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearToken()
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)

async function unwrap<T>(promise: Promise<AxiosResponse<T>>): Promise<T> {
  const res = await promise
  return res.data
}

export const api = {
  raw: client,
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    unwrap<T>(client.get<T>(url, config)),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(client.post<T>(url, data, config)),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(client.put<T>(url, data, config)),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(client.patch<T>(url, data, config)),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    unwrap<T>(client.delete<T>(url, config)),
}

export const API_PREFIX = '/api/v1'

/** HTTP status code from an axios error, if available. */
export function getApiErrorStatus(error: unknown): number | undefined {
  if (error instanceof AxiosError) return error.response?.status
  return undefined
}

/** Human-friendly message extracted from an API error. */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Something went wrong',
): string {
  if (error instanceof AxiosError) {
    const status = error.response?.status
    if (status === 403) return "You don't have permission for this."
    const detail = (error.response?.data as { detail?: unknown } | undefined)
      ?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string }
      if (first?.msg) return first.msg
    }
    return error.message || fallback
  }
  if (error instanceof Error) return error.message
  return fallback
}
