import { message, notification } from 'antd'
import type { AppError } from '@/types'

export enum ErrorLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export interface ErrorHandlerOptions {
  level?: ErrorLevel
  showNotification?: boolean
  showMessage?: boolean
  logToConsole?: boolean
  logToServer?: boolean
  duration?: number
  description?: string
}

const defaultOptions: ErrorHandlerOptions = {
  level: ErrorLevel.ERROR,
  showNotification: true,
  showMessage: false,
  logToConsole: true,
  logToServer: false,
  duration: 4.5
}

class ErrorHandler {
  private errorLog: AppError[] = []
  private maxLogSize = 100

  /**
   * Handle error with consistent behavior
   */
  handleError(
    error: Error | string | AppError,
    options: ErrorHandlerOptions = {}
  ): void {
    const opts = { ...defaultOptions, ...options }
    const appError = this.normalizeError(error)

    // Add to error log
    this.addToLog(appError)

    // Log to console
    if (opts.logToConsole) {
      this.logToConsole(appError, opts.level)
    }

    // Show user notification
    if (opts.showNotification) {
      this.showNotification(appError, opts)
    }

    // Show message
    if (opts.showMessage) {
      this.showMessage(appError, opts.level)
    }

    // Log to server
    if (opts.logToServer) {
      this.logToServer(appError)
    }
  }

  /**
   * Handle API errors specifically
   */
  handleApiError(
    response: Response,
    customMessage?: string,
    options: ErrorHandlerOptions = {}
  ): void {
    const error = {
      name: 'ApiError',
      code: `API_${response.status}`,
      message: customMessage || this.getApiErrorMessage(response),
      details: {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        method: response.headers.get('method') || 'UNKNOWN'
      },
      timestamp: new Date().toISOString()
    }

    this.handleError(error, options)
  }

  /**
   * Handle validation errors
   */
  handleValidationError(
    errors: Record<string, string[]>,
    options: ErrorHandlerOptions = {}
  ): void {
    const firstError = Object.values(errors)[0]?.[0]
    if (firstError) {
      this.handleError(firstError, {
        ...options,
        level: ErrorLevel.WARNING,
        showMessage: true
      })
    }
  }

  /**
   * Normalize different error types to AppError
   */
  private normalizeError(error: Error | string | AppError): AppError {
    if (typeof error === 'string') {
      return {
        name: 'CustomError',
        code: 'CUSTOM_ERROR',
        message: error,
        timestamp: new Date().toISOString()
      }
    }

    if (error instanceof Error) {
      return {
        name: error.name || 'JavaScriptError',
        code: error.name || 'JAVASCRIPT_ERROR',
        message: error.message,
        details: {
          stack: error.stack,
          cause: (error as any).cause
        },
        timestamp: new Date().toISOString()
      }
    }

    return error
  }

