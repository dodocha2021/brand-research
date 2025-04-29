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
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Email Editor</h1>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template
            </label>
            <div className="flex gap-4 mb-4">
              <select
                className="flex-1 border rounded-md px-3 py-2"
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
                className={`px-4 py-2 rounded-md ${
                  isCustom
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}
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

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Brand Name
              </label>
              <input
                type="text"
                className="w-full border rounded-md px-3 py-2"
                value={targetBrandName}
                onChange={(e) => setTargetBrandName(e.target.value)}
                placeholder="e.g. Coca-Cola"
              />
            </div>

            {selectedTemplate === 'YouTube Prospecting' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Name (Optional)
                </label>
                <input
                  type="text"
                  className="w-full border rounded-md px-3 py-2"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g. John Smith"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Competitor Data (JSON format)
              </label>
              <textarea
                className="w-full h-60 border rounded-md px-3 py-2 font-mono text-sm"
                value={jsonData}
                onChange={(e) => setJsonData(e.target.value)}
                placeholder="Please enter competitor data in JSON format..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Template Content
              </label>
              <textarea
                className={`w-full h-96 border rounded-md px-3 py-2 font-mono text-sm ${
                  isCustom ? '' : 'bg-gray-50'
                }`}
                value={isCustom ? customTemplate : EMAIL_TEMPLATES[selectedTemplate]}
                onChange={(e) => setCustomTemplate(e.target.value)}
                disabled={!isCustom}
                placeholder={isCustom ? "Enter your custom template..." : ""}
              />
            </div>
          </div>

          <button
            className={`w-full py-3 rounded-md font-medium ${
              loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? 'Waiting...' : 'Generate Email'}
          </button>
        </div>

        <div style={{ height: '10px', width: '100%' }} />

        <div className="space-y-6">
          {results.map((result, index) => (
            <div
              key={index}
              className="w-full bg-gray-100 rounded-2xl shadow-lg p-8 min-h-[200px] max-w-full overflow-auto border border-gray-200"
            >
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm text-gray-500">
                  Template: {result.template}
                </div>
                <div className="text-sm text-gray-500">
                  {result.timestamp}
                </div>
              </div>
              <div className="prose prose-lg max-w-none whitespace-pre-wrap">
                <ReactMarkdown>{formatAIContent(result.content)}</ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
} 