function resolveApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_URL || '/api').trim().replace(/\/$/, '')
  if (envUrl === '/api' || envUrl.endsWith('/api')) {
    return envUrl
  }
  return `${envUrl}/api`
}

const API_URL = resolveApiBaseUrl()
const TOKEN_KEY = 'corsa.auth'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message)
  }
}

export function getStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? JSON.parse(raw).accessToken as string : null
  } catch {
    return null
  }
}

export function assetUrl(path: string) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  if (API_URL.endsWith('/api') && cleanPath.startsWith('/api/')) {
    return `${API_URL}${cleanPath.slice(4)}`
  }
  return `${API_URL}${cleanPath}`
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken()
  const isForm = options.body instanceof FormData
  const response = await fetch(assetUrl(path), {
    ...options,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (response.status === 401 && token) {
    localStorage.removeItem(TOKEN_KEY)
    window.dispatchEvent(new Event('auth:expired'))
  }

  if (!response.ok) {
    const raw = await response.text()
    let details: unknown = raw
    if (raw) {
      try { details = JSON.parse(raw) } catch { /* resposta não JSON */ }
    }
    const record = details as Record<string, unknown> | null
    let validationMsg = ''
    if (record?.errors && typeof record.errors === 'object') {
      const errObj = record.errors as Record<string, string[]>
      const allMsgs = Object.values(errObj).flat().filter(Boolean)
      if (allMsgs.length > 0) {
        validationMsg = allMsgs.join(' ')
      }
    }
    const message = String(
      validationMsg ||
      record?.message ||
      record?.detail ||
      record?.title ||
      (response.status === 413 ? 'O arquivo enviado excede o limite máximo permitido de 5 MB.' : `Erro ${response.status}`)
    )
    throw new ApiError(message, response.status, details)
  }

  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('content-type') || ''
  return contentType.includes('application/json') ? response.json() : response.text() as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  blob: async (path: string) => {
    const token = getStoredToken()
    const response = await fetch(assetUrl(path), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!response.ok) throw new ApiError('Não foi possível carregar o arquivo.', response.status)
    return response.blob()
  },
}

export const authStorage = {
  key: TOKEN_KEY,
  read<T>() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') as T | null } catch { return null }
  },
  write(value: unknown) { localStorage.setItem(TOKEN_KEY, JSON.stringify(value)) },
  clear() { localStorage.removeItem(TOKEN_KEY) },
}
