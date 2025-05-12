import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.APIFY_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API Key not configured' }, { status: 500 })
  }

  const input = await req.json()
  
  // 简化的输入参数，只提取关键必要信息
  const optimizedInput = {
    maxResultStreams: 0,      // 不需要直播
    maxResults: 1,            // 只需要1个视频结果
    maxResultsShorts: 1,      // 不需要短视频
    includeAboutInfo: true,   // 确保包含关于页面信息(包含订阅者数)
    shouldDownloadVideos: false, // 不下载视频
    shouldDownloadSubtitles: false, // 不下载字幕
    shouldDownloadSlideshowImages: false, // 不下载幻灯片图片
    shouldDownloadCovers: false, // 不下载封面
    sortVideosBy: "POPULAR",   // 按热门排序
    startUrls: input.startUrls || []
  };
  
  console.log('Optimized YouTube request:', JSON.stringify(optimizedInput));
  
  try {
    // 设置更长的超时时间，避免长时间等待
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 59000); // 59秒超时
    
    const res = await fetch(
      `https://api.apify.com/v2/actor-tasks/ai.labs~youtube-channel-scraper-brand/run-sync-get-dataset-items?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(optimizedInput),
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
    const raw = await res.text()
    try {
      const data = JSON.parse(raw)
      
      // 提取关键信息，减少返回数据量
      if (Array.isArray(data) && data.length > 0) {
        const channelInfo = {
          aboutChannelInfo: data[0].aboutChannelInfo,
          channelName: data[0].channelName,
          channelUrl: data[0].channelUrl,
          numberOfSubscribers: data[0].aboutChannelInfo?.numberOfSubscribers || null
        };
        
        console.log(`YouTube API response for ${input.startUrls[0].url}:`, 
          JSON.stringify({
            status: res.status,
            success: res.ok,
            hasSubscribers: !!data[0].aboutChannelInfo?.numberOfSubscribers,
            subscribersCount: data[0].aboutChannelInfo?.numberOfSubscribers || 'null'
          })
        );
        
        return NextResponse.json(channelInfo, { status: res.status })
      }
      
      return NextResponse.json(data, { status: res.status })
    } catch (e) {
      return NextResponse.json({ error: 'Response is not JSON', raw, status: res.status }, { status: 500 })
    }
  } catch (e: any) {
    // 特别处理超时错误
    if (e.name === 'AbortError') {
      return NextResponse.json({ 
        error: 'Request timeout',
        aboutChannelInfo: {
          numberOfSubscribers: null
        }
      }, { status: 408 })
    }
    
    return NextResponse.json({ 
      error: e.message,
      aboutChannelInfo: {
        numberOfSubscribers: null
      }
    }, { status: 500 })
  }
}
