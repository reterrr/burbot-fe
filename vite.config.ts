import { defineConfig, loadEnv } from 'vite'
import type { Plugin, ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'

const loopbackHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i
const loopbackAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])
const taskReads =
  /^\/backend\/tasks\/(?:inbox(?:\/count)?|[1-9]\d*|sources\/[1-9]\d*\/workflows|workflows\/[1-9]\d*(?:\/tasks)?)$/
const taskStatus = /^\/backend\/tasks\/[1-9]\d*\/status$/
const reviewRead = /^\/backend\/monitoring\/reviews\/[1-9]\d*$/

function localStudioApi(reviewConfigured: boolean): Plugin {
  return {
    name: 'burbot-local-studio-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?', 1)[0] ?? ''
        if (!path.startsWith('/backend/')) return next()

        const host = request.headers.host ?? ''
        const origin = request.headers.origin
        const sameOrigin = origin === `http://${host}`
        if (
          !loopbackHost.test(host) ||
          !loopbackAddresses.has(request.socket.remoteAddress ?? '') ||
          (origin && !sameOrigin) ||
          request.headers['sec-fetch-site'] === 'cross-site' ||
          (request.method === 'PATCH' && !sameOrigin)
        ) {
          response.writeHead(403).end()
          return
        }

        if (
          (request.method === 'GET' &&
            (taskReads.test(path) ||
              (reviewConfigured && reviewRead.test(path)))) ||
          (request.method === 'PATCH' && taskStatus.test(path))
        )
          return next()

        response.writeHead(404).end()
      })
    },
  }
}

export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.BURBOT_API_TARGET || 'http://localhost:8000'
  const reviewGateway =
    command === 'serve' && !isPreview && env.BURBOT_REVIEW_GATEWAY
  const businessProxy = { '/api': { target, changeOrigin: true } }
  const taskProxy: ProxyOptions = {
    target,
    changeOrigin: true,
    rewrite: (path) => path.slice('/backend'.length),
    configure: (proxy) => {
      proxy.on('proxyReq', (outbound) => {
        outbound.removeHeader('cookie')
        outbound.removeHeader('authorization')
      })
    },
  }

  return {
    plugins: [react(), localStudioApi(Boolean(reviewGateway))],
    server: {
      host: '127.0.0.1',
      proxy: {
        ...businessProxy,
        '/backend/tasks/': taskProxy,
        ...(reviewGateway
          ? {
              '/backend/monitoring/reviews/': {
                ...taskProxy,
                target: reviewGateway,
                configure: undefined,
              },
            }
          : {}),
      },
    },
    preview: { proxy: businessProxy },
    define: {
      'globalThis.__BURBOT_API_BASE_URL__': JSON.stringify(
        env.VITE_API_BASE_URL ?? '',
      ),
      'globalThis.__BURBOT_REVIEW_GATEWAY_CONFIGURED__': JSON.stringify(
        Boolean(reviewGateway),
      ),
    },
  }
})
