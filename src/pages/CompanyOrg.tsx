import React from 'react'
import { Card, Typography, Button, Tree, Modal, Form, Input, message } from 'antd'
import { useParams, useNavigate } from 'react-router-dom'

const { Title } = Typography

const CompanyOrg: React.FC = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [treeData, setTreeData] = React.useState<any[]>([])
  const [companyName, setCompanyName] = React.useState('')
  const [editingNode, setEditingNode] = React.useState<any>(null)
  const [modalOpen, setModalOpen] = React.useState(false)
  const [form] = Form.useForm()

  const load = async () => {
    try {
      const c = await fetch(`/api/companies?id=${id}`)
      const cj = await c.json().catch(() => ({}))
      setCompanyName(cj?.data?.name || '')

      const ws = await fetch(`/api/tooling/org/workshops?company_id=${id}`)
      const wj = await ws.json()
      const ts = await fetch(`/api/tooling/org/teams?company_id=${id}`)
      const tj = await ts.json()
      const workshops = (wj.items || []).map((w: any) => ({ key: `w-${w.id}`, title: w.name, type: 'workshop', data: w }))
      const teams = (tj.items || []).map((t: any) => ({ key: `t-${t.id}`, title: t.name, type: 'team', data: t }))
      const wsNodes = workshops.map((w: any) => ({
        ...w,
        children: teams.filter((t: any) => t.data?.workshop_id === w.data.id)
      }))
      const unassignedTeams = teams.filter((t: any) => !t.data?.workshop_id)
      const root = { key: `c-${id}`, title: companyName || '公司', children: [...wsNodes, ...unassignedTeams] }
      setTreeData([root])
    } catch (e) {}
  }

  React.useEffect(() => { load() }, [id])

  const handleAdd = (type: 'workshop' | 'team', parent?: any, presetName?: string) => {
    const isTech = type === 'team' && presetName === '技术组'
    setEditingNode({ type, parent, tech: isTech })
    setModalOpen(true)
    form.resetFields()
    if (presetName) {
      form.setFieldsValue({ name: presetName })
    }
  }

  const handleEdit = (node: any) => {
    const isTech = node.type === 'team' && String(node.title || '').includes('技术组')
    setEditingNode({ ...node, type: node.type, tech: isTech })
    setModalOpen(true)
    if (node.type === 'team' && !isTech) {
      form.setFieldsValue({ name: node.title, aux_coeff: node.data?.aux_coeff ?? 1, proc_coeff: node.data?.proc_coeff ?? 1 })
    } else {
      form.setFieldsValue({ name: node.title })
    }
  }

  const submit = async (values: any) => {
    try {
      if (!editingNode) return
      if (editingNode.type === 'workshop') {
        if (editingNode.key) {
          const idStr = editingNode.key.split('w-')[1]
          await fetch(`/api/tooling/org/workshops/${idStr}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: values.name }) })
        } else {
          await fetch('/api/tooling/org/workshops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_id: id, name: values.name }) })
        }
      } else {
        if (editingNode.key) {
          const idStr = editingNode.key.split('t-')[1]
          const body: any = { name: values.name }
          if (!editingNode?.tech) {
            body.aux_coeff = values.aux_coeff ?? 1
            body.proc_coeff = values.proc_coeff ?? 1
          }
          await fetch(`/api/tooling/org/teams/${idStr}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        } else {
          const parentWorkshopId = editingNode?.parent?.data?.id
          const body: any = { company_id: id, workshop_id: parentWorkshopId || null, name: values.name }
          if (!editingNode?.tech) {
            body.aux_coeff = values.aux_coeff ?? 1
            body.proc_coeff = values.proc_coeff ?? 1
          }
          await fetch('/api/tooling/org/teams', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        }
      }
      setModalOpen(false)
      message.success('已保存')
      load()
    } catch (e) {
      message.error('保存失败')
    }
  }

  const handleDelete = async (node: any) => {
    try {
      if (node.type === 'workshop') {
        const idStr = node.key.split('w-')[1]
        await fetch(`/api/tooling/org/workshops/${idStr}`, { method: 'DELETE' })
      } else {
        const idStr = node.key.split('t-')[1]
        await fetch(`/api/tooling/org/teams/${idStr}`, { method: 'DELETE' })
      }
      message.success('已删除')
      load()
    } catch (e) {
      message.error('删除失败')
    }
  }

  const renderTitle = (node: any) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span>
        {node.title}
        {node.type === 'team' && !String(node.title || '').includes('技术组') && (
          <span style={{ marginLeft: 8, color: '#666' }}>
            (辅系数 {Number(node.data?.aux_coeff ?? 1).toFixed(2)} / 加系数 {Number(node.data?.proc_coeff ?? 1).toFixed(2)})
          </span>
        )}
      </span>
      {node.key.startsWith('c-') ? (
        <>
          <Button size="small" onClick={() => handleAdd('workshop', node)}>新增车间</Button>
          <Button size="small" onClick={() => handleAdd('team', node)}>新增班组</Button>
          <Button size="small" onClick={() => handleAdd('team', node, '技术组')}>新增技术组</Button>
        </>
      ) : (
        <>
          <Button size="small" onClick={() => handleEdit(node)}>编辑</Button>
          {node.type === 'workshop' && (
            <>
              <Button size="small" onClick={() => handleAdd('team', node)}>新增班组</Button>
              <Button size="small" onClick={() => handleAdd('team', node, '技术组')}>新增技术组</Button>
            </>
          )}
          <Button size="small" danger onClick={() => handleDelete(node)}>删除</Button>
        </>
      )}
    </div>
  )

  const expandedKeys = React.useMemo(() => {
    const keys: string[] = []
    const walk = (n: any) => { keys.push(String(n.key)); (n.children || []).forEach(walk) }
    treeData.forEach(walk)
    return keys
  }, [treeData])

  return (
    <Form form={form} component={false}>
      <div className="p-6">
      <div className="flex items-center justify-between mb-3">
        <Title level={2} className="mb-0">组织机构</Title>
        <div className="flex gap-8">
          <Button onClick={load}>刷新</Button>
          <Button onClick={() => navigate(-1)}>返回</Button>
        </div>
      </div>
      <Card>
        <style>{`
          .ant-tree-switcher { display: none !important; }
        `}</style>
        <Tree
          treeData={treeData.map(function decorate(n: any): any { return { ...n, title: renderTitle(n), children: (n.children || []).map(decorate) } })}
          expandedKeys={expandedKeys}
          onExpand={() => { /* 固定展开，忽略用户操作 */ }}
        />
      </Card>

      <Modal open={modalOpen} title={editingNode?.key ? '编辑' : ('新增' + (editingNode?.type === 'workshop' ? '车间' : (editingNode?.tech ? '技术组' : '班组')))} onCancel={() => setModalOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}> 
            <Input placeholder="请输入名称" />
          </Form.Item>
          {editingNode?.type === 'team' && !editingNode?.tech && (
            <>
              <Form.Item name="aux_coeff" label="辅助工时系数" initialValue={1}>
                <Input placeholder="默认1.0" />
              </Form.Item>
              <Form.Item name="proc_coeff" label="加工工时系数" initialValue={1}>
                <Input placeholder="默认1.0" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
    </Form>
  )
}

export default CompanyOrg
