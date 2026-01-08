-- 工装制造管理系统 - 初始数据库架构
-- 创建时间: 2024-12-16

-- 创建公司表
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    address TEXT,
    contact_phone VARCHAR(20),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建角色表
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建权限表
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    module VARCHAR(30) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(11) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    real_name VARCHAR(50) NOT NULL,
    id_card VARCHAR(18) UNIQUE NOT NULL,
    company_id UUID REFERENCES companies(id),
    role_id UUID REFERENCES roles(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('active', 'inactive', 'pending')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建角色权限关联表
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

-- 创建索引
CREATE INDEX idx_companies_name ON companies(name);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_id_card ON users(id_card);
CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_roles_name ON roles(name);
CREATE INDEX idx_permissions_code ON permissions(code);
CREATE INDEX idx_permissions_module ON permissions(module);
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);

-- 创建更新时间函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为相关表添加更新时间触发器
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 设置权限
GRANT SELECT ON companies TO anon;
GRANT ALL PRIVILEGES ON companies TO authenticated;

GRANT SELECT ON users TO anon;
GRANT ALL PRIVILEGES ON users TO authenticated;

GRANT SELECT ON roles TO anon;
GRANT ALL PRIVILEGES ON roles TO authenticated;

GRANT SELECT ON permissions TO anon;
GRANT ALL PRIVILEGES ON permissions TO authenticated;

GRANT SELECT ON role_permissions TO anon;
GRANT ALL PRIVILEGES ON role_permissions TO authenticated;

-- 初始化角色数据
INSERT INTO roles (name, description) VALUES
('超级管理员', '拥有系统所有权限'),
('生产经理', '负责生产管理相关功能'),
('财务', '负责财务管理相关功能'),
('段长', '负责部门管理相关功能'),
('技术员', '负责技术相关功能'),
('库管员', '负责库存管理相关功能'),
('员工', '基础员工权限');

-- 初始化权限数据
INSERT INTO permissions (name, code, description, module) VALUES
('查看公司', 'company:read', '查看公司信息', 'company'),
('创建公司', 'company:create', '创建新公司', 'company'),
('编辑公司', 'company:update', '编辑公司信息', 'company'),
('删除公司', 'company:delete', '删除公司', 'company'),
('查看用户', 'user:read', '查看用户信息', 'user'),
('创建用户', 'user:create', '创建新用户', 'user'),
('编辑用户', 'user:update', '编辑用户信息', 'user'),
('删除用户', 'user:delete', '删除用户', 'user'),
('查看权限', 'permission:read', '查看权限信息', 'permission'),
('编辑权限', 'permission:update', '编辑权限配置', 'permission');

-- 初始化公司数据
INSERT INTO companies (name, description) VALUES
('工具工装', '工具工装制造分公司'),
('科技工装', '科技工装制造分公司'),
('冲压工装', '冲压工装制造分公司');

-- 为超级管理员角色分配所有权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
    (SELECT id FROM roles WHERE name = '超级管理员'),
    id
FROM permissions;