'use client'

import { useState } from 'react'
import { FiSearch, FiClock } from 'react-icons/fi'
import { toast } from 'react-hot-toast'

const regions = [
  'North America',
  'Europe',
  'Asia-Pacific',
  'Latin America',
  'Middle East & Africa'
]

const platforms = [
  'Instagram',
  'TikTok',
  'YouTube',
  'Twitter',
  'All Platforms'
]

export default function Home() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState('')

  const handleSearch = () => {
    if (!searchTerm.trim()) {
      toast.error('Please enter a brand name')
      return
    }
    if (!selectedRegion) {
      toast.error('Please select a region')
      return
    }
    if (!selectedPlatform) {
      toast.error('Please select a platform')
      return
    }

    // TODO: 处理搜索逻辑
    console.log('Searching for:', {
      brand: searchTerm,
      region: selectedRegion,
      platform: selectedPlatform
    })
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      {/* History Button */}
      <button
        className="absolute top-4 left-4 flex items-center gap-2 text-gray-600 hover:text-gray-900"
        onClick={() => {/* TODO: 实现历史记录功能 */}}
      >
        <FiClock className="text-xl" />
        <span>Search History</span>
      </button>

      {/* Main Content */}
      <div className="w-full max-w-2xl space-y-8">
        <h1 className="text-4xl font-bold text-center text-gray-900">
          Brand Competitor Analysis
        </h1>
        
        {/* Search Box */}
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Enter brand name..."
            className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
          >
            <FiSearch className="text-2xl" />
          </button>
        </div>

        {/* Dropdown Menus */}
        <div className="grid grid-cols-2 gap-4">
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Region</option>
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>

          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Platform</option>
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </div>
      </div>
    </main>
  )
}
