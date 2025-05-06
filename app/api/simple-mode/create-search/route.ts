import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { brandName } = await req.json()
    if (!brandName) {
      return NextResponse.json({ error: 'Missing brandName' }, { status: 400 })
    }
    // 默认 region，可根据实际需求调整
    const region = 'Global'

    // 插入一条新的搜索记录，初始状态为 pending
    const { data, error } = await supabase
      .from('searches')
      .insert([{ original_brand: brandName, region, status: 'pending' }])
      .select('id')
      .single()

    if (error) {
      console.error('create-search error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 向前端返回 searchId
    return NextResponse.json({ searchId: data.id })
  } catch (e: any) {
    console.error('create-search exception:', e)
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 })
  }
}