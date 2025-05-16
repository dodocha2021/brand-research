'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function CompetitorScrapePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const idsParam = searchParams.get('ids') || ''
  const ids = idsParam.split(',').filter(Boolean)
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [showEditorButtons, setShowEditorButtons] = useState(false)
  const [editedRows, setEditedRows] = useState<any[]>([])
  const [rowLoading, setRowLoading] = useState<{ [id: string]: boolean }>({})
  const [polling, setPolling] = useState(false)
  const [pollingCount, setPollingCount] = useState(0)
  const [rowTimeouts, setRowTimeouts] = useState<{ [id: string]: NodeJS.Timeout }>({})
  const [errorMessages, setErrorMessages] = useState<{ [id: string]: string }>({})

  useEffect(() => {
    if (!idsParam) return
    setLoading(true)
    const fetchRows = async () => {
      const { data, error } = await supabase
        .from('competitor_search_history')
        .select('*')
        .in('id', ids)
      if (!error && data) {
        setRows(data)
      }
      setLoading(false)
      setShowEditorButtons(true)
    }
    fetchRows()
  }, [idsParam])

  useEffect(() => {
    const hasScrapingItems = rows.some(row => row.status === 'scraping')
    
    if (hasScrapingItems && !polling) {
      setPolling(true)
      setPollingCount(0)
    }
    
    if (!hasScrapingItems && polling) {
      setPolling(false)
      setLoading(false)
      setRowLoading({})
      Object.values(rowTimeouts).forEach(timeoutId => clearTimeout(timeoutId as NodeJS.Timeout));
      setRowTimeouts({});
    }
    
    let pollInterval: NodeJS.Timeout | null = null
    
    if (polling) {
      pollInterval = setInterval(async () => {
        setPollingCount(prev => prev + 1)
        
        const scrapingIds = rows
          .filter(row => row.status === 'scraping')
          .map(row => row.id)
        
        if (scrapingIds.length === 0) {
          setPolling(false)
          return
        }
        
        try {
          const { data: updatedData, error } = await supabase
            .from('competitor_search_history')
            .select('*')
            .in('id', scrapingIds)
            
          if (error) {
            console.error('轮询更新失败:', error)
            return
          }
          
          if (updatedData && updatedData.length > 0) {
            let hasUpdates = false;
            
            setRows(prev => prev.map(row => {
              const updated = updatedData.find(item => item.id === row.id)
              if (updated) {
                if (updated.followers !== row.followers || 
                    updated.total_views !== row.total_views || 
                    updated.dataset !== row.dataset) {
                  
                  hasUpdates = true;
                  
                  if (rowTimeouts[row.id]) {
                    clearTimeout(rowTimeouts[row.id]);
                    setRowTimeouts(prev => {
                      const newTimeouts = {...prev};
                      delete newTimeouts[row.id];
                      return newTimeouts;
                    });
                  }
                  
                  setRowLoading(prev => ({ ...prev, [row.id]: false }));
                  
                  return {
                    ...row,
                    followers: updated.followers || row.followers,
                    logo: updated.logo || row.logo,
                    total_views: updated.total_views || row.total_views,
                    dataset: updated.dataset || row.dataset,
                    status: null
                  }
                }
              }
              return row
            }))
            
            if (hasUpdates) {
              console.log(`轮询更新: 第${pollingCount}次，检测到数据更新，已重置相关行的状态`)
            } else {
              console.log(`轮询更新: 第${pollingCount}次，未检测到数据变化`)
            }
          }
        } catch (e) {
          console.error('轮询更新出错:', e)
        }
      }, 5000)
    }
    
    return () => {
      if (pollInterval) clearInterval(pollInterval)
    }
  }, [rows, polling, pollingCount, rowTimeouts])

  const handleScrape = async (data: any[]) => {
    setLoading(true)
    setTimeout(() => {
      console.log('批量抓取任务超时，重置状态');
      setRows(prevRows => prevRows.map(r => 
        r.status === 'scraping' ? { ...r, status: null } : r
      ));
      setLoading(false);
    }, 3 * 60 * 1000); // 3分钟超时
    
    try {
      for (const row of data) {
        try {
          console.log(`准备抓取: ID=${row.id}, URL=${row.competitor_url}, 平台=${row.platform}`);
          console.log(`完整的行数据:`, JSON.stringify(row));
          
          setRows(prevRows => 
            prevRows.map(r => r.id === row.id ? { ...r, status: 'scraping' } : r)
          )
          
          const res = await fetch('/api/apify/start-scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: row.competitor_url,
              platform: row.platform,
              competitorId: row.id
            })
          })
          
          const result = await res.json()
          
          if (result.success) {
            console.log(`抓取任务已启动: ID=${row.id}, actorRunId=${result.actorRunId}, 平台=${row.platform}`)
          } else {
            console.error(`启动抓取任务失败: ID=${row.id}, 平台=${row.platform}, 错误:`, result.message)
          }
        } catch (error) {
          console.error(`启动抓取任务异常: ID=${row.id}, 平台=${row.platform}, 错误:`, error)
        }
      }
    } catch (error) {
      console.error('批量抓取出错:', error)
    }
  }

  // 保存到 supabase
  const handleSave = async (data: any[]) => {
    setLoading(true)
    for (const row of data) {
      await supabase
        .from('competitor_search_history')
        .update({
          competitor_name: row.competitor_name,
          platform: row.platform,
          competitor_url: row.competitor_url,
          logo: row.logo,
          followers: row.followers,
          total_views: row.platform === 'youtube' ? (row.total_views || row.channelTotalViews) : null,
          // 其它你想同步的字段也可以加上
        })
        .eq('id', row.id)
    }
    setRows(data)
    setEditMode(false)
    setLoading(false)
  }

  // 取消编辑
  const handleCancelEdit = () => {
    setEditMode(false)
    setEditedRows([])
  }

  // 单行刷新逻辑
  const handleRefreshRow = async (row: any, idx: number) => {
    // 先设置按钮为加载状态 - 锁住按钮
    setRowLoading(prev => ({ ...prev, [row.id]: true }))
    
    // 清除可能存在的错误消息
    setErrorMessages(prev => {
      const newMessages = {...prev};
      delete newMessages[row.id];
      return newMessages;
    });
    
    // 清空当前行的URL、followers和total_views数据
    setRows(prevRows => prevRows.map((r, i) => 
      i === idx ? { 
        ...r, 
        status: 'scraping',
        competitor_url: '', // 清空URL
        followers: null,    // 清空followers
        total_views: null   // 清空total_views
      } : r
    ));
    
    // 新增：直接清空数据库中的URL、followers和total_views字段
    try {
      console.log(`清空数据库ID=${row.id}的URL、followers和total_views数据`);
      const { error: clearDataError } = await supabase
        .from('competitor_search_history')
        .update({
          competitor_url: '',  // 清空URL
          followers: null,     // 清空followers
          total_views: null    // 清空total_views
        })
        .eq('id', row.id);
        
      if (clearDataError) {
        console.error(`清空数据库数据失败:`, clearDataError);
      } else {
        console.log(`已成功清空数据库ID=${row.id}的数据`);
      }
    } catch (clearError) {
      console.error(`清空数据库出错:`, clearError);
    }
    
    // 设置3分钟超时
    const timeoutId = setTimeout(() => {
      console.log(`ID=${row.id}的抓取任务超时，重置状态`);
      setRows(prevRows => prevRows.map((r, i) => 
        r.id === row.id ? { ...r, status: null } : r
      ));
      setRowLoading(prev => ({ ...prev, [row.id]: false }));
      setErrorMessages(prev => ({...prev, [row.id]: "Request timeout"}));
      
      // 清除超时标记
      setRowTimeouts(prev => {
        const newTimeouts = {...prev};
        delete newTimeouts[row.id];
        return newTimeouts;
      });
    }, 3 * 60 * 1000); // 3分钟超时
    
    // 保存超时标记
    setRowTimeouts(prev => ({...prev, [row.id]: timeoutId}));
    
    try {
      console.log(`准备刷新单行: ID=${row.id}, 品牌=${row.competitor_name}, 平台=${row.platform}`);
      
      // 第1步：调用google-gpt API查询品牌URL
      console.log(`调用google-gpt API查询${row.competitor_name}的${row.platform}账号URL`);
      
      const gptResponse = await fetch('/api/google-gpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: row.competitor_name,
          platform: row.platform,
          region: row.region || 'global'
        })
      });
      
      if (!gptResponse.ok) {
        throw new Error(`Google GPT API请求失败: ${gptResponse.status} ${gptResponse.statusText}`);
      }
      
      const gptData = await gptResponse.json();
      const newUrl = gptData?.url || '';
      
      console.log(`Google GPT返回的URL: ${newUrl}`);
      
      // 检查是否找到URL
      if (!newUrl) {
        console.error(`未找到${row.competitor_name}的${row.platform}官方账号URL`);
        
        // 设置错误消息并恢复按钮状态
        setErrorMessages(prev => ({...prev, [row.id]: "No official account found"}));
        
        // 清除超时
        clearTimeout(timeoutId);
        setRowTimeouts(prev => {
          const newTimeouts = {...prev};
          delete newTimeouts[row.id];
          return newTimeouts;
        });
        
        // 恢复行状态但保持URL等为空
        setRows(prevRows => prevRows.map((r, i) => 
          i === idx ? { ...r, status: null } : r
        ));
        
        // 恢复按钮状态
        setRowLoading(prev => ({ ...prev, [row.id]: false }));
        
        return;
      }
      
      // 更新URL到行中
      setRows(prevRows => prevRows.map((r, i) => 
        i === idx ? { ...r, competitor_url: newUrl } : r
      ));
      
      // 第2步：调用start-scrape API开始抓取任务
      console.log(`找到URL，调用start-scrape API开始抓取: URL=${newUrl}`);
      
      const res = await fetch('/api/apify/start-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: newUrl,
          platform: row.platform,
          competitorId: row.id
        })
      });
      
      const result = await res.json();
      
      if (result.success) {
        console.log(`单行抓取任务已启动: ID=${row.id}, actorRunId=${result.actorRunId}, 平台=${row.platform}`);
      } else {
        console.error(`单行抓取任务失败: ID=${row.id}, 平台=${row.platform}, 错误:`, result.message);
        
        // 设置错误消息
        setErrorMessages(prev => ({...prev, [row.id]: result.message || "Failed to start scraping"}));
        
        // 清除超时
        clearTimeout(timeoutId);
        setRowTimeouts(prev => {
          const newTimeouts = {...prev};
          delete newTimeouts[row.id];
          return newTimeouts;
        });
        
        // 恢复行状态
        setRows(prevRows => prevRows.map((r, i) => 
          i === idx ? { ...r, status: null } : r
        ));
        
        // 恢复按钮状态
        setRowLoading(prev => ({ ...prev, [row.id]: false }));
      }
    } catch (e) {
      console.error(`刷新流程失败: ID=${row.id}, 错误:`, e);
      
      // 设置错误消息
      setErrorMessages(prev => ({...prev, [row.id]: e instanceof Error ? e.message : "Unknown error"}));
      
      // 清除超时
      clearTimeout(timeoutId);
      setRowTimeouts(prev => {
        const newTimeouts = {...prev};
        delete newTimeouts[row.id];
        return newTimeouts;
      });
      
      // 恢复行状态
      setRows(prevRows => prevRows.map((r, i) => 
        i === idx ? { ...r, status: null } : r
      ));
      
      // 恢复按钮状态
      setRowLoading(prev => ({ ...prev, [row.id]: false }));
    }
  }

  return (
    <div className="container">
      <h1>Scrape Competitors</h1>
      <div style={{ background: '#fff', borderRadius: 24, boxShadow: '0 4px 10px rgba(0,0,0,0.1)', padding: 32, margin: '0 auto', marginTop: 32 }}>
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="search-btn"
            style={{ maxWidth: 300, width: 180 }}
            onClick={() => handleScrape(rows)}
            disabled={loading}
          >
            {loading ? 'Waiting minutes...' : 'Start Scraping'}
          </button>
        </div>
        <table className="result-table">
          <thead>
            <tr>
              <th>Competitor Name</th>
              <th>Platform</th>
              <th>URL</th>
              <th>Followers</th>
              <th>Channel Total Views</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(editMode ? editedRows : rows).map((row, idx) => (
              <tr key={row.id || idx}>
                <td>
                  <input
                    value={row.competitor_name || ''}
                    disabled
                  />
                </td>
                <td>
                  <input
                    value={row.platform || ''}
                    disabled
                  />
                </td>
                <td>
                  {editMode ? (
                    <input
                      value={row.competitor_url || ''}
                      placeholder="Enter URL"
                      onChange={e => {
                        const newRows = [...editedRows]
                        newRows[idx].competitor_url = e.target.value
                        setEditedRows(newRows)
                      }}
                    />
                  ) : (
                    <input
                      value={row.competitor_url || ''}
                      disabled
                    />
                  )}
                </td>
                <td>
                  {editMode ? (
                    <input
                      value={row.followers || ''}
                      placeholder="Enter followers count"
                      onChange={e => {
                        const newRows = [...editedRows]
                        newRows[idx].followers = e.target.value
                        setEditedRows(newRows)
                      }}
                    />
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <input
                        value={row.followers !== undefined && row.followers !== null && row.followers !== '' ? row.followers : ''}
                        disabled
                      />
                    </div>
                  )}
                </td>
                <td>
                  <input
                    value={row.platform === 'youtube' ? (row.total_views || row.channelTotalViews || '') : ''}
                    disabled
                  />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <button
                      title="刷新数据"
                      disabled={rowLoading[row.id] || loading || row.status === 'scraping'}
                      onClick={() => handleRefreshRow(row, idx)}
                      style={{ opacity: rowLoading[row.id] || loading || row.status === 'scraping' ? 0.5 : 1 }}
                    >
                      {rowLoading[row.id] || row.status === 'scraping' ? '⏳' : '🔄'}
                    </button>
                    {errorMessages[row.id] && (
                      <div style={{ 
                        position: 'absolute', 
                        top: '-30px', 
                        right: '0', 
                        background: '#f5f5f5', 
                        border: '1px solid #ddd',
                        padding: '5px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: 'red',
                        whiteSpace: 'nowrap',
                        zIndex: 10
                      }}>
                        {errorMessages[row.id]}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 32, display: 'flex', justifyContent: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <button
            className="search-btn"
            style={{ background: loading ? '#a3a3a3' : '#22c55e', maxWidth: 300, width: 180 }}
            disabled={loading}
            onClick={async () => {
              if (loading) return
              if (editMode) {
                await handleSave(editedRows)
              } else {
                await handleSave(rows)
              }
            }}
          >
            {loading ? 'Loading...' : 'Save'}
          </button>
          {showEditorButtons && !editMode && (
            <>
              <button
                className="search-btn"
                style={{ background: '#2563eb', maxWidth: 180 }}
                onClick={() => {
                  setEditMode(true)
                  setEditedRows(rows.map(r => ({ ...r })))
                }}
              >
                Editor
              </button>
              <button
                className="search-btn"
                style={{ background: '#a855f7', maxWidth: 180 }}
                onClick={() => {
                  const ids = rows.map(r => r.id).filter(Boolean).join(',')
                  router.push(`/email-editor?ids=${ids}`)
                }}
              >
                Email
              </button>
            </>
          )}
          {editMode && (
            <button
              className="search-btn"
              style={{ background: '#6b7280', maxWidth: 180 }}
              onClick={handleCancelEdit}
            >
              Cancel Edit
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
