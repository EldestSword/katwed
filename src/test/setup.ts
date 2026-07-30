import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

class TestBroadcastChannel {
  static channels = new Map<string, Set<TestBroadcastChannel>>()
  readonly listeners = new Set<(event: MessageEvent) => void>()
  constructor(readonly name: string) {
    const members = TestBroadcastChannel.channels.get(name) ?? new Set()
    members.add(this)
    TestBroadcastChannel.channels.set(name, members)
  }
  postMessage(data: unknown) {
    for (const member of TestBroadcastChannel.channels.get(this.name) ?? []) {
      if (member !== this) member.listeners.forEach((listener) => listener(new MessageEvent('message', { data })))
    }
  }
  addEventListener(_type: string, listener: EventListener) {
    this.listeners.add(listener as (event: MessageEvent) => void)
  }
  removeEventListener(_type: string, listener: EventListener) {
    this.listeners.delete(listener as (event: MessageEvent) => void)
  }
  close() {
    TestBroadcastChannel.channels.get(this.name)?.delete(this)
  }
  dispatchEvent() { return true }
  onmessage = null
  onmessageerror = null
}

Object.defineProperty(globalThis, 'BroadcastChannel', { value: TestBroadcastChannel, writable: true })
