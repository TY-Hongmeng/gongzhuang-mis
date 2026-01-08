import React, { useState, useEffect } from 'react'
import { Form, Input, Button, Card, Typography, message, Spin, Select } from 'antd'
import { UserOutlined, LockOutlined, PhoneOutlined, IdcardOutlined, BankOutlined, TeamOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { supabase, type Company, type Role } from '../lib/supabase'

const { Title, Text } = Typography
const { Option } = Select

interface RegisterForm {
  phone: string
  password: string
  confirmPassword: string
  realName: string
  idCard: string
  companyId: string
  roleId: string
  workshopId?: string
  teamId?: string
}

const Register: React.FC = () => {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { register, isLoading } = useAuthStore()
  const [companies, setCompanies] = useState<Company[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [workshops, setWorkshops] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [hasWorkshops, setHasWorkshops] = useState<boolean>(false)
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    try {
      // 加载公司列表
      const { data: companiesData, error: companiesError } = await supabase
        .from('companies')
        .select('*')
        .order('name')

      if (companiesError) {
        console.error('Error loading companies:', companiesError)
        message.error('加载公司列表失败')
      } else {
        setCompanies(companiesData || [])
      }

      // 加载角色列表（排除超级管理员）
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .neq('name', '超级管理员')
        .order('name')

      if (rolesError) {
        console.error('Error loading roles:', rolesError)
        message.error('加载角色列表失败')
      } else {
        setRoles(rolesData || [])
      }
    } catch (error) {
      console.error('Error loading initial data:', error)
      message.error('加载数据失败')
    } finally {
      setLoadingData(false)
    }
  }

  const onFinish = async (values: RegisterForm) => {
    const result = await register({
      phone: values.phone,
      password: values.password,
      realName: values.realName,
      idCard: values.idCard,
      companyId: values.companyId,
      roleId: values.roleId,
      workshopId: values.workshopId,
      teamId: values.teamId
    })
    
    if (result.success) {
      message.success(result.message)
      navigate('/login')
    } else {
      message.error(result.message)
    }
  }

  const validateIdCard = (_: any, value: string) => {
    if (!value) {
      return Promise.reject(new Error('请输入身份证号'))
    }
    
    const idCardRegex = /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/
    if (!idCardRegex.test(value)) {
      return Promise.reject(new Error('请输入正确的身份证号'))
    }
    
    return Promise.resolve()
  }

  if (loadingData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4 register-form">
      <Card 
        className="w-full max-w-lg shadow-2xl border-0"
        style={{ borderRadius: '16px' }}
      >
        <style>{`
          /* 仅保留外层一层边框，去除内层输入框边框 */
          .register-form .ant-input,
          .register-form .ant-input:focus,
          .register-form .ant-input-outlined,
          .register-form .ant-input-affix-wrapper .ant-input,
          .register-form .ant-input-password .ant-input {
            border: none !important;
            box-shadow: none !important;
          }
          .register-form .ant-input-affix-wrapper,
          .register-form .ant-input-password .ant-input-affix-wrapper {
            border: 1px solid #d9d9d9 !important;
            box-shadow: none !important;
          }
          .register-form .ant-input-affix-wrapper-focused {
            box-shadow: none !important;
          }
        `}</style>
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserOutlined className="text-2xl text-white" />
          </div>
          <Title level={2} className="text-gray-800 mb-2">
            用户注册
          </Title>
          <Text type="secondary">
            请填写完整信息进行注册
          </Text>
        </div>

        <Spin spinning={isLoading}>
          <Form
            form={form}
            name="register"
            onFinish={onFinish}
            layout="vertical"
            size="large"
            scrollToFirstError
          >
            <Form.Item
              name="phone"
              label="手机号"
              rules={[
                { required: true, message: '请输入手机号' },
                { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }
              ]}
            >
              <Input
                prefix={<PhoneOutlined className="text-gray-400" />}
                placeholder="请输入手机号"
                className="rounded-lg"
              />
            </Form.Item>

            <Form.Item
              name="realName"
              label="真实姓名"
              rules={[
                { required: true, message: '请输入真实姓名' },
                { min: 2, message: '姓名至少2个字符' },
                { max: 20, message: '姓名最多20个字符' }
              ]}
            >
              <Input
                prefix={<UserOutlined className="text-gray-400" />}
                placeholder="请输入真实姓名"
                className="rounded-lg"
              />
            </Form.Item>

            <Form.Item
              name="idCard"
              label="身份证号"
              rules={[
                { validator: validateIdCard }
              ]}
            >
              <Input
                prefix={<IdcardOutlined className="text-gray-400" />}
                placeholder="请输入身份证号"
                className="rounded-lg"
              />
            </Form.Item>

            <Form.Item
              name="companyId"
              label="所属公司"
              rules={[
                { required: true, message: '请选择所属公司' }
              ]}
            >
              <Select
                placeholder="请选择所属公司"
                className="rounded-lg"
                suffixIcon={<BankOutlined className="text-gray-400" />}
                onChange={async (companyId) => {
                  const ws = await fetch(`/api/tooling/org/workshops?company_id=${companyId}`)
                  const wj = await ws.json()
                  const ts = await fetch(`/api/tooling/org/teams?company_id=${companyId}`)
                  const tj = await ts.json()
                  const wsItems = wj.items || []
                  const tsItems = tj.items || []
                  setWorkshops(wsItems)
                  setHasWorkshops(wsItems.length > 0)
                  const rid = form.getFieldValue('roleId')
                  const roleName = String((roles.find(r => r.id === rid)?.name) || '')
                  if (roleName.includes('技术员')) {
                    // 技术员：仅选择技术组；公司有车间也不显示车间，直接展示全公司技术组
                    setTeams(tsItems.filter((t: any) => String(t.name || '').includes('技术组')))
                  } else if (wsItems.length > 0) {
                    // 员工或其他：有车间时，先选车间再加载对应班组
                    setTeams([])
                  } else {
                    // 无车间：直接选择未分配班组
                    setTeams(tsItems.filter((t: any) => !t.workshop_id))
                  }
                  form.setFieldsValue({ workshopId: undefined, teamId: undefined })
                }}
              >
                {companies.map(company => (
                  <Option key={company.id} value={company.id}>
                    {company.name}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item
              name="roleId"
              label="用户角色"
              rules={[
                { required: true, message: '请选择用户角色' }
              ]}
            >
              <Select
                placeholder="请选择用户角色"
                className="rounded-lg"
                suffixIcon={<TeamOutlined className="text-gray-400" />}
                onChange={async (rid) => {
                  const r = roles.find(x => x.id === rid)
                  const rn = String(r?.name || '')
                  // 切换角色时清理组织选择
                  form.setFieldsValue({ workshopId: undefined, teamId: undefined })
                  // 若为技术员，自动过滤为技术组
                  if (rn.includes('技术员')) {
                    const cid = form.getFieldValue('companyId')
                    if (cid) {
                      try {
                        const ts = await fetch(`/api/tooling/org/teams?company_id=${cid}`)
                        const tj = await ts.json()
                        const techTeams = (tj.items || []).filter((t: any) => String(t.name || '').includes('技术组'))
                        setTeams(techTeams)
                      } catch {}
                    } else {
                      const techTeams = (teams || []).filter((t: any) => String(t.name || '').includes('技术组'))
                      setTeams(techTeams)
                    }
                  }
                }}
              >
                {roles.map(role => (
                  <Option key={role.id} value={role.id}>
                    {role.name}
                    {role.description && (
                      <span className="text-gray-500 ml-2">
                        ({role.description})
                      </span>
                    )}
                  </Option>
                ))}
              </Select>
            </Form.Item>

            {hasWorkshops && (
              <Form.Item shouldUpdate noStyle>
                {() => {
                  const rid = form.getFieldValue('roleId')
                  const roleName = String((roles.find(r => r.id === rid)?.name) || '')
                  const isEmployee = roleName.includes('员工')
                  if (!isEmployee) return null
                  return (
                    <Form.Item name="workshopId" label="车间" rules={[{ required: true, message: '请选择车间' }]}>
                      <Select placeholder="请选择车间" className="rounded-lg" onChange={async (wid) => {
                        const ts = await fetch(`/api/tooling/org/teams?company_id=${form.getFieldValue('companyId')}&workshop_id=${wid}`)
                        const tj = await ts.json()
                        const nextTeams = tj.items || []
                        setTeams(nextTeams)
                        form.setFieldsValue({ teamId: undefined })
                      }}>
                        {workshops.map((w) => (
                          <Option key={w.id} value={w.id}>{w.name}</Option>
                        ))}
                      </Select>
                    </Form.Item>
                  )
                }}
              </Form.Item>
            )}

            <Form.Item shouldUpdate noStyle>
              {() => {
                const rid = form.getFieldValue('roleId')
                const roleName = String((roles.find(r => r.id === rid)?.name) || '')
                const isEmployee = roleName.includes('员工')
                const isTechnician = roleName.includes('技术员')
                const requireTeam = isTechnician || (isEmployee && (!hasWorkshops || !!form.getFieldValue('workshopId')))
                if (!requireTeam) return null
                const disabled = (isEmployee && hasWorkshops && !form.getFieldValue('workshopId'))
                const displayTeams = isTechnician ? (teams || []).filter((t: any) => String(t.name || '').includes('技术组')) : (teams || [])
                return (
                  <Form.Item name="teamId" label={isTechnician ? '技术组' : '班组'} rules={requireTeam ? [{ required: true, message: `请选择${isTechnician ? '技术组' : '班组'}` }] : []}>
                    <Select placeholder={`请选择${isTechnician ? '技术组' : '班组'}`} className="rounded-lg" disabled={disabled}>
                      {displayTeams.map((t: any) => (
                        <Option key={t.id} value={t.id}>{t.name}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                )
              }}
            </Form.Item>

            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6位' },
                { max: 20, message: '密码最多20位' }
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder="请输入密码"
                className="rounded-lg"
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label="确认密码"
              dependencies={['password']}
              rules={[
                { required: true, message: '请确认密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'))
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder="请再次输入密码"
                className="rounded-lg"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                className="w-full h-12 text-lg font-medium rounded-lg"
                style={{ backgroundColor: '#1890FF' }}
              >
                注册
              </Button>
            </Form.Item>
          </Form>
        </Spin>

        <div className="text-center">
          <Text type="secondary" className="text-sm">
            已有账号？{' '}
            <Link 
              to="/login" 
              className="text-blue-500 hover:text-blue-600"
            >
              立即登录
            </Link>
          </Text>
        </div>
      </Card>
    </div>
  )
}

export default Register
