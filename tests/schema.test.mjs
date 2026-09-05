import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addEntityToSource, analyzeSchemaSource, createDefaultSchemaSource, formatSchemaSource,
  generateTableName, getSchemaOutline, migrateLegacyDraft, parseSchemaSource,
} from '../src/lib/schema.ts'
import { FIELD_DEFAULTS, FIELD_TYPES, TABLE_NAME_PATTERN } from '../src/lib/sema.ts'
import { getFieldCompletionContext, suggestedFieldOptions } from '../src/lib/schema-language.ts'

const table = `e_${'a'.repeat(52)}`
const secondTable = `e_${'b'.repeat(52)}`
const entity = (fields = '    name: str', name = 'Project', tablename = table) =>
  `class ${name}:\n    table_name: "${tablename}"\n${fields}\n`
const messages = (source) => analyzeSchemaSource(source).problems.map((problem) => problem.message)

test('the requested Python syntax compiles to the exact backend field shape and defaults', () => {
  const source = entity('    name: str = Field(unique=True, max_length=100)')
  assert.deepEqual(parseSchemaSource(source), { entities: [{
    name: 'Project', tablename: table,
    location: { line: 1, column: 1, end_line: 3, end_column: 51 },
    fields: [{ ...FIELD_DEFAULTS, name: 'name', type: 'String', unique: true, max_length: 100,
      location: { line: 3, column: 5, end_line: 3, end_column: 51 } }],
  }] })
})

test('all backend types and Python aliases are supported without imports', () => {
  const types = [...FIELD_TYPES, 'str', 'int', 'float', 'bool', 'date', 'datetime', 'dict']
  const source = entity(types.map((type, i) => `    field_${i}: ${type}${type === 'Reference' ? ' = Field(reference="Project")' : ''}`).join('\n'))
  const fields = parseSchemaSource(source).entities[0].fields
  assert.deepEqual(fields.map((field) => field.type), [...FIELD_TYPES, 'String', 'Integer', 'Float', 'Boolean', 'Date', 'DateTime', 'JSON'])
  assert.ok(fields.every((field) => field.nullable === true && field.primary_key === false))
})

test('forward, self, and explicitly annotated references resolve entity names', () => {
  const source = entity('    next: Recruitment\n    parent: Reference["Project"]') + '\n' +
    entity('    project: Reference[Project]', 'Recruitment', secondTable)
  const schema = parseSchemaSource(source)
  assert.equal(schema.entities[0].fields[0].reference, 'Recruitment')
  assert.equal(schema.entities[0].fields[1].reference, 'Project')
  assert.equal(schema.entities[1].fields[0].reference, 'Project')
})

test('multiline Field calls, comments, raw strings, and JSON-compatible literal defaults', () => {
  const source = entity(`    # Preserve this comment
    name: str = Field(
        nullable=False, # required
        pattern=r"(?P<code>\\d+)",
        min_length=0,
    )
    balance: Decimal = Field(ge=-1.5, precision=12, scale=2)
    options: JSON = Field(default={"flags": [True, False, None], "text": "(a,b)#"})
    count: int = 3`)
  const fields = parseSchemaSource(source).entities[0].fields
  assert.equal(fields[0].pattern, '(?P<code>\\d+)')
  assert.equal(fields[0].location.line, 4)
  assert.equal(fields[0].location.end_line, 8)
  assert.equal(fields[1].ge, -1.5)
  assert.deepEqual(fields[2].default, { flags: [true, false, null], text: '(a,b)#' })
  assert.equal(fields[3].default, 3)
  assert.ok(formatSchemaSource(source).includes('# Preserve this comment'))
})

