import type { Field, Schema, SourceLocation, Type } from '../api/models'

export const FIELD_TYPES = [
  'String', 'Text', 'Integer', 'BigInteger', 'Float', 'Decimal',
  'Boolean', 'Date', 'DateTime', 'UUID', 'JSON', 'Reference',
] as const satisfies readonly Type[]

export const TYPE_ALIASES: Readonly<Record<string, Type>> = {
  ...Object.fromEntries(FIELD_TYPES.map((type) => [type, type])),
  str: 'String', int: 'Integer', float: 'Float', bool: 'Boolean',
  date: 'Date', datetime: 'DateTime', dict: 'JSON',
}

export const FIELD_DEFAULTS = {
  nullable: true, unique: false, index: false, primary_key: false,
  default: null, min_length: null, max_length: null, pattern: null,
  gt: null, ge: null, lt: null, le: null, precision: null, scale: null,
  reference: null,
} as const

export type FieldOption = keyof typeof FIELD_DEFAULTS
export const FIELD_OPTIONS = Object.keys(FIELD_DEFAULTS) as FieldOption[]
export const TABLE_NAME_PATTERN = /^e_[a-z2-7]{52}$/
const RESERVED_ENTITY_NAMES = new Set<string>(['Entity', 'Field', ...FIELD_TYPES])
const IDENTIFIER = /^[_\p{XID_Start}][_\p{XID_Continue}]*$/u
const NUMERIC_TYPES = new Set<Type>(['Integer', 'BigInteger', 'Float', 'Decimal'])

export interface SchemaProblem {
  message: string
  location: SourceLocation
}

/** Mirrors the supplied backend Sema.validate rules, collecting editor diagnostics. */
export function validateSchema(schema: Schema): SchemaProblem[] {
  const problems: SchemaProblem[] = []
  const report = (message: string, location: SourceLocation) => problems.push({ message, location })
  const entityNames = new Set<string>()
  const tableNames = new Set<string>()

  for (const entity of schema.entities ?? []) {
    const at = entity.location
    if (RESERVED_ENTITY_NAMES.has(entity.name)) report(`Entity name '${entity.name}' is reserved`, at)
    if (entityNames.has(entity.name)) report(`Entity '${entity.name}' is already defined`, at)
    if (!IDENTIFIER.test(entity.name)) report(`Invalid entity name '${entity.name}'`, at)
    entityNames.add(entity.name)

    if (!TABLE_NAME_PATTERN.test(entity.tablename)) {
      report(`Invalid table name '${entity.tablename}'. Expected a Burbot-generated table identifier`, at)
    }
    if (tableNames.has(entity.tablename)) report(`Table name '${entity.tablename}' is already used by another entity`, at)
    tableNames.add(entity.tablename)

    const fieldNames = new Set<string>()
    let primaryKeys = 0
    for (const field of entity.fields ?? []) {
      if (field.name === 'id') report(`Field name '${field.name}' is reserved`, field.location)
      if (fieldNames.has(field.name)) {
        report(`Field '${field.name}' is already defined in entity '${entity.name}'`, field.location)
      }
      if (!IDENTIFIER.test(field.name)) report(`Invalid field name '${field.name}'`, field.location)
      fieldNames.add(field.name)
      validateField(field, (message) => report(message, field.location))
      if (field.primary_key) primaryKeys += 1
    }
    if (primaryKeys > 1) report(`Entity '${entity.name}' has multiple primary key fields`, at)
  }

  for (const entity of schema.entities ?? []) {
    for (const field of entity.fields ?? []) {
      if (field.type === 'Reference' && field.reference != null && !entityNames.has(field.reference)) {
        report(`Unknown referenced entity '${field.reference}'`, field.location)
      }
    }
  }
  return problems
}

function validateField(field: Field, report: (message: string) => void) {
  const value = { ...FIELD_DEFAULTS, ...field }
  for (const option of ['nullable', 'unique', 'index', 'primary_key'] as const) {
    if (typeof value[option] !== 'boolean') report(`'${option}' must be a boolean`)
  }
  if (value.type !== 'String' && [value.min_length, value.max_length, value.pattern].some((v) => v != null)) {
    report(`String constraints cannot be used with type '${value.type}'`)
  }
  if (!NUMERIC_TYPES.has(value.type) && [value.gt, value.ge, value.lt, value.le].some((v) => v != null)) {
    report(`Numeric constraints cannot be used with type '${value.type}'`)
  }
  if (value.type !== 'Decimal' && (value.precision != null || value.scale != null)) {
    report('precision/scale can only be used with Decimal')
  }
  if (value.primary_key && value.nullable) report(`Primary key field '${value.name}' cannot be nullable`)

  if (value.type === 'String') {
    if (value.min_length != null && (!Number.isInteger(value.min_length) || value.min_length < 0)) {
      report("'min_length' must be a non-negative integer")
    }
    if (value.max_length != null && (!Number.isInteger(value.max_length) || value.max_length <= 0)) {
      report("'max_length' must be a positive integer")
    }
    if (value.min_length != null && value.max_length != null && value.min_length > value.max_length) {
      report("'min_length' cannot be greater than 'max_length'")
    }
    // Python patterns must not be compiled using JavaScript's different regex dialect.
    if (value.pattern != null && typeof value.pattern !== 'string') report("'pattern' must be a string")
  }

  if (NUMERIC_TYPES.has(value.type)) {
    if (value.gt != null && value.ge != null) report("'gt' and 'ge' cannot be used together")
    if (value.lt != null && value.le != null) report("'lt' and 'le' cannot be used together")
    if ([value.gt, value.ge, value.lt, value.le].some((v) => v != null && (typeof v !== 'number' || !Number.isFinite(v)))) {
      report('Numeric bounds must be numbers')
    }
    const lower = value.gt ?? value.ge
    const upper = value.lt ?? value.le
    // Keep equality behavior identical to Sema; it only rejects lower > upper.
    if (lower != null && upper != null && lower > upper) report('Lower numeric bound cannot be greater than upper bound')
  }

  if (value.type === 'Decimal') {
    if (value.precision != null && (!Number.isInteger(value.precision) || value.precision <= 0)) {
      report("'precision' must be a positive integer")
    }
    if (value.scale != null && (!Number.isInteger(value.scale) || value.scale < 0)) {
      report("'scale' must be a non-negative integer")
    }
    if (value.precision != null && value.scale != null && value.scale > value.precision) {
      report("'scale' cannot be greater than 'precision'")
    }
  }

  if (value.type === 'Reference') {
    if (value.reference == null) report(`Reference field '${value.name}' must specify a target entity`)
    else if (typeof value.reference !== 'string') report("'reference' must be a string")
  } else if (value.reference != null) {
    report(`Field '${value.name}' is not a Reference but has a reference target`)
  }
}
