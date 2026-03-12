import { lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Login from "./pages/Login";
import Register from "./pages/Register";
import ResetPassword from "./pages/ResetPassword";
import ProtectedRoute from "./components/ProtectedRoute";
import Health from "./pages/Health";
import AppVersionBadge from "./components/AppVersionBadge";

const MainLayout = lazy(() => import("./components/Layout/MainLayout"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Companies = lazy(() => import("./pages/Companies"));
const CompanyOrg = lazy(() => import("./pages/CompanyOrg"));
const Users = lazy(() => import("./pages/Users"));
const Permissions = lazy(() => import("./pages/Permissions"));
const ToolingInfo = lazy(() => import("./pages/ToolingInfo"));
const Materials = lazy(() => import("./pages/Materials"));
const OptionsManagement = lazy(() => import("./pages/OptionsManagement"));
const PartTypes = lazy(() => import("./pages/PartTypes"));
const CuttingManagement = lazy(() => import("./pages/CuttingManagement"));
const PurchaseManagement = lazy(() => import("./pages/PurchaseManagement"));
const WorkHours = lazy(() => import("./pages/WorkHours"));
const WorkHoursManagement = lazy(() => import("./pages/WorkHoursManagement"));

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <Router>
        <AppVersionBadge />
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spin size="large" /></div>}>
          <Routes>
            <Route path="/health" element={<Health />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Navigate to="/login" replace />} />
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
              <Route path="work-hours" element={<ProtectedRoute requiredModule="work_hours_entry"><WorkHours mode="entry" /></ProtectedRoute>} />
              <Route path="work-hours-recent" element={<ProtectedRoute requiredModule="work_hours_entry"><WorkHours mode="recent" /></ProtectedRoute>} />
              <Route path="work-hours-management" element={<ProtectedRoute requiredModule="work_hours"><WorkHoursManagement /></ProtectedRoute>} />
            </Route>
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </Suspense>
      </Router>
    </ConfigProvider>
  );
}
