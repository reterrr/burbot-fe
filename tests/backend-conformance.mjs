// Optional integration check against a checkout of the actual backend compiler.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  addEntityToSource,
  createDefaultSchemaSource,
  formatSchemaSource,
  migrateLegacyDraft,
  schemaToSource,
} from '../src/lib/schema.ts'

const backend = resolve(
  process.env.BURBOT_BACKEND_PATH || process.argv[2] || '../burbot',
)
const python = process.env.BURBOT_PYTHON || `${backend}/.venv/bin/python`
const driver = `import json, sys
sys.path.insert(0, sys.argv[1])
from business_layer.services.schema_parser import compile_source
results = []
for source in json.load(sys.stdin):
    results.append(compile_source(source, namespace="7").model_dump(mode="json"))
json.dump(results, sys.stdout)
`
function compile(sources) {
  const response = spawnSync(python, ['-c', driver, backend], {
    input: JSON.stringify(sources),
    encoding: 'utf8',
    maxBuffer: 2_000_000,
  })
  if (response.error) throw response.error
  assert.equal(response.status, 0, response.stderr)
  return JSON.parse(response.stdout)
}
const old = `class Project:
    table_name: "e_${'a'.repeat(52)}"
    name: str = Field(nullable=False, max_length=100)
    parent: Reference = Field(reference="Project")
    budget: Decimal = Field(default="0.00", precision=12, scale=2)
    options: dict = Field(default={"enabled": True})
`
const program =
  createDefaultSchemaSource() +
  '\nproject = Project(name="Example", budget="100.00")\nrecruitment = Recruitment(project=project, closes_on="2026-12-15")\n'
const allTypes = `class Status(Enum):
    OPEN = 0
    CLOSED = 1
class Sample(Entity):
    title: String(nullable=False)
    body: Text()
    count: Integer(default=0)
    big: BigInteger(default=1)
    score: Float(default=1.5)
    money: Decimal(precision=12, scale=2, default="1.20")
    flag: Boolean(default=False)
    day: Date(default="2026-11-17")
    moment: DateTime(default="2026-11-17T10:00:00Z")
    uid: UUID(default="11111111-1111-4111-8111-111111111111")
    options: JSON(default={"a": [True, None, 0]})
    source: Source()
    parent: Reference("Sample")
    status: Status(default=Status.OPEN)
    empty: String(default=None)
`
const sources = [
  createDefaultSchemaSource(),
  addEntityToSource(program),
  formatSchemaSource(program),
  migrateLegacyDraft(old),
  allTypes,
]
const programs = compile(sources)
assert.deepEqual(programs[1].seed_order, ['project', 'recruitment'])
assert.equal(programs[3].schema.entities[0].tablename, `e_${'a'.repeat(52)}`)
assert.equal(
  programs[4].schema.entities[0].fields.find((field) => field.name === 'source')
    .type,
  'source',
)
const roundtrips = compile(programs.map((item) => schemaToSource(item.schema)))
const semantics = (value) =>
  JSON.parse(
    JSON.stringify(value, (key, item) =>
      key === 'location' ? undefined : item,
    ),
  )
programs.forEach((item, index) =>
  assert.deepEqual(semantics(roundtrips[index].schema), semantics(item.schema)),
)
console.log(
  `Backend compiler conformance passed: ${sources.length} programs and ${roundtrips.length} schema round trips.`,
)
