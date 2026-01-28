import { useCallback } from 'react'
import { message } from 'antd'
import { generateInventoryNumber, canGenerateInventoryNumber, calculateVolume } from '../utils/toolingCalculations'
import { calculateTotalPrice } from '../utils/priceCalculator'

// 工装业务逻辑Hook
export const useToolingOperations = () => {
  // 生成下料单
  const generateCuttingOrders = useCallback(async (selectedParts: any[], materials: any[], materialSources: any[], partTypes: any[] = []) => {
    try {
      // 过滤材料来源为"火切"和"锯切"（含常见变体）的零件
      const normalize = (s: string) => {
        const t = String(s || '').replace(/\s+/g, '').toLowerCase()
        if (!t) return ''
        if (t.includes('火切') || t.includes('huoqie') || t.includes('切割')) return '火切'
        if (t.includes('锯切') || t.includes('jvqie') || t.includes('锯床割方') || t.includes('割方')) return '锯切'
        return s
      }
      const validParts = selectedParts.filter(part => {
        const materialSource = materialSources.find(ms => String(ms.id) === String(part.material_source_id))
        const name = normalize(materialSource?.name || '')
        return name === '火切' || name === '锯切'
      })

      if (validParts.length === 0) {
        message.warning('没有符合条件的零件数据可以生成下料单，请确保选择的零件材料来源为"火切"或"锯切"')
        return null
      }

      const cuttingOrders = validParts.map((part, index) => {
        const material = materials.find(m => String(m.id) === String(part.material_id))
        const materialSource = materialSources.find(ms => String(ms.id) === String(part.material_source_id))
        const materialSourceName = normalize(materialSource?.name || '') || '锯切'
        const qty = parseInt(String(part.part_quantity || 0), 10)
        let unitW = parseFloat(String(part.weight ?? ''))
        if (!(unitW > 0)) {
          unitW = calculatePartWeight(part.specifications || {}, part.material_id || '', part.part_category || '', partTypes, materials)
        }
        const totalWeight = (!isNaN(unitW) && qty > 0) ? Math.round(unitW * qty * 1000) / 1000 : null

        const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'')
        const inv = (part.part_inventory_number && String(part.part_inventory_number).trim())
          ? String(part.part_inventory_number).trim()
          : `CO-${part.tooling_id || 'T'}-${part.id || 'P'}-${dateStr}`
        return {
          inventory_number: inv,
          project_name: part.project_name || '',
          part_drawing_number: part.part_drawing_number || '',
          part_name: part.part_name || '未命名零件',
          material: material?.name || '未知材质',
          specifications: part.specifications_text || '无规格',
          part_quantity: parseInt(String(part.part_quantity || 0), 10),
          total_weight: totalWeight,
          remarks: (typeof part.remarks === 'string' && part.remarks.trim()) ? String(part.remarks).trim() : '',
          material_source: materialSourceName,
          created_date: new Date().toISOString(),
          tooling_id: part.tooling_id || null,
          part_id: part.id || null
        }
      })

      // 批次内去重（按 inventory_number + part_id）
      const seen = new Set<string>()
      const deduped = cuttingOrders.filter(o => {
        const key = `${o.inventory_number}|${o.part_id || ''}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

      const response = await fetch('/api/cutting-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: deduped })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`服务器错误: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      
      if (result.success) {
        const stats = result.stats || {}
        const messages = []
        if (stats.updated > 0) messages.push(`更新 ${stats.updated} 条`)
        if (stats.inserted > 0) messages.push(`新增 ${stats.inserted} 条`)
        if (stats.skipped > 0) messages.push(`跳过 ${stats.skipped} 条`)
        
        const messageText = messages.length > 0 ? messages.join('，') : `成功处理 ${deduped.length} 条下料单`
        message.success(messageText)
        // 状态：下料中（非采购来源）
        validParts.forEach(p => {
          const ms = materialSources.find(ms => String(ms.id) === String(p.material_source_id))
          const name = normalize(ms?.name || '')
          if (name !== '外购') {
            if (p.id) localStorage.setItem(`status_part_${p.id}`, '下料中')
          }
        })
        window.dispatchEvent(new Event('status_updated'))
        return result
      } else {
        throw new Error(result.error || '生成下料单失败')
      }
    } catch (error) {
      console.error('Failed to create cutting orders:', error)
      message.error('生成下料单失败：' + error)
      return null
    }
  }, [])

  // 生成采购单
  const generatePurchaseOrders = useCallback(async (selectedItems: any[], materials: any[], materialSources: any[], partTypes: any[] = []) => {
    try {
      const purchaseOrders: any[] = []

      // 处理标准件
      const childItems = selectedItems.filter(item => item.type === 'childItem')
      childItems.forEach(item => {
        const ready = !!(item.name && item.name.trim() && item.model && item.model.trim() && Number(item.quantity || 0) > 0 && (item.unit || '').trim() && (item.required_date || '').trim())
        if (ready) {
          const invChild = (item.inventory_number && item.inventory_number.trim()) 
            ? item.inventory_number 
            : `PO-${item.tooling_id || 'T'}-${item.id || 'C'}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}`;
          purchaseOrders.push({
            inventory_number: invChild,
            project_name: item.project_name || '未命名项目',
            part_name: item.name,
            part_quantity: item.quantity ?? 0,
            unit: (item.unit ?? '件') || '件',
            model: item.model || '',
            supplier: '',
            required_date: item.required_date || '',
            remark: item.remark || '',
            created_date: new Date().toISOString(),
            tooling_id: item.tooling_id || null,
            child_item_id: item.id,
            status: 'pending'
          })
        }
      })

      // 处理外购零件（仅材料来源为“外购/采购”的零件）
      const normalize = (s: string) => {
        const t = String(s || '').replace(/\s+/g, '').toLowerCase()
        if (!t) return ''
        if (t.includes('外购') || t.includes('waigou') || t.includes('采购')) return '外购'
        return s
      }
      const parts = selectedItems
        .filter(item => item.type === 'part')
        .filter(part => {
          const ms = materialSources.find(ms => String(ms.id) === String(part.material_source_id))
          return !!ms && normalize(ms.name) === '外购'
        })
      parts.forEach(part => {
        if (part.part_name && String(part.part_name).trim()) {
          const material = materials.find(m => m.id === part.material_id)
          const specsText = part.specifications_text || ''
          const model = `${material?.name || ''}${specsText ? '  (' + specsText + ')' : ''}`

          // 从备注中解析需求日期
          let requiredDate = ''
          if (part.remarks && part.remarks.trim()) {
            const dateMatch = part.remarks.match(/\d{4}-\d{2}-\d{2}/)
            if (dateMatch) {
              requiredDate = dateMatch[0]
            }
          }

          const invPart = (part.part_inventory_number && String(part.part_inventory_number).trim()) 
            ? String(part.part_inventory_number) 
            : `PO-${part.tooling_id || 'T'}-${part.id || 'P'}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}`;

          const qty = Number(part.part_quantity ?? 0)
          const unitW = Number(part.weight ?? 0) || calculatePartWeight(part.specifications || {}, part.material_id || '', part.part_category || '', partTypes as any, materials as any)
          const totalW = qty && unitW ? Math.round(qty * unitW * 1000) / 1000 : 0
          const unitPrice = material ? 50 : 0
          const totalPrice = calculateTotalPrice(totalW, unitPrice)
          const ready = !!(String(part.part_name || '').trim() && qty > 0 && String(requiredDate || '').trim())
          if (!ready) return
          purchaseOrders.push({
            inventory_number: invPart,
            project_name: part.project_name || '未命名项目',
            part_name: part.part_name,
            part_quantity: part.part_quantity ?? 0,
            unit: '件',
            model: model,
            supplier: '',
            required_date: requiredDate,
            remark: part.remarks || '',
            created_date: new Date().toISOString(),
            tooling_id: part.tooling_id || null,
            part_id: part.id,
            status: 'pending',
            weight: totalW || 0,
            total_price: totalPrice || 0,
            applicant: part.applicant || '',
            production_unit: part.production_unit || ''
          })
        }
      })

      // 过滤有效订单
      const validOrders = purchaseOrders.filter(order => {
        return order.part_name && 
               order.part_quantity !== null && 
               order.part_quantity !== undefined && 
               order.unit && 
               order.unit.trim()
      })

      if (validOrders.length === 0) {
        message.warning('没有符合条件的数据可以生成采购单：仅生成标准件或材料来源为“外购”的零件，请检查名称、数量、单位与需求日期')
        return null
      }

      const response = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: validOrders })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`服务器错误: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      
      if (result.success) {
        const stats = result.stats || {}
        const messages = []
        if (stats.updated > 0) messages.push(`更新 ${stats.updated} 条`)
        if (stats.inserted > 0) messages.push(`新增 ${stats.inserted} 条`)
        if (stats.skipped > 0) messages.push(`跳过 ${stats.skipped} 条`)
        
        const messageText = messages.length > 0 ? messages.join('，') : `成功处理 ${validOrders.length} 条采购单`
        message.success(messageText)
        // 状态：提计划（写入并广播）
        purchaseOrders.forEach(o => {
          if (o.part_id) localStorage.setItem(`status_part_${o.part_id}`, '提计划')
          if (o.child_item_id) localStorage.setItem(`status_child_${o.child_item_id}`, '提计划')
        })
        window.dispatchEvent(new Event('status_updated'))
        return result
      } else {
        throw new Error(result.error || '生成采购单失败')
      }
    } catch (error) {
      console.error('Failed to create purchase orders:', error)
      message.error('生成采购单失败：' + error)
      return null
    }
  }, [])

  // 计算零件重量
  const calculatePartWeight = useCallback((specifications: any, materialId: string, partType: string, partTypes: any[], materials: any[]) => {
    const currentPartType = partTypes.find(pt => pt.name === partType)
    const formula = currentPartType?.volume_formula || ''
    const material = materials.find(m => m.id === materialId)
    const density = material?.density || 7.85
    
    let weight = 0
    const hasSpecs = specifications && Object.keys(specifications).length > 0
    
    if (hasSpecs && formula) {
      // 将规格对象转换为数值对象进行计算
      const specValues: Record<string, number> = {}
      Object.entries(specifications).forEach(([k, v]) => {
        const numValue = parseFloat(String(v))
        if (!isNaN(numValue)) {
          specValues[k] = numValue
        }
      })
      
      const volume = calculateVolume(formula, specValues) // 计算出的体积单位是 mm³
      const volumeInCm3 = volume / 1000 // 转换为 cm³
      weight = (volumeInCm3 * density) / 1000 // 转换为 kg
    }
    
    return Math.round(weight * 1000) / 1000 // 保留3位小数
  }, [])

  return {
    generateCuttingOrders,
    generatePurchaseOrders,
    calculatePartWeight
  }
}
