import { defineConfig } from 'orval'

export default defineConfig({
  burbot: {
    input: {
      target: './openapi.json',
    },

    output: {
      mode: 'tags-split',
      target: './src/api/generated',
      schemas: './src/api/models',

      client: 'react-query',
      httpClient: 'fetch',

      override: {
        mutator: {
          path: './src/api/client.ts',
          name: 'apiClient',
        },
      },

      clean: true,
    },
  },
})