  /**
   * Add error to log with size limit
   */
  private addToLog(error: AppError): void {
    this.errorLog.push(error)
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize)
    }
  }

  /**
   * Log error to console with appropriate level
   */
  private logToConsole(error: AppError, level?: ErrorLevel): void {
    const consoleMethod = this.getConsoleMethod(level)
    consoleMethod(`[${error.code}] ${error.message}`, error.details || '')
  }

  /**
   * Show Ant Design notification
   */
  private showNotification(error: AppError, options: ErrorHandlerOptions): void {
    const { level, duration, description } = options
    
    notification[level || ErrorLevel.ERROR]({
      message: error.message,
      description: description || error.details?.toString() || '发生错误，请稍后重试',
      duration,
      placement: 'topRight'
    })
  }

  /**
   * Show Ant Design message
   */
  private showMessage(error: AppError, level?: ErrorLevel): void {
    const messageMethod = level === ErrorLevel.WARNING ? message.warning : message.error
    messageMethod(error.message)
  }

  /**
   * Log error to server (placeholder for actual implementation)
   */
  private async logToServer(error: AppError): Promise<void> {
    try {
      // This would be replaced with actual API call to log errors
      console.log('Logging to server:', error)
      // await fetch('/api/logs/error', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(error)
      // })
    } catch (serverError) {
      console.error('Failed to log error to server:', serverError)
    }
  }

  /**
   * Get appropriate console method based on error level
   */
  private getConsoleMethod(level?: ErrorLevel): Function {
    switch (level) {
      case ErrorLevel.INFO:
        return console.info
      case ErrorLevel.WARNING:
        return console.warn
      case ErrorLevel.ERROR:
        return console.error
      case ErrorLevel.CRITICAL:
        return console.error
      default:
        return console.error
    }
  }

  /**
   * Get user-friendly API error message
   */
  private getApiErrorMessage(response: Response): string {
    switch (response.status) {
      case 400:
        return '请求参数错误，请检查输入数据'
      case 401:
        return '未授权访问，请重新登录'
      case 403:
        return '权限不足，无法执行此操作'
      case 404:
        return '请求的资源不存在'
      case 409:
        return '数据冲突，该资源可能已存在'
      case 422:
        return '数据验证失败，请检查输入数据'
      case 500:
        return '服务器内部错误，请稍后重试'
      case 502:
        return '网关错误，服务器暂时不可用'
      case 503:
        return '服务不可用，请稍后重试'
      default:
        return `请求失败 (${response.status}): ${response.statusText}`
    }
  }

  /**
   * Get recent errors from log
   */
  getRecentErrors(count: number = 10): AppError[] {
    return this.errorLog.slice(-count)
  }

  /**
   * Clear error log
   */
  clearLog(): void {
    this.errorLog = []
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number
    byLevel: Record<ErrorLevel, number>
    byCode: Record<string, number>
    recent: AppError[]
  } {
    const byLevel: Record<ErrorLevel, number> = {
      [ErrorLevel.INFO]: 0,
      [ErrorLevel.WARNING]: 0,
      [ErrorLevel.ERROR]: 0,
      [ErrorLevel.CRITICAL]: 0
    }

    const byCode: Record<string, number> = {}

    this.errorLog.forEach(error => {
      // Count by level (simplified)
      if (error.code.includes('WARNING')) {
        byLevel[ErrorLevel.WARNING]++
      } else if (error.code.includes('ERROR') || error.code.includes('CRITICAL')) {
        byLevel[ErrorLevel.ERROR]++
      } else {
        byLevel[ErrorLevel.INFO]++
      }

      // Count by code
      byCode[error.code] = (byCode[error.code] || 0) + 1
    })

    return {
      total: this.errorLog.length,
      byLevel,
      byCode,
      recent: this.getRecentErrors(5)
    }
  }
}

// Create singleton instance
export const errorHandler = new ErrorHandler()

// Convenience functions for common error scenarios
export const handleError = (error: Error | string | AppError, options?: ErrorHandlerOptions) => {
  errorHandler.handleError(error, options)
}

export const handleApiError = (response: Response, customMessage?: string, options?: ErrorHandlerOptions) => {
  errorHandler.handleApiError(response, customMessage, options)
}

export const handleValidationError = (errors: Record<string, string[]>, options?: ErrorHandlerOptions) => {
  errorHandler.handleValidationError(errors, options)
}

// Success message helper
export const handleSuccess = (message: string, description?: string, duration?: number) => {
  notification.success({
    message,
    description,
    duration: duration || 3,
    placement: 'topRight'
  })
}

// Warning message helper
export const handleWarning = (message: string, description?: string, duration?: number) => {
  notification.warning({
    message,
    description,
    duration: duration || 4,
    placement: 'topRight'
  })
}

// Info message helper
export const handleInfo = (message: string, description?: string, duration?: number) => {
  notification.info({
    message,
    description,
    duration: duration || 4.5,
    placement: 'topRight'
  })
}

export default errorHandler