import React, { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Spin } from 'antd'
const MODULE_ALIASES: Record<string, string> = {
  '工装信息': 'tooling', tooling: 'tooling',
  '下料管理': 'cutting', cutting: 'cutting',
  '采购管理': 'purchase', purchase: 'purchase',
  '公司管理': 'company', company: 'company',
  '组织机构': 'company', org: 'company',
  '用户管理': 'user', user: 'user',
  '基础数据': 'base_data', base_data: 'base_data',
  '工时录入': 'work_hours_entry', work_hours_entry: 'work_hours_entry',
  '工时管理': 'work_hours', work_hours: 'work_hours',
  '权限管理': 'permission', permission: 'permission',
  '个人设置': 'personal_settings', personal_settings: 'personal_settings'
}

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredModule?: string
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredModule 
}) => {
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // 显示加载状态
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  // 未登录，重定向到登录页
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // 账户未激活，显示提示
  if (user.status !== 'active') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white rounded-lg shadow-lg max-w-md">
          <div className="text-6xl mb-4">⏳</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            账户待审核
          </h2>
          <p className="text-gray-600 mb-4">
            您的账户正在审核中，请耐心等待管理员审核通过。
          </p>
          <p className="text-sm text-gray-500">
            如有疑问，请联系系统管理员。
          </p>
        </div>
      </div>
    )
  }

  // 模块访问控制
  if (requiredModule) {
    const roleName = String((user as any)?.roles?.name || '')
    if (roleName === '超级管理员') {
      return <>{children}</>
    }
    const rps = (user as any)?.roles?.role_permissions || []
    const allowedByCode = rps.some((rp: any) => String(rp?.permissions?.code || '') === `${requiredModule}:access`)
    const allowedByName = rps.some((rp: any) => {
      const mod = MODULE_ALIASES[String(rp?.permissions?.module || '')] || String(rp?.permissions?.module || '')
      return mod === requiredModule && String(rp?.permissions?.name || '') === '访问模块'
    })
    if (!(allowedByCode || allowedByName)) {
      return <Navigate to="/dashboard" replace />
    }
  }

  return <>{children}</>
}

export default ProtectedRoute
