/* -------------------------------------------------------------
 * Apify Webhook：每个 run 完成时回调 → 拉 OUTPUT → 写入 Supabase
 * ------------------------------------------------------------ */
import { NextRequest, NextResponse } from 'next/server'
import { ApifyClient } from 'apify-client'
import { supabase } from '@/lib/supabase'

const APIFY_TOKEN = process.env.APIFY_TOKEN || process.env.APIFY_API_KEY

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  /* 1. 解析 Apify payload -------------------------------------------------- */
  const {
    eventType,
    runId,
    outputKeyValueStoreId,
    searchId,
    platform,
  } = (await req.json()) as {
    eventType?: string
    runId?: string
    outputKeyValueStoreId?: string
    searchId?: string
    platform?: string
  }

  if (eventType !== 'ACTOR.RUN.SUCCEEDED' || !runId || !outputKeyValueStoreId || !searchId) {
    return NextResponse.json({ ok: false }) // 失败或非成功事件直接忽略
  }

  /* 2. 读取 OUTPUT.json ---------------------------------------------------- */
  const client = new ApifyClient({ token: APIFY_TOKEN })
  const kv = client.keyValueStore(outputKeyValueStoreId)
  const record = await kv.getRecord('OUTPUT') // 大多数 Scraper 输出到 OUTPUT.json

  if (!record?.value) {
    console.warn(`Webhook: run ${runId} missing OUTPUT`)
    return NextResponse.json({ ok: false })
  }

  /* 3. 将结果写入 simple_search_history ----------------------------------- */
  await supabase.from('simple_search_history').insert({
    search_id: searchId,
    platform,
    data: record.value,
  })

  /* 4. 判断是否全部完成 ---------------------------------------------------- */
  // 预期任务总数 = competitors(含品牌) × 5 平台
  const { data: searchRow } = await supabase
    .from('searches')
    .select('competitor_count')
    .eq('id', searchId)
    .single()

  const expected = (searchRow?.competitor_count || 5) * 5
  const { count } = await supabase
    .from('simple_search_history')
    .select('*', { count: 'exact', head: true })
    .eq('search_id', searchId)

  if (count === expected) {
    await supabase.from('searches').update({ status: 'completed' }).eq('id', searchId)
  }

  return NextResponse.json({ ok: true })
}