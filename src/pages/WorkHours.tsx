import React from 'react'
import { Card, Typography, Form, Select, Input, InputNumber, DatePicker, TimePicker, Button, message, Table, Space } from 'antd'
import { ReloadOutlined, LeftOutlined, ExperimentOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAuthStore } from '../stores/authStore'
import { useNavigate } from 'react-router-dom'

// 立即在全局作用域定义setAuxRange函数，确保在任何地方调用都不会出错
;(function() {
  if (typeof window !== 'undefined') {
    // 使用类型断言避免TypeScript错误
    (window as any).setAuxRange = function(range: any) {
      // 空函数，用于防止setAuxRange is not defined错误
    };
  }
})();

// 添加CSS样式，隐藏DatePicker和TimePicker的默认灰色提示文字
const WorkHoursFormStyle = {
  '.work-hours-form .ant-picker-input > input::placeholder': {
    color: 'transparent !important',
  },
  '.work-hours-form .ant-picker-input > input::-webkit-input-placeholder': {
    color: 'transparent !important',
  },
  '.work-hours-form .ant-picker-input > input::-moz-placeholder': {
    color: 'transparent !important',
  },
  '.work-hours-form .ant-picker-input > input:-ms-input-placeholder': {
    color: 'transparent !important',
  }
};

const { Title } = Typography

