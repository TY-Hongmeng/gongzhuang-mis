-- 创建超级管理员用户
-- 手机号: 18004499801, 密码: 123456

-- 插入超级管理员用户
INSERT INTO users (
    phone, 
    password_hash, 
    real_name, 
    id_card, 
    company_id, 
    role_id, 
    status
) VALUES (
    '18004499801',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- 密码: 123456 的bcrypt哈希
    '系统管理员',
    '110101199001011234',
    (SELECT id FROM companies WHERE name = '工具工装' LIMIT 1),
    (SELECT id FROM roles WHERE name = '超级管理员' LIMIT 1),
    'active'
);