import { websiteUrl } from '../../lib/website-url'
interface SourceLabel {
  id: number
  url: string | null
  name?: string | null
}

export function sourceDomain(source: SourceLabel) {
  const url = websiteUrl(source.url)
  return url ? new URL(url).hostname : null
}

export function sourceTitle(source: SourceLabel) {
  return (
    source.name || sourceDomain(source) || source.url || `Source #${source.id}`
  )
}
