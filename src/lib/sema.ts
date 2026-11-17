import type { SourceLocation } from '../api/models'

// These describe editor suggestions. The backend compiler owns validation.
export const FIELD_TYPES = [
  'String',
  'Text',
  'Integer',
  'BigInteger',
  'Float',
  'Decimal',
  'Boolean',
  'Date',
  'DateTime',
  'UUID',
  'JSON',
  'Reference',
  'Source',
] as const
export const FIELD_OPTIONS = [
  'persistent_key',
  'nullable',
  'unique',
  'index',
  'primary_key',
  'default',
  'min_length',
  'max_length',
  'pattern',
  'gt',
  'ge',
  'lt',
  'le',
  'precision',
  'scale',
] as const
export type FieldOption = (typeof FIELD_OPTIONS)[number]
export interface SchemaProblem {
  message: string
  location: SourceLocation
}

export const TYPE_NAMES: Record<string, string> = {
  string: 'String',
  text: 'Text',
  integer: 'Integer',
  biginteger: 'BigInteger',
  float: 'Float',
  decimal: 'Decimal',
  boolean: 'Boolean',
  date: 'Date',
  datetime: 'DateTime',
  uuid: 'UUID',
  json: 'JSON',
  reference: 'Reference',
  source: 'Source',
  str: 'String',
  int: 'Integer',
  bool: 'Boolean',
  dict: 'JSON',
}