const WorkHours: React.FC = () => {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [invOptions, setInvOptions] = React.useState<any[]>([])
  const [loadingInv, setLoadingInv] = React.useState(false)
  const [selectedInv, setSelectedInv] = React.useState<string>('')
  const [selectedInfo, setSelectedInfo] = React.useState<{ name?: string; drawing?: string }>({})
  const [deviceOptions, setDeviceOptions] = React.useState<any[]>([])
  const [deviceName, setDeviceName] = React.useState<string>('')
  const [processOptions, setProcessOptions] = React.useState<string[]>([])
  const [fixedInvOptions, setFixedInvOptions] = React.useState<any[]>([])
  const [useManualProcess, setUseManualProcess] = React.useState(false)
  const [recentItems, setRecentItems] = React.useState<any[]>([])
  const [loadingRecent, setLoadingRecent] = React.useState(false)
  const [selectedRecentKeys, setSelectedRecentKeys] = React.useState<React.Key[]>([])
  const [lastCompletedTime, setLastCompletedTime] = React.useState<string>('')
  // 添加 completedTime 状态来替代 form 中的 completed_time 字段
  const [completedTime, setCompletedTime] = React.useState<string>('')
  // 添加零件名称映射
  const [partNameMap, setPartNameMap] = React.useState<Record<string, string>>({})
  


  // 使用Form.useWatch监听所有必要的表单字段，确保组件能及时重新渲染，避免直接调用form.getFieldValue导致的警告
  const wProcMinutes = Form.useWatch('proc_minutes', form)
  const wDeviceNo = Form.useWatch('device_no', form)
  const wWorkDate = Form.useWatch('work_date', form)
  const wShift = Form.useWatch('shift', form)
  const wProcessName = Form.useWatch('process_name', form)
  const wCompletedQuantity = Form.useWatch('completed_quantity', form)
  const wShiftDate = Form.useWatch('shift_date', form)
  
  // 关键修复：添加Form.useWatch监听辅助开始和结束时间变化
  // 这会确保当用户选择时间时，组件会重新渲染，触发calculateAuxDuration函数重新计算
  const wAuxStart = Form.useWatch('aux_start', form)
  const wAuxEnd = Form.useWatch('aux_end', form)



  // 简化的辅助时长计算
  const calculateAuxDuration = () => {
    // 使用Form.useWatch返回的值，确保获取的是最新值
    if (wAuxStart && wAuxEnd) {
      // 直接从dayjs对象获取小时和分钟
      const sHour = wAuxStart.hour()
      const sMin = wAuxStart.minute()
      const eHour = wAuxEnd.hour()
      const eMin = wAuxEnd.minute()
      
      // 简化的跨天判断：开始时间 > 结束时间即为跨天
      const isCrossDay = (sHour > eHour) || (sHour === eHour && sMin > eMin)
      
      // 计算辅助时长（分钟）
      const sTotal = sHour * 60 + sMin
      const eTotal = eHour * 60 + eMin
      return isCrossDay ? (eTotal + 1440 - sTotal) : (eTotal - sTotal)
    }
    return undefined
  }

  // 彻底修复的完成时间计算
  React.useEffect(() => {
    if (wAuxEnd && wAuxStart && wProcMinutes !== undefined) {
      // 获取当前工作日期
      const workDate = wWorkDate
      if (workDate && workDate.isValid()) {
        // 创建辅助开始和结束的完整日期时间对象
        const auxStartTime = dayjs(workDate).hour(wAuxStart.hour()).minute(wAuxStart.minute())
        const auxEndTime = dayjs(workDate).hour(wAuxEnd.hour()).minute(wAuxEnd.minute())
        
        // 如果辅助结束时间早于辅助开始时间，说明跨天了，需要加1天
        const actualAuxEndTime = auxEndTime.isBefore(auxStartTime) ? auxEndTime.add(1, 'day') : auxEndTime
        
        // 直接使用wProcMinutes，它已经是最新值
        const calculatedCompletedTime = actualAuxEndTime.add(wProcMinutes, 'minute')
        
        // 格式化显示
        const formattedTime = calculatedCompletedTime.format('MM月DD日 HH:mm')
        
        // 更新状态完成时间，不再使用form
        setCompletedTime(formattedTime)
        
        // 调试输出，方便查看计算过程
        console.log('完成时间计算：', {
          auxStart: auxStartTime.format('YYYY-MM-DD HH:mm'),
          auxEnd: auxEndTime.format('YYYY-MM-DD HH:mm'),
          actualAuxEnd: actualAuxEndTime.format('YYYY-MM-DD HH:mm'),
          wProcMinutes,
          completedTime: calculatedCompletedTime.format('YYYY-MM-DD HH:mm'),
          formattedTime
        })
      } else {
        // 更新状态完成时间，不再使用form
        setCompletedTime('')
      }
    } else {
      // 更新状态完成时间，不再使用form
      setCompletedTime('')
    }
  }, [wProcMinutes, wAuxStart, wAuxEnd, wWorkDate, form])



  React.useEffect(() => {
    const fmtLast = () => {
      if (!wDeviceNo) { setLastCompletedTime(''); return }
      const last = (recentItems || []).find((it: any) => String(it.device_no || '') === String(wDeviceNo || ''))
      if (!last || !last.aux_end_time || !last.aux_start_time) { setLastCompletedTime(''); return }
      
      // 创建辅助开始和结束的完整日期时间对象
      const workDate = dayjs(last.work_date || undefined)
      if (!workDate.isValid()) { setLastCompletedTime(''); return }
      
      const auxStartTime = dayjs(last.work_date).hour(Number(last.aux_start_time?.split(':')[0] || 0)).minute(Number(last.aux_start_time?.split(':')[1] || 0))
      const auxEndTime = dayjs(last.work_date).hour(Number(last.aux_end_time?.split(':')[0] || 0)).minute(Number(last.aux_end_time?.split(':')[1] || 0))
      
      // 如果辅助结束时间早于辅助开始时间，说明跨天了，需要加1天
      const actualAuxEndTime = auxEndTime.isBefore(auxStartTime) ? auxEndTime.add(1, 'day') : auxEndTime
      
      // 计算程序时长（分钟）
      const procHours = Number(last.proc_hours || 0)
      const programMinutes = Math.round(procHours * 60)
      
      // 计算完成时间：辅助结束时间加上程序时长
      const completedTime = actualAuxEndTime.add(programMinutes, 'minute')
      
      // 格式化显示
      const formattedTime = completedTime.format('MM月DD日 HH:mm')
      setLastCompletedTime(formattedTime)
    }
    fmtLast()
  }, [wDeviceNo, recentItems])

  const fetchInventory = async (q: string) => {
    try {
      setLoadingInv(true)
      const resp = await fetch(`/api/tooling/parts/inventory-list?page=1&pageSize=50&search=${encodeURIComponent(q || '')}`)
      if (!resp.ok) {
        throw new Error(`API请求失败: ${resp.status} ${resp.statusText}`)
      }
      const json = await resp.json()
      if (json?.success) {
        // 处理数据，只保留需要的属性，避免循环引用
        const opts = (json.items || []).map((it: any) => ({
          value: String(it.part_inventory_number || ''),
          label: String(it.part_inventory_number || ''),
          // 只保留需要的meta属性，避免循环引用
          meta: {
            part_name: String(it.part_name || ''),
            part_drawing_number: String(it.part_drawing_number || ''),
            process_route: String(it.process_route || '')
          },
          type: 'inventory'
        }))
        setInvOptions([...fixedInvOptions, ...opts])
      }
    } finally {
      setLoadingInv(false)
    }
  }

  const onSelectInv = (val: string, option: any) => {
    setSelectedInv(val)
    const meta = option?.meta
    setSelectedInfo({ name: meta?.part_name || '', drawing: meta?.part_drawing_number || '' })
    const isFixed = option?.type === 'fixed'
    setUseManualProcess(!!isFixed)
    if (isFixed) {
      setProcessOptions([])
    } else {
      const route = String(meta?.process_route || '')
      const items = route.split('→').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
      setProcessOptions(items)
    }
  }

  React.useEffect(() => {
    fetchDevices()
    fetchRecent()
    fetchFixedOptions()
    fetchPartNameMap()
  }, [])

  // 获取零件名称映射
  const fetchPartNameMap = async () => {
    try {
      const r = await fetch('/api/tooling/parts/inventory-list?page=1&pageSize=500')
      if (!r.ok) {
        throw new Error(`API请求失败: ${r.status} ${r.statusText}`)
      }
      const j = await r.json()
      if (j?.success) {
        const map: Record<string, string> = {}
        ;(j.items || []).forEach((p: any) => {
          if (p.part_inventory_number) map[p.part_inventory_number] = p.part_name || ''
          if (p.part_drawing_number && !map[p.part_drawing_number]) map[p.part_drawing_number] = p.part_name || ''
        })
        setPartNameMap(map)
      }
    } catch {}
  }

  const fetchFixedOptions = async () => {
    const r = await fetch('/api/tooling/fixed-inventory-options')
    if (!r.ok) {
      throw new Error(`API请求失败: ${r.status} ${r.statusText}`)
    }
    const j = await r.json()
    if (j?.success) {
      const opts = (j.items || []).filter((x: any) => x.is_active).map((x: any) => ({ value: x.option_value, label: x.option_value, meta: null, type: 'fixed' }))
      setFixedInvOptions(opts)
      // merge into current inventory list
      setInvOptions((prev) => [...opts, ...prev.filter((p: any) => p.type === 'inventory')])
    }
  }

  const fetchDevices = async () => {
    const r = await fetch('/api/tooling/devices')
    if (!r.ok) {
      throw new Error(`API请求失败: ${r.status} ${r.statusText}`)
    }
    const j = await r.json()
    if (j?.success) {
        // 处理数据，只保留需要的属性，避免循环引用
        setDeviceOptions((j.items || []).map((d: any) => ({
          value: String(d.device_no || ''),
          label: `${String(d.device_no || '')}-${String(d.device_name || '')}`,
          // 只保留需要的meta属性，避免循环引用
          meta: {
            device_name: String(d.device_name || '')
          }
        })))
      }
  }

  const handleRefresh = async () => {
    setSelectedInv('')
    setSelectedInfo({})
    setProcessOptions([])
    setDeviceName('')
    form.resetFields()
    await Promise.all([fetchInventory(''), fetchDevices()])
    await fetchRecent()
  }

  const fetchRecent = async () => {
    try {
      setLoadingRecent(true)
      const params = new URLSearchParams()
      params.set('page', '1')
      params.set('pageSize', '50')
      params.set('order', 'created_at')
      params.set('order_dir', 'desc')
      // 移除操作者过滤，获取所有最近记录，确保同一设备的时间检查正确
      // if (user?.real_name) params.set('operator', user.real_name)
      const resp = await fetch(`/api/tooling/work-hours?${params.toString()}`)
      if (!resp.ok) {
        throw new Error(`API请求失败: ${resp.status} ${resp.statusText}`)
      }
      const json = await resp.json()
      if (json?.success) {
        // 处理数据，将所有对象转换为基本类型，避免循环引用
        const rawItems = json.items || []
        const items = rawItems.map(item => ({
          // 只保留需要的属性，并转换为基本类型
          id: String(item.id || ''),
          part_inventory_number: String(item.part_inventory_number || ''),
          part_drawing_number: String(item.part_drawing_number || ''),
          hours: Number(item.hours || 0),
          aux_hours: Number(item.aux_hours || 0),
          proc_hours: Number(item.proc_hours || 0),
          aux_start_time: String(item.aux_start_time || ''),
          aux_end_time: String(item.aux_end_time || ''),
          work_date: String(item.work_date || ''),
          shift_date: String(item.shift_date || ''),
          process_name: String(item.process_name || ''),
          operator: String(item.operator || ''),
          completed_quantity: Number(item.completed_quantity || 0),
          device_no: String(item.device_no || ''),
          shift: String(item.shift || ''),
          // 转换其他可能包含循环引用的属性
          created_at: String(item.created_at || '')
        }))
        setRecentItems(items)
      }
    } finally {
      setLoadingRecent(false)
    }
  }

  // 计算子表格中需要合并的列的rowSpan
  const getRowSpanConfig = (data: any[]) => {
    // 按日期和班次分组，计算每个组的rowSpan
    const rowSpanMap: Record<string, number> = {};
    const mergedRows: Record<string, boolean> = {};
    
    // 首先遍历数据，计算每个日期和班次组合的行数
    data.forEach((r, index) => {
      const key = `${r.work_date}-${r.shift}`;
      if (!rowSpanMap[key]) {
        rowSpanMap[key] = 0;
      }
      rowSpanMap[key]++;
    });
    
    // 然后创建rowSpan配置
    return data.map((r, index) => {
      const key = `${r.work_date}-${r.shift}`;
      const isMerged = mergedRows[key];
      
      if (!isMerged) {
        // 标记该组已处理
        mergedRows[key] = true;
        return {
          shouldRender: true,
          rowSpan: rowSpanMap[key]
        };
      } else {
        return {
          shouldRender: false,
          rowSpan: 0
        };
      }
    });
  };

  // 计算最近提交记录的统计数据，用于日统计、日辅助、日程序列
  const recentStats = React.useMemo(() => {
    const statsMap: Record<string, { statHours: number; auxHours: number; procHours: number; runningCount: number }> = {};
    const deviceSetMap: Record<string, Set<string>> = {};
    
    // 遍历所有最近提交记录，计算每个日期和班次的统计数据
    recentItems.forEach(r => {
      const key = `${r.work_date}-${r.shift}`;
      if (!statsMap[key]) {
        statsMap[key] = { statHours: 0, auxHours: 0, procHours: 0, runningCount: 0 };
        deviceSetMap[key] = new Set<string>();
      }
      
      const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m };
      let auxMinutes = 0;
      if (r.aux_start_time && r.aux_end_time) {
        const s = toMin(r.aux_start_time);
        const e = toMin(r.aux_end_time);
        auxMinutes = e >= s ? (e - s) : (e + 1440 - s);
      } else {
        auxMinutes = Math.round(Number(r.aux_hours || 0) * 60);
      }
      
      const procMinutes = Math.round(Number(r.proc_hours || 0) * 60);
      const statMinutes = auxMinutes + procMinutes;
      
      statsMap[key].statHours += statMinutes;
      statsMap[key].auxHours += auxMinutes;
      statsMap[key].procHours += procMinutes;
      
      // 统计开动设备数量
      if (procMinutes > 0 && r.device_no) {
        deviceSetMap[key].add(r.device_no);
      }
    });
    
    // 计算开动设备数量
    Object.keys(statsMap).forEach(key => {
      statsMap[key].runningCount = deviceSetMap[key].size;
    });
    
    return statsMap;
  }, [recentItems]);

  // 将最近提交表格的columns数组提取出来，并使用useMemo缓存，避免每次渲染都重新创建
  const recentColumns = React.useMemo(() => {
    // 需要合并的列
    const mergeColumns = ['shift_date', 'shift', 'daily_stat_hours', 'daily_aux_hours', 'daily_proc_hours', 'running_count'];
    
    // 基础列配置
    const baseColumns = [
      { title: '班次日期', dataIndex: 'shift_date', align: 'center' },
      { title: '班次', dataIndex: 'shift', align: 'center' },
      { title: '日统计', key: 'daily_stat_hours', render: (_: any, r: any) => {
        const key = `${r.work_date}-${r.shift}`;
        const sum = recentStats[key]?.statHours || 0;
        return (sum / 60).toFixed(2);
      }, width: 60, align: 'center' },
      { title: '日辅助', key: 'daily_aux_hours', render: (_: any, r: any) => {
        const key = `${r.work_date}-${r.shift}`;
        const sum = recentStats[key]?.auxHours || 0;
        return (sum / 60).toFixed(2);
      }, width: 60, align: 'center' },
      { title: '日程序', key: 'daily_proc_hours', render: (_: any, r: any) => {
        const key = `${r.work_date}-${r.shift}`;
        const sum = recentStats[key]?.procHours || 0;
        return (sum / 60).toFixed(2);
      }, width: 60, align: 'center' },
      { title: '开动', key: 'running_count', render: (_: any, r: any) => {
        const key = `${r.work_date}-${r.shift}`;
        return recentStats[key]?.runningCount || 0;
      }, width: 50, align: 'center' },
      { title: '盘存编号', dataIndex: 'part_inventory_number', align: 'center' },
      { title: '图号', dataIndex: 'part_drawing_number', align: 'center' },
      { title: '零件名称', key: 'part_name', render: (_: any, r: any) => {
        const inv = String(r.part_inventory_number || '')
        const draw = String(r.part_drawing_number || '')
        // 通过盘存编号或图号从映射中获取零件名称
        return (inv && partNameMap[inv]) || (draw && partNameMap[draw]) || '-';
      }, align: 'center' },
      { title: '工序', dataIndex: 'process_name', align: 'center' },
      { title: '设备编号', key: 'device', render: (_: any, r: any) => {
        return r.device_no || '-' 
      }, width: 80, align: 'center' },
      { title: '辅助时间', key: 'work_date_aux', render: (_: any, r: any) => {
        const fmt = (t: string) => {
          const s = String(t || '')
          if (!s) return '-' 
          return s.length >= 5 ? s.slice(0, 5) : s
        }
        const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
        const hasBoth = !!r.aux_start_time && !!r.aux_end_time
        let auxTime = '-' 
        if (hasBoth) {
          const s = toMin(r.aux_start_time)
          const e = toMin(r.aux_end_time)
          const mins = e >= s ? (e - s) : (e + 1440 - s)
          auxTime = `${fmt(r.aux_start_time)}--${fmt(r.aux_end_time)} (${mins})`
        }
        return auxTime
      }, width: 180, align: 'center' },
      { title: '辅助', dataIndex: 'aux_hours', render: (_: any, r: any) => {
        const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
        let mins = 0
        if (r.aux_start_time && r.aux_end_time) {
          const s = toMin(r.aux_start_time)
          const e = toMin(r.aux_end_time)
          mins = e >= s ? (e - s) : (e + 1440 - s)
        } else {
          mins = Math.round(Number(r.aux_hours||0)*60)
        }
        return String(mins)
      }, width: 60, align: 'center' },
      { title: '程序', dataIndex: 'proc_hours', render: (v: number) => ((Number(v||0)*60).toFixed(0)), width: 60, align: 'center' },
      { title: '统计', key: 'stat_hours', render: (_: any, r: any) => {
        const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
        let auxMinutes = 0
        if (r.aux_start_time && r.aux_end_time) {
          const s = toMin(r.aux_start_time)
          const e = toMin(r.aux_end_time)
          auxMinutes = e >= s ? (e - s) : (e + 1440 - s)
        } else {
          auxMinutes = Math.round(Number(r.aux_hours || 0) * 60)
        }
        const procMinutes = Math.round(Number(r.proc_hours || 0) * 60)
        // 简化计算，不考虑系数，直接相加
        const statMinutes = auxMinutes + procMinutes
        return statMinutes.toFixed(0)
      }, width: 60, align: 'center' },
      { title: '完成时间', key: 'completed_time', render: (_: any, r: any) => {
        if (!r.aux_start_time || !r.aux_end_time) return '-' 
        
        // 解析加工日期
        const workDate = dayjs(r.work_date || undefined)
        if (!workDate.isValid()) return '-' 
        
        // 解析辅助开始时间和辅助结束时间
        const auxStartTime = dayjs(`${r.work_date} ${r.aux_start_time}`)
        const auxEndTime = dayjs(`${r.work_date} ${r.aux_end_time}`)
        
        // 如果辅助结束时间早于辅助开始时间，说明跨越了一天
        const actualAuxEndTime = auxEndTime.isBefore(auxStartTime) 
          ? auxEndTime.add(1, 'day') 
          : auxEndTime
        
        // 计算程序时长（小时）
        const procHours = Number(r.proc_hours || 0)
        
        // 计算完成时间
        const completedTime = actualAuxEndTime.add(procHours, 'hour')
        
        return completedTime.format('MM-DD HH:mm')
      }, width: 100, align: 'center' },
      { title: '加工数量', dataIndex: 'completed_quantity', align: 'center' }
    ] as any;
    
    // 计算rowSpan配置
    const rowSpanConfig = getRowSpanConfig(recentItems);
    
    // 为需要合并的列添加onCell属性
    return baseColumns.map(col => {
      const shouldMerge = mergeColumns.includes(col.dataIndex || col.key);
      
      if (shouldMerge) {
        return {
          ...col,
          onCell: (_: any, index: number) => {
            const config = rowSpanConfig[index];
            return {
              rowSpan: config.rowSpan
            };
          }
        };
      }
      return col;
    });
  }, [recentItems, recentStats, partNameMap])

  return (
    <div className="p-3 max-w-[520px] mx-auto">
      <div className="flex items-center justify-between mb-3">
          <Title level={2} className="mb-0"><ExperimentOutlined className="text-3xl text-pink-500 mb-2 mr-2" /> 工时录入</Title>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={handleRefresh}>刷新</Button>
            <Button icon={<LeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
          </Space>
        </div>
      <Card styles={{ body: { padding: 10 } }}>
        <Form
          layout="vertical"
          size="small"
          initialValues={{}}
          form={form}
          onFinish={async (vals) => {
            if (!selectedInv) {
              message.warning('请先选择盘存编号')
              return
            }
            // Validate device time order against last record for the same device
            const deviceNo = form.getFieldValue('device_no')
            if (deviceNo) {
              const lastSame = (recentItems || []).find((it: any) => String(it.device_no || '') === String(deviceNo || ''))
              if (lastSame) {
                const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
                const pad = (n: number) => String(n).padStart(2,'0')
                if (!lastSame.aux_end_time) {
                  message.error('该设备上一个作业尚未结束，请先补充结束时间或删除后再提交')
                  return
                }
                if (vals.aux_start) {
                  const endMin = toMin(lastSame.aux_end_time)
                  const pm = Math.round(Number(lastSame.proc_hours || 0) * 60)
                  const compTotal = endMin + pm
                  const daysAdd = Math.floor(compTotal / 1440)
                  const comp = compTotal % 1440
                  const hh = Math.floor(comp / 60)
                  const mi = comp % 60
                  const prevEndTs = dayjs(lastSame.work_date).add(daysAdd, 'day').hour(hh).minute(mi).valueOf()
                  const currStartTs = dayjs(vals.work_date).hour(vals.aux_start.hour()).minute(vals.aux_start.minute()).valueOf()
                  if (currStartTs < prevEndTs) {
                    message.error('本次辅助起始时间早于该设备上一次结束时间，请调整后再提交')
                    return
                  }
                }
              }
            }
            const hide = message.loading('提交中...', 0)
            // Overlap check across devices for same operator (UX-side)
            try {
              const mm = (t: any) => dayjs(t).format('HH:mm')
              const ws = vals.work_date?.format('YYYY-MM-DD')
              const sstr = vals.aux_start ? mm(vals.aux_start) : ''
              const estr = vals.aux_end ? mm(vals.aux_end) : ''
              if (ws && sstr) {
                const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
                const sMin = toMin(sstr)
                const eMinRaw = estr ? toMin(estr) : sMin
                const addDay = eMinRaw < sMin ? 1 : 0
                const currStart = dayjs(ws).hour(Math.floor(sMin/60)).minute(sMin%60).valueOf()
                const currEnd = dayjs(ws).add(addDay,'day').hour(Math.floor(eMinRaw/60)).minute(eMinRaw%60).valueOf()
                const deviceNo = form.getFieldValue('device_no')
                for (const it of recentItems || []) {
                  if (String(it.device_no || '') === String(deviceNo || '')) continue
                  const os = String(it.aux_start_time || '')
                  const oe = String(it.aux_end_time || '')
                  if (!os) continue
                  const osMin = toMin(os)
                  const oeMinRaw = oe ? toMin(oe) : null
                  const oAdd = (oeMinRaw !== null && oeMinRaw < osMin) ? 1 : 0
                  const oStart = dayjs(it.work_date).hour(Math.floor(osMin/60)).minute(osMin%60).valueOf()
                  const oEnd = (oeMinRaw !== null) ? dayjs(it.work_date).add(oAdd,'day').hour(Math.floor(oeMinRaw/60)).minute(oeMinRaw%60).valueOf() : Number.MAX_SAFE_INTEGER
                  if (currStart < oEnd && currEnd > oStart) {
                    hide()
                    message.error('与该操作者其他设备的辅助时间重叠，请调整')
                    return
                  }
                }
              }
            } catch {}
            const auxStart = wAuxStart ? wAuxStart.format('HH:mm') : ''
            const auxEnd = wAuxEnd ? wAuxEnd.format('HH:mm') : ''
            const parseMinutes = (hhmm: string) => {
              const [hh, mm] = hhmm.split(':').map(n => Number(n || 0))
              return (hh * 60) + mm
            }
            const startMin = auxStart ? parseMinutes(auxStart) : 0
            const endMin = auxEnd ? parseMinutes(auxEnd) : 0
            const diffMin = (endMin >= startMin) ? (endMin - startMin) : (endMin + 1440 - startMin)
            const auxHours = diffMin > 0 ? diffMin / 60 : 0
            const procHours = Number(vals.proc_minutes || 0) / 60
            // 确保payload中的所有属性都是基本类型，避免循环引用警告
            const payload = {
              part_inventory_number: String(selectedInv),
              part_drawing_number: String(selectedInfo.drawing || ''),
              hours: Number(auxHours + procHours),
              aux_hours: Number(auxHours),
              proc_hours: Number(procHours),
              aux_start_time: String(auxStart || ''),
              aux_end_time: String(auxEnd || ''),
              work_date: String(vals.work_date?.format('YYYY-MM-DD') || ''),
              shift_date: String(vals.shift_date?.format('YYYY-MM-DD') || ''),
              process_name: String(vals.process_name || ''),
              operator: String(user?.real_name || ''),
              completed_quantity: Number(vals.completed_quantity || 0),
              device_no: String(vals.device_no || ''),
              shift: String(vals.shift || '')
            }
            try {
              const resp = await fetch('/api/tooling/work-hours', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
              if (!resp.ok) {
                throw new Error(`API请求失败: ${resp.status} ${resp.statusText}`)
              }
              const json = await resp.json()
              if (json?.success) {
                hide()
                message.success('提交成功')
                
                // 使用try-catch防止setAuxRange错误
                try {
                  try {
                    const k = String(selectedInv || selectedInfo.drawing || '')
                    if (k) {
                      const raw = localStorage.getItem('process_done_map') || '{}'
                      let map: any = {}
                      try { map = JSON.parse(raw) } catch { map = {} }
                      const pn = String(vals.process_name || '')
                      const prev = map[k] || { done: [], last: '' }
                      const set = new Set<string>(Array.isArray(prev.done) ? prev.done : [])
                      if (pn) set.add(pn)
                      map[k] = { done: Array.from(set), last: pn, time: Date.now() }
                      localStorage.setItem('process_done_map', JSON.stringify(map))
                    }
                  } catch {}
                  // 直接清空所有状态
                  setSelectedInv('')
                  setSelectedInfo({})
                  setProcessOptions([])
                  setDeviceName('')
                  setUseManualProcess(false)
                  
                  // 强制清空所有表单字段，不依赖setFieldsValue
                  form.resetFields()
                  
                  // 额外清除，确保字段被清空 - 使用适当的空值而非undefined，避免JSON.stringify循环引用警告
                  form.setFieldValue('work_date', null)
                  form.setFieldValue('aux_start', null)
                  form.setFieldValue('aux_end', null)
                  form.setFieldValue('process_name', '')
                  form.setFieldValue('device_no', '')
                  form.setFieldValue('proc_minutes', null)
                  form.setFieldValue('completed_quantity', null)
                  
                  // 刷新最近提交列表
                  await fetchRecent()
                } catch (e: any) {
                  // 忽略所有错误，确保提交成功提示正常显示
                  console.error('重置表单时出错:', e)
                }
              } else {
                hide()
                message.error(json?.error || '提交失败')
              }
            } catch (e: any) {
              hide()
              message.error(e?.message || '网络错误')
            }
          }}
        >
          {/* 第一行：班次日期、班次 */}
          <div style={{ display: 'flex', gap: 6 }}>
            <Form.Item name="shift_date" label="班次日期" rules={[{ required: true, message: '请选择班次日期' }]} style={{ flex: 1, marginBottom: 8 }} preserve={false}>
              <DatePicker style={{ width: '100%', maxWidth: 110 }} placeholder="" />
            </Form.Item>
            <Form.Item name="shift" label="班次" rules={[{ required: true, message: '请选择班次' }]} style={{ flex: 1, marginBottom: 8 }}>
              <Select style={{ width: '100%', maxWidth: 110 }} options={[{ value: '白班', label: '白班' }, { value: '夜班', label: '夜班' }]} />
            </Form.Item>
          </div>

          {/* 第二行：盘存编号、零件名称 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <div style={{ flex: 1, marginBottom: 8 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '14px', color: 'rgba(0, 0, 0, 0.88)' }}>盘存编号</label>
              <Select
                showSearch
                filterOption={false}
                onSearch={(val) => fetchInventory(val)}
                onOpenChange={(open) => { if (open) fetchInventory('') }}
                options={invOptions}
                loading={loadingInv}
                style={{ width: '100%', maxWidth: 110 }}
                value={selectedInv || undefined}
                allowClear
                onChange={onSelectInv}
              />
            </div>
            <div style={{ flex: 1, marginBottom: 8 }}>
              {/* 直接显示零件名称，无标签 */}
              <div style={{ marginBottom: 4 }}>
                <span>{selectedInfo.name || '-'}</span>
              </div>
              {/* 直接显示图号，无标签，在零件名称下方 */}
              <div>
                <span>{selectedInfo.drawing || '-'}</span>
              </div>
            </div>
          </div>

          {/* 第三行：加工工序、设备编号 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <Form.Item name="process_name" label="加工工序" rules={[{ required: true, message: '请选择或填写加工工序' }]} style={{ flex: 1, marginBottom: 8 }}>
              {useManualProcess ? (
                <Input style={{ width: '100%', maxWidth: 110 }} />
              ) : (
                <Select options={processOptions.map(p => ({ value: p, label: p }))} style={{ width: '100%', maxWidth: 110 }} />
              )}
            </Form.Item>
            <Form.Item name="device_no" label="设备编号" rules={[{ required: true, message: '请选择设备编号' }]} style={{ flex: 1, marginBottom: 8 }}>
              <Select
                showSearch
                filterOption={(input, option) => String(option?.label || '').includes(input)}
                options={deviceOptions}
                style={{ width: '100%', maxWidth: 110 }}
                onSelect={(_val, opt: any) => setDeviceName(opt?.meta?.device_name || '')}
              />
            </Form.Item>
          </div>

          {/* 第四行：加工日期和辅助时长 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <Form.Item name="work_date" label="加工日期" rules={[{ required: true, message: '请选择加工日期' }]} style={{ flex: 1, marginBottom: 8 }} preserve={false}>
              <DatePicker style={{ width: '100%', maxWidth: 110 }} placeholder="" />
            </Form.Item>
            <div style={{ flex: 1, marginBottom: 8 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '14px', color: 'rgba(0, 0, 0, 0.88)' }}>辅助时长:</label>
              <span style={{ fontSize: '14px' }}>
                {calculateAuxDuration() || '-'}分钟
              </span>
            </div>
          </div>
          
          {/* 第五行：辅助开始、辅助结束 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <Form.Item name="aux_start" label="辅助开始" rules={[{ required: true, message: '请选择辅助开始时间' }]} style={{ flex: 1, marginBottom: 8 }} preserve={false}>
              <TimePicker 
                format="HH:mm" 
                style={{ width: '100%', maxWidth: 110 }} 
                showNow={false}
                placeholder=""
                hourStep={1}
                minuteStep={1}
                secondStep={1}
                changeOnScroll
                hideDisabledOptions={false}
              />
            </Form.Item>
            <Form.Item name="aux_end" label="辅助结束" rules={[{ required: true, message: '请选择辅助结束时间' }]} style={{ flex: 1, marginBottom: 8 }} preserve={false}>
              <TimePicker 
                format="HH:mm" 
                style={{ width: '100%', maxWidth: 110 }} 
                showNow={false}
                placeholder=""
                hourStep={1}
                minuteStep={1}
                secondStep={1}
                changeOnScroll
                hideDisabledOptions={false}
              />
            </Form.Item>
          </div>

          {/* 第六行：程序时长(分钟)、完成数量 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <Form.Item name="proc_minutes" label="程序时长(分钟)" rules={[{ required: true, message: '请输入程序时长' }]} style={{ flex: 1, marginBottom: 8 }}>
              <InputNumber 
                min={0} 
                step={5} 
                controls={false} 
                style={{ width: '100%', maxWidth: 110 }} 
              />
            </Form.Item>
            <Form.Item name="completed_quantity" label="完成数量" rules={[{ required: true, message: '请输入完成数量' }]} style={{ flex: 1, marginBottom: 8 }}>
              <InputNumber 
                min={0} 
                step={1} 
                controls={false} 
                style={{ width: '100%', maxWidth: 110 }} 
              />
            </Form.Item>
          </div>

          {/* 第七行：上次结束时间、本次完成时间 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <div style={{ flex: 1, marginBottom: 8 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '14px', color: 'rgba(0, 0, 0, 0.88)' }}>上次结束时间</label>
              <span>{lastCompletedTime || '-'}</span>
            </div>
            <div style={{ flex: 1, marginBottom: 8 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '14px', color: 'rgba(0, 0, 0, 0.88)' }}>本次完成时间</label>
              <span>{completedTime || '-'}</span>
            </div>
          </div>

          {/* 第八行：提交按钮 */}
          <Form.Item style={{ marginBottom: 0 }}>
            <Button 
              type="primary" 
              htmlType="submit" 
              block
              disabled={!
                wWorkDate || 
                !wShift || 
                !selectedInv || 
                !wProcessName || 
                !wDeviceNo || 
                !wProcMinutes || 
                !wCompletedQuantity || 
                !wAuxStart || 
                !wAuxEnd ||
                !wShiftDate
              }
            >
              提交
            </Button>
          </Form.Item>
        </Form>
      </Card>
      <Card className="mt-3" styles={{ body: { padding: 10 } }}>
        <div className="flex items-center justify-between mb-2">
          <Typography.Text strong>最近提交</Typography.Text>
          <Button danger disabled={!selectedRecentKeys.length} onClick={async () => {
            try {
              message.loading({ content: '删除中...', key: 'del' })
              await Promise.all(selectedRecentKeys.map((id) => fetch(`/api/tooling/work-hours/${id}`, { method: 'DELETE' })))
              message.success({ content: '删除成功', key: 'del' })
              setSelectedRecentKeys([])
              fetchRecent()
            } catch {
              message.error({ content: '删除失败', key: 'del' })
            }
          }}>删除选中</Button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <Table
            size="small"
            rowKey={(r) => r.id || `${r.part_inventory_number}-${r.work_date}-${r.process_name}`}
            loading={loadingRecent}
            pagination={false}
            dataSource={recentItems}
            rowSelection={{ selectedRowKeys: selectedRecentKeys, onChange: (keys) => setSelectedRecentKeys(keys) }}
            scroll={{ x: 'max-content' }}
            columns={recentColumns}
          />
        </div>
      </Card>
    </div>
  )
}

export default WorkHours
