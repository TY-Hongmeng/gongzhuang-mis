import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { fetchWithFallback } from '../utils/api'
import { supabase } from '../lib/supabase'
import { safeLocalStorage } from '../utils/safeStorage'

interface Company {
  id: string;
  name: string;
}

interface Role {
  id: string;
  name: string;
  role_permissions?: {
    permissions: {
      id: string;
      name: string;
      module: string;
    };
  }[];
}

interface User {
  id: string;
  phone: string;
  real_name: string;
  id_card: string;
  company_id: string;
  role_id: string;
  workshop_id?: string | null;
  team_id?: string | null;
  status: 'active' | 'inactive' | 'pending';
  created_at: string;
  updated_at: string;
  companies?: Company;
  roles?: Role;
}

interface RegisterData {
  phone: string;
  password: string;
  realName: string;
  idCard: string;
  companyId: string;
  roleId: string;
  workshopId?: string;
  teamId?: string;
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (phone: string, password: string) => Promise<{ success: boolean; message?: string }>
  register: (data: RegisterData) => Promise<{ success: boolean; message?: string }>
  resetPassword: (idCard: string, newPassword: string) => Promise<{ success: boolean; message?: string }>
  logout: () => void
  checkAuth: () => Promise<void>
  refreshUser: () => Promise<void>
}

const fetchCurrentUser = async (userId: string) => {
  const res = await fetchWithFallback(`/api/auth/me?userId=${encodeURIComponent(userId)}`)
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.success !== true || !data?.user) {
    throw new Error(String(data?.error || '获取当前用户信息失败'))
  }
  return data.user as User
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (phone: string, password: string) => {
        console.log('AuthStore: Starting login...', { phone })
        set({ isLoading: true });
        const headers = { 'Content-Type': 'application/json' };
        const body = JSON.stringify({ phone, password });

        const fetchWithTimeout = async (url: string, ms = 30000) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), ms);
          try {
            const res = await fetchWithFallback(url, { method: 'POST', headers, body, signal: controller.signal });
            return res;
          } finally {
            clearTimeout(timer);
          }
        };

        try {
          const response = await fetchWithTimeout('/api/auth/login', 30000);
          if (response.ok) {
            const data = await response.json();
            console.log('AuthStore: Login response OK', data)
            if (data.success) {
              set({ 
                user: data.user, 
                token: data.token || data.accessToken || data.access_token || null,
                isAuthenticated: true, 
                isLoading: false 
              });
              return { success: true, message: '登录成功' };
            } else {
              set({ isLoading: false });
              console.warn('AuthStore: Login success=false', data)
              return { success: false, message: data.error || '登录失败' };
            }
          }

          const errData = await response.json().catch(() => ({} as any))
          console.error('AuthStore: Login response not OK', response.status, errData)
          if (errData?.error) {
            set({ isLoading: false });
            return { success: false, message: String(errData.error) };
          }
          const isDev = (import.meta as any)?.env?.MODE === 'development'
          const isLocalHost = typeof window !== 'undefined' && /localhost/i.test(String(window.location?.host || ''))
          if ((isDev || isLocalHost) && supabase) {
            console.log('AuthStore: Attempting dev fallback login')
            const { data: userRow, error } = await supabase
              .from('users')
              .select(`*, companies(id,name), roles(id,name, role_permissions( permissions(id,name,module,code) ))`)
              .eq('phone', phone)
              .single()
            if (error || !userRow) {
              set({ isLoading: false });
              return { success: false, message: '用户不存在' };
            }
            const { default: bcrypt } = await import('bcryptjs')
            const ok = await bcrypt.compare(password, String((userRow as any).password_hash || ''))
            if (!ok) {
              set({ isLoading: false });
              return { success: false, message: '密码错误' };
            }
            if (String((userRow as any).status) !== 'active') {
              set({ isLoading: false });
              return { success: false, message: '账户未激活或已被禁用' };
            }
            const { password_hash, ...safeUser } = (userRow as any)
            set({ user: safeUser, isAuthenticated: true, isLoading: false });
            return { success: true, message: '登录成功(开发兜底)' };
          }
          set({ isLoading: false });
          return { success: false, message: '登录失败' };
        } catch (error) {
          console.error('AuthStore: Login exception caught', error)
          set({ isLoading: false });
          return { success: false, message: '网络错误，请重试' };
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true });
        const headers = { 'Content-Type': 'application/json' };
        const body = JSON.stringify(data);

        const fetchWithTimeout = async (url: string, ms = 30000) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), ms);
          try {
            const res = await fetchWithFallback(url, { method: 'POST', headers, body, signal: controller.signal });
            return res;
          } finally {
            clearTimeout(timer);
          }
        };

        try {
          let response = await fetchWithTimeout('/api/auth/register', 30000);

          const result = await response.json();

          set({ isLoading: false });

          if (result.success) {
            return { success: true, message: result.message || '注册成功' };
          } else {
            return { success: false, message: result.error || '注册失败' };
          }
        } catch (error) {
          set({ isLoading: false });
          return { success: false, message: '网络错误，请重试' };
        }
      },

      resetPassword: async (idCard: string, newPassword: string) => {
        set({ isLoading: true });
        const headers = { 'Content-Type': 'application/json' };
        const body = JSON.stringify({ idCard, newPassword });

        const fetchWithTimeout = async (url: string, ms = 30000) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), ms);
          try {
            const res = await fetchWithFallback(url, { method: 'POST', headers, body, signal: controller.signal });
            return res;
          } finally {
            clearTimeout(timer);
          }
        };

        try {
          let response = await fetchWithTimeout('/api/auth/reset-password', 30000);

          const result = await response.json();

          set({ isLoading: false });

          if (result.success) {
            return { success: true, message: result.message || '密码重置成功' };
          } else {
            return { success: false, message: result.error || '密码重置失败' };
          }
        } catch (error) {
          set({ isLoading: false });
          return { success: false, message: '网络错误，请重试' };
        }
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
        // 同时清理 Supabase 会话
        if (supabase) {
          supabase.auth.signOut().catch(e => console.warn('Supabase signout error:', e));
        }
      },

      checkAuth: async () => {
        const { user } = get();
        if (!user?.id) {
          set({ isAuthenticated: false, isLoading: false })
          return
        }
        set({ isLoading: true })
        try {
          const latestUser = await fetchCurrentUser(String(user.id))
          set({
            user: latestUser,
            isAuthenticated: true,
            isLoading: false
          })
          return
        } catch {
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false
          })
          return
        }
      },

      refreshUser: async () => {
        const { user } = get();
        if (!user?.id) return;
        try {
          const latestUser = await fetchCurrentUser(String(user.id))
          set({ user: latestUser })
        } catch {}
      }
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated
      }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState as any),
        isLoading: false
      }),
    }
  )
);
