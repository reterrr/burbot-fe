import { expect, test } from '@playwright/test'

const uuid = (id) => `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`
const date = '2026-11-24T10:00:00Z'
const source = {
  id: 7,
  name: 'Recruitment programme',
  url: 'https://example.org/programme',
  state: 'ACTIVE',
}
const previous = {
  id: uuid(1),
  checkedAt: date,
  status: 'completed',
  changeStatus: 'CONTENT_CHANGED',
  snapshotId: 15,
  errorCode: null,
}
const check = {
  ...previous,
  id: uuid(2),
  changeStatus: 'UNCHANGED',
  snapshotId: 16,
}
const failure = {
  ...check,
  status: 'failed',
  changeStatus: null,
  snapshotId: null,
  errorCode: 'CAPTURE_FAILED',
}
const oldTask = {
  id: 42,
  title: 'Review earlier deadline',
  status: 'pending',
  workflowStatus: 'active',
  originCheckId: previous.id,
  snapshotId: previous.snapshotId,
  checkedAt: date,
  requiresReview: true,
}

function tracked(name, id, status, changes = {}) {
  return {
    selectorUuid: uuid(id),
    selectorVersionId: 12,
    selectorVersionUuid: uuid(12),
    configured: true,
    businessField: { id, name },
    businessObject: { id: 9, name: 'Recruitment' },
    businessObjectFieldId: id,
    status,
    canonicalValueId: 18,
    canonicalValue: '1 December',
    currentEvidence: '15 December',
    previousEvidence: '1 December',
    previousObservationId: 18,
    observationId: 19,
    evaluationId: 21,
    task: null,
    ...changes,
  }
}

function review(fields, changes = {}) {
  return {
    id: source.id,
    source,
    latestCheck: check,
    latestCompletedCheck: check,
    selectedCheck: check,
    snapshot: {
      id: check.snapshotId,
      source_id: source.id,
      fetched_at: date,
      page_url: source.url,
      mime_type: 'text/html',
    },
    fields,
    earlierTasks: { items: [oldTask], total: 1, limit: 20, offset: 0 },
    ...changes,
  }
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/business/**', (route) =>
    route.fulfill({ json: { items: [], total: 0, offset: 0, limit: 20 } }),
  )
  await page.route('**/backend/tasks/inbox/count', (route) =>
    route.fulfill({ json: 2 }),
  )
})

