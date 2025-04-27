'use client'

import { useState } from 'react'

interface Competitor {
  id: string
  search_id: string
  competitor_name: string
  platform: string
  competitor_url: string
  fans_count: number | null
}

interface Search {
  id: string
  original_brand: string
  region: string
  status: string
  created_at: string
}

const PAGE_SIZE = 2 // 为了方便演示，示例每页2条

// 示例假数据
const mockSearches: Search[] = [
  {
    id: '1',
    original_brand: 'Crocs',
    region: 'North America',
    status: 'completed',
    created_at: '2024-04-25T10:00:00Z',
  },
  {
    id: '2',
    original_brand: 'Nike',
    region: 'Europe',
    status: 'completed',
    created_at: '2024-04-24T09:00:00Z',
  },
  {
    id: '3',
    original_brand: 'Adidas',
    region: 'Asia-Pacific',
    status: 'completed',
    created_at: '2024-04-23T08:00:00Z',
  },
]

const mockCompetitors: Record<string, Competitor[]> = {
  '1': [
    {
      id: 'c1',
      search_id: '1',
      competitor_name: 'Adidas',
      platform: 'Instagram',
      competitor_url: 'https://www.instagram.com/adidas',
      fans_count: 29370861,
    },
    {
      id: 'c2',
      search_id: '1',
      competitor_name: 'Deckers Brands',
      platform: 'Instagram',
      competitor_url: 'https://www.instagram.com/ugg',
      fans_count: 2184056,
    },
    {
      id: 'c3',
      search_id: '1',
      competitor_name: 'Crocs',
      platform: 'Instagram',
      competitor_url: 'https://www.instagram.com/crocs',
      fans_count: 2694200,
    },
  ],
  '2': [
    {
      id: 'c4',
      search_id: '2',
      competitor_name: 'Adidas',
      platform: 'YouTube',
      competitor_url: 'https://www.youtube.com/adidas',
      fans_count: 5000000,
    },
    {
      id: 'c5',
      search_id: '2',
      competitor_name: 'Puma',
      platform: 'YouTube',
      competitor_url: 'https://www.youtube.com/puma',
      fans_count: 2000000,
    },
  ],
  '3': [
    {
      id: 'c6',
      search_id: '3',
      competitor_name: 'Nike',
      platform: 'TikTok',
      competitor_url: 'https://www.tiktok.com/@nike',
      fans_count: 10000000,
    },
  ],
}

export default function HistoryPage() {
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)

  const total = mockSearches.length
  const start = (page - 1) * PAGE_SIZE
  const end = start + PAGE_SIZE
  const searches = mockSearches.slice(start, end)

  const handleExpand = (searchId: string) => {
    setExpanded(expanded === searchId ? null : searchId)
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-8">Search History</h1>
      <div className="space-y-4">
        {searches.map((search) => (
          <div key={search.id} className="bg-gray-800 rounded-lg shadow p-4">
            <div
              className="flex flex-wrap gap-4 items-center cursor-pointer"
              onClick={() => handleExpand(search.id)}
            >
              <span className="font-semibold text-lg">Brand: {search.original_brand}</span>
              <span className="text-gray-400">Region: {search.region}</span>
              <span className="text-gray-400">Status: {search.status}</span>
              <span className="text-gray-400">Time: {new Date(search.created_at).toLocaleString()}</span>
              <span className="ml-auto text-blue-400 underline">
                {expanded === search.id ? '收起' : '展开'}
              </span>
            </div>
            {expanded === search.id && (
              <div className="mt-4">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm border-separate border-spacing-y-2">
                    <thead>
                      <tr className="bg-gray-700">
                        <th className="px-4 py-2 text-left">Brand</th>
                        <th className="px-4 py-2 text-left">Platform</th>
                        <th className="px-4 py-2 text-left">Competitor</th>
                        <th className="px-4 py-2 text-left">URL</th>
                        <th className="px-4 py-2 text-left">Followers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockCompetitors[search.id]?.length ? (
                        mockCompetitors[search.id].map((c) => (
                          <tr key={c.id} className="bg-gray-900 border-b border-gray-700">
                            <td className="px-4 py-2">{search.original_brand}</td>
                            <td className="px-4 py-2">{c.platform}</td>
                            <td className="px-4 py-2">{c.competitor_name}</td>
                            <td className="px-4 py-2">
                              <a href={c.competitor_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline break-all">
                                {c.competitor_url}
                              </a>
                            </td>
                            <td className="px-4 py-2">{c.fans_count ?? '-'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={5} className="text-center text-gray-400 py-4">No competitors</td></tr>
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
            上一页
          </button>
          <span>
            第 {page} / {Math.ceil(total / PAGE_SIZE)} 页
          </span>
          <button
            className="px-4 py-2 bg-gray-700 rounded disabled:opacity-50"
            onClick={() => setPage((p) => Math.min(Math.ceil(total / PAGE_SIZE), p + 1))}
            disabled={page === Math.ceil(total / PAGE_SIZE)}
          >
            下一页
          </button>
        </div>
      </div>
    </main>
  )
}