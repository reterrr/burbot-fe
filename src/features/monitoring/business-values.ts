export interface BusinessEntityDisplay {
  id: number
  name: string | null
}

export interface BusinessFieldDisplay extends BusinessEntityDisplay {
  persistentKey?: string | null
  kind?: string
  itemKind?: string | null
  referenceEntity?: BusinessEntityDisplay | null
}

export interface BusinessValueDisplay {
  kind: string
  rawValue: unknown
  label?: string | null
  labelBasis?: 'current' | null
  target?: {
    type: 'business_object' | 'source'
    id: number
    entityId?: number | null
    idText?: string | null
  } | null
  resolved?: boolean | null
  itemKind?: string | null
  items?: BusinessValueDisplay[] | null
}

export interface CanonicalValueContext {
  canonicalValue: unknown
  canonicalValueId: number | null
  canonicalDisplay?: BusinessValueDisplay | null
}

export function businessFieldType(field: BusinessFieldDisplay) {
  if (!field.kind || field.kind === 'unknown') return null
  const kind =
    field.kind === 'list' && field.itemKind && field.itemKind !== 'unknown'
      ? `list of ${field.itemKind} values`
      : field.kind
  const entity = field.referenceEntity
  return entity ? `${kind} → ${entity.name ?? `Entity #${entity.id}`}` : kind
}
