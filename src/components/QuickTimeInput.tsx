import React, { useState, useEffect, useRef } from 'react'
import { Input, Button } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { ClockCircleOutlined } from '@ant-design/icons'

interface QuickTimeInputProps {
  value?: Dayjs | null
  onChange?: (value: Dayjs | null) => void
  placeholder?: string
  isEndTime?: boolean // 是否为结束时间输入框，如果是，则提供特定的快捷操作（+时长）
  startTime?: Dayjs | null // 如果是结束时间，传入开始时间以计算时长
}

const QuickTimeInput: React.FC<QuickTimeInputProps> = ({ 
  value, 
  onChange, 
  placeholder = "HHmm", 
  isEndTime = false,
  startTime = null
}) => {
  // 内部维护输入框显示的字符串，支持HHmm格式
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<any>(null)

  // 当外部 value 变化时，同步更新内部输入框
  useEffect(() => {
    if (value && dayjs(value).isValid()) {
      setInputValue(value.format('HH:mm'))
    } else {
      setInputValue('')
    }
  }, [value])

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value
    // 移除所有非数字和冒号
    val = val.replace(/[^\d:]/g, '')
    
    // 限制长度
    if (val.length > 5) return

    setInputValue(val)
  }

  // 处理失去焦点：尝试格式化并触发 onChange
  const handleBlur = () => {
    let val = inputValue.replace(':', '')
    
    if (!val) {
      if (value) {
        onChange?.(null)
      }
      return
    }

    // 补全逻辑
    if (val.length === 1) val = `0${val}00` // 8 -> 08:00
    else if (val.length === 2) val = `${val}00` // 08 -> 08:00, 14 -> 14:00
    else if (val.length === 3) val = `0${val}` // 830 -> 08:30

    // 校验 HHmm
    if (val.length === 4) {
      const hh = parseInt(val.slice(0, 2))
      const mm = parseInt(val.slice(2, 4))
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        const now = dayjs()
        const newTime = now.hour(hh).minute(mm).second(0)
        onChange?.(newTime)
        setInputValue(newTime.format('HH:mm'))
      } else {
        // 格式错误，重置或保持原样（这里选择重置为上次有效值）
        if (value) setInputValue(value.format('HH:mm'))
        else setInputValue('')
      }
    } else {
        // 长度不对，重置
        if (value) setInputValue(value.format('HH:mm'))
        else setInputValue('')
    }
  }

  // 快捷操作处理
  const setTime = (d: Dayjs) => {
    onChange?.(d)
    setInputValue(d.format('HH:mm'))
  }

  const addMinutes = (mins: number) => {
    // 如果已有值，基于现有值；否则基于当前时间（如果是结束时间且没有值，优先基于开始时间）
    let base = value
    if (!base) {
        if (isEndTime && startTime) base = startTime
        else base = dayjs()
    }
    const newTime = base.add(mins, 'minute')
    setTime(newTime)
  }

  // 快捷按钮组
  const renderShortcuts = () => {
    if (isEndTime) {
      return (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="small" onClick={() => setTime(dayjs())}>当前</Button>
          <Button size="small" onClick={() => addMinutes(15)}>+15分</Button>
          <Button size="small" onClick={() => addMinutes(30)}>+30分</Button>
          <Button size="small" onClick={() => addMinutes(60)}>+1小时</Button>
          <Button size="small" onClick={() => addMinutes(120)}>+2小时</Button>
        </div>
      )
    }

    // 开始时间快捷键
    return (
      <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size="small" onClick={() => setTime(dayjs())}>当前</Button>
        <Button size="small" onClick={() => {
          const t = dayjs().hour(8).minute(0).second(0)
          setTime(t)
        }}>08:00</Button>
        <Button size="small" onClick={() => {
          const t = dayjs().hour(13).minute(0).second(0)
          setTime(t)
        }}>13:00</Button>
        <Button size="small" onClick={() => {
          const t = dayjs().hour(19).minute(0).second(0)
          setTime(t)
        }}>19:00</Button>
      </div>
    )
  }

  // 计算时长显示（仅用于结束时间且已有开始时间）
  const getDurationText = () => {
    if (isEndTime && startTime && value) {
        const diff = value.diff(startTime, 'minute')
        if (diff < 0) return '跨天'
        const h = Math.floor(diff / 60)
        const m = diff % 60
        if (h > 0) return `${h}小时${m}分`
        return `${m}分钟`
    }
    return null
  }

  return (
    <div className="quick-time-input">
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        prefix={<ClockCircleOutlined style={{ color: '#bfbfbf' }} />}
        suffix={
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                {getDurationText()}
            </span>
        }
        inputMode="numeric" // 触发移动端数字键盘
        // type="tel" // tel 在某些浏览器可能更好唤起纯数字键盘，但 text 更通用
        allowClear
        onClear={() => {
            setInputValue('')
            onChange?.(null)
        }}
      />
      {renderShortcuts()}
    </div>
  )
}

export default QuickTimeInput
