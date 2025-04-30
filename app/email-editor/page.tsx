'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { EMAIL_TEMPLATES } from '@/lib/prompts'
import { supabase } from '@/lib/supabase'
import ReactMarkdown from 'react-markdown'

type TemplateType = keyof typeof EMAIL_TEMPLATES

export default function EmailEditorPage() {
  const searchParams = useSearchParams()
  const idsParam = searchParams.get('ids') || ''
  const ids = idsParam.split(',').filter(Boolean)

  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('YouTube Prospecting')
  const [customTemplate, setCustomTemplate] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Array<{
    template: string,
    content: string,
    timestamp: string
  }>>([])
  
  const [targetBrandName, setTargetBrandName] = useState('')
  const [contactName, setContactName] = useState('')
  const [jsonData, setJsonData] = useState('')

  // 获取原始品牌名称和竞品数据
  useEffect(() => {
    const fetchData = async () => {
      console.log('Fetching data with ids:', ids)
      
      if (ids.length === 0) {
        console.log('No ids provided')
        return
      }

      try {
        const { data, error } = await supabase
          .from('competitor_search_history')
          .select('*')
          .in('id', ids)
        
        console.log('Supabase response:', { data, error })
        
        if (error) {
          console.error('Supabase error:', error)
          return
        }

        if (!data || data.length === 0) {
          console.log('No data found')
          return
        }

        // 设置目标品牌名称
        const originalBrand = data[0].original_brand
        console.log('Setting original brand:', originalBrand)
        setTargetBrandName(originalBrand)
        
        // 处理竞品数据，移除不需要的字段
        const competitorData = data.map(item => ({
          competitor_name: item.competitor_name,
          original_brand: item.original_brand,
          region: item.region,
          platform: item.platform,
          competitor_url: item.competitor_url,
          logo: item.logo,
          followers: item.followers
        }))
        
        // 格式化 JSON 数据并设置
        const formattedJson = JSON.stringify(competitorData, null, 2)
        console.log('Setting competitor data:', formattedJson)
        setJsonData(formattedJson)
      } catch (err) {
        console.error('Error fetching data:', err)
      }
    }

    fetchData()
  }, [ids])

  const handleGenerate = async () => {
    if (!targetBrandName || !jsonData) {
      alert('Please fill in the necessary information (Target Brand Name and Data)')
      return
    }

    setLoading(true)
    try {
      const template = isCustom ? customTemplate : EMAIL_TEMPLATES[selectedTemplate]
      
      // 替换模板中的变量
      let processedTemplate = template
        .replace('{{targetBrandName}}', targetBrandName)
        .replace('{{contactName}}', contactName || '')

      // 添加 JSON 数据到模板
      processedTemplate = `${processedTemplate}\n\nJSON Data:\n${jsonData}`

      const response = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: processedTemplate
          }]
        })
      })
      
      const data = await response.json()
      
      if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('API returned incorrect data format')
      }

      setResults(prev => [{
        template: isCustom ? 'Custom Template' : selectedTemplate,
        content: data.choices[0].message.content,
        timestamp: new Date().toLocaleString()
      }, ...prev])
    } catch (error) {
      console.error('Generation failed:', error)
      if (error instanceof SyntaxError) {
        alert('JSON data format is incorrect, please check')
      } else {
        alert(error instanceof Error ? error.message : 'Generation failed, please try again')
      }
    } finally {
      setLoading(false)
    }
  }

  // 新增：格式化AI返回内容（如有<insight>/<email>标签则分段美化）
  function formatAIContent(content: string) {
    if (content.includes('<insight>') && content.includes('<email>')) {
      const insight = content.match(/<insight>([\s\S]*?)<\/insight>/)?.[1]?.trim() || ''
      const email = content.match(/<email>([\s\S]*?)<\/email>/)?.[1]?.trim() || ''
      return `## Insight\n${insight}\n\n## Email Content\n${email}`
    }
    return content
  }

  return (
    <div className="container">
      <h1>Email Editor</h1>
      <div style={{ background: '#fff', borderRadius: 24, boxShadow: '0 4px 10px rgba(0,0,0,0.1)', padding: 32, margin: '0 auto', marginTop: 32 }}>
        <div style={{ marginBottom: 32 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Template</label>
          <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
            <select
              style={{ flex: 1, border: '1px solid #ccc', borderRadius: 10, padding: '10px 14px', fontSize: 16 }}
              value={selectedTemplate}
              onChange={(e) => {
                setSelectedTemplate(e.target.value as TemplateType)
                setIsCustom(false)
                if (!isCustom) {
                  setCustomTemplate(EMAIL_TEMPLATES[e.target.value as TemplateType])
                }
              }}
              disabled={isCustom}
            >
              {Object.keys(EMAIL_TEMPLATES).map(template => (
                <option key={template} value={template}>
                  {template}
                </option>
              ))}
            </select>
            <button
              className="search-btn"
              style={{ width: 120, background: isCustom ? '#2563eb' : '#e0ecff', color: isCustom ? '#fff' : '#2563eb' }}
              onClick={() => {
                setIsCustom(!isCustom)
                if (!isCustom) {
                  setCustomTemplate(EMAIL_TEMPLATES[selectedTemplate])
                }
              }}
            >
              Custom
            </button>
          </div>
        </div>
        <div style={{ marginBottom: 32 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Target Brand Name</label>
          <input
            style={{ width: '100%', border: '1px solid #ccc', borderRadius: 10, padding: '10px 14px', fontSize: 16, marginBottom: 16 }}
            value={targetBrandName}
            onChange={e => setTargetBrandName(e.target.value)}
          />
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Contact Name (optional)</label>
          <input
            style={{ width: '100%', border: '1px solid #ccc', borderRadius: 10, padding: '10px 14px', fontSize: 16, marginBottom: 16 }}
            value={contactName}
            onChange={e => setContactName(e.target.value)}
          />
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Competitor Data (JSON)</label>
          <textarea
            style={{ width: '100%', border: '1px solid #ccc', borderRadius: 10, padding: '10px 14px', fontSize: 16, minHeight: 120, fontFamily: 'monospace', marginBottom: 16 }}
            value={jsonData}
            onChange={e => setJsonData(e.target.value)}
          />
        </div>
        {isCustom && (
          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Custom Template</label>
            <textarea
              style={{ width: '100%', border: '1px solid #ccc', borderRadius: 10, padding: '10px 14px', fontSize: 16, minHeight: 120, fontFamily: 'monospace', marginBottom: 16 }}
              value={customTemplate}
              onChange={e => setCustomTemplate(e.target.value)}
            />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 32 }}>
          <button
            className="search-btn"
            style={{ maxWidth: 300, width: 180 }}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? 'Generating...' : 'Generate Email'}
          </button>
        </div>
        {results.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontWeight: 700, fontSize: 22, marginBottom: 16 }}>Generated Emails</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {results.map((result, idx) => (
                <div key={idx} style={{ background: '#f9fafb', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: 24 }}>
                  <div style={{ color: '#888', fontSize: 14, marginBottom: 8 }}>{result.timestamp} - {result.template}</div>
                  <ReactMarkdown>{formatAIContent(result.content)}</ReactMarkdown>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 