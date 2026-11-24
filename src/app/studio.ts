import { theme } from 'antd'
import type { ThemeConfig } from 'antd'

export const localTasksEnabled =
  import.meta.env.DEV &&
  ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname)

export const reviewGatewayConfigured =
  localTasksEnabled &&
  (
    globalThis as typeof globalThis & {
      __BURBOT_REVIEW_GATEWAY_CONFIGURED__?: boolean
    }
  ).__BURBOT_REVIEW_GATEWAY_CONFIGURED__ === true

export const studioTheme: ThemeConfig = {
  algorithm: [theme.darkAlgorithm, theme.compactAlgorithm],
  token: {
    colorPrimary: '#6857cd',
    colorInfo: '#85aaff',
    colorSuccess: '#64d6a2',
    colorWarning: '#e7b86b',
    colorError: '#ff7b8a',
    colorBgBase: '#0d0f13',
    colorBgContainer: '#14171d',
    colorBgElevated: '#191c24',
    colorBorder: '#373d49',
    colorBorderSecondary: '#282d37',
    colorText: '#e5e7ef',
    colorTextSecondary: '#a1a8b8',
    borderRadius: 7,
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    fontSize: 14,
  },
  components: {
    Table: {
      headerBg: '#191c24',
      headerColor: '#b9c1d1',
      rowHoverBg: '#1c2029',
    },
    Card: { headerBg: '#191c24' },
    Layout: { bodyBg: 'transparent' },
  },
}
