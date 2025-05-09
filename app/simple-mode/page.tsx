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
  success?: boolean
  error?: string
}

// Percentage target for each step
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
  useEffect(() => {
    fetch(
      'https://raw.githubusercontent.com/dodocha2021/brand-research/main/package.json'
    )
      .then((res) => res.json())
      .then((data) => setGithubVersion(data.version || null))
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

  // New state: when invalid data exists, require user action
  const [needUserAction, setNeedUserAction] = useState<boolean>(false)
  // Save invalid items for displaying retry options
  const [incompleteItems, setIncompleteItems] = useState<Item[]>([])
  // New state: indices of items currently retrying
  const [retryingIndices, setRetryingIndices] = useState<number[]>([])

  // Timer reference for smooth progress updates
  const timerRef = useRef<number | null>(null)

  // Ref for debug responses container to auto-scroll
  const debugContainerRef = useRef<HTMLDivElement>(null)

  // Update progress bar when step changes
  useEffect(() => {
    const target = statusPercent[step]
    if (timerRef.current !== null) clearInterval(timerRef.current)
    if (target > progress) {
      timerRef.current = window.setInterval(() => {
        setProgress((prev) => {
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

  // Auto-scroll debug responses to bottom on update
  useEffect(() => {
    if (debugContainerRef.current) {
      debugContainerRef.current.scrollTop = debugContainerRef.current.scrollHeight
    }
  }, [debugResponses])

  // Handle retry for a single URL with interactive feedback
  const handleRetry = async (item: Item, index: number) => {
    // Mark this item as retrying
    setRetryingIndices((prev) => [...prev, index])
    try {
      const retryRes = await fetch('/api/simple-mode/scrape-followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [item], searchId }),
      })
      const retryJson = await retryRes.json()
      setDebugResponses((prev) => [
        ...prev,
        { step: `scrape-followers-retry (${item.platform})`, data: retryJson },
      ])
      const newItem: Item = retryJson.results[0]
      // Update the item in state
      setItems((prev) =>
        prev.map((it) =>
          it.platform === item.platform && it.name === item.name ? newItem : it
        )
      )
      // Update incompleteItems; if all items become valid, proceed
      setIncompleteItems((prev) => {
        const updated = prev.map((it, i) => (i === index ? newItem : it))
        const filtered = updated.filter(
          (it) =>
            it.followers === undefined || it.followers === null || it.followers <= 200
        )
        if (filtered.length === 0) {
          setNeedUserAction(false)
          handleGenerateEmailAfterScraping()
        }
        return updated
      })
    } catch (e: any) {
      toast.error('Retry failed: ' + e.message)
    } finally {
      // Remove the index from retryingIndices once the retry is completed
      setRetryingIndices((prev) => prev.filter((i) => i !== index))
    }
  }

  // 修改 handleIgnoreAll: 当点击 ignore 时，只保留已经更新为有效的数据，而不删除 retry 后更新的数据
  const handleIgnoreAll = async () => {
    try {
      // 保留那些已经有效（followers 非空且大于等于200）的记录
      const validItems = items.filter(
        (item: Item) =>
          item.followers !== undefined &&
          item.followers !== null &&
          item.followers >= 200
      )
      setItems(validItems)
      setNeedUserAction(false)
      handleGenerateEmailAfterScraping()
    } catch (e: any) {
      toast.error('Ignore failed: ' + e.message)
    }
  }

  // Generate email after successful scraping (all data valid)
  const handleGenerateEmailAfterScraping = async () => {
    try {
      setStep('generating')
      const emailRes = await fetch('/api/simple-mode/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchId,
          selectedTemplate: template,
          customTemplate: '',
          contactName,
        }),
      })
      const emailJson = (await emailRes.json()) as { content: string }
      setDebugResponses((prev) => [
        ...prev,
        { step: 'generate-email', data: emailJson },
      ])
      setEmailContent(emailJson.content)
      setStep('done')
      toast.success('Email generated successfully!')
    } catch (err: any) {
      setErrorInfo(err.message)
      setStep('error')
      toast.error('Error: ' + err.message)
    }
  }

  // Main process: create search, analyze competitors, extract URLs, scrape followers,
  // and decide if user intervention is required
  const handleGenerateEmail = async () => {
    try {
      // Step 1: Create search session
      setStep('creating')
      const createRes = await fetch('/api/simple-mode/create-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName }),
      })
      const createJson = await createRes.json()
      setDebugResponses((prev) => [
        ...prev,
        { step: 'create-search', data: createJson },
      ])
      const id = createJson.searchId
      setSearchId(id)

      // Step 2: Analyze competitors
      setStep('analysing')
      const compRes = await fetch('/api/simple-mode/analyse-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandName, searchId: id }),
      })
      const compJson = (await compRes.json()) as { competitors: string[] }
      setDebugResponses((prev) => [
        ...prev,
        { step: 'analyse-competitors', data: compJson },
      ])
      setCompetitors(compJson.competitors)

      // Step 3: Build items list
      setStep('extracting')
      const allPlatforms = ['instagram', 'linkedin', 'tiktok', 'twitter', 'youtube'] as const
      const brandPlatforms: Item[] = allPlatforms.map((p) => ({ name: brandName, platform: p }))
      const usePlatforms =
        platformSelection === 'all platform' ? allPlatforms : [platformSelection]
      const compItems: Item[] = compJson.competitors
        .slice(1)
        .flatMap((name) => usePlatforms.map((p) => ({ name, platform: p })))
      const allItems: Item[] = [...brandPlatforms, ...compItems]

      // Step 4: Extract URLs
      const itemsWithUrl: Item[] = []
      for (const it of allItems) {
        const urlRes = await fetch('/api/simple-mode/extract-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: it.name, platform: it.platform, searchId: id }),
        })
        const urlJson = (await urlRes.json()) as { name: string; platform: string; url: string }
        setDebugResponses((prev) => [
          ...prev,
          { step: `extract-url:${it.platform}`, data: urlJson },
        ])
        itemsWithUrl.push({ ...it, url: urlJson.url })
      }
      setItems(itemsWithUrl)

      // Step 5: Scrape followers data
      setStep('scraping')
      const scrapeRes = await fetch('/api/simple-mode/scrape-followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsWithUrl, searchId: id }),
      })
      const scrapeJson = await scrapeRes.json()
      setDebugResponses((prev) => [
        ...prev,
        { step: 'scrape-followers', data: scrapeJson },
      ])

      // If invalid data is detected, require user action
      if (scrapeJson.needUserAction) {
        setNeedUserAction(true)
        setIncompleteItems(
          scrapeJson.results.filter(
            (item: Item) =>
              item.followers === undefined ||
              item.followers === null ||
              item.followers <= 200
          )
        )
        setItems(scrapeJson.results)
        return
      } else {
        setItems(scrapeJson.results)
      }

      // Step 6: Generate email
      handleGenerateEmailAfterScraping()
    } catch (err: any) {
      setErrorInfo(err.message)
      setStep('error')
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
              onChange={(e) => setBrandName(e.target.value)}
              style={{ width: '100%', padding: 8 }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Contact Name (optional):</label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              style={{ width: '100%', padding: 8 }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4 }}>Template:</label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value as any)}
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
              onChange={(e) =>
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

      {/* When user action is required, display invalid items with retry options */}
      {needUserAction && (
        <div className="card">
          <h3>Invalid Data Detected – Action Required</h3>
          <p>
            The following items have invalid data (followers are null or not greater than 200).
            Please choose to retry for each link individually or ignore all invalid data:
          </p>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {incompleteItems.map((item, index) => (
              <li
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px'
                }}
              >
                <span>
                  Brand: {item.name} | Platform: {item.platform} | Link: {item.url ? item.url : 'N/A'} | Followers:{' '}
                  {item.followers === null ? 'null' : item.followers}
                </span>
                {item.followers !== undefined &&
                item.followers !== null &&
                item.followers >= 200 ? (
                  <span style={{ padding: '4px 8px', fontSize: '0.8rem' }}>✅</span>
                ) : (
                  <button
                    onClick={() => handleRetry(item, index)}
                    disabled={retryingIndices.includes(index)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '0.8rem',
                      backgroundColor: retryingIndices.includes(index) ? '#ccc' : undefined
                    }}
                  >
                    {retryingIndices.includes(index) ? 'Retrying...' : 'Retry'}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button onClick={handleIgnoreAll} className="search-btn">
            Ignore Invalid Data & Next
          </button>
        </div>
      )}

      {/* Display generated email */}
      {step === 'done' && (
        <div className="card">
          <h2>Generated Email</h2>
          <div style={{ background: '#f3f4f6', padding: 16, borderRadius: 4 }}>
            <ReactMarkdown>{emailContent}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Debug responses */}
      <div className="card">
        <h3>Debug Responses</h3>
        <div
          ref={debugContainerRef}
          style={{
            background: 'black',
            color: '#39FF14',
            padding: '8px',
            height: '200px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            resize: 'vertical'
          }}
        >
          {debugResponses.map((dbg, idx) => (
            <div key={idx} style={{ marginBottom: '12px' }}>
              <strong>{dbg.step}:</strong>
              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                {JSON.stringify(dbg.data, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}