import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.APIFY_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API Key not configured' }, { status: 500 })
  }

  const input = await req.json()
  // 保证 identifier 为数组格式
  if (input.identifier && !Array.isArray(input.identifier)) {
    input.identifier = [input.identifier]
  }
  try {
    // 设置59秒超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 59000); // 59秒超时
    
    const res = await fetch(
      `https://api.apify.com/v2/actor-tasks/ai.labs~linkedin-company-detail-brand/run-sync-get-dataset-items?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal
      }
    )
    
    clearTimeout(timeoutId);
    
    const raw = await res.text()
    try {
      const data = JSON.parse(raw)
      return NextResponse.json(data, { status: res.status })
    } catch (e) {
      return NextResponse.json({ error: 'Response is not JSON', raw, status: res.status }, { status: 500 })
    }
  } catch (e: any) {
    // 特别处理超时错误
    if (e.name === 'AbortError') {
      return NextResponse.json({ 
        error: 'Request timeout',
        stats: {
          follower_count: null
        }
      }, { status: 408 })
    }
    
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}