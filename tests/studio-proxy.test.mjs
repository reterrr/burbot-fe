import assert from 'node:assert/strict'
import { createServer as createHttpServer, get as httpGet } from 'node:http'
import { test } from 'node:test'
import { build, createServer, resolveConfig } from 'vite'

const operatorToken = 'server-only-review-fixture-token'
const review = '/backend/monitoring/reviews/7'
const snapshot = '/backend/monitoring/sources/57/snapshots/16'
const commands = '/backend/monitoring/snapshots/open-commands'
const reviewResponse = {
  selector: { version: { versionNo: 3, status: 'superseded' } },
  evaluation: {
    result: { status: 'ambiguous', diagnostic: '<b>Stored text</b>' },
  },
}

function setEnv(t, name, value) {
  const original = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  t.after(() => {
    if (original === undefined) delete process.env[name]
    else process.env[name] = original
  })
}

test('Vite passes only same-origin operator commands and keeps agent credentials off Studio', async (t) => {
  const { origin, read, received } = await startStudioProxy(t, operatorToken)
  const id = '00000000-0000-4000-8000-000000000001'
  assert.equal((await read(commands, { method: 'POST' })).status, 403)
  assert.equal(
    (
      await read(commands, {
        method: 'POST',
        headers: { origin: 'https://example.invalid' },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await read(commands, {
        method: 'POST',
        headers: {
          origin,
          cookie: 'fixture=yes',
          authorization: 'Bearer browser-token',
        },
      })
    ).status,
    200,
  )
  const delivery = await read(`${commands}/${id}`)
  assert.equal(delivery.status, 200)
  assert.equal(delivery.headers.get('authorization'), null)
  assert.equal(delivery.headers.get('cache-control'), 'no-store')
  assert.equal(
    (await read('/backend/monitoring/sources/57/snapshot-agents')).status,
    200,
  )
  const agent = '/backend/monitoring/agents/snapshot-commands'
  assert.equal((await read(`${agent}/${id}/artifact`)).status, 404)
  assert.equal(
    (await read(`${agent}/claim`, { method: 'POST', headers: { origin } }))
      .status,
    404,
  )
  assert.deepEqual(
    received.map((request) => request.authorization),
    Array(3).fill(`Bearer ${operatorToken}`),
  )
  assert.ok(received.every((request) => request.cookie === undefined))
})

async function startStudioProxy(t, token, mode = 'development') {
  const received = []
  const upstream = createHttpServer((request, response) => {
    const { cookie, authorization } = request.headers
    received.push({
      url: request.url,
      method: request.method,
      cookie,
      authorization,
    })
    const isReview = request.url.startsWith('/monitoring/')
    const status =
      isReview && authorization !== `Bearer ${operatorToken}` ? 401 : 200
    response
      .writeHead(status, { 'Content-Type': 'application/json' })
      .end(JSON.stringify(isReview && status === 200 ? reviewResponse : {}))
  })
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => upstream.close(resolve)))
  setEnv(t, 'BURBOT_API_TARGET', `http://127.0.0.1:${upstream.address().port}`)
  setEnv(t, 'MONITORING_ADMIN_TOKEN', token)
  setEnv(t, 'NODE_ENV', 'development')

  const vite = await createServer({
    mode,
    server: { port: 0, watch: null },
    logLevel: 'silent',
  })
  t.after(() => vite.close())
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  return {
    read: (path, init) => fetch(origin + path, init),
    origin,
    received,
    vite,
  }
}

