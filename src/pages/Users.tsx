import React, { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Space,
  message,
  Tag,
  Typography,
  Card,
  Row,
  Col,
  Popconfirm,
  InputNumber
} from 'antd'
import {
  UserOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  SearchOutlined,
  PhoneOutlined,
  IdcardOutlined,
  ReloadOutlined,
  LeftOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { supabase, type User, type Company, type Role } from '../lib/supabase'

const { Title } = Typography
const { Option } = Select

interface UserWithRelations extends User {
  company?: Company
  role?: Role
}

const Users: React.FC = () => {
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserWithRelations[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [companyIndex, setCompanyIndex] = useState<Record<string,string>>({})
  const [roleIndex, setRoleIndex] = useState<Record<string,string>>({})
  const [workshops, setWorkshops] = useState<any[]>([])
  const [teams, setTeams] = useState<any[]>([])
  const [workshopIndex, setWorkshopIndex] = useState<Record<string,string>>({})
  const [teamIndex, setTeamIndex] = useState<Record<string,string>>({})
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingUser, setEditingUser] = useState<UserWithRelations | null>(null)
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [form] = Form.useForm()

  useEffect(() => {
    loadUsers()
    loadCompanies()
    loadRoles()
    loadOrgAll()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/users')
      const j = await r.json()
      if (!r.ok || !j?.success) {
        message.error('加载用户列表失败')
        return
      }
      setUsers(j.items || [])
    } catch {
      message.error('加载用户列表失败')
    } finally {
      setLoading(false)
    }
  }

  const loadCompanies = async () => {
    try {
      const r = await fetch('/api/users/companies')
      const j = await r.json()
      if (!r.ok || j?.success !== true) {
        console.error('加载公司列表失败')
        return
      }
      const list = j.items || []
      setCompanies(list)
      const cmap: Record<string,string> = {}
      list.forEach((c: any) => { if (c?.id) cmap[c.id] = c.name })
      setCompanyIndex(cmap)
    } catch (error) {
      console.error('加载公司列表失败:', error)
    }
  }

  const loadRoles = async () => {
    try {
      const r = await fetch('/api/users/roles')
      const j = await r.json()
      if (!r.ok || j?.success !== true) {
        console.error('加载角色列表失败')
        return
      }
      const list = j.items || []
      setRoles(list)
      const rmap: Record<string,string> = {}
      list.forEach((r: any) => { if (r?.id) rmap[r.id] = r.name })
      setRoleIndex(rmap)
    } catch (error) {
      console.error('加载角色列表失败:', error)
    }
  }

  const loadOrgAll = async () => {
    try {
      let ws = await fetch(`/api/tooling/org/workshops?ts=${Date.now()}`)
      let wj: any = ws.ok ? await ws.json() : { items: [] }
      let ts = await fetch(`/api/tooling/org/teams?ts=${Date.now()}`)
      let tj: any = ts.ok ? await ts.json() : { items: [] }
      setWorkshops(wj.items || [])
      setTeams(tj.items || [])
      const wmap: Record<string,string> = {};
      const tmap: Record<string,string> = {};
      (wj.items || []).forEach((w: any) => { wmap[w.id] = w.name })
      (tj.items || []).forEach((t: any) => { tmap[t.id] = t.name })
      setWorkshopIndex(wmap)
      setTeamIndex(tmap)
    } catch {}
  }

  const handleEdit = (user: UserWithRelations) => {
    setEditingUser(user)
    setModalVisible(true)
    form.setFieldsValue({
      real_name: user.real_name,
      phone: user.phone,
      id_card: user.id_card,
      company_id: user.company_id,
      role_id: user.role_id,
      capability_coeff: (user as any).capability_coeff ?? 1,
      status: user.status,
      workshop_id: (user as any).workshop_id || undefined,
      team_id: (user as any).team_id || undefined
    })
    // 加载该公司的车间/班组列表
    if (user.company_id) {
      fetch(`/api/tooling/org/workshops?company_id=${user.company_id}&ts=${Date.now()}`).then(r=>r.ok?r.json():{items:[]}).then((j:any)=>setWorkshops((j?.items)||[]))
      fetch(`/api/tooling/org/teams?company_id=${user.company_id}&ts=${Date.now()}`).then(r=>r.ok?r.json():{items:[]}).then((j:any)=>setTeams((j?.items)||[]))
    }
  }

  const handleUpdateStatus = async (userId: string, status: 'active' | 'inactive' | 'pending') => {
    try {
      const r = await fetch(`/api/users/${userId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      const j = await r.json().catch(() => ({} as any))
      if (!r.ok || j?.success !== true) {
        message.error('更新用户状态失败')
        return
      }
      message.success('用户状态更新成功')
      loadUsers()
    } catch (error) {
      message.error('更新用户状态失败')
    }
  }

  const handleSubmit = async (values: any) => {
    try {
      if (!editingUser) return
      const payload = {
        real_name: values.real_name,
        phone: values.phone,
        id_card: values.id_card,
        company_id: values.company_id,
        role_id: values.role_id,
        capability_coeff: Number(values.capability_coeff ?? 1),
        workshop_id: values.workshop_id || null,
        team_id: values.team_id || null,
        status: values.status
      }
      const r = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const j = await r.json().catch(() => ({} as any))
      if (!r.ok || j?.success !== true) {
        message.error('更新用户失败')
        return
      }
      message.success('更新用户成功')
      setModalVisible(false)
      form.resetFields()
      loadUsers()
    } catch (error) {
      message.error('更新用户失败')
    }
  }

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'active':
        return <Tag color="green">正常</Tag>
      case 'inactive':
        return <Tag color="red">禁用</Tag>
      case 'pending':
        return <Tag color="orange">待审核</Tag>
      default:
        return <Tag>{status}</Tag>
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.real_name.toLowerCase().includes(searchText.toLowerCase()) ||
      user.phone.includes(searchText) ||
      user.id_card.includes(searchText) ||
      (user.company?.name && user.company.name.toLowerCase().includes(searchText.toLowerCase()))
    
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const columns = [
    {
      title: '序号',
      key: 'sequence',
      width: 60,
      align: 'center',
      render: (_: any, __: any, index: number) => index + 1
    },
    {
      title: '姓名',
      dataIndex: 'real_name',
      key: 'real_name',
      width: 140,
      render: (text: string) => (
        <Space>
          <UserOutlined className="text-blue-500" />
          <span className="font-medium">{text}</span>
        </Space>
      )
    },
    {
      title: '电话号码',
      dataIndex: 'phone',
      key: 'phone',
      width: 160,
      render: (text: string) => (
        <Space>
          <PhoneOutlined className="text-gray-400" />
          <span className="text-sm text-gray-600">{text}</span>
        </Space>
      )
    },
    {
      title: '身份证号',
      dataIndex: 'id_card',
      key: 'id_card',
      render: (text: string) => (
        <Space>
          <IdcardOutlined className="text-gray-400" />
          <span className="font-mono">{text}</span>
        </Space>
      )
    },
    {
      title: '所属公司',
      key: 'company',
      render: (_: any, record: UserWithRelations) => 
        record.company?.name || companyIndex[String((record as any).company_id || '')] || '-'
    },
    {
      title: '车间',
      key: 'workshop',
      render: (_: any, record: any) => record.workshop?.name || workshopIndex[String(record.workshop_id || '')] || '-'
    },
    {
      title: '班组',
      key: 'team',
      render: (_: any, record: any) => record.team?.name || teamIndex[String(record.team_id || '')] || '-'
    },
    {
      title: '用户角色',
      key: 'role',
      render: (_: any, record: UserWithRelations) => 
        record.role?.name || roleIndex[String((record as any).role_id || '')] || '-'
    },
    {
      title: '能力系数',
      key: 'capability',
      render: (_: any, record: any) => {
        const v = Number((record as any).capability_coeff ?? 1)
        return v.toFixed(2)
      }
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status)
    },
    {
      title: '状态',
      key: 'status_actions',
      width: 120,
      render: (_: any, record: UserWithRelations) => (
        <Space>
          {record.status === 'pending' && (
            <Popconfirm
              title="确定要激活这个用户吗？"
              onConfirm={() => handleUpdateStatus(record.id, 'active')}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" icon={<CheckOutlined />} className="text-green-600">激活</Button>
            </Popconfirm>
          )}
          {record.status === 'active' && (
            <Popconfirm
              title="确定要禁用这个用户吗？"
              onConfirm={() => handleUpdateStatus(record.id, 'inactive')}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" icon={<CloseOutlined />} danger>禁用</Button>
            </Popconfirm>
          )}
          {record.status === 'inactive' && (
            <Popconfirm
              title="确定要重新激活这个用户吗？"
              onConfirm={() => handleUpdateStatus(record.id, 'active')}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" icon={<CheckOutlined />} className="text-green-600">激活</Button>
            </Popconfirm>
          )}
        </Space>
      )
    },
    {
      title: '注册时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text: string) => new Date(text).toLocaleDateString('zh-CN')
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_: any, record: UserWithRelations) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
        </Space>
      )
    }
  ]

  return (
    <Form form={form} component={false}>
      <div className="p-6">
        <Card>
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <Title level={2} className="mb-0">
              <UserOutlined className="text-3xl text-red-500 mb-2 mr-2" /> 用户管理
            </Title>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => loadUsers()}>刷新</Button>
              <Button icon={<LeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
            </Space>
          </div>
          
          <Row gutter={[16, 16]} className="mb-4">
            <Col xs={24} sm={12} md={8}>
              <Input
                placeholder="搜索用户姓名、手机号或身份证"
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
              />
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Select
                placeholder="筛选状态"
                value={statusFilter}
                onChange={setStatusFilter}
                className="w-full"
              >
                <Option value="all">全部状态</Option>
                <Option value="active">正常</Option>
                <Option value="inactive">禁用</Option>
                <Option value="pending">待审核</Option>
              </Select>
            </Col>
          </Row>
        </div>

        <Table
          columns={columns}
          dataSource={filteredUsers}
          rowKey="id"
          loading={loading}
          pagination={false}
          title={() => (
            <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
              <Space>
                <span>总数：{filteredUsers.length}</span>
                <span>禁用：{filteredUsers.filter(u => u.status === 'inactive').length}</span>
              </Space>
            </div>
          )}
        />
      </Card>

      <Modal
        title="编辑用户"
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          form.resetFields()
        }}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          size="large"
        >
          <Form.Item
            name="real_name"
            label="真实姓名"
            rules={[
              { required: true, message: '请输入真实姓名' },
              { min: 2, message: '姓名至少2个字符' },
              { max: 20, message: '姓名最多20个字符' }
            ]}
          >
            <Input placeholder="请输入真实姓名" />
          </Form.Item>

          <Form.Item
            name="phone"
            label="手机号"
            rules={[
              { required: true, message: '请输入手机号' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }
            ]}
          >
            <Input placeholder="请输入手机号" />
          </Form.Item>

          <Form.Item
            name="id_card"
            label="身份证号"
            rules={[
              { required: true, message: '请输入身份证号' },
              { pattern: /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/, message: '请输入正确的身份证号' }
            ]}
          >
            <Input placeholder="请输入身份证号" />
          </Form.Item>

          <Form.Item
            name="company_id"
            label="所属公司"
            rules={[{ required: true, message: '请选择所属公司' }]}
          >
            <Select placeholder="请选择所属公司" onChange={async (cid) => {
              const ws = await fetch(`/api/tooling/org/workshops?company_id=${cid}&ts=${Date.now()}`)
              const wj = ws.ok ? await ws.json() : { items: [] }
              setWorkshops(wj.items || [])
              const ts = await fetch(`/api/tooling/org/teams?company_id=${cid}&ts=${Date.now()}`)
              const tj = ts.ok ? await ts.json() : { items: [] }
              setTeams(tj.items || [])
              form.setFieldsValue({ workshop_id: undefined, team_id: undefined })
            }}>
              {companies.map(company => (
                <Option key={company.id} value={company.id}>
                  {company.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="workshop_id" label="车间">
            <Select placeholder="请选择车间" onChange={async (wid) => {
              const ts = await fetch(`/api/tooling/org/teams?company_id=${form.getFieldValue('company_id')}&workshop_id=${wid}&ts=${Date.now()}`)
              const tj = ts.ok ? await ts.json() : { items: [] }
              setTeams(tj.items || [])
              form.setFieldsValue({ team_id: undefined })
            }}>
              {workshops.map((w:any) => (
                <Option key={w.id} value={w.id}>{w.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="team_id" label="班组">
            <Select placeholder="请选择班组">
              {teams.map((t:any) => (
                <Option key={t.id} value={t.id}>{t.name}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="role_id"
            label="用户角色"
            rules={[{ required: true, message: '请选择用户角色' }]}
          >
            <Select placeholder="请选择用户角色">
              {roles.map(role => (
                <Option key={role.id} value={role.id}>
                  {role.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="status"
            label="用户状态"
            rules={[{ required: true, message: '请选择用户状态' }]}
          >
            <Select placeholder="请选择用户状态">
              <Option value="active">正常</Option>
              <Option value="inactive">禁用</Option>
              <Option value="pending">待审核</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="capability_coeff"
            label="能力系数"
            rules={[{ required: true, message: '请输入能力系数' }]}
          >
            <InputNumber min={0} step={0.1} controls={false} className="w-full" />
          </Form.Item>

          <Form.Item className="mb-0 text-right">
            <Space>
              <Button onClick={() => setModalVisible(false)}>
                取消
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                style={{ backgroundColor: '#1890FF' }}
              >
                更新
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
    </Form>
  )
}

export default Users
