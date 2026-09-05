import { parse, unparse, type ASTNode, type ExprNode, type StmtNode } from 'py-ast'
import type { Entity, Field, Schema, SourceLocation, Type } from '../api/models'
import {
  FIELD_DEFAULTS, FIELD_OPTIONS, TYPE_ALIASES, validateSchema, type SchemaProblem,
} from './sema.ts'

type AnnAssign = Extract<StmtNode, { nodeType: 'AnnAssign' }>

export interface SchemaOutlineEntity {
  name: string
  tablename: string
  location: SourceLocation
  fields: Array<Pick<Field, 'name' | 'type' | 'location'>>
}

export interface SchemaAnalysis {
  schema: Schema | null
  outline: SchemaOutlineEntity[]
  problems: SchemaProblem[]
}

export class SchemaSourceError extends Error {
  readonly location: SourceLocation

  constructor(message: string, location: SourceLocation) {
    super(message)
    this.name = 'SchemaSourceError'
    this.location = location
  }
}

// py-ast uses UTF-8 byte offsets. Monaco and the exposed SourceLocation use
// one-based UTF-16 columns, including for non-ASCII identifiers and literals.
function locationFor(node: ASTNode, source: string): SourceLocation {
  const lines = source.split('\n')
  const line = Math.max(1, Math.min(node.lineno ?? 1, lines.length))
  const endLine = Math.max(line, Math.min(node.end_lineno ?? line, lines.length))
  const columnFor = (lineNumber: number, bytes: number) => {
    let consumed = 0
    let column = 1
    for (const char of lines[lineNumber - 1] ?? '') {
      if (consumed >= bytes) break
      consumed += new TextEncoder().encode(char).length
      column += char.length
    }
    return column
  }
  const column = columnFor(line, node.col_offset ?? 0)
  const endColumn = columnFor(endLine, node.end_col_offset ?? (node.col_offset ?? 0) + 1)
  return {
    line, column, end_line: endLine,
    end_column: endLine === line ? Math.max(column + 1, endColumn) : endColumn,
  }
}

function syntaxProblem(error: unknown, source: string): SchemaProblem {
  const message = error instanceof Error ? error.message : 'Invalid schema source'
  const match = message.match(/(?:at )?line (\d+)(?:,? column (\d+))?/i)
  const node = error as Partial<ASTNode> | null
  const location = locationFor({
    nodeType: 'Error',
    lineno: node?.lineno ?? (match ? Number(match[1]) : 1),
    col_offset: node?.col_offset ?? (match?.[2] ? Number(match[2]) : 0),
    end_lineno: node?.end_lineno,
    end_col_offset: node?.end_col_offset,
  }, source)
  const lines = source.split('\n')
  // EOF errors should point at the unfinished statement, not a trailing empty line.
  if (!lines[location.line - 1]?.trim() && location.line === lines.length) {
    const last = lines.findLastIndex((line) => line.trim())
    if (last >= 0) {
      location.line = location.end_line = last + 1
      location.column = lines[last].length + 1
      location.end_column = location.column + 1
    }
  }
  return {
    message: message.replace(/ at line \d+, column \d+$/, ''),
    location,
  }
}

function fail(message: string, node: ASTNode, source: string): never {
  throw new SchemaSourceError(message, locationFor(node, source))
}

type Literal = string | number | boolean | null | Literal[] | { [key: string]: Literal }

/** Reads only literal data. Never executes Python, JS, calls, or expressions. */
function readLiteral(node: ExprNode, source: string): Literal {
  if (node.nodeType === 'Constant') {
    const value: unknown = node.value
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
        fail('Integer literal exceeds JavaScript’s safe range; use a string default to preserve it exactly', node, source)
      }
      return value
    }
  }
  if (node.nodeType === 'UnaryOp' && ['USub', 'UAdd'].includes(node.op.nodeType)) {
    const value = readLiteral(node.operand, source)
    if (typeof value === 'number') return node.op.nodeType === 'USub' ? -value : value
  }
  if (node.nodeType === 'List' || node.nodeType === 'Tuple') {
    return node.elts.map((item) => readLiteral(item, source))
  }
  if (node.nodeType === 'Dict') {
    const entries = node.keys.map((key, index): [string, Literal] => {
      if (!key) fail('Dictionary unpacking is not supported', node, source)
      const name = readLiteral(key, source)
      if (typeof name !== 'string') fail('Dictionary keys must be strings', key, source)
      return [name, readLiteral(node.values[index], source)]
    })
    return Object.fromEntries(entries)
  }
  fail('Expected a literal: string, number, True, False, None, list, or dictionary', node, source)
}