const invalidFields = [
  ['id: int', "Field name 'id' is reserved"],
  ['value: str = Field(nullable="False")', "'nullable' must be a boolean"],
  ['value: int = Field(unique=1)', "'unique' must be a boolean"],
  ['value: str = Field(index=None)', "'index' must be a boolean"],
  ['value: int = Field(primary_key="yes")', "'primary_key' must be a boolean"],
  ['value: int = Field(primary_key=True)', "Primary key field 'value' cannot be nullable"],
  ['value: Text = Field(max_length=3)', "String constraints cannot be used with type 'Text'"],
  ['value: str = Field(ge=0)', "Numeric constraints cannot be used with type 'String'"],
  ['value: int = Field(precision=3)', 'precision/scale can only be used with Decimal'],
  ['value: str = Field(min_length=-1)', "'min_length' must be a non-negative integer"],
  ['value: str = Field(min_length=True)', "'min_length' must be a non-negative integer"],
  ['value: str = Field(max_length=0)', "'max_length' must be a positive integer"],
  ['value: str = Field(max_length=1.5)', "'max_length' must be a positive integer"],
  ['value: str = Field(min_length=10, max_length=5)', "'min_length' cannot be greater than 'max_length'"],
  ['value: str = Field(pattern=1)', "'pattern' must be a string"],
  ['value: int = Field(gt=0, ge=1)', "'gt' and 'ge' cannot be used together"],
  ['value: int = Field(lt=1, le=2)', "'lt' and 'le' cannot be used together"],
  ['value: float = Field(ge=True)', 'Numeric bounds must be numbers'],
  ['value: float = Field(ge="1")', 'Numeric bounds must be numbers'],
  ['value: Decimal = Field(ge=5, le=2)', 'Lower numeric bound cannot be greater than upper bound'],
  ['value: Decimal = Field(precision=0)', "'precision' must be a positive integer"],
  ['value: Decimal = Field(precision=True)', "'precision' must be a positive integer"],
  ['value: Decimal = Field(scale=-1)', "'scale' must be a non-negative integer"],
  ['value: Decimal = Field(scale=False)', "'scale' must be a non-negative integer"],
  ['value: Decimal = Field(precision=2, scale=3)', "'scale' cannot be greater than 'precision'"],
  ['value: Reference', "Reference field 'value' must specify a target entity"],
  ['value: Reference = Field(reference="Missing")', "Unknown referenced entity 'Missing'"],
  ['value: Reference = Field(reference="Project.id")', "Unknown referenced entity 'Project.id'"],
  ['value: str = Field(reference="Project")', "Field 'value' is not a Reference but has a reference target"],
]
for (const [field, expected] of invalidFields) {
  test(`backend rule: ${expected} (${field})`, () => {
    const result = analyzeSchemaSource(entity(`    ${field}`))
    assert.equal(result.schema, null)
    assert.ok(result.problems.some((problem) => problem.message === expected), JSON.stringify(result.problems))
    assert.equal(result.problems[0].location.line, 3)
    assert.throws(() => parseSchemaSource(entity(`    ${field}`)))
  })
}

test('schema-level names, table identities, duplicates, and primary keys', () => {
  assert.ok(messages(entity('', 'Field')).includes("Entity name 'Field' is reserved"))
  assert.ok(messages(entity('', 'Project', 'projects')).some((message) => message.includes('Burbot-generated')))
  assert.ok(messages(entity() + entity()).includes("Entity 'Project' is already defined"))
  assert.ok(messages(entity() + entity('', 'Other')).some((message) => message.includes('already used by another entity')))
  assert.ok(messages(entity('    name: str\n    name: int')).some((message) => message.includes("Field 'name' is already defined")))
  assert.ok(messages(entity('    a: int = Field(primary_key=True, nullable=False)\n    b: int = Field(primary_key=True, nullable=False)')).some((message) => message.includes('multiple primary key fields')))
  assert.ok(messages('class Project:\n    name: str\n').some((message) => message.includes('must specify table_name')))
  assert.ok(messages(entity(`    tablename: "${secondTable}"`)).some((message) => message.includes('already specifies a table name')))
})

test('backend permits empty schemas, empty entities, null constraints, and equal numeric bounds', () => {
  assert.deepEqual(parseSchemaSource('# intentionally empty\n'), { entities: [] })
  assert.equal(parseSchemaSource(entity('')).entities[0].fields.length, 0)
  assert.equal(parseSchemaSource(entity('    count: int = Field(gt=2, le=2)')).entities[0].fields[0].gt, 2)
  assert.equal(parseSchemaSource(entity('    text: Text = Field(max_length=None)')).entities[0].fields[0].type, 'Text')
})

