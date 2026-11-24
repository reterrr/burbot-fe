import assert from 'node:assert/strict'
import { test } from 'node:test'
import { taskClient } from '../src/features/tasks/api/task-client.ts'
import {
  taskDataProvider,
  taskResources,
} from '../src/features/tasks/api/task-provider.ts'

const json = (body, status = 200) => Response.json(body, { status })

test('Refine maps Inbox envelopes, filters, paging, and cancellation', async (t) => {
  const signal = new AbortController().signal
  const fetcher = t.mock.method(globalThis, 'fetch', async (path, options) => {
    const url = new URL(path, 'http://localhost')
    assert.equal(url.pathname, '/backend/tasks/inbox')
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      offset: '40',
      limit: '20',
      status: 'in_progress',
      source_id: '7',
      task_id: '57',
    })
    assert.equal(options.signal, signal)
    return json({
      total: 61,
      items: [
        {
          task: { id: 57, title: 'Evidence' },
          source_id: 7,
          source_snapshot_id: 4,
          workflow_key: 'processing',
          allowed_statuses: ['completed'],
        },
      ],
      applied_filters: { status: 'in_progress', source_id: 7, task_id: 57 },
    })
  })

  const page = await taskDataProvider.getList({
    resource: taskResources.tasks,
    pagination: { currentPage: 3, pageSize: 20 },
    filters: [
      { field: 'status', operator: 'eq', value: 'in_progress' },
      { field: 'source_id', operator: 'eq', value: '7' },
      { field: 'task_id', operator: 'eq', value: 57 },
    ],
    meta: { queryContext: { signal } },
  })
  assert.deepEqual(page, {
    total: 61,
    data: [
      {
        id: 57,
        title: 'Evidence',
        source_id: 7,
        source_snapshot_id: 4,
        workflow_key: 'processing',
        allowed_statuses: ['completed'],
      },
    ],
  })
  assert.equal(fetcher.mock.callCount(), 1)
})

test('unfiltered legacy Inbox loads and unsupported server filtering is explicit', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    json({ items: [], total: 0, offset: 0, limit: 20 }),
  )
  assert.deepEqual(
    await taskDataProvider.getList({ resource: taskResources.tasks }),
    { data: [], total: 0 },
  )
  await assert.rejects(
    () => taskClient.inbox({ offset: 0, limit: 20 }, { status: 'pending' }),
    { statusCode: 501 },
  )
})

test('count is scalar and mutations preserve HTTP errors and lowercase enum values', async (t) => {
  let result = json(12)
  const fetcher = t.mock.method(globalThis, 'fetch', async () => result)
  assert.deepEqual(
    await taskDataProvider.getOne({
      resource: taskResources.count,
      id: 'inbox',
    }),
    {
      data: { id: 'inbox', count: 12 },
    },
  )
  result = json({ count: 12 })
  await assert.rejects(() => taskClient.count(), { statusCode: 502 })
  result = json({ detail: 'Workflow 5 is no longer active' }, 409)
  await assert.rejects(
    () =>
      taskDataProvider.update({
        resource: taskResources.tasks,
        id: '7',
        variables: { status: 'in_progress' },
      }),
    { statusCode: 409, message: 'Workflow 5 is no longer active' },
  )
  const [path, request] = fetcher.mock.calls.at(-1).arguments
  assert.equal(path, '/backend/tasks/7/status')
  assert.equal(request.method, 'PATCH')
  assert.deepEqual(JSON.parse(request.body), { status: 'in_progress' })
  await assert.rejects(
    () =>
      taskDataProvider.update({
        resource: taskResources.tasks,
        id: 7,
        variables: { status: 'PENDING' },
      }),
    { statusCode: 422 },
  )
  assert.equal(fetcher.mock.callCount(), 3)
})
