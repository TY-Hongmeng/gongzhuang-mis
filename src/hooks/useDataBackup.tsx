import React, { useState, useCallback } from 'react'
import { message, Modal } from 'antd'
import { DataBackupManager, BackupData } from '../utils/dataBackup'

export const useDataBackup = () => {
  const [loading, setLoading] = useState(false)
  const [backupHistory, setBackupHistory] = useState<BackupData[]>([])

  const createAndExportBackup = useCallback(async (
    tooling: any[],
    parts: any[],
    childItems: any[],
    format: 'json' | 'excel' = 'json'
  ) => {
    try {
      setLoading(true)
      const backupData = DataBackupManager.createBackup(tooling, parts, childItems)
      
      if (format === 'json') {
        await DataBackupManager.exportBackup(backupData)
      } else {
        await DataBackupManager.exportExcelBackup(backupData)
      }
      
      setBackupHistory(prev => [...prev, backupData])
      message.success('备份导出成功')
    } catch (error) {
      message.error('备份导出失败：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setLoading(false)
    }
  }, [])

  const importBackup = useCallback(async (file: File): Promise<BackupData | null> => {
    try {
      setLoading(true)
      const backupData = await DataBackupManager.importBackup(file)
      
      Modal.confirm({
        title: '确认恢复数据',
        content: (
          <div>
            <p>确定要恢复以下备份数据吗？</p>
            <pre style={{ background: '#f5f5f5', padding: 10, borderRadius: 4 }}>
              {DataBackupManager.getBackupSummary(backupData)}
            </pre>
            <p style={{ color: '#faad14', marginTop: 10 }}>
              注意：恢复操作将覆盖当前数据，请确保已做好当前数据的备份！
            </p>
          </div>
        ),
        okText: '确认恢复',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => {
          setBackupHistory(prev => [...prev, backupData])
          message.success('数据恢复成功')
          return backupData
        }
      })
      
      return backupData
    } catch (error) {
      message.error('导入备份失败：' + (error instanceof Error ? error.message : String(error)))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const importExcelBackup = useCallback(async (file: File): Promise<BackupData | null> => {
    try {
      setLoading(true)
      const backupData = await DataBackupManager.importExcelBackup(file)
      
      Modal.confirm({
        title: '确认恢复数据',
        content: (
          <div>
            <p>确定要恢复以下备份数据吗？</p>
            <pre style={{ background: '#f5f5f5', padding: 10, borderRadius: 4 }}>
              {DataBackupManager.getBackupSummary(backupData)}
            </pre>
            <p style={{ color: '#faad14', marginTop: 10 }}>
              注意：恢复操作将覆盖当前数据，请确保已做好当前数据的备份！
            </p>
          </div>
        ),
        okText: '确认恢复',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => {
          setBackupHistory(prev => [...prev, backupData])
          message.success('数据恢复成功')
          return backupData
        }
      })
      
      return backupData
    } catch (error) {
      message.error('导入Excel备份失败：' + (error instanceof Error ? error.message : String(error)))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const clearBackupHistory = useCallback(() => {
    setBackupHistory([])
    message.success('备份历史已清除')
  }, [])

  const getLatestBackup = useCallback((): BackupData | null => {
    if (backupHistory.length === 0) return null
    return backupHistory[backupHistory.length - 1]
  }, [backupHistory])

  return {
    loading,
    backupHistory,
    createAndExportBackup,
    importBackup,
    importExcelBackup,
    clearBackupHistory,
    getLatestBackup
  }
}
