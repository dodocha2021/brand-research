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
  const [incompleteItems, setIncompleteItems] = useState<Item[]>([])
  const [retryingIndices, setRetryingIndices] = useState<number[]>([])

  // scraping 轮询相关
  const [scrapingPolling, setScrapingPolling] = useState<boolean>(false)
  const [scrapingStatus, setScrapingStatus] = useState<string>('scraping')

  // 添加更详细的状态跟踪
  const [detailedStatus, setDetailedStatus] = useState<string>('')
  const [progressLogs, setProgressLogs] = useState<string[]>([])

  const timerRef = useRef<number | null>(null)
  const debugContainerRef = useRef<HTMLDivElement>(null)

  const addProgressLog = useCallback((log: string) => {
    console.log(`[进度日志] ${log}`)
    setProgressLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${log}`])
    setDetailedStatus(log)
  }, [])

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

  // 使用新的check-scraping-status接口来轮询状态
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (scrapingPolling && searchId) {
      // 定期检查scraping状态
      addProgressLog('开始轮询检查爬取状态...')
      
      timeoutId = setTimeout(async () => {
        try {
          addProgressLog('向API发送状态检查请求...')
          
          // 调用新的接口检查状态
          const res = await fetch('/api/simple-mode/check-scraping-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ searchId })
          });
          
          if (!res.ok) {
            throw new Error('检查爬取状态失败');
          }
          
          const statusData = await res.json();
          addProgressLog(`收到状态响应: ${statusData.status}, 完成: ${statusData.isCompleted}`)
          
          // 显示详细诊断信息
          if (statusData.diagnosis) {
            addProgressLog(`诊断: ${statusData.diagnosis}`)
          }
          
          // 详细的数据统计
          if (statusData.stats) {
            const stats = statusData.stats;
            addProgressLog(`数据统计: 总计=${stats.total}, 有数据=${stats.withData}, 有效数据=${stats.withValidData}${
              stats.lastUpdateTimeDiff !== null ? `, 最后更新: ${stats.lastUpdateTimeDiff}秒前` : ''
            }`)
          }
          
          // 根据返回状态进行处理
          if (statusData.isCompleted) {
            addProgressLog(`爬取完成，状态: ${statusData.status}`)
            setScrapingPolling(false);
            setScrapingStatus(statusData.status);
            
            // 根据状态决定下一步操作
            if (statusData.status === 'user_action_needed') {
              // 需要用户处理，获取有问题的数据项
              addProgressLog('需要用户处理无效数据，正在获取问题项...')
              await fetchAndShowIncompleteItems();
            } else if (statusData.status === 'ready_for_generating') {
              // 可以直接生成邮件
              addProgressLog('所有数据有效，开始生成邮件...')
              handleGenerateEmailAfterScraping();
            }
          } else {
            // 继续轮询 - 修复逻辑，使用更精确的计时
            const waitingMsg = `仍在爬取中，等待10秒后继续检查...`
            addProgressLog(waitingMsg);
            
            // 关键修复：先将polling设为false，然后用timeout后再设为true，确保useEffect被重新触发
            setScrapingPolling(false);
            setTimeout(() => {
              addProgressLog('重新开始轮询检查...');
              setScrapingPolling(true);
            }, 10000);
          }
          
          setDebugResponses((prev) => [
            ...prev,
            { step: 'check-scraping-status', data: statusData },
          ]);
        } catch (e: any) {
          console.error('检查爬取状态错误:', e);
          addProgressLog(`检查状态出错: ${e.message}，10秒后重试`)
          // 出错时也应该重新开始轮询
          setScrapingPolling(false);
          setTimeout(() => {
            addProgressLog('重新开始轮询检查...');
            setScrapingPolling(true);
          }, 10000);
        }
      }, 100); // 快速开始第一次检查
    }
    
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [scrapingPolling, searchId, addProgressLog]);
  
  // 获取并显示不完整的项目
  const fetchAndShowIncompleteItems = async () => {
    try {
      addProgressLog('正在获取竞争对手数据...')
      
      // 获取当前数据
      const res = await fetch('/api/simple-mode/get-competitor-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchId })
      });
      
      if (!res.ok) {
        throw new Error('获取数据失败');
      }
      
      const data = await res.json();
      addProgressLog(`成功获取${data.items.length}条竞争对手数据`)
      
      // 找出无效数据项
      const incomplete = data.items.filter((item: Item) => {
        if (item.platform === 'youtube') {
          // 检查是否为无效数据
          const followers = item.fans_count || item.followers;
          return !item.url || followers === undefined || followers === null || followers <= 200;
        } else {
          const followers = item.followers;
          return !item.url || followers === undefined || followers === null || followers <= 200;
        }
      });
      
      addProgressLog(`找到${incomplete.length}条无效数据需要处理`)
      
      // 如果有无效项，显示界面让用户处理
      if (incomplete.length > 0) {
        setIncompleteItems(incomplete);
      } else {
        // 如果实际上没有无效项，可以继续生成邮件
        addProgressLog('实际上没有无效数据，继续生成邮件...')
        handleGenerateEmailAfterScraping();
      }
    } catch (e: any) {
      console.error('获取不完整项目失败:', e);
      addProgressLog(`获取无效数据出错: ${e.message}`)
      setErrorInfo(e.message);
      setStep('error');
    }
  };

  // 单个重试
  const handleRetry = async (item: Item, index: number) => {
    setRetryingIndices((prev) => [...prev, index])
    try {
      toast.success(`已提交请求，正在处理...`);
      
      // 根据平台类型选择不同的API端点和请求参数
      let apiEndpoint = '';
      let requestBody = {};
      
      if (item.platform === 'youtube') {
        apiEndpoint = '/api/apify/youtube';
        requestBody = { 
          maxResultStreams: 0,
          maxResults: 1,
          maxResultsShorts: 0,
          sortVideosBy: "POPULAR",
          startUrls: [{ url: item.url, method: "GET" }]
        };
      } else if (item.platform === 'tiktok') {
        apiEndpoint = '/api/apify/tiktok';
        requestBody = {
          excludePinnedPosts: false,
          profiles: [item.url],
          resultsPerPage: 1,
          shouldDownloadAvatars: false,
          shouldDownloadCovers: true,
          shouldDownloadSlideshowImages: false,
          shouldDownloadSubtitles: false,
          shouldDownloadVideos: false,
          profileScrapeSections: ["videos"],
          profileSorting: "latest"
        };
      } else if (item.platform === 'instagram') {
        apiEndpoint = '/api/apify/instagram';
        requestBody = {
          usernames: [item.url]
        };
      } else if (item.platform === 'linkedin') {
        apiEndpoint = '/api/apify/linkedin';
        requestBody = {
          identifier: [item.url]
        };
      } else if (item.platform === 'twitter') {
        apiEndpoint = '/api/apify/twitter';
        requestBody = {
          maxItems: 1,
          sort: "Latest",
          startUrls: [item.url]
        };
      } else {
        throw new Error(`平台 ${item.platform} 暂不支持重试操作`);
      }
      
      // 发送请求
      const retryRes = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      
      if (!retryRes.ok) {
        const errorText = await retryRes.text();
        throw new Error(`请求失败: ${errorText}`);
      }
      
      const resultData = await retryRes.json();
      setDebugResponses((prev) => [
        ...prev,
        { step: `${item.platform}-retry-request`, data: resultData },
      ]);
      
      // 统一处理返回结果
      try {
        // 从返回结果提取粉丝数据
        let fans_count = null;
        
        if (item.platform === 'youtube') {
          // 处理YouTube数据
          if (Array.isArray(resultData) && resultData.length > 0) {
            const firstItem = resultData[0];
            
            // 尝试不同路径获取订阅者数量
            if (firstItem.aboutChannelInfo?.numberOfSubscribers !== undefined) {
              const subCount = firstItem.aboutChannelInfo.numberOfSubscribers;
              if (typeof subCount === 'string') {
                fans_count = parseInt(subCount.replace(/,/g, ''));
              } else {
                fans_count = subCount;
              }
            } else if (firstItem.subscriberCount !== undefined) {
              fans_count = firstItem.subscriberCount;
            } else if (firstItem.channel?.subscriberCount !== undefined) {
              fans_count = firstItem.channel.subscriberCount;
            } else if (firstItem.numberOfSubscribers !== undefined) {
              fans_count = firstItem.numberOfSubscribers;
            }
          }
        } else if (item.platform === 'tiktok') {
          // 处理TikTok数据
          if (Array.isArray(resultData) && resultData.length > 0) {
            const firstItem = resultData[0];
            if (firstItem.authorMeta && firstItem.authorMeta.fans !== undefined) {
              fans_count = firstItem.authorMeta.fans;
            }
          }
        } else if (item.platform === 'instagram') {
          // 处理Instagram数据
          if (Array.isArray(resultData) && resultData.length > 0) {
            const firstItem = resultData[0];
            if (firstItem.followersCount !== undefined) {
              fans_count = firstItem.followersCount;
            }
          }
        } else if (item.platform === 'linkedin') {
          // 处理LinkedIn数据
          if (Array.isArray(resultData) && resultData.length > 0) {
            const firstItem = resultData[0];
            if (firstItem.stats && firstItem.stats.follower_count !== undefined) {
              fans_count = firstItem.stats.follower_count;
            }
          }
        } else if (item.platform === 'twitter') {
          // 处理Twitter数据
          if (Array.isArray(resultData) && resultData.length > 0) {
            const firstItem = resultData[0];
            if (firstItem.author && firstItem.author.followers !== undefined) {
              fans_count = firstItem.author.followers;
            }
          }
        }
        
        if (fans_count !== null) {
          // 更新数据库
          const updateRes = await fetch('/api/simple-mode/update-competitor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              search_id: searchId,
              competitor_name: item.name,
              platform: item.platform,
              url: item.url,
              fans_count: fans_count,
              dataset: JSON.stringify(resultData)
            }),
          });
          
          if (!updateRes.ok) {
            throw new Error('更新数据库失败');
          }
          
          // 更新前端状态
          const isSuccess = fans_count > 200;
          updateItemInState(item.id, fans_count, isSuccess);
          
          if (isSuccess) {
            toast.success(`成功获取 ${item.name} 的关注者数: ${fans_count}`);
          } else {
            toast.error(`${item.name} 的关注者数 ${fans_count} 低于要求的阈值`);
          }
        } else {
          toast.error(`未能从结果中提取粉丝数量`);
        }
      } catch (err) {
        console.error(`处理${item.platform}数据失败:`, err);
        toast.error('处理数据失败: ' + (err instanceof Error ? err.message : String(err)));
      }
      
      // 移除重试状态
      setRetryingIndices((prev) => prev.filter((i) => i !== index));
      
    } catch (e: any) {
      toast.error('重试请求失败: ' + e.message);
      // 如果请求失败，恢复按钮状态
      setRetryingIndices((prev) => prev.filter((i) => i !== index));
    }
  }
  
  // 辅助函数：更新状态中的项目数据
  const updateItemInState = (itemId: string, fans_count: number, isSuccess: boolean) => {
    // 更新本地状态
    setItems(prevItems => prevItems.map(prevItem => 
      prevItem.id === itemId 
        ? { ...prevItem, followers: fans_count, fans_count: fans_count, success: isSuccess } 
        : prevItem
    ));
    
    // 更新incompleteItems状态 - 创建全新数组以确保重新渲染
    setIncompleteItems(prev => {
      const newArray = [...prev]; // 创建新数组
      const itemIndex = newArray.findIndex(it => it.id === itemId);
      if (itemIndex >= 0) {
        // 替换为新对象
        newArray[itemIndex] = { 
          ...newArray[itemIndex], 
          followers: fans_count, 
          fans_count: fans_count, 
          success: isSuccess
        };
      }
      return newArray; // 返回新数组以触发重新渲染
    });
    
    // 强制整个界面重新渲染
    forceUpdate();
  }

  // 修改handleIgnoreAll函数
  const handleIgnoreAll = async () => {
    try {
      addProgressLog('忽略所有无效数据，继续处理...')
      // 只保留有效项
      const validItems = items.filter(
        (item: Item) => item.followers !== undefined && item.followers !== null && item.followers >= 200
      );
      setItems(validItems);
      setIncompleteItems([]); // 清空不完整项列表
      handleGenerateEmailAfterScraping();
    } catch (e: any) {
      addProgressLog(`忽略操作失败: ${e.message}`)
      toast.error('Ignore failed: ' + e.message);
    }
  };

  // scraping 完成后生成邮件
  const handleGenerateEmailAfterScraping = async () => {
    try {
      addProgressLog('开始生成邮件...')
      setStep('generating')
      
      addProgressLog(`调用generate-email API，searchId=${searchId}`)
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
      
      if (!emailRes.ok) {
        const errorText = await emailRes.text()
        throw new Error(`生成邮件API错误 (${emailRes.status}): ${errorText}`)
      }
      
      addProgressLog('收到邮件生成响应，处理内容...')
      const emailJson = (await emailRes.json()) as { content: string }
      
      setDebugResponses((prev) => [
        ...prev,
        { step: 'generate-email', data: emailJson },
      ])
      
      if (!emailJson.content) {
        throw new Error('生成的邮件内容为空')
      }
      
      addProgressLog(`邮件生成成功，内容长度: ${emailJson.content.length}字符`)
      setEmailContent(emailJson.content)
      setStep('done')
      addProgressLog('流程全部完成')
      toast.success('Email generated successfully!')
    } catch (err: any) {
      addProgressLog(`生成邮件失败: ${err.message}`)
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
              {detailedStatus && <span style={{ fontWeight: 'normal', marginLeft: 8, color: '#666' }}>
                ({detailedStatus})
              </span>}
            </p>
          </div>

          {/* 添加详细状态日志显示 */}
          {(step === 'scraping' || step === 'generating') && progressLogs.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <details open>
                <summary 
                  style={{ 
                    cursor: 'pointer',
                    fontWeight: 600,
                    marginBottom: 8,
                    color: '#3b82f6'
                  }}
                >
                  进度详情日志 ({progressLogs.length})
                </summary>
                <div 
                  style={{ 
                    background: '#f3f4f6',
                    padding: 12,
                    borderRadius: 4,
                    maxHeight: 200,
                    overflowY: 'auto',
                    fontSize: 13,
                    fontFamily: 'monospace'
                  }}
                >
                  {progressLogs.map((log, index) => (
                    <div key={index} style={{ marginBottom: 4 }}>
                      {log}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

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
      {incompleteItems.length > 0 && (
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
