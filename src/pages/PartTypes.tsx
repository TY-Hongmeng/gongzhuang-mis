import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Space,
  message,
  Popconfirm,
  Card,
  Typography
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { PartType } from '../types/tooling';

const { Title } = Typography;

interface PartTypeFormData {
  name: string;
  description?: string;
  volume_formula?: string;
  input_format?: string;
}

const PartTypes: React.FC = () => {
  const [partTypes, setPartTypes] = useState<PartType[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPartType, setEditingPartType] = useState<PartType | null>(null);
  const [form] = Form.useForm<PartTypeFormData>();

  // 获取料型列表
  const fetchPartTypes = async () => {
    setLoading(true);
    try {
      // 使用fetchWithFallback确保在GitHub Pages环境下能正确处理请求
      const { fetchWithFallback } = await import('../utils/api');
      const res = await fetchWithFallback('/api/part-types?order=created_at.desc');
      const json = await res.json();
      setPartTypes(json.data || []);
    } catch (error) {
      console.error('获取料型列表失败:', error);
      message.error('获取料型列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 保存料型
  const savePartType = async (values: PartTypeFormData) => {
    try {
      const { fetchWithFallback } = await import('../utils/api');
      const isEditing = !!editingPartType;
      const url = isEditing ? `/api/part-types/${editingPartType!.id}` : '/api/part-types';
      const method = isEditing ? 'PUT' : 'POST';
      
      const res = await fetchWithFallback(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || '保存失败');
      }
      
      message.success(isEditing ? '料型更新成功' : '料型创建成功');
      setModalVisible(false);
      form.resetFields();
      setEditingPartType(null);
      fetchPartTypes();
    } catch (error: any) {
      console.error('保存料型失败:', error);
      message.error(error.message || '保存失败');
    }
  };

  // 删除料型
  const deletePartType = async (id: string) => {
    try {
      const { fetchWithFallback } = await import('../utils/api');
      const res = await fetchWithFallback(`/api/part-types/${id}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: '删除失败' }));
        throw new Error(json.error || '删除失败');
      }
      
      message.success('料型删除成功');
      fetchPartTypes();
    } catch (error: any) {
      console.error('删除料型失败:', error);
      message.error(error.message || '删除失败');
    }
  };

  // 打开编辑模态框
  const openEditModal = (partType?: PartType) => {
    setEditingPartType(partType || null);
    if (partType) {
      form.setFieldsValue({
        name: partType.name,
        description: partType.description,
        volume_formula: partType.volume_formula,
        input_format: partType.input_format,
      });
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  // 关闭模态框
  const closeModal = () => {
    setModalVisible(false);
    setEditingPartType(null);
    form.resetFields();
  };

  // 表格列定义
  const columns = [
    {
      title: '料型名称',
      dataIndex: 'name',
      key: 'name',
      width: '20%',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: '25%',
      render: (text: string) => text || '-',
    },
    {
      title: '体积公式',
      dataIndex: 'volume_formula',
      key: 'volume_formula',
      width: '25%',
      render: (text: string) => text || '-',
    },
    {
      title: '输入格式',
      dataIndex: 'input_format',
      key: 'input_format',
      width: '15%',
      render: (text: string) => text || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: '15%',
      render: (text: string) => new Date(text).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: '10%',
      render: (_: any, record: PartType) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
            size="small"
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个料型吗？"
            onConfirm={() => deletePartType(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              size="small"
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  useEffect(() => {
    fetchPartTypes();
  }, []);

  return (
    <Form form={form} component={false}>
      <Card>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={3} style={{ margin: 0 }}>
          料型管理
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => openEditModal()}
        >
          新建料型
        </Button>
      </div>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={partTypes}
        loading={loading}
        pagination={{
          pageSize: 20,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
        }}
      />

      <Modal
        title={editingPartType ? '编辑料型' : '新建料型'}
        open={modalVisible}
        onOk={() => form.submit()}
        onCancel={closeModal}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={savePartType}
        >
          <Form.Item
            label="料型名称"
            name="name"
            rules={[
              { required: true, message: '请输入料型名称' },
              { max: 100, message: '料型名称不能超过100个字符' }
            ]}
          >
            <Input placeholder="请输入料型名称，如：板料、圆料、圆环等" />
          </Form.Item>

          <Form.Item
            label="描述"
            name="description"
            rules={[{ max: 500, message: '描述不能超过500个字符' }]}
          >
            <Input.TextArea 
              rows={3} 
              placeholder="请输入料型描述（可选）"
            />
          </Form.Item>

          <Form.Item
            label="体积公式"
            name="volume_formula"
            rules={[{ max: 200, message: '体积公式不能超过200个字符' }]}
          >
            <Input.TextArea 
              rows={2} 
              placeholder="请输入体积计算公式，如：长*宽*高 或 π*(直径²/4)*高"
            />
          </Form.Item>

          <Form.Item
            label="输入格式"
            name="input_format"
            rules={[{ max: 50, message: '输入格式不能超过50个字符' }]}
          >
            <Input 
              placeholder="请输入输入格式提示，如：A*B*C 或 φA*B"
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
    </Form>
  );
};

export default PartTypes;