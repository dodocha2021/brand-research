'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
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
  id: string
  name: string
  platform: string
  url?: string
  followers?: number | null
  success?: boolean
  error?: string
  actorRunId?: string
  defaultDatasetId?: string
  fans_count?: number | null
}

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
  const [, updateState] = useState<object>({})
  const forceUpdate = useCallback(() => updateState({}), [])

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

  // 用户介入相关
  const [needUserAction, setNeedUserAction] = useState<boolean>(false)
  const [incompleteItems, setIncompleteItems] = useState<Item[]>([])
  const [retryingIndices, setRetryingIndices] = useState<number[]>([])

  // scraping 轮询相关
  const [scrapingPolling, setScrapingPolling] = useState<boolean>(false)

  // 添加状态来跟踪webhook第一次通知的时间
  const [firstWebhookTime, setFirstWebhookTime] = useState<number | null>(null);
  const [checkCompleted, setCheckCompleted] = useState<boolean>(false);

  const timerRef = useRef<number | null>(null)
  const debugContainerRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (debugContainerRef.current) {
      debugContainerRef.current.scrollTop = debugContainerRef.current.scrollHeight
    }
  }, [debugResponses])

  // 在现有的轮询效果中添加逻辑
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (scrapingPolling && searchId) {
      const currentTime = Date.now();
      
      // 常规轮询，检查是否有任何webhook通知到达
      timeoutId = setTimeout(async () => {
        try {
          // 获取当前数据状态
          const res = await fetch('/api/simple-mode/get-competitor-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchId })
          });
          const data = await res.json();
          
          // 更新items状态
          setItems(data.items);
          
          // 检查是否至少有一个项目有defaultDatasetId，表示至少一个webhook已经触发
          const hasAnyWebhookData = data.items.some((item: Item) => 
            item.defaultDatasetId !== null && item.defaultDatasetId !== undefined
          );
          
          // 如果发现第一次webhook数据，记录时间
          if (hasAnyWebhookData && firstWebhookTime === null) {
            console.log('第一次检测到webhook数据，设置3分钟后检查');
            setFirstWebhookTime(currentTime);
          }
          
          // 如果已经过了第一次webhook后的3分钟，并且尚未执行完整检查
          if (firstWebhookTime !== null && 
              currentTime - firstWebhookTime >= 3 * 60 * 1000 && 
              !checkCompleted) {
            
            console.log('执行3分钟后的完整数据检查');
            // 执行完整检查
            let needsUserAction = false;
            const incomplete = [];
            
            for (const item of data.items) {
              // 检查哪些项目需要用户介入
              if (item.platform === 'youtube') {
                // 确保只有无效数据才会被筛选出来
                const followers = item.fans_count || item.followers;
                if (!item.url || followers === undefined || followers === null || followers <= 200) {
                  needsUserAction = true;
                  incomplete.push(item);
                }
              } else {
                // 其他平台的检查逻辑
                const followers = item.followers;
                if (!item.url || followers === undefined || followers === null || followers <= 200) {
                  needsUserAction = true;
                  incomplete.push(item);
                }
              }
            }
            
            // 标记检查已完成
            setCheckCompleted(true);
            setScrapingPolling(false);
            
            if (needsUserAction) {
              // 显示用户介入界面
              setNeedUserAction(true);
              setIncompleteItems(incomplete);
            } else {
              // 所有数据有效，继续下一步
              handleGenerateEmailAfterScraping();
            }
          } else if (!checkCompleted) {
            // 继续轮询直到3分钟后检查完成
            setTimeout(() => setFirstWebhookTime(firstWebhookTime), 10000); // 10秒后再次检查
          }
        } catch (e: any) {
          setErrorInfo(e.message);
          setStep('error');
        }
      }, 10000); // 使用10秒的轮询间隔，仅为了检测第一次webhook
    }
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [scrapingPolling, searchId, firstWebhookTime, checkCompleted]);

  // 单个重试
  const handleRetry = async (item: Item, index: number) => {
    setRetryingIndices((prev) => [...prev, index])
    try {
      toast.success(`已提交请求，正在后台处理...`);
      
      // 使用异步API启动Apify任务
      const retryRes = await fetch('/api/apify/youtube_async', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          startUrls: [
            { url: item.url, method: "GET" }
          ],
          id: item.id,
          searchId
        })
      });
      
      if (!retryRes.ok) {
        const errorText = await retryRes.text();
        throw new Error(`启动任务失败: ${errorText}`);
      }
      
      const resultData = await retryRes.json();
      setDebugResponses((prev) => [
        ...prev,
        { step: `youtube-retry-request (${item.platform})`, data: resultData },
      ]);
      
      toast.success(`请求已提交，数据将在后台更新`);
      
      // 2分钟后自动检查数据库更新
      setTimeout(async () => {
        try {
          // 查询数据库中的最新数据
          const res = await fetch('/api/simple-mode/get-competitor-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchId })
          });
          
          if (!res.ok) {
            throw new Error('获取数据失败');
          }
          
          const data = await res.json();
          
          // 查找当前项目的更新数据
          const updatedItem = data.items.find((i: Item) => i.id === item.id);
          
          if (updatedItem && updatedItem.fans_count !== null && updatedItem.fans_count !== undefined) {
            const isSuccess = updatedItem.fans_count > 200;
            
            // 更新本地状态
            setItems(prevItems => prevItems.map(prevItem => 
              prevItem.id === item.id 
                ? { ...prevItem, followers: updatedItem.fans_count, fans_count: updatedItem.fans_count, success: isSuccess } 
                : prevItem
            ));
            
            // 更新incompleteItems状态 - 创建全新数组以确保重新渲染
            setIncompleteItems(prev => {
              const newArray = [...prev]; // 创建新数组
              const itemIndex = newArray.findIndex(it => it.id === item.id);
              if (itemIndex >= 0) {
                // 替换为新对象
                newArray[itemIndex] = { 
                  ...newArray[itemIndex], 
                  followers: updatedItem.fans_count, 
                  fans_count: updatedItem.fans_count, 
                  success: isSuccess
                };
              }
              return newArray; // 返回新数组以触发重新渲染
            });
            
            if (isSuccess) {
              toast.success(`成功获取 ${item.name} 的关注者数: ${updatedItem.fans_count}`);
            } else {
              toast.error(`${item.name} 的关注者数 ${updatedItem.fans_count} 低于要求的阈值`);
            }
            
            // 强制整个界面重新渲染
            forceUpdate();
          }
          
          // 无论更新是否成功，都移除重试状态
          setRetryingIndices((prev) => prev.filter((i) => i !== index));
          
        } catch (err) {
          console.error('检查更新失败:', err);
          // 超时后也移除重试状态
          setRetryingIndices((prev) => prev.filter((i) => i !== index));
        }
      }, 120000); // 2分钟后检查
      
    } catch (e: any) {
      toast.error('重试请求失败: ' + e.message);
      // 如果请求失败，恢复按钮状态
      setRetryingIndices((prev) => prev.filter((i) => i !== index));
    }
  }

  // 忽略所有无效项
  const handleIgnoreAll = async () => {
    try {
      // 只保留有效项
      const validItems = items.filter(
        (item: Item) => item.followers !== undefined && item.followers !== null && item.followers >= 200
      )
      setItems(validItems)
      setNeedUserAction(false)
      handleGenerateEmailAfterScraping()
    } catch (e: any) {
      toast.error('Ignore failed: ' + e.message)
    }
  }

  // scraping 完成后生成邮件
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

  // 主流程
  const handleGenerateEmail = async () => {
    try {
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

      setStep('extracting')
      const allPlatforms = ['instagram', 'linkedin', 'tiktok', 'twitter', 'youtube'] as const
      const brandPlatforms: Item[] = allPlatforms.map((p) => ({ name: brandName, platform: p, id: '' }))
      const usePlatforms =
        platformSelection === 'all platform' ? allPlatforms : [platformSelection]
      const compItems: Item[] = compJson.competitors
        .slice(1)
        .flatMap((name) => usePlatforms.map((p) => ({ name, platform: p, id: '' })))
      const allItems: Item[] = [...brandPlatforms, ...compItems]

      // 提取URL并写入数据库
      const itemsWithUrl: Item[] = []
      for (const it of allItems) {
        const urlRes = await fetch('/api/simple-mode/extract-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: it.name, platform: it.platform, searchId: id }),
        })
        const urlJson = (await urlRes.json()) as { name: string; platform: string; url: string; id: string }
        setDebugResponses((prev) => [
          ...prev,
          { step: `extract-url:${it.platform}`, data: urlJson },
        ])
        itemsWithUrl.push({ ...it, url: urlJson.url, id: urlJson.id })
      }
      setItems(itemsWithUrl)

      // 处理竞争对手数据
      for (const item of itemsWithUrl) {
        const updateRes = await fetch('/api/simple-mode/update-competitor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            search_id: id, // 使用创建的 search_id
            competitor_name: item.name, // 竞争对手名称
            platform: item.platform, // 使用提取的实际平台
            url: item.url, // 使用提取的实际 URL
          }),
        });

        const updateJson = await updateRes.json();
        setDebugResponses((prev) => [
          ...prev,
          { step: 'update-competitor', data: updateJson },
        ]);
      }

      // scraping 步骤，调用API并开始轮询
      setStep('scraping')
      await fetch('/api/simple-mode/scrape-followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchId: id }),
      })
      setScrapingPolling(true)
    } catch (err: any) {
      setErrorInfo(err.message)
      setStep('error')
      toast.error('Error: ' + err.message)
    }
  }

  // 添加一个调试函数，用于手动触发Invalid Data显示
  const debugShowInvalidData = async () => {
    try {
      // 获取真实数据
      const res = await fetch('/api/simple-mode/get-competitor-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchId })
      });
      const data = await res.json();
      
      // 找出真正需要用户介入的项目
      const incomplete = data.items.filter((item: Item) => {
        if (item.platform === 'youtube') {
          // 确保只有无效数据才会被筛选出来
          const followers = item.fans_count || item.followers;
          return !item.url || followers === undefined || followers === null || followers <= 200;
        } else {
          const followers = item.followers;
          return !item.url || followers === undefined || followers === null || followers <= 200;
        }
      });
      
      setNeedUserAction(true);
      setIncompleteItems(incomplete);
      setScrapingPolling(false);
      
      toast.success(`找到 ${incomplete.length} 个无效数据项`);
    } catch (e: any) {
      console.error('Failed to load invalid data:', e);
      toast.error('加载真实无效数据失败: ' + e.message);
    }
  };

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
        {/* 添加调试按钮 */}
        <button 
          onClick={debugShowInvalidData} 
          style={{ 
            marginLeft: 10, 
            padding: '4px 8px', 
            background: '#666', 
            color: 'white', 
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          显示真实无效数据
        </button>
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

      {/* 用户介入：显示无效项和重试选项 */}
      {needUserAction && (
        <div className="card">
          <h3>Invalid Data Detected – Action Required</h3>
          <p>
            The following items have invalid data (followers are null or not greater than 200).
            Please choose to retry for each link individually or ignore all invalid data:
          </p>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {incompleteItems.map((item, index) => {
              // 确定是否显示成功标记
              const hasValidFollowers = 
                (item.followers !== undefined && item.followers !== null && item.followers > 200) ||
                (item.fans_count !== undefined && item.fans_count !== null && item.fans_count > 200);
              
              return (
                <li
                  key={`${item.id}-${index}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px'
                  }}
                >
                  <span>
                    Brand: {item.name} | Platform: {item.platform} | Link: {item.url ? item.url : 'N/A'} | Followers:{' '}
                    {item.followers === null ? 'null' : (item.fans_count || item.followers)}
                  </span>
                  {hasValidFollowers ? (
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
              );
            })}
          </ul>
          <button onClick={handleIgnoreAll} className="search-btn">
            Ignore Invalid Data & Next
          </button>
        </div>
      )}

      {/* 显示生成的邮件 */}
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