test('Vite forwards scoped local reviews with its operator token', async (t) => {
  const { read, origin, received, vite } = await startStudioProxy(
    t,
    operatorToken,
  )
  const browserHeaders = {
    cookie: 'fixture-session=yes',
    authorization: 'Bearer browser-value',
  }

  assert.equal(
    (
      await read('/backend/tasks/inbox?offset=20&limit=20', {
        headers: browserHeaders,
      })
    ).status,
    200,
  )
  assert.equal(
    (
      await read('/backend/tasks/7/status', {
        method: 'PATCH',
        headers: { origin },
      })
    ).status,
    200,
  )
  assert.equal(
    (
      await read('/backend/tasks/7/status', {
        method: 'PATCH',
        headers: { origin: 'https://example.org' },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await read('/backend/tasks/workflows/5/tasks', {
        method: 'POST',
        headers: { origin },
      })
    ).status,
    404,
  )

  const response = await read(review, { headers: browserHeaders })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('authorization'), null)
  assert.deepEqual(await response.json(), reviewResponse)
  assert.equal(
    (await read(review, { headers: { origin: 'https://example.org' } })).status,
    403,
  )
  const nonLoopbackHostStatus = await new Promise((resolve, reject) => {
    httpGet(
      origin + review,
      { headers: { host: 'example.org' } },
      (response) => {
        response.resume()
        resolve(response.statusCode)
      },
    ).on('error', reject)
  })
  assert.equal(nonLoopbackHostStatus, 403)
  assert.equal(
    (await read(review, { headers: { 'sec-fetch-site': 'cross-site' } }))
      .status,
    403,
  )
  assert.equal(
    (await read(review, { method: 'POST', headers: { origin } })).status,
    404,
  )
  assert.equal((await read(`${review}/extra`)).status, 404)
  assert.equal((await read('/backend/monitoring/sources/10/jobs')).status, 404)
  assert.equal((await read('/api/v1/business/models')).status, 200)

  assert.deepEqual(received, [
    {
      url: '/tasks/inbox?offset=20&limit=20',
      method: 'GET',
      cookie: undefined,
      authorization: undefined,
    },
    {
      url: '/tasks/7/status',
      method: 'PATCH',
      cookie: undefined,
      authorization: undefined,
    },
    {
      url: '/monitoring/reviews/7',
      method: 'GET',
      cookie: undefined,
      authorization: `Bearer ${operatorToken}`,
    },
    {
      url: '/api/v1/business/models',
      method: 'GET',
      cookie: undefined,
      authorization: undefined,
    },
  ])
  assert.equal(
    vite.config.define['globalThis.__BURBOT_LOCAL_REVIEW_ENABLED__'],
    'true',
  )
  const browserModule = await read('/src/app/studio.ts')
  assert.equal(browserModule.status, 200)
  assert.equal((await browserModule.text()).includes(operatorToken), false)
})

test('Vite authorizes only the scoped Monitoring workspace reads', async (t) => {
  const { read, received } = await startStudioProxy(t, operatorToken)
  const id = '00000000-0000-4000-8000-000000000001'
  const routes = [
    '/monitoring/attention/sources?offset=20&limit=20',
    '/monitoring/objects?offset=20&limit=20',
    '/monitoring/objects/291/review?taskId=155',
    '/monitoring/object-reviews/155/history?offset=5&limit=5',
    '/monitoring/sources/10/review',
    `/monitoring/sources/10/review/${id}/${id}`,
    '/monitoring/sources/10/history?summary=true',
  ]
  for (const route of routes) {
    const response = await read('/backend' + route)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
  for (const route of [
    '/monitoring/agents',
    '/monitoring/sources/10/approval',
    '/monitoring/objects/0/review',
    '/monitoring/objects/291',
    '/monitoring/object-reviews/155/status',
    '/monitoring/sources/10/review/invalid',
    '/monitoring/sources/57/snapshots/16/preview',
    '/monitoring/sources/57/snapshots/16/content?metadataOnly=true',
    '/monitoring/sources/57/snapshots/16/content',
    '/monitoring/sources/57/snapshots/16/download',
    '/monitoring/sources/57/snapshots/0/content',
    '/monitoring/sources/57/snapshots/16/delete',
    '/monitoring/sources/57/snapshots/16/content/extra',
    '/monitoring/sources/57/snapshots/16',
    '/extraction/selectors',
  ]) {
    assert.equal((await read('/backend' + route)).status, 404)
  }
  for (const route of routes) {
    assert.equal(
      (await read('/backend' + route, { method: 'POST' })).status,
      404,
    )
  }
  assert.equal(
    (await read(`${snapshot}/download`, { method: 'HEAD' })).status,
    404,
  )
  assert.equal(
    (
      await read(`${snapshot}/content`, {
        headers: { origin: 'https://example.invalid' },
      })
    ).status,
    403,
  )
  assert.deepEqual(
    received,
    routes.map((url) => ({
      url,
      method: 'GET',
      cookie: undefined,
      authorization: `Bearer ${operatorToken}`,
    })),
  )
})

test('Review propagates upstream authorization failures', async (t) => {
  const { read, received } = await startStudioProxy(t, 'invalid-fixture-token')
  assert.equal(
    (
      await read(review, {
        headers: { authorization: `Bearer ${operatorToken}` },
      })
    ).status,
    401,
  )
  assert.equal(received[0].authorization, 'Bearer invalid-fixture-token')
})

test('Task reads continue while reviews are disabled without an operator token', async (t) => {
  const { read, received, vite } = await startStudioProxy(t, undefined)
  assert.equal((await read(review)).status, 404)
  assert.equal(
    (await read('/backend/monitoring/sources/57/snapshot-agents')).status,
    404,
  )
  assert.equal((await read('/backend/tasks/7')).status, 200)
  assert.deepEqual(
    received.map(({ url }) => url),
    ['/tasks/7'],
  )
  assert.equal(
    vite.config.define['globalThis.__BURBOT_LOCAL_REVIEW_ENABLED__'],
    'false',
  )
})

test('Production mode leaves the development review proxy disabled', async (t) => {
  const { read, received, vite, origin } = await startStudioProxy(
    t,
    operatorToken,
    'production',
  )
  assert.equal((await read(review)).status, 404)
  assert.equal(
    (
      await read(commands, {
        method: 'POST',
        headers: { origin },
      })
    ).status,
    404,
  )
  assert.deepEqual(received, [])
  assert.equal(
    vite.config.define['globalThis.__BURBOT_LOCAL_REVIEW_ENABLED__'],
    'false',
  )
})

test('Production assets and preview configuration exclude the server operator token', async (t) => {
  setEnv(t, 'MONITORING_ADMIN_TOKEN', operatorToken)
  const storageKey = 'minio-access-key-fixture'
  const storageSecret = 'minio-secret-key-fixture'
  setEnv(t, 'MONITORING_S3_ACCESS_KEY', storageKey)
  setEnv(t, 'MONITORING_S3_SECRET_KEY', storageSecret)
  setEnv(t, 'NODE_ENV', 'production')
  const config = await resolveConfig({}, 'build', 'production')
  assert.equal(
    config.define['globalThis.__BURBOT_LOCAL_REVIEW_ENABLED__'],
    'false',
  )
  assert.deepEqual(Object.keys(config.preview.proxy), ['/api'])

  const result = await build({ build: { write: false }, logLevel: 'silent' })
  const files = (Array.isArray(result) ? result : [result]).flatMap(
    ({ output }) => output,
  )
  assert.ok(files.some((file) => file.type === 'chunk' && file.isEntry))
  for (const file of files) {
    const content = file.type === 'chunk' ? file.code : file.source
    for (const secret of [operatorToken, storageKey, storageSecret])
      assert.equal(Buffer.from(content).includes(secret), false, file.fileName)
  }
})
