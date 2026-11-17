import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: env.BURBOT_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
    define: {
      'globalThis.__BURBOT_API_BASE_URL__': JSON.stringify(
        env.VITE_API_BASE_URL ?? '',
      ),
    },
  }
})
