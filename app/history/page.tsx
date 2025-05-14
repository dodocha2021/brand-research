// app/history/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { FiSearch, FiClock } from 'react-icons/fi'
import { toast } from 'react-hot-toast'
import { getCompetitors } from '@/lib/supabase-utils'

// 定义表结构并允许动态索引
interface SearchRecord {
  id: string
  original_brand: string
  region: string
  competitor_name: string
  created_at: string
  competitor_url?: string
  logo?: string
  followers?: number
  total_views?: number
  platform?: string
  [key: string]: any
}

const PAGE_SIZE = 20

export default function HistoryPage() {
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [grouped, setGrouped] = useState<Record<string, SearchRecord[]>>({})
  const [brandList, setBrandList] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getCompetitors()
      .then((data: SearchRecord[]) => {
        // 按 original_brand 分组
        const group: Record<string, SearchRecord[]> = {}
        data.forEach(item => {
          if (!group[item.original_brand]) group[item.original_brand] = []
          group[item.original_brand].push(item)
        })
        setGrouped(group)
        setBrandList(Object.keys(group))
      })
      .catch((e) => {
        toast.error('获取历史搜索失败: ' + (e.message || e))
        setGrouped({})
        setBrandList([])
      })
      .finally(() => setLoading(false))
  }, [])

  // 分页
  const pagedBrands = brandList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="container">
      <h1>Search History</h1>
      {loading ? (
        <div style={{ textAlign: 'center', color: '#2563eb', padding: 48 }}>
          Loading...
        </div>
      ) : brandList.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#888', padding: 48 }}>
          No search history
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {pagedBrands.map((brand) => (
            <div
              key={brand}
              style={{
                background: '#fff',
                borderRadius: 16,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                padding: 24
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 16,
                  alignItems: 'center',
                  cursor: 'pointer'
                }}
                onClick={() => setExpanded(expanded === brand ? null : brand)}
              >
                <span style={{ fontWeight: 600, fontSize: 18 }}>
                  Brand: {brand}
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    color: '#2563eb',
                    textDecoration: 'underline',
                    fontWeight: 500
                  }}
                >
                  {expanded === brand ? 'Collapse' : 'Expand'}
                </span>
              </div>
              {expanded === brand && (
                <div style={{ marginTop: 16, overflowX: 'auto' }}>
                  <table className="result-table">
                    <thead>
                      <tr>
                        {grouped[brand] &&
                          (() => {
                            // 获取要展示的列名（排除 id 和 original_brand）
                            const keys = Object.keys(grouped[brand][0] || {})
                              .filter(
                                key =>
                                  key !== 'id' &&
                                  key !== 'original_brand' &&
                                  key !== 'logo' &&
                                  key !== 'dataset'
                              )
                            // 保证 competitor_name 后面紧跟 region
                            const competitorIdx = keys.indexOf('competitor_name')
                            const regionIdx = keys.indexOf('region')
                            let orderedKeys = keys
                            if (
                              competitorIdx !== -1 &&
                              regionIdx !== -1
                            ) {
                              orderedKeys.splice(regionIdx, 1)
                              orderedKeys.splice(
                                competitorIdx + 1,
                                0,
                                'region'
                              )
                            }
                            return orderedKeys.map(key => (
                              <th key={key}>{key}</th>
                            ))
                          })()}
                      </tr>
                    </thead>
                    <tbody>
                      {grouped[brand] ? (
                        grouped[brand].map(item => {
                          const keys = Object.keys(item).filter(
                            key =>
                              key !== 'id' &&
                              key !== 'original_brand' &&
                              key !== 'logo' &&
                              key !== 'dataset'
                          )
                          const competitorIdx = keys.indexOf(
                            'competitor_name'
                          )
                          const regionIdx = keys.indexOf('region')
                          let orderedKeys = keys
                          if (
                            competitorIdx !== -1 &&
                            regionIdx !== -1
                          ) {
                            orderedKeys.splice(regionIdx, 1)
                            orderedKeys.splice(
                              competitorIdx + 1,
                              0,
                              'region'
                            )
                          }
                          return (
                            <tr key={item.id}>
                              {orderedKeys.map(key => (
                                <td key={key}>
                                  {key === 'created_at' && item[key] ? (
                                    new Date(
                                      item[key]
                                    ).toLocaleString('en-US', {
                                      hour12: false
                                    })
                                  ) : key === 'logo' && item[key] ? (
                                    <img
                                      src={item[key]}
                                      alt="logo"
                                      style={{
                                        width: 48,
                                        height: 48,
                                        objectFit: 'contain',
                                        borderRadius: 8,
                                        background: '#eee'
                                      }}
                                      onError={e => {
                                        ;(
                                          e.target as HTMLImageElement
                                        ).style.display = 'none'
                                      }}
                                    />
                                  ) : key === 'competitor_url' &&
                                    item[key] ? (
                                    <a
                                      href={item[key]}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        color: '#2563eb',
                                        textDecoration: 'underline',
                                        wordBreak: 'break-all'
                                      }}
                                    >
                                      {item[key]}
                                    </a>
                                  ) : (
                                    (item[key] as any) || ''
                                  )}
                                </td>
                              ))}
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td
                            colSpan={
                              grouped[brand]
                                ? Object.keys(
                                    grouped[brand][0] || {}
                                  ).length - 2
                                : 1
                            }
                            style={{
                              textAlign: 'center',
                              color: '#888',
                              padding: 24
                            }}
                          >
                            No competitors
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {/* 分页控件 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 16,
              marginTop: 32
            }}
          >
            <button
              className="search-btn"
              style={{ maxWidth: 120, background: '#6b7280' }}
              onClick={() =>
                setPage(p => Math.max(1, p - 1))
              }
              disabled={page === 1}
            >
              Previous
            </button>
            <span style={{ fontWeight: 500 }}>
              Page {page} /{' '}
              {Math.ceil(brandList.length / PAGE_SIZE)}
            </span>
            <button
              className="search-btn"
              style={{ maxWidth: 120, background: '#2563eb' }}
              onClick={() =>
                setPage(p =>
                  Math.min(
                    Math.ceil(brandList.length / PAGE_SIZE),
                    p + 1
                  )
                )
              }
              disabled={
                page ===
                Math.ceil(brandList.length / PAGE_SIZE)
              }
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}