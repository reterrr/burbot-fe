export interface ValueDisplay {
  kind: string | null
  rawValue: unknown
  label?: string | null
  target?: {
    type: 'business_object' | 'source'
    id: number
    entityId?: number
    entityName?: string | null
  }
  resolved?: boolean
  labelIsCurrent?: boolean
  itemKind?: string | null
  items?: ValueDisplay[]
}

export interface BusinessField {
  id: number
  name: string | null
  persistentKey?: string | null
  type?: string | null
  referenceEntity?: { id: number; name: string | null } | null
}

export interface BusinessValueContext {
  businessField?: BusinessField | null
  businessObject?: { id: number; name: string | null } | null
  businessObjectFieldId: number | null
  canonicalValueId: number | null
  canonicalValue: unknown
  canonicalValueScope?: 'current'
  canonicalDisplay?: ValueDisplay | null
}
