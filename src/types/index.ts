// Base Types
export interface BaseEntity {
  id: string
  created_at?: string
  updated_at?: string
  created_by?: string
  updated_by?: string
}

// Material Types
export interface Material extends BaseEntity {
  name: string
  density: number // g/cm³
  unit: string
  price_per_unit?: number
  supplier?: string
  specifications?: string
}

// Tooling Information Module Types
export interface ToolingInfo extends BaseEntity {
  inventory_number?: string
  production_unit?: string
  category?: string
  received_date?: string
  demand_date?: string
  completed_date?: string
  project_name?: string
  status?: 'pending' | 'processing' | 'completed' | 'cancelled'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  production_date?: string
  sets_count?: number
  recorder?: string
  material_id?: string
  specifications?: Record<string, any>
  weight?: number
  total_price?: number
  notes?: string
}

// Part Items for Tooling
export interface PartItem extends BaseEntity {
  tooling_info_id: string
  part_name: string
  part_category: string
  material_id: string
  specifications: Record<string, any>
  weight: number
  unit_price: number
  total_price: number
  quantity: number
  notes?: string
}

// Child Items (Standard Parts)
export interface ChildItem extends BaseEntity {
  part_item_id: string
  standard_part_id: string
  quantity: number
  unit_price: number
  total_price: number
  notes?: string
  standard_part?: StandardPart
}

// Supplier Management
export interface Supplier extends BaseEntity {
  name: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  status: 'active' | 'inactive'
  rating?: number
  notes?: string
}

// Standard Parts Library
export interface StandardPart extends BaseEntity {
  part_number: string
  name: string
  category: string
  specifications: Record<string, any>
  material_id: string
  unit: string
  unit_price: number
  supplier_id?: string
  status: 'active' | 'inactive'
  notes?: string
}

// Processing Technology
export interface ProcessingTechnology extends BaseEntity {
  name: string
  code: string
  description?: string
  cost_per_hour: number
  equipment_type?: string
  parameters?: Record<string, any>
  status: 'active' | 'inactive'
}

// Purchase Management Types
export interface PurchaseOrder extends BaseEntity {
  order_number: string
  supplier_id: string
  order_date: string
  expected_date?: string
  actual_date?: string
  status: 'draft' | 'pending' | 'approved' | 'ordered' | 'partial' | 'completed' | 'cancelled'
  total_amount: number
  currency?: string
  payment_terms?: string
  notes?: string
  items?: PurchaseOrderItem[]
}

export interface PurchaseOrderItem extends BaseEntity {
  purchase_order_id: string
  item_type: 'material' | 'standard_part' | 'tooling'
  item_id: string
  quantity: number
  unit_price: number
  total_price: number
  received_quantity?: number
  specifications?: Record<string, any>
  notes?: string
}

export interface PurchaseRequest extends BaseEntity {
  request_number: string
  requester_id: string
  request_date: string
  required_date?: string
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'ordered'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  total_amount: number
  notes?: string
  items?: PurchaseRequestItem[]
}

export interface PurchaseRequestItem extends BaseEntity {
  purchase_request_id: string
  item_type: 'material' | 'standard_part' | 'tooling'
  item_id: string
  quantity: number
  estimated_price?: number
  specifications?: Record<string, any>
  urgency_reason?: string
  notes?: string
}

// User Management
export interface User extends BaseEntity {
  username: string
  email: string
  full_name?: string
  phone?: string
  role: 'admin' | 'manager' | 'operator' | 'viewer'
  department?: string
  status: 'active' | 'inactive'
  last_login?: string
  permissions?: string[]
}

// Common Response Types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// Form and Table Types
export interface FormValidationRule {
  required?: boolean
  message?: string
  pattern?: RegExp
  validator?: (rule: any, value: any) => Promise<void>
}

export interface TableColumn<T = any> {
  title: string
  dataIndex: string
  key: string
  width?: number
  align?: 'left' | 'center' | 'right'
  render?: (text: any, record: T, index: number) => React.ReactNode
  sorter?: (a: T, b: T) => number
  filters?: Array<{ text: string; value: any }>
  onFilter?: (value: any, record: T) => boolean
}

export interface SearchFilters {
  keyword?: string
  category?: string
  status?: string
  dateRange?: [string, string]
  [key: string]: any
}

export interface SearchParams extends SearchFilters {
  page?: number
  pageSize?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// Enum Types
export type StatusEnum = 'active' | 'inactive' | 'pending' | 'approved' | 'rejected'
export type PriorityEnum = 'low' | 'medium' | 'high' | 'urgent'
export type MaterialTypeEnum = 'metal' | 'plastic' | 'composite' | 'ceramic'
export type CategoryEnum = 'tooling' | 'material' | 'standard_part' | 'equipment'

// Error Types
export interface AppError extends Error {
  code?: string
  level?: 'error' | 'warning' | 'info'
  details?: any
  timestamp?: string
}

// Utility Types
export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

// Helper type to make specific properties required
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }

// Helper type for partial updates
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

// Export all types individually for named imports
export * from './tooling'