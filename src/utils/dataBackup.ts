import * as XLSX from 'xlsx'

export interface BackupData {
  version: string
  timestamp: string
  tooling: any[]
  parts: any[]
  childItems: any[]
}

export class DataBackupManager {
  private static readonly BACKUP_VERSION = 'V1.0.9'

  static createBackup(tooling: any[], parts: any[], childItems: any[]): BackupData {
    return {
      version: this.BACKUP_VERSION,
      timestamp: new Date().toISOString(),
      tooling: JSON.parse(JSON.stringify(tooling)),
      parts: JSON.parse(JSON.stringify(parts)),
      childItems: JSON.parse(JSON.stringify(childItems))
    }
  }

  static async exportBackup(data: BackupData, filename?: string): Promise<void> {
    const defaultFilename = `工装信息备份_${new Date().toISOString().slice(0, 10)}.json`
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename || defaultFilename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  static async exportExcelBackup(data: BackupData, filename?: string): Promise<void> {
    const wb = XLSX.utils.book_new()

    const toolingSheet = XLSX.utils.json_to_sheet(data.tooling)
    XLSX.utils.book_append_sheet(wb, toolingSheet, '工装信息')

    if (data.parts.length > 0) {
      const partsSheet = XLSX.utils.json_to_sheet(data.parts)
      XLSX.utils.book_append_sheet(wb, partsSheet, '零件信息')
    }

    if (data.childItems.length > 0) {
      const childItemsSheet = XLSX.utils.json_to_sheet(data.childItems)
      XLSX.utils.book_append_sheet(wb, childItemsSheet, '标准件信息')
    }

    const defaultFilename = `工装信息备份_${new Date().toISOString().slice(0, 10)}.xlsx`
    XLSX.writeFile(wb, filename || defaultFilename)
  }

  static async importBackup(file: File): Promise<BackupData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string
          const data = JSON.parse(content)
          
          if (!this.validateBackupData(data)) {
            reject(new Error('备份数据格式不正确'))
            return
          }
          
          resolve(data)
        } catch (error) {
          reject(new Error('解析备份数据失败'))
        }
      }
      
      reader.onerror = () => {
        reject(new Error('读取文件失败'))
      }
      
      reader.readAsText(file)
    })
  }

  static async importExcelBackup(file: File): Promise<BackupData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = async (e) => {
        try {
          const data = await file.arrayBuffer()
          const workbook = XLSX.read(data)
          
          const backupData: BackupData = {
            version: this.BACKUP_VERSION,
            timestamp: new Date().toISOString(),
            tooling: [],
            parts: [],
            childItems: []
          }
          
          const toolingSheet = workbook.Sheets['工装信息']
          if (toolingSheet) {
            backupData.tooling = XLSX.utils.sheet_to_json(toolingSheet)
          }
          
          const partsSheet = workbook.Sheets['零件信息']
          if (partsSheet) {
            backupData.parts = XLSX.utils.sheet_to_json(partsSheet)
          }
          
          const childItemsSheet = workbook.Sheets['标准件信息']
          if (childItemsSheet) {
            backupData.childItems = XLSX.utils.sheet_to_json(childItemsSheet)
          }
          
          resolve(backupData)
        } catch (error) {
          reject(new Error('解析Excel备份文件失败'))
        }
      }
      
      reader.onerror = () => {
        reject(new Error('读取Excel文件失败'))
      }
      
      reader.readAsArrayBuffer(file)
    })
  }

  static validateBackupData(data: any): data is BackupData {
    if (!data || typeof data !== 'object') return false
    if (!data.version || typeof data.version !== 'string') return false
    if (!data.timestamp || typeof data.timestamp !== 'string') return false
    if (!Array.isArray(data.tooling)) return false
    if (!Array.isArray(data.parts)) return false
    if (!Array.isArray(data.childItems)) return false
    return true
  }

  static getBackupSummary(data: BackupData): string {
    return `
      备份版本: ${data.version}
      备份时间: ${new Date(data.timestamp).toLocaleString('zh-CN')}
      工装数量: ${data.tooling.length}
      零件数量: ${data.parts.length}
      标准件数量: ${data.childItems.length}
    `
  }

  static compareBackups(backup1: BackupData, backup2: BackupData): {
    toolingDiff: number
    partsDiff: number
    childItemsDiff: number
  } {
    return {
      toolingDiff: backup2.tooling.length - backup1.tooling.length,
      partsDiff: backup2.parts.length - backup1.parts.length,
      childItemsDiff: backup2.childItems.length - backup1.childItems.length
    }
  }
}
