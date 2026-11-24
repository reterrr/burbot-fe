import assert from 'node:assert/strict'

const origin = process.env.BURBOT_STUDIO_URL || 'http://127.0.0.1:5173'

async function read(path) {
  const response = await fetch(new URL(`/backend/tasks${path}`, origin), {
    signal: AbortSignal.timeout(5000),
  })
  assert.equal(response.status, 200, `${path} returned ${response.status}`)
  return response.json()
}

const [inbox, count] = await Promise.all([
  read('/inbox?offset=0&limit=20'),
  read('/inbox/count'),
])
assert.ok(Array.isArray(inbox.items))
assert.ok(
  Number.isSafeInteger(inbox.total) && inbox.total >= inbox.items.length,
)
assert.ok(Number.isSafeInteger(count) && count >= 0)
const id = process.env.BURBOT_SMOKE_TASK_ID || inbox.items[0]?.task.id
if (id) {
  assert.match(String(id), /^[1-9]\d*$/)
  const task = await read(`/${id}`)
  assert.equal(String(task.id), String(id))
  assert.ok(
    Array.isArray(task.allowed_statuses) && Array.isArray(task.references),
  )
  const workflow = await read(`/workflows/${task.workflow_id}`)
  const [workflows, tasks, filtered] = await Promise.all([
    read(`/sources/${workflow.source_id}/workflows?offset=0&limit=20`),
    read(`/workflows/${workflow.id}/tasks?offset=0&limit=20`),
    read(`/inbox?task_id=${id}&offset=0&limit=20`),
  ])
  assert.ok(workflows.total > 0 && tasks.total > 0)
  assert.equal(String(filtered.applied_filters.task_id), String(id))
  assert.ok(filtered.items.every((row) => String(row.task.id) === String(id)))
  console.log('Live Inbox, task, workflow and server filter checks passed')
} else {
  console.log(
    'Live Inbox and count checks passed. Set BURBOT_SMOKE_TASK_ID to check a specific task and workflow.',
  )
}
