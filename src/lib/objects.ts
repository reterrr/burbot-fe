import type {
  AssignFieldValuesRequest,
  BusinessObjectRead,
  EntityDefinitionRead,
} from '../api/models'

export function parseNamedValues(source: string): Record<string, unknown> {
  const values: unknown = JSON.parse(source)
  if (values === null || typeof values !== 'object' || Array.isArray(values))
    throw new Error('Values must be a JSON object keyed by field name.')
  return values as Record<string, unknown>
}

export function editableFields(entity: EntityDefinitionRead) {
  return entity.fields.filter(
    (field) =>
      field.status === 'ACTIVE' &&
      field.key !== 'id' &&
      field.definition.system !== true,
  )
}

export function createValues(
  entity: EntityDefinitionRead,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const fields = new Map(
    editableFields(entity).map((field) => [field.key, field]),
  )
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      const field = fields.get(key)
      if (!field)
        throw new Error(`Unknown, inactive, or read-only field: ${key}`)
      return [field.field_id, value]
    }),
  )
}

export function objectValues(
  entity: EntityDefinitionRead,
  object: BusinessObjectRead,
): Record<string, unknown> {
  return Object.fromEntries(
    editableFields(entity).flatMap((field) => {
      const slot = object.fields.find(
        (item) => item.business_entity_field_id === field.field_id,
      )
      return slot && slot.value_id != null ? [[field.key, slot.value]] : []
    }),
  )
}

export function assignValues(
  entity: EntityDefinitionRead,
  object: BusinessObjectRead,
  values: Record<string, unknown>,
): AssignFieldValuesRequest {
  const byEntityField = createValues(entity, values)
  if (!Object.keys(byEntityField).length)
    throw new Error('Provide at least one field value to update.')
  const field_values: Record<string, unknown> = {},
    expected_value_ids: Record<string, number | null> = {}
  for (const [id, value] of Object.entries(byEntityField)) {
    const slot = object.fields.find(
      (field) => field.business_entity_field_id === Number(id),
    )
    if (!slot)
      throw new Error(
        'This object has no slot for a new field. Sync fields, then retry.',
      )
    field_values[slot.object_field_id] = value
    expected_value_ids[slot.object_field_id] = slot.value_id ?? null
  }
  return { field_values, expected_value_ids }
}
