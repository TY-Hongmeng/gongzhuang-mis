import express from 'express'
import { supabase } from '../lib/supabase.js'

const router = express.Router()

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return res.status(500).json({ success: false, error: '加载用户列表失败' })
    }

    res.json({ success: true, items: data || [] })
  } catch (e: any) {
    res.status(500).json({ success: false, error: '加载用户列表失败' })
  }
})

export default router
