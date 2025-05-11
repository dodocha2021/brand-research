import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.APIFY_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API Key 未配置' }, { status: 500 })
  }

  const input = await req.json()
  const { url, name, searchId } = input
  
  // 确保使用正确的webhook回调URL，移除硬编码的ngrok URL
  const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || req.headers.get('origin') || req.headers.get('host') || ''
  const webhookUrl = webhookBaseUrl.startsWith('http') ? webhookBaseUrl : `https://${webhookBaseUrl}`
  
  console.log(`Using webhook base URL: ${webhookUrl}`);
  
  // LinkedIn需要指定格式
  const taskInput = {
    identifier: [url], // 确保是数组格式
    searchId // 保留searchId用于webhook回调
  }
  
  try {
    // 启动异步任务
    console.log(`Sending LinkedIn task to Apify with URL: ${url}, name: ${name}`);
    console.log(`Task payload:`, JSON.stringify(taskInput, null, 2));
    
    const res = await fetch(
      `https://api.apify.com/v2/actor-tasks/ai.labs~linkedin-company-detail-brand/runs?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...taskInput,
          webhooks: [
            {
              eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED'],
              requestUrl: `${webhookUrl}/api/simple-mode/apify-webhook`,
              payloadTemplate: `{
                "eventType":"{{eventType}}",
                "runId":"{{resource.id}}",
                "outputKeyValueStoreId":"{{resource.defaultKeyValueStoreId}}",
                "searchId":"${searchId}",
                "platform":"linkedin",
                "competitorName":"${name}",
                "url":"${url}"
              }`
            }
          ]
        })
      }
    )
    
    // 检查响应状态
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`LinkedIn API call failed with status ${res.status}:`, errorText);
      return NextResponse.json({ 
        error: `Apify API call failed: ${res.status}`, 
        details: errorText 
      }, { status: res.status });
    }
    
    // 返回任务ID和状态
    const data = await res.json()
    console.log(`LinkedIn webhook task response:`, JSON.stringify(data, null, 2));
    
    if (!data.id) {
      console.error("LinkedIn task started but returned no ID:", data);
    }
    
    return NextResponse.json({
      id: data.id,
      status: data.status,
      platform: 'linkedin',
      name
    })
  } catch (e: any) {
    console.error("LinkedIn任务启动失败:", e);
    return NextResponse.json({ 
      error: e.message, 
      stack: e.stack,
      cause: e.cause?.message || null
    }, { status: 500 })
  }
}