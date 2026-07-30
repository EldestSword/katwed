export function normaliseYouTubeVideoId(value: string): string | null {
  const trimmed = value.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    const host = url.hostname.replace(/^www\./, '')
    let candidate = ''
    if (host === 'youtu.be') candidate = url.pathname.split('/').filter(Boolean)[0] ?? ''
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      candidate = url.searchParams.get('v') ?? ''
      if (!candidate) {
        const parts = url.pathname.split('/').filter(Boolean)
        if (['embed', 'shorts', 'live'].includes(parts[0] ?? '')) candidate = parts[1] ?? ''
      }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null
  } catch {
    return null
  }
}
