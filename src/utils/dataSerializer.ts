import { ApiResponse } from '../api/lib/response'

// 数据序列化工具类
export class DataSerializer {
  /**
   * 安全地序列化对象，移除循环引用
   */
  static safeSerialize(obj: any): any {
    if (obj === null || obj === undefined) return obj
    if (typeof obj !== 'object') return obj
    
    // 处理数组
    if (Array.isArray(obj)) {
      return obj.map(item => DataSerializer.safeSerialize(item))
    }
    
    // 处理日期对象
    if (obj instanceof Date) {
      return obj.toISOString()
    }
    
    // 处理普通对象
    const serialized: any = {}
    const seen = new WeakSet()
    
    const serialize = (o: any): any => {
      if (o === null || o === undefined) return o
      if (typeof o !== 'object') return o
      if (seen.has(o)) return '[Circular]'
      seen.add(o)
      
      if (Array.isArray(o)) {
        return o.map(item => serialize(item))
      }
      
      const result: any = {}
      for (const key in o) {
        if (o.hasOwnProperty(key)) {
          result[key] = serialize(o[key])
        }
      }
      return result
    }
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        serialized[key] = serialize(obj[key])
      }
    }
    
    return serialized
  }
  
  /**
   * 处理API响应，统一格式
   */
  static normalizeResponse(response: any): ApiResponse {
    // 如果已经是标准格式，直接返回
    if (response && typeof response === 'object' && 'success' in response) {
      return response
    }
    
    // 处理旧格式兼容
    if (Array.isArray(response)) {
      return {
        success: true,
        items: response
      }
    }
    
    if (response && (response.data || response.items)) {
      return {
        success: true,
        data: response.data,
        items: response.items
      }
    }
    
    return {
      success: true,
      data: response
    }
  }
  
  /**
   * 清理数据库记录，移除不必要的嵌套对象
   */
  static cleanDbRecord(record: any, options: {
    removeNested?: boolean
    allowedNested?: string[]
  } = {}): any {
    const { removeNested = true, allowedNested = [] } = options
    
    if (!record || typeof record !== 'object') {
      return record
    }
    
    const cleaned: any = {}
    
    for (const key in record) {
      if (record.hasOwnProperty(key)) {
        const value = record[key]
        
        // 移除嵌套对象（除非在允许列表中）
        if (removeNested && 
            typeof value === 'object' && 
            value !== null && 
            !Array.isArray(value) && 
            !(value instanceof Date) &&
            !allowedNested.includes(key)) {
          continue
        }
        
        cleaned[key] = value
      }
    }
    
    return cleaned
  }
  
  /**
   * 批量清理数据库记录
   */
  static cleanDbRecords(records: any[], options?: Parameters<typeof DataSerializer.cleanDbRecord>[1]): any[] {
    return records.map(record => DataSerializer.cleanDbRecord(record, options))
  }
}

// 前端API响应处理工具
export class ResponseHandler {
  /**
   * 处理API响应，提取数据
   */
  static extractData<T>(response: ApiResponse<T>): T | null {
    if (!response.success) {
      throw new Error(response.error?.message || '请求失败')
    }
    
    return response.data || (response.items as any) || null
  }
  
  /**
   * 处理API响应，提取列表数据
   */
  static extractList<T>(response: ApiResponse<T[]>): T[] {
    if (!response.success) {
      throw new Error(response.error?.message || '请求失败')
    }
    
    return response.items || response.data || []
  }
  
  /**
   * 检查响应是否成功
   */
  static isSuccess(response: ApiResponse): boolean {
    return response.success === true
  }
  
  /**
   * 获取错误信息
   */
  static getError(response: ApiResponse): string | null {
    if (response.success) return null
    return response.error?.message || '未知错误'
  }
}

// 请求参数清理工具
export class RequestCleaner {
  /**
   * 清理请求参数，移除空值
   */
  static cleanParams(params: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, any> = {}
    
    for (const key in params) {
      if (params.hasOwnProperty(key)) {
        const value = params[key]
        
        // 移除空字符串、null、undefined
        if (value === '' || value === null || value === undefined) {
          continue
        }
        
        cleaned[key] = value
      }
    }
    
    return cleaned
  }
  
  /**
   * 清理工装信息参数
   */
  static cleanToolingParams(params: Record<string, any>): Record<string, any> {
    const cleaned = RequestCleaner.cleanParams(params)
    
    // 特殊处理日期字段
    const dateFields = ['received_date', 'demand_date', 'completed_date', 'production_date']
    dateFields.forEach(field => {
      if (cleaned[field] === '') {
        cleaned[field] = null
      }
    })
    
    // 特殊处理数字字段
    if (cleaned.sets_count !== undefined) {
      cleaned.sets_count = Number(cleaned.sets_count) || 1
    }
    
    return cleaned
  }
  
  /**
   * 清理零件信息参数
   */
  static cleanPartParams(params: Record<string, any>): Record<string, any> {
    const cleaned = RequestCleaner.cleanParams(params)
    
    // 特殊处理数字字段
    if (cleaned.part_quantity !== undefined) {
      cleaned.part_quantity = Number(cleaned.part_quantity) || null
    }
    
    if (cleaned.weight !== undefined) {
      cleaned.weight = Number(cleaned.weight) || 0
    }
    
    // 清理规格字段
    if (cleaned.specifications && typeof cleaned.specifications === 'object') {
      cleaned.specifications = DataSerializer.safeSerialize(cleaned.specifications)
    }
    
    return cleaned
  }
}
