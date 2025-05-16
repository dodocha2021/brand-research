'use client'

import { useState, useEffect } from 'react'
import { FiSearch, FiClock } from 'react-icons/fi'
import { toast } from 'react-hot-toast'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [searchTerm, setSearchTerm] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'idle' | 'researching' | 'summarizing' | 'edit'>('idle')
  const router = useRouter()
  const [region, setRegion] = useState('Global')
  const [competitors, setCompetitors] = useState<string[]>([])
  const [githubVersion, setGithubVersion] = useState<string | null>(null)

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/dodocha2021/brand-research/main/package.json')
      .then(res => res.json())
      .then(data => setGithubVersion(data.version || null))
      .catch(() => setGithubVersion(null))
  }, [])

  const regions = [
    { value: '', label: 'Select Region' },
    { value: 'North America', label: 'North America' },
    { value: 'Europe', label: 'Europe' },
    { value: 'Asia-Pacific', label: 'Asia-Pacific' },
    { value: 'Latin America', label: 'Latin America' },
    { value: 'Middle East & Africa', label: 'Middle East & Africa' },
    { value: 'Global', label: 'Global' }
  ]

  const handleSearch = async () => {
    if (!searchTerm.trim() || !region) {
      toast.error('Please enter a brand name and select a region')
      return
    }
    setLoading(true)
    setStep('researching')
    setResult(null)
    try {
      // 1. 用 gpt-4o-search-preview-2025-03-11 生成报告
      const miniRes = await fetch('/api/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-search-preview-2025-03-11',
          max_tokens: 2000,
          messages: [
            {
              role: 'system',
              content: `You are a brand research specialist with expertise in competitive market analysis. 
Your task is to identify and analyze direct competitors of the specified brand in the given region.
Focus on providing accurate, verifiable information about market competitors.`
            },
            {
              role: 'user',
              content: `I need you to do Deep Research on The Direct competitors of a brand in a specific region.
Firstly make sure that the brand you are researching is the brand I have specified.
Secondly create a list of the brand's top competitors in the specified region.
Thirdly verify that these are indeed the correct list of competitors for the brand mentioned.
Be thorough in your verification and validation as the information needs to be accurate.
Remember at the end of your output provide a numbered list of all direct competitors to the brand in the specified region.`
            },
            {
              role: 'user',
              content: `Brand: ${searchTerm}
Region: ${region}`
            }
          ],
          response_format: {
            type: "text"
          },
          web_search_options: {
            user_location: {
              type: "approximate",
              approximate: {
                country: ""
              }
            }
          }
        })
      })
      const miniData = await miniRes.json()
      const report = miniData?.choices?.[0]?.message?.content || ''
      if (!report) throw new Error('gpt-4o-search-preview did not return content')

      // 2. 用 gpt-4o 总结，只输出竞品列表
      setStep('summarizing')
      
      const summaryRes = await fetch('/api/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 512,
          messages: [
            { 
              role: 'system',
              content: 'You are a data extraction assistant. Your task is to extract specific information from reports and format it as requested.'
            },
            { 
              role: 'user', 
              content: `Below is a report generated about the brand ${searchTerm} and its top direct competitors in the ${region} area. 
Extract ONLY the direct competitors from the report, EXCLUDING the brand itself (${searchTerm}).
Format the output as a simple comma-separated list.
IMPORTANT: Ensure each competitor name is complete with its full legal entity (if mentioned), and avoid splitting company names from their legal suffixes (like Inc., Ltd., Co., etc.). 
Do NOT list legal suffixes (Inc., Ltd., Co., etc.) as separate entities.
Output ONLY the list of competitors, nothing else.`
            },
            {
              role: 'user',
              content: report
            }
          ]
        })
      })
      const gpt4oData = await summaryRes.json()
      const competitorsText = gpt4oData?.choices?.[0]?.message?.content || ''
      setResult(competitorsText)
      // 处理返回的竞争对手文本，移除单独出现的法律实体后缀
      const processCompetitorsList = (text: string) => {
        // 分割并整理
        let competitors = text.split(',').map(c => c.trim()).filter(Boolean);
        
        // 过滤掉单独的法律实体后缀
        const legalSuffixes = ['Inc.', 'Ltd.', 'Co.', 'LLC', 'Corporation', 'Corp.', 'Limited', 'GmbH'];
        competitors = competitors.filter(comp => !legalSuffixes.includes(comp));
        
        return competitors;
      };

      const competitorsList = processCompetitorsList(competitorsText);
      setCompetitors([searchTerm, ...competitorsList]);
      setStep('edit')
    } catch (e: any) {
      setResult(e.message || 'Error occurred')
      setStep('idle')
    }
    setLoading(false)
  }

  // 编辑竞争对手输入框
  const handleCompetitorChange = (idx: number, value: string) => {
    if (idx === 0) return // Do not allow editing the first element (search keyword)
    setCompetitors(prev => {
      const arr = [...prev]
      arr[idx] = value
      return arr
    })
  }

  // 删除竞争对手
  const handleRemoveCompetitor = (idx: number) => {
    if (idx === 0) return // Do not allow deleting the first element (search keyword)
    setCompetitors(prev => {
      if (prev.length === 1) return ['']
      return prev.filter((_, i) => i !== idx)
    })
  }

  // 添加竞争对手
  const handleAddCompetitor = () => {
    setCompetitors(prev => [...prev, ''])
  }

  // 点击 Next，写入数据库
  const handleNext = async () => {
    const filtered = competitors.map(c => c.trim()).filter(Boolean)
    if (filtered.length <= 1) {
      toast.error('Please enter at least one competitor')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/competitor-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalBrand: searchTerm,
          region,
          competitors: filtered
        })
      })
      const json = await res.json()
      const inserted = json.data
      if (!Array.isArray(inserted) || inserted.length === 0) {
        toast.error('Save failed')
        setLoading(false)
        return
      }
      const ids = inserted.map(i => i.id).join(',')
      router.push(`/competitor-result?ids=${ids}`)
    } catch (e) {
      toast.error('Save failed')
    }
    setLoading(false)
  }

  return (
    <>
      {/* 版本号 */}
      <div style={{ position: 'fixed', top: 8, left: 12, fontSize: 12, color: '#555' }}>
        {githubVersion ? `Version: ${githubVersion}` : 'Version: loading...'}
      </div>

      <div className="container">
        <h1>Brand Competitor Analysis</h1>

        {/* 搜索行：输入框和下拉菜单同一行 */}
        <div className="search-row">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Enter brand name..."
            disabled={loading || step !== 'idle'}
          />
          <select value={region} onChange={e => setRegion(e.target.value)} disabled={loading}>
            {regions.map(r => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Search 和历史 & Simple Mode 按钮 */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <button
            className="search-btn"
            onClick={handleSearch}
            disabled={loading || !searchTerm.trim() || !region}
            style={{ maxWidth: 300 }}
          >
            {loading && step !== 'edit' ? '⏳' : 'Search'}
          </button>
          <button
            className="search-btn"
            style={{ width: 80, background: '#e0ecff', color: '#2563eb', marginLeft: 16 }}
            onClick={() => window.location.href = '/history'}
          >
            Search History
          </button>
          <button
            className="search-btn"
            style={{ width: 80, background: '#e0ecff', color: '#2563eb', marginLeft: 16 }}
            onClick={() => window.location.href = '/simple-mode'}
          >
            Simple Mode
          </button>
        </div>

        {/* 结果区域 */}
        <div style={{ marginTop: 32 }}>
          {loading && step !== 'edit' && (
            <div
              style={{
                textAlign: 'center',
                color: '#2563eb',
                fontWeight: 600,
                fontSize: 20,
                padding: 24
              }}
            >
              {step === 'researching' && 'Analyzing ...'}
              {step === 'summarizing' && 'Summarizing ...'}
            </div>
          )}

          {/* 可编辑竞争对手列表 */}
          {step === 'edit' && (
            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: 24,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                marginBottom: 24
              }}
            >
              {competitors.map((c, idx) => (
                <div
                  key={idx}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}
                >
                  <input
                    type="text"
                    value={c}
                    onChange={e => handleCompetitorChange(idx, e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #ccc',
                      fontSize: 16
                    }}
                    placeholder={`Competitor ${idx + 1}`}
                  />
                  {idx > 0 && (
                    <button
                      onClick={() => handleRemoveCompetitor(idx)}
                      style={{
                        color: '#f87171',
                        fontSize: 20,
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <button
                  onClick={handleAddCompetitor}
                  style={{
                    color: '#2563eb',
                    fontSize: 22,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer'
                  }}
                >
                  ＋
                </button>
                <span style={{ color: '#666', fontSize: 15 }}>
                  AI can make mistakes. Please double-check, add, delete, or edit competitors above
                  before pressing Next.
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button
                  onClick={handleNext}
                  style={{
                    background: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: '8px 24px',
                    fontWeight: 600,
                    fontSize: 16,
                    cursor: 'pointer'
                  }}
                  disabled={loading}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* 只读结果 */}
          {result && step !== 'edit' && (
            <div
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: 24,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
              }}
            >
              <ol style={{ paddingLeft: 24 }}>
                {result.split(',').map((item, idx) => (
                  <li
                    key={idx}
                    style={{ fontSize: 18, color: '#222', marginBottom: 8 }}
                  >
                    {item.trim()}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    </>
  )
}