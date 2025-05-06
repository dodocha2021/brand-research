import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  let searchId: string | undefined
  try {
    // 1. 解析请求体，必须包含 name、platform、searchId
    const body = (await req.json()) as {
      name?: string
      platform?: string
      searchId?: string
    }
    const { name, platform } = body
    searchId = body.searchId
    if (!name || !platform || !searchId) {
      return NextResponse.json(
        { error: 'Missing name, platform or searchId' },
        { status: 400 }
      )
    }

    // 2. 更新 searches.status 为 'extracting'
    const { error: updErr } = await supabase
      .from('searches')
      .update({ status: 'extracting' })
      .eq('id', searchId)
    if (updErr) {
      console.error('Failed to update status to extracting:', updErr)
    }

    // 3. 调用统一的 google-gpt 路由获取 URL
    const origin = req.nextUrl.origin
    const res = await fetch(`${origin}/api/google-gpt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand: name,
        platform,
        region: 'Global',
        aiModel: 'gpt'
      })
    })
    if (!res.ok) {
      const text = await res.text()
      console.error('google-gpt error:', res.status, text)
      return NextResponse.json(
        { error: `google-gpt failed: ${res.status}` },
        { status: 500 }
      )
    }
    const data = await res.json()

    // 4. 返回结果
    return NextResponse.json({
      name,
      platform,
      url: data.url || ''
    })
  } catch (e: any) {
    console.error('extract-url POST error:', e)
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