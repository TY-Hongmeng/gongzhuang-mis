export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  items?: T[]
  error?: {
    code?: string
    message: string
    hint?: string
  }
  meta?: {
    total?: number
    page?: number
    pageSize?: number
  }
}

export const successResponse = <T>(data: T, meta?: ApiResponse['meta']): ApiResponse<T> => ({
  success: true,
  data,
  meta
})

export const successListResponse = <T>(items: T[], meta?: ApiResponse['meta']): ApiResponse<T> => ({
  success: true,
  items,
  meta
})

export const errorResponse = (message: string, code?: string, hint?: string): ApiResponse => ({
  success: false,
  error: {
    code,
    message,
    hint
  }
})

export const sendSuccess = <T>(res: any, data: T, meta?: ApiResponse['meta']) => {
  return res.json(successResponse(data, meta))
}

export const sendSuccessList = <T>(res: any, items: T[], meta?: ApiResponse['meta']) => {
  return res.json(successListResponse(items, meta))
}

export const sendError = (res: any, message: string, code?: string, hint?: string, statusCode: number = 500) => {
  return res.status(statusCode).json(errorResponse(message, code, hint))
}

export const sendNotFound = (res: any, message: string = '未找到') => {
  return res.status(404).json(errorResponse(message))
}

export const sendCreated = <T>(res: any, data: T) => {
  return res.status(201).json(successResponse(data))
}

export const sendUpdated = <T = any>(res: any, data?: T) => {
  return res.json(successResponse((data as any) ?? { success: true }))
}

export const sendDeleted = (res: any, info?: any) => {
  const payload = typeof info === 'number' ? { deleted: info } : (info ?? { deleted: 1 })
  return res.json(successResponse(payload))
}

export const asyncHandler = (fn: (...args: any[]) => Promise<any>) => {
  return async (req: any, res: any, next: any) => {
    try {
      await fn(req, res, next)
    } catch (err: any) {
      console.error('[AsyncHandler] Error:', err)
      res.status(500).json(errorResponse(err?.message || '服务器错误'))
    }
  }
}
