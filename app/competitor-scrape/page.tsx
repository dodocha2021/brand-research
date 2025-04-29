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

  const handleScrape = async (data: any[]) => {
    setLoading(true)
    try {
      const newRows = await Promise.all(data.map(async (row) => {
        if (row.platform === 'instagram') {
          try {
            const res = await fetch('/api/apify/instagram', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ usernames: [row.competitor_url] })
            })
            const result = await res.json()
            const info = Array.isArray(result) ? result[0] : null
            return {
              ...row,
              logo: info?.profilePicUrl || '',
              followers: info?.followersCount ?? ''
            }
          } catch (e) {
            return { ...row }
          }
        } else if (row.platform === 'linkedin') {
          try {
            const res = await fetch('/api/apify/linkedin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ identifier: row.competitor_url })
            })
            const result = await res.json()
            const info = Array.isArray(result) ? result[0] : null
            return {
              ...row,
              logo: info?.media?.logo_url || '',
              followers: info?.stats?.follower_count ?? ''
            }
          } catch (e) {
            return { ...row }
          }
        } else if (row.platform === 'tiktok') {
          try {
            const res = await fetch('/api/apify/tiktok', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                excludePinnedPosts: false,
                profiles: [row.competitor_url],
                resultsPerPage: 1,
                shouldDownloadAvatars: false,
                shouldDownloadCovers: true,
                shouldDownloadSlideshowImages: false,
                shouldDownloadSubtitles: false,
                shouldDownloadVideos: false,
                profileScrapeSections: ['videos'],
                profileSorting: 'latest'
              })
            })
            const result = await res.json()
            const info = Array.isArray(result) ? result[0] : null
            return {
              ...row,
              logo: info?.authorMeta?.avatar || '',
              followers: info?.authorMeta?.fans ?? ''
            }
          } catch (e) {
            return { ...row }
          }
        } else if (row.platform === 'twitter') {
          try {
            const res = await fetch('/api/apify/twitter', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                maxItems: 1,
                sort: 'Latest',
                startUrls: [row.competitor_url]
              })
            })
            const result = await res.json()
            const info = Array.isArray(result) ? result[0] : null
            return {
              ...row,
              logo: info?.author?.profilePicture || '',
              followers: info?.author?.followers ?? ''
            }
          } catch (e) {
            return { ...row }
          }
        } else if (row.platform === 'youtube') {
          try {
            const res = await fetch('/api/apify/youtube', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                maxResultStreams: 0,
                maxResults: 1,
                maxResultsShorts: 0,
                sortVideosBy: 'POPULAR',
                startUrls: [
                  {
                    url: row.competitor_url,
                    method: 'GET'
                  }
                ]
              })
            })
            const result = await res.json()
            const info = Array.isArray(result) ? result[0] : null
            return {
              ...row,
              logo: info?.aboutChannelInfo?.channelAvatarUrl || '',
              followers: info?.aboutChannelInfo?.numberOfSubscribers ?? ''
            }
          } catch (e) {
            return { ...row }
          }
        }
        return { ...row }
      }))
      setRows(newRows)
    } catch (error) {
      console.error('Scraping error:', error)
    } finally {
      setLoading(false)
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
    setRowLoading(prev => ({ ...prev, [row.id]: true }))
    let updatedRow = { ...row }
    try {
      if (row.platform === 'instagram') {
        const res = await fetch('/api/apify/instagram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernames: [row.competitor_url] })
        })
        const result = await res.json()
        const info = Array.isArray(result) ? result[0] : null
        updatedRow.logo = info?.profilePicUrl || ''
        updatedRow.followers = info?.followersCount ?? ''
      } else if (row.platform === 'linkedin') {
        const res = await fetch('/api/apify/linkedin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: row.competitor_url })
        })
        const result = await res.json()
        const info = Array.isArray(result) ? result[0] : null
        updatedRow.logo = info?.media?.logo_url || ''
        updatedRow.followers = info?.stats?.follower_count ?? ''
      } else if (row.platform === 'tiktok') {
        const res = await fetch('/api/apify/tiktok', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            excludePinnedPosts: false,
            profiles: [row.competitor_url],
            resultsPerPage: 1,
            shouldDownloadAvatars: false,
            shouldDownloadCovers: true,
            shouldDownloadSlideshowImages: false,
            shouldDownloadSubtitles: false,
            shouldDownloadVideos: false,
            profileScrapeSections: ['videos'],
            profileSorting: 'latest'
          })
        })
        const result = await res.json()
        const info = Array.isArray(result) ? result[0] : null
        updatedRow.logo = info?.authorMeta?.avatar || ''
        updatedRow.followers = info?.authorMeta?.fans ?? ''
      } else if (row.platform === 'twitter') {
        const res = await fetch('/api/apify/twitter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            maxItems: 1,
            sort: 'Latest',
            startUrls: [row.competitor_url]
          })
        })
        const result = await res.json()
        const info = Array.isArray(result) ? result[0] : null
        updatedRow.logo = info?.author?.profilePicture || ''
        updatedRow.followers = info?.author?.followers ?? ''
      } else if (row.platform === 'youtube') {
        const res = await fetch('/api/apify/youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            maxResultStreams: 0,
            maxResults: 1,
            maxResultsShorts: 0,
            sortVideosBy: 'POPULAR',
            startUrls: [
              {
                url: row.competitor_url,
                method: 'GET'
              }
            ]
          })
        })
        const result = await res.json()
        const info = Array.isArray(result) ? result[0] : null
        updatedRow.logo = info?.aboutChannelInfo?.channelAvatarUrl || ''
        updatedRow.followers = info?.aboutChannelInfo?.numberOfSubscribers ?? ''
      }
      // 更新本地rows
      setRows(prevRows => prevRows.map((r, i) => (i === idx ? { ...r, logo: updatedRow.logo, followers: updatedRow.followers } : r)))
      // 同步到 supabase
      await supabase
        .from('competitor_search_history')
        .update({
          logo: updatedRow.logo,
          followers: updatedRow.followers
        })
        .eq('id', row.id)
    } catch (e) {
      // 可选：错误提示
      console.error('单行刷新失败', e)
    } finally {
      setRowLoading(prev => ({ ...prev, [row.id]: false }))
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center p-8">
      <h1 className="text-3xl font-bold mb-8">Scrape Competitors</h1>
      <div className="w-full max-w-4xl">
        <div className="mb-4 flex justify-end">
          <button
            className="px-8 py-3 bg-blue-600 text-white rounded shadow-lg hover:bg-blue-700"
            onClick={() => handleScrape(rows)}
            disabled={loading}
          >
            {loading ? 'Waiting minutes...' : 'Start Scraping'}
          </button>
        </div>
        <table className="min-w-full text-sm border-separate border-spacing-y-2">
          <thead>
            <tr className="bg-gray-200 text-gray-900">
              <th className="px-4 py-2 text-left">Competitor Name</th>
              <th className="px-4 py-2 text-left">Platform</th>
              <th className="px-4 py-2 text-left">Logo</th>
              <th className="px-4 py-2 text-left">URL</th>
              <th className="px-4 py-2 text-left">Followers</th>
              <th className="px-4 py-2 text-left">Created At</th>
              <th className="px-2 py-2 text-left"></th>
            </tr>
          </thead>
          <tbody>
            {(editMode ? editedRows : rows).map((row, idx) => (
              <tr key={row.id || idx} className="bg-white border-b border-gray-300">
                <td className="px-4 py-2">
                  <input
                    className="border rounded px-2 py-1 w-full"
                    value={row.competitor_name || ''}
                    disabled
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    className="border rounded px-2 py-1 w-full"
                    value={row.platform || ''}
                    disabled
                  />
                </td>
                <td className="px-4 py-2">
                  {editMode ? (
                    <input
                      className="border rounded px-2 py-1 w-full"
                      value={row.logo || ''}
                      placeholder="Enter logo URL"
                      onChange={e => {
                        const newRows = [...editedRows]
                        newRows[idx].logo = e.target.value
                        setEditedRows(newRows)
                      }}
                    />
                  ) : (
                    <input
                      className={`border rounded px-2 py-1 w-full ${row.logo ? '' : 'bg-gray-100 text-gray-400'}`}
                      value={row.logo || ''}
                      disabled
                    />
                  )}
                </td>
                <td className="px-4 py-2">
                  <input
                    className={`border rounded px-2 py-1 w-full ${row.competitor_url ? '' : 'bg-gray-100 text-gray-400'}`}
                    value={row.competitor_url || ''}
                    disabled
                  />
                </td>
                <td className="px-4 py-2">
                  {editMode ? (
                    <input
                      className="border rounded px-2 py-1 w-full"
                      value={row.followers || ''}
                      placeholder="Enter followers count"
                      onChange={e => {
                        const newRows = [...editedRows]
                        newRows[idx].followers = e.target.value
                        setEditedRows(newRows)
                      }}
                    />
                  ) : (
                    <input
                      className={`border rounded px-2 py-1 w-full ${row.followers ? '' : 'bg-gray-100 text-gray-400'}`}
                      value={row.followers !== undefined && row.followers !== null && row.followers !== '' ? row.followers : ''}
                      disabled
                    />
                  )}
                </td>
                <td className="px-4 py-2">
                  <input
                    className={`border rounded px-2 py-1 w-full ${row.created_at ? '' : 'bg-gray-100 text-gray-400'}`}
                    value={row.created_at ? new Date(row.created_at).toLocaleString() : ''}
                    disabled
                  />
                </td>
                <td className="px-4 py-2">
                  <button
                    className="text-lg hover:text-blue-600 disabled:opacity-50"
                    title="刷新数据"
                    disabled={rowLoading[row.id] || loading}
                    onClick={() => handleRefreshRow(row, idx)}
                  >
                    {rowLoading[row.id] ? '⏳' : '🔄'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 flex justify-end w-full max-w-4xl space-x-4">
        <button
          className={`px-8 py-3 rounded shadow-lg text-white font-bold
            ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
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
              className="px-6 py-3 rounded shadow-lg bg-blue-600 text-white font-bold hover:bg-blue-700"
              onClick={() => {
                setEditMode(true)
                setEditedRows(rows.map(r => ({ ...r })))
              }}
            >
              Editor
            </button>
            <button
              className="px-6 py-3 rounded shadow-lg bg-purple-600 text-white font-bold hover:bg-purple-700"
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
            className="px-6 py-3 rounded shadow-lg bg-gray-400 text-white font-bold hover:bg-gray-500"
            onClick={handleCancelEdit}
          >
            Cancel Edit
          </button>
        )}
      </div>
    </main>
  )
}
