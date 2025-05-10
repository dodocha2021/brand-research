/* -------------------------------------------------------------
 * 前端轮询接口：查询搜索状态，若已完成返回所有抓取结果
 * ------------------------------------------------------------ */
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const searchId = req.nextUrl.searchParams.get('searchId')
  if (!searchId) {
    return NextResponse.json({ error: 'Missing searchId' }, { status: 400 })
  }

  /* 1. 查询 search 状态 ---------------------------------------------------- */
  const { data: search, error } = await supabase
    .from('searches')
    .select('status')
    .eq('id', searchId)
    .single()

  if (error || !search) {
    return NextResponse.json({ error: error?.message || 'search not found' }, { status: 404 })
  }

  if (search.status !== 'completed') {
    return NextResponse.json({ ready: false, status: search.status })
  }

  /* 2. 拉 simple_search_history ------------------------------------------- */
  const { data: items, error: itemsErr } = await supabase
    .from('simple_search_history')
    .select('*')
    .eq('search_id', searchId)

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  /* 3. 处理结果，只返回关键信息 ------------------------------------------- */
  const processedItems = items.map(item => {
    // 提取平台名称和原始数据
    const { platform, data: rawData, name } = item;
    let followers = null;
    let url = null;
    let success = true;
    let error = null;
    
    try {
      // 根据不同平台提取 follower 信息
      switch (platform) {
        case 'instagram':
          // Instagram格式: info?.followersCount
          if (Array.isArray(rawData) && rawData.length > 0) {
            followers = rawData[0].followersCount || null;
            url = rawData[0].profileUrl || rawData[0].url || null;
          }
          break;
          
        case 'linkedin':
          // LinkedIn格式: info?.stats?.follower_count
          if (Array.isArray(rawData) && rawData.length > 0) {
            followers = rawData[0].stats?.follower_count || null;
            url = rawData[0].companyUrl || rawData[0].url || null;
          }
          break;
          
        case 'twitter':
          // Twitter格式: info?.author?.followers
          if (Array.isArray(rawData) && rawData.length > 0) {
            followers = rawData[0].author?.followers || null;
            url = rawData[0].url || null;
          }
          break;
          
        case 'tiktok':
          // TikTok格式: info?.authorMeta?.fans
          if (Array.isArray(rawData) && rawData.length > 0) {
            followers = rawData[0].authorMeta?.fans || null;
            url = rawData[0].url || rawData[0].profileUrl || null;
          }
          break;
          
        case 'youtube':
          // YouTube格式: info?.aboutChannelInfo?.numberOfSubscribers
          if (Array.isArray(rawData) && rawData.length > 0) {
            followers = rawData[0].aboutChannelInfo?.numberOfSubscribers || null;
            url = rawData[0].url || rawData[0].channelUrl || null;
          }
          break;
          
        default:
          followers = null;
      }
      
      if (followers === null || followers === undefined) {
        success = false;
        error = "无法提取 followers 数据";
        console.log(`无法从 ${platform} 数据中提取 followers，原始数据:`, 
          Array.isArray(rawData) && rawData.length > 0 ? 
          JSON.stringify(rawData[0]).substring(0, 200) + "..." : 
          "无数据");
      }
      
    } catch (e) {
      success = false;
      error = "数据解析错误";
      console.error(`处理 ${platform} 数据时出错:`, e);
    }
    
    // 返回简化后的对象
    return {
      name: item.name || name, // 使用可能存在的名称或从原始数据中提取
      platform,
      url,
      followers,
      success,
      error
    };
  });

  return NextResponse.json({ 
    ready: true, 
    items: processedItems,
    // 可选：包含原始数据用于调试
    raw_items: req.nextUrl.searchParams.get('includeRaw') === 'true' ? items : undefined
  });
}