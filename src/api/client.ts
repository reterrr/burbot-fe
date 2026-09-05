type BurbotGlobal = typeof globalThis & {
  __BURBOT_API_BASE_URL__?: string
}

const apiBaseUrl =
  ((globalThis as BurbotGlobal).__BURBOT_API_BASE_URL__ ?? '')
  .trim()
  .replace(/\/+$/, '')

function getRequestUrl(path: string): string {
  if (!apiBaseUrl || /^https?:\/\//i.test(path)) return path
  return `${apiBaseUrl}/${path.replace(/^\/+/, '')}`
}

async function getResponseBody(response: Response): Promise<unknown> {
  if ([204, 205, 304].includes(response.status)) return null

  const body = await response.text()
  if (!body) return null

  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) return JSON.parse(body)
  return body
}

export async function apiClient<T>(
  path: string,
  options: RequestInit,
): Promise<T> {
  const response = await fetch(getRequestUrl(path), options)
  const data = await getResponseBody(response)

  return {
    data,
    status: response.status,
    headers: response.headers,
  } as T
}
