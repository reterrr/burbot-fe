import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assignValues,
  createValues,
  objectValues,
  parseNamedValues,
} from '../src/lib/objects.ts'

const entity = {
  fields: [
    { key: 'id', field_id: 1, status: 'ACTIVE', definition: { system: true } },
    {
      key: 'title',
      persistent_key: 'name',
      field_id: 10,
      status: 'ACTIVE',
      definition: {},
    },
    { key: 'score', field_id: 11, status: 'ACTIVE', definition: {} },
    { key: 'retired', field_id: 12, status: 'RETIRED', definition: {} },
    { key: 'new_field', field_id: 13, status: 'ACTIVE', definition: {} },
  ],
}
const object = {
  fields: [
    {
      business_entity_field_id: 10,
      object_field_id: 100,
      value_id: 500,
      value: 'original',
    },
    {
      business_entity_field_id: 11,
      object_field_id: 101,
      value_id: null,
      value: null,
    },
  ],
}

test('create uses definition IDs and update uses object slot IDs and expected current value IDs', () => {
  assert.deepEqual(createValues(entity, { title: 'renamed field', score: 0 }), {
    10: 'renamed field',
    11: 0,
  })
  assert.deepEqual(
    assignValues(entity, object, { title: 'updated', score: null }),
    {
      field_values: { 100: 'updated', 101: null },
      expected_value_ids: { 100: 500, 101: null },
    },
  )
  assert.deepEqual(objectValues(entity, object), { title: 'original' })
})

test('unknown/system/retired fields and unsynchronized slots cannot be written', () => {
  for (const key of ['missing', 'id', 'retired', '__proto__'])
    assert.throws(() => createValues(entity, { [key]: 1 }), /read-only/)
  assert.throws(
    () => assignValues(entity, object, { new_field: 1 }),
    /Sync fields/,
  )
  assert.throws(() => assignValues(entity, object, {}), /at least one/)
})

test('JSON input accepts false, zero, null and nested values without coercion', () => {
  assert.deepEqual(
    parseNamedValues('{"a":false,"b":0,"c":null,"d":{"x":[]}}'),
    { a: false, b: 0, c: null, d: { x: [] } },
  )
  for (const invalid of ['null', '[]', '1', '"text"'])
    assert.throws(() => parseNamedValues(invalid), /JSON object/)
})
