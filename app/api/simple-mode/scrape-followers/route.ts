import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 支持两种环境变量名：APIFY_TOKEN 或 APIFY_API_KEY
const APIFY_TOKEN = process.env.APIFY_TOKEN || process.env.APIFY_API_KEY;

type Entry = {
  name: string
  url: string
  platform: string
}

// 调用 Apify Wrapper 路由，获取原始数据
async function fetchFollowersFromApify(
  platform: string,
  url: string,
  baseUrl: string
): Promise<any> {
  if (!APIFY_TOKEN) {
    throw new Error(
      'Missing Apify API key: please set APIFY_TOKEN or APIFY_API_KEY in your environment'
    );
  }
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
        shouldDownloadCovers: true,
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
      throw new Error('Unsupported platform')
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${APIFY_TOKEN}`,
    },
    body: JSON.stringify(body),
  })
  if (res.status === 402) {
    throw new Error('Apify payment required (HTTP 402): check your APIFY_TOKEN and account credits');
  }
  if (!res.ok) {
    throw new Error(`Apify fetch failed: ${res.status}`);
  }
  return res.json();
}

// 超时处理函数
const fetchWithTimeout = (fn: () => Promise<any>, timeout: number) => {
  return Promise.race([
    fn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), timeout)
    )
  ])
}

export async function POST(req: NextRequest) {
  let searchId: string | undefined
  try {
    // 从请求体中解析出 ignoreIncomplete 标志，以便用户决定如何处理部分无效数据
    const payload = (await req.json()) as {
      items?: Entry[]
      searchId?: string
      ignoreIncomplete?: boolean
    }
    const { items, searchId: id, ignoreIncomplete } = payload
    if (!Array.isArray(items) || !id) {
      return NextResponse.json(
        { error: 'Missing items array or searchId' },
        { status: 400 }
      )
    }
    searchId = id

    // 更新 searches.status 为 'scraping'
    const { error: updErr } = await supabase
      .from('searches')
      .update({ status: 'scraping' })
      .eq('id', searchId)
    if (updErr) {
      console.error('Failed to update status to scraping:', updErr)
    }

    // 构造 baseUrl，用于调用内部 Apify 路由
    const proto = req.headers.get('x-forwarded-proto') || 'http'
    const host = req.headers.get('host')
    const baseUrl = `${proto}://${host}`

    // 并行调用 Apify 提取 followers
    const results = await Promise.all(
      items.map(async item => {
        try {
          const data = await fetchWithTimeout(
            () => fetchFollowersFromApify(item.platform, item.url, baseUrl),
            60000
          )
          const followers = extractFollowersCount(item.platform, data)
          return { ...item, followers, success: true }
        } catch (e: any) {
          console.error('Apify error:', e)
          return { ...item, followers: null, success: false, error: e.message }
        }
      })
    )

    // 修改逻辑：无论结果如何，都先过滤出符合要求的记录（followers 非 null 且 > 200）并自动上传到数据库
    const validRowsData = results.filter(r => r.followers !== null && r.followers > 200)
    if (validRowsData.length > 0) {
      const rows = validRowsData.map(r => ({
        search_id: searchId,
        competitor_name: r.name,
        platform: r.platform,
        url: r.url,
        fans_count: r.followers
      }))
      // 直接插入新数据，不做合并更新，重复数据会插入多条记录
      const { error: insertErr } = await supabase
        .from('simple_search_history')
        .insert(rows)
      if (insertErr) {
        console.error('Supabase insert error:', insertErr)
      }
    }

    // 根据结果判断返回情况
    if (results.every(r => r.followers !== null && r.followers > 200)) {
      // 情况1：所有记录均有效，全部数据已上传
      return NextResponse.json({ results, inserted: true })
    } else {
      if (ignoreIncomplete) {
        // 情况2：用户选择忽略无效数据时，前端只保留有效数据
        return NextResponse.json({
          results,
          inserted: true,
          ignoredCount: results.length - validRowsData.length
        })
      } else {
        // 情况3：存在无效记录，需要用户对单条记录进行 retry 或选择忽略
        return NextResponse.json(
          {
            results,
            message:
              '部分数据无效，但符合要求的记录已自动上传到数据库。请对无效链接进行单独 Retry 或选择忽略这些无效数据。',
            needUserAction: true
          },
          { status: 206 }
        )
      }
    }
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
      { error: e.message || 'Internal error' },
      { status: 500 }
    )
  }
}

// 从 Apify 返回的数据中提取关注者数量
function extractFollowersCount(platform: string, data: any): number | null {
  const info = Array.isArray(data) ? data[0] : data
  switch (platform) {
    case 'instagram':
      return info?.followersCount ?? null
    case 'linkedin':
      return info?.stats?.follower_count ?? null
    case 'tiktok':
      return info?.authorMeta?.fans ?? null
    case 'twitter':
      return info?.author?.followers ?? null
    case 'youtube':
      return info?.aboutChannelInfo?.numberOfSubscribers ?? null
    default:
      return null
  }
}

export const runtime = 'nodejs';