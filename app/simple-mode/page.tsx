// app/simple-mode/page.tsx
'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'

type Step = 'idle'|'savingHistory'|'fillingUrls'|'scraping'|'done'|'error'

export default function SimpleModePage() {
  const router = useRouter()

  const [step, setStep] = useState<Step>('idle')
  const [ids, setIds] = useState<string[]>([])
  const [current, setCurrent] = useState(0)
  const [errorInfo, setErrorInfo] = useState<string | null>(null)
  const [resultData, setResultData] = useState<any>(null)

  const handleStart = async () => {
    try {
      // 1. 写历史
      setStep('savingHistory')
      const historyRes = await fetch('/api/competitor-history', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ 
          // 替换为实际的查询参数
          brand: 'exampleBrand',
          platform: 'examplePlatform',
          region: 'exampleRegion'
        })
      })
      const historyJson = await historyRes.json()
      const newIds = historyJson.data.map((x:any)=> x.id)
      setIds(newIds)
  
      // 2. 填 URL
      setStep('fillingUrls')
      for (let i = 0; i < newIds.length; i++) {
        setCurrent(i)
        const urlRes = await fetch('/api/google-gpt', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            brand: 'exampleBrand', // 替换为实际值
            platform: 'examplePlatform', // 替换为实际值
            region: 'exampleRegion' // 替换为实际值
          })
        })
        const urlJson = await urlRes.json()
        if (!urlJson.url) {
          throw new Error(`第 ${i+1} 条 URL 为空`)
        }
        // 可选：立刻写回 DB 或者保持在前端缓存
      }
  
      // 3. 抓取
      setStep('scraping')
      const scrapeRes = await fetch(`/api/competitor-scrape?ids=${newIds.join(',')}`)
      const scrapeJson = await scrapeRes.json()
      setResultData(scrapeJson)
  
      setStep('done')
    } catch (err:any) {
      setErrorInfo(err.message)
      setStep('error')
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Simple Mode 一键操作</h1>

      {step === 'idle' && (
        <button onClick={handleStart}>开始一键流程</button>
      )}

      {step === 'savingHistory' && <p>正在保存历史…</p>}
      {step === 'fillingUrls' && <p>正在自动填 URL {current+1}/{ids.length}…</p>}
      {step === 'scraping' && <p>正在抓取数据…</p>}

      {step === 'done' && (
        <pre>{JSON.stringify(resultData, null, 2)}</pre>
      )}

      {step === 'error' && (
        <div style={{ color: 'red' }}>
          <p>步骤出错：{errorInfo}</p>
          <button onClick={() => {
            // 跳转到编辑页面，让用户手动修复某条
            router.push(`/competitor-result?ids=${ids.join(',')}`)
          }}>
            前往编辑
          </button>
        </div>
      )}
    </div>
  )
}