import { websiteUrl } from '../../lib/website-url'
import type { Source } from './api'

export function sourceDomain(source: Source) {
  const url = websiteUrl(source.url)
  return url ? new URL(url).hostname : null
}

export function sourceTitle(source: Source) {
  return source.name ?? sourceDomain(source) ?? `Source #${source.id}`
}