function typeFor(node: ExprNode, entityNames: Set<string>, source: string): Pick<Field, 'type' | 'reference'> {
  if (node.nodeType === 'Name') {
    if (Object.hasOwn(TYPE_ALIASES, node.id)) return { type: TYPE_ALIASES[node.id] }
    if (entityNames.has(node.id)) return { type: 'Reference', reference: node.id }
    fail(`Unknown field type '${node.id}'`, node, source)
  }
  if (node.nodeType === 'Subscript' && node.value.nodeType === 'Name' && node.value.id === 'Reference') {
    const target = node.slice.nodeType === 'Name' ? node.slice.id : readLiteral(node.slice, source)
    if (typeof target !== 'string') fail('Reference target must be an entity name', node.slice, source)
    return { type: 'Reference', reference: target }
  }
  fail('Expected a Burbot type, Python type alias, or Reference[Entity]', node, source)
}

function parseField(statement: AnnAssign, entityNames: Set<string>, source: string): Field {
  if (statement.target.nodeType !== 'Name' || !statement.simple) {
    fail('A field must have a simple name, for example name: str', statement.target, source)
  }
  const type = typeFor(statement.annotation, entityNames, source)
  const options: Record<string, Literal> = {}
  const value = statement.value
  if (value?.nodeType === 'Call') {
    if (value.func.nodeType !== 'Name' || value.func.id !== 'Field') {
      fail('Only Field(...) can configure a field', value, source)
    }
    if (value.args.length) fail('Field(...) accepts named options only; use default= for a default value', value, source)
    for (const keyword of value.keywords) {
      if (!keyword.arg || !FIELD_OPTIONS.includes(keyword.arg as typeof FIELD_OPTIONS[number])) {
        fail(keyword.arg ? `Unknown Field option '${keyword.arg}'` : 'Field option unpacking is not supported', keyword, source)
      }
      if (Object.hasOwn(options, keyword.arg)) fail(`Field option '${keyword.arg}' is already specified`, keyword, source)
      options[keyword.arg] = readLiteral(keyword.value, source)
    }
  } else if (value) {
    options.default = readLiteral(value, source)
  }
  if (type.reference && Object.hasOwn(options, 'reference') && options.reference !== type.reference) {
    fail('Reference annotation and Field(reference=...) must name the same entity', statement, source)
  }
  // Runtime option types are checked by validateSchema, without JS truthiness/coercion.
  return {
    ...FIELD_DEFAULTS, ...type, ...options,
    name: statement.target.id,
    location: locationFor(statement, source),
  } as Field
}

function isDocstring(statement: StmtNode): boolean {
  return statement.nodeType === 'Expr' && statement.value.nodeType === 'Constant' && typeof statement.value.value === 'string'
}

const TABLE_NAMES = new Set(['table_name', 'tablename', '__tablename__'])

export function analyzeSchemaSource(source: string): SchemaAnalysis {
  let module: ReturnType<typeof parse>
  try {
    module = parse(source, { filename: 'burbot-schema.py' })
  } catch (error) {
    return { schema: null, outline: recoverOutline(source), problems: [syntaxProblem(error, source)] }
  }

  const problems: SchemaProblem[] = []
  const entities: Entity[] = []
  const entityNames = new Set(module.body.flatMap((node) => node.nodeType === 'ClassDef' ? [node.name] : []))
  const collect = (work: () => void) => {
    try { work() } catch (error) {
      if (!(error instanceof SchemaSourceError)) throw error
      problems.push({ message: error.message, location: error.location })
    }
  }

  for (const [index, statement] of module.body.entries()) {
    if (index === 0 && isDocstring(statement)) continue
    if (statement.nodeType !== 'ClassDef') {
      problems.push({ message: 'Only class declarations are allowed at the top level', location: locationFor(statement, source) })
      continue
    }
    const entity: Entity = {
      name: statement.name, tablename: '', fields: [], location: locationFor(statement, source),
    }
    entities.push(entity)
    if (statement.bases.length || statement.keywords.length || statement.decorator_list.length || statement.type_params.length) {
      problems.push({ message: 'Entity classes cannot have bases, decorators, or type parameters', location: entity.location })
    }
    let hasTableName = false
    for (const [bodyIndex, member] of statement.body.entries()) {
      if ((bodyIndex === 0 && isDocstring(member)) || member.nodeType === 'Pass') continue
      collect(() => {
        const target = member.nodeType === 'AnnAssign' ? member.target
          : member.nodeType === 'Assign' && member.targets.length === 1 ? member.targets[0] : null
        if (target?.nodeType === 'Name' && TABLE_NAMES.has(target.id)) {
          if (hasTableName) fail(`Entity '${entity.name}' already specifies a table name`, member, source)
          hasTableName = true
          const value = member.nodeType === 'AnnAssign' ? member.value ?? member.annotation
            : member.nodeType === 'Assign' ? member.value : null
          if (!value) fail('Table name must be a string literal', member, source)
          const tableName = readLiteral(value, source)
          if (typeof tableName !== 'string') fail('Table name must be a string literal', value, source)
          entity.tablename = tableName
          return
        }
        if (member.nodeType !== 'AnnAssign') {
          fail('Expected a typed field, for example name: str = Field(max_length=100)', member, source)
        }
        entity.fields!.push(parseField(member, entityNames, source))
      })
    }
    if (!hasTableName) {
      problems.push({ message: `Entity '${entity.name}' must specify table_name: "..."`, location: entity.location })
    }
  }

  const schema: Schema = { entities }
  problems.push(...validateSchema(schema))
  return {
    schema: problems.length ? null : schema,
    outline: entities.map((entity) => ({ ...entity, fields: entity.fields ?? [] })),
    problems,
  }
}

