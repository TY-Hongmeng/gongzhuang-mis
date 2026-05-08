import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, message, DatePicker, Select, Card, Row, Col, Space, Tag, Input, Typography } from 'antd';
import { ReloadOutlined, LeftOutlined, ScissorOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx'
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useAuthStore } from '../stores/authStore';
import { fetchWithFallback } from '../utils/api'

const { RangePicker } = DatePicker;
const { Option } = Select;

interface CuttingOrder {
  id: string;
  inventory_number: string;
  project_name: string;
  part_drawing_number: string;
  part_name: string;
  material: string;
  specifications: string;
  part_quantity: number;
  total_weight?: number | string;
  remarks?: string;
  material_source: string;
  created_date: string;
  tooling_id: string;
  tooling_info_id?: string;
  part_id: string;
  part_category?: string;
  tooling_info?: {
    responsible_person_id: string | null;
  };
}

const normalizeHeatTreatmentText = (value: any) => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const low = raw.toLowerCase()
  if (['false', '0', '否', 'no', 'null', 'undefined', 'none', '-'].includes(low)) return ''
  if (['true', '1', '是', 'yes'].includes(low)) return '需调质'
  return raw
}

const CuttingManagement: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuthStore()
  const DEBUG = (import.meta as any)?.env?.DEV === true
  const [userTeamsMap, setUserTeamsMap] = useState<Record<string, string>>({})
  const [idToNameMap, setIdToNameMap] = useState<Record<string, string>>({})
  const isTechnician = /技术员|技术人员|技术/.test(String(user?.roles?.name || ''))
  const myTeamName = React.useMemo(() => {
    const rn = String(user?.real_name || '')
    return userTeamsMap[rn] || ''
  }, [user, userTeamsMap])
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CuttingOrder[]>([]);
  const [qtyDraftMap, setQtyDraftMap] = useState<Record<string, string>>({});
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [queryTime, setQueryTime] = useState<number>(0); // 查询耗时
  const [groupedData, setGroupedData] = useState<Record<string, CuttingOrder[]>>({}); // 分组数据
  const [filters, setFilters] = useState({
    material_source: '',
    dateRange: null as any,
    search: ''
  });
  const [responsibleMap, setResponsibleMap] = useState<Record<string, string>>({})
  const [sortMode, setSortMode] = useState<'inventory' | 'spec'>('inventory')
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10000,  // 修改为10000，获取所有数据
    total: 0
  });
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);
  const locationKeyRef = useRef(location.key);
  const abortRef = useRef<AbortController | null>(null);
  const getToolingId = useCallback((order: CuttingOrder) => {
    return String(order.tooling_id || order.tooling_info_id || '').trim()
  }, [])

  // 自动排序函数 - 根据规格进行智能排序
  const sortOrdersBySpecifications = (orders: CuttingOrder[]) => {
    if (DEBUG) console.log('=== 开始自动排序 ===');
    if (DEBUG) console.log('待排序订单数量:', orders.length, 'orders');
    if (DEBUG) console.log('排序规则:');
    if (DEBUG) console.log('  - 圆料(含φ): 按直径排序，如 φ20*30 → 直径20');
    if (DEBUG) console.log('  - 板料: 按最后一组数字(厚度)排序，如 20*30*5 → 厚度5');
    
    // 显示排序前的数据样本
    if (orders.length > 0) {
      if (DEBUG) console.log('排序前样本:');
      orders.slice(0, 3).forEach((order, index) => {
        if (DEBUG) console.log(`  ${index + 1}. 材质:${order.material} 规格:${order.specifications}`);
      });
    }
    
    const sortedOrders = orders.sort((a, b) => {
      // 首先按材质排序
      if (a.material !== b.material) {
        return a.material.localeCompare(b.material);
      }
      
      // 解析规格进行排序
      const specA = a.specifications || '';
      const specB = b.specifications || '';
      
      // 检查是否为圆料或圆环料 (包含φ符号)
      const isRoundA = specA.includes('φ');
      const isRoundB = specB.includes('φ');
      
      if (isRoundA && isRoundB) {
        // 都是圆料，按直径排序
        const diameterA = parseFloat(specA.match(/φ(\d+(?:\.\d+)?)/)?.[1] || '0');
        const diameterB = parseFloat(specB.match(/φ(\d+(?:\.\d+)?)/)?.[1] || '0');
        return diameterA - diameterB;
      } else if (isRoundA) {
        // A是圆料，B不是，A排在后面
        return 1;
      } else if (isRoundB) {
        // B是圆料，A不是，B排在后面
        return -1;
      } else {
        // 都是板料，按厚度排序 (最后一组数字为厚度)
        const thicknessMatchA = specA.match(/(\d+(?:\.\d+)?)$/);
        const thicknessMatchB = specB.match(/(\d+(?:\.\d+)?)$/);
        const thicknessA = parseFloat(thicknessMatchA?.[1] || '0');
        const thicknessB = parseFloat(thicknessMatchB?.[1] || '0');
        
        if (DEBUG) console.log(`板料排序: A="${specA}" 厚度=${thicknessA} (匹配:${thicknessMatchA?.[1]}) | B="${specB}" 厚度=${thicknessB} (匹配:${thicknessMatchB?.[1]}) | 结果:${thicknessA - thicknessB}`);
        return thicknessA - thicknessB;
      }
    });
    
    // 显示排序后的数据样本
    if (sortedOrders.length > 0) {
      if (DEBUG) console.log('排序后样本:');
      sortedOrders.slice(0, 3).forEach((order, index) => {
        if (DEBUG) console.log(`  ${index + 1}. 材质:${order.material} 规格:${order.specifications}`);
      });
    }
    
    if (DEBUG) console.log('=== 自动排序完成 ===');
    return sortedOrders;
  };

  // 按盘存编号排序（默认）
  const sortOrdersByInventory = (orders: CuttingOrder[]) => {
    return orders.sort((a, b) => {
      const invA = String(a.inventory_number || '')
      const invB = String(b.inventory_number || '')
      return invA.localeCompare(invB, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
    })
  }

  // 分组函数 - 包含编制信息
  const groupDataByDateMaterialAndResponsible = (
    orders: CuttingOrder[],
    responsiblePersonMap: Record<string, string>,
    mode: 'inventory' | 'spec'
  ) => {
    const groups: Record<string, CuttingOrder[]> = {};
    
    if (DEBUG) console.log(`=== 开始分组处理 ===`);
    if (DEBUG) console.log(`输入订单数量: ${orders.length}`);
    if (DEBUG) console.log(`编制信息映射:`, responsiblePersonMap);
    
    // 检查是否有重复的ID
    const idSet = new Set();
    const duplicateIds: string[] = [];
    
    // 统计分组键的分布情况
    const groupKeyStats: Record<string, number> = {};
    
    orders.forEach((order, index) => {
      if (idSet.has(order.id)) {
        duplicateIds.push(order.id);
        console.error(`发现重复ID: ${order.id} 在第${index + 1}个位置`);
      }
      idSet.add(order.id);
      
      const date = dayjs(order.created_date).format('YYYY-MM-DD');
      const material = order.material_source || '未知';
      const toolingKey = getToolingId(order)
      const responsiblePerson = (toolingKey && responsiblePersonMap[toolingKey]) ? responsiblePersonMap[toolingKey] : '未分配';
      const groupKey = `${date}_${material}_${responsiblePerson}`;
      
      // 统计分组键出现次数
      groupKeyStats[groupKey] = (groupKeyStats[groupKey] || 0) + 1;
      
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(order);
    });
    
    // 分析分组键分布
    const uniqueGroupKeys = Object.keys(groupKeyStats);
    const groupSizeDistribution = Object.values(groupKeyStats).sort((a, b) => b - a);
    
    if (DEBUG) console.log(`分组键分析:`, {
      唯一分组键数量: uniqueGroupKeys.length,
      分组大小分布: groupSizeDistribution,
      最大分组: Math.max(...groupSizeDistribution),
      最小分组: Math.min(...groupSizeDistribution),
      平均分组大小: groupSizeDistribution.reduce((sum, size) => sum + size, 0) / groupSizeDistribution.length
    });
    
    // 显示前几个分组键的详情
    const topGroups = Object.entries(groupKeyStats)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
    
    if (DEBUG) console.log(`最大的5个分组:`, topGroups.map(([key, count]) => ({ key, count })));
    
    if (duplicateIds.length > 0) {
      console.error(`发现${duplicateIds.length}个重复ID:`, duplicateIds);
    }
    
    // 统计分组结果
    const totalInGroups = Object.values(groups).reduce((sum, group) => sum + group.length, 0);
    if (DEBUG) console.log(`分组统计:`, {
      输入订单总数: orders.length,
      唯一ID数量: idSet.size,
      分组数量: Object.keys(groups).length,
      各分组数量: Object.entries(groups).map(([key, group]) => ({ key, count: group.length })),
      分组内订单总数: totalInGroups
    });
    
    if (totalInGroups !== orders.length) {
      console.error(`数据丢失警告: 输入${orders.length}条，分组后${totalInGroups}条`);
    }
    
    // 对每个分组内的订单进行排序
    if (DEBUG) console.log('开始对每个分组进行排序...');
    Object.keys(groups).forEach(groupKey => {
      if (DEBUG) console.log(`分组 "${groupKey}" 有 ${groups[groupKey].length} 个订单`);
      groups[groupKey] = mode === 'spec'
        ? sortOrdersBySpecifications(groups[groupKey])
        : sortOrdersByInventory(groups[groupKey])
    });
    
    if (DEBUG) console.log('分组和排序完成！');
    return groups;
  };

  const materialSourceOptions = [
    { value: '火切', label: '火切' },
    { value: '锯切', label: '锯切' }
  ];

  // 获取编制信息映射
  const fetchResponsiblePersonMap = async (toolingIds: string[]) => {
    if (toolingIds.length === 0) return {};
    
    try {
      const uniqueIds = [...new Set(toolingIds)];
      console.log('Fetching responsible person for tooling IDs:', uniqueIds);
      
      const params = new URLSearchParams();
      uniqueIds.forEach(id => params.append('ids', id));
      
      const url = `/api/tooling/batch?${params.toString()}`;
      console.log('Requesting responsible person data:', url);
      
      const response = await fetchWithFallback(url);
      console.log('Responsible person response status:', response.status);
      
      const result = await response.json();
      console.log('Responsible person result:', result);

      const items = Array.isArray(result?.items)
        ? result.items
        : Array.isArray(result?.data)
          ? result.data
          : [];

      if (items.length > 0) {
        const map: Record<string, string> = {};
        items.forEach((tooling: any) => {
          const name = String(tooling?.recorder || '').trim();
          map[tooling.id] = name || '未分配';
        });
        console.log('Responsible person map:', map);
        return map;
      }
    } catch (error) {
      console.error('获取编制信息失败:', error);
    }
    
    return {};
  };

  const fetchCuttingOrders = async (page = 1, pageSize = 10000) => {  // 请求大量数据，相当于获取所有数据
    setLoading(true);
    console.log(`=== 开始获取下料单数据 ===`);
    console.log(`请求参数: page=${page}, pageSize=${pageSize}`);
    console.log(`当前筛选条件:`, filters);
    
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('pageSize', pageSize.toString());
      
      if (filters.material_source) {
        params.append('material_source', filters.material_source);
      }
      if (filters.dateRange && filters.dateRange.length === 2) {
        params.append('startDate', dayjs(filters.dateRange[0]).format('YYYY-MM-DD'));
        params.append('endDate', dayjs(filters.dateRange[1]).format('YYYY-MM-DD'));
      }
      if (filters.search) {
        params.append('keyword', filters.search);
      }

      const url = `/api/cutting-orders?${params.toString()}&_ts=${Date.now()}`;
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      const response = await fetchWithFallback(url, { signal: abortRef.current.signal });
      
      let result;
      try {
        result = await response.json();
        console.log('Response data:', result);
      } catch (jsonError) {
        console.error('JSON parsing error:', jsonError);
        console.error('Response text:', await response.text());
        throw new Error('解析响应数据失败');
      }

      if (result.success) {
        console.log('=== API数据接收完成 ===');
        console.log('API返回数据概况:', {
          返回记录数: result.items?.length || 0,
          总记录数: result.total,
          查询耗时: result.queryTime,
          当前页: result.page,
          每页大小: result.pageSize
        });
        
        // 确保result.items存在且是数组
        if (!result.items || !Array.isArray(result.items)) {
          console.warn('API返回的数据格式不正确，items字段缺失或不是数组');
          setData([]);
          setGroupedData({});
          setPagination(prev => ({
            ...prev,
            current: page,
            pageSize: pageSize,
            total: 0
          }));
          return;
        }
        
        if (result.items.length > 0) {
          console.log(`收到${result.items.length}条数据，开始详细分析...`);
          
          // 分析所有数据的关键字段
          const dataAnalysis = {
            总数: result.items.length,
            有工装ID的数量: result.items.filter((item: any) => item.tooling_id).length,
            无工装ID的数量: result.items.filter((item: any) => !item.tooling_id).length,
            材料来源分布: result.items.reduce((acc: any, item: any) => {
              acc[item.material_source] = (acc[item.material_source] || 0) + 1;
              return acc;
            }, {}),
            创建日期分布: result.items.reduce((acc: any, item: any) => {
              const date = dayjs(item.created_date).format('YYYY-MM-DD');
              acc[date] = (acc[date] || 0) + 1;
              return acc;
            }, {})
          };
          
          console.log('数据完整分析:', dataAnalysis);
          
          console.log('前10条数据详情:', result.items.slice(0, 10).map((item: any, index: number) => ({
            序号: index + 1,
            ID: item.id,
            盘存编号: item.inventory_number,
            项目名称: item.project_name,
            零件名称: item.part_name,
            材质: item.material,
            规格: item.specifications,
            材料来源: item.material_source,
            创建日期: item.created_date,
            工装ID: item.tooling_id || '无'
          })));
        }
        
        // 预取用户映射（本地变量用于本次过滤；同时更新state用于后续渲染）
        let localNameToTeam: Record<string, string> = {}
        let localIdToName: Record<string, string> = {}
        try {
          const uresp = await fetchWithFallback('/api/tooling/users/basic')
          const ujs = await uresp.json()
          ;(ujs.items || []).forEach((u: any) => { localNameToTeam[String(u.real_name || '')] = String(u.team || '') })
          setUserTeamsMap(localNameToTeam)
        } catch {}
        try {
          const allUsers = await fetchWithFallback('/api/users')
          const uj = await allUsers.json()
          ;(uj.items || []).forEach((u: any) => { localIdToName[String(u.id)] = String(u.real_name || '') })
          setIdToNameMap(localIdToName)
        } catch {}

        let items = result.items as CuttingOrder[]
        setQueryTime(result.queryTime || 0);
        
        // 获取编制信息 - 确保items存在
        const toolingIds = result.items
          .map((order: CuttingOrder) => getToolingId(order))
          .filter(Boolean);
        console.log('需要获取编制信息的工装ID数量:', toolingIds.length);
        console.log('具体工装ID列表:', toolingIds);
        
        const responsiblePersonMap = await fetchResponsiblePersonMap(toolingIds);
        console.log('编制信息映射结果:', responsiblePersonMap);
        setResponsibleMap(responsiblePersonMap)
        
        // 对数据进行分组（包含编制信息）
        console.log('开始分组处理...');
        // 技术员仅显示同技术组人员；当无法识别技术组或未分配时不过滤
        if (isTechnician) {
          const myTeamLocal = String(localNameToTeam[String(user?.real_name || '')] || '').trim()
          if (myTeamLocal) {
            items = items.filter((order: any) => {
              const tid = getToolingId(order)
              const rawResp = String((tid && responsiblePersonMap[tid]) || '').trim()
              const byIdName = localIdToName[rawResp]
              const name = String(byIdName || rawResp).trim()
              const team = String(localNameToTeam[name] || '').trim()
              if (!team) return true
              return team === myTeamLocal
            })
          }
        }
        const groups = groupDataByDateMaterialAndResponsible(items, responsiblePersonMap, sortMode);
        setData(items)
        
        console.log('=== 最终分组结果 ===');
        console.log('分组处理完成，结果概况:', {
          分组数量: Object.keys(groups).length,
          各分组详细情况: Object.entries(groups).map(([key, orders]) => ({ 
            分组键: key, 
            记录数: orders.length,
            分组信息: key.split('_')
          })),
          可见记录总数: Object.values(groups).reduce((sum, orders) => sum + orders.length, 0)
        });
        
        setGroupedData(groups);
        
        setPagination(prev => ({
          ...prev,
          current: page,
          pageSize: pageSize,
          total: result.total
        }));
        
        console.log('=== 数据获取和处理完成 ===');
      } else {
        message.error('获取下料单失败：' + result.error);
      }
    } catch (error) {
      console.error('获取下料单失败:', error);
      message.error('获取下料单失败: ' + (error instanceof Error ? error.message : String(error)));
      // 发生错误时重置数据
      setData([]);
      setGroupedData({});
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize: pageSize,
        total: 0
      }));
    } finally {
      setLoading(false);
    }
  };

  // 优化的防抖搜索
  const debouncedSearch = useCallback(
    (searchValue: string) => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      
      fetchTimeoutRef.current = setTimeout(() => {
        setFilters(prev => ({ ...prev, search: searchValue }));
      }, 800);
    },
    []
  );

  useEffect(() => {
    // 初始加载优化
    if (isInitialMount.current) {
      fetchCuttingOrders(1, 10000);  // 获取所有数据
      isInitialMount.current = false;
      locationKeyRef.current = location.key;
      return;
    }
    
    // 路由变化时刷新数据（例如从ToolingInfo导航过来）
    if (location.key !== locationKeyRef.current) {
      fetchCuttingOrders(1, 10000);  // 获取所有数据
      locationKeyRef.current = location.key;
      return;
    }
    
    // 防抖处理，避免频繁API调用
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    fetchTimeoutRef.current = setTimeout(() => {
      fetchCuttingOrders(1, 10000); // 筛选条件变化时获取所有数据
    }, 300);

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [filters, pagination.pageSize, location.key]);

  // 切换排序模式时，本地重排分组，无需重新请求
  useEffect(() => {
    if (!data.length) {
      setGroupedData({})
      return
    }
    const groups = groupDataByDateMaterialAndResponsible([...data], responsibleMap, sortMode)
    setGroupedData(groups)
  }, [data, responsibleMap, sortMode])

  const handleDelete = async (id: string) => {
    try {
      const response = await fetchWithFallback('/api/cutting-orders/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] })
      });
      const result = await response.json();

      if (result.success) {
        message.success('删除成功');
        fetchCuttingOrders(pagination.current, 10000);
      } else {
        message.error('删除失败：' + result.error);
      }
    } catch (error) {
      console.error('删除失败:', error);
      message.error('删除失败');
    }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请选择要删除的下料单');
      return;
    }

    try {
      const response = await fetch('/api/cutting-orders/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedRowKeys })
      });
      const result = await response.json();

      if (result.success) {
        const deletedCount = result.deleted || selectedRowKeys.length;
        message.success(`成功删除 ${deletedCount} 条下料单`);
        
        // 乐观更新：立即从本地移除
        setData(prev => prev.filter(item => !selectedRowKeys.includes(item.id)));
        
        // 更新分组数据，移除已删除项，并清理空分组
        setGroupedData(prev => {
          const next: Record<string, any[]> = {}
          Object.entries(prev).forEach(([key, orders]) => {
            const newOrders = orders.filter(o => !selectedRowKeys.includes(o.id));
            if (newOrders.length > 0) {
              next[key] = newOrders;
            }
          })
          return next
        })
        
        // 更新分页总数
        setPagination(prev => ({
          ...prev,
          total: Math.max(0, prev.total - deletedCount)
        }));
        
        setSelectedRowKeys([]);
        // 移除重新请求，避免闪烁
        // fetchCuttingOrders(pagination.current, 10000);
      } else {
        message.error('批量删除失败：' + result.error);
      }
    } catch (error) {
      console.error('批量删除失败:', error);
      message.error('批量删除失败');
    }
  };

  const updateQuantity = useCallback(async (record: CuttingOrder, rawValue: string) => {
    const text = String(rawValue ?? '').trim()
    if (!text) {
      message.warning('数量不能为空')
      return
    }
    const nextQty = Number(text)
    if (!Number.isFinite(nextQty) || nextQty <= 0) {
      message.warning('数量必须大于0')
      return
    }
    const currentQty = Number(record.part_quantity || 0)
    if (currentQty > 0 && Math.abs(nextQty - currentQty) < 1e-9) {
      setQtyDraftMap(prev => ({ ...prev, [record.id]: '' }))
      return
    }

    const currentWeight = Number(record.total_weight || 0)
    const nextWeight = (Number.isFinite(currentWeight) && currentQty > 0)
      ? Math.round((currentWeight / currentQty) * nextQty * 1000) / 1000
      : currentWeight

    try {
      const response = await fetchWithFallback(`/api/cutting-orders/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part_quantity: nextQty, total_weight: nextWeight })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || `更新失败(${response.status})`)
      }

      const updatedQty = Number(result?.data?.part_quantity ?? nextQty)
      const updatedWeight = Number(result?.data?.total_weight ?? nextWeight)
      setData(prev => prev.map(it => it.id === record.id ? {
        ...it,
        part_quantity: updatedQty,
        total_weight: Number.isFinite(updatedWeight) ? updatedWeight : it.total_weight
      } : it))
      setGroupedData(prev => {
        const next: Record<string, CuttingOrder[]> = {}
        Object.entries(prev).forEach(([key, orders]) => {
          next[key] = orders.map(it => it.id === record.id ? {
            ...it,
            part_quantity: updatedQty,
            total_weight: Number.isFinite(updatedWeight) ? updatedWeight : it.total_weight
          } : it)
        })
        return next
      })
      setQtyDraftMap(prev => ({ ...prev, [record.id]: '' }))
      message.success('数量已更新')
    } catch (error) {
      console.error('更新下料单数量失败:', error)
      message.error('更新数量失败')
    }
  }, [])

  const columns: ColumnsType<CuttingOrder> = [
    {
      title: '序号',
      key: 'sequence',
      width: 60,
      align: 'center',
      render: (_, __, index) => index + 1
    },
    {
      title: '盘存编号',
      dataIndex: 'inventory_number',
      key: 'inventory_number',
      width: 120
    },
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 150
    },
    {
      title: '图号',
      dataIndex: 'part_drawing_number',
      key: 'part_drawing_number',
      width: 120
    },
    {
      title: '零件名称',
      dataIndex: 'part_name',
      key: 'part_name',
      width: 150
    },
    {
      title: '材质',
      dataIndex: 'material',
      key: 'material',
      width: 120
    },
    {
      title: '规格',
      dataIndex: 'specifications',
      key: 'specifications',
      width: 200,
      ellipsis: true,
      render: (specifications: string) => (
        <span>{specifications}</span>
      )
    },
    {
      title: '数量',
      dataIndex: 'part_quantity',
      key: 'part_quantity',
      width: 100,
      align: 'center',
      render: (qty: number, record: CuttingOrder) => (
        <Input
          value={Object.prototype.hasOwnProperty.call(qtyDraftMap, record.id) && qtyDraftMap[record.id] !== '' ? qtyDraftMap[record.id] : String(qty ?? '')}
          onChange={(e) => {
            const v = e.target.value
            setQtyDraftMap(prev => ({ ...prev, [record.id]: v }))
          }}
          onPressEnter={(e) => {
            e.preventDefault()
            void updateQuantity(record, qtyDraftMap[record.id] ?? String(qty ?? ''))
          }}
          onBlur={() => {
            void updateQuantity(record, qtyDraftMap[record.id] ?? String(qty ?? ''))
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          size="small"
          style={{ textAlign: 'center' }}
        />
      )
    },
    {
      title: '重量(kg)',
      dataIndex: 'total_weight',
      key: 'total_weight',
      width: 100,
      align: 'center',
      render: (tw: number | string | undefined) => {
        const total = typeof tw === 'string' ? parseFloat(tw) : tw;
        if (typeof total === 'number' && !isNaN(total)) return <span>{total.toFixed(3)}</span>;
        return <span>-</span>;
      }
    },
    {
      title: '热处理',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 140,
      align: 'center',
      render: (remarks: string | undefined) => {
        return <span>{normalizeHeatTreatmentText(remarks) || '-'}</span>
      }
    }
  ];

  const rowSelection = React.useMemo(() => ({
    selectedRowKeys,
    onChange: (newSelectedRowKeys: React.Key[]) => {
      setSelectedRowKeys(newSelectedRowKeys);
    }
  }), [selectedRowKeys]);

  const exportSelected = () => {
    if (selectedRowKeys.length === 0) { message.warning('请选择要导出的记录'); return }
    const setIds = new Set(selectedRowKeys.map(String))
    const rows = data.filter(d => setIds.has(String(d.id)))
    if (rows.length === 0) { message.warning('没有可导出的记录'); return }
    const sortedRows = sortOrdersBySpecifications([...rows])
    const dateSet = new Set(sortedRows.map(r => dayjs(r.created_date).format('YYYY年MM月DD日')))
    const dateText = dateSet.size === 1 ? Array.from(dateSet)[0] : `${Array.from(dateSet)[0]} 等`
    const sourceSet = new Set(sortedRows.map(r => r.material_source || ''))
    const sourceText = sourceSet.size === 1 ? Array.from(sourceSet)[0] : '混合'
    const firstToolingId = sortedRows[0] ? getToolingId(sortedRows[0]) : ''
    const rawResp = firstToolingId ? (responsibleMap[firstToolingId] || '') : ''
    const compiledName = rawResp ? (idToNameMap[String(rawResp)] || rawResp) : ''
    const compiledText = compiledName && compiledName !== '未分配' ? `编制: ${compiledName}` : '编制: '

    const headers = ['序号','盘存编号','项目名称','图号','零件名称','材质','规格','数量','重量(kg)','热处理']
    const aoa: any[][] = []
    aoa.push([dateText, sourceText, compiledText, `共 ${sortedRows.length} 条记录`])
    aoa.push([])
    aoa.push(headers)
    sortedRows.forEach((o, i) => {
      const weightNum = Number(o.total_weight || 0)
      aoa.push([
        i + 1,
        o.inventory_number,
        o.project_name,
        o.part_drawing_number,
        o.part_name,
        o.material,
        o.specifications,
        o.part_quantity,
        Number.isFinite(weightNum) ? Number(weightNum.toFixed(3)) : '',
        normalizeHeatTreatmentText(o.remarks)
      ])
    })
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '下料单')
    XLSX.writeFile(wb, `下料单_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`)
  }

  const escapeHtml = (value: any) => {
    const text = String(value ?? '')
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  const printSelected = () => {
    if (selectedRowKeys.length === 0) { message.warning('请选择要打印的记录'); return }
    const setIds = new Set(selectedRowKeys.map(String))
    const rows = data.filter(d => setIds.has(String(d.id)))
    if (rows.length === 0) { message.warning('没有可打印的记录'); return }

    const sortedRows = sortOrdersBySpecifications([...rows])
    const dateSet = new Set(sortedRows.map(r => dayjs(r.created_date).format('YYYY年MM月DD日')))
    const dateText = dateSet.size === 1 ? Array.from(dateSet)[0] : `${Array.from(dateSet)[0]} 等`
    const sourceSet = new Set(sortedRows.map(r => r.material_source || ''))
    const sourceText = sourceSet.size === 1 ? Array.from(sourceSet)[0] : '混合'
    const firstToolingId = sortedRows[0] ? getToolingId(sortedRows[0]) : ''
    const rawResp = firstToolingId ? (responsibleMap[firstToolingId] || '') : ''
    const compiledName = rawResp ? (idToNameMap[String(rawResp)] || rawResp) : ''
    const compiledText = compiledName && compiledName !== '未分配' ? `编制: ${compiledName}` : '编制: '

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      message.error('无法打开打印窗口，请检查浏览器弹窗设置')
      return
    }

    const rowsHtml = sortedRows.map((o, i) => {
      const weightNum = Number(o.total_weight || 0)
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(o.inventory_number)}</td>
          <td>${escapeHtml(o.project_name)}</td>
          <td>${escapeHtml(o.part_drawing_number)}</td>
          <td>${escapeHtml(o.part_name)}</td>
          <td>${escapeHtml(o.material)}</td>
          <td>${escapeHtml(o.specifications)}</td>
          <td>${escapeHtml(o.part_quantity)}</td>
          <td>${Number.isFinite(weightNum) ? weightNum.toFixed(3) : ''}</td>
          <td>${escapeHtml(normalizeHeatTreatmentText(o.remarks))}</td>
        </tr>
      `
    }).join('')

    const html = `
      <html>
        <head>
          <title>下料单打印</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }
            h1 { font-size: 18px; margin: 0 0 8px; }
            .meta { margin-bottom: 8px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #333; padding: 4px 6px; text-align: center; }
            th { background: #f3f3f3; }
          </style>
        </head>
        <body>
          <h1>下料单</h1>
          <div class="meta">${escapeHtml(dateText)} / ${escapeHtml(sourceText)} / ${escapeHtml(compiledText)} / 共 ${sortedRows.length} 条</div>
          <table>
            <thead>
              <tr>
                <th>序号</th>
                <th>盘存编号</th>
                <th>项目名称</th>
                <th>图号</th>
                <th>零件名称</th>
                <th>材质</th>
                <th>规格</th>
                <th>数量</th>
                <th>重量(kg)</th>
                <th>热处理</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <Typography.Title level={2} className="mb-0">
            <ScissorOutlined className="text-3xl text-orange-500 mb-2 mr-2" /> 下料管理
          </Typography.Title>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => fetchCuttingOrders(1, 10000)} disabled={loading}>刷新</Button>
            <Button icon={<LeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
          </Space>
        </div>
        
        {/* 筛选条件 */}
        <Card size="small" className="mb-4">
          <Row gutter={16} align="middle" justify="space-between">
            {/* 左侧：搜索、材料来源、创建日期（选择即筛选） */}
            <Col>
              <Space size={24}>
                <span className="flex items-center">
                  <span className="mr-2 text-gray-700 font-medium">搜索：</span>
                  <Input
                    placeholder="盘存编号/项目名称/图号/零件名称"
                    className="w-56"
                    value={filters.search}
                    onChange={(e) => debouncedSearch(e.target.value)}
                    allowClear
                  />
                </span>
                <span className="flex items-center">
                  <span className="mr-2 text-gray-700 font-medium">材料来源：</span>
                  <Select
                    className="w-32"
                    placeholder="全部"
                    allowClear
                    value={filters.material_source}
                    onChange={(value) => setFilters(prev => ({ ...prev, material_source: value }))}
                  >
                    {materialSourceOptions.map(option => (
                      <Option key={option.value} value={option.value}>
                        {option.label}
                      </Option>
                    ))}
                  </Select>
                </span>
                <span className="flex items-center">
                  <span className="mr-2 text-gray-700 font-medium">创建日期：</span>
                  <RangePicker
                    value={filters.dateRange}
                    onChange={(dates) => setFilters(prev => ({ ...prev, dateRange: dates }))}
                    className="w-64"
                  />
                </span>
              </Space>
            </Col>
            {/* 右侧区域留空或扩展 */}
          </Row>
        </Card>

        {/* 批量操作 */}
        <div className="mb-4">
          <Space>
            <span>已选择 {selectedRowKeys.length} 条记录</span>
            <Button onClick={() => setSortMode(prev => (prev === 'inventory' ? 'spec' : 'inventory'))}>
              {sortMode === 'inventory' ? '切换当前排序' : '按盘存号排序'}
            </Button>
            <Button 
              danger 
              onClick={handleBatchDelete}
              disabled={selectedRowKeys.length === 0}
            >
              批量删除
            </Button>
            <Button onClick={printSelected} disabled={selectedRowKeys.length === 0}>
              打印
            </Button>
            <Button onClick={exportSelected} disabled={selectedRowKeys.length === 0}>
              导出下料单
            </Button>
          </Space>
        </div>

        {/* 分组显示列表 */}
        <div className="space-y-6">
          {Object.entries(groupedData).length === 0 && !loading ? (
            <div className="text-center text-gray-500 py-8">
              暂无下料单数据
            </div>
          ) : (
            Object.entries(groupedData).map(([groupKey, orders]) => {
              const [date, material, responsiblePerson] = groupKey.split('_');
              const formattedDate = dayjs(date).format('YYYY年MM月DD日');
              
              return (
                <div key={groupKey} className="border rounded-lg">
                  {/* 分组标题 */}
                  <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <h3 className="text-lg font-semibold text-gray-800">
                        {formattedDate}
                      </h3>
                      <Tag color={material === '火切' ? 'red' : 'blue'} className="text-lg font-semibold">
                        {material}
                      </Tag>
                      <span className="text-gray-600 text-lg font-semibold">
                        编制: {idToNameMap[String(responsiblePerson)] || responsiblePerson}
                      </span>
                      <span className="text-gray-600 text-sm">
                        共 {orders.length} 条记录
                      </span>
                    </div>
                  </div>
                  
                  {/* 分组内表格 */}
                  <div className="p-0">
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={orders}
                      columns={columns}
                      scroll={{ y: 400 }}
                      rowSelection={{
                        selectedRowKeys: selectedRowKeys.filter(key => 
                          orders.some(order => order.id === key)
                        ),
                        onChange: (newSelectedRowKeys) => {
                          // 更新总的选中状态
                          const otherSelectedKeys = selectedRowKeys.filter(key => 
                            !orders.some(order => order.id === key)
                          );
                          setSelectedRowKeys([...otherSelectedKeys, ...newSelectedRowKeys]);
                        }
                      }}
                      pagination={false}
                      className="border-0"
                    />
                  </div>
                </div>
              );
            })
          )}
          
          {/* 总分页 */}
          {pagination.total > 0 && (
            <div className="flex justify-center mt-6">
              <div className="bg-white px-4 py-2 rounded-lg border">
                <span className="text-gray-600">
                    共 {Object.values(groupedData).reduce((sum, orders) => sum + orders.length, 0)} 条下料单 
                    {queryTime > 0 && <span className="ml-2 text-gray-500">(查询耗时: {queryTime}ms)</span>}
                  </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CuttingManagement;
