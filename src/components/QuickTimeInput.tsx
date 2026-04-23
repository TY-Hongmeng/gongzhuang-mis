import React, { useState, useEffect, useRef } from 'react'
import { Input } from 'antd'
import dayjs, { Dayjs } from 'dayjs'

interface QuickTimeInputProps {
  value?: Dayjs | null
  onChange?: (value: Dayjs | null) => void
  placeholder?: string
  isEndTime?: boolean // 是否为结束时间输入框，如果是，则提供特定的快捷操作（+时长）
  startTime?: Dayjs | null // 如果是结束时间，传入开始时间以计算时长
  displayDate?: Dayjs | null
}

const QuickTimeInput: React.FC<QuickTimeInputProps> = ({ 
  value, 
  onChange, 
  placeholder = "HHmm", 
  isEndTime = false,
  startTime = null,
  displayDate = null
}) => {
  // 内部维护输入框显示的字符串，支持HHmm格式
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<any>(null)

  // 当外部 value 变化时，同步更新内部输入框
  useEffect(() => {
    if (value && dayjs(value).isValid()) {
      if (displayDate && dayjs(displayDate).isValid()) {
        const merged = dayjs(displayDate).hour(value.hour()).minute(value.minute()).second(0)
        setInputValue(merged.format('MM-DD HH:mm'))
      } else {
        setInputValue(value.format('HH:mm'))
      }
    } else {
      setInputValue('')
    }
  }, [value, displayDate])

  // 处理输入变化
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = String(e.target.value || '')
    let digits = raw.replace(/\D/g, '')
    if (digits.length > 4) {
      digits = digits.slice(-4)
    }
    if (digits.length >= 3) {
      setInputValue(`${digits.slice(0, 2)}:${digits.slice(2)}`)
      return
    }
    setInputValue(digits)
  }

  const handleFocus = () => {
    if (value && dayjs(value).isValid()) {
      setInputValue(value.format('HH:mm'))
    }
  }

  // 处理失去焦点：尝试格式化并触发 onChange
  const handleBlur = () => {
    let val = String(inputValue || '').replace(/\D/g, '')
    
    if (!val) {
      if (value) {
        onChange?.(null)
      }
      return
    }

    if (val.length > 4) {
      val = val.slice(-4)
    }

    // 补全逻辑
    if (val.length === 1) val = `0${val}00` // 8 -> 08:00
    else if (val.length === 2) val = `${val}00` // 08 -> 08:00, 14 -> 14:00
    else if (val.length === 3) val = `0${val}` // 830 -> 08:30

    // 校验 HHmm
    if (val.length === 4) {
      let hh = parseInt(val.slice(0, 2))
      const mm = parseInt(val.slice(2, 4))
      // 兼容 24xx 输入：自动归一到 00xx，避免失焦后被清空
      if (hh === 24 && mm >= 0 && mm <= 59) hh = 0
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
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        suffix={
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                {getDurationText()}
            </span>
        }
        inputMode="numeric" // 触发移动端数字键盘
        type="tel"
        allowClear
        onClear={() => {
            setInputValue('')
            onChange?.(null)
        }}
      />
    </div>
  )
}

export default QuickTimeInput
