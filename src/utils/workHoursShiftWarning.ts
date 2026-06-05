export type ShiftLikeRecord = {
  id?: string | number
  operator?: string
  shift?: string
  shift_date?: string
  work_date?: string
  aux_start_time?: string | null
  aux_end_time?: string | null
  proc_hours?: number | string | null
  created_at?: string
}

type ShiftWarningOptions = {
  previousRow?: ShiftLikeRecord | null
  sameShiftDateRows?: ShiftLikeRecord[]
  includeSoftTimeHeuristics?: boolean
}

const DAY_SHIFT = '白班'
const NIGHT_SHIFT = '夜班'
const DAY_SHIFT_START_MINUTES = 8 * 60
const NIGHT_SHIFT_START_MINUTES = 20 * 60

export const parseClockMinutes = (value: string | null | undefined) => {
  const text = String(value || '').trim()
  if (!text) return null
  const [hour, minute] = text.split(':').map((part) => Number(part || 0))
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

const oppositeShift = (shift: string) => {
  if (shift === DAY_SHIFT) return NIGHT_SHIFT
  if (shift === NIGHT_SHIFT) return DAY_SHIFT
  return ''
}

const formatDateText = (value: string | null | undefined) => {
  const text = String(value || '').trim()
  return text || '-'
}

const formatTimeText = (value: string | null | undefined) => {
  const text = String(value || '').trim()
  return text ? text.slice(0, 5) : '-'
}

const pushUnique = (messages: string[], message: string) => {
  if (!message || messages.includes(message)) return
  messages.push(message)
}

export const getShiftWarningMessages = (
  record: ShiftLikeRecord,
  options: ShiftWarningOptions = {}
) => {
  const messages: string[] = []
  const shift = String(record.shift || '').trim()
  const shiftDate = formatDateText(record.shift_date)
  const workDate = formatDateText(record.work_date)
  const auxStartMinutes = parseClockMinutes(record.aux_start_time)
  const auxEndMinutes = parseClockMinutes(record.aux_end_time)
  const auxStartText = formatTimeText(record.aux_start_time)
  const opposite = oppositeShift(shift)
  const includeSoftTimeHeuristics = options.includeSoftTimeHeuristics !== false

  if (includeSoftTimeHeuristics && shift === DAY_SHIFT && auxStartMinutes !== null) {
    if (auxStartMinutes < DAY_SHIFT_START_MINUTES || auxStartMinutes >= NIGHT_SHIFT_START_MINUTES) {
      pushUnique(messages, `辅助开始时间 ${auxStartText} 更像夜班时间，请确认班次是否选反`)
    }
  }

  if (includeSoftTimeHeuristics && shift === NIGHT_SHIFT && auxStartMinutes !== null) {
    if (auxStartMinutes >= DAY_SHIFT_START_MINUTES && auxStartMinutes < NIGHT_SHIFT_START_MINUTES) {
      pushUnique(messages, `辅助开始时间 ${auxStartText} 更像白班时间，请确认班次是否选反`)
    }
  }

  if (shift === DAY_SHIFT && auxStartMinutes !== null && auxEndMinutes !== null && auxEndMinutes < auxStartMinutes) {
    pushUnique(messages, '白班记录出现跨天时间段，请确认班次是否应为夜班')
  }

  if (shift === DAY_SHIFT && shiftDate !== '-' && workDate !== '-' && shiftDate !== workDate) {
    pushUnique(messages, `白班通常应与班次日期同一天，当前班次日期 ${shiftDate} 与工时日期 ${workDate} 不一致`)
  }

  const sameShiftDateRows = Array.isArray(options.sameShiftDateRows) ? options.sameShiftDateRows : []
  if (opposite && sameShiftDateRows.some((row) => String(row.shift || '').trim() === opposite)) {
    pushUnique(messages, `同一班次日期 ${shiftDate} 已存在 ${opposite} 记录，请确认本次班次没有选反`)
  }

  const previousRow = options.previousRow
  if (previousRow) {
    const previousShift = String(previousRow.shift || '').trim()
    const previousShiftDate = formatDateText(previousRow.shift_date)
    if (previousShift && shift && previousShift !== shift && previousShiftDate === shiftDate) {
      pushUnique(messages, `最近一条同班次日期记录是 ${previousShiftDate} ${previousShift}，请确认本次 ${shift} 不是误选`)
    }
  }

  return messages
}
