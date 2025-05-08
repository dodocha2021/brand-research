import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`Apify fetch failed: ${res.status}`)
  return res.json()
}

// 超时处理
const fetchWithTimeout = (fn: () => Promise<any>, timeout: number) => {
  return Promise.race([
    fn(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout))
  ]);
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

    // 2. 构造 baseUrl，用于调用内部 Apify 路由
    const proto = req.headers.get('x-forwarded-proto') || 'http'
    const host = req.headers.get('host')
    const baseUrl = `${proto}://${host}`

    // 3. 并行调用 Apify 提取 followers
    const results = await Promise.all(
      items.map(async item => {
        try {
          const data = await fetchWithTimeout(() => fetchFollowersFromApify(item.platform, item.url, baseUrl), 60000);
          const followers = extractFollowersCount(item.platform, data);
          return { ...item, followers, success: true };
        } catch (e: unknown) {
          if (e instanceof Error) {
            console.error('Apify error:', e);
            return { ...item, followers: null, success: false, error: e.message };
          } else {
            console.error('Apify error: Unknown error type');
            return { ...item, followers: null, success: false, error: 'Unknown error' };
          }
        }
      })
    );

    // 4. 过滤非空并插入 simple_search_history
    const valid = results.filter(r => r.followers != null);
    if (valid.length > 0) {
      const rows = valid.map(r => ({
        search_id: searchId,
        competitor_name: r.name,
        platform: r.platform,
        url: r.url,
        fans_count: r.followers
      }));
      const { error: insertErr } = await supabase
        .from('simple_search_history')
        .insert(rows);
      if (insertErr) {
        console.error('Supabase insert error:', insertErr);
      }
    }

    return NextResponse.json({ results });
  } catch (e: any) {
    console.error('scrape-followers POST error:', e);
    // 出错时将 searches.status 更新为 'failed'
    if (searchId) {
      try {
        await supabase
          .from('searches')
          .update({ status: 'failed' })
          .eq('id', searchId);
      } catch (_) {
        // ignore
      }
    }
    return NextResponse.json(
      { error: e.message || 'Internal error' },
      { status: 500 }
    );
  }
}

// 从 Apify 返回的数据中提取关注者数量
function extractFollowersCount(platform: string, data: any): number | null {
  const info = Array.isArray(data) ? data[0] : data;
  switch (platform) {
    case 'instagram':
      return info?.followersCount ?? null;
    case 'linkedin':
      return info?.stats?.follower_count ?? null;
    case 'tiktok':
      return info?.authorMeta?.fans ?? null;
    case 'twitter':
      return info?.author?.followers ?? null;
    case 'youtube':
      return info?.aboutChannelInfo?.numberOfSubscribers ?? null;
    default:
      return null;
  }
}