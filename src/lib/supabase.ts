import { createClient } from '@supabase/supabase-js'

const isGhPages = typeof window !== 'undefined' && /github\.io/i.test(String(window.location?.host || ''))
const envUrl = (import.meta as any)?.env?.VITE_SUPABASE_URL
const envAnon = (import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY
const fallbackUrl = 'https://oltsiocyesbgezlrcxze.supabase.co'
const fallbackAnon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sdHNpb2N5ZXNiZ2V6bHJjeHplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA1Nzg4NjAsImV4cCI6MjA3NjE1NDg2MH0.bFDHm24x5SDN4MPwG3lZWVoa78oKpA5_qWxKwl9ebJM'

const supabaseUrl = envUrl || fallbackUrl
const supabaseAnonKey = envAnon || fallbackAnon

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null as any

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
