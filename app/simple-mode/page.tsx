'use client'

import React, { useState, useEffect, useRef } from 'react'
import { toast } from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'
import ThemeToggle from '@/app/ThemeToggle'

type Step =
  | 'idle'
  | 'creating'
  | 'analysing'
  | 'extracting'
  | 'scraping'
  | 'generating'
  | 'done'
  | 'error'

type Item = {
  name: string
  platform: string
  url?: string
  followers?: number | null
}

// 每个步骤对应的目标百分比
const statusPercent: Record<Step, number> = {
  idle: 0,
  creating: 10,
  analysing: 30,
  extracting: 50,
  scraping: 70,
  generating: 90,
  done: 100,
  error: 100,
}

export default function SimpleModePage() {
  // 版本号
  const [githubVersion, setGithubVersion] = useState<string | null>(null)
  useEffect(() => {
    fetch(
      'https://raw.githubusercontent.com/dodocha2021/brand-research/main/package.json'
    )
      .then(res => res.json())
      .then(data => setGithubVersion(data.version || null))
      .catch(() => setGithubVersion(null))
  }, [])

  const [step, setStep] = useState<Step>('idle')
  const [progress, setProgress] = useState<number>(0)
  const [brandName, setBrandName] = useState<string>('')
  const [contactName, setContactName] = useState<string>('')
  const [template, setTemplate] = useState<'YouTube Prospecting' | 'Full Competitive Analysis'>(
    'YouTube Prospecting'
  )
  const [platformSelection, setPlatformSelection] = useState<
    'all platform' | 'instagram' | 'linkedin' | 'tiktok' | 'twitter' | 'youtube'
  >('all platform')
  const [errorInfo, setErrorInfo] = useState<string | null>(null)
  const [searchId, setSearchId] = useState<string>('')
  const [competitors, setCompetitors] = useState<string[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [emailContent, setEmailContent] = useState<string>('')
  const [debugResponses, setDebugResponses] = useState<{ step: string; data: any }[]>([])

  // 定时器引用，用于平滑进度
  const timerRef = useRef<number | null>(null)

  // 当步骤变更时，平滑推进进度条
  useEffect(() => {
    const target = statusPercent[step]
    if (timerRef.current !== null) clearInterval(timerRef.current)
    if (target > progress) {
      timerRef.current = window.setInterval(() => {
        setProgress(prev => {
          if (prev < target) return prev + 1
          if (timerRef.current !== null) clearInterval(timerRef.current)
          return prev
        })
      }, 30)
    } else {
      setProgress(target)
    }
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current)
    }
  }, [step])

  const handleGenerateEmail = async () => {
    try {
      // 1. Create search session
      setStep('creating')
      const createRes = await fetch('/api/simple-mode/create-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName }),
      })
      const createJson = await createRes.json()
      setDebugResponses(prev => [...prev, { step: 'create-search', data: createJson }])
      const id = createJson.searchId
      setSearchId(id)

      // 2. Analyse competitors
      setStep('analysing')
      const compRes = await fetch('/api/simple-mode/analyse-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName, searchId: id }),
      })
      const compJson = (await compRes.json()) as { competitors: string[] }
      setDebugResponses(prev => [...prev, { step: 'analyse-competitors', data: compJson }])
      setCompetitors(compJson.competitors)

      // 3. Build items list
      setStep('extracting')
      const allPlatforms = ['instagram', 'linkedin', 'tiktok', 'twitter', 'youtube'] as const
      const brandPlatforms: Item[] = allPlatforms.map(p => ({ name: brandName, platform: p }))
      const usePlatforms = platformSelection === 'all platform' ? allPlatforms : [platformSelection]
      const compItems: Item[] = compJson.competitors
        .slice(1)
        .flatMap(name => usePlatforms.map(p => ({ name, platform: p })))
      const allItems: Item[] = [...brandPlatforms, ...compItems]
      setItems(allItems)

      // 4. Extract URLs
      const itemsWithUrl: Item[] = []
      for (const it of allItems) {
        const urlRes = await fetch('/api/simple-mode/extract-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: it.name, platform: it.platform, searchId: id }),
        })
        const urlJson = (await urlRes.json()) as { name: string; platform: string; url: string }
        setDebugResponses(prev => [
          ...prev,
          { step: `extract-url:${it.platform}`, data: urlJson },
        ])
        itemsWithUrl.push({ ...it, url: urlJson.url })
      }
      setItems(itemsWithUrl)

      // 5. Scrape followers
      setStep('scraping')
      const scrapeRes = await fetch('/api/simple-mode/scrape-followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsWithUrl, searchId: id }),
      })
      const scrapeJson = (await scrapeRes.json()) as { results: Item[] }
      setDebugResponses(prev => [...prev, { step: 'scrape-followers', data: scrapeJson }])
      setItems(scrapeJson.results)

      // 6. Generate email
      setStep('generating')
      const emailRes = await fetch('/api/simple-mode/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchId: id,
          selectedTemplate: template,
          customTemplate: '',
          contactName,
        }),
      })
      const emailJson = (await emailRes.json()) as { content: string }
      setDebugResponses(prev => [...prev, { step: 'generate-email', data: emailJson }])
      setEmailContent(emailJson.content)

      setStep('done')
      toast.success('Email generated!')
    } catch (err: any) {
      setErrorInfo(err.message)
      setStep('error')
      toast.error('Error: ' + err.message)
    }
  }

  return (
    <div className="container" style={{ position: 'relative' }}>
      {/* 版本号 */}
      <div
        style={{
          position: 'fixed',
          top: 8,
          left: 12,
          fontSize: 12,
          color: '#999',
        }}
      >
        {githubVersion ? `Version: ${githubVersion}` : 'Version: loading...'}
      </div>

      {/* 主题切换 */}
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <ThemeToggle />
      </div>

      <h1>Simple Mode One-Click Operation</h1>

      {step === 'idle' && (
        <div className="card">
          {/* 输入表单 */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Target Brand Name:</label>
            <input
              type="text"
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
              style={{ width: '100%', padding: 8 }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Contact Name (optional):</label>
            <input
              type="text"
              value={contactName}
              onChange={e => setContactName(e.target.value)}
              style={{ width: '100%', padding: 8 }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Template:</label>
            <select
              value={template}
              onChange={e => setTemplate(e.target.value as any)}
              style={{ width: '100%', padding: 8 }}
            >
              <option value="YouTube Prospecting">YouTube Prospecting</option>
              <option value="Full Competitive Analysis">Full Competitive Analysis</option>
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Search Platform for Competitors:</label>
            <select
              value={platformSelection}
              onChange={e =>
                setPlatformSelection(
                  e.target.value as
                    | 'all platform'
                    | 'instagram'
                    | 'linkedin'
                    | 'tiktok'
                    | 'twitter'
                    | 'youtube'
                )
              }
              style={{ width: '100%', padding: 8 }}
            >
              <option value="all platform">All Platforms</option>
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
              <option value="tiktok">TikTok</option>
              <option value="twitter">Twitter</option>
              <option value="youtube">YouTube</option>
            </select>
          </div>

          <button onClick={handleGenerateEmail} disabled={!brandName} className="search-btn">
            Generate Email
          </button>
        </div>
      )}

      {step !== 'idle' && (
        <div className="card">
          {/* 进度条 */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                background: '#e5e7eb',
                borderRadius: 6,
                height: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  background: '#3b82f6',
                  height: '100%',
                  transition: 'width 30ms linear',
                }}
              />
            </div>
            <p style={{ marginTop: 8, fontWeight: 600 }}>
              {progress}% – {step.charAt(0).toUpperCase() + step.slice(1)}
            </p>
          </div>

          {/* 分析结果 */}
          {step === 'analysing' && (
            <ul>
              {competitors.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}

          {/* 错误 */}
          {step === 'error' && <p style={{ color: 'red' }}>Error: {errorInfo}</p>}
        </div>
      )}

      {/* 完成后展示邮件 */}
      {step === 'done' && (
        <div className="card">
          <h2>Generated Email</h2>
          <div style={{ background: '#f3f4f6', padding: 16, borderRadius: 4 }}>
            <ReactMarkdown>{emailContent}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* 调试信息 */}
      <div className="card">
        <h3>Debug Responses</h3>
        {debugResponses.map((dbg, idx) => (
          <div key={idx} style={{ marginBottom: 12 }}>
            <strong>{dbg.step}:</strong>
            <pre
              style={{
                whiteSpace: 'pre-wrap',
                background: '#fff',
                padding: 8,
                borderRadius: 4,
              }}
            >
              {JSON.stringify(dbg.data, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  )
}