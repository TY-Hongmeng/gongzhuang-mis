import React from 'react'
import { Form, Input, Button, Card, Typography, message, Spin } from 'antd'
import { LockOutlined, IdcardOutlined, SafetyOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const { Title, Text } = Typography

interface ResetPasswordForm {
  idCard: string
  newPassword: string
  confirmPassword: string
}

const ResetPassword: React.FC = () => {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { resetPassword, isLoading } = useAuthStore()

  const onFinish = async (values: ResetPasswordForm) => {
    const result = await resetPassword(values.idCard, values.newPassword)
    
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <Card 
        className="w-full max-w-md shadow-2xl border-0"
        style={{ borderRadius: '16px' }}
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <SafetyOutlined className="text-2xl text-white" />
          </div>
          <Title level={2} className="text-gray-800 mb-2">
            重置密码
          </Title>
          <Text type="secondary">
            请使用身份证号重置密码
          </Text>
        </div>

        <Spin spinning={isLoading}>
          <Form
            form={form}
            name="resetPassword"
            onFinish={onFinish}
            layout="vertical"
            size="large"
          >
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
              name="newPassword"
              label="新密码"
              rules={[
                { required: true, message: '请输入新密码' },
                { min: 6, message: '密码至少6位' },
                { max: 20, message: '密码最多20位' }
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder="请输入新密码"
                className="rounded-lg"
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              label="确认新密码"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: '请确认新密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'))
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder="请再次输入新密码"
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
                重置密码
              </Button>
            </Form.Item>
          </Form>
        </Spin>

        <div className="text-center space-y-3">
          <div>
            <Link 
              to="/login" 
              className="text-blue-500 hover:text-blue-600 text-sm"
            >
              返回登录
            </Link>
          </div>
          <div className="text-gray-500 text-sm">
            还没有账号？{' '}
            <Link 
              to="/register" 
              className="text-blue-500 hover:text-blue-600"
            >
              立即注册
            </Link>
          </div>
        </div>

        <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <Text type="secondary" className="text-xs">
            <strong>安全提示：</strong><br />
            为了您的账户安全，密码重置需要验证身份证号。
            如果您忘记了身份证号，请联系系统管理员。
          </Text>
        </div>
      </Card>
    </div>
  )
}

export default ResetPassword