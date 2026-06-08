import { lazy, Suspense, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Login from "./pages/Login";
import Register from "./pages/Register";
import ResetPassword from "./pages/ResetPassword";
import ProtectedRoute from "./components/ProtectedRoute";
import Health from "./pages/Health";
import AppVersionBadge from "./components/AppVersionBadge";
import { useAuthStore } from './stores/authStore';

const lazyDebugEnabled = (() => {
  const isDev = (import.meta as any).env?.DEV === true
  const manualEnabled = typeof window !== 'undefined' && window.localStorage?.getItem('debug_lazy') === '1'
  return isDev || manualEnabled
})()

const lazyWithTrace = (moduleName: string, loader: () => Promise<any>) => lazy(async () => {
  const start = performance.now()
  if (lazyDebugEnabled) {
    console.log(`[LazyLoad] start: ${moduleName}`)
  }
  const mod = await loader()
  if (lazyDebugEnabled) {
    const elapsed = Math.round(performance.now() - start)
    console.log(`[LazyLoad] done: ${moduleName} (${elapsed}ms)`)
  }
  return mod
})

const MainLayout = lazyWithTrace("MainLayout", () => import("./components/Layout/MainLayout"));
const Dashboard = lazyWithTrace("Dashboard", () => import("./pages/Dashboard"));
const Companies = lazyWithTrace("Companies", () => import("./pages/Companies"));
const CompanyOrg = lazyWithTrace("CompanyOrg", () => import("./pages/CompanyOrg"));
const Users = lazyWithTrace("Users", () => import("./pages/Users"));
const Permissions = lazyWithTrace("Permissions", () => import("./pages/Permissions"));
const ToolingInfo = lazyWithTrace("ToolingInfo", () => import("./pages/ToolingInfo.tsx"));
const Materials = lazyWithTrace("Materials", () => import("./pages/Materials"));
const OptionsManagement = lazyWithTrace("OptionsManagement", () => import("./pages/OptionsManagement"));
const PartTypes = lazyWithTrace("PartTypes", () => import("./pages/PartTypes"));
const CuttingManagement = lazyWithTrace("CuttingManagement", () => import("./pages/CuttingManagement"));
const PurchaseManagement = lazyWithTrace("PurchaseManagement", () => import("./pages/PurchaseManagement"));
const StandardPartsManagement = lazyWithTrace("StandardPartsManagement", () => import("./pages/StandardPartsManagement"));
const StandardPartsIssue = lazyWithTrace("StandardPartsIssue", () => import("./pages/StandardPartsIssue"));
const WorkHours = lazyWithTrace("WorkHours", () => import("./pages/WorkHours"));
const WorkHoursManagement = lazyWithTrace("WorkHoursManagement", () => import("./pages/WorkHoursManagement"));
const ProgramEntry = lazyWithTrace("ProgramEntry", () => import("./pages/ProgramEntry"));

export default function App() {
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return (
    <ConfigProvider locale={zhCN}>
      <Router>
        <AppVersionBadge />
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spin size="large" /></div>}>
          <Routes>
            <Route path="/health" element={<Health />} />
            <Route path="/login" element={isAuthenticated && user ? <Navigate to="/dashboard" replace /> : <Login />} />
            <Route path="/register" element={isAuthenticated && user ? <Navigate to="/dashboard" replace /> : <Register />} />
            <Route path="/reset-password" element={isAuthenticated && user ? <Navigate to="/dashboard" replace /> : <ResetPassword />} />
            {!isLoading && isAuthenticated && user && (
              <Route path="/" element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="tooling-info" element={<ProtectedRoute requiredModule="tooling"><ToolingInfo /></ProtectedRoute>} />
                <Route path="materials" element={<ProtectedRoute requiredModule="base_data"><Materials /></ProtectedRoute>} />
                <Route path="companies" element={<ProtectedRoute requiredModule="company"><Companies /></ProtectedRoute>} />
                <Route path="company-org/:id" element={<ProtectedRoute requiredModule="company"><CompanyOrg /></ProtectedRoute>} />
                <Route path="users" element={<ProtectedRoute requiredModule="user"><Users /></ProtectedRoute>} />
                <Route path="permissions" element={<ProtectedRoute requiredModule="permission"><Permissions /></ProtectedRoute>} />
                <Route path="options-management" element={<ProtectedRoute requiredModule="base_data"><OptionsManagement /></ProtectedRoute>} />
                <Route path="part-types" element={<ProtectedRoute requiredModule="base_data"><PartTypes /></ProtectedRoute>} />
                <Route path="cutting-management" element={<ProtectedRoute requiredModule="cutting"><CuttingManagement /></ProtectedRoute>} />
                <Route path="purchase-management" element={<ProtectedRoute requiredModule="purchase"><PurchaseManagement /></ProtectedRoute>} />
                <Route path="standard-parts" element={<ProtectedRoute requiredModule="standard_parts"><StandardPartsManagement /></ProtectedRoute>} />
                <Route path="standard-parts-issue" element={<ProtectedRoute requiredModule="standard_parts_issue"><StandardPartsIssue /></ProtectedRoute>} />
                <Route path="work-hours" element={<ProtectedRoute requiredModule="work_hours_entry"><WorkHours mode="entry" /></ProtectedRoute>} />
                <Route path="work-hours-recent" element={<ProtectedRoute requiredModule="work_hours_entry"><WorkHours mode="recent" /></ProtectedRoute>} />
                <Route path="work-hours-management" element={<ProtectedRoute requiredModule="work_hours"><WorkHoursManagement /></ProtectedRoute>} />
                <Route path="program-entry" element={<ProtectedRoute requiredModule="program_entry"><ProgramEntry /></ProtectedRoute>} />
              </Route>
            )}
            <Route path="*" element={<Navigate to={isAuthenticated && user ? "/dashboard" : "/login"} replace />} />
          </Routes>
        </Suspense>
      </Router>
    </ConfigProvider>
  );
}
