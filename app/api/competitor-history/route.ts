// app/api/competitor-history/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  // 批量插入
  const { originalBrand, region, competitors }: { originalBrand: string, region: string, competitors: string[] } = await req.json()
  const rows = competitors.map((name: string) => ({
    original_brand: originalBrand,
    region,
    competitor_name: name
  }))
  const { data, error } = await supabase
    .from('competitor_search_history')
    .insert(rows)
    .select()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest) {
  // 更新某条历史的 platform、competitor_url、followers、total_views
  const { id, platform, competitor_url, followers, total_views } = await req.json()
  const { data, error } = await supabase
    .from('competitor_search_history')
    .update({ platform, competitor_url, followers, total_views })
    .eq('id', id)
    .select()
    .single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
}