test('rejects unsupported/executable syntax and malformed Field configuration', () => {
  const invalid = [
    'import os', 'print("hello")', 'def function():\n    pass',
    entity('    value: Unknown'), entity('    value: str = Other()'),
    entity('    value: str = Field("default")'), entity('    value: str = Field(unknown=True)'),
    entity('    value: str = Field(unique=True, unique=False)'), entity('    value: str = Field(**options)'),
    entity('    value: str = Field(default=run())'), entity('    value: int = 2 + 2'),
    entity('    value: JSON = {"a": func()}'), entity('    value: JSON = {1: "a"}'),
    entity('    value: int = 9007199254740993'), entity('    value: float = 1e999'),
    entity('    value: Reference[Project] = Field(reference="Other")'),
    entity('    def method(self):\n        pass'), entity('    value = 1'),
    entity().replace('class Project:', 'class Project(Base):'),
    '@decorator\n' + entity(),
  ]
  for (const source of invalid) assert.ok(messages(source).length, source)
})

test('source locations distinguish repeated names and convert UTF-8 offsets for Monaco', () => {
  const source = entity('    café: str = Field(max_length=5)') + '\n' + entity('    café: str', 'Other', secondTable)
  const fields = parseSchemaSource(source).entities.flatMap((value) => value.fields)
  assert.deepEqual(fields.map((field) => field.location.line), [3, 7])
  assert.equal(fields[0].location.end_column, source.split('\n')[2].length + 1)
  const invalid = analyzeSchemaSource(source.replace('max_length=5', 'bad_option=5'))
  assert.equal(invalid.problems[0].location.column, 23)
  const unfinished = analyzeSchemaSource(entity('    value: str = Field('))
  assert.equal(unfinished.problems[0].location.line, 3)
  assert.ok(unfinished.problems[0].location.column > 5)
  assert.equal(unfinished.outline[0].name, 'Project')
})

test('templates/add entity use fresh valid identifiers that remain stable on format and rename', () => {
  const source = createDefaultSchemaSource()
  const schema = parseSchemaSource(source)
  assert.ok(schema.entities.every((item) => TABLE_NAME_PATTERN.test(item.tablename)))
  assert.ok(schema.entities.every((item) => item.fields.every((field) => field.name !== 'id')))
  assert.notEqual(generateTableName(), generateTableName())
  const added = parseSchemaSource(addEntityToSource(source))
  assert.equal(added.entities.length, 3)
  assert.equal(new Set(added.entities.map((item) => item.tablename)).size, 3)
  assert.equal(added.entities[0].tablename, schema.entities[0].tablename)
  const formatted = parseSchemaSource(formatSchemaSource(source))
  assert.deepEqual(formatted.entities.map((item) => item.tablename), schema.entities.map((item) => item.tablename))
  const renamed = parseSchemaSource(source.replaceAll('Project', 'Portfolio'))
  assert.equal(renamed.entities[0].tablename, schema.entities[0].tablename)
  assert.equal(getSchemaOutline(source)[1].fields[0].type, 'Reference')
})

test('legacy JSON converts to Python and preserves identities, fields, constraints, and data', () => {
  const before = parseSchemaSource(createDefaultSchemaSource())
  const converted = migrateLegacyDraft(JSON.stringify(before))
  assert.match(converted, /^class Project:/)
  const withoutLocations = (schema) => JSON.parse(JSON.stringify(schema, (key, value) => key === 'location' ? undefined : value))
  assert.deepEqual(withoutLocations(parseSchemaSource(converted)), withoutLocations(before))
  const old = { entities: [{ name: 'Project', tablename: 'projects', fields: [{ name: 'id', type: 'BigInteger', primary_key: true, nullable: false }] }] }
  const invalid = migrateLegacyDraft(JSON.stringify(old))
  assert.ok(invalid.includes('"projects"'))
  assert.ok(invalid.includes('id: BigInteger'))
  assert.ok(messages(invalid).includes("Field name 'id' is reserved"))
})

test('completion options match field types, ignore strings/comments, and avoid conflicting bounds', () => {
  const prefix = 'class Project:\n    value: str = Field(\n        pattern=r"(a,b)#", # )\n        '
  const context = getFieldCompletionContext(prefix)
  assert.equal(context.type, 'String')
  assert.deepEqual([...context.used], ['pattern'])
  const options = suggestedFieldOptions(context.type, context.used)
  assert.ok(options.includes('max_length'))
  assert.ok(!options.includes('ge') && !options.includes('scale') && !options.includes('pattern'))
  assert.ok(!suggestedFieldOptions('Decimal', new Set(['ge'])).includes('gt'))
  assert.ok(suggestedFieldOptions('Reference', new Set()).includes('reference'))
  assert.equal(getFieldCompletionContext('name: str = Field(unique=True)\n'), null)
})
