import React from 'react'
import { Typography } from 'antd'

declare const __APP_VERSION__: string

const { Text } = Typography

const AppVersionBadge: React.FC = () => {
  return (
    <div style={{ position: 'fixed', top: 10, right: 12, zIndex: 1000, pointerEvents: 'none' }}>
      <Text type="secondary" style={{ fontSize: 12, background: 'rgba(255,255,255,0.86)', padding: '2px 8px', borderRadius: 10, border: '1px solid #f0f0f0' }}>
        v{__APP_VERSION__}
      </Text>
    </div>
  )
}

export default AppVersionBadge
