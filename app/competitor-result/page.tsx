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
  const [usePerplexity, setUsePerplexity] = useState(true)

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

  // Next: 处理 all platform、请求API、填充URL
  const handleNext = async () => {
    console.log(`==== Starting handleNext function with ${usePerplexity ? 'Perplexity API' : 'GPT Search API'} ====`);
    setLoading(true)
    try {
      console.log("Processing rows:", rows);
      const fixedRows = rows.map(row =>
        row.competitor_name === row.original_brand
          ? { ...row, platform: 'all platform' }
          : row
      )
      console.log("Fixed rows with 'all platform':", fixedRows);

      const emptyPlatformRows = fixedRows.filter(row => !row.platform)
      if (emptyPlatformRows.length > 0) {
        console.log("Empty platform rows detected:", emptyPlatformRows);
        toast.error('Please select a platform for all rows')
        setLoading(false)
        return
      }

      console.log("Deleting 'all platform' rows from database...");
      for (const row of fixedRows) {
        if ((row.platform === 'all platform' || !row.platform) && row.id) {
          console.log("Deleting row:", row);
          await supabase
            .from('competitor_search_history')
            .delete()
            .eq('id', row.id)
        }
      }

      console.log("Splitting 'all platform' rows into individual platforms...");
      let processedRows: any[] = []
      fixedRows.forEach(row => {
        if (row.platform === 'all platform') {
          console.log(`Splitting 'all platform' row for competitor: ${row.competitor_name}`);
          SPLIT_PLATFORMS.forEach(p => {
            processedRows.push({
              ...row,
              platform: p,
              id: undefined,
              competitor_url: ''
            })
          })
        } else {
          processedRows.push(row)
        }
      })
      console.log("Processed rows after splitting:", processedRows);

      const newRows = []
      console.log(`Starting URL lookup for each row using ${usePerplexity ? 'Perplexity API' : 'GPT Search API'}...`);
      for (const row of processedRows) {
        console.log(`Processing row for competitor: ${row.competitor_name}, platform: ${row.platform}`);
        let url = ''
        try {
          if (usePerplexity) {
            // 使用perplexity_url接口获取社交媒体URL
            console.log(`Calling perplexity_url API with params:`, {
              brand: row.competitor_name,
              platform: row.platform,
              region: row.region
            });
            
            const res = await fetch('/api/perplexity_url', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                brand: row.competitor_name,
                platform: row.platform,
                region: row.region
              })
            })
            console.log(`API response status:`, res.status);
            
            const data = await res.json()
            console.log(`API response data:`, data);
            
            url = data?.url || ''
          } else {
            // 使用gpt4o_search的social_account_single任务
            console.log(`Calling gpt4o_search API with params:`, {
              query: row.competitor_name,
              task: 'social_account_single',
              platform: row.platform,
              region: row.region
            });
            
            const res = await fetch('/api/gpt4o_search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: row.competitor_name,
                task: 'social_account_single',
                platform: row.platform,
                region: row.region
              })
            })
            console.log(`API response status:`, res.status);
            
            const data = await res.json()
            console.log(`API response data:`, data);
            
            url = data?.results?.[0] || ''
          }
          
          console.log(`Extracted URL: ${url}`);
        } catch (error) {
          console.error(`${usePerplexity ? 'Perplexity URL' : 'GPT Search'} API error:`, error);
        }
        
        console.log(`Adding processed row with URL: ${url}`);
        newRows.push({
          ...row,
          competitor_url: url
        })
      }

      console.log("All rows processed with URLs:", newRows);
      console.log("Updating state and UI...");
      
      setRows(newRows)
      setShowNextButton(false)
      setShowSaveEditor(true)
      toast.success('URLs have been auto-filled')
      console.log("State updated successfully");
      
    } catch (e) {
      console.error('Auto fill failed:', e)
      toast.error('Auto fill failed')
    }
    setLoading(false)
    console.log("==== handleNext function completed ====");
  }

  // Save: 更新数据库
  const handleSave = async () => {
    setLoading(true)
    try {
      let updatedRows: any[] = []

      const allPlatformIdsToDelete = rows
        .filter(row => !row.id)
        .map(row => {
          const originalRows = rows.filter(r =>
            r.id &&
            r.competitor_name === row.competitor_name &&
            r.original_brand === row.original_brand &&
            r.platform === 'all platform'
          )
          return originalRows.length > 0 ? originalRows[0].id : null
        })
        .filter(id => id)
        .filter((id, index, self) => self.indexOf(id) === index)

      if (allPlatformIdsToDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('competitor_search_history')
          .delete()
          .in('id', allPlatformIdsToDelete)
        if (deleteError) {
          console.error('Failed to delete all platform rows:', deleteError)
        } else {
          console.log('Successfully deleted all platform original rows')
        }
      }

      for (const row of rows) {
        if (!row.platform || !row.competitor_url) {
          console.log('Skip empty row:', row)
          continue
        }

        if (!row.id) {
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
          if (!error && inserted?.[0]) {
            updatedRows.push(inserted[0])
            console.log('Inserted:', inserted[0])
          } else if (error) {
            console.error('Failed to insert new row:', error)
          }
        } else {
          const { data: updated, error } = await supabase
            .from('competitor_search_history')
            .update({
              platform: row.platform,
              competitor_url: row.competitor_url
            })
            .eq('id', row.id)
            .select()
          if (!error && updated?.[0]) {
            updatedRows.push(updated[0])
            console.log('Updated:', updated[0])
          } else if (error) {
            console.error('Failed to update row:', error)
          }
        }
      }

      setRows(updatedRows)
      setEditMode(false)
      setShowScrape(true)
      toast.success('Saved!')
    } catch (e) {
      console.error('Error occurred while saving:', e)
      toast.error('Save failed')
    }
    setLoading(false)
  }

  // Editor: 进入手动编辑URL模式
  const handleEditor = () => {
    setEditMode(true)
    toast.success('You can now edit the URL')
  }

  // 单行刷新URL —— 改为使用 google-gpt 搜索并填入
  const handleRefreshUrl = async (row: any, idx: number) => {
    setRefreshingIdx(idx)
    try {
      const res = await fetch('/api/google-gpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: row.competitor_name,
          platform: row.platform,
          region: row.region
        })
      })
      const data = await res.json()
      const url = data?.url || ''
      setRows(prev =>
        prev.map((r, i) => i === idx ? { ...r, competitor_url: url } : r)
      )
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
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <span style={{ color: '#222', fontSize: 16 }}>
              First, select a platform for each competitor above. Then choose an AI model below to analyze all competitors in parallel. Note: selecting "all platforms" will significantly increase processing time regardless of the AI model used.
            </span>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
              {/* Tab选择器 */}
              <div style={{ display: 'flex', width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                <div 
                  onClick={() => setUsePerplexity(true)}
                  style={{
                    flex: 1,
                    padding: '16px',
                    backgroundColor: usePerplexity ? '#4338ca' : '#f9fafb',
                    color: usePerplexity ? 'white' : '#6b7280',
                    cursor: 'pointer',
                    textAlign: 'center',
                    borderRight: '1px solid #e5e7eb',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: usePerplexity ? 'bold' : 'normal' }}>
                    <span style={{ fontSize: '18px' }}>🎯</span>
                    <span style={{ fontSize: '16px' }}>Perplexity</span>
                  </div>
                  <div style={{ fontSize: '14px', marginTop: '4px' }}>
                    Accurate but slower results
                  </div>
                </div>
                
                <div 
                  onClick={() => setUsePerplexity(false)}
                  style={{
                    flex: 1,
                    padding: '16px',
                    backgroundColor: !usePerplexity ? '#22c55e' : '#f9fafb',
                    color: !usePerplexity ? 'white' : '#6b7280',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: !usePerplexity ? 'bold' : 'normal' }}>
                    <span style={{ fontSize: '18px' }}>⚡</span>
                    <span style={{ fontSize: '16px' }}>GPT</span>
                  </div>
                  <div style={{ fontSize: '14px', marginTop: '4px' }}>
                    Fast but less comprehensive
                  </div>
                </div>
              </div>
              
              {/* Next按钮 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="search-btn"
                  style={{ 
                    width: '180px',
                    padding: '12px 0',
                    backgroundColor: usePerplexity ? '#4338ca' : '#22c55e',
                    borderRadius: '8px',
                    transition: 'background-color 0.3s'
                  }}
                  onClick={handleNext}
                  disabled={loading}
                >
                  {loading ? 'Processing...' : 'Next'}
                </button>
              </div>
            </div>
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