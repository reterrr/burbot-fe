import { websiteUrl } from '../../lib/website-url'
import type { BusinessField } from './display-contracts'

type SourceIdentity = { id: number; url: string | null; name?: string | null }

export function sourceDomain(source: Pick<SourceIdentity, 'url'>) {
  const url = websiteUrl(source.url)
  return url ? new URL(url).hostname : null
}

export function sourceTitle(source: SourceIdentity) {
  return source.name?.trim() || sourceDomain(source) || `Source #${source.id}`
}

export function businessFieldTitle(field: BusinessField) {
  return field.name || field.persistentKey || `Field #${field.id}`
}

export function businessFieldType(field: BusinessField) {
  if (!field.referenceEntity) return field.type
  const { id, name } = field.referenceEntity
  return `${field.type === 'list' ? 'list of references' : 'reference'} → ${name || `Entity #${id}`}`
}
