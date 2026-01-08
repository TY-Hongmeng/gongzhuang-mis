import React from 'react'
import { Card, Typography, DatePicker, Button, Table, Row, Col, message, Select, Space } from 'antd'
import { ReloadOutlined, LeftOutlined, ExperimentOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
// import zhCN from 'antd/locale/zh_CN'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'

const { Title } = Typography
const { RangePicker } = DatePicker

// 月份中文名称映射
const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

// 自定义月份选择器配置 - 注意：antd 5.x 中 DatePicker 不再支持 pickerOptions 属性
// 这个配置目前没有使用，暂时注释掉
/* const monthPickerOptions = {
  monthCellRender: (date: any) => {
    const month = date.month()
    return monthNames[month]
  }
} */

const WorkHoursManagement: React.FC = () => {
  // 路由导航对象
  const navigate = useNavigate()
  
  // 筛选条件状态
  const [range, setRange] = React.useState<any>(null)
  const [yearMonth, setYearMonth] = React.useState<any>(null)
  const [operator, setOperator] = React.useState('')
  const [workshop, setWorkshop] = React.useState<string>('')
  const [team, setTeam] = React.useState<string>('')
  const [shift, setShift] = React.useState<string>('')
  const [deviceNo, setDeviceNo] = React.useState<string>('')
  const [partInventoryNo, setPartInventoryNo] = React.useState<string>('')
  const [partDrawingNo, setPartDrawingNo] = React.useState<string>('')
  const [partName, setPartName] = React.useState<string>('')
  
  // 数据状态
  const [loading, setLoading] = React.useState(false)
  const [items, setItems] = React.useState<any[]>([])
  const [allItems, setAllItems] = React.useState<any[]>([])
  const [userMap, setUserMap] = React.useState<Record<string, { workshop?: string; team?: string; aux_coeff?: number; proc_coeff?: number; capability_coeff?: number }>>({})
  const [expandedRowKeys, setExpandedRowKeys] = React.useState<React.Key[]>([])
  const [selectedKeys, setSelectedKeys] = React.useState<React.Key[]>([])
  const [partNameMap, setPartNameMap] = React.useState<Record<string, string>>({})
  const [deviceMap, setDeviceMap] = React.useState<Record<string, { name: string; max_aux_minutes?: number }>>({})

  // 获取唯一的操作者列表
  const uniqueOperators = React.useMemo(() => {
    const operators = Array.from(new Set(allItems.map(item => item.operator || '-')))
    return operators.filter(o => o !== '-')
  }, [allItems])

  // 获取唯一的班次列表
  const uniqueShifts = React.useMemo(() => {
    const shifts = Array.from(new Set(allItems.map(item => item.shift || '-')))
    return shifts.filter(s => s !== '-')
  }, [allItems])

  // 获取唯一的设备编号列表
  const uniqueDeviceNos = React.useMemo(() => {
    const deviceNos = Array.from(new Set(allItems.map(item => item.device_no || '-')))
    return deviceNos.filter(d => d !== '-')
  }, [allItems])

  // 获取唯一的盘存编号列表
  const uniquePartInventoryNos = React.useMemo(() => {
    const partInventoryNos = Array.from(new Set(allItems.map(item => item.part_inventory_number || '-')))
    return partInventoryNos.filter(p => p !== '-')
  }, [allItems])

  // 获取唯一的图号列表
  const uniquePartDrawingNos = React.useMemo(() => {
    const partDrawingNos = Array.from(new Set(allItems.map(item => item.part_drawing_number || '-')))
    return partDrawingNos.filter(p => p !== '-')
  }, [allItems])

  // 获取唯一的零件名称列表
  const uniquePartNames = React.useMemo(() => {
    // 从partNameMap和items中获取所有可能的零件名称
    const partNames = new Set<string>()
    // 从items中获取所有零件名称
    allItems.forEach(item => {
      const invNo = item.part_inventory_number
      const drawNo = item.part_drawing_number
      const nameFromMap = invNo ? partNameMap[invNo] : (drawNo ? partNameMap[drawNo] : '')
      if (nameFromMap) {
        partNames.add(nameFromMap)
      }
    })
    return Array.from(partNames)
  }, [allItems, partNameMap])

  const fetchData = async () => {
    try {
      setLoading(true)
      // 获取所有数据，不添加筛选条件
      const baseParams = new URLSearchParams()
      baseParams.set('page', '1')
      baseParams.set('pageSize', '200')
      baseParams.set('order', 'work_date')
      baseParams.set('order_dir', 'desc')
      
      const resp = await fetch(`/api/tooling/work-hours?${baseParams.toString()}`)
      if (!resp.ok) {
        throw new Error(`API请求失败: ${resp.status} ${resp.statusText}`)
      }
      const json = await resp.json()
      if (json?.success) {
          // 处理数据，将所有对象转换为基本类型，避免循环引用
          const rawData = json.items || []
          const allData = rawData.map(item => ({
            // 只保留需要的属性，并转换为基本类型
            id: String(item.id || ''),
            part_inventory_number: String(item.part_inventory_number || ''),
            part_drawing_number: String(item.part_drawing_number || ''),
            part_name: String(item.part_name || ''),
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
            created_at: String(item.created_at || ''),
            updated_at: String(item.updated_at || '')
          }))
          
          // 保存所有数据，用于生成筛选选项
          setAllItems(allData)
          
          // 在客户端进行筛选
          let filteredData = allData
        
        // 日期范围筛选
        if (range) {
          const startDate = range[0]?.format('YYYY-MM-DD')
          const endDate = range[1]?.format('YYYY-MM-DD')
          if (startDate && endDate) {
            filteredData = filteredData.filter(item => {
              const itemDate = item.work_date
              return itemDate >= startDate && itemDate <= endDate
            })
          }
        }
        
        // 年月筛选
        if (yearMonth) {
          const selectedYearMonth = yearMonth.format('YYYY-MM')
          filteredData = filteredData.filter(item => {
            const itemDate = item.work_date
            return itemDate.startsWith(selectedYearMonth)
          })
        }
        
        // 操作者筛选
        if (operator) {
          filteredData = filteredData.filter(item => item.operator === operator)
        }
        
        // 班次筛选
        if (shift) {
          filteredData = filteredData.filter(item => item.shift === shift)
        }
        
        // 设备编号筛选
        if (deviceNo) {
          filteredData = filteredData.filter(item => item.device_no === deviceNo)
        }
        
        // 盘存编号筛选
        if (partInventoryNo) {
          filteredData = filteredData.filter(item => item.part_inventory_number === partInventoryNo)
        }
        
        // 图号筛选
        if (partDrawingNo) {
          filteredData = filteredData.filter(item => item.part_drawing_number === partDrawingNo)
        }
        
        // 零件名称筛选
        if (partName) {
          filteredData = filteredData.filter(item => {
            const invNo = item.part_inventory_number
            const drawNo = item.part_drawing_number
            const nameFromMap = invNo ? partNameMap[invNo] : (drawNo ? partNameMap[drawNo] : '')
            return nameFromMap === partName
          })
        }
        
        // 设置筛选后的数据
        setItems(filteredData)
      }
    } finally {
      setLoading(false)
    }
  }

  // 组件初始化时获取用户信息
  React.useEffect(() => {
    fetchUsers()
  }, [])

  // 当筛选条件变化时，重新获取数据并在客户端进行筛选
  React.useEffect(() => {
    fetchData()
  }, [range, yearMonth, operator, workshop, team, shift, deviceNo, partInventoryNo, partDrawingNo, partName])

  React.useEffect(() => {
    (async () => {
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
    })()
  }, [])

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/tooling/devices')
        if (!r.ok) {
          throw new Error(`API请求失败: ${r.status} ${r.statusText}`)
        }
        const j = await r.json()
        if (j?.success) {
          const map: Record<string, { name: string; max_aux_minutes?: number }> = {}
          ;(j.items || []).forEach((d: any) => {
            if (d.device_no) map[d.device_no] = { name: d.device_name || '', max_aux_minutes: typeof d.max_aux_minutes === 'number' ? d.max_aux_minutes : undefined }
          })
          setDeviceMap(map)
        }
      } catch {}
    })()
  }, [])

  const fetchUsers = async () => {
    try {
      const r = await fetch(`/api/tooling/users/basic?ts=${Date.now()}`)
      if (!r.ok) {
        throw new Error(`API请求失败: ${r.status} ${r.statusText}`)
      }
      const j = await r.json()
      if (j?.success) {
        const map: Record<string, { workshop?: string; team?: string; aux_coeff?: number; proc_coeff?: number; capability_coeff?: number }> = {}
        ;(j.items || []).forEach((u: any) => { map[u.real_name] = { workshop: u.workshop, team: u.team, aux_coeff: Number(u.aux_coeff ?? 1), proc_coeff: Number(u.proc_coeff ?? 1), capability_coeff: Number(u.capability_coeff ?? 1) } })
        setUserMap(map)
      }
    } catch {}
  }

  // 计算每个日期、班次的开动设备数量
  const getRunningDevicesCount = (date: string, shift: string, allItems: any[]) => {
    const runningDevices = new Set<string>();
    allItems.forEach((item: any) => {
      if (item.work_date === date && item.shift === shift) {
        const procMinutes = Math.round(Number(item.proc_hours || 0) * 60);
        if (procMinutes > 0 && item.device_no) {
          runningDevices.add(item.device_no);
        }
      }
    });
    return runningDevices.size;
  };

  // 计算每个操作者、每个班次、每个日期的工时之和
  const dailyHoursSum = React.useMemo(() => {
    const sumMap: Record<string, { statHours: number; auxHours: number; procHours: number }> = {};
    
    // 遍历所有数据，计算每个操作者、每个班次、每个日期的工时之和
    items.forEach(r => {
      const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
      let auxMinutes = 0
      if (r.aux_start_time && r.aux_end_time) {
        const s = toMin(r.aux_start_time)
        const e = toMin(r.aux_end_time)
        auxMinutes = e >= s ? (e - s) : (e + 1440 - s)
      } else {
        auxMinutes = Math.round(Number(r.aux_hours || 0) * 60)
      }
      const info = (deviceMap as any)[String(r.device_no || '')] || {}
      const maxm = typeof info.max_aux_minutes === 'number' ? info.max_aux_minutes : undefined
      const effectiveAuxMinutes = typeof maxm === 'number' && auxMinutes > maxm ? maxm : auxMinutes
      const procMinutes = Math.round(Number(r.proc_hours || 0) * 60)
      
      const operatorInfo = userMap[r.operator || ''] || {}
      const aux_coeff = Number(operatorInfo.aux_coeff ?? 1)
      const proc_coeff = Number(operatorInfo.proc_coeff ?? 1)
      const capability_coeff = Number(operatorInfo.capability_coeff ?? 1)
      
      // 统计总工时 = (辅助工时*辅系数 + 程序时长*加系数) * 能力系数
      const statMinutes = (effectiveAuxMinutes * aux_coeff + procMinutes * proc_coeff) * capability_coeff
      
      // 使用操作者、班次、日期作为唯一键
      const key = `${r.operator}-${r.shift}-${r.work_date}`;
      if (!sumMap[key]) {
        sumMap[key] = { statHours: 0, auxHours: 0, procHours: 0 };
      }
      sumMap[key].statHours += statMinutes;
      sumMap[key].auxHours += effectiveAuxMinutes;
      sumMap[key].procHours += procMinutes;
    });
    
    return sumMap;
  }, [items, deviceMap, userMap]);

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

  // 使用useMemo缓存子表格列配置，避免每次渲染都重新创建
  const childColumns = React.useMemo(() => [
    { title: '班次日期', dataIndex: 'shift_date', align: 'center' },
    { title: '班次', dataIndex: 'shift', align: 'center' },
    { title: '日统计', key: 'daily_stat_hours', render: (_: any, r: any) => {
      // 使用操作者、班次、日期作为唯一键，查找对应的统计工时之和
      const key = `${r.operator}-${r.shift}-${r.work_date}`;
      const sum = dailyHoursSum[key]?.statHours || 0;
      return (sum / 60).toFixed(2);
    }, width: 60, align: 'center' },
    { title: '日辅助', key: 'daily_aux_hours', render: (_: any, r: any) => {
      // 使用操作者、班次、日期作为唯一键，查找对应的辅助工时之和
      const key = `${r.operator}-${r.shift}-${r.work_date}`;
      const sum = dailyHoursSum[key]?.auxHours || 0;
      return (sum / 60).toFixed(2);
    }, width: 60, align: 'center' },
    { title: '日程序', key: 'daily_proc_hours', render: (_: any, r: any) => {
      // 使用操作者、班次、日期作为唯一键，查找对应的程序工时之和
      const key = `${r.operator}-${r.shift}-${r.work_date}`;
      const sum = dailyHoursSum[key]?.procHours || 0;
      return (sum / 60).toFixed(2);
    }, width: 60, align: 'center' },
    { title: '开动', key: 'running_count', render: (_: any, r: any) => {
      // 统计同一日期、同一班次内开动的不同设备数量
      return getRunningDevicesCount(r.work_date, r.shift, items);
    }, width: 50, align: 'center' },
    { title: '盘存编号', dataIndex: 'part_inventory_number', align: 'center' },
    { title: '图号', dataIndex: 'part_drawing_number', align: 'center' },
    { title: '零件名称', key: 'part_name', render: (_: any, r: any) => {
      const inv = String(r.part_inventory_number || '')
      const draw = String(r.part_drawing_number || '')
      // 通过最近加载的父级数据中可能的扩展字段或后续补齐映射（未来可优化为后端返回）
      return (inv && (partNameMap as any)?.[inv]) || (draw && (partNameMap as any)?.[draw]) || '-' 
    }, align: 'center' },
    { title: '工序', dataIndex: 'process_name', align: 'center' },
    { title: '设备编号', key: 'device', render: (_: any, r: any) => {
      const no = String(r.device_no || '')
      const info = (deviceMap as any)[no] || {}
      const name = info.name || ''
      return no ? `${no}${name ? '-' + name : ''}` : '-' 
    }, width: 80, align: 'center' },
    { title: '辅助时间', key: 'work_date_aux', render: (_: any, r: any) => {
      const workDate = r.work_date ? r.work_date.slice(5) : '-'
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
      return `${workDate}\n${auxTime}`
    }, width: 180, align: 'center' },
    { title: '辅助', dataIndex: 'aux_hours', render: (_: any, r: any) => {
      const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
      const s = toMin(r.aux_start_time)
      const e = toMin(r.aux_end_time)
      let mins = 0
      if (r.aux_start_time && r.aux_end_time) {
        mins = e >= s ? (e - s) : (e + 1440 - s)
      } else {
        mins = Math.round(Number(r.aux_hours||0)*60)
      }
      const info = (deviceMap as any)[String(r.device_no || '')] || {}
      const maxm = typeof info.max_aux_minutes === 'number' ? info.max_aux_minutes : undefined
      const eff = typeof maxm === 'number' && mins > maxm ? maxm : mins
      return String(eff)
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
      const info = (deviceMap as any)[String(r.device_no || '')] || {}
      const maxm = typeof info.max_aux_minutes === 'number' ? info.max_aux_minutes : undefined
      const auxHours = typeof maxm === 'number' && auxMinutes > maxm ? maxm : auxMinutes
      const procMinutes = Math.round(Number(r.proc_hours || 0) * 60)
      
      const operatorInfo = userMap[r.operator || ''] || {}
      const aux_coeff = Number(operatorInfo.aux_coeff ?? 1)
      const proc_coeff = Number(operatorInfo.proc_coeff ?? 1)
      const capability_coeff = Number(operatorInfo.capability_coeff ?? 1)
      
      // 统计总工时 = (辅助工时*辅系数 + 程序时长*加系数) * 能力系数
      const statMinutes = (auxHours * aux_coeff + procMinutes * proc_coeff) * capability_coeff
      // 保留0位小数
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
  ], [partNameMap, deviceMap, userMap, items, dailyHoursSum])

  // 使用useMemo缓存父表格列配置，避免每次渲染都重新创建
  const parentColumns = React.useMemo(() => [
    { title: '操作者', dataIndex: 'operator', align: 'center' },
    { title: '车间', dataIndex: 'workshop', align: 'center' },
    { title: '班组', dataIndex: 'team', align: 'center' },
    { title: '辅助总时长(小时)', dataIndex: 'aux_total', render: (v: number) => Number(v||0).toFixed(2), align: 'center' },
    { title: '辅助均时长(小时)', dataIndex: 'avg_aux', render: (v: number) => Number(v||0).toFixed(2), align: 'center' },
    { title: '程序总时长(小时)', dataIndex: 'proc_total', render: (v: number) => Number(v||0).toFixed(2), align: 'center' },
    { title: '程序均时长(小时)', dataIndex: 'avg_proc', render: (v: number) => Number(v||0).toFixed(2), align: 'center' },
    { title: '统计总时长(小时)', dataIndex: 'hours_total', render: (v: number) => Number(v||0).toFixed(2), align: 'center' },
    { title: '统计均时长(小时)', dataIndex: 'avg_stat', render: (v: number) => Number(v||0).toFixed(2), align: 'center' },
    { title: '上班天数', dataIndex: 'work_days', align: 'center' },
    { title: '平均开动设备', dataIndex: 'average_running', render: (v: number) => Number(v||0).toFixed(2), align: 'center' },
    { title: '辅/加/能力系数', key: 'coeffs', render: (_: any, r: any) => {
      const a = Number(r.aux_coeff || 1).toFixed(2)
      const p = Number(r.proc_coeff || 1).toFixed(2)
      const c = Number(r.capability_coeff || 1).toFixed(2)
      return `${a}/${p}/${c}`
    }, width: 140, align: 'center' }
  ], [])

  const groupedData = React.useMemo(() => {
    const map: Record<string, any> = {}
    for (const r of items) {
      const key = r.operator || '未填'
      if (!map[key]) {
        const info = userMap[key] || {}
        map[key] = { 
          operator: key, 
          workshop: info.workshop || '-', 
          team: info.team || '-', 
          aux_total: 0, 
          proc_total: 0, 
          days_total: 0, 
          work_days: 0, 
          running_total: 0, 
          rows: [], 
          // 使用普通对象替代Set，避免React内部处理时的序列化问题
          _dayset: {}, // 使用对象模拟Set: { 'date-shift': true }
          aux_coeff: Number(info.aux_coeff ?? 1), 
          proc_coeff: Number(info.proc_coeff ?? 1), 
          capability_coeff: Number(info.capability_coeff ?? 1), 
          // 使用普通对象替代Map，避免React内部处理时的序列化问题
          _device_shifts: {} // 使用对象模拟Map: { 'date-shift': { 'device_no': true } }
        }
      }
      map[key].rows.push(r)
      const toMin = (t: string) => { const [h,m] = String(t||'').split(':').map((x)=>Number(x||0)); return h*60+m }
      let auxMinutes = 0
      if (r.aux_start_time && r.aux_end_time) {
        const s = toMin(r.aux_start_time)
        const e = toMin(r.aux_end_time)
        auxMinutes = e >= s ? (e - s) : (e + 1440 - s)
      } else {
        auxMinutes = Math.round(Number(r.aux_hours || 0) * 60)
      }
      const info = (deviceMap as any)[String(r.device_no || '')] || {}
      const maxm = typeof info.max_aux_minutes === 'number' ? info.max_aux_minutes : undefined
      const effMinutes = typeof maxm === 'number' && auxMinutes > maxm ? maxm : auxMinutes
      const auxH = effMinutes / 60
      map[key].aux_total += auxH
      // 先将程序时长转换为分钟，累加后再转换为小时，避免浮点数精度误差
      const procMinutes = Math.round(Number(r.proc_hours || 0) * 60)
      map[key].proc_total += procMinutes
      
      // 统计开动设备：使用对象模拟Map和Set
      if (procMinutes > 0) {
        const dateShiftKey = `${r.work_date}-${r.shift || ''}`
        if (!map[key]._device_shifts[dateShiftKey]) {
          map[key]._device_shifts[dateShiftKey] = {}
        }
        map[key]._device_shifts[dateShiftKey][r.device_no || ''] = true
      }
      
      // 使用对象模拟Set
      map[key]._dayset[`${r.work_date}-${r.shift || ''}`] = true
    }
    return Object.values(map).map((g: any) => {
      // 将总分钟数转换为小时，保留2位小数
      g.proc_total = Number((g.proc_total / 60).toFixed(2))
      // 辅助总工时也保留2位小数
      g.aux_total = Number(g.aux_total.toFixed(2))
      // 统计总工时 = (辅助总工时*辅系数 + 程序总时长*加系数) * 能力系数，保留2位小数
      const hours_total = Number(((g.aux_total * g.aux_coeff + g.proc_total * g.proc_coeff) * g.capability_coeff).toFixed(2))
      g.hours_total = hours_total
      // 使用Object.keys获取对象长度，替代Set.size
      g.work_days = Object.keys(g._dayset).length
      
      // 计算开动设备总和：使用Object.keys获取对象长度，替代Map.values()和Set.size
      let runningTotal = 0
      for (const dateShiftKey in g._device_shifts) {
        if (g._device_shifts.hasOwnProperty(dateShiftKey)) {
          runningTotal += Object.keys(g._device_shifts[dateShiftKey]).length
        }
      }
      g.running_total = runningTotal
      
      // 计算平均开动设备：每天每个班次开动的数量总和除以上班天数，保留2位小数
      g.average_running = g.work_days > 0 ? Number((runningTotal / g.work_days).toFixed(2)) : 0
      
      // 计算日均辅助、日均程序、日均统计
      g.avg_aux = g.work_days > 0 ? Number((g.aux_total / g.work_days).toFixed(2)) : 0
      g.avg_proc = g.work_days > 0 ? Number((g.proc_total / g.work_days).toFixed(2)) : 0
      g.avg_stat = g.work_days > 0 ? Number((g.hours_total / g.work_days).toFixed(2)) : 0
      
      // 移除临时属性，确保返回的对象是纯数据对象
      delete g._dayset
      delete g._device_shifts
      
      // 创建一个新的纯数据对象，确保没有原型链污染和循环引用
      return {
        operator: g.operator,
        workshop: g.workshop,
        team: g.team,
        aux_total: g.aux_total,
        proc_total: g.proc_total,
        hours_total: g.hours_total,
        avg_aux: g.avg_aux,
        avg_proc: g.avg_proc,
        avg_stat: g.avg_stat,
        days_total: g.days_total,
        work_days: g.work_days,
        running_total: g.running_total,
        average_running: g.average_running,
        rows: g.rows,
        aux_coeff: g.aux_coeff,
        proc_coeff: g.proc_coeff,
        capability_coeff: g.capability_coeff
      }
    })
  }, [items, userMap, deviceMap])

  // 对分组后的数据进行车间和班组筛选
  const filteredGroupedData = React.useMemo(() => {
    let result = groupedData
    
    // 车间筛选
    if (workshop) {
      result = result.filter(item => item.workshop === workshop)
    }
    
    // 班组筛选
    if (team) {
      result = result.filter(item => item.team === team)
    }
    
    return result
  }, [groupedData, workshop, team])

  // 计算筛选数据的汇总值
  const summaryData = React.useMemo(() => {
    // 计算总和
    const totalAux = filteredGroupedData.reduce((sum, item) => sum + (Number(item.aux_total) || 0), 0)
    const totalProc = filteredGroupedData.reduce((sum, item) => sum + (Number(item.proc_total) || 0), 0)
    const totalStat = filteredGroupedData.reduce((sum, item) => sum + (Number(item.hours_total) || 0), 0)
    
    // 计算平均值（先计算总和，再除以数量）
    const avgAux = filteredGroupedData.length > 0 ? totalAux / filteredGroupedData.length : 0
    const avgProc = filteredGroupedData.length > 0 ? totalProc / filteredGroupedData.length : 0
    const avgStat = filteredGroupedData.length > 0 ? totalStat / filteredGroupedData.length : 0
    
    return {
      totalAux: Number(totalAux.toFixed(2)),
      avgAux: Number(avgAux.toFixed(2)),
      totalProc: Number(totalProc.toFixed(2)),
      avgProc: Number(avgProc.toFixed(2)),
      totalStat: Number(totalStat.toFixed(2)),
      avgStat: Number(avgStat.toFixed(2))
    }
  }, [filteredGroupedData])

  // 从groupedData中获取唯一的车间列表
  const uniqueWorkshops = React.useMemo(() => {
    const workshops = Array.from(new Set(groupedData.map(item => item.workshop || '-')))
    return workshops.filter(w => w !== '-')
  }, [groupedData])

  // 获取唯一的班组列表
  const uniqueTeams = React.useMemo(() => {
    const teams = Array.from(new Set(groupedData.map(item => item.team || '-')))
    return teams.filter(t => t !== '-')
  }, [groupedData])

  // 导出工时数据到Excel
  const exportWorkHoursExcel = () => {
    try {
      // 创建一个工作簿
      const workbook = XLSX.utils.book_new();
      
      // 处理父级数据
      const parentData: any[] = [];
      
      // 遍历分组数据
      filteredGroupedData.forEach((group: any) => {
        // 添加父级数据行
        parentData.push({
          '操作者': group.operator,
          '车间': group.workshop || '-',
          '班组': group.team || '-',
          '辅助总时长': `${group.aux_total}小时`,
          '辅助均时长': `${group.avg_aux}小时`,
          '程序总时长': `${group.proc_total}小时`,
          '程序均时长': `${group.avg_proc}小时`,
          '统计总时长': `${group.hours_total}小时`,
          '统计均时长': `${group.avg_stat}小时`,
          '上班天数': group.work_days,
          '平均开动设备': group.average_running,
          '辅/加能力系数': `${group.aux_coeff}/${group.proc_coeff}/${group.capability_coeff}`
        });
      });
      
      // 创建父级汇总工作表
      const parentWorksheet = XLSX.utils.json_to_sheet(parentData);
      
      // 调整父级工作表列宽
      const parentColumnWidths = [
        { wch: 10 },  // 操作者
        { wch: 8 },   // 车间
        { wch: 8 },   // 班组
        { wch: 12 },  // 辅助总时长
        { wch: 12 },  // 辅助均时长
        { wch: 12 },  // 程序总时长
        { wch: 12 },  // 程序均时长
        { wch: 12 },  // 统计总时长
        { wch: 12 },  // 统计均时长
        { wch: 10 },  // 上班天数
        { wch: 12 },  // 平均开动设备
        { wch: 15 }   // 辅/加能力系数
      ];
      parentWorksheet['!cols'] = parentColumnWidths;
      
      // 先将父表添加到工作簿，确保它是第一个工作表
      XLSX.utils.book_append_sheet(workbook, parentWorksheet, '父级汇总');
      
      // 为每个操作者创建独立的子表
      filteredGroupedData.forEach((group: any, index: number) => {
        if (group.rows && group.rows.length > 0) {
          // 处理当前操作者的子级数据
          const currentChildData: any[] = [];
          
          group.rows.forEach((row: any) => {
            // 获取设备名称
            const deviceInfo = deviceMap[String(row.device_no || '')] || { name: '' };
            const deviceFullName = row.device_no ? `${row.device_no}${deviceInfo.name ? '-' + deviceInfo.name : ''}` : '-';
            
            // 格式化辅助时间
            const toMin = (t: string) => {
              const [h, m] = String(t || '').split(':').map((x) => Number(x || 0));
              return h * 60 + m;
            };
            
            let auxTimeDisplay = '-';
            if (row.aux_start_time && row.aux_end_time) {
              const fmt = (t: string) => {
                const s = String(t || '');
                if (!s) return '-';
                return s.length >= 5 ? s.slice(0, 5) : s;
              };
              const s = toMin(row.aux_start_time);
              const e = toMin(row.aux_end_time);
              const mins = e >= s ? (e - s) : (e + 1440 - s);
              auxTimeDisplay = `${fmt(row.aux_start_time)}--${fmt(row.aux_end_time)} (${mins})`;
            }
            
            // 计算辅助工时（分钟）
            let auxMinutes = 0;
            if (row.aux_start_time && row.aux_end_time) {
              const s = toMin(row.aux_start_time);
              const e = toMin(row.aux_end_time);
              auxMinutes = e >= s ? (e - s) : (e + 1440 - s);
            } else {
              auxMinutes = Math.round(Number(row.aux_hours || 0) * 60);
            }
            
            // 应用设备最大辅助时间限制，与表格显示保持一致
            const info = deviceMap[String(row.device_no || '')] || { name: '', max_aux_minutes: undefined };
            const maxm = typeof info.max_aux_minutes === 'number' ? info.max_aux_minutes : undefined;
            const effMinutes = typeof maxm === 'number' && auxMinutes > maxm ? maxm : auxMinutes;
            
            // 获取零件名称
            const invNo = row.part_inventory_number;
            const drawNo = row.part_drawing_number;
            const partNameDisplay = invNo ? partNameMap[invNo] : (drawNo ? partNameMap[drawNo] : '');
            
            // 计算日统计、日辅助、日程序（小时）
            const dailyKey = `${group.operator}-${row.shift}-${row.work_date}`;
            const dailySum = dailyHoursSum[dailyKey] || { statHours: 0, auxHours: 0, procHours: 0 };
            const dailyStat = (dailySum.statHours / 60).toFixed(2);
            const dailyAux = (dailySum.auxHours / 60).toFixed(2);
            const dailyProc = (dailySum.procHours / 60).toFixed(2);
            
            // 计算辅助、程序、统计（分钟）
            const procMinutes = Math.round(Number(row.proc_hours || 0) * 60);
            
            const operatorInfo = userMap[group.operator || ''] || {};
            const aux_coeff = Number(operatorInfo.aux_coeff ?? 1);
            const proc_coeff = Number(operatorInfo.proc_coeff ?? 1);
            const capability_coeff = Number(operatorInfo.capability_coeff ?? 1);
            
            const auxHours = typeof maxm === 'number' && auxMinutes > maxm ? maxm : auxMinutes;
            const statMinutes = Math.round((auxHours * aux_coeff + procMinutes * proc_coeff) * capability_coeff);
            
            // 计算完成时间
            let completedTime = '-';
            if (row.aux_start_time && row.aux_end_time) {
              const workDate = dayjs(row.work_date || undefined);
              if (workDate.isValid()) {
                const auxStartTime = dayjs(`${row.work_date} ${row.aux_start_time}`);
                const auxEndTime = dayjs(`${row.work_date} ${row.aux_end_time}`);
                const actualAuxEndTime = auxEndTime.isBefore(auxStartTime) 
                  ? auxEndTime.add(1, 'day') 
                  : auxEndTime;
                const procHours = Number(row.proc_hours || 0);
                const completed = actualAuxEndTime.add(procHours, 'hour');
                completedTime = completed.format('MM-DD HH:mm');
              }
            }
            
            // 统计同一日期、同一班次内开动的不同设备数量
            const runningCount = getRunningDevicesCount(row.work_date, row.shift, items);
            
            currentChildData.push({
              '班次日期': row.shift_date || '-',
              '班次': row.shift,
              '日统计': `${dailyStat}小时`,
              '日辅助': `${dailyAux}小时`,
              '日程序': `${dailyProc}小时`,
              '开动': runningCount,
              '盘存编号': row.part_inventory_number || '-',
              '图号': row.part_drawing_number || '-',
              '零件名称': partNameDisplay || '-',
              '工序': row.process_name || '-',
              '设备编号': deviceFullName,
              '辅助时间': `${row.work_date ? row.work_date.slice(5) : '-'}${auxTimeDisplay ? `\n${auxTimeDisplay}` : ''}`,
              '辅助': `${effMinutes}分钟`,
              '程序': `${procMinutes}分钟`,
              '统计': `${statMinutes}分钟`,
              '完成时间': completedTime,
              '加工数量': row.completed_quantity
            });
          });
          
          // 准备子表数据，添加返回按钮
          if (currentChildData.length > 0) {
            // 获取表头
            const headers = Object.keys(currentChildData[0]);
            
            // 创建返回按钮行（合并单元格）
            const backButtonRow = headers.map(() => ''); // 初始化空行
            backButtonRow[0] = '返回父表'; // 第一列显示返回父表
            
            // 创建表头行
            const headerRow = headers;
            
            // 创建数据行
            const dataRows = currentChildData.map(item => headers.map(key => item[key]));
            
            // 组合所有行：返回按钮行 + 表头行 + 数据行
            const combinedAoa = [backButtonRow, headerRow, ...dataRows];
            
            // 创建工作表
            const childWorksheet = XLSX.utils.aoa_to_sheet(combinedAoa);
            
            // 合并返回按钮所在的单元格（第一行从A到最后一列）
            const numColumns = headers.length;
            const lastColumnIndex = numColumns - 1;
            childWorksheet['!merges'] = [
              { s: { r: 0, c: 0 }, e: { r: 0, c: lastColumnIndex } } // 合并第一行的所有列
            ];
            
            // 设置返回按钮的超链接（指向父表A1单元格）
            const backButtonCell = childWorksheet['A1'];
            if (backButtonCell) {
              backButtonCell.l = {
                Target: '#父级汇总!A1',
                Tooltip: '返回父级汇总表',
                Display: '返回父表'
              };
              
              // 设置返回按钮样式
              backButtonCell.s = {
                font: {
                  color: { rgb: '0000FF' },
                  underline: 1
                },
                alignment: {
                  horizontal: 'center',
                  vertical: 'center'
                }
              };
            }
            
            // 调整子级工作表列宽
            const childColumnWidths = [
              { wch: 12 },  // 班次日期
              { wch: 8 },   // 班次
              { wch: 8 },   // 日统计
              { wch: 8 },   // 日辅助
              { wch: 8 },   // 日程序
              { wch: 6 },   // 开动
              { wch: 15 },  // 盘存编号
              { wch: 15 },  // 图号
              { wch: 20 },  // 零件名称
              { wch: 15 },  // 工序
              { wch: 15 },  // 设备编号
              { wch: 30 },  // 辅助时间
              { wch: 8 },   // 辅助
              { wch: 8 },   // 程序
              { wch: 8 },   // 统计
              { wch: 12 },  // 完成时间
              { wch: 10 }   // 加工数量
            ];
            childWorksheet['!cols'] = childColumnWidths;
            
            // 设置表头样式
            for (let c = 0; c < numColumns; c++) {
              const colLetter = XLSX.utils.encode_col(c);
              const headerCell = childWorksheet[`${colLetter}2`];
              if (headerCell) {
                headerCell.s = {
                  font: {
                    bold: true
                  },
                  alignment: {
                    horizontal: 'center'
                  },
                  fill: {
                    fgColor: { rgb: 'DDDDDD' }
                  },
                  border: {
                    top: { style: 'thin' },
                    bottom: { style: 'thin' },
                    left: { style: 'thin' },
                    right: { style: 'thin' }
                  }
                };
              }
            }
            
            // 子表名称：操作者名称
            const childSheetName = group.operator;
            
            // 添加子表到工作簿
            XLSX.utils.book_append_sheet(workbook, childWorksheet, childSheetName);
            
            // 更新父表中的超链接，指向对应的子表（现在数据从第3行开始）
            const parentRow = index + 2; // 父表标题行是第1行，数据从第2行开始
            const cellAddress = XLSX.utils.encode_cell({ r: parentRow - 1, c: 0 }); // A列，操作者列
            
            // 设置超链接 - 使用Excel标准的内部链接格式
            if (parentWorksheet[cellAddress]) {
              parentWorksheet[cellAddress].l = {
                Target: `#${childSheetName}!A3`, // 跳转到子表的第3行（数据开始行）
                Tooltip: `跳转到${group.operator}的明细数据`,
                Display: group.operator
              };
              
              // 设置单元格样式为蓝色下划线，模拟超链接样式
              parentWorksheet[cellAddress].s = {
                font: {
                  color: { rgb: '0000FF' },
                  underline: 1
                }
              };
            }
          }
        }
      });
      
      // 生成Excel文件名称
      const fileName = `工时数据_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`;
      
      // 导出Excel文件
      XLSX.writeFile(workbook, fileName);
      
      // 显示成功提示
      message.success('工时数据导出成功');
    } catch (error) {
      console.error('导出Excel失败:', error);
      message.error('导出Excel失败，请重试');
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-3">
          <Title level={2} className="mb-0"><ExperimentOutlined className="text-3xl text-purple-500 mb-2 mr-2" /> 工时管理</Title>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
            <Button icon={<LeftOutlined />} onClick={() => window.history.back()}>返回</Button>
          </Space>
        </div>
      <Card styles={{ body: { padding: 12 } }}>
        {/* 筛选条件 */}
        <div className="mb-4">
          <Row gutter={[16, 8]} align="middle">
            <Col span={6}>
              <div className="flex items-center gap-2">
                <span style={{ width: 65, textAlign: 'right', whiteSpace: 'nowrap' }}>日期范围：</span>
                <RangePicker style={{ flex: 1 }} value={range} onChange={(v) => setRange(v)} />
              </div>
            </Col>
            <Col span={4}>
              <div className="flex items-center gap-2">
                <span style={{ width: 50, textAlign: 'right', whiteSpace: 'nowrap' }}>年月：</span>
                <DatePicker
                  style={{ flex: 1 }}
                  value={yearMonth}
                  onChange={(v) => setYearMonth(v)}
                  picker="month"
                  placeholder="请选择年月"
                  allowClear

                  format="YYYY年MM月"
                />
              </div>
            </Col>
            <Col span={4}>
              <div className="flex items-center gap-2">
                <span style={{ width: 50, textAlign: 'right', whiteSpace: 'nowrap' }}>操作者：</span>
                <Select
                  placeholder="请选择"
                  style={{ flex: 1 }}
                  value={operator}
                  onChange={(value) => setOperator(value)}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  filterOption={(input, option) =>
                    (option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={[
                    ...uniqueOperators.map(op => ({ value: op, label: op }))
                  ]}
                />
              </div>
            </Col>
            <Col span={4}>
              <div className="flex items-center gap-2">
                <span style={{ width: 50, textAlign: 'right', whiteSpace: 'nowrap' }}>车间：</span>
                <Select
                  placeholder="请选择"
                  style={{ flex: 1 }}
                  value={workshop}
                  onChange={(value) => setWorkshop(value)}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  filterOption={(input, option) =>
                    (option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={[
                    ...uniqueWorkshops.map(w => ({ value: w, label: w }))
                  ]}
                />
              </div>
            </Col>
            <Col span={4}>
              <div className="flex items-center gap-2">
                <span style={{ width: 50, textAlign: 'right', whiteSpace: 'nowrap' }}>班组：</span>
                <Select
                  placeholder="请选择"
                  style={{ flex: 1 }}
                  value={team}
                  onChange={(value) => setTeam(value)}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  filterOption={(input, option) =>
                    (option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={[
                    ...uniqueTeams.map(t => ({ value: t, label: t }))
                  ]}
                />
              </div>
            </Col>
            <Col span={4}>
              <div className="flex items-center gap-2">
                <span style={{ width: 50, textAlign: 'right', whiteSpace: 'nowrap' }}>班次：</span>
                <Select
                  placeholder="请选择"
                  style={{ flex: 1 }}
                  value={shift}
                  onChange={(value) => setShift(value)}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  filterOption={(input, option) =>
                    (option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={[
                    ...uniqueShifts.map(s => ({ value: s, label: s }))
                  ]}
                />
              </div>
            </Col>
            <Col span={4}>
              <div className="flex items-center gap-2">
                <span style={{ width: 65, textAlign: 'right', whiteSpace: 'nowrap' }}>设备编号：</span>
                <Select
                  placeholder="请选择"
                  style={{ flex: 1 }}
                  value={deviceNo}
                  onChange={(value) => setDeviceNo(value)}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  filterOption={(input, option) =>
                    (option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={[
                    ...uniqueDeviceNos.map(d => ({ value: d, label: d }))
                  ]}
                />
              </div>
            </Col>
            <Col span={4}>
              <div className="flex items-center gap-2">
                <span style={{ width: 65, textAlign: 'right', whiteSpace: 'nowrap' }}>盘存编号：</span>
                <Select
                  placeholder="请选择"
                  style={{ flex: 1 }}
                  value={partInventoryNo}
                  onChange={(value) => setPartInventoryNo(value)}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  filterOption={(input, option) =>
                    (option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={[
                    ...uniquePartInventoryNos.map(p => ({ value: p, label: p }))
                  ]}
                />
              </div>
            </Col>
            <Col span={4}>
              <div className="flex items-center gap-2">
                <span style={{ width: 65, textAlign: 'right', whiteSpace: 'nowrap' }}>图号：</span>
                <Select
                  placeholder="请选择"
                  style={{ flex: 1 }}
                  value={partDrawingNo}
                  onChange={(value) => setPartDrawingNo(value)}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  filterOption={(input, option) =>
                    (option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={[
                    ...uniquePartDrawingNos.map(p => ({ value: p, label: p }))
                  ]}
                />
              </div>
            </Col>
            <Col span={4}>
              <div className="flex items-center gap-2">
                <span style={{ width: 65, textAlign: 'right', whiteSpace: 'nowrap' }}>零件名称：</span>
                <Select
                  placeholder="请选择"
                  style={{ flex: 1 }}
                  value={partName}
                  onChange={(value) => setPartName(value)}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  filterOption={(input, option) =>
                    (option?.label || '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={[
                    ...uniquePartNames.map(p => ({ value: p, label: p }))
                  ]}
                />
              </div>
            </Col>
          </Row>
        </div>
        
        {/* 操作按钮 */}
        <div className="mb-2 flex items-center gap-2">
          <Button onClick={() => setExpandedRowKeys(groupedData.map((g: any) => g.operator))}>▾ 展开全部</Button>
          <Button onClick={() => setExpandedRowKeys([])}>▸ 折叠全部</Button>
          <Button danger disabled={!selectedKeys.length} onClick={async () => {
            try {
              const ids = (selectedKeys as any[]).map(String)
              const hide = (message as any).loading('删除中...', 0)
              const resp = await fetch('/api/tooling/work-hours/batch-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) })
              if (!resp.ok) {
                throw new Error(`API请求失败: ${resp.status} ${resp.statusText}`)
              }
              const json = await resp.json()
              hide()
              if (json?.success) {
                message.success(`删除成功(${json.deleted || ids.length})`)
                setSelectedKeys([])
                fetchData()
              } else {
                message.error(json?.error || '删除失败')
              }
            } catch (e: any) {
              message.error(e?.message || '删除失败')
            }
          }}>批量删除</Button>
          <Button type="primary" onClick={exportWorkHoursExcel}>导出工时</Button>
        </div>

        {/* 汇总行 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 24 }}>
            <div>
              <span style={{ fontWeight: 600, marginRight: 8 }}>辅助总时长(小时):</span>
              <span>{summaryData.totalAux.toFixed(2)}</span>
            </div>
            <div>
              <span style={{ fontWeight: 600, marginRight: 8 }}>辅助均时长(小时):</span>
              <span>{summaryData.avgAux.toFixed(2)}</span>
            </div>
            <div>
              <span style={{ fontWeight: 600, marginRight: 8 }}>程序总时长(小时):</span>
              <span>{summaryData.totalProc.toFixed(2)}</span>
            </div>
            <div>
              <span style={{ fontWeight: 600, marginRight: 8 }}>程序均时长(小时):</span>
              <span>{summaryData.avgProc.toFixed(2)}</span>
            </div>
            <div>
              <span style={{ fontWeight: 600, marginRight: 8 }}>统计总时长(小时):</span>
              <span>{summaryData.totalStat.toFixed(2)}</span>
            </div>
            <div>
              <span style={{ fontWeight: 600, marginRight: 8 }}>统计均时长(小时):</span>
              <span>{summaryData.avgStat.toFixed(2)}</span>
            </div>
          </div>
        </div>
        
        <Table
          rowKey={(r) => r.operator}
          loading={loading}
          columns={parentColumns as any}
          dataSource={filteredGroupedData}
          pagination={false}
          scroll={{ x: 'max-content' }}
          expandable={{
            childrenColumnName: '_nochildren',
            expandedRowKeys,
            onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as React.Key[]),
            expandedRowRender: (record: any) => {
              // 为当前子表格数据计算rowSpan配置
              const rowSpanConfig = getRowSpanConfig(record.rows);
              
              // 动态生成包含rowSpan的列配置
              const columnsWithRowSpan = childColumns.map(col => {
                // 需要合并的列
                const mergeColumns = ['shift_date', 'shift', 'daily_stat_hours', 'daily_aux_hours', 'daily_proc_hours', 'running_count'];
                const shouldMerge = mergeColumns.includes(col.dataIndex || col.key);
                
                if (shouldMerge) {
                  return {
                    ...col,
                    onCell: (record: any, index: number) => {
                      const config = rowSpanConfig[index];
                      return {
                        rowSpan: config.rowSpan
                      };
                    }
                  };
                }
                return col;
              });
              
              return (
                <Table
                  rowKey="id"
                  columns={columnsWithRowSpan as any}
                  dataSource={record.rows}
                  pagination={false}
                  size="small"
                  scroll={{ x: 'max-content' }}
                  rowSelection={{
                    selectedRowKeys: selectedKeys,
                    onChange: (keys) => setSelectedKeys(keys as React.Key[])
                  }}
                />
              );
            }
          }}
        />
      </Card>
    </div>
  )
}

export default WorkHoursManagement
