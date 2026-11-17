import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addEntityToSource,
  createDefaultSchemaSource,
  editorLocation,
  formatSchemaSource,
  getSchemaOutline,
  migrateLegacyDraft,
  schemaToSource,
} from '../src/lib/schema.ts'
import {
  getFieldCompletionContext,
  suggestedFieldOptions,
} from '../src/lib/schema-language.ts'

const table = `e_${'a'.repeat(52)}`
const location = { line: 1, column: 1, end_line: 1, end_column: 2 }
export const exampleSchema = {
  enums: [
    {
      name: 'Status',
      location,
      members: [{ name: 'OPEN', value: 'open', location }],
    },
  ],
  entities: [
    {
      name: 'Project',
      tablename: table,
      location,
      fields: [
        {
          name: 'title',
          persistent_key: 'name',
          type: 'string',
          location,
          nullable: false,
          has_default: false,
        },
        {
          name: 'status',
          persistent_key: 'status',
          type: 'enum',
          enum_type: 'Status',
          location,
          default: 'open',
          has_default: true,
        },
        {
          name: 'parent',
          persistent_key: 'parent',
          type: 'reference',
          reference: 'Project',
          location,
        },
        { name: 'source', persistent_key: 'source', type: 'source', location },
        {
          name: 'settings',
          persistent_key: 'settings',
          type: 'json',
          location,
          default: null,
          has_default: true,
        },
      ],
    },
  ],
}

test('saved schemas preserve entity identities, persistent field keys, enums, Source, and explicit null defaults', () => {
  const source = schemaToSource(exampleSchema)
  assert.ok(source.includes(`class Project(Entity, tablename="${table}"):`))
  assert.match(source, /title: String\(persistent_key="name", nullable=False\)/)
  assert.match(
    source,
    /status: Status\(persistent_key="status", default="open"\)/,
  )
  assert.match(
    source,
    /parent: Reference\("Project", persistent_key="parent"\)/,
  )
  assert.match(source, /source: Source\(persistent_key="source"\)/)
  assert.match(
    source,
    /settings: JSON\(persistent_key="settings", default=None\)/,
  )
  assert.ok(
    !source
      .split('\n')
      .find((line) => line.includes('title:'))
      .includes('default='),
  )
})

test('default/add entity/format use the current language and preserve declarations and seed code', () => {
  const source =
    createDefaultSchemaSource() + '\nexample = Project(name="Example")\n'
  const added = addEntityToSource(source)
  assert.match(added, /class NewEntity1\(Entity\):/)
  assert.match(addEntityToSource(added), /class NewEntity2\(Entity\):/)
  const formatted = formatSchemaSource(added)
  assert.match(formatted, /example = Project\(name=['"]Example['"]\)/)
  assert.match(formatted, /persistent_key=/)
  assert.match(formatted, /# Keep persistent_key/)
})

test('legacy Python migration retains table identities, fields, references, and constraints', () => {
  const old = `# keep this comment\nclass Project:\n    table_name: "${table}"\n    name: str = Field(nullable=False, max_length=100)\n    parent: Reference["Project"]\n    budget: Decimal = Field(default="0.00", precision=12, scale=2)\n    settings: dict = {"enabled": True}\n`
  const migrated = migrateLegacyDraft(old)
  assert.match(migrated, /# keep this comment/)
  assert.match(migrated, /class Project\(Entity\):/)
  assert.ok(migrated.includes(`__tablename__ = "${table}"`))
  assert.match(
    migrated,
    /name: String\(persistent_key="name", nullable=False, max_length=100\)/,
  )
  assert.match(
    migrated,
    /parent: Reference\(["']Project["'], persistent_key="parent"\)/,
  )
  assert.match(
    migrated,
    /budget: Decimal\(persistent_key="budget", default=['"]0.00['"], precision=12, scale=2\)/,
  )
  assert.match(
    migrated,
    /settings: JSON\(persistent_key="settings", default=\{/,
  )
  assert.equal(migrateLegacyDraft(migrated), migrated)
})

test('current programs are preserved verbatim and JSON migrations do not invent null defaults', () => {
  const current = createDefaultSchemaSource() + '\nx = Project(name="x")\n'
  assert.equal(migrateLegacyDraft(current), current)
  const migrated = migrateLegacyDraft(
    JSON.stringify({
      entities: [
        {
          name: 'Project',
          tablename: table,
          fields: [{ name: 'name', type: 'String', default: null }],
        },
      ],
    }),
  )
  assert.match(migrated, /name: String\(persistent_key="name"\)/)
  assert.ok(!migrated.includes('default=None'))
  const invalid = '{broken JSON'
  assert.equal(migrateLegacyDraft(invalid), invalid)
})

test('outline recovery distinguishes enums and entities and ignores seed arguments', () => {
  const source =
    createDefaultSchemaSource() + '\nproject = Project(\n    name="hello"\n)\n'
  const outline = getSchemaOutline(source)
  assert.deepEqual(
    outline.map((item) => [item.name, item.kind]),
    [
      ['ProjectStatus', 'enum'],
      ['Project', 'entity'],
      ['Recruitment', 'entity'],
    ],
  )
  assert.equal(outline[2].fields.length, 2)
  assert.equal(outline[1].fields[0].name, 'name')
})

test('constructor completions follow current field options and constraints', () => {
  const context = getFieldCompletionContext(
    '    name: String(\n        pattern=r"(a,b)#", # )\n        ',
  )
  assert.equal(context.type, 'String')
  assert.deepEqual([...context.used], ['pattern'])
  assert.ok(
    suggestedFieldOptions(context.type, context.used).includes(
      'persistent_key',
    ),
  )
  assert.ok(!suggestedFieldOptions(context.type, context.used).includes('ge'))
  assert.ok(!suggestedFieldOptions('Decimal', new Set(['ge'])).includes('gt'))
  assert.equal(getFieldCompletionContext('    name: String()\n'), null)
})

test('backend Unicode code point columns are translated to Monaco UTF-16 columns', () => {
  assert.deepEqual(
    editorLocation(
      { line: 1, column: 5, end_line: 1, end_column: 6 },
      'x="😀"',
    ),
    { line: 1, column: 6, end_line: 1, end_column: 7 },
  )
})
