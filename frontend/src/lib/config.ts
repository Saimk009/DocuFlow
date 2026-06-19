/** Platform-level constants sourced from build-time env (with safe defaults). */
export const SUPER_ADMIN_EMAIL = (
  import.meta.env.VITE_SUPER_ADMIN_EMAIL ?? 'admin@docuflow.io'
).toLowerCase()
