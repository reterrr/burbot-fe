import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findSnapshotMatches } from '../src/features/monitoring/snapshot-search.ts'

function matchedText(html, result) {
  return Array.from({ length: result.count }, (_, index) => {
    const { start, end } = result.at(index)
    return html.slice(start, end)
  })
}

test('snapshot text search uses literal offsets and counts repeated matches', () => {
  const html = '<p>Ogłoszenie (2026) & ogłoszenie (2026)</p>'
  const result = findSnapshotMatches(html, 'OGŁOSZENIE (2026)', 'text')
  assert.equal(result.count, 2)
  assert.deepEqual(matchedText(html, result), [
    'Ogłoszenie (2026)',
    'ogłoszenie (2026)',
  ])
})

test('class and ID search identify opening tags with exact attributes', () => {
  const html = `<!-- <p class="programme"> -->
<script type="application/json">{"markup": "<p class='programme'>"}</script>
<article id='archive' class="programme old" title="size > 10">Page</article>
<aside class=programme>Notes</aside><div class="programmes" data-id="archive"></div>`
  const classes = findSnapshotMatches(html, '.programme', 'class')
  assert.equal(classes.count, 2)
  assert.deepEqual(matchedText(html, classes), [
    `<article id='archive' class="programme old" title="size > 10">`,
    '<aside class=programme>',
  ])
  assert.equal(findSnapshotMatches(html, '#archive', 'id').count, 1)
  assert.equal(findSnapshotMatches(html, 'Archive', 'id').count, 0)
  assert.equal(findSnapshotMatches(html, 'prog', 'class').count, 0)
})

test('snapshot search can navigate beyond the first thousand matches', () => {
  const result = findSnapshotMatches('a '.repeat(1250), 'a', 'text')
  assert.equal(result.count, 1250)
  assert.deepEqual(result.at(1249), { start: 2498, end: 2499 })
})
