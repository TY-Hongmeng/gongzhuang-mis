import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Login from "./pages/Login";
import Register from "./pages/Register";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Companies from "./pages/Companies";
import CompanyOrg from "./pages/CompanyOrg";
import Users from "./pages/Users";
import Permissions from "./pages/Permissions";
import ToolingInfo from "./pages/ToolingInfo";
import Materials from "./pages/Materials";
import OptionsManagement from "./pages/OptionsManagement";
import PartTypes from "./pages/PartTypes";
import CuttingManagement from "./pages/CuttingManagement";
import PurchaseManagement from "./pages/PurchaseManagement";
import WorkHours from "./pages/WorkHours";
import WorkHoursManagement from "./pages/WorkHoursManagement";
import MainLayout from "./components/Layout/MainLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import Health from "./pages/Health";

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <Router>
        <Routes>
          {/* 公开路由 */}
          <Route path="/health" element={<Health />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          
          {/* 受保护的路由 */}
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
            <Route path="work-hours" element={<ProtectedRoute requiredModule="work_hours_entry"><WorkHours /></ProtectedRoute>} />
            <Route path="work-hours-management" element={<ProtectedRoute requiredModule="work_hours"><WorkHoursManagement /></ProtectedRoute>} />
          </Route>
          
          {/* 404 重定向 */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </ConfigProvider>
  );
}
