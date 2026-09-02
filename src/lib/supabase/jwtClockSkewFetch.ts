const JWT_ISSUED_AT_FUTURE = 'jwt issued at future'
const RETRY_DELAY_MS = 1000

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds))
}

async function isJwtIssuedAtFuture(response: Response): Promise<boolean> {
  if (response.ok) return false
  try {
    const body = await response.clone().text()
    return body.toLowerCase().includes(JWT_ISSUED_AT_FUTURE)
  } catch {
    return false
  }
}

export async function fetchWithJwtClockSkewRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  fetchImpl: typeof fetch = fetch,
  sleep: (milliseconds: number) => Promise<void> = delay,
): Promise<Response> {
  const first = await fetchImpl(input, init)
  if (!(await isJwtIssuedAtFuture(first))) return first

  await sleep(RETRY_DELAY_MS)
  return fetchImpl(input, init)
}
