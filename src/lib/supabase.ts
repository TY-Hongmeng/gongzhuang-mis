import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 开发环境优雅降级：环境变量缺失时不抛错，导出 null
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null as any

if (!supabase) {
  console.warn('Supabase 未配置：请设置 VITE_SUPABASE_URL 与 VITE_SUPABASE_ANON_KEY')
}

// 数据库类型定义
export interface Company {
  id: string
  name: string
  address?: string
  contact_phone?: string
  description?: string
  created_at: string
  updated_at: string
}

export interface Role {
  id: string
  name: string
  description?: string
  created_at: string
  updated_at: string
}

export interface Permission {
  id: string
  name: string
  code: string
  description?: string
  module: string
  created_at: string
}

export interface User {
  id: string
  phone: string
  real_name: string
  id_card: string
  company_id?: string
  role_id?: string
  status: 'active' | 'inactive' | 'pending'
  created_at: string
  updated_at: string
  company?: Company
  role?: Role
}

export interface RolePermission {
  id: string
  role_id: string
  permission_id: string
  created_at: string
  role?: Role
  permission?: Permission
}