export function parseSchemaSource(source: string): Schema {
  const analysis = analyzeSchemaSource(source)
  if (!analysis.schema) {
    const first = analysis.problems[0]
    throw new SchemaSourceError(first.message, first.location)
  }
  return analysis.schema
}

// Keep navigation and reference completions usable while a statement is incomplete.
function recoverOutline(source: string): SchemaOutlineEntity[] {
  const entities: SchemaOutlineEntity[] = []
  source.split('\n').forEach((line, index) => {
    const entity = line.match(/^class\s+([_\p{XID_Start}][_\p{XID_Continue}]*)/u)
    const location = { line: index + 1, column: 1, end_line: index + 1, end_column: line.length + 1 }
    if (entity) entities.push({ name: entity[1], tablename: '', fields: [], location })
    const field = line.match(/^\s+([_\p{XID_Start}][_\p{XID_Continue}]*)\s*:\s*(\w+)/u)
    if (field && !TABLE_NAMES.has(field[1])) {
      const type = Object.hasOwn(TYPE_ALIASES, field[2]) ? TYPE_ALIASES[field[2]] : 'Reference'
      entities.at(-1)?.fields.push({ name: field[1], type, location })
    }
  })
  return entities
}

export function getSchemaOutline(source: string): SchemaOutlineEntity[] {
  return analyzeSchemaSource(source).outline
}

export function formatSchemaSource(source: string): string {
  try {
    return unparse(parse(source, { comments: true })).trimEnd() + '\n'
  } catch (error) {
    const problem = syntaxProblem(error, source)
    throw new SchemaSourceError(problem.message, problem.location)
  }
}

/** 256 random bits, base32 without padding: the backend's e_[a-z2-7]{52}. */
export function generateTableName(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567'
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  let output = 'e_'
  let bits = 0
  let buffer = 0
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += alphabet[(buffer >>> bits) & 31]
    }
  }
  if (bits) output += alphabet[(buffer << (5 - bits)) & 31]
  return output
}

export function createDefaultSchemaSource(): string {
  return `# Define entities below. Keep table_name stable when renaming a class.
# Burbot creates id automatically. Reference targets are entity names.

class Project:
    table_name: "${generateTableName()}"
    name: str = Field(nullable=False, unique=True, max_length=100)
    budget: Decimal = Field(precision=12, scale=2, ge=0)

class Recruitment:
    table_name: "${generateTableName()}"
    project_id: Reference = Field(reference="Project", nullable=False, index=True)
    status: str = Field(nullable=False, max_length=80, default="open")
`
}

export function addEntityToSource(source: string): string {
  const existing = new Set(getSchemaOutline(source).map((entity) => entity.name))
  let suffix = existing.size + 1
  while (existing.has(`Entity${suffix}`)) suffix += 1
  return `${source.trimEnd()}${source.trim() ? '\n\n' : ''}class Entity${suffix}:
    table_name: "${generateTableName()}"
    name: str = Field(nullable=False, max_length=100)
`
}

function pythonLiteral(value: unknown): string {
  if (value == null) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'string' || typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(pythonLiteral).join(', ')}]`
  if (typeof value === 'object') {
    return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${pythonLiteral(item)}`).join(', ')}}`
  }
  throw new Error('Unsupported draft value')
}

/** Convert existing editable JSON without silently changing identities or constraints. */
export function migrateLegacyDraft(source: string): string {
  if (!source.trimStart().startsWith('{')) return source
  try {
    const schema = JSON.parse(source) as Schema
    if (!Array.isArray(schema.entities)) return source
    return schema.entities.map((entity) => {
      if (typeof entity.name !== 'string' || typeof entity.tablename !== 'string') throw new Error('Invalid legacy entity')
      const fields = (entity.fields ?? []).map((field) => {
        if (typeof field.name !== 'string' || typeof field.type !== 'string') throw new Error('Invalid legacy field')
        const options = FIELD_OPTIONS.filter((key) => Object.hasOwn(field, key))
          .map((key) => `${key}=${pythonLiteral(field[key])}`)
        const type: string = ({ String: 'str', Integer: 'int', Float: 'float', Boolean: 'bool' } as Partial<Record<Type, string>>)[field.type] ?? field.type
        return `    ${field.name}: ${type}${options.length ? ` = Field(${options.join(', ')})` : ''}`
      })
      return [`class ${entity.name}:`, `    table_name: ${JSON.stringify(entity.tablename)}`, ...fields].join('\n')
    }).join('\n\n') + '\n'
  } catch {
    return source
  }
}
