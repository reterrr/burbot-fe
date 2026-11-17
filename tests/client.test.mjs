import assert from 'node:assert/strict'
import { test } from 'node:test'
import { apiClient } from '../src/api/client.ts'
import { formatApiError } from '../src/lib/api-error.ts'

test('transport preserves API status and handles JSON errors and no-content responses', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          detail: { message: 'Bad field', location: { line: 2, column: 5 } },
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      )
    const error = await apiClient('/api/v1/business/language/compile', {
      method: 'POST',
    })
    assert.equal(error.status, 422)
    assert.equal(formatApiError(error.data, 'fallback'), 'Bad field')
    globalThis.fetch = async () => new Response(null, { status: 204 })
    assert.equal(
      (await apiClient('/api/v1/business/models/1', { method: 'DELETE' })).data,
      null,
    )
  } finally {
    globalThis.fetch = original
  }
})

test('validation errors keep field paths and conflict explanations', () => {
  assert.equal(
    formatApiError(
      { detail: [{ loc: ['body', 'name'], msg: 'Required' }] },
      'fallback',
    ),
    'body.name: Required',
  )
  assert.equal(
    formatApiError({ detail: 'Stale value for object field 100' }, 'fallback'),
    'Stale value for object field 100',
  )
})
