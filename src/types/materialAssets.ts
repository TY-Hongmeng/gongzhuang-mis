export interface MaterialAssetItem {
  id: string
  name: string
  code: string
  model_spec: string
  certificate_no: string
  certificate_issue_date: string | null
  certificate_expire_date: string | null
  certificate_remind_days: number
  last_certificate_reminded_at: string | null
  certificate_status: '未维护' | '有效' | '临期' | '过期'
  certificate_remaining_days: number | null
  certificate_need_reminder: boolean
  responsible_person: string
  responsible_user_id: string
  pending_responsible_person: string
  pending_responsible_user_id: string
  responsibility_status: '待确认' | '已确认' | '待转移确认'
  asset_status: '在用' | '报废'
  scrap_status: '无' | '待报废' | '已报废'
  scrap_reason: string
  borrower_name: string
  borrower_user_id: string
  borrow_status: '无' | '借用中' | '待归还确认'
  borrow_note: string
  borrow_return_note: string
  borrowed_at: string | null
  return_requested_at: string | null
  returned_at: string | null
  remark: string
  created_by: string
  created_by_user_id: string
  created_at: string
  updated_at: string
  history_count?: number
}

export interface MaterialAssetHistoryItem {
  id: string
  asset_id: string
  action_type: string
  action_label: string
  operator_name: string
  operator_user_id: string
  target_name: string
  target_user_id: string
  remark: string
  detail_json?: Record<string, any>
  created_at: string
}

export interface MaterialAssetUserOption {
  id: string
  real_name: string
  status?: string
}