test('Attention uses server filters, pages grouped sources, and refreshes', async ({
  page,
}) => {
  const requests = []
  let fail = false
  const summary = {
    ...source,
    lastCheck: check,
    reason: 'field_problems',
    severity: 'high',
    counts: {
      changed: 0,
      missing: 1,
      extractionFailed: 0,
      ambiguous: 0,
      conflict: 0,
      initial: 0,
      unchanged: 4,
      problems: 1,
    },
    openTaskCount: 2,
  }
  const all = [
    summary,
    ...Array.from({ length: 20 }, (_, index) => ({
      ...summary,
      id: 8 + index,
      name: `Other programme ${index + 1}`,
    })),
  ]
  await page.route('**/backend/monitoring/attention/sources?*', (route) => {
    const params = new URL(route.request().url()).searchParams
    requests.push(Object.fromEntries(params))
    if (fail) return route.fulfill({ status: 503 })
    const offset = Number(params.get('offset'))
    const limit = Number(params.get('limit'))
    const matches = params.get('search') ? [] : all
    return route.fulfill({
      json: {
        items: matches.slice(offset, offset + limit),
        total: matches.length,
        offset,
        limit,
      },
    })
  })
  await page.goto('/#/models')
  await page.getByRole('link', { name: 'Monitoring', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Sources requiring attention' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: source.name })).toHaveCount(1)
  await expect(page.getByText('2 open tasks').first()).toBeVisible()
  await expect(page.getByText('1 problem field').first()).toBeVisible()
  await page.getByTitle('2', { exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Other programme 20' }),
  ).toBeVisible()
  expect(requests.at(-1).offset).toBe('20')
  await page.getByLabel('Search sources').fill('missing.example')
  await page.getByRole('combobox', { name: 'Problem type' }).click()
  await page.getByRole('option', { name: 'Value missing' }).click()
  await page.getByTitle('Priority', { exact: true }).click()
  await page.getByRole('option', { name: 'Last checked' }).click()
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByText('No sources match these filters')).toBeVisible()
  expect(requests.at(-1)).toMatchObject({
    search: 'missing.example',
    issue: 'missing',
    sort: 'last_checked',
    offset: '0',
  })
  fail = true
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(
    page.getByText('Could not load monitoring sources'),
  ).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByText('No sources match these filters')).toBeVisible()
})

test('Source review opens a historical selector lazily and links to Tasks', async ({
  page,
}) => {
  const locator = {
    uuid: uuid(70),
    order: 0,
    kind: 'css_path',
    selector: '.funding .percentage',
  }
  const part = {
    uuid: uuid(71),
    order: 0,
    extraction: { type: 'text' },
    locators: [locator],
  }
  const recipe = { uuid: uuid(72), order: 0, parts: [part] }
  const field = tracked('Funding amount', 8, 'FIELD_MISSING', {
    canonicalValue: '80%',
    currentEvidence: null,
    task: oldTask,
  })
  let detailRequests = 0
  let sourceReads = 0
  let completed = false
  await page.route('**/backend/monitoring/sources/7/review?*', (route) => {
    sourceReads += 1
    return route.fulfill({
      json: review(
        [
          field,
          tracked('Recruitment status', 9, 'FIELD_UNCHANGED'),
          tracked('Unchecked rule', 10, null, { currentEvidence: null }),
        ],
        completed
          ? { earlierTasks: { items: [], total: 0, limit: 20, offset: 0 } }
          : {},
      ),
    })
  })
  await page.route(
    `**/backend/monitoring/sources/7/review/${check.id}/${field.selectorUuid}`,
    (route) => {
      detailRequests += 1
      return route.fulfill({
        json: {
          extractionRunId: 24,
          selector: {
            identity: {
              uuid: field.selectorUuid,
              target: { objectId: 'Recruitment', field: 'Funding amount' },
              createdAt: date,
            },
            versionId: 12,
            version: {
              uuid: uuid(12),
              selectorUuid: field.selectorUuid,
              versionNo: 3,
              status: 'superseded',
              createdAt: date,
              recipes: [recipe],
            },
          },
          evaluation: {
            uuid: uuid(13),
            evaluatedAt: date,
            pageUrl: source.url,
            sourceSnapshotId: 16,
            extractionRunId: 24,
            provenance: 'browser_agent_reported',
            result: {
              status: 'not_found',
              selectorVersionUuid: uuid(12),
              recipeResults: [
                {
                  recipeUuid: recipe.uuid,
                  status: 'not_found',
                  partResults: [
                    {
                      partUuid: part.uuid,
                      status: 'not_found',
                      locatorResults: [
                        {
                          locatorUuid: locator.uuid,
                          status: 'not_found',
                          matchCount: 0,
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      })
    },
  )
  const task = () => ({
    id: oldTask.id,
    title: oldTask.title,
    status: completed ? 'completed' : 'pending',
    workflow_id: 9,
    type: 'review_source_change',
    reason: 'manual',
    metadata_json: {
      monitoringJobId: previous.id,
      evidenceStatus: 'INITIAL_EVIDENCE',
    },
    allowed_statuses: completed ? [] : ['completed'],
    references: [
      {
        id: 1,
        task_id: oldTask.id,
        role: 'context',
        reference_type: 'source',
        reference_id: source.id,
      },
    ],
  })
  await page.route('**/backend/tasks/42', (route) =>
    route.fulfill({ json: task() }),
  )
  await page.route('**/backend/tasks/42/status', (route) => {
    expect(route.request().postDataJSON()).toEqual({ status: 'completed' })
    completed = true
    return route.fulfill({ json: task() })
  })
  await page.goto('/#/monitoring/sources/7')
  await expect(page.getByRole('heading', { name: source.name })).toBeVisible()
  await expect(
    page.getByRole('row').filter({ hasText: 'Recruitment status' }),
  ).toContainText('Unchanged')
  await expect(
    page.getByRole('row').filter({ hasText: 'Unchecked rule' }),
  ).toContainText('Not checked')
  await expect(
    page.getByRole('row').filter({ hasText: 'Funding amount' }),
  ).toContainText('Earlier task open')
  expect(detailRequests).toBe(0)
  await expect(
    page.getByRole('link', { name: 'Open original website' }),
  ).toHaveAttribute('href', source.url)
  await page
    .getByRole('button', { name: 'Funding amount', exact: true })
    .click()
  const inspector = page.getByRole('dialog', {
    name: 'Funding amount',
    exact: true,
  })
  await expect(inspector.getByText('Version 3', { exact: true })).toBeVisible()
  expect(detailRequests).toBe(1)
  await expect(inspector.getByText('Superseded', { exact: true })).toBeVisible()
  await expect(inspector.getByText('80%', { exact: true })).toBeVisible()
  const diagnostics = inspector.getByRole('region', {
    name: 'Execution diagnostics',
  })
  await diagnostics.getByRole('button', { name: /Recipe 1/ }).click()
  await diagnostics.getByRole('button', { name: /Part 1/ }).click()
  await expect(
    diagnostics.getByText('0 matches · No element found'),
  ).toBeVisible()
  await inspector.getByRole('link', { name: 'Open task #42' }).click()
  await expect(
    page.getByText('Monitoring review', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Complete', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Complete', exact: true })
    .click()
  await expect(page.getByText('Task #42 · Completed')).toBeVisible()
  await page
    .getByRole('link', { name: 'Open source review', exact: true })
    .click()
  await expect(
    page.getByText('No open tasks from earlier checks'),
  ).toBeVisible()
  expect(sourceReads).toBeGreaterThan(1)
  await expect(
    page.getByRole('row').filter({ hasText: 'Funding amount' }),
  ).toContainText('80%')
})

test('Initial evidence explains matching and differing canonical text', async ({
  page,
}) => {
  const fields = [
    tracked('Matching deadline', 8, 'FIELD_NEW', {
      canonicalDisplay: { kind: 'string', rawValue: '1 December' },
      currentEvidence: '1 December',
      previousEvidence: null,
    }),
    tracked('Different deadline', 9, 'FIELD_NEW', {
      canonicalDisplay: { kind: 'string', rawValue: '1 December' },
      currentEvidence: 'December '.repeat(180),
      previousEvidence: null,
    }),
    tracked('No canonical funding', 10, 'FIELD_NEW', {
      canonicalValueId: null,
      canonicalValue: null,
      previousEvidence: null,
    }),
  ]
  await page.route('**/backend/monitoring/sources/7/review?*', (route) =>
    route.fulfill({ json: review(fields) }),
  )
  await page.route(
    `**/backend/monitoring/sources/7/review/${check.id}/*`,
    (route) => route.fulfill({ json: { selector: null, evaluation: null } }),
  )
  for (const [field, message] of [
    [fields[0], 'Recorded evidence matches the canonical value.'],
    [fields[1], 'Recorded evidence differs from the canonical value.'],
    [fields[2], 'No canonical value is available for comparison.'],
  ]) {
    await page.goto('/#/monitoring/sources/7')
    await page
      .getByRole('button', { name: field.businessField.name, exact: true })
      .click()
    const drawer = page.getByRole('dialog', { name: field.businessField.name })
    await expect(
      drawer.getByText('First observation — no previous baseline'),
    ).toBeVisible()
    await expect(drawer.getByText(message, { exact: true })).toBeVisible()
    await expect(
      drawer.getByText('Diagnostics unavailable for this capture'),
    ).toBeVisible()
    await drawer.getByRole('button', { name: 'Close' }).click()
  }
})

test.describe('Typed canonical values', () => {
  test.use({ locale: 'pl-PL', timezoneId: 'Europe/Warsaw' })

  test('tracked fields and historical capture inspector use the same display', async ({
    page,
  }) => {
    const projectName = 'Regional Programme – development services 2024–2029'
    const project = {
      kind: 'reference',
      rawValue: 291,
      label: projectName,
      target: { type: 'business_object', id: 291, entityId: 68 },
      resolved: true,
      labelIsCurrent: true,
    }
    const missing = {
      kind: 'reference',
      rawValue: 999,
      label: 'BusinessObject #999',
      target: { type: 'business_object', id: 999 },
      resolved: false,
    }
    const sourceUrl = 'https://example.org/programme'
    const cases = [
      ['Projekt', project, projectName],
      ['Missing project', missing, 'BusinessObject #999'],
      [
        'Programme website',
        {
          kind: 'source',
          rawValue: 291,
          target: { type: 'source', id: 291 },
          label: sourceUrl,
          labelIsCurrent: true,
          resolved: true,
        },
        sourceUrl,
      ],
      ['Number of places', { kind: 'integer', rawValue: 291 }, '291'],
      ['Funded', { kind: 'boolean', rawValue: false }, 'No'],
      ['Deadline', { kind: 'date', rawValue: '2026-11-25' }, '25.11.2026'],
      [
        'Checked at',
        { kind: 'datetime', rawValue: '2026-11-25T15:05:00Z' },
        '16:05',
      ],
      ['Exact budget', { kind: 'decimal', rawValue: '12.3401' }, '12,3401'],
      [
        'Conditions',
        {
          kind: 'list',
          rawValue: [true, false],
          itemKind: 'boolean',
          items: [
            { kind: 'boolean', rawValue: true },
            { kind: 'boolean', rawValue: false },
          ],
        },
        'Yes',
      ],
      [
        'Unknown metadata',
        { kind: 'unknown', rawValue: { currency: 'PLN' } },
        '{"currency":"PLN"}',
      ],
      ['Explicit null', { kind: 'string', rawValue: null }, 'Null'],
      ['Title', { kind: 'string', rawValue: 'Plain title' }, 'Plain title'],
    ]
    const fields = cases.map(([name, display], index) =>
      tracked(name, index + 1, 'FIELD_NEW', {
        canonicalValue: display.rawValue,
        canonicalDisplay: display,
        canonicalValueScope: 'current',
        ...(name === 'Projekt' && { currentEvidence: 'Regional Programme' }),
      }),
    )
    await page.route('**/backend/monitoring/sources/7/review?*', (route) =>
      route.fulfill({ json: review(fields, { selectedCheck: previous }) }),
    )
    await page.route('**/backend/monitoring/sources/7/review/*/*', (route) =>
      route.fulfill({ json: { selector: null, evaluation: null } }),
    )
    await page.goto(`/#/monitoring/sources/7?check=${previous.id}`)
    await expect(page.getByText('Historical check from')).toBeVisible()
    await expect(
      page.getByRole('columnheader', { name: 'Current canonical' }),
    ).toBeVisible()
    for (const [name, , expected] of cases) {
      const row = page.getByRole('row').filter({
        has: page.getByRole('button', { name, exact: true }),
      })
      await expect(row.getByRole('cell').nth(1)).toContainText(expected)
    }
    await page.getByRole('button', { name: 'Projekt', exact: true }).click()
    const inspector = page.getByRole('dialog', { name: 'Projekt' })
    await expect(
      inspector.getByText(projectName, { exact: true }),
    ).toBeVisible()
    await expect(
      inspector.getByText('Current name', { exact: false }),
    ).toBeVisible()
    await expect(
      inspector.getByText('Regional Programme', { exact: true }),
    ).toBeVisible()
    await expect(
      inspector.getByText(
        'Reference target resolved. Evidence requires semantic validation.',
      ),
    ).toBeVisible()
    await inspector.getByRole('button', { name: 'Close' }).click()
    await page
      .getByRole('button', { name: 'Missing project', exact: true })
      .click()
    await expect(
      page
        .getByRole('dialog', { name: 'Missing project' })
        .getByText('Referenced business object could not be resolved.'),
    ).toBeVisible()
  })
})

test('Failed checks stay distinct from the latest completed snapshot', async ({
  page,
}) => {
  const selected = []
  await page.route('**/backend/monitoring/sources/7/review?*', (route) => {
    const checkId = new URL(route.request().url()).searchParams.get('checkId')
    selected.push(checkId)
    return route.fulfill({
      json: review([], {
        latestCheck: failure,
        latestCompletedCheck: previous,
        selectedCheck: checkId ? previous : failure,
        snapshot: checkId ? { ...review([]).snapshot, id: 15 } : null,
      }),
    })
  })
  await page.route(
    '**/backend/monitoring/sources/7/history?summary=true*',
    (route) => route.fulfill({ json: [failure, previous] }),
  )
  await page.goto('/#/monitoring/sources/7')
  await expect(
    page.getByText('Monitoring check failed', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('No tracked fields', { exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /Open snapshot/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Monitoring history' }).click()
  await page
    .getByRole('dialog', { name: 'Monitoring history' })
    .getByRole('button', { name: 'Review check' })
    .nth(1)
    .click()
  await expect(page.getByText(/Historical check from/)).toBeVisible()
  expect(selected.at(-1)).toBe(previous.id)
  await expect(
    page.getByRole('button', { name: 'Open snapshot #15' }),
  ).toBeVisible()
})
