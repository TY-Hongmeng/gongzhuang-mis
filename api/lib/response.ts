/**
 * 统一响应格式辅助函数
 * 标准化所有API响应的格式
 */

import { Response, NextFunction } from 'express'

/**
 * 成功响应
 */
export function sendSuccess(
  res: Response,
  data?: any,
  message?: string,
  meta?: {
    total?: number
    page?: number
    pageSize?: number
    totalPages?: number
    [key: string]: any
  }
) {
  const response: any = {
    success: true,
    data
  }
  
  if (message) {
    response.message = message
  }
  
  if (meta) {
    response.meta = meta
  }
  
  return res.json(response)
}

/**
 * 列表成功响应（带分页信息）
 */
export function sendList(
  res: Response,
  data: any[],
  total: number,
  page: number = 1,
  pageSize: number = 10,
  message?: string
) {
  const totalPages = Math.ceil(total / pageSize)
  
  return sendSuccess(res, data, message, {
    total,
    page,
    pageSize,
    totalPages
  })
}

/**
 * 错误响应
 */
export function sendError(
  res: Response,
  error: string,
  code?: string,
  details?: any,
  statusCode: number = 500
) {
  const response: any = {
    success: false,
    error
  }
  
  if (code) {
    response.code = code
  }
  
  if (details) {
    response.details = details
  }
  
  return res.status(statusCode).json(response)
}

/**
 * 验证错误响应
 */
export function sendValidationError(
  res: Response,
  errors: Record<string, string[]>,
  message: string = '验证失败'
) {
  return sendError(res, message, 'VALIDATION_ERROR', { errors }, 400)
}

/**
 * 未找到错误响应
 */
export function sendNotFound(
  res: Response,
  resource: string = '资源'
) {
  return sendError(res, `${resource}不存在`, 'NOT_FOUND', null, 404)
}

/**
 * 未授权错误响应
 */
export function sendUnauthorized(
  res: Response,
  message: string = '未授权访问'
) {
  return sendError(res, message, 'UNAUTHORIZED', null, 401)
}

/**
 * 服务器错误响应
 */
export function sendServerError(
  res: Response,
  error: Error | string,
  details?: any
) {
  const errorMessage = typeof error === 'string' ? error : error.message
  const errorCode = typeof error === 'object' && 'code' in error ? error.code : 'INTERNAL_ERROR'
  
  return sendError(res, errorMessage, errorCode as string, details, 500)
}

/**
 * 创建成功响应
 */
export function sendCreated(
  res: Response,
  data: any,
  message: string = '创建成功'
) {
  return sendSuccess(res, data, message)
}

/**
 * 更新成功响应
 */
export function sendUpdated(
  res: Response,
  data: any,
  message: string = '更新成功'
) {
  return sendSuccess(res, data, message)
}

/**
 * 删除成功响应
 */
export function sendDeleted(
  res: Response,
  message: string = '删除成功'
) {
  return sendSuccess(res, null, message)
}

/**
 * 处理异步错误的包装函数
 */
export function asyncHandler(fn: (req: any, res: Response, next: NextFunction) => any) {
  return (req: any, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

export default {
  sendSuccess,
  sendList,
  sendError,
  sendValidationError,
  sendNotFound,
  sendUnauthorized,
  sendServerError,
  sendCreated,
  sendUpdated,
  sendDeleted,
  asyncHandler
}