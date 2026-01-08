import React from 'react'
import { Card, Row, Col, Typography, Button } from 'antd'
import {
  UserOutlined,
  BankOutlined,
  SafetyOutlined,
  SettingOutlined,
  ToolOutlined,
  ExperimentOutlined,
  LogoutOutlined,
  DatabaseOutlined,
  ScissorOutlined,
  ShoppingOutlined
} from '@ant-design/icons'
import { useAuthStore } from '../stores/authStore'
import { useNavigate, Link } from 'react-router-dom'

const { Title, Text } = Typography

const Dashboard: React.FC = () => {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

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
  const perms = (user as any)?.roles?.role_permissions || []
  const can = (module: string) => {
    const roleName = String((user as any)?.roles?.name || '')
    if (roleName === '超级管理员') return true
    return perms.some((rp: any) => {
      const mod = MODULE_ALIASES[String(rp?.permissions?.module || '')] || String(rp?.permissions?.module || '')
      return String(rp?.permissions?.code || '') === `${module}:access` || (mod === module && String(rp?.permissions?.name || '') === '访问模块')
    })
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="p-6">
      {/* 顶部标题与操作 */}
      <div className="flex items-center justify-between mb-4">
        <Title level={2} className="mb-0">
          欢迎回来，{user?.real_name}！
        </Title>
        <Button type="primary" danger icon={<LogoutOutlined />} onClick={handleLogout}>
          退出登录
        </Button>
      </div>

      <Text type="secondary" className="text-lg mb-8 block">
        今天是 {new Date().toLocaleDateString('zh-CN', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          weekday: 'long'
        })}
      </Text>

      {/* 快捷操作 */}
      <Card title="快捷操作">
        <Row gutter={[16, 16]}>
          {can('tooling') && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <Link to="/tooling-info" style={{ display: 'block' }}>
                <Card hoverable className="text-center cursor-pointer">
                  <ToolOutlined className="text-3xl text-red-500 mb-2" />
                  工装信息
                </Card>
              </Link>
            </Col>
          )}

          {can('user') && (
          <Col xs={24} sm={12} md={8} lg={6}>
            <Card 
              hoverable 
              className="text-center cursor-pointer"
              onClick={() => navigate('/users')}
            >
              <UserOutlined className="text-3xl text-blue-500 mb-2" />
              用户管理
            </Card>
          </Col>
          )}
          {can('company') && (
          <Col xs={24} sm={12} md={8} lg={6}>
            <Card 
              hoverable 
              className="text-center cursor-pointer"
              onClick={() => navigate('/companies')}
            >
              <BankOutlined className="text-3xl text-green-500 mb-2" />
              公司管理
            </Card>
          </Col>
          )}
          {can('permission') && (
          <Col xs={24} sm={12} md={8} lg={6}>
            <Card 
              hoverable 
              className="text-center cursor-pointer"
              onClick={() => navigate('/permissions')}
            >
              <SafetyOutlined className="text-3xl text-purple-500 mb-2" />
              权限管理
            </Card>
          </Col>
          )}
          {can('base_data') && (
          <Col xs={24} sm={12} md={8} lg={6}>
            <Card 
              hoverable 
              className="text-center cursor-pointer"
              onClick={() => navigate('/options-management')}
            >
              <DatabaseOutlined className="text-3xl text-indigo-500 mb-2" />
              基础数据
            </Card>
          </Col>
          )}
          {can('cutting') && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <Link to="/cutting-management" style={{ display: 'block' }}>
                <Card hoverable className="text-center cursor-pointer">
                  <ScissorOutlined className="text-3xl text-orange-500 mb-2" />
                  下料管理
                </Card>
              </Link>
            </Col>
          )}
          {can('purchase') && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <Link to="/purchase-management" style={{ display: 'block' }}>
                <Card hoverable className="text-center cursor-pointer">
                  <ShoppingOutlined className="text-3xl text-green-500 mb-2" />
                  采购管理
                </Card>
              </Link>
            </Col>
          )}
          {can('personal_settings') && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <Card 
                hoverable 
                className="text-center cursor-pointer"
                onClick={() => navigate('/profile')}
              >
                <SettingOutlined className="text-3xl text-orange-500 mb-2" />
                个人设置
              </Card>
            </Col>
          )}
          {can('work_hours_entry') && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <Link to="/work-hours" style={{ display: 'block' }}>
                <Card hoverable className="text-center cursor-pointer">
                  <ExperimentOutlined className="text-3xl text-pink-500 mb-2" />
                  工时录入
                </Card>
              </Link>
            </Col>
          )}
          {can('work_hours') && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <Link to="/work-hours-management" style={{ display: 'block' }}>
                <Card hoverable className="text-center cursor-pointer">
                  <ExperimentOutlined className="text-3xl text-purple-500 mb-2" />
                  工时管理
                </Card>
              </Link>
            </Col>
          )}
        </Row>
      </Card>
    </div>
  )
}

export default Dashboard
