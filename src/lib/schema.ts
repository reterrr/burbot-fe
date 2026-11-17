import {
  parse,
  unparse,
  type ASTNode,
  type ExprNode,
  type StmtNode,
} from 'py-ast'
import type { Schema, SourceLocation } from '../api/models'
import { FIELD_OPTIONS, TYPE_NAMES } from './sema.ts'

export interface SchemaOutlineEntity {
  name: string
  kind: 'entity' | 'enum'
  location: SourceLocation
  fields: Array<{ name: string; type: string; location: SourceLocation }>
}

// Outline recovery also works while typing an incomplete statement. Validation
// and compilation into API schemas belong to the backend compiler.
export function getSchemaOutline(source: string): SchemaOutlineEntity[] {
  const outline: SchemaOutlineEntity[] = []
  let active: SchemaOutlineEntity | null = null
  source.split('\n').forEach((line, index) => {
    const location = {
      line: index + 1,
      column: 1,
      end_line: index + 1,
      end_column: line.length + 1,
    }
    const declaration = line.match(
      /^class\s+([\p{XID_Start}_][\p{XID_Continue}]*)\s*\(\s*(Entity|Enum)\b/u,
    )
    if (declaration) {
      active = {
        name: declaration[1],
        kind: declaration[2] === 'Enum' ? 'enum' : 'entity',
        fields: [],
        location,
      }
      outline.push(active)
      return
    }
    if (/^\S/.test(line) && !line.startsWith('#')) active = null
    const field = line.match(
      /^ {4}([\p{XID_Start}_][\p{XID_Continue}]*)\s*(?::|=)\s*([\p{XID_Start}_][\p{XID_Continue}]*)/u,
    )
    if (field && !field[1].startsWith('_') && active?.kind === 'entity') {
      active.fields.push({
        name: field[1],
        type: field[2],
        location: { ...location, column: 5 },
      })
    }
  })
  return outline
}

export function formatSchemaSource(source: string): string {
  return unparse(parse(source, { comments: true })).trimEnd() + '\n'
}

export function createDefaultSchemaSource(): string {
  return `# Compile to validate and preview. Execute applies definitions and named objects.
# Keep persistent_key unchanged when renaming a field.

class ProjectStatus(Enum):
    OPEN = "open"
    CLOSED = "closed"

class Project(Entity):
    name: String(persistent_key="name", nullable=False, unique=True, max_length=100)
    budget: Decimal(persistent_key="budget", precision=12, scale=2, ge=0)
    status: ProjectStatus(persistent_key="status", default=ProjectStatus.OPEN)

class Recruitment(Entity):
    project: Reference(Project, persistent_key="project", nullable=False, index=True)
    closes_on: Date(persistent_key="closes_on")

# Optional named objects are upserted when this program is executed.
# project = Project(name="Example project", budget="100.00")
# recruitment = Recruitment(project=project, closes_on="2026-12-15")
`
}

export function addEntityToSource(source: string): string {
  const names = new Set(getSchemaOutline(source).map((item) => item.name))
  let suffix = 1
  while (names.has(`NewEntity${suffix}`)) suffix += 1
  return `${source.trimEnd()}\n\nclass NewEntity${suffix}(Entity):\n    name: String(persistent_key="name", nullable=False, max_length=100)\n`
}

export function pythonLiteral(value: unknown): string {
  if (value == null) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'string' || typeof value === 'number')
    return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(pythonLiteral).join(', ')}]`
  if (typeof value === 'object')
    return `{${Object.entries(value)
      .map(([key, item]) => `${JSON.stringify(key)}: ${pythonLiteral(item)}`)
      .join(', ')}}`
  throw new Error('Unsupported literal value')
}

/** Reconstruct editable declarations with durable table and field identities. */
export function schemaToSource(schema: Schema): string {
  const enums = (schema.enums ?? []).map(
    (item) =>
      `class ${item.name}(Enum):\n${item.members.map((member) => `    ${member.name} = ${pythonLiteral(member.value)}`).join('\n')}`,
  )
  const entities = (schema.entities ?? []).map((entity) => {
    const fields = (entity.fields ?? []).map((field) => {
      const kind = field.type.toLowerCase()
      const type =
        kind === 'enum' ? field.enum_type : (TYPE_NAMES[kind] ?? field.type)
      const options = FIELD_OPTIONS.flatMap((key) => {
        if (key === 'default')
          return field.has_default
            ? [`default=${pythonLiteral(field.default)}`]
            : []
        const value = field[key]
        if (key === 'nullable' && value === true) return []
        if (['unique', 'index', 'primary_key'].includes(key) && value === false)
          return []
        return value == null ? [] : [`${key}=${pythonLiteral(value)}`]
      })
      if (!field.persistent_key)
        options.unshift(`persistent_key=${pythonLiteral(field.name)}`)
      if (kind === 'reference') options.unshift(pythonLiteral(field.reference))
      return `    ${field.name}: ${type}(${options.join(', ')})`
    })
    return `class ${entity.name}(Entity, tablename=${pythonLiteral(entity.tablename)}):\n${fields.join('\n') || '    pass'}`
  })
  return [...enums, ...entities].join('\n\n') + '\n'
}

/** Old drafts remain in their original storage keys as a backup. */
export function migrateLegacyDraft(source: string): string {
  if (source.trimStart().startsWith('{')) {
    try {
      const schema = JSON.parse(source) as Schema
      if (!Array.isArray(schema.entities)) return source
      for (const entity of schema.entities)
        for (const field of entity.fields ?? []) {
          field.has_default ??= field.default != null
        }
      return schemaToSource(schema)
    } catch {
      return source
    }
  }
  let tree: ReturnType<typeof parse>
  try {
    tree = parse(source)
  } catch {
    return source
  }
  const edits: Array<{ start: number; end: number; text: string }> = []
  const lines = source.split('\n')
  const offset = (line: number) =>
    lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0)
  const replace = (node: ASTNode, text: string) =>
    edits.push({
      start: offset(node.lineno!),
      end: offset(node.end_lineno! + 1),
      text: text + '\n',
    })
  const literal = (node: ExprNode) => unparse(node).trim()
  for (const node of tree.body) {
    if (node.nodeType !== 'ClassDef' || node.bases.length) continue
    // Unsupported legacy constructs are left intact for the server to diagnose.
    edits.push({
      start: offset(node.lineno!),
      end: offset(node.lineno! + 1),
      text: `class ${node.name}(Entity):\n`,
    })
    for (const member of node.body) {
      const target =
        member.nodeType === 'AnnAssign'
          ? member.target
          : member.nodeType === 'Assign' && member.targets.length === 1
            ? member.targets[0]
            : null
      if (target?.nodeType !== 'Name') continue
      if (['table_name', 'tablename', '__tablename__'].includes(target.id)) {
        const value =
          member.nodeType === 'AnnAssign'
            ? (member.value ?? member.annotation)
            : (member as Extract<StmtNode, { nodeType: 'Assign' }>).value
        replace(member, `    __tablename__ = ${literal(value)}`)
        continue
      }
      if (member.nodeType !== 'AnnAssign') continue
      const annotation = member.annotation
      let type =
        annotation.nodeType === 'Name'
          ? (TYPE_NAMES[annotation.id] ?? annotation.id)
          : ''
      let reference: string | undefined
      if (
        annotation.nodeType === 'Subscript' &&
        annotation.value.nodeType === 'Name' &&
        annotation.value.id === 'Reference'
      ) {
        type = 'Reference'
        reference =
          annotation.slice.nodeType === 'Name'
            ? JSON.stringify(annotation.slice.id)
            : literal(annotation.slice)
      }
      if (!type) continue
      const options = [`persistent_key=${JSON.stringify(target.id)}`]
      const value = member.value
      if (
        value?.nodeType === 'Call' &&
        value.func.nodeType === 'Name' &&
        value.func.id === 'Field'
      ) {
        for (const keyword of value.keywords) {
          if (keyword.arg === 'reference') reference = literal(keyword.value)
          else options.push(`${keyword.arg}=${literal(keyword.value)}`)
        }
      } else if (value) options.push(`default=${literal(value)}`)
      if (type === 'Reference' && reference) options.unshift(reference)
      replace(member, `    ${target.id}: ${type}(${options.join(', ')})`)
    }
  }
  for (const edit of edits.sort((a, b) => b.start - a.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
  return source
}

/** Backend columns count Unicode code points; Monaco columns count UTF-16 units. */
export function editorLocation(
  location: SourceLocation,
  source: string,
): SourceLocation {
  const lines = source.split('\n')
  const convert = (line: number, column: number) =>
    [...(lines[line - 1] ?? '')].slice(0, column - 1).join('').length + 1
  return {
    ...location,
    column: convert(location.line, location.column),
    end_column: convert(location.end_line, location.end_column),
  }
}
