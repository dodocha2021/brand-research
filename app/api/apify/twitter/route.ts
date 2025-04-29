import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const apiKey = process.env.APIFY_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API Key 未配置' }, { status: 500 })
  }

  console.log('APIFY_API_KEY:', process.env.APIFY_API_KEY)

  const input = await req.json()
  try {
    const res = await fetch(
      `https://api.apify.com/v2/actor-tasks/ai.labs~twitter-brandresearch/run-sync-get-dataset-items?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      }
    )
    const raw = await res.text()
    try {
      const data = JSON.parse(raw)
      return NextResponse.json(data, { status: res.status })
    } catch (e) {
      return NextResponse.json({ error: '响应不是JSON', raw, status: res.status }, { status: 500 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}