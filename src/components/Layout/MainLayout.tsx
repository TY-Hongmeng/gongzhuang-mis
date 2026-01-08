import React from 'react'
import { Layout, Button } from 'antd'
import {
  LeftOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'

const { Content } = Layout

const MainLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()

  const handleBack = () => {
    // 如果没有历史记录可返回，则回到仪表盘
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/dashboard')
    }
  }

  const handleRefresh = () => {
    // 使用 react-router 刷新当前路由
    navigate(0)
  }

  // 开发环境自动恢复：仅在首次挂载时检查，不再持续轮询
  React.useEffect(() => {
    if (!import.meta.env.DEV) return;
    
    const pingDevClient = async () => {
      try {
        const res = await fetch('/@vite/client', { cache: 'no-store' });
        // 仅检查连接状态，不再自动刷新页面
        if (!res.ok) {
          console.warn('Vite development server may be disconnected');
        }
      } catch (e) {
        console.warn('Failed to connect to Vite development server');
      }
    };

    // 仅在首次挂载时触发一次检查
    const mountPing = setTimeout(pingDevClient, 500);

    return () => {
      clearTimeout(mountPing);
    };
  }, []);

  return (
    <Layout className="min-h-screen">
      <Content className="bg-gray-50 p-6 overflow-auto">
        <div className="bg-white rounded-lg shadow-sm min-h-full">

          <Outlet />
        </div>
      </Content>
    </Layout>
  )
}

export default MainLayout