import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.APIFY_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API Key 未配置' }, { status: 500 })
  }

  const input = await req.json()
  const { url, name, searchId } = input
  
  // 获取当前应用的域名，或者使用你的 ngrok URL
  const webhookBaseUrl = "https://6612-2604-3d08-247b-b5b0-a843-5c57-8745-454f.ngrok-free.ap"
  
  // YouTube任务输入格式
  const taskInput = {
    maxResultStreams: 0,
    maxResults: 3,
    maxResultsShorts: 0,
    sortVideosBy: "POPULAR",
    startUrls: [
      {
        url: url,
        method: "GET"
      }
    ],
    searchId // 保留searchId用于webhook回调
  }
  
  try {
    // 启动异步任务
    const res = await fetch(
      `https://api.apify.com/v2/actor-tasks/ai.labs~youtube-channel-scraper-brand/runs?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...taskInput,
          webhooks: [
            {
              eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED'],
              requestUrl: `${webhookBaseUrl}/api/apify/youtube_webhook`,
              payloadTemplate: `{
                "eventType":"{{eventType}}",
                "runId":"{{resource.id}}",
                "outputKeyValueStoreId":"{{resource.defaultKeyValueStoreId}}",
                "searchId":"${searchId}",
                "platform":"youtube"
              }`
            }
          ]
        })
      }
    )
    
    // 返回任务ID和状态
    const data = await res.json()
    return NextResponse.json({
      id: data.id,
      status: data.status,
      platform: 'youtube'
    })
  } catch (e: any) {
    console.error("YouTube任务启动失败:", e);
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}