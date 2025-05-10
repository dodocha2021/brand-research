import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  /* 1. 解析 payload -------------------------------------------------------- */
  const { items, searchId } = (await req.json()) as {
    items?: { url: string; platform: string; name: string }[]
    searchId?: string
  }
  if (!Array.isArray(items) || !searchId) {
    return NextResponse.json({ error: 'Missing items or searchId' }, { status: 400 })
  }

  /* 2. 标记 search 状态 ---------------------------------------------------- */
  await supabase.from('searches').update({ status: 'scraping' }).eq('id', searchId)

  /* 3. 启动所有 Task ------------------------------------------------------- */
  // 使用 Promise.allSettled 替代 Promise.all，确保即使部分任务失败，其他任务仍能继续
  const runPromises = items.map(async (item) => {
    if (!item.url || item.url.trim() === '') {
      console.log(`Skipping empty URL: ${item.name} - ${item.platform}`);
      return { 
        platform: item.platform, 
        name: item.name, 
        status: 'skipped', 
        success: false,
        message: 'Empty URL, skipped',
        followers: null
      };
    }
    
    const origin = req.nextUrl.origin
    const apiEndpoint = new URL(`/api/apify/${item.platform}`, origin).href
    
    // 针对不同平台定制payload
    let payload: any;
    switch (item.platform) {
      case 'instagram':
        payload = { usernames: [item.url] };
        break;
      case 'linkedin':
        payload = { identifier: [item.url] };
        break;
      case 'tiktok':
        payload = {
          excludePinnedPosts: false,
          profiles: [item.url],
          resultsPerPage: 1,
          shouldDownloadAvatars: false,
          shouldDownloadCovers: true,
          shouldDownloadSlideshowImages: false,
          shouldDownloadSubtitles: false,
          shouldDownloadVideos: false,
          profileScrapeSections: ['videos'],
          profileSorting: 'latest'
        };
        break;
      case 'twitter':
        payload = {
          maxItems: 1,
          sort: 'Latest',
          startUrls: [item.url]
        };
        break;
      case 'youtube':
        payload = {
          maxResultStreams: 1,
          maxResults: 1,
          maxResultsShorts: 1,
          sortVideosBy: 'POPULAR',
          startUrls: [{ url: item.url, method: 'GET' }]
        };
        break;
      default:
        payload = { url: item.url };
    }
    
    try {
      console.log(`Starting ${item.platform} task, URL: ${item.url}`);
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90000) // 90 seconds timeout
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to start ${item.platform} task, status code: ${response.status}, error:`, errorText);
        return { 
          platform: item.platform, 
          name: item.name, 
          status: 'failed', 
          success: false,
          message: `API call failed (${response.status}): ${errorText}`,
          followers: null
        };
      }
      
      const result = await response.json();
      // Extract followers field
      const info = Array.isArray(result) ? result[0] : result;
      let followers = null;
      switch (item.platform) {
        case 'instagram':
          followers = info?.followersCount ?? null;
          break;
        case 'linkedin':
          followers = info?.stats?.follower_count ?? null;
          break;
        case 'tiktok':
          followers = info?.authorMeta?.fans ?? null;
          break;
        case 'twitter':
          followers = info?.author?.followers ?? null;
          break;
        case 'youtube':
          followers = info?.aboutChannelInfo?.numberOfSubscribers ?? null;
          break;
        default:
          followers = null;
      }
      console.log(`Successfully started ${item.platform} task, followers:`, followers);
      console.log(`Scraping result: competitor_name=${item.name}, platform=${item.platform}, url=${item.url}, fans_count=${followers}`);
      return { 
        ...result, 
        platform: item.platform, 
        name: item.name,
        url: item.url,
        status: 'started',
        success: true,
        followers
      };
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      const errorCause = error.cause ? `(reason: ${error.cause.message || error.cause})` : '';
      console.error(`${item.platform} task error: ${errorMessage} ${errorCause}`, error);
      console.error(`Scraping failed: competitor_name=${item.name}, platform=${item.platform}, url=${item.url}, fans_count=null, error=${errorMessage}`);
      return { 
        platform: item.platform, 
        name: item.name, 
        url: item.url,
        status: 'error', 
        success: false,
        message: `Request error: ${errorMessage} ${errorCause}`,
        error: errorMessage,
        followers: null
      };
    }
  });

  // 使用 Promise.allSettled 替代 Promise.all，确保所有任务都会被处理
  const results = await Promise.allSettled(runPromises);
  
  // 整理结果
  const runs = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      // Promise 本身拒绝（如超时错误）
      return {
        platform: items[index].platform,
        name: items[index].name,
        url: items[index].url,
        status: 'error',
        success: false,
        message: `Task processing failed: ${result.reason?.message || 'Unknown error'}`,
        error: result.reason,
        followers: null
      };
    }
  });
  
  /* 4. 统计任务状态并返回结果 --------------------------------------------- */
  const successTasks = runs.filter(run => run.success === true).length;
  const failedTasks = runs.length - successTasks;
  
  console.log(`Task results: Total: ${runs.length}, Success: ${successTasks}, Failed: ${failedTasks}`);
  
  // 输出所有结果的汇总表格
  console.log("\nScraping Results Summary:");
  console.log("competitor_name | platform | url | fans_count | success");
  console.log("---------------|----------|-----|------------|--------");
  runs.forEach(run => {
    console.log(`${run.name} | ${run.platform} | ${run.url || 'N/A'} | ${run.followers || 'null'} | ${run.success ? '✓' : '✗'}`);
  });
  
  // 在处理完任务结果后，将数据写入数据库
  const validRowsData = runs.filter(run => run.followers !== null && run.followers > 200);

  if (validRowsData.length > 0) {
    const rows = validRowsData.map(run => ({
      search_id: searchId,
      competitor_name: run.name,
      platform: run.platform,
      url: run.url,
      fans_count: run.followers
    }));

    console.log('Ready to insert data into database:', rows);

    const { error: insertErr } = await supabase.from('simple_search_history').insert(rows);

    if (insertErr) {
      console.error('Supabase insert error:', insertErr);
    } else {
      console.log('Data successfully inserted into the database.');
    }
  } else {
    console.log('No valid data to insert into database.');
  }

  const failedRuns = runs.filter(run => !run.success);
  const incompleteItems = runs.filter(run => 
    !run.success || run.followers === null || run.followers <= 200
  );
  
  // 检查是否需要用户操作（任务失败或者followers为空或小于等于200）
  const needUserAction = incompleteItems.length > 0;

  return NextResponse.json({
    status: failedTasks === runs.length ? 'all_failed' : (successTasks === runs.length ? 'all_started' : 'partial_started'),
    taskCount: runs.length,
    successCount: successTasks,
    failedCount: failedTasks,
    results: runs,
    failedDetails: failedRuns,
    needUserAction,
    incompleteItems 
  });
}