import assert from 'node:assert/strict'
import { createServer as createHttpServer } from 'node:http'
import { test } from 'node:test'
import { createServer, resolveConfig } from 'vite'

test('Vite forwards only scoped local Studio requests and preserves gateway authorization', async (t) => {
  const received = []
  const upstream = createHttpServer((request, response) => {
    received.push({
      url: request.url,
      method: request.method,
      cookie: request.headers.cookie,
      authorization: request.headers.authorization,
    })
    const status =
      request.url === '/monitoring/reviews/7' &&
      request.headers.cookie !== 'fixture-session=yes'
        ? 401
        : 200
    response.writeHead(status, { 'Content-Type': 'application/json' }).end('{}')
  })
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => upstream.close(resolve)))
  const target = `http://127.0.0.1:${upstream.address().port}`
  const originalApiTarget = process.env.BURBOT_API_TARGET
  const originalGateway = process.env.BURBOT_REVIEW_GATEWAY
  process.env.BURBOT_API_TARGET = target
  process.env.BURBOT_REVIEW_GATEWAY = target
  t.after(() => {
    if (originalApiTarget === undefined) delete process.env.BURBOT_API_TARGET
    else process.env.BURBOT_API_TARGET = originalApiTarget
    if (originalGateway === undefined) delete process.env.BURBOT_REVIEW_GATEWAY
    else process.env.BURBOT_REVIEW_GATEWAY = originalGateway
  })
  const vite = await createServer({
    server: { port: 0, watch: null },
    logLevel: 'silent',
  })
  t.after(() => vite.close())
  await vite.listen()
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`
  const read = (path, init) => fetch(origin + path, init)

  assert.equal(
    (
      await read('/backend/tasks/inbox?offset=20&limit=20', {
        headers: {
          cookie: 'fixture-session=yes',
          authorization: 'Bearer testing',
        },
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
  assert.equal(
    (await read('/backend/monitoring/sources/10/history')).status,
    404,
  )
  assert.equal((await read('/backend/monitoring/reviews/7')).status, 401)
  assert.equal(
    (
      await read('/backend/monitoring/reviews/7', {
        headers: { cookie: 'fixture-session=yes' },
      })
    ).status,
    200,
  )
  assert.equal((await read('/api/v1/business/models')).status, 200)
  assert.deepEqual(
    received.map(({ url, method }) => [method, url]),
    [
      ['GET', '/tasks/inbox?offset=20&limit=20'],
      ['PATCH', '/tasks/7/status'],
      ['GET', '/monitoring/reviews/7'],
      ['GET', '/monitoring/reviews/7'],
      ['GET', '/api/v1/business/models'],
    ],
  )
  assert.equal(received[0].cookie, undefined)
  assert.equal(received[0].authorization, undefined)
  assert.equal(received[3].cookie, 'fixture-session=yes')
})

test('production builds expose no operator credentials or development review gateway', async () => {
  const sentinel = 'local-build-test-sentinel'
  const original = process.env.MONITORING_ADMIN_TOKEN
  process.env.MONITORING_ADMIN_TOKEN = sentinel
  try {
    const config = await resolveConfig({}, 'build', 'production')
    assert.equal(
      config.define['globalThis.__BURBOT_REVIEW_GATEWAY_CONFIGURED__'],
      'false',
    )
    assert.equal(
      JSON.stringify({ env: config.env, define: config.define }).includes(
        sentinel,
      ),
      false,
    )
    assert.deepEqual(Object.keys(config.preview.proxy), ['/api'])
  } finally {
    if (original === undefined) delete process.env.MONITORING_ADMIN_TOKEN
    else process.env.MONITORING_ADMIN_TOKEN = original
  }
})
