'use client'

import { useState, useEffect } from 'react'
import { FiSearch, FiClock } from 'react-icons/fi'
import { toast } from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { getAllSearches, getCompetitors } from '@/lib/supabase-utils'

interface SearchRecord {
  id: string
  original_brand: string
  region: string
  competitor_name: string
  created_at: string
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
    getAllSearches()
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
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">Search History</h1>
      {loading ? (
        <div className="text-center text-blue-400 py-12">Loading...</div>
      ) : brandList.length === 0 ? (
        <div className="text-center text-gray-400 py-12">No search history</div>
      ) : (
        <div className="space-y-4">
          {pagedBrands.map((brand) => (
            <div key={brand} className="bg-gray-800 rounded-lg shadow p-4">
              <div
                className="flex flex-wrap gap-4 items-center cursor-pointer"
                onClick={() => setExpanded(expanded === brand ? null : brand)}
              >
                <span className="font-semibold text-lg">Brand: {brand}</span>
                <span className="ml-auto text-blue-400 underline">
                  {expanded === brand ? 'Collapse' : 'Expand'}
                </span>
              </div>
              {expanded === brand && (
                <div className="mt-4">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border-separate border-spacing-y-2">
                      <thead>
                        <tr className="bg-gray-700">
                          {grouped[brand] && (() => {
                            const keys = Object.keys(grouped[brand][0] || {})
                              .filter(key => key !== 'id' && key !== 'original_brand');
                            // 保证 competitor_name 和 region 顺序
                            const competitorIdx = keys.indexOf('competitor_name');
                            const regionIdx = keys.indexOf('region');
                            let orderedKeys = keys;
                            if (competitorIdx !== -1 && regionIdx !== -1) {
                              // 先移除 region
                              orderedKeys.splice(regionIdx, 1);
                              // 插入到 competitor_name 后面
                              orderedKeys.splice(competitorIdx + 1, 0, 'region');
                            }
                            return orderedKeys.map(key => (
                              <th key={key} className="px-4 py-2 text-left">{key}</th>
                            ));
                          })()}
                        </tr>
                      </thead>
                      <tbody>
                        {grouped[brand] ? (
                          grouped[brand].map((item) => {
                            const keys = Object.keys(item).filter(key => key !== 'id' && key !== 'original_brand');
                            const competitorIdx = keys.indexOf('competitor_name');
                            const regionIdx = keys.indexOf('region');
                            let orderedKeys = keys;
                            if (competitorIdx !== -1 && regionIdx !== -1) {
                              orderedKeys.splice(regionIdx, 1);
                              orderedKeys.splice(competitorIdx + 1, 0, 'region');
                            }
                            return (
                              <tr key={item.id} className="bg-gray-900 border-b border-gray-700">
                                {orderedKeys.map(key => (
                                  <td
                                    key={key}
                                    className={`px-4 py-2 ${!(item as any)[key] ? 'bg-gray-800 text-gray-400' : ''}`}
                                  >
                                    {key === 'created_at' && (item as any)[key]
                                      ? new Date((item as any)[key]).toLocaleString('en-US', { hour12: false })
                                      : key === 'logo' && (item as any)[key]
                                        ? (
                                            <img
                                              src={(item as any)[key]}
                                              alt="logo"
                                              style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 8, background: '#eee' }}
                                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                                            />
                                          )
                                        : key === 'competitor_url' && (item as any)[key]
                                          ? (
                                              <a
                                                href={(item as any)[key]}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ color: '#4f8cff', textDecoration: 'underline', wordBreak: 'break-all' }}
                                              >
                                                {(item as any)[key]}
                                              </a>
                                            )
                                          : ((item as any)[key] || '')}
                                  </td>
                                ))}
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={grouped[brand] ? Object.keys(grouped[brand][0] || {}).length - 2 : 1} className="text-center text-gray-400 py-4">No competitors</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
          {/* 分页控件 */}
          <div className="flex justify-center items-center gap-4 mt-8">
            <button
              className="px-4 py-2 bg-gray-700 rounded disabled:opacity-50"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <span>
              Page {page} / {Math.ceil(brandList.length / PAGE_SIZE)}
            </span>
            <button
              className="px-4 py-2 bg-gray-700 rounded disabled:opacity-50"
              onClick={() => setPage((p) => Math.min(Math.ceil(brandList.length / PAGE_SIZE), p + 1))}
              disabled={page === Math.ceil(brandList.length / PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </main>
  )
}