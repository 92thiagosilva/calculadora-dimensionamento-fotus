// Cliente HTTP central. Anexa o header de autenticacao dev (X-Dev-User-Email)
// em toda chamada e normaliza erros da API num formato previsivel.

export const API_BASE_URL = 'http://127.0.0.1:8010'

export const DEV_EMAIL_STORAGE_KEY = 'fotus_user_email'

function getStoredEmail(): string | null {
  try {
    return localStorage.getItem(DEV_EMAIL_STORAGE_KEY)
  } catch {
    return null
  }
}

/** Corpo de erro que a API retorna: `{detail: string | {code, message} | unknown}`. */
export interface ApiErrorBody {
  detail?: unknown
}

export class ApiError extends Error {
  status: number
  body: ApiErrorBody | null

  constructor(status: number, message: string, body: ApiErrorBody | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

/** Extrai uma mensagem legivel do `detail`, que pode ser string, objeto {code,message} ou lista de erros de validacao. */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const detail = err.body?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const first = detail[0]
      if (first && typeof first === 'object' && 'msg' in first) {
        return String((first as { msg: unknown }).msg)
      }
      return JSON.stringify(detail)
    }
    if (detail && typeof detail === 'object') {
      const obj = detail as Record<string, unknown>
      if (typeof obj.message === 'string') return obj.message
      return JSON.stringify(obj)
    }
    return err.message || `Erro (HTTP ${err.status})`
  }
  if (err instanceof Error) return err.message
  return 'Erro inesperado.'
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.replace(/^\//, ''), API_BASE_URL + '/')
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    }
  }
  return url.toString()
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query } = options
  const email = getStoredEmail()

  const headers: Record<string, string> = {}
  if (email) headers['X-Dev-User-Email'] = email
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!res.ok) {
    const errBody: ApiErrorBody | null =
      parsed && typeof parsed === 'object' ? (parsed as ApiErrorBody) : { detail: parsed }
    throw new ApiError(res.status, `HTTP ${res.status}`, errBody)
  }

  return parsed as T
}

export const apiClient = {
  get: <T>(path: string, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
