import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LeftOutlined, ReloadOutlined, FileTextOutlined, FormOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { Typography, Button, Space } from 'antd';
import PurchaseOrdersList from './PurchaseManagement/PurchaseOrdersList';
import ManualPurchaseOrders from './PurchaseManagement/ManualPurchaseOrders';
import TemporaryPlans from './PurchaseManagement/TemporaryPlans';

export default function PurchaseManagement() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'list' | 'manual' | 'temp'>('list');

  const handleTabChange = (tab: 'list' | 'manual' | 'temp') => {
    setActiveTab(tab);
    const qs = new URLSearchParams(location.search);
    qs.set('tab', tab);
    navigate(`/purchase-management?${qs.toString()}`);
  };

  const handleRefresh = () => {
    // 刷新当前页面
    window.location.reload();
  };

  const handleBack = () => {
    // 返回到仪表盘，而不是使用浏览器历史
    navigate('/dashboard');
  };

  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const tab = qs.get('tab');
    if (tab === 'list' || tab === 'manual' || tab === 'temp') {
      setActiveTab(tab as any);
    }
  }, [location.search]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white">
        {/* 页面标题 - 基础数据风格 */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <Typography.Title level={2} className="mb-0"><ShoppingCartOutlined className="text-3xl text-blue-500 mb-2 mr-2" /> 采购管理</Typography.Title>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleRefresh}>刷新</Button>
              <Button icon={<LeftOutlined />} onClick={handleBack}>返回</Button>
            </Space>
          </div>
        </div>

        <div className="px-6 py-4">
          {/* 标签页导航 - 基础数据风格 */}
          <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
              <button 
                onClick={() => handleTabChange('manual')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'manual' 
                    ? 'border-blue-500 text-blue-600' 
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <FormOutlined className="mr-2" />
              采购申请
            </button>
            <button 
              onClick={() => handleTabChange('list')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'list' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileTextOutlined className="mr-2" />
              采购审批
            </button>
            <button 
              onClick={() => handleTabChange('temp')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'temp' 
                  ? 'border-blue-500 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <ShoppingCartOutlined className="mr-2" />
              临时计划
            </button>
          </nav>
          </div>

          {/* 页面说明 - 基础数据风格 - 已隐藏 */}
          {/*
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <div className="w-5 h-5 bg-green-400 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">i</span>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm text-green-800 font-medium">
                  功能说明
                </p>
                <p className="text-sm text-green-700 mt-1">
                  {activeTab === 'list' 
                    ? '查看和管理所有采购订单，支持筛选、搜索和批量删除操作。'
                    : '手动录入采购订单信息，支持内联编辑、自动保存和投产单位下拉选择。'
                  }
                </p>
              </div>
            </div>
          </div>
          */}

          {/* 标签页内容 */}
          <div>
            {activeTab === 'list' && <PurchaseOrdersList />}
            {activeTab === 'manual' && <ManualPurchaseOrders />}
            {activeTab === 'temp' && <TemporaryPlans />}
          </div>

          {/* 统计信息 - 可选 */}
          {/*
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">—</div>
              <div className="text-sm text-gray-600">总采购单数</div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600">—</div>
              <div className="text-sm text-gray-600">已完成订单</div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-600">—</div>
              <div className="text-sm text-gray-600">待处理订单</div>
            </div>
          </div>
          */}
        </div>
      </div>
    </div>
  );
}
