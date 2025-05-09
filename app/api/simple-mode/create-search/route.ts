import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { brandName, region } = await req.json()
    if (!brandName) {
      return NextResponse.json({ error: '缺少品牌名称' }, { status: 400 })
    }
    // 使用传入的 region 值或设定默认值
    const regionValue = region || 'default'
    
    // 检查是否已有处于 idle 状态的搜索记录
    const { data, error } = await supabase
      .from('searches')
      .select('*')
      .eq('original_brand', brandName)
      .eq('status', 'idle')
      .limit(1)
      .single()
    
    if (data) {
      // 存在则复用已存在的 searchId，确保后续 retry 均使用同一个 searchId
      return NextResponse.json({ searchId: data.id })
    }
    
    // 如果不存在则创建新的搜索记录，并插入 region 字段
    const { data: newData, error: insertError } = await supabase
      .from('searches')
      .insert({ original_brand: brandName, status: 'idle', region: regionValue })
      .select()
      .single()
      
    if (insertError) {
      throw new Error(insertError.message)
    }
    
    return NextResponse.json({ searchId: newData.id })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message || '内部错误' }, { status: 500 })
  }
}