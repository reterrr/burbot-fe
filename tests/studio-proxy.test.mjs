import assert from 'node:assert/strict'
import { createServer as createHttpServer, get as httpGet } from 'node:http'
import { test } from 'node:test'
import { build, createServer, resolveConfig } from 'vite'

const operatorToken = 'server-only-review-fixture-token'
const review = '/backend/monitoring/reviews/7'

function setEnv(t, name, value) {
  const original = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  t.after(() => {
    if (original === undefined) delete process.env[name]
    else process.env[name] = original
  })
}

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
    const status =
      request.url.startsWith('/monitoring/reviews/') &&
      authorization !== `Bearer ${operatorToken}`
        ? 401
        : 200
    response.writeHead(status, { 'Content-Type': 'application/json' }).end('{}')
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
  assert.equal(
    (await read('/backend/monitoring/sources/10/history')).status,
    404,
  )
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
  const { read, received, vite } = await startStudioProxy(
    t,
    operatorToken,
    'production',
  )
  assert.equal((await read(review)).status, 404)
  assert.deepEqual(received, [])
  assert.equal(
    vite.config.define['globalThis.__BURBOT_LOCAL_REVIEW_ENABLED__'],
    'false',
  )
})

test('Production assets and preview configuration exclude the server operator token', async (t) => {
  setEnv(t, 'MONITORING_ADMIN_TOKEN', operatorToken)
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
    assert.equal(
      Buffer.from(content).includes(operatorToken),
      false,
      file.fileName,
    )
  }
})
