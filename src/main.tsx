import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Refine } from '@refinedev/core'
import { useNotificationProvider } from '@refinedev/antd'
import routerProvider from '@refinedev/react-router'
import { App as AntApp, ConfigProvider } from 'antd'
import { HashRouter } from 'react-router'
import '@ant-design/v5-patch-for-react-19'
import './index.css'
import App from './App.tsx'
import { studioTheme } from './app/studio'
import {
  studioResources,
  taskDataProvider,
} from './features/tasks/api/task-provider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ConfigProvider theme={studioTheme}>
        <AntApp component={false}>
          <Refine
            dataProvider={taskDataProvider}
            routerProvider={routerProvider}
            notificationProvider={useNotificationProvider}
            resources={studioResources}
            options={{
              disableTelemetry: true,
              reactQuery: {
                clientConfig: {
                  defaultOptions: {
                    queries: {
                      retry: false,
                      staleTime: 15_000,
                      placeholderData: undefined,
                    },
                  },
                },
              },
            }}
          >
            <App />
          </Refine>
        </AntApp>
      </ConfigProvider>
    </HashRouter>
  </StrictMode>,
)
