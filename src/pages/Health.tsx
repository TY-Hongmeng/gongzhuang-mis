import React from 'react'
import { supabase } from '../lib/supabase'

export default function Health() {
  const supaConfigured = !!supabase
  const now = new Date().toLocaleString()
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI', padding: 24 }}>
      <h2 style={{ marginBottom: 12 }}>前端健康检查</h2>
      <ul style={{ lineHeight: 1.8 }}>
        <li>环境：{import.meta.env.DEV ? '开发' : '生产'}</li>
        <li>Supabase：{supaConfigured ? '已配置' : '未配置'}</li>
        <li>时间：{now}</li>
      </ul>
      <p style={{ color: '#666' }}>此页不经过登录校验，仅用于快速验证构建与依赖加载是否正常。</p>
    </div>
  )
}