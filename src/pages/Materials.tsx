import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Space,
  message,
  Popconfirm,
  Card,
  Typography
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { Material } from '../types/tooling';

const { Title } = Typography;

interface MaterialFormData {
  name: string;
  density: number;
  description?: string;
  unit_price?: number;
  effective_date?: string;
}

const Materials: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [form] = Form.useForm<MaterialFormData>();

  // 获取材料列表
  const fetchMaterials = async () => {
    setLoading(true);
    try {
      const { fetchWithFallback } = await import('../utils/api');
      const res = await fetchWithFallback('/api/materials?order=created_at.desc');
      const json = await res.json();
      setMaterials(json.data || []);
    } catch (error) {
      console.error('获取材料列表失败:', error);
      message.error('获取材料列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 保存材料
  const saveMaterial = async (values: MaterialFormData) => {
    try {
      const { fetchWithFallback } = await import('../utils/api');
      if (editingMaterial) {
        // 更新材料
        const res = await fetchWithFallback(`/api/materials/${editingMaterial.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values)
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({ error: '材料更新失败' }));
          throw new Error(json.error || '材料更新失败');
        }
        message.success('材料更新成功');
      } else {
        // 新增材料
        const res = await fetchWithFallback('/api/materials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values)
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({ error: '材料添加失败' }));
          throw new Error(json.error || '材料添加失败');
        }
        message.success('材料添加成功');
      }

      setModalVisible(false);
      setEditingMaterial(null);
      form.resetFields();
      fetchMaterials();
    } catch (error: any) {
      console.error('保存材料失败:', error);
      if (error.code === '23505') {
        message.error('材料名称已存在，请使用其他名称');
      } else {
        message.error('保存材料失败');
      }
    }
  };

  // 删除材料
  const deleteMaterial = async (id: string) => {
    try {
      const { fetchWithFallback } = await import('../utils/api');
      const res = await fetchWithFallback(`/api/materials/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: '材料删除失败' }));
        throw new Error(json.error || '材料删除失败');
      }
      message.success('材料删除成功');
      fetchMaterials();
    } catch (error: any) {
      console.error('删除材料失败:', error);
      if (error.code === '23503') {
        message.error('该材料正在被使用，无法删除');
      } else {
        message.error('删除材料失败');
      }
    }
  };

  // 打开新增/编辑弹窗
  const openModal = (material?: Material) => {
    if (material) {
      setEditingMaterial(material);
      form.setFieldsValue({
        name: material.name,
        density: material.density,
        description: material.description
      });
    } else {
      setEditingMaterial(null);
      form.resetFields();
    }
    setModalVisible(true);
  };

  // 关闭弹窗
  const closeModal = () => {
    setModalVisible(false);
    setEditingMaterial(null);
    form.resetFields();
  };

  useEffect(() => {
    fetchMaterials();
  }, []);

  const columns = [
    {
      title: '材料名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '密度 (g/cm³)',
      dataIndex: 'density',
      key: 'density',
      width: 120,
      render: (density: number) => density.toFixed(3),
    },
    {
      title: '单价 (元/kg)',
      dataIndex: 'unit_price',
      key: 'unit_price',
      width: 120,
      render: (price: number) => price ? `¥${price.toFixed(2)}` : '-',
    },
    {
      title: '生效日期',
      dataIndex: 'effective_date',
      key: 'effective_date',
      width: 120,
      render: (date: string) => date ? new Date(date).toLocaleDateString('zh-CN') : '-',
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: any, record: Material) => (
        <Space size="small">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => openModal(record)}
            size="small"
          >
            编辑
          </Button>
          <Popconfirm
            title={`确定要删除材料"${record.name}"吗？此操作不可撤销。`}
            description="请再次确认：删除后无法恢复，且若有零件使用此材料将无法删除。"
            onConfirm={() => {
              // 第二次确认
              Modal.confirm({
                title: '请再次确认',
                content: `删除材料"${record.name}"后无法恢复，是否继续？`,
                okText: '继续删除',
                cancelText: '取消',
                onOk: () => deleteMaterial(record.id),
              });
            }}
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

  return (
    <Form form={form} component={false}>
      <div className="p-6">
        <Card>
        <div className="flex justify-between items-center mb-6">
          <Title level={3} className="!mb-0">材料库管理</Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openModal()}
          >
            新增材料
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={materials}
          rowKey="id"
          loading={loading}
          pagination={{
            total: materials.length,
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条记录`,
          }}
        />
      </Card>

      <Modal
        title={editingMaterial ? '编辑材料' : '新增材料'}
        open={modalVisible}
        onCancel={closeModal}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={saveMaterial}
          autoComplete="off"
        >
          <Form.Item
            label="材料名称"
            name="name"
            rules={[
              { required: true, message: '请输入材料名称' },
              { max: 100, message: '材料名称不能超过100个字符' }
            ]}
          >
            <Input placeholder="如：45#、H13、5CrNiMo、Cu等" />
          </Form.Item>

          <Form.Item
            label="密度 (g/cm³)"
            name="density"
            rules={[
              { required: true, message: '请输入材料密度' },
              { type: 'number', min: 0.001, max: 50, message: '密度范围应在0.001-50之间' }
            ]}
          >
            <InputNumber
              placeholder="请输入密度值"
              precision={3}
              step={0.001}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            label="单价 (元/kg)"
            name="unit_price"
            rules={[
              { type: 'number', min: 0.01, max: 10000, message: '单价范围应在0.01-10000之间' }
            ]}
          >
            <InputNumber
              placeholder="请输入单价"
              precision={2}
              step={0.01}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            label="生效日期"
            name="effective_date"
          >
            <Input
              type="date"
              placeholder="请选择生效日期"
            />
          </Form.Item>

          <Form.Item
            label="描述"
            name="description"
            rules={[
              { max: 500, message: '描述不能超过500个字符' }
            ]}
          >
            <Input.TextArea
              placeholder="材料的详细描述（可选）"
              rows={3}
            />
          </Form.Item>

          <Form.Item className="mb-0">
            <Space className="w-full justify-end">
              <Button onClick={closeModal}>
                取消
              </Button>
              <Button type="primary" htmlType="submit">
                {editingMaterial ? '更新' : '添加'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
    </Form>
  );
};

export default Materials;
