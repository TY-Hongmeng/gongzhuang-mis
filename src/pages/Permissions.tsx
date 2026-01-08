import React, { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  message,
  Popconfirm,
  Typography,
  Card,
  Checkbox,
  Tag,
  Spin
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SafetyOutlined,
  LeftOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const { Title, Text } = Typography
const { TextArea } = Input

// 模块配置：名称和代码的映射关系
const MODULES = [
  { name: '工装信息', code: 'tooling' },
  { name: '用户管理', code: 'user' },
  { name: '公司管理', code: 'company' },
  { name: '权限管理', code: 'permission' },
  { name: '基础数据', code: 'base_data' },
  { name: '下料管理', code: 'cutting' },
  { name: '采购管理', code: 'purchase' },
  { name: '个人设置', code: 'personal_settings' },
  { name: '工时录入', code: 'work_hours_entry' },
  { name: '工时管理', code: 'work_hours' }
]

// 角色数据类型
interface Role {
  id: string
  name: string
  created_at: string
  updated_at: string
  modules?: string[]
}

// 角色表单数据类型
interface RoleFormData {
  name: string
  modules: string[]
}

const Permissions: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [form] = Form.useForm()
  const navigate = useNavigate()

  // 加载角色列表
  const loadRoles = async () => {
    setLoading(true)
    try {
      // 获取所有角色
      const { data: rolesData, error: rolesError } = await supabase
        .from('roles')
        .select('*')
        .order('created_at', { ascending: false })

      if (rolesError) throw new Error(rolesError.message)

      // 获取每个角色的模块权限
      const rolesWithModules = await Promise.all(
        (rolesData || []).map(async (role) => {
          // 超级管理员拥有所有模块权限
          if (role.name === '超级管理员') {
            return {
              ...role,
              modules: MODULES.map(m => m.name)
            }
          }

          // 获取角色关联的权限
          const { data: rolePermissions, error: rpError } = await supabase
            .from('role_permissions')
            .select('permission:permissions(module)')
            .eq('role_id', role.id)

          if (rpError) throw new Error(rpError.message)

          // 提取模块列表
          const modules = Array.from(
            new Set(rolePermissions?.map(rp => rp.permission.module).filter(Boolean) as string[])
          )

          return {
            ...role,
            modules
          }
        })
      )

      setRoles(rolesWithModules)
    } catch (error) {
      console.error('加载角色失败:', error)
      message.error('加载角色列表失败')
    } finally {
      setLoading(false)
    }
  }

  // 初始化加载角色
  useEffect(() => {
    loadRoles()
  }, [])

  // 打开新增角色弹窗
  const handleAddRole = () => {
    setEditingRole(null)
    form.resetFields()
    setModalVisible(true)
  }

  // 打开编辑角色弹窗
  const handleEditRole = (role: Role) => {
    setEditingRole(role)
    form.setFieldsValue({
      name: role.name,
      modules: role.modules || []
    })
    setModalVisible(true)
  }

  // 删除角色
  const handleDeleteRole = async (id: string) => {
    try {
      // 先删除角色权限关联
      await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', id)

      // 再删除角色
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', id)

      if (error) throw new Error(error.message)

      message.success('角色删除成功')
      loadRoles()
    } catch (error) {
      console.error('删除角色失败:', error)
      message.error('删除角色失败')
    }
  }

  // 保存角色和权限配置
  const handleSaveRole = async (values: RoleFormData) => {
    try {
      setLoading(true)

      // 验证角色名称
      if (!values.name.trim()) {
        message.error('角色名称不能为空')
        return
      }

      // 检查是否是超级管理员编辑
      if (editingRole && editingRole.name === '超级管理员') {
        message.error('超级管理员不能被编辑')
        return
      }

      let roleId: string

      if (editingRole) {
        // 更新角色信息
        const { error: roleError } = await supabase
          .from('roles')
          .update({
            name: values.name,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingRole.id)

        if (roleError) throw new Error(roleError.message)

        roleId = editingRole.id
        message.success('角色信息更新成功')
      } else {
        // 创建新角色
        const { data: newRole, error: roleError } = await supabase
          .from('roles')
          .insert({
            name: values.name
          })
          .select()
          .single()

        if (roleError) throw new Error(roleError.message)

        roleId = newRole.id
        message.success('角色创建成功')
      }

      // 超级管理员拥有所有权限，不需要配置
      if (values.name === '超级管理员') {
        // 为超级管理员创建所有模块的访问权限
        await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', roleId)
        
        // 为每个模块创建或关联权限
        for (const module of MODULES) {
          // 检查模块访问权限是否存在，不存在则创建
          const { data: existingPermission } = await supabase
            .from('permissions')
            .select('id')
            .eq('module', module.name)
            .eq('name', '访问模块')
            .single()

          let permissionId: string

          if (existingPermission) {
            permissionId = existingPermission.id
          } else {
            const { data: newPermission, error: permError } = await supabase
              .from('permissions')
              .insert({
                module: module.name,
                name: '访问模块',
                code: `${module.code}:access`,
                description: `允许访问${module.name}模块`
              })
              .select()
              .single()

            if (permError) throw new Error(permError.message)
            permissionId = newPermission.id
          }

          // 关联角色和权限
          await supabase
            .from('role_permissions')
            .insert({
              role_id: roleId,
              permission_id: permissionId
            })
        }
      } else {
        // 普通角色，根据选择的模块配置权限
        // 删除角色现有所有权限
        await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', roleId)

        // 为每个选中的模块创建或关联权限
        for (const selectedModuleName of values.modules) {
          const module = MODULES.find(m => m.name === selectedModuleName)
          if (!module) continue

          // 检查模块访问权限是否存在，不存在则创建
          const { data: existingPermission } = await supabase
            .from('permissions')
            .select('id')
            .eq('module', selectedModuleName)
            .eq('name', '访问模块')
            .single()

          let permissionId: string

          if (existingPermission) {
            // 使用现有权限
            permissionId = existingPermission.id
          } else {
            // 创建新权限
            const { data: newPermission, error: permError } = await supabase
              .from('permissions')
              .insert({
                module: selectedModuleName,
                name: '访问模块',
                code: `${module.code}:access`,
                description: `允许访问${selectedModuleName}模块`
              })
              .select()
              .single()

            if (permError) throw new Error(permError.message)
            permissionId = newPermission.id
          }

          // 关联角色和权限
          await supabase
            .from('role_permissions')
            .insert({
              role_id: roleId,
              permission_id: permissionId
            })
        }
      }

      message.success('模块权限配置成功')
      setModalVisible(false)
      loadRoles()
    } catch (error) {
      console.error('保存角色失败:', error)
      message.error('操作失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  // 移除搜索功能，直接使用所有角色
  const filteredRoles = roles

  // 表格列配置
  const columns = [
    {
      title: '序号',
      key: 'index',
      render: (_: any, __: any, index: number) => index + 1,
      width: 80,
      align: 'center'
    },
    {
      title: '角色名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <Space>
          <SafetyOutlined className="text-blue-500" />
          <span className="font-medium">{text}</span>
        </Space>
      )
    },
    {
      title: '可访问模块',
      key: 'modules',
      render: (_: any, record: Role) => (
        <div className="flex flex-wrap gap-1 py-1">
          {record.modules?.map(module => (
            <Tag key={module} color="blue" size="small">
              {module}
            </Tag>
          ))}
        </div>
      )
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: Role) => (
        <Space>
          {record.name !== '超级管理员' && (
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => handleEditRole(record)}
            >
              编辑
            </Button>
          )}
          {record.name !== '超级管理员' && (
            <Popconfirm
              title="确定要删除这个角色吗？"
              description="删除后无法恢复，请谨慎操作。"
              onConfirm={() => handleDeleteRole(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button
                type="link"
                danger
                icon={<DeleteOutlined />}
              >
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ]

  return (
    <Card>
      <div>
          <div className="flex items-center justify-between mb-4">
            <Title level={2} className="mb-0">
              <SafetyOutlined className="text-blue-500 mr-2" /> 权限管理
            </Title>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadRoles}
              >
                刷新
              </Button>
              <Button
                icon={<LeftOutlined />}
                onClick={() => navigate('/dashboard')}
              >
                返回
              </Button>
            </Space>
          </div>
          
          <div className="flex justify-end mb-4">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAddRole}
              style={{ backgroundColor: '#1890FF' }}
            >
              新增角色
            </Button>
          </div>
        </div>

      {/* 角色列表 */}
      <Spin spinning={loading}>
        <Table
          columns={columns}
          dataSource={filteredRoles}
          rowKey="id"
          pagination={false}
          rowClassName="table-row"
          style={{ tableLayout: 'fixed' }}
        />
      </Spin>

      {/* 角色编辑弹窗 */}
      <Modal
        title={editingRole ? '编辑角色' : '新增角色'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveRole}
          size="large"
        >
          <Form.Item
            name="name"
            label="角色名称"
            rules={[
              { required: true, message: '请输入角色名称' },
              { max: 50, message: '角色名称最多50个字符' }
            ]}
          >
            <Input placeholder="请输入角色名称" />
          </Form.Item>

          <Form.Item
            name="modules"
            label="可访问模块"
            rules={[
              { required: true, message: '请至少选择一个模块' }
            ]}
          >
            <Checkbox.Group className="w-full">
              <div className="flex flex-wrap gap-x-8 gap-y-4 p-4 bg-white rounded-lg border border-gray-100">
                {MODULES.map(module => (
                  <div key={module.name} className="flex items-center space-x-2">
                    <Checkbox value={module.name} className="text-blue-600" />
                    <span className="text-gray-800 font-medium">{module.name}</span>
                  </div>
                ))}
              </div>
            </Checkbox.Group>
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
                loading={loading}
              >
                {editingRole ? '更新' : '创建'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

export default Permissions
