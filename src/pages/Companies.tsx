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
  Row,
  Col
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  BankOutlined,
  ReloadOutlined,
  LeftOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { supabase, type Company } from '../lib/supabase'

const { Title } = Typography
const { TextArea } = Input

interface CompanyFormData {
  name: string
  address?: string
  contact_phone?: string
  description?: string
}

const Companies: React.FC = () => {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadCompanies()
  }, [])

  const loadCompanies = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading companies:', error)
        message.error('加载公司列表失败')
        return
      }

      setCompanies(data || [])
    } catch (error) {
      console.error('Error loading companies:', error)
      message.error('加载公司列表失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setEditingCompany(null)
    setModalVisible(true)
    form.resetFields()
  }

  const handleEdit = (company: Company) => {
    setEditingCompany(company)
    setModalVisible(true)
    form.setFieldsValue({
      name: company.name,
      address: company.address,
      contact_phone: company.contact_phone,
      description: company.description
    })
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', id)

      if (error) {
        console.error('Error deleting company:', error)
        message.error('删除公司失败')
        return
      }

      message.success('删除公司成功')
      loadCompanies()
    } catch (error) {
      console.error('Error deleting company:', error)
      message.error('删除公司失败')
    }
  }

  const handleSubmit = async (values: CompanyFormData) => {
    try {
      if (editingCompany) {
        // 更新公司
        const { error } = await supabase
          .from('companies')
          .update({
            name: values.name,
            address: values.address,
            contact_phone: values.contact_phone,
            description: values.description,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingCompany.id)

        if (error) {
          console.error('Error updating company:', error)
          message.error('更新公司失败')
          return
        }

        message.success('更新公司成功')
      } else {
        // 创建新公司
        const { error } = await supabase
          .from('companies')
          .insert({
            name: values.name,
            address: values.address,
            contact_phone: values.contact_phone,
            description: values.description
          })

        if (error) {
          console.error('Error creating company:', error)
          message.error('创建公司失败')
          return
        }

        message.success('创建公司成功')
      }

      setModalVisible(false)
      form.resetFields()
      loadCompanies()
    } catch (error) {
      console.error('Error submitting company:', error)
      message.error('操作失败')
    }
  }



  const columns = [
    {
      title: '公司名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      align: 'center',
      render: (text: string) => (
        <Space>
          <BankOutlined className="text-blue-500" />
          <span className="font-medium">{text}</span>
        </Space>
      )
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 200,
      align: 'center',
      render: (text: string) => new Date(text).toLocaleDateString('zh-CN')
    },
    {
      title: '组织机构',
      key: 'org',
      width: 200,
      align: 'center',
      render: (_: any, record: Company) => (
        <Button type="link" onClick={() => window.location.href = `/company-org/${record.id}`}>组织机构</Button>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      align: 'center',
      render: (_: any, record: Company) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个公司吗？"
            description="删除后无法恢复，请谨慎操作。"
            onConfirm={() => handleDelete(record.id)}
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
              <BankOutlined className="text-3xl text-red-500 mb-2 mr-2" /> 公司管理
            </Title>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => loadCompanies()}>刷新</Button>
              <Button icon={<LeftOutlined />} onClick={() => navigate('/dashboard')}>返回</Button>
            </Space>
          </div>

          <div className="flex justify-end mb-4">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
              style={{ backgroundColor: '#1890FF' }}
            >
              新增公司
            </Button>
          </div>
        </div>

        <Table
          columns={columns}
          dataSource={companies}
          rowKey="id"
          loading={loading}
          pagination={false}
          tableLayout="fixed"
        />
      </Card>

      <Modal
        title={editingCompany ? '编辑公司' : '新增公司'}
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
            name="name"
            label="公司名称"
            rules={[
              { required: true, message: '请输入公司名称' },
              { max: 100, message: '公司名称最多100个字符' }
            ]}
          >
            <Input placeholder="请输入公司名称" />
          </Form.Item>

          <Form.Item
            name="address"
            label="公司地址"
            rules={[
              { max: 200, message: '地址最多200个字符' }
            ]}
          >
            <Input placeholder="请输入公司地址" />
          </Form.Item>

          <Form.Item
            name="contact_phone"
            label="联系电话"
            rules={[
              { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }
            ]}
          >
            <Input placeholder="请输入联系电话" />
          </Form.Item>

          <Form.Item
            name="description"
            label="公司描述"
            rules={[
              { max: 500, message: '描述最多500个字符' }
            ]}
          >
            <TextArea
              rows={4}
              placeholder="请输入公司描述"
              showCount
              maxLength={500}
            />
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
                {editingCompany ? '更新' : '创建'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
    </Form>
  )
}

export default Companies
