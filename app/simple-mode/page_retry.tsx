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

type ScrapedItem = {
  name: string
  platform: string
  url: string
  followers: number | null
  success: boolean
  error?: string
}

type ScrapeFollowersResponse = {
  results: ScrapedItem[]
  summary: {
    total: number
    successful: number
    failed: number
  }
}

// Target percentage for each step
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
  // Version number
  const [githubVersion, setGithubVersion] = useState<string | null>(null)
  const [terminalLogs, setTerminalLogs] = useState<string[]>([])
  const logWindowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(
      'https://raw.githubusercontent.com/dodocha2021/brand-research/main/package.json'
    )
      .then(res => res.json())
      .then(data => setGithubVersion(data.version || null))
      .catch(() => setGithubVersion(null))
  }, [])

  // Auto-scroll log window to bottom
  useEffect(() => {
    if (logWindowRef.current) {
      logWindowRef.current.scrollTop = logWindowRef.current.scrollHeight
    }
  }, [terminalLogs])

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

  // Timer reference for smooth progress
  const timerRef = useRef<number | null>(null)

  // When step changes, smoothly advance the progress bar
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
      setTerminalLogs([]) // Clear previous logs

      // 1. Create search session
      setStep('creating')
      setTerminalLogs(prev => [...prev, `Creating search session for brand: ${brandName}`])
      const createRes = await fetch('/api/simple-mode/create-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName }),
      })

      if (!createRes.ok) {
        const errorText = await createRes.text()
        throw new Error(`Create search failed: ${errorText}`)
      }

      const createJson = await createRes.json()
      setDebugResponses(prev => [...prev, { step: 'create-search', data: createJson }])
      const id = createJson.searchId
      if (!id) throw new Error('No search ID returned')
      setSearchId(id)
      setTerminalLogs(prev => [...prev, `Search session created with ID: ${id}`])

      // 2. Analyse competitors
      setStep('analysing')
      setTerminalLogs(prev => [...prev, `Analyzing competitors for ${brandName}`])
      const compRes = await fetch('/api/simple-mode/analyse-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName, searchId: id }),
      })

      if (!compRes.ok) {
        const errorText = await compRes.text()
        throw new Error(`Analyse competitors failed: ${errorText}`)
      }

      const compJson = await compRes.json()
      setDebugResponses(prev => [...prev, { step: 'analyse-competitors', data: compJson }])
      if (!Array.isArray(compJson.competitors)) {
        throw new Error('Invalid competitors data received')
      }
      setCompetitors(compJson.competitors)
      setTerminalLogs(prev => [...prev, `Found ${compJson.competitors.length - 1} competitors`])

      // 3. Build items list
      setStep('extracting')
      const allPlatforms = ['instagram', 'linkedin', 'tiktok', 'twitter', 'youtube'] as const
      const brandPlatforms: Item[] = allPlatforms.map(p => ({ name: brandName, platform: p }))
      const usePlatforms = platformSelection === 'all platform' ? allPlatforms : [platformSelection]
      const compItems: Item[] = compJson.competitors
        .slice(1)
        .flatMap((name: string) => usePlatforms.map(p => ({ name, platform: p })))
      const allItems: Item[] = [...brandPlatforms, ...compItems]
      setItems(allItems)
      setTerminalLogs(prev => [...prev, `Building items list for ${usePlatforms.join(', ')}`])

      // 4. Extract URLs
      const itemsWithUrl: Item[] = []
      for (const it of allItems) {
        setTerminalLogs(prev => [...prev, `Extracting URL for ${it.name} on ${it.platform}`])
        const urlRes = await fetch('/api/simple-mode/extract-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: it.name, platform: it.platform, searchId: id }),
        })

        if (!urlRes.ok) {
          const errorText = await urlRes.text()
          throw new Error(`Extract URL failed for ${it.platform}: ${errorText}`)
        }

        const urlJson = await urlRes.json()
        setDebugResponses(prev => [
          ...prev,
          { step: `extract-url:${it.platform}`, data: urlJson },
        ])
        itemsWithUrl.push({ ...it, url: urlJson.url })
        setTerminalLogs(prev => [...prev, `Found URL: ${urlJson.url}`])
      }
      setItems(itemsWithUrl)

      // 5. Scrape followers
      setStep('scraping')
      setTerminalLogs(prev => [...prev, 'Starting to scrape followers data...'])

      // Add all URLs to be scraped
      itemsWithUrl.forEach(item => {
        setTerminalLogs(prev => [...prev, `Fetching ${item.platform} data for URL: ${item.url}`])
      })

      const scrapeRes = await fetch('/api/simple-mode/scrape-followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsWithUrl, searchId: id }),
      })

      if (!scrapeRes.ok) {
        const errorText = await scrapeRes.text()
        throw new Error(`Scrape followers failed: ${errorText}`)
      }

      const scrapeJson = await scrapeRes.json() as ScrapeFollowersResponse
      setDebugResponses(prev => [...prev, { step: 'scrape-followers', data: scrapeJson }])

      // Add each platform scraping result
      scrapeJson.results.forEach(result => {
        const statusMessage = result.success 
          ? `Successfully scraped ${result.platform} for ${result.name}: ${result.followers} followers`
          : `Failed to scrape ${result.platform} for ${result.name}${result.error ? `: ${result.error}` : ''}`
        setTerminalLogs(prev => [...prev, statusMessage])
      })

      if (scrapeJson.summary.failed > 0) {
        const message = `${scrapeJson.summary.failed} items failed to scrape`
        console.warn(message)
        setTerminalLogs(prev => [...prev, `Warning: ${message}`])
      }

      setItems(scrapeJson.results)
      setTerminalLogs(prev => [
        ...prev, 
        `Scraping completed: ${scrapeJson.summary.successful} successful, ${scrapeJson.summary.failed} failed`
      ])

      // 6. Generate email
      setStep('generating')
      setTerminalLogs(prev => [...prev, 'Generating email content...'])
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

      if (!emailRes.ok) {
        const errorText = await emailRes.text()
        throw new Error(`Generate email failed: ${errorText}`)
      }

      const emailJson = await emailRes.json()
      setDebugResponses(prev => [...prev, { step: 'generate-email', data: emailJson }])
      setEmailContent(emailJson.content)
      setTerminalLogs(prev => [...prev, 'Email content generated successfully'])

      setStep('done')
      toast.success('Email generated!')
    } catch (err: any) {
      console.error('Error in handleGenerateEmail:', err)
      setErrorInfo(err.message)
      setStep('error')
      setTerminalLogs(prev => [...prev, `Error: ${err.message}`])
      toast.error('Error: ' + err.message)
    }
  }

  return (
    <div className="container" style={{ position: 'relative' }}>
      {/* Version number */}
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

      {/* Theme toggle */}
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <ThemeToggle />
      </div>

      <h1>Simple Mode One-Click Operation</h1>

      {step === 'idle' && (
        <div className="card">
          {/* Input form */}
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
          {/* Progress bar */}
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

          {/* Terminal log window */}
          <div
            ref={logWindowRef}
            style={{
              background: '#1e1e1e',
              color: '#fff',
              fontFamily: 'monospace',
              padding: '12px',
              borderRadius: '4px',
              height: '200px',
              overflowY: 'auto',
              marginBottom: '16px',
              fontSize: '12px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}
          >
            {terminalLogs.map((log, index) => (
              <div key={index} style={{ marginBottom: '4px', color: log.includes('Error:') ? '#ff6b6b' : log.includes('Warning:') ? '#ffd93d' : '#fff' }}>
                {log}
              </div>
            ))}
          </div>

          {/* Analysis results */}
          {step === 'analysing' && (
            <ul>
              {competitors.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}

          {/* Error */}
          {step === 'error' && <p style={{ color: 'red' }}>Error: {errorInfo}</p>}
        </div>
      )}

      {/* Show generated email after completion */}
      {step === 'done' && (
        <div className="card">
          <h2>Generated Email</h2>
          <div style={{ background: '#f3f4f6', padding: 16, borderRadius: 4 }}>
            <ReactMarkdown>{emailContent}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Debug information */}
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