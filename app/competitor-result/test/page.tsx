'use client'

import { useState } from 'react'
import { toast } from 'react-hot-toast'

const PLATFORMS = ['instagram', 'linkedin', 'tiktok', 'twitter', 'youtube']
const REGIONS = [
  { value: '', label: 'Select Region' },
  { value: 'North America', label: 'North America' },
  { value: 'Europe', label: 'Europe' },
  { value: 'Asia-Pacific', label: 'Asia-Pacific' },
  { value: 'Latin America', label: 'Latin America' },
  { value: 'Middle East & Africa', label: 'Middle East & Africa' },
  { value: 'Global', label: 'Global' }
]
const AI_MODELS = [
  { value: 'gpt', label: 'GPT' },
  { value: 'claude', label: 'Claude' }
]

export default function TestPage() {
  const [brand, setBrand] = useState('')
  const [platform, setPlatform] = useState('')
  const [region, setRegion] = useState('')
  const [aiModel, setAiModel] = useState('gpt')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')
  const [followers, setFollowers] = useState<number | null>(null)
  const [step, setStep] = useState<'idle' | 'google' | 'gpt'>('idle')

  // 根据平台构造请求体
  const getRequestBody = (url: string, platform: string) => {
    switch (platform) {
      case 'instagram':
        return { usernames: [url] }
      case 'linkedin':
        return { identifier: url }
      case 'tiktok':
        return {
          excludePinnedPosts: false,
          profiles: [url],
          resultsPerPage: 1,
          shouldDownloadAvatars: false,
          shouldDownloadCovers: false,
          shouldDownloadSlideshowImages: false,
          shouldDownloadSubtitles: false,
          shouldDownloadVideos: false,
          profileScrapeSections: ["videos"],
          profileSorting: "latest"
        }
      case 'twitter':
        return {
          maxItems: 1,
          sort: 'Latest',
          startUrls: [url]
        }
      case 'youtube':
        return {
          maxResultStreams: 0,
          maxResults: 1,
          maxResultsShorts: 0,
          sortVideosBy: 'POPULAR',
          startUrls: [{ url, method: 'GET' }]
        }
      default:
        throw new Error(`Unsupported platform: ${platform}`)
    }
  }

  // 从返回数据中提取关注者数量
  const extractFollowersCount = (data: any, platform: string): number | null => {
    try {
      const info = Array.isArray(data) ? data[0] : data
      switch (platform) {
        case 'instagram':
          return info?.followersCount ?? null
        case 'linkedin':
          return info?.stats?.follower_count ?? null
        case 'tiktok':
          return info?.authorMeta?.fans ?? null
        case 'twitter':
          return info?.author?.followers ?? null
        case 'youtube':
          return info?.aboutChannelInfo?.numberOfSubscribers ?? null
        default:
          return null
      }
    } catch (error) {
      console.error(`Error extracting followers for ${platform}:`, error)
      return null
    }
  }

  const handleSearch = async () => {
    if (!brand || !platform || !region || !aiModel) {
      toast.error('Please enter brand name, select platform, region, and AI model')
      return
    }

    setLoading(true)
    setStep('google')
    try {
      // 第一步：调用 google-gpt API
      const res = await fetch('/api/google-gpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand,
          platform,
          region,
          aiModel
        })
      })
      
      if (!res.ok) {
        const errorText = await res.text()
        console.error('API Response Error:', {
          status: res.status,
          statusText: res.statusText,
          error: errorText
        })
        throw new Error(`API Request Failed: ${res.status} ${res.statusText}`)
      }

      const data = await res.json()
      console.log('API Response Data:', data)

      if (data.url && data.url.trim() !== '') {
        setResult(data.url)
        toast.success('URL Found!')

        // 根据平台调用对应的 Apify API
        const followersRes = await fetch(`/api/apify/${platform}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(getRequestBody(data.url, platform))
        })

        if (!followersRes.ok) {
          const followersErrorText = await followersRes.text()
          console.error('Followers API Response Error:', {
            status: followersRes.status,
            statusText: followersRes.statusText,
            error: followersErrorText
          })
          throw new Error(`Followers API Request Failed: ${followersRes.status} ${followersRes.statusText}`)
        }

        const followersData = await followersRes.json()
        console.log('Followers API Response Data:', followersData)

        const followerCount = extractFollowersCount(followersData, platform)
        if (followerCount !== null) {
          setFollowers(followerCount)
          toast.success(`Followers Count: ${followerCount}`)
        } else {
          setFollowers(null)
          toast.error('Failed to extract followers count')
        }
      } else {
        console.log('URL not found, API Response:', data)
        setResult('')
        toast.error(data.error || 'URL not found')
      }
    } catch (e) {
      console.error('Search Failed:', e)
      toast.error(`Search Failed: ${e instanceof Error ? e.message : 'Unknown Error'}`)
    } finally {
      setLoading(false)
      setStep('idle')
    }
  }

  return (
    <div className="container" style={{ padding: '40px 20px' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <h1 style={{ marginBottom: 32 }}>Test Google + GPT Search</h1>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 品牌输入 */}
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>Brand Name:</label>
            <input
              value={brand}
              onChange={e => setBrand(e.target.value)}
              placeholder="Enter brand name"
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
            />
          </div>

          {/* 平台选择 */}
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>Platform:</label>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
            >
              <option value="">Select Platform</option>
              {PLATFORMS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* 地区选择 */}
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>Region:</label>
            <select
              value={region}
              onChange={e => setRegion(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
            >
              {REGIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {/* AI模型选择 */}
          <div>
            <label style={{ display: 'block', marginBottom: 8 }}>AI Model:</label>
            <select
              value={aiModel}
              onChange={e => setAiModel(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #ddd'
              }}
            >
              {AI_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* 搜索按钮 */}
          <button
            onClick={handleSearch}
            disabled={loading}
            style={{
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '12px',
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? (
              step === 'google' ? 'Google Searching...' : 'AI Analyzing...'
            ) : 'Search'}
          </button>

          {/* 结果显示 */}
          {result && result.trim() !== '' && (
            <div style={{ marginTop: 24 }}>
              <h3>Search Result:</h3>
              <a
                href={result}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#3b82f6',
                  textDecoration: 'none',
                  wordBreak: 'break-all'
                }}
              >
                {result}
              </a>
              {followers !== null && (
                <div>
                  <h4>Followers Count: {followers}</h4>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}