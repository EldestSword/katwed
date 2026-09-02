import { describe, expect, it, vi } from 'vitest'
import { fetchWithJwtClockSkewRetry } from './jwtClockSkewFetch'

describe('fetchWithJwtClockSkewRetry', () => {
  it('retries once after a transient JWT issued-at-future response', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('{"message":"JWT issued at future"}', { status: 401 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))
    const sleep = vi.fn().mockResolvedValue(undefined)

    const response = await fetchWithJwtClockSkewRetry(
      'https://example.test/rest/v1/rpc/host_list_quizzes',
      { method: 'POST' },
      fetchImpl as typeof fetch,
      sleep,
    )

    expect(response.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledOnce()
    expect(sleep).toHaveBeenCalledWith(1000)
  })

  it('does not retry unrelated failures', async () => {
    const response = new Response('{"message":"permission denied"}', { status: 401 })
    const fetchImpl = vi.fn().mockResolvedValue(response)
    const sleep = vi.fn().mockResolvedValue(undefined)

    const result = await fetchWithJwtClockSkewRetry(
      'https://example.test/rest/v1/rpc/host_list_quizzes',
      undefined,
      fetchImpl as typeof fetch,
      sleep,
    )

    expect(result).toBe(response)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('does not retry successful responses', async () => {
    const response = new Response('{}', { status: 200 })
    const fetchImpl = vi.fn().mockResolvedValue(response)
    const sleep = vi.fn().mockResolvedValue(undefined)

    const result = await fetchWithJwtClockSkewRetry(
      'https://example.test/rest/v1/rpc/host_list_quizzes',
      undefined,
      fetchImpl as typeof fetch,
      sleep,
    )

    expect(result).toBe(response)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })
})
