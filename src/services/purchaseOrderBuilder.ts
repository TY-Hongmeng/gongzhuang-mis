import { formatSpecificationsForProduction } from '../utils/productionFormat'

export function buildOrdersFromManual(manualSelected: any[], backupSelected: any[], userRealName?: string) {
  const orders: any[] = []

  manualSelected.forEach(r => {
    const qtyStr = String(r.part_quantity ?? '').trim()
    const qty = qtyStr === '' ? 0 : (isNaN(parseInt(qtyStr, 10)) ? 0 : parseInt(qtyStr, 10))
    orders.push({
      inventory_number: `MANUAL-${r.id}`,
      project_name: r.project_name || '临时计划',
      part_name: String(r.part_name || '').trim(),
      part_quantity: qty,
      unit: (String(r.unit ?? '').trim() || '件'),
      model: String(r.model || '').trim(),
      supplier: '',
      required_date: String(r.demand_date || '').trim(),
      remark: String(r.remark || '').trim(),
      created_date: new Date().toISOString(),
      production_unit: String(r.production_unit || '').trim(),
      demand_date: String(r.demand_date || '').trim(),
      applicant: String(r.applicant || userRealName || '手动录入'),
      status: 'pending'
    })
  })

  backupSelected.forEach(r => {
    const qtyStr = String(r.quantity ?? '').trim()
    const qty = qtyStr === '' ? 0 : (isNaN(parseInt(qtyStr, 10)) ? 0 : parseInt(qtyStr, 10))
    const specsText = (() => {
      const s = r.specifications as any
      if (s && typeof s === 'object' && Object.keys(s).length > 0) {
        return formatSpecificationsForProduction(s, r.material_type || '')
      }
      return String(r.model || '').trim()
    })()
    const modelText = `${String(r.material || '').trim()}${specsText ? ' (' + specsText + ')' : ''}`
    orders.push({
      inventory_number: `BACKUP-${r.id}`,
      project_name: r.project_name || '临时计划',
      part_name: String(r.material_name || '').trim(),
      part_quantity: qty,
      unit: (String(r.unit ?? '').trim() || '件'),
      model: modelText,
      supplier: String(r.supplier || '').trim(),
      required_date: String(r.demand_date || '').trim(),
      remark: String(r.remark || '').trim(),
      created_date: new Date().toISOString(),
      production_unit: '',
      demand_date: String(r.demand_date || '').trim(),
      applicant: String(userRealName || '手动录入'),
      status: 'pending'
    })
  })

  const validOrders = orders.filter(o => o.part_name && o.unit && String(o.unit).trim() && o.part_quantity !== null && o.part_quantity !== undefined)
  return validOrders
}
