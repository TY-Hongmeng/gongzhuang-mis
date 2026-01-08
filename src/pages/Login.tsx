import React, { useState } from 'react'
import { Form, Input, Button, Card, Typography, message, Spin } from 'antd'
import { UserOutlined, LockOutlined, PhoneOutlined } from '@ant-design/icons'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const { Title, Text } = Typography

interface LoginForm {
  phone: string
  password: string
}

const Login: React.FC = () => {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { login, isLoading } = useAuthStore()

  const onFinish = async (values: LoginForm) => {
    const result = await login(values.phone, values.password)
    
    if (result.success) {
      message.success(result.message)
      navigate('/dashboard')
    } else {
      message.error(result.message)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4 login-form">
      <Card 
        className="w-full max-w-lg shadow-2xl border-0"
        style={{ borderRadius: '16px' }}
      >
        <style>{`
          .login-form .ant-input,
          .login-form .ant-input:focus,
          .login-form .ant-input-outlined,
          .login-form .ant-input-affix-wrapper .ant-input,
          .login-form .ant-input-password .ant-input {
            border: none !important;
            box-shadow: none !important;
          }
          .login-form .ant-input-affix-wrapper,
          .login-form .ant-input-password .ant-input-affix-wrapper {
            border: 1px solid #d9d9d9 !important;
            box-shadow: none !important;
          }
          .login-form .ant-input-affix-wrapper-focused { box-shadow: none !important; }
        `}</style>
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserOutlined className="text-2xl text-white" />
          </div>
          <Title level={2} className="text-gray-800 mb-2">
            工装制造管理系统
          </Title>
          <Text type="secondary">
            请使用手机号和密码登录
          </Text>
        </div>

        <Spin spinning={isLoading}>
          <Form
            form={form}
            name="login"
            onFinish={onFinish}
            layout="vertical"
            size="large"
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
              name="password"
              label="密码"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6位' }
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="text-gray-400" />}
                placeholder="请输入密码"
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
                登录
              </Button>
            </Form.Item>
          </Form>
        </Spin>

        <div className="text-center space-y-3">
          <div>
            <Link 
              to="/reset-password" 
              className="text-blue-500 hover:text-blue-600 text-sm"
            >
              忘记密码？
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

        
      </Card>
    </div>
  )
}

export default Login
