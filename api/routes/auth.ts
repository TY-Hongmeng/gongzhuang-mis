import express from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../lib/supabase.js';

const router = express.Router();

// 登录接口
router.post('/login', async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: '手机号和密码不能为空' });
    }

    // 查询用户信息
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        *,
        companies (
          id,
          name
        ),
        roles (
          id,
          name,
          role_permissions (
            permissions (
              id,
              name,
              module,
              code
            )
          )
        )
      `)
      .eq('phone', phone)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: '密码错误' });
    }

    // 检查用户状态
    if (user.status !== 'active') {
      return res.status(401).json({ error: '账户未激活或已被禁用' });
    }

    // 移除密码哈希
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      success: true,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

// 注册接口
router.post('/register', async (req, res) => {
  try {
    const { phone, realName, idCard, companyId, roleId, password, workshopId, teamId } = req.body;

    if (!phone || !realName || !idCard || !companyId || !roleId || !password) {
      return res.status(400).json({ error: '所有字段都是必填的' });
    }

    // 检查手机号是否已存在
    const { data: existingPhone } = await supabase
      .from('users')
      .select('id')
      .eq('phone', phone)
      .single();

    if (existingPhone) {
      return res.status(400).json({ error: '手机号已被注册' });
    }

    // 检查身份证号是否已存在
    const { data: existingIdCard } = await supabase
      .from('users')
      .select('id')
      .eq('id_card', idCard)
      .single();

    if (existingIdCard) {
      return res.status(400).json({ error: '身份证号已被注册' });
    }

    // 哈希密码
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建用户
    const { data: newUser, error } = await supabase
      .from('users')
      .insert({
        phone,
        real_name: realName,
        id_card: idCard,
        company_id: companyId,
        role_id: roleId,
        workshop_id: workshopId || null,
        team_id: teamId || null,
        password_hash: passwordHash,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Registration error:', error);
      return res.status(500).json({ error: '注册失败' });
    }

    res.json({
      success: true,
      message: '注册成功，请等待管理员审核'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// 重置密码接口
router.post('/reset-password', async (req, res) => {
  try {
    const { idCard, newPassword } = req.body;

    if (!idCard || !newPassword) {
      return res.status(400).json({ error: '身份证号和新密码不能为空' });
    }

    // 查找用户
    const { data: user, error } = await supabase
      .from('users')
      .select('id')
      .eq('id_card', idCard)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    // 哈希新密码
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // 更新密码
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', user.id);

    if (updateError) {
      console.error('Password reset error:', updateError);
      return res.status(500).json({ error: '密码重置失败' });
    }

    res.json({
      success: true,
      message: '密码重置成功'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: '密码重置失败' });
  }
});

export default router;
// 获取当前用户信息（带角色权限）
router.get('/me', async (req, res) => {
  try {
    const userId = String(req.query.userId || '')
    if (!userId) return res.status(400).json({ success: false, error: '缺少 userId' })
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        *,
        companies ( id, name ),
        roles (
          id,
          name,
          role_permissions ( permissions ( id, name, module, code ) )
        )
      `)
      .eq('id', userId)
      .single()
    if (error || !user) return res.status(404).json({ success: false, error: '用户不存在' })
    const { password_hash, ...userWithoutPassword } = user
    res.json({ success: true, user: userWithoutPassword })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取用户信息失败' })
  }
})
