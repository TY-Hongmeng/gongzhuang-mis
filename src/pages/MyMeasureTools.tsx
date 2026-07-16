import React from 'react'
import {
  AutoComplete,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  List,
  Divider,
  Spin
} from 'antd'
import {
  LeftOutlined,
  PlusOutlined,
  ReloadOutlined,
  SwapOutlined,
  UserAddOutlined,
  DeleteOutlined,
  RollbackOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  WarningOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { fetchWithFallback } from '../utils/api'
import { useAuthStore } from '../stores/authStore'
import type { MaterialAssetItem, MaterialAssetUserOption } from '../types/materialAssets'

const { Title, Text } = Typography

// 可编辑备注单元格
const EditableRemarkCell: React.FC<{
  record: MaterialAssetItem
  onSaved?: () => void
}> = ({ record, onSaved }) => {
  const { user } = useAuthStore()
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState<string>(String(record.remark || ''))
  const [saving, setSaving] = React.useState(false)
  const inputRef = React.useRef<any>(null)

  React.useEffect(() => {
    if (!editing) setValue(String(record.remark || ''))
  }, [record.remark, editing])

  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus?.()
      inputRef.current.select?.()
    }
  }, [editing])

  const save = async () => {
    const next = String(value || '').trim()
    const prev = String(record.remark || '').trim()
    if (next === prev) {
      setEditing(false)
      return
    }
    try {
      setSaving(true)
      const res = await fetchWithFallback(`/api/material-assets/${encodeURIComponent(record.id)}/remark`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remark: next,
          userId: String((user as any)?.id || ''),
          operator: String(user?.real_name || '')
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(String(json?.error || '保存备注失败'))
      }
      message.success('备注已保存')
      setEditing(false)
      onSaved?.()
    } catch (err: any) {
      message.error(err?.message || '保存备注失败')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <Input.TextArea
        ref={inputRef as any}
        value={value}
        autoSize={{ minRows: 1, maxRows: 4 }}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onPressEnter={(e) => {
          if (!e.shiftKey) {
            e.preventDefault()
            ;(e.target as any).blur()
          }
        }}
        placeholder="请输入备注"
      />
    )
  }

  const display = String(record.remark || '').trim()
  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        cursor: 'text',
        minHeight: 22,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      }}
      title="点击修改备注"
    >
      {display || '-'}
    </div>
  )
}

const tagColorMap: Record<string, string> = {
  在用: 'green',
  报废: 'red',
  待确认: 'orange',
  已确认: 'blue',
  待转移确认: 'gold',
  借用中: 'cyan',
  待归还确认: 'purple',
  待报废: 'volcano',
  已报废: 'red'
}

const isValidDateText = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())

