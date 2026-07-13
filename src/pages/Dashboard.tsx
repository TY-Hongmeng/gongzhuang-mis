import React from 'react'
import { Card, Row, Col, Typography, Button } from 'antd'
import {
  UserOutlined,
  BankOutlined,
  SafetyOutlined,
  SettingOutlined,
  ToolOutlined,
  BuildOutlined,
  ExperimentOutlined,
  LogoutOutlined,
  DatabaseOutlined,
  ScissorOutlined,
  ShoppingOutlined
} from '@ant-design/icons'
import { useAuthStore } from '../stores/authStore'
import { useNavigate, Link } from 'react-router-dom'
import { fetchWithFallback } from '../utils/api'

const { Title, Text } = Typography

const Dashboard: React.FC = () => {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [reminderSummary, setReminderSummary] = React.useState({
    ledger: { total: 0, pending: 0, expired: 0, missing: 0 },
    mine: { total: 0, pending: 0, expired: 0, missing: 0 }
  })
  const [purchasePendingCount, setPurchasePendingCount] = React.useState(0)

  const MODULE_ALIASES: Record<string, string> = {
    '工装信息': 'tooling', tooling: 'tooling',
    '下料管理': 'cutting', cutting: 'cutting',
    '采购管理': 'purchase', purchase: 'purchase',
    '公司管理': 'company', company: 'company',
    '组织机构': 'company', org: 'company',
    '用户管理': 'user', user: 'user',
    '基础数据': 'base_data', base_data: 'base_data',
    '工时录入': 'work_hours_entry', work_hours_entry: 'work_hours_entry',
    '程序录入': 'program_entry', program_entry: 'program_entry',
    '工时管理': 'work_hours', work_hours: 'work_hours',
    '权限管理': 'permission', permission: 'permission',
    '个人设置': 'personal_settings', personal_settings: 'personal_settings',
    '标准件管理': 'standard_parts', standard_parts: 'standard_parts',
    '标准件出库': 'standard_parts_issue', standard_parts_issue: 'standard_parts_issue',
    '出库记录': 'standard_parts_issue',
    '量具台账': 'measure_tools', measure_tools: 'measure_tools',
    '我的量具': 'my_measure_tools', my_measure_tools: 'my_measure_tools'
  }
  const perms = (user as any)?.roles?.role_permissions || []
  const isManager = String((user as any)?.roles?.name || '').includes('超级管理员')
    || String((user as any)?.roles?.name || '').includes('库管')
    || String((user as any)?.roles?.name || '').includes('仓管')
    || String((user as any)?.roles?.name || '').includes('库房')
  const can = (module: string) => {
    const roleName = String((user as any)?.roles?.name || '')
    if (roleName === '超级管理员') return true
    return perms.some((rp: any) => {
      const mod = MODULE_ALIASES[String(rp?.permissions?.module || '')] || String(rp?.permissions?.module || '')
      return String(rp?.permissions?.code || '') === `${module}:access` || (mod === module && String(rp?.permissions?.name || '') === '访问模块')
    })
  }
  const canMeasureTools = isManager || can('measure_tools')
  const canMyMeasureTools = isManager || can('my_measure_tools')

  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768)

  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  React.useEffect(() => {
    let active = true
    const loadReminderSummary = async () => {
      if (!(canMeasureTools || canMyMeasureTools)) return
      try {
        const params = new URLSearchParams({
          userId: String((user as any)?.id || ''),
          operator: String(user?.real_name || '')
        })
        const res = await fetchWithFallback(`/api/material-assets/reminder-summary?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (!active || !res.ok || json?.success === false) return
        setReminderSummary({
          ledger: {
            total: Number(json?.ledger?.total || 0),
            pending: Number(json?.ledger?.pending || 0),
            expired: Number(json?.ledger?.expired || 0),
            missing: Number(json?.ledger?.missing || 0)
          },
          mine: {
            total: Number(json?.mine?.total || 0),
            pending: Number(json?.mine?.pending || 0),
            expired: Number(json?.mine?.expired || 0),
            missing: Number(json?.mine?.missing || 0)
          }
        })
      } catch {}
    }
    loadReminderSummary()
    return () => { active = false }
  }, [canMeasureTools, canMyMeasureTools, user])

  React.useEffect(() => {
    let active = true
    const loadPurchasePendingCount = async () => {
      if (!can('purchase')) return
      try {
        const params = new URLSearchParams({
          status: 'pending_approval'
        })
        const res = await fetchWithFallback(`/api/purchase-orders?${params.toString()}`)
        const json = await res.json().catch(() => ({}))
        if (!active || !res.ok || json?.success === false) return
        const count = Number(json?.total || json?.data?.length || 0)
        setPurchasePendingCount(count)
      } catch {}
    }
    loadPurchasePendingCount()
    return () => { active = false }
  }, [can])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className={isMobile ? "p-4" : "p-6"}>
      {/* 顶部标题与操作 */}
      <div className={`flex ${isMobile ? 'flex-col items-start gap-4' : 'items-center justify-between'} mb-4`}>
        <Title level={isMobile ? 3 : 2} className="mb-0">
          欢迎回来，{user?.real_name}！
        </Title>
        <Button type="primary" danger icon={<LogoutOutlined />} onClick={handleLogout} style={isMobile ? { width: '100%' } : {}}>
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
                <Card hoverable className="text-center cursor-pointer" bodyStyle={{ position: 'relative' }}>
                  {purchasePendingCount > 0 ? (
                    <span
                      style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        minWidth: 20,
                        height: 20,
                        padding: '0 6px',
                        borderRadius: 10,
                        background: '#ff4d4f',
                        color: '#fff',
                        fontSize: 12,
                        lineHeight: '20px',
                        fontWeight: 600,
                        textAlign: 'center'
                      }}
                    >
                      {purchasePendingCount}
                    </span>
                  ) : null}
                  <ShoppingOutlined className="text-3xl text-green-500 mb-2" />
                  采购管理
                </Card>
              </Link>
            </Col>
          )}
          {can('standard_parts') && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <Link to="/standard-parts" style={{ display: 'block' }}>
                <Card hoverable className="text-center cursor-pointer">
                  <BuildOutlined className="text-3xl text-cyan-500 mb-2" />
                  标准件管理
                </Card>
              </Link>
            </Col>
          )}
          {can('standard_parts_issue') && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <Link to="/standard-parts-issue" style={{ display: 'block' }}>
                <Card hoverable className="text-center cursor-pointer">
                  <BuildOutlined className="text-3xl text-sky-500 mb-2" />
                  出库记录
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
          {can('program_entry') && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <Link to="/program-entry" style={{ display: 'block' }}>
                <Card hoverable className="text-center cursor-pointer">
                  <ExperimentOutlined className="text-3xl text-orange-500 mb-2" />
                  程序录入
                </Card>
              </Link>
            </Col>
          )}
          {can('program_management') && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <Link to="/program-management" style={{ display: 'block' }}>
                <Card hoverable className="text-center cursor-pointer">
                  <ExperimentOutlined className="text-3xl text-cyan-500 mb-2" />
                  程序管理
                </Card>
              </Link>
            </Col>
          )}
          {canMeasureTools && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <Link to="/measure-tools" style={{ display: 'block' }}>
                <Card hoverable className="text-center cursor-pointer" bodyStyle={{ position: 'relative' }}>
                  {reminderSummary.ledger.total > 0 ? (
                    <span
                      style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        minWidth: 20,
                        height: 20,
                        padding: '0 6px',
                        borderRadius: 10,
                        background: '#ff4d4f',
                        color: '#fff',
                        fontSize: 12,
                        lineHeight: '20px',
                        fontWeight: 600,
                        textAlign: 'center'
                      }}
                    >
                      {reminderSummary.ledger.total}
                    </span>
                  ) : null}
                  <BuildOutlined className="text-3xl text-amber-500 mb-2" />
                  量具台账
                </Card>
              </Link>
            </Col>
          )}
          {canMyMeasureTools && (
            <Col xs={24} sm={12} md={8} lg={6}>
              <Link to="/my-measure-tools" style={{ display: 'block' }}>
                <Card hoverable className="text-center cursor-pointer" bodyStyle={{ position: 'relative' }}>
                  {reminderSummary.mine.total > 0 ? (
                    <span
                      style={{
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        minWidth: 20,
                        height: 20,
                        padding: '0 6px',
                        borderRadius: 10,
                        background: '#ff4d4f',
                        color: '#fff',
                        fontSize: 12,
                        lineHeight: '20px',
                        fontWeight: 600,
                        textAlign: 'center'
                      }}
                    >
                      {reminderSummary.mine.total}
                    </span>
                  ) : null}
                  <UserOutlined className="text-3xl text-teal-500 mb-2" />
                  我的量具
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
