'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toast } from 'react-hot-toast'
import { PLATFORM_PROMPTS } from '@/lib/prompts'

const PLATFORM_OPTIONS = [
  'youtube', 'instagram', 'linkedin', 'tiktok', 'twitter', 'all platform'
]
const SPLIT_PLATFORMS = ['instagram', 'linkedin', 'tiktok', 'twitter', 'youtube']

export default function CompetitorResultPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const idsParam = searchParams.get('ids') || ''
  const ids = idsParam.split(',').filter(Boolean)
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [showNextButton, setShowNextButton] = useState(true)
  const [showSaveEditor, setShowSaveEditor] = useState(false)
  const [showScrape, setShowScrape] = useState(false)
  const [refreshingIdx, setRefreshingIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!idsParam) return
    setLoading(true)
    const fetchRows = async () => {
      const { data, error } = await supabase
        .from('competitor_search_history')
        .select('*')
        .in('id', ids)
      if (error) {
        toast.error('Failed to load data')
      } else {
        setRows(data || [])
      }
      setLoading(false)
    }
    fetchRows()
  }, [idsParam])

  const handleChange = (idx: number, key: string, value: string) => {
    setRows(prev => {
      const arr = [...prev]
      arr[idx] = { ...arr[idx], [key]: value }
      return arr
    })
  }

  // 拆分 all platform 行
  const splitAllPlatformRows = (inputRows: any[]) => {
    let result: any[] = []
    inputRows.forEach(row => {
      if (row.platform === 'all platform') {
        SPLIT_PLATFORMS.forEach(p => {
          result.push({
            ...row,
            platform: p,
            id: undefined,
            competitor_url: ''
          })
        })
      } else {
        result.push(row)
      }
    })
    return result
  }

  // Next: 处理 all platform、请求GPT、填充URL
  const handleNext = async () => {
    setLoading(true)
    try {
      // 在校验前，自动为关键词行赋值 platform
      const fixedRows = rows.map(row =>
        row.competitor_name === row.original_brand
          ? { ...row, platform: 'all platform' }
          : row
      );
      // 验证每一行是否都有platform数据
      const emptyPlatformRows = fixedRows.filter(row => !row.platform);
      if (emptyPlatformRows.length > 0) {
        toast.error('Please select a platform for all rows');
        setLoading(false);
        return;
      }
      // 1. 删除数据库中原始 all platform 行
      for (const row of fixedRows) {
        if ((row.platform === 'all platform' || !row.platform) && row.id) {
          await supabase
            .from('competitor_search_history')
            .delete()
            .eq('id', row.id)
        }
      }
      // 1. 处理 all platform 拆分
      let processedRows: any[] = []
      // 找出不是 all platform 的行
      const nonAllPlatformRows = fixedRows.filter(row => row.platform !== 'all platform');
      // 处理 all platform 行拆分
      fixedRows.forEach(row => {
        if (row.platform === 'all platform') {
          SPLIT_PLATFORMS.forEach(p => {
            processedRows.push({
              ...row,
              platform: p,
              id: undefined,  // 拆分后的行是新行，没有ID
              competitor_url: ''
            });
          });
        } else {
          processedRows.push(row);
        }
      });
      // 2. 请求GPT获取URL
      const newRows = [];
      for (const row of processedRows) {
        const prompt = PLATFORM_PROMPTS[row.platform]
          .replace('{{1.Competitor}}', row.competitor_name)
          .replace('{{1.OriginalBrand}}', row.original_brand)
          .replace('{{region}}', row.region);
        let url = '';
        try {
          const res = await fetch('/api/openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gpt-4o-mini-search-preview',
              max_tokens: 256,
              messages: [{ role: 'user', content: prompt }]
            })
          });
          const data = await res.json();
          url = data?.choices?.[0]?.message?.content?.trim() || '';
        } catch {}
        newRows.push({
          ...row,
          competitor_url: url
        });
      }
      
      setRows(newRows);
      // 切换按钮状态
      setShowNextButton(false);
      setShowSaveEditor(true);
      toast.success('URLs have been auto-filled');
    } catch (e) {
      console.error('Auto fill failed:', e);
      toast.error('Auto fill failed');
    }
    setLoading(false);
  }

  // Save: 更新数据库
  const handleSave = async () => {
    setLoading(true)
    try {
      let updatedRows: any[] = []
      
      // 查找所有all platform原始行的ID，稍后需要删除
      const allPlatformIdsToDelete = rows
        .filter(row => !row.id) // 筛选出没有ID的行
        .map(row => {
          // 找到原始的all platform行
          const originalRows = rows.filter(r => 
            r.id && // 有ID
            r.competitor_name === row.competitor_name && // 相同竞争对手
            r.original_brand === row.original_brand && // 相同品牌
            r.platform === 'all platform' // 平台为all platform
          );
          return originalRows.length > 0 ? originalRows[0].id : null;
        })
        .filter(id => id) // 过滤掉null
        .filter((id, index, self) => self.indexOf(id) === index); // 去重
      
      console.log('需要删除的all platform IDs:', allPlatformIdsToDelete);
      
      // 1. 删除all platform原始行
      if (allPlatformIdsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('competitor_search_history')
          .delete()
          .in('id', allPlatformIdsToDelete);
          
        if (deleteError) {
          console.error('Failed to delete all platform rows:', deleteError);
        } else {
          console.log('Successfully deleted all platform original rows');
        }
      }
      
      // 2. 处理每一行数据的插入或更新
      for (const row of rows) {
        // 跳过没有platform或competitor_url的行
        if (!row.platform || !row.competitor_url) {
          console.log('Skip empty row:', row);
          continue;
        }
        
        if (!row.id) {
          // 新行，需要插入
          const { data: inserted, error } = await supabase
            .from('competitor_search_history')
            .insert([{
              original_brand: row.original_brand,
              region: row.region,
              competitor_name: row.competitor_name,
              platform: row.platform,
              competitor_url: row.competitor_url
            }])
            .select()
          if (!error && inserted && inserted[0]) {
            updatedRows.push(inserted[0])
            console.log('Inserted:', inserted[0])
          } else if (error) {
            console.error('Failed to insert new row:', error);
          }
        } else {
          // 现有行，需要更新
          const { data: updated, error } = await supabase
            .from('competitor_search_history')
            .update({
              platform: row.platform,
              competitor_url: row.competitor_url
            })
            .eq('id', row.id)
            .select()
          if (!error && updated && updated[0]) {
            updatedRows.push(updated[0])
            console.log('Updated:', updated[0])
          } else if (error) {
            console.error('Failed to update row:', error);
          }
        }
      }
      
      setRows(updatedRows)
      setEditMode(false)
      setShowScrape(true)
      toast.success('Saved!');
    } catch (e) {
      console.error('Error occurred while saving:', e);
      toast.error('Save failed');
    }
    setLoading(false)
  }

  // Editor: 进入手动编辑URL模式
  const handleEditor = () => {
    setEditMode(true)
    toast.success('You can now edit the URL');
  }

  // 单行刷新URL
  const handleRefreshUrl = async (row: any, idx: number) => {
    setRefreshingIdx(idx)
    try {
      const prompt = PLATFORM_PROMPTS[row.platform]
        .replace('{{1.Competitor}}', row.competitor_name)
        .replace('{{1.OriginalBrand}}', row.original_brand)
        .replace('{{region}}', row.region)
      const res = await fetch('/api/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini-search-preview',
          max_tokens: 256,
          messages: [{ role: 'user', content: prompt }]
        })
      })
      const data = await res.json()
      const url = data?.choices?.[0]?.message?.content?.trim() || ''
      setRows(prev => prev.map((r, i) => i === idx ? { ...r, competitor_url: url } : r))
      toast.success('URL refreshed!')
    } catch (e) {
      toast.error('Failed to refresh URL')
    }
    setRefreshingIdx(null)
  }

  return (
    <div className="container">
      <h1>Edit Competitors</h1>
      <div style={{ background: '#fff', borderRadius: 24, boxShadow: '0 4px 10px rgba(0,0,0,0.1)', padding: 32, margin: '0 auto', marginTop: 32 }}>
        <table className="result-table">
          <thead>
            <tr>
              <th>Brand</th>
              <th>Region</th>
              <th>Competitor</th>
              <th>Platform</th>
              <th>URL</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id || `${row.competitor_name}-${row.platform}-${idx}`}> 
                <td>
                  <input
                    value={row.original_brand || ''}
                    onChange={e => handleChange(idx, 'original_brand', e.target.value)}
                    disabled
                  />
                </td>
                <td>
                  <input
                    value={row.region || ''}
                    onChange={e => handleChange(idx, 'region', e.target.value)}
                    disabled
                  />
                </td>
                <td>
                  <input
                    value={row.competitor_name || ''}
                    onChange={e => handleChange(idx, 'competitor_name', e.target.value)}
                    disabled
                  />
                </td>
                <td>
                  {showNextButton ? (
                    <select
                      value={row.competitor_name === row.original_brand ? 'all platform' : (row.platform || '')}
                      onChange={e => handleChange(idx, 'platform', e.target.value)}
                      disabled={row.competitor_name === row.original_brand}
                    >
                      <option value="">Select</option>
                      {PLATFORM_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={row.platform || ''}
                      disabled
                    />
                  )}
                </td>
                <td>
                  {editMode ? (
                    <input
                      value={row.competitor_url || ''}
                      onChange={e => handleChange(idx, 'competitor_url', e.target.value)}
                      placeholder="Enter or paste URL"
                    />
                  ) : (
                    row.competitor_url ? (
                      <a
                        href={row.competitor_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {row.competitor_url}
                      </a>
                    ) : (
                      <span style={{ color: '#bbb' }}>-</span>
                    )
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    title="Refresh URL"
                    disabled={refreshingIdx === idx || loading}
                    onClick={() => handleRefreshUrl(row, idx)}
                    style={{ opacity: refreshingIdx === idx || loading ? 0.5 : 1 }}
                  >
                    {refreshingIdx === idx ? '⏳' : '🔄'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {showSaveEditor && (
          <div style={{ color: '#222', marginTop: 8, marginBottom: 16, fontSize: 18, textAlign: 'center' }}>
            AI may make mistakes, so you might need to double-check and manually input the correct URL for competitors.
          </div>
        )}
        {showNextButton && (
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#222', fontSize: 16 }}>
              Please select a platform for each competitor and send to AI for analysis. You may also select "all platforms", but this may take more time.
            </span>
            <button
              className="search-btn"
              style={{ maxWidth: 300, width: 180 }}
              onClick={handleNext}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Next'}
            </button>
          </div>
        )}
        {showSaveEditor && (
          <>
            <button
              className="search-btn"
              style={{ background: '#6b7280' }}
              onClick={handleEditor}
            >
              Editor
            </button>
            <button
              className="search-btn"
              style={{ background: '#22c55e' }}
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Save'}
            </button>
          </>
        )}
        {showScrape && (
          <button
            className="search-btn"
            style={{ background: '#f59e42' }}
            onClick={() => {
              const ids = rows.map(r => r.id).filter(Boolean).join(',')
              router.push(`/competitor-scrape?ids=${ids}`)
            }}
          >
            Scrape
          </button>
        )}
      </div>
    </div>
  )
}