const getCertificateVisualMeta = (value: string) => {
  const dateText = String(value || '').trim()
  if (!isValidDateText(dateText)) {
    return {
      summary: '当前未填写有效日期',
      detail: '未填写会进入提醒',
      color: '#ff4d4f',
      background: '#fff7f6',
      borderColor: '#ffccc7'
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${dateText}T00:00:00`)
  if (Number.isNaN(target.getTime()) || target.getTime() < today.getTime()) {
    return {
      summary: `当前有效日期：${dateText}`,
      detail: '已过期，会进入提醒',
      color: '#ff4d4f',
      background: '#fff7f6',
      borderColor: '#ffccc7'
    }
  }

  return {
    summary: `当前有效日期：${dateText}`,
    detail: '有效期正常',
    color: '#52c41a',
    background: '#f6ffed',
    borderColor: '#b7eb8f'
  }
}

const renderCertificateEditor = ({
  itemId,
  value,
  saving,
  onChange,
  onSave,
  compact
}: {
  itemId: string
  value: string
  saving: boolean
  onChange: (itemId: string, field: 'certificate_expire_date' | 'certificate_remind_days', value: string) => void
  onSave: () => void
  compact: boolean
}) => {
  const meta = getCertificateVisualMeta(value)
  return (
    <div
      style={{
        borderRadius: 8,
        background: meta.background,
        border: `1px solid ${meta.borderColor}`,
        padding: compact ? '8px 10px' : '10px 12px'
      }}
    >
      <div style={{ color: meta.color, fontSize: compact ? 12 : 13, fontWeight: 600, marginBottom: 6 }}>
        {meta.summary}
      </div>
      <div style={{ color: meta.color, fontSize: compact ? 12 : 13, marginBottom: 8 }}>
        {meta.detail}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexDirection: compact ? 'column' : 'row',
          alignItems: compact ? 'stretch' : 'center'
        }}
      >
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(itemId, 'certificate_expire_date', e.target.value)}
          style={{
            width: '100%',
            minWidth: 0,
            height: compact ? 40 : 34,
            borderRadius: 8,
            border: `1px solid ${meta.borderColor}`,
            padding: compact ? '0 12px' : '0 10px',
            fontSize: compact ? 16 : 14,
            color: meta.color,
            background: '#fff',
            outline: 'none',
            boxSizing: 'border-box'
          }}
        />
        <Button
          size={compact ? 'middle' : 'small'}
          type="primary"
          block={compact}
          loading={saving}
          onClick={onSave}
        >
          保存
        </Button>
      </div>
    </div>
  )
}

type MineRow = MaterialAssetItem & {
  view_type: 'pending' | 'owned' | 'borrowed'
}

// 手机端检测
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  return isMobile
}

// ========== 手机端卡片组件 ==========
const MobileCard: React.FC<{
  record: MineRow
  acting: boolean
  certificateSavingId: string
  certificateDraft: {
    certificate_expire_date: string
    certificate_remind_days: string
  }
  onCertificateDraftChange: (itemId: string, field: 'certificate_expire_date' | 'certificate_remind_days', value: string) => void
  onSaveCertificate: () => void
  onConfirmResponsible: () => void
  onCancelTransfer: () => void
  onOpenTransfer: () => void
  onOpenBorrow: () => void
  onConfirmReturn: () => void
  onOpenScrap: () => void
  onOpenReturn: () => void
  onSaved?: () => void
}> = ({
  record,
  acting,
  certificateSavingId,
  certificateDraft,
  onCertificateDraftChange,
  onSaveCertificate,
  onSaved,
  ...actions
}) => {
  // 类型标签颜色和文字
  const typeInfo = (() => {
    if (record.view_type === 'pending') return { color: 'gold', text: '待我确认' }
    if (record.view_type === 'borrowed') return { color: 'cyan', text: '我借用的' }
    return { color: 'blue', text: '我负责的' }
  })()

  const mobileCertificateValue = String(certificateDraft.certificate_expire_date || record.certificate_expire_date || '')

  return (
    <Card
      size="small"
      style={{ marginBottom: 10, borderRadius: 10 }}
      bodyStyle={{ padding: '14px 16px' }}
    >
      {/* 名称：独立一行 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span style={{ color: '#999', fontSize: 14, marginRight: 6 }}>名称：</span>
          <Text strong style={{ fontSize: 20, lineHeight: 1.3, color: '#000' }}>{record.name || '-'}</Text>
        </div>
        <Tag color={typeInfo.color} style={{ flexShrink: 0, margin: 0, fontSize: 13, padding: '4px 10px', borderRadius: 4 }}>
          {typeInfo.text}
        </Tag>
      </div>

      {/* 编号：独立一行 */}
      <div style={{ marginBottom: 10, fontSize: 15, color: '#333' }}>
        <span style={{ color: '#999', fontSize: 14 }}>编号：</span>
        <span>{record.code || '-'}</span>
      </div>

      {/* 规格：独立一行（仅当有值时显示） */}
      {record.model_spec ? (
        <div style={{ marginBottom: 12, fontSize: 15, color: '#333' }}>
          <span style={{ color: '#999', fontSize: 14 }}>规格：</span>
          <span>{record.model_spec}</span>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }} />
      )}

      {/* 责任关系 */}
      <div style={{ marginBottom: 12, fontSize: 16, lineHeight: 1.6 }}>
        <div>
          <span style={{ color: '#999', fontSize: 14 }}>责任人：</span>
          <span style={{ fontWeight: 500 }}>{record.responsible_person || '未确认'}</span>
        </div>
        {record.pending_responsible_person ? (
          <div style={{ color: '#d48806', fontSize: 14, marginTop: 4 }}>
            <WarningOutlined style={{ marginRight: 4 }} />待 {record.pending_responsible_person} 确认接收
          </div>
        ) : null}
        {record.borrower_name && record.view_type !== 'borrowed' ? (
          <div style={{ color: '#999', fontSize: 14, marginTop: 4 }}>借用人: {record.borrower_name}</div>
        ) : null}
      </div>

      {/* 状态标签 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        <span style={{ color: '#999', fontSize: 14 }}>状态：</span>
        <Tag color={tagColorMap[record.asset_status] || 'default'} style={{ margin: 0, fontSize: 13, padding: '3px 10px' }}>{record.asset_status}</Tag>
        <Tag color={tagColorMap[record.responsibility_status] || 'default'} style={{ margin: 0, fontSize: 13, padding: '3px 10px' }}>{record.responsibility_status}</Tag>
        {record.borrow_status !== '无' ? <Tag color={tagColorMap[record.borrow_status] || 'default'} style={{ margin: 0, fontSize: 13, padding: '3px 10px' }}>{record.borrow_status}</Tag> : null}
        {record.scrap_status !== '无' ? <Tag color={tagColorMap[record.scrap_status] || 'default'} style={{ margin: 0, fontSize: 13, padding: '3px 10px' }}>{record.scrap_status}</Tag> : null}
      </div>

      {record.view_type === 'owned' && record.asset_status !== '报废' ? (
        <div style={{ marginBottom: 12 }}>
          {renderCertificateEditor({
            itemId: record.id,
            value: mobileCertificateValue,
            saving: certificateSavingId === record.id,
            onChange: onCertificateDraftChange,
            onSave: onSaveCertificate,
            compact: true
          })}
        </div>
      ) : null}

      {/* 说明信息 */}
      {(record.remark || record.borrow_note || record.scrap_reason) && (
        <div style={{
          background: '#f5f5f5',
          borderRadius: 6,
          padding: '10px 12px',
          marginBottom: 12,
          fontSize: 14,
          color: '#666',
          lineHeight: 1.7
        }}>
          {record.remark ? (
            <div style={{ marginBottom: 8 }}>
              <span style={{ color: '#999' }}>备注：</span>
              <div style={{ marginTop: 4 }}>
                <EditableRemarkCell record={record} onSaved={onSaved} />
              </div>
            </div>
          ) : null}
          {record.borrow_note ? (
            <div>
              <span style={{ color: '#999' }}>借用说明：</span>
              <span>{record.borrow_note}</span>
            </div>
          ) : null}
          {record.scrap_reason ? (
            <div>
              <span style={{ color: '#999' }}>报废原因：</span>
              <span>{record.scrap_reason}</span>
            </div>
          ) : null}
        </div>
      )}

      <Divider style={{ margin: '12px 0' }} />

      {/* 操作按钮 */}
      {renderMobileActions(record, acting, actions)}
    </Card>
  )
}

function renderMobileActions(
  record: MineRow,
  acting: boolean,
  actions: {
    onConfirmResponsible: () => void
    onCertificateDraftChange: (itemId: string, field: 'certificate_expire_date' | 'certificate_remind_days', value: string) => void
    onSaveCertificate: () => void
    onCancelTransfer: () => void
    onOpenTransfer: () => void
    onOpenBorrow: () => void
    onConfirmReturn: () => void
    onOpenScrap: () => void
    onOpenReturn: () => void
  }
) {
  // 统一按钮样式：圆角、高度、字号
  const btnStyle: React.CSSProperties = {
    height: 42,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500
  }

  if (record.view_type === 'pending') {
    return (
      <Button type="primary" block icon={<CheckCircleOutlined />}
        onClick={actions.onConfirmResponsible} loading={acting} size="large" style={btnStyle}>
        确认责任人
      </Button>
    )
  }

  if (record.view_type === 'owned') {
    const btns = []
    btns.push(
      <Button key="transfer" block icon={<SwapOutlined />} onClick={actions.onOpenTransfer}
        disabled={record.asset_status === '报废'} size="large" style={btnStyle}>
        转移责任人
      </Button>
    )
    if (record.responsibility_status === '待转移确认' && record.pending_responsible_person) {
      btns.push(
        <Button key="cancel" danger ghost block icon={<CloseCircleOutlined />}
          onClick={actions.onCancelTransfer} loading={acting} size="large" style={{ ...btnStyle, borderColor: '#ffccc7' }}>
          撤销转移
        </Button>
      )
    }
    if (record.asset_status !== '报废' && record.responsibility_status === '已确认' && record.borrow_status === '无') {
      btns.push(
        <Button key="borrow" block icon={<UserAddOutlined />}
          onClick={actions.onOpenBorrow} size="large" style={btnStyle}>
          借出登记
        </Button>
      )
    }
    if (record.borrow_status === '待归还确认') {
      btns.push(
        <Button key="return" type="primary" block icon={<RollbackOutlined />}
          onClick={actions.onConfirmReturn} loading={acting} size="large" style={btnStyle}>
          确认归还
        </Button>
      )
    }
    if (record.asset_status !== '报废' && record.scrap_status !== '待报废' && record.borrow_status === '无') {
      btns.push(
        <Button key="scrap" danger ghost block icon={<DeleteOutlined />}
          onClick={actions.onOpenScrap} size="large" style={{ ...btnStyle, borderColor: '#ffccc7' }}>
          报废申请
        </Button>
      )
    }
    return <Space direction="vertical" style={{ width: '100%' }} size={8}>{btns}</Space>
  }

  if (record.view_type === 'borrowed') {
    const btns = []
    if (record.borrow_status === '借用中') {
      btns.push(
        <Button key="return" type="primary" block icon={<RollbackOutlined />}
          onClick={actions.onOpenReturn} size="large" style={btnStyle}>
          申请归还
        </Button>
      )
    }
    if (record.borrow_status === '待归还确认') {
      btns.push(
        <div key="waiting" style={{
          textAlign: 'center',
          padding: '8px 0',
          background: '#fffbe6',
          borderRadius: 8,
          border: '1px solid #ffe58f'
        }}>
          <ExclamationCircleOutlined style={{ color: '#faad14', marginRight: 6 }} />
          <Text type="warning" style={{ fontSize: 13 }}>等待责任人确认归还</Text>
        </div>
      )
    }
    return <Space direction="vertical" style={{ width: '100%' }} size={8}>{btns}</Space>
  }

  return null
}

const MyMeasureTools: React.FC = () => {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { user } = useAuthStore()
  const [transferForm] = Form.useForm()
  const [scrapForm] = Form.useForm()
  const [rejectTransferForm] = Form.useForm()
  const [createForm] = Form.useForm()
  const [ownedItems, setOwnedItems] = React.useState<MaterialAssetItem[]>([])
  const [pendingItems, setPendingItems] = React.useState<MaterialAssetItem[]>([])
  const [borrowedItems, setBorrowedItems] = React.useState<MaterialAssetItem[]>([])
  const [users, setUsers] = React.useState<MaterialAssetUserOption[]>([])
  const [loading, setLoading] = React.useState(false)
  const [mobileTab, setMobileTab] = React.useState<'pending' | 'owned' | 'borrowed'>('pending')
  const [transferOpen, setTransferOpen] = React.useState(false)
  const [scrapOpen, setScrapOpen] = React.useState(false)
  const [rejectTransferOpen, setRejectTransferOpen] = React.useState(false)
  const [borrowOpen, setBorrowOpen] = React.useState(false)
  const [returnOpen, setReturnOpen] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [acting, setActing] = React.useState(false)
  const [certificateSavingId, setCertificateSavingId] = React.useState('')
  const [certificateDrafts, setCertificateDrafts] = React.useState<Record<string, {
    certificate_expire_date: string
    certificate_remind_days: string
  }>>({})
  const [currentItem, setCurrentItem] = React.useState<MaterialAssetItem | null>(null)
  const [borrowForm] = Form.useForm()
  const [returnForm] = Form.useForm()

  const actorPayload = React.useMemo(() => ({
    userId: String((user as any)?.id || ''),
    operator: String(user?.real_name || '')
  }), [user])

  const mergedItems = React.useMemo<MineRow[]>(() => ([
    ...pendingItems.map((item) => ({ ...item, view_type: 'pending' as const })),
    ...ownedItems.map((item) => ({ ...item, view_type: 'owned' as const })),
    ...borrowedItems.map((item) => ({ ...item, view_type: 'borrowed' as const }))
  ]), [borrowedItems, ownedItems, pendingItems])

  // 统计数量
  const stats = React.useMemo(() => ({
    pendingReminder: pendingItems.length,
    ownedReminder: ownedItems.filter((item) => ['过期', '未维护'].includes(String(item.certificate_status || ''))).length,
    borrowedReminder: 0
  }), [borrowedItems.length, ownedItems, pendingItems.length])

  const loadMine = React.useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams(actorPayload)
      const res = await fetchWithFallback(`/api/material-assets/mine?${params.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(String(json?.error || '加载我的量具失败'))
      }
      setOwnedItems(Array.isArray(json?.ownedItems) ? json.ownedItems : [])
      setPendingItems(Array.isArray(json?.pendingConfirmItems) ? json.pendingConfirmItems : [])
      setBorrowedItems(Array.isArray(json?.borrowedItems) ? json.borrowedItems : [])
    } catch (error: any) {
      message.error(error?.message || '加载我的量具失败')
    } finally {
      setLoading(false)
    }
  }, [actorPayload])

  const loadUsers = React.useCallback(async () => {
    try {
      const res = await fetchWithFallback('/api/users')
      const json = await res.json().catch(() => ({}))
      const list = Array.isArray(json?.items)
        ? json.items
        : (Array.isArray(json?.users) ? json.users : [])
      setUsers(
        list
          .filter((item: any) => String(item?.status || '') === 'active' && String(item?.real_name || '').trim())
          .map((item: any) => ({
            id: String(item.id || ''),
            real_name: String(item.real_name || '').trim(),
            status: String(item.status || '')
          }))
          .filter((item) => item.real_name !== String(user?.real_name || ''))
      )
    } catch {}
  }, [user?.real_name])

  React.useEffect(() => { loadMine() }, [loadMine])
  React.useEffect(() => { loadUsers() }, [loadUsers])
  React.useEffect(() => {
    const nextDrafts: Record<string, { certificate_expire_date: string, certificate_remind_days: string }> = {}
    ownedItems.forEach((item) => {
      nextDrafts[item.id] = {
        certificate_expire_date: String(item.certificate_expire_date || ''),
        certificate_remind_days: String(item.certificate_remind_days ?? 30)
      }
    })
    setCertificateDrafts(nextDrafts)
  }, [ownedItems])

  const postAction = async (url: string, body: Record<string, any>) => {
    const res = await fetchWithFallback(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...actorPayload, ...body })
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || json?.success === false) {
      throw new Error(String(json?.error || '操作失败'))
    }
  }

  const confirmResponsible = async (item: MaterialAssetItem) => {
    try {
      setActing(true)
      await postAction(`/api/material-assets/${encodeURIComponent(item.id)}/confirm-responsible`, {})
      message.success('责任人确认成功')
      loadMine()
    } catch (error: any) {
      message.error(error?.message || '责任人确认失败')
    } finally {
      setActing(false)
    }
  }

  const cancelTransfer = async (item: MaterialAssetItem) => {
    try {
      setActing(true)
      await postAction(`/api/material-assets/${encodeURIComponent(item.id)}/cancel-transfer`, {})
      message.success('已撤销责任人转移')
      loadMine()
    } catch (error: any) {
      message.error(error?.message || '撤销转移失败')
    } finally {
      setActing(false)
    }
  }

  const submitTransfer = async (values: any) => {
    if (!currentItem) return
    try {
      setActing(true)
      const targetName = String(values.target_name || '').trim()
      const target = users.find((item) =>
        item.id === String(values.target_user_id || '') || item.real_name === targetName
      )
      await postAction(`/api/material-assets/${encodeURIComponent(currentItem.id)}/transfer`, {
        target_user_id: String(target?.id || values.target_user_id || ''),
        target_name: String(target?.real_name || targetName),
        remark: String(values.remark || '').trim()
      })
      message.success('已发起责任人转移，等待对方确认')
      setTransferOpen(false)
      transferForm.resetFields()
      setCurrentItem(null)
      loadMine()
    } catch (error: any) {
      message.error(error?.message || '转移责任人失败')
    } finally {
      setActing(false)
    }
  }

  const submitCreate = async (values: any) => {
    try {
      setActing(true)
      const res = await fetchWithFallback('/api/material-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(values.name || '').trim(),
          code: String(values.code || '').trim(),
          model_spec: String(values.model_spec || '').trim(),
          certificate_expire_date: values.certificate_expire_date ? dayjs(values.certificate_expire_date).format('YYYY-MM-DD') : '',
          certificate_remind_days: Number(values.certificate_remind_days ?? 30),
          remark: String(values.remark || '').trim(),
          userId: String((user as any)?.id || ''),
          operator: String(user?.real_name || '')
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(String(json?.error || '新增量具失败'))
      }
      message.success('量具已新增到我的量具')
      setCreateOpen(false)
      createForm.resetFields()
      loadMine()
    } catch (error: any) {
      message.error(error?.message || '新增量具失败')
    } finally {
      setActing(false)
    }
  }

  const updateCertificateDraft = (
    itemId: string,
    field: 'certificate_expire_date' | 'certificate_remind_days',
    value: string
  ) => {
    setCertificateDrafts((prev) => ({
      ...prev,
      [itemId]: {
        certificate_expire_date: String(prev[itemId]?.certificate_expire_date || ''),
        certificate_remind_days: String(prev[itemId]?.certificate_remind_days || '30'),
        [field]: value
      }
    }))
  }

  const saveCertificate = async (item: MaterialAssetItem) => {
    const draft = certificateDrafts[item.id] || {
      certificate_expire_date: String(item.certificate_expire_date || ''),
      certificate_remind_days: String(item.certificate_remind_days ?? 30)
    }
    const expireDate = String(draft.certificate_expire_date || '').trim()
    if (expireDate && !/^\d{4}-\d{2}-\d{2}$/.test(expireDate)) {
      message.warning('有效日期格式无效')
      return
    }
    try {
      setCertificateSavingId(item.id)
      const res = await fetchWithFallback(`/api/material-assets/${encodeURIComponent(item.id)}/certificate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificate_expire_date: expireDate,
          certificate_remind_days: Number(draft.certificate_remind_days || 30),
          userId: String((user as any)?.id || ''),
          operator: String(user?.real_name || '')
        })
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.success === false) {
        throw new Error(String(json?.error || '维护有效期失败'))
      }
      message.success('有效日期已更新')
      loadMine()
    } catch (error: any) {
      message.error(error?.message || '维护有效期失败')
    } finally {
      setCertificateSavingId('')
    }
  }

  const submitBorrow = async (values: any) => {
    if (!currentItem) return
    try {
      setActing(true)
      const borrowerName = String(values.borrower_name || '').trim()
      const borrower = users.find((item) =>
        item.id === String(values.borrower_user_id || '') || item.real_name === borrowerName
      )
      await postAction(`/api/material-assets/${encodeURIComponent(currentItem.id)}/borrow`, {
        borrower_user_id: String(borrower?.id || values.borrower_user_id || ''),
        borrower_name: String(borrower?.real_name || borrowerName),
        borrow_note: String(values.borrow_note || '').trim()
      })
      message.success('借用登记成功')
      setBorrowOpen(false)
      borrowForm.resetFields()
      setCurrentItem(null)
      loadMine()
    } catch (error: any) {
      message.error(error?.message || '借用登记失败')
    } finally {
      setActing(false)
    }
  }

  const submitReturnRequest = async (values: any) => {
    if (!currentItem) return
    try {
      setActing(true)
      await postAction(`/api/material-assets/${encodeURIComponent(currentItem.id)}/request-return`, {
        return_note: String(values.return_note || '').trim()
      })
      message.success('归还申请已提交')
      setReturnOpen(false)
      returnForm.resetFields()
      setCurrentItem(null)
      loadMine()
    } catch (error: any) {
      message.error(error?.message || '申请归还失败')
    } finally {
      setActing(false)
    }
  }

  const confirmReturn = async (item: MaterialAssetItem) => {
    try {
      setActing(true)
      await postAction(`/api/material-assets/${encodeURIComponent(item.id)}/confirm-return`, {})
      message.success('已确认归还')
      loadMine()
    } catch (error: any) {
      message.error(error?.message || '确认归还失败')
    } finally {
      setActing(false)
    }
  }

  const submitScrapRequest = async (values: any) => {
    if (!currentItem) return
    try {
      setActing(true)
      await postAction(`/api/material-assets/${encodeURIComponent(currentItem.id)}/scrap-request`, {
        reason: String(values.reason || '').trim()
      })
      message.success('报废申请已提交')
      setScrapOpen(false)
      scrapForm.resetFields()
      setCurrentItem(null)
      loadMine()
    } catch (error: any) {
      message.error(error?.message || '申请报废失败')
    } finally {
      setActing(false)
    }
  }

  const submitRejectTransfer = async (values: any) => {
    if (!currentItem) return
    try {
      setActing(true)
      await postAction(`/api/material-assets/${encodeURIComponent(currentItem.id)}/reject-transfer`, {
        reason: String(values.reason || '').trim()
      })
      message.success('已拒绝接收责任人')
      setRejectTransferOpen(false)
      rejectTransferForm.resetFields()
      setCurrentItem(null)
      loadMine()
    } catch (error: any) {
      message.error(error?.message || '拒绝接收责任人失败')
    } finally {
      setActing(false)
    }
  }

  // 桌面端列定义
  const columns = [
    {
      title: '序号',
      width: 72,
      align: 'center' as const,
      render: (_: any, __: MineRow, index: number) => index + 1
    },
    {
      title: '类型',
      width: 120,
      align: 'center' as const,
      render: (_: any, record: MineRow) => {
        if (record.view_type === 'pending') return <Tag color="gold">待我确认</Tag>
        if (record.view_type === 'borrowed') return <Tag color="cyan">我借用的</Tag>
        return <Tag color="blue">我负责的</Tag>
      }
    },
    { title: '名称', dataIndex: 'name', width: 150 },
    { title: '编号', dataIndex: 'code', width: 140 },
    {
      title: '型号规格', dataIndex: 'model_spec', width: 180,
      render: (value: string) => value || '-'
    },
    {
      title: '有效日期', width: 320,
      render: (_: any, record: MineRow) => (
        <div>
          {record.view_type === 'pending' ? <Text type="secondary">-</Text> : null}
          {record.view_type === 'owned' && record.asset_status !== '报废' ? (
            renderCertificateEditor({
              itemId: record.id,
              value: String(certificateDrafts[record.id]?.certificate_expire_date || record.certificate_expire_date || ''),
              saving: certificateSavingId === record.id,
              onChange: updateCertificateDraft,
              onSave: () => saveCertificate(record),
              compact: false
            })
          ) : record.view_type !== 'pending' ? (
            <Text type="secondary">{record.certificate_expire_date || '-'}</Text>
          ) : null}
        </div>
      )
    },
    {
      title: '责任关系', width: 220,
      render: (_: any, record: MineRow) => (
        <div>
          <div>{record.responsible_person || '未确认'}</div>
          {record.pending_responsible_person ? <Text type="warning">待确认: {record.pending_responsible_person}</Text> : null}
          {record.borrower_name && record.view_type !== 'borrowed' ? <Text type="secondary">借用人: {record.borrower_name}</Text> : null}
        </div>
      )
    },
    {
      title: '状态', width: 220,
      render: (_: any, record: MineRow) => (
        <Space wrap size={[4, 4]}>
          <Tag color={tagColorMap[record.asset_status] || 'default'}>{record.asset_status}</Tag>
          <Tag color={tagColorMap[record.responsibility_status] || 'default'}>{record.responsibility_status}</Tag>
          {record.borrow_status !== '无' ? <Tag color={tagColorMap[record.borrow_status] || 'default'}>{record.borrow_status}</Tag> : null}
          {record.scrap_status !== '无' ? <Tag color={tagColorMap[record.scrap_status] || 'default'}>{record.scrap_status}</Tag> : null}
        </Space>
      )
    },
    {
      title: '备注', width: 190,
      render: (_: any, record: MineRow) => (
        <EditableRemarkCell record={record} onSaved={loadMine} />
      )
    },
    {
      title: '说明', width: 260,
      render: (_: any, record: MineRow) => (
        <div>
          {record.pending_responsible_person ? <Text type="secondary">转移状态: 待 {record.pending_responsible_person} 确认</Text> : null}
          {record.borrow_note ? <Text type="secondary">借用说明: {record.borrow_note}</Text> : null}
          {record.borrow_return_note ? <Text type="secondary">归还说明: {record.borrow_return_note}</Text> : null}
          {record.scrap_reason ? <Text type="secondary">报废原因: {record.scrap_reason}</Text> : null}
          {!record.pending_responsible_person && !record.borrow_note && !record.borrow_return_note && !record.scrap_reason ? '-' : null}
        </div>
      )
    },
    {
      title: '操作', width: 340, align: 'center' as const,
      render: (_: any, record: MineRow) => (
        <Space wrap>
          {record.view_type === 'pending' ? (
            <Button type="link" onClick={() => confirmResponsible(record)} loading={acting}>确认责任人</Button>
          ) : null}
          {record.view_type === 'owned' ? (
            <>
              <Button type="link" disabled={record.asset_status === '报废'} onClick={() => { setCurrentItem(record); transferForm.setFieldsValue({ target_name: '', target_user_id: '', remark: '' }); setTransferOpen(true) }}>转移责任人</Button>
              <Button type="link" disabled={record.asset_status === '报废' || record.responsibility_status !== '已确认' || record.borrow_status !== '无'} onClick={() => { setCurrentItem(record); borrowForm.setFieldsValue({ borrower_name: '', borrower_user_id: '', borrow_note: '' }); setBorrowOpen(true) }}>借出登记</Button>
              {record.responsibility_status === '待转移确认' && record.pending_responsible_person ? (
                <Button type="link" onClick={() => cancelTransfer(record)} loading={acting}>撤销转移</Button>
              ) : null}
              {record.borrow_status === '待归还确认' ? (
                <Button type="link" onClick={() => confirmReturn(record)} loading={acting}>确认归还</Button>
              ) : null}
              <Button type="link" danger disabled={record.asset_status === '报废' || record.scrap_status === '待报废' || record.borrow_status !== '无'} onClick={() => { setCurrentItem(record); setScrapOpen(true) }}>报废申请</Button>
            </>
          ) : null}
          {record.view_type === 'borrowed' ? (
            <>
              {record.borrow_status === '借用中' ? (
                <Button type="link" onClick={() => { setCurrentItem(record); returnForm.setFieldsValue({ return_note: '' }); setReturnOpen(true) }}>申请归还</Button>
              ) : null}
              {record.borrow_status === '待归还确认' ? <Text type="warning">等待责任人确认</Text> : null}
            </>
          ) : null}
        </Space>
      )
    }
  ]

  // ========== 渲染 ==========
  return (
    <div style={{ padding: isMobile ? 8 : 16 }}>
      <Card bordered={false} style={isMobile ? { borderRadius: 0, boxShadow: 'none' } : undefined}>
        {/* 标题栏 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: isMobile ? 10 : 16
        }}>
          <div>
            <Title level={isMobile ? 5 : 4} style={{ margin: 0, fontSize: isMobile ? 17 : undefined }}>我的量具</Title>
            {!isMobile && <Text type="secondary">这里统一显示待你确认、你负责以及你借用的量具。</Text>}
          </div>
          <div style={{ display: 'flex', gap: isMobile ? 6 : 8, width: isMobile ? '100%' : 'auto' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} size="small" style={isMobile ? { flex: 1 } : undefined}>新增量具</Button>
            <Button icon={<ReloadOutlined />} onClick={loadMine} size="small" style={isMobile ? { flex: 1 } : undefined}>刷新</Button>
            <Button icon={<LeftOutlined />} onClick={() => navigate('/dashboard')} size="small" style={isMobile ? { flex: 1 } : undefined}>返回</Button>
          </div>
        </div>

        {/* 手机端统计条 + Tab 切换 */}
        {isMobile && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 8,
            marginBottom: 10,
            paddingBottom: 10,
            borderBottom: '1px solid #f0f0f0'
          }}>
            <div
              onClick={() => setMobileTab('pending')}
              style={{
                cursor: 'pointer',
                padding: '4px 12px',
                borderRadius: 6,
                background: mobileTab === 'pending' ? '#fff7e6' : 'transparent',
                border: mobileTab === 'pending' ? '1px solid #ffd591' : '1px solid transparent',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <span style={{ fontSize: 14, color: mobileTab === 'pending' ? '#d46b08' : '#666', fontWeight: mobileTab === 'pending' ? 600 : 400 }}>
                待确认 {stats.pendingReminder}
              </span>
            </div>
            <div
              onClick={() => setMobileTab('owned')}
              style={{
                cursor: 'pointer',
                padding: '4px 12px',
                borderRadius: 6,
                background: mobileTab === 'owned' ? '#e6f7ff' : 'transparent',
                border: mobileTab === 'owned' ? '1px solid #91d5ff' : '1px solid transparent',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <span style={{ fontSize: 14, color: mobileTab === 'owned' ? '#1890ff' : '#666', fontWeight: mobileTab === 'owned' ? 600 : 400 }}>
                我负责 {stats.ownedReminder}
              </span>
            </div>
            <div
              onClick={() => setMobileTab('borrowed')}
              style={{
                cursor: 'pointer',
                padding: '4px 12px',
                borderRadius: 6,
                background: mobileTab === 'borrowed' ? '#e6fffb' : 'transparent',
                border: mobileTab === 'borrowed' ? '1px solid #87e8de' : '1px solid transparent',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <span style={{ fontSize: 14, color: mobileTab === 'borrowed' ? '#13c2c2' : '#666', fontWeight: mobileTab === 'borrowed' ? 600 : 400 }}>
                我借用 {stats.borrowedReminder}
              </span>
            </div>
          </div>
        )}

        {/* 内容区 */}
        {isMobile ? (
          /* ====== 手机端卡片列表 ====== */
          <div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 0' }}><Spin tip="加载中..." /></div>
            ) : (() => {
              const filtered = mergedItems.filter((it) => it.view_type === mobileTab)
              if (filtered.length === 0) {
                const emptyText = mobileTab === 'pending' ? '暂无待确认量具' : mobileTab === 'owned' ? '暂无我负责的量具' : '暂无借用的量具'
                return <div style={{ textAlign: 'center', padding: '60px 0', color: '#bbb', fontSize: 14 }}>{emptyText}</div>
              }
              return filtered.map((item) => (
                <MobileCard
                  key={`${item.view_type}-${item.id}`}
                  record={item}
                  acting={acting}
                  certificateSavingId={certificateSavingId}
                  certificateDraft={certificateDrafts[item.id] || {
                    certificate_expire_date: String(item.certificate_expire_date || ''),
                    certificate_remind_days: String(item.certificate_remind_days ?? 30)
                  }}
                  onCertificateDraftChange={updateCertificateDraft}
                  onSaveCertificate={() => saveCertificate(item)}
                  onConfirmResponsible={() => confirmResponsible(item)}
                  onCancelTransfer={() => cancelTransfer(item)}
                  onOpenTransfer={() => { setCurrentItem(item); transferForm.setFieldsValue({ target_name: '', target_user_id: '', remark: '' }); setTransferOpen(true) }}
                  onOpenBorrow={() => { setCurrentItem(item); borrowForm.setFieldsValue({ borrower_name: '', borrower_user_id: '', borrow_note: '' }); setBorrowOpen(true) }}
                  onConfirmReturn={() => confirmReturn(item)}
                  onOpenScrap={() => { setCurrentItem(item); setScrapOpen(true) }}
                  onOpenReturn={() => { setCurrentItem(item); returnForm.setFieldsValue({ return_note: '' }); setReturnOpen(true) }}
                  onSaved={loadMine}
                />
              ))
            })()}
          </div>
        ) : (
          /* ====== 桌面端表格 ====== */
          <Card size="small" title="我的量具总表">
            <Table
              rowKey={(record) => `${record.view_type}-${record.id}`}
              loading={loading}
              dataSource={mergedItems}
              columns={columns as any}
              locale={{ emptyText: '暂无量具数据' }}
              pagination={false}
              scroll={{ x: 'max-content' }}
            />
          </Card>
        )}
      </Card>

      {/* ====== 弹窗（桌面/手机共用） ====== */}
      <Modal
        title="新增量具"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields() }}
        footer={null}
        destroyOnClose
        width={isMobile ? '100%' : 520}
      >
        <Form form={createForm} layout="vertical" onFinish={submitCreate}>
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="请输入量具名称" />
          </Form.Item>
          <Form.Item label="编号" name="code" rules={[{ required: true, message: '请输入编号' }]}>
            <Input placeholder="请输入量具编号" />
          </Form.Item>
          <Form.Item label="型号规格" name="model_spec">
            <Input placeholder="请输入型号规格" />
          </Form.Item>
          <Form.Item label="有效日期" name="certificate_expire_date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="提醒提前天数" name="certificate_remind_days" initialValue={30}>
            <Input type="number" min={0} />
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={3} placeholder="可选，填写来源、用途、存放位置等" />
          </Form.Item>
          <div style={{ marginBottom: 12 }}>
            <Text type="secondary">新增后将直接归属到你本人名下，并同步进入量具台账。</Text>
          </div>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => { setCreateOpen(false); createForm.resetFields() }}>取消</Button>
              <Button type="primary" htmlType="submit" loading={acting}>保存</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`拒绝接收责任人${currentItem ? ` - ${currentItem.name}` : ''}`}
        open={rejectTransferOpen}
        onCancel={() => { setRejectTransferOpen(false); setCurrentItem(null); rejectTransferForm.resetFields() }}
        footer={null}
        destroyOnClose
        width={isMobile ? '100%' : 520}
      >
        <Form form={rejectTransferForm} layout="vertical" onFinish={submitRejectTransfer}>
          <Form.Item label="拒绝原因" name="reason" rules={[{ required: true, message: '请填写拒绝原因' }]}>
            <Input.TextArea rows={4} placeholder="请明确填写拒绝原因，例如量具未实际交接、信息不符等" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => { setRejectTransferOpen(false); setCurrentItem(null); rejectTransferForm.resetFields() }}>取消</Button>
              <Button type="primary" danger htmlType="submit" loading={acting}>确认拒绝</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`转移责任人${currentItem ? ` - ${currentItem.name}` : ''}`}
        open={transferOpen}
        onCancel={() => { setTransferOpen(false); setCurrentItem(null); transferForm.resetFields() }}
        footer={null}
        destroyOnClose
        width={isMobile ? '100%' : 520}
      >
        <Form form={transferForm} layout="vertical" onFinish={submitTransfer}>
          <Form.Item label="接收责任人" name="target_name" rules={[{ required: true, message: '请选择接收责任人' }]}>
            <Select
              showSearch
              allowClear
              placeholder="请选择接收责任人"
              optionFilterProp="label"
              options={users.map((item) => ({ value: item.real_name, label: item.real_name, userId: item.id }))}
              onSelect={(_value, option: any) => transferForm.setFieldValue('target_user_id', String(option?.userId || ''))}
              onChange={(value) => {
                const matchedUser = users.find((item) => item.real_name === String(value || '').trim())
                transferForm.setFieldValue('target_user_id', String(matchedUser?.id || ''))
              }}
            />
          </Form.Item>
          <Form.Item name="target_user_id" hidden><Input /></Form.Item>
          <Form.Item label="转移说明" name="remark">
            <Input.TextArea rows={3} placeholder="可选，说明本次责任转移原因" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => { setTransferOpen(false); setCurrentItem(null); transferForm.resetFields() }}>取消</Button>
              <Button type="primary" htmlType="submit" loading={acting}>提交</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`借出登记${currentItem ? ` - ${currentItem.name}` : ''}`}
        open={borrowOpen}
        onCancel={() => { setBorrowOpen(false); setCurrentItem(null); borrowForm.resetFields() }}
        footer={null}
        destroyOnClose
        width={isMobile ? '100%' : 520}
      >
        <Form form={borrowForm} layout="vertical" onFinish={submitBorrow}>
          <Form.Item label="借用人" name="borrower_name" rules={[{ required: true, message: '请输入或选择借用人' }]}>
            <AutoComplete
              allowClear
              placeholder="可输入姓名，或从联想列表中选择"
              options={users.map((item) => ({ value: item.real_name, label: item.real_name, userId: item.id }))}
              filterOption={(inputValue, option) =>
                String(option?.value || '').toLowerCase().includes(String(inputValue || '').toLowerCase())
              }
              onSelect={(_value, option: any) => borrowForm.setFieldValue('borrower_user_id', String(option?.userId || ''))}
              onChange={(value) => {
                const matchedUser = users.find((item) => item.real_name === String(value || '').trim())
                borrowForm.setFieldValue('borrower_user_id', String(matchedUser?.id || ''))
              }}
            />
          </Form.Item>
          <Form.Item name="borrower_user_id" hidden><Input /></Form.Item>
          <Form.Item label="借用说明" name="borrow_note">
            <Input.TextArea rows={3} placeholder="可选，说明借用用途、交接情况等" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => { setBorrowOpen(false); setCurrentItem(null); borrowForm.resetFields() }}>取消</Button>
              <Button type="primary" htmlType="submit" loading={acting}>提交</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`报废申请${currentItem ? ` - ${currentItem.name}` : ''}`}
        open={scrapOpen}
        onCancel={() => { setScrapOpen(false); setCurrentItem(null); scrapForm.resetFields() }}
        footer={null}
        destroyOnClose
        width={isMobile ? '100%' : 520}
      >
        <Form form={scrapForm} layout="vertical" onFinish={submitScrapRequest}>
          <Form.Item label="报废原因" name="reason" rules={[{ required: true, message: '请填写报废原因' }]}>
            <Input.TextArea rows={4} placeholder="请明确填写损坏、精度异常、无法修复等原因" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => { setScrapOpen(false); setCurrentItem(null); scrapForm.resetFields() }}>取消</Button>
              <Button type="primary" danger htmlType="submit" loading={acting}>提交申请</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`申请归还${currentItem ? ` - ${currentItem.name}` : ''}`}
        open={returnOpen}
        onCancel={() => { setReturnOpen(false); setCurrentItem(null); returnForm.resetFields() }}
        footer={null}
        destroyOnClose
        width={isMobile ? '100%' : 520}
      >
        <Form form={returnForm} layout="vertical" onFinish={submitReturnRequest}>
          <Form.Item label="归还说明" name="return_note" rules={[{ required: true, message: '请填写归还说明' }]}>
            <Input.TextArea rows={4} placeholder="请说明归还时间、量具状态、交接情况等" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => { setReturnOpen(false); setCurrentItem(null); returnForm.resetFields() }}>取消</Button>
              <Button type="primary" htmlType="submit" loading={acting}>提交</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default MyMeasureTools
