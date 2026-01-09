import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { fetchWithFallback } from '../utils/api'
import { supabase } from '../lib/supabase'

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
  isLoading: boolean
  isAuthenticated: boolean
  login: (phone: string, password: string) => Promise<{ success: boolean; message?: string }>
  register: (data: RegisterData) => Promise<{ success: boolean; message?: string }>
  resetPassword: (idCard: string, newPassword: string) => Promise<{ success: boolean; message?: string }>
  logout: () => void
  checkAuth: () => Promise<void>
  refreshUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      isAuthenticated: false,

      login: async (phone: string, password: string) => {
        set({ isLoading: true });
        const headers = { 'Content-Type': 'text/plain' };
        const body = JSON.stringify({ phone, password });

        const fetchWithTimeout = async (url: string, ms = 8000) => {
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
          const isGhPages = typeof window !== 'undefined' && /github\.io/i.test(String(window.location?.host || ''))
          if (!isGhPages) {
            const response = await fetchWithTimeout('/api/auth/login');
            if (response.ok) {
              const data = await response.json();
              if (data.success) {
                set({ user: data.user, isAuthenticated: true, isLoading: false });
                return { success: true, message: '登录成功' };
              } else {
                set({ isLoading: false });
                return { success: false, message: data.error || '登录失败' };
              }
            }
          }
          
          if (supabase) {
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
            return { success: true, message: '登录成功' };
          }
          set({ isLoading: false });
          return { success: false, message: '登录失败' };
        } catch (error) {
          set({ isLoading: false });
          return { success: false, message: '网络错误，请重试' };
        }
      },

      register: async (data: RegisterData) => {
        set({ isLoading: true });
        const headers = { 'Content-Type': 'text/plain' };
        const body = JSON.stringify(data);

        const fetchWithTimeout = async (url: string, ms = 8000) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), ms);
          try {
            const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
            return res;
          } finally {
            clearTimeout(timer);
          }
        };

        try {
          let response = await fetchWithTimeout('/api/auth/register');

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
        const headers = { 'Content-Type': 'text/plain' };
        const body = JSON.stringify({ idCard, newPassword });

        const fetchWithTimeout = async (url: string, ms = 8000) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), ms);
          try {
            const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
            return res;
          } finally {
            clearTimeout(timer);
          }
        };

        try {
          let response = await fetchWithTimeout('/api/auth/reset-password');

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
        set({ user: null, isAuthenticated: false });
      },

      checkAuth: async () => {
        // 检查本地存储的用户信息是否有效
        const { user } = get();
        if (user) {
          set({ isAuthenticated: true });
        }
      },

      refreshUser: async () => {
        const { user } = get();
        if (!user?.id) return;
        try {
          let res = await fetchWithFallback(`/api/auth/me?userId=${user.id}`);
          const data = await res.json();
          if (data?.success && data?.user) {
            set({ user: data.user });
          }
        } catch {}
      }
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
