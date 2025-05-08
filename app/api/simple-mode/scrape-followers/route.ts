import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

type Entry = {
  name: string
  url: string
  platform: string
}

interface RetryOptions {
  maxRetries: number
  initialDelay: number
  maxDelay: number
  backoff: number
  timeout?: number
}

interface RetryResult<T> {
  success: boolean
  data?: T
  error?: any
  attempts: number
}

// 优化后的重试配置
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,          // 设置最大重试次数为 3
  initialDelay: 2000,     // 初始延迟时间（毫秒）
  maxDelay: 20000,        // 最大延迟时间（毫秒）
  backoff: 2,             // 指数退避因子
  timeout: 180000         // 设置超时时间为 3 分钟（180000 毫秒）
}

// 重试函数
async function retryWithTimeout<T>(
  fn: () => Promise<T>,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS
): Promise<RetryResult<T>> {
  let attempts = 0
  let delay = options.initialDelay

  while (attempts < options.maxRetries) {
    attempts++
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Request timeout after ${options.timeout}ms`)), options.timeout)
      })
      
      const result = await Promise.race([
        fn(),
        timeoutPromise
      ])

      return {
        success: true,
        data: result as T,
        attempts
      }
    } catch (error) {
      console.error(`Attempt ${attempts} failed:`, error)
      
      // 指数退避策略
      delay = Math.min(delay * options.backoff, options.maxDelay)
      console.log(`Retrying in ${delay}ms... (Attempt ${attempts + 1} of ${options.maxRetries})`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return {
    success: false,
    error: new Error(`Max retries (${options.maxRetries}) reached`),
    attempts
  }
}

// 调用 Apify Wrapper 路由，获取原始数据
async function fetchFollowersFromApify(
  platform: string,
  url: string,
  baseUrl: string,
  retryOptions?: RetryOptions
): Promise<any> {
  const result = await retryWithTimeout(async () => {
    const endpoint = `${baseUrl}/api/apify/${platform}`
    let body: any = {}
    
    switch (platform) {
      case 'instagram':
        body = { usernames: [url] }
        break
      case 'linkedin':
        body = { identifier: url }
        break
      case 'tiktok':
        body = {
          excludePinnedPosts: false,
          profiles: [url],
          resultsPerPage: 1,
          shouldDownloadAvatars: false,
          shouldDownloadCovers: false,
          shouldDownloadSlideshowImages: false,
          shouldDownloadSubtitles: false,
          shouldDownloadVideos: false,
          profileScrapeSections: ['videos'],
          profileSorting: 'latest'
        }
        break
      case 'twitter':
        body = {
          maxItems: 1,
          sort: 'Latest',
          startUrls: [url]
        }
        break
      case 'youtube':
        body = {
          maxResultStreams: 0,
          maxResults: 1,
          maxResultsShorts: 0,
          sortVideosBy: 'POPULAR',
          startUrls: [{ url, method: 'GET' }]
        }
        break
      default:
        throw new Error(`Unsupported platform: ${platform}`)
    }

    console.log(`Fetching ${platform} data for URL: ${url}`)
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`Apify fetch failed: ${res.status} for ${platform}. Response: ${errorText}`)
    }

    return res.json()
  }, retryOptions)

  if (!result.success) {
    console.error(`Failed to fetch ${platform} data after ${result.attempts} attempts:`, result.error)
    throw result.error
  }

  return result.data
}

// 从 Apify 返回的数据中提取关注者数量
function extractFollowersCount(platform: string, data: any): number | null {
  try {
    const info = Array.isArray(data) ? data[0] : data
    let followers: number | null = null

    switch (platform) {
      case 'instagram':
        followers = info?.followersCount ?? null
        break
      case 'linkedin':
        followers = info?.stats?.follower_count ?? null
        break
      case 'tiktok':
        followers = info?.authorMeta?.fans ?? null
        break
      case 'twitter':
        followers = info?.author?.followers ?? null
        break
      case 'youtube':
        followers = info?.aboutChannelInfo?.numberOfSubscribers ?? null
        break
      default:
        console.warn(`Unknown platform: ${platform}`)
        return null
    }

    // 验证关注者数量是否为有效数字
    if (followers !== null && !isNaN(followers)) {
      return followers
    }
    console.warn(`Invalid followers count for ${platform}: ${followers}`)
    return null
  } catch (error) {
    console.error(`Error extracting followers count for ${platform}:`, error)
    return null
  }
}

export async function POST(req: NextRequest) {
  let searchId: string | undefined
  try {
    const { items, searchId: id } = (await req.json()) as {
      items?: Entry[]
      searchId?: string
    }
    
    if (!Array.isArray(items) || !id) {
      return NextResponse.json(
        { error: 'Missing items array or searchId' },
        { status: 400 }
      )
    }
    searchId = id

    // 1. 更新 searches.status 为 'scraping'
    const { error: updErr } = await supabase
      .from('searches')
      .update({ status: 'scraping' })
      .eq('id', searchId)
    if (updErr) {
      console.error('Failed to update status to scraping:', updErr)
    }

    // 2. 构造 baseUrl
    const proto = req.headers.get('x-forwarded-proto') || 'http'
    const host = req.headers.get('host')
    const baseUrl = `${proto}://${host}`

    // 3. 并行调用 Apify 提取 followers，但限制并发数
    const batchSize = 5 // 每批处理的请求数
    const results = []
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      const batchResults = await Promise.all(
        batch.map(async item => {
          try {
            const data = await fetchFollowersFromApify(
              item.platform,
              item.url,
              baseUrl,
              {
                maxRetries: 3, // 设置最大重试次数为 3
                initialDelay: 2000,
                maxDelay: 20000,
                backoff: 2,
                timeout: 180000 // 设置超时时间为 3 分钟
              }
            )
            const followers = extractFollowersCount(item.platform, data)
            return { 
              ...item, 
              followers,
              success: true 
            }
          } catch (e) {
            console.error(`Failed to fetch ${item.platform} data for ${item.url}:`, e)
            return { 
              ...item, 
              followers: null,
              success: false,
              error: e instanceof Error ? e.message : 'Unknown error'
            }
          }
        })
      )
      results.push(...batchResults)
    }

    // 统计成功和失败的请求
    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)

    if (failed.length > 0) {
      console.warn(`Failed to fetch data for ${failed.length} items:`, 
        failed.map(f => `${f.platform}:${f.url} - ${'error' in f ? f.error : 'No error message'}`))
    }

    // 4. 处理成功的结果并插入数据库
    if (successful.length > 0) {
      const rows = successful.map(r => ({
        search_id: searchId,
        competitor_name: r.name,
        platform: r.platform,
        url: r.url,
        fans_count: r.followers
      }))

      const { error: insertErr } = await supabase
        .from('simple_search_history')
        .insert(rows)
      
      if (insertErr) {
        console.error('Supabase insert error:', insertErr)
      }
    }

    // 5. 如果所有请求都失败，更新状态为 failed
    if (successful.length === 0) {
      await supabase
        .from('searches')
        .update({ status: 'failed' })
        .eq('id', searchId)
    }

    return NextResponse.json({ 
      results,
      summary: {
        total: results.length,
        successful: successful.length,
        failed: failed.length
      }
    })

  } catch (e: any) {
    console.error('scrape-followers POST error:', e)
    
    // 出错时将 searches.status 更新为 'failed'
    if (searchId) {
      try {
        await supabase
          .from('searches')
          .update({ status: 'failed' })
          .eq('id', searchId)
      } catch (_) {
        // ignore
      }
    }
    
    return NextResponse.json(
      { 
        error: e.message || 'Internal error',
        details: e instanceof Error ? e.stack : undefined
      },
      { status: 500 }
    )
  }
}