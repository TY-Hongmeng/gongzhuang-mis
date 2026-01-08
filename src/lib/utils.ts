import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 网络与通用工具函数
export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, message = '请求超时') : Promise<T> {
  let timer: any;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(message));
    }, ms);
    promise.then((val) => {
      clearTimeout(timer);
      resolve(val);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function shouldRetry(error: any): boolean {
  if (!error) return false;
  const msg = String(error?.message || '').toLowerCase();
  // 常见网络/服务错误：网络断开、超时、502/503、fetch failed
  if (msg.includes('timeout') || msg.includes('network') || msg.includes('fetch failed')) return true;
  const code = String(error?.code || '').toLowerCase();
  if (['etimedout', 'econnreset', 'econnrefused'].includes(code)) return true;
  const status = Number(error?.status || error?.statusCode || 0);
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  return false;
}

export interface RetryOptions {
  attempts?: number; // 总尝试次数
  timeoutMs?: number; // 每次尝试的超时时间
  baseDelayMs?: number; // 初始退避时间
}

export async function supaRetry<T = any>(fn: () => Promise<T>, opts: RetryOptions = {}) : Promise<{ data?: T; error?: any }> {
  const attempts = opts.attempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? 8000;
  const baseDelayMs = opts.baseDelayMs ?? 500;

  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await withTimeout(fn(), timeoutMs);
      // 如果返回的是Supabase响应格式，直接返回
      if (res && typeof res === 'object' && 'data' in res && 'error' in res) {
        return res as { data?: T; error?: any };
      }
      // 否则包装成标准格式
      return { data: res, error: null };
    } catch (err: any) {
      lastErr = err;
      if (i === attempts - 1 || !shouldRetry(err)) {
        return { data: null, error: err };
      }
      const backoff = baseDelayMs * Math.pow(2, i); // 指数退避
      await sleep(backoff);
    }
  }
  return { data: null, error: lastErr };
}
