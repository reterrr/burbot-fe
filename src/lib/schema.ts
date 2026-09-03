import type { Field, Schema, SourceLocation, Type } from '../api/models'

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
] as const satisfies readonly Type[]

type EditableField = Omit<Field, 'location'>

export interface EditableEntity {
  name: string
  tablename?: string | null
  fields?: EditableField[]
}

export interface EditableSchema {
  entities?: EditableEntity[]
}

export interface SchemaOutlineEntity {
  name: string
  tablename?: string | null
  fields: Array<Pick<EditableField, 'name' | 'type'>>
}

const DEFAULT_SCHEMA: EditableSchema = {
  entities: [
    {
      name: 'Project',
      tablename: 'projects',
      fields: [
        {
          name: 'id',
          type: 'BigInteger',
          nullable: false,
          primary_key: true,
        },
        {
          name: 'name',
          type: 'String',
          nullable: false,
          index: true,
          min_length: 1,
          max_length: 255,
        },
        {
          name: 'budget',
          type: 'Decimal',
          precision: 12,
          scale: 2,
          ge: 0,
        },
      ],
    },
    {
      name: 'Recruitment',
      tablename: 'recruitments',
      fields: [
        {
          name: 'id',
          type: 'BigInteger',
          nullable: false,
          primary_key: true,
        },
        {
          name: 'project_id',
          type: 'Reference',
          nullable: false,
          index: true,
          reference: 'Project.id',
        },
        {
          name: 'status',
          type: 'String',
          nullable: false,
          max_length: 80,
        },
      ],
    },
  ],
}

export const DEFAULT_SCHEMA_SOURCE = JSON.stringify(DEFAULT_SCHEMA, null, 2)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function locationFor(
  sourceLines: string[],
  value: string,
  startLine: number,
): SourceLocation {
  const token = JSON.stringify(value)
  const foundLine = sourceLines.findIndex(
    (line, index) => index >= startLine && line.includes(token),
  )
  const lineIndex = foundLine === -1 ? startLine : foundLine
  const columnIndex = Math.max(sourceLines[lineIndex]?.indexOf(token) ?? 0, 0)

  return {
    line: lineIndex + 1,
    column: columnIndex + 1,
    end_line: lineIndex + 1,
    end_column: columnIndex + token.length + 1,
  }
}

export function parseSchemaSource(source: string): Schema {
  let raw: unknown

  try {
    raw = JSON.parse(source)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON'
    throw new Error(message)
  }

  if (!isRecord(raw) || !Array.isArray(raw.entities)) {
    throw new Error('The root must contain an entities array.')
  }

  const sourceLines = source.split('\n')
  let searchFromLine = 0

  const entities = raw.entities.map((candidate, entityIndex) => {
    if (!isRecord(candidate) || typeof candidate.name !== 'string') {
      throw new Error(`Entity ${entityIndex + 1} must have a name.`)
    }

    if (candidate.fields !== undefined && !Array.isArray(candidate.fields)) {
      throw new Error(`Fields for ${candidate.name} must be an array.`)
    }

    const entityLocation = locationFor(
      sourceLines,
      candidate.name,
      searchFromLine,
    )
    searchFromLine = entityLocation.line - 1

    const fields = (candidate.fields ?? []).map((fieldCandidate, fieldIndex) => {
      if (
        !isRecord(fieldCandidate) ||
        typeof fieldCandidate.name !== 'string' ||
        typeof fieldCandidate.type !== 'string'
      ) {
        throw new Error(
          `Field ${fieldIndex + 1} in ${candidate.name} needs a name and type.`,
        )
      }

      if (!FIELD_TYPES.includes(fieldCandidate.type as Type)) {
        throw new Error(
          `Unknown type “${fieldCandidate.type}” on ${candidate.name}.${fieldCandidate.name}.`,
        )
      }

      const fieldLocation = locationFor(
        sourceLines,
        fieldCandidate.name,
        searchFromLine,
      )
      searchFromLine = fieldLocation.line

      return {
        ...fieldCandidate,
        name: fieldCandidate.name,
        type: fieldCandidate.type as Type,
        location: fieldLocation,
      } as Field
    })

    return {
      name: candidate.name,
      location: entityLocation,
      tablename:
        typeof candidate.tablename === 'string' ? candidate.tablename : null,
      fields,
    }
  })

  return { entities }
}

export function getSchemaOutline(source: string): SchemaOutlineEntity[] {
  try {
    const parsed: unknown = JSON.parse(source)
    if (!isRecord(parsed) || !Array.isArray(parsed.entities)) return []

    return parsed.entities.flatMap((candidate) => {
      if (!isRecord(candidate) || typeof candidate.name !== 'string') return []

      const fields = Array.isArray(candidate.fields)
        ? candidate.fields.flatMap((fieldCandidate) => {
            if (
              !isRecord(fieldCandidate) ||
              typeof fieldCandidate.name !== 'string' ||
              typeof fieldCandidate.type !== 'string'
            ) {
              return []
            }

            return [
              {
                name: fieldCandidate.name,
                type: fieldCandidate.type as Type,
              },
            ]
          })
        : []

      return [
        {
          name: candidate.name,
          tablename:
            typeof candidate.tablename === 'string'
              ? candidate.tablename
              : null,
          fields,
        },
      ]
    })
  } catch {
    return []
  }
}

export function formatSchemaSource(source: string): string {
  const parsed: unknown = JSON.parse(source)
  return JSON.stringify(parsed, null, 2)
}

export function addEntityToSource(source: string): string {
  const parsed: unknown = JSON.parse(source)
  if (!isRecord(parsed)) throw new Error('The schema root must be an object.')

  const entities = Array.isArray(parsed.entities) ? [...parsed.entities] : []
  const existingNames = new Set(
    entities.flatMap((entity) =>
      isRecord(entity) && typeof entity.name === 'string' ? [entity.name] : [],
    ),
  )
  let suffix = entities.length + 1
  while (existingNames.has(`Entity${suffix}`)) suffix += 1

  entities.push({
    name: `Entity${suffix}`,
    tablename: `entity_${suffix}`,
    fields: [
      {
        name: 'id',
        type: 'BigInteger',
        nullable: false,
        primary_key: true,
      },
    ],
  })

  return JSON.stringify({ ...parsed, entities }, null, 2)
}

export const BURBOT_EDITOR_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['entities'],
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'fields'],
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            pattern: '^[A-Z][A-Za-z0-9_]*$',
            description: 'Stable logical name of the business entity.',
          },
          tablename: {
            type: ['string', 'null'],
            pattern: '^[a-z][a-z0-9_]*$',
            description: 'Optional PostgreSQL table name.',
          },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'type'],
              properties: {
                name: { type: 'string', minLength: 1 },
                type: { enum: FIELD_TYPES },
                nullable: { type: 'boolean', default: true },
                unique: { type: 'boolean', default: false },
                index: { type: 'boolean', default: false },
                primary_key: { type: 'boolean', default: false },
                default: {},
                min_length: { type: ['integer', 'null'], minimum: 0 },
                max_length: { type: ['integer', 'null'], minimum: 1 },
                pattern: { type: ['string', 'null'] },
                gt: { type: ['number', 'null'] },
                ge: { type: ['number', 'null'] },
                lt: { type: ['number', 'null'] },
                le: { type: ['number', 'null'] },
                precision: { type: ['integer', 'null'], minimum: 1 },
                scale: { type: ['integer', 'null'], minimum: 0 },
                reference: {
                  type: ['string', 'null'],
                  pattern: '^[A-Z][A-Za-z0-9_]*\\.[A-Za-z_][A-Za-z0-9_]*$',
                  description: 'Reference target in Entity.field form.',
                },
              },
            },
          },
        },
      },
    },
  },
} as const
