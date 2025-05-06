import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { EMAIL_TEMPLATES } from '@/lib/prompts'

type RequestBody = {
  searchId: string
  selectedTemplate: keyof typeof EMAIL_TEMPLATES
  customTemplate?: string
  contactName?: string
}

export async function POST(req: NextRequest) {
  let searchId: string | undefined

  try {
    // 1. 解析请求体
    const {
      searchId: id,
      selectedTemplate,
      customTemplate = '',
      contactName = ''
    } = (await req.json()) as RequestBody
    searchId = id
    if (!searchId) {
      return NextResponse.json({ error: 'Missing searchId' }, { status: 400 })
    }

    // 2. 更新状态为 generating
    {
      const { error: updErr } = await supabase
        .from('searches')
        .update({ status: 'generating' })
        .eq('id', searchId)
      if (updErr) console.error('Failed to update status to generating:', updErr)
    }

    // 3. 从 searches 表读取原始品牌
    const { data: searchData, error: searchErr } = await supabase
      .from('searches')
      .select('original_brand')
      .eq('id', searchId)
      .single()
    if (searchErr || !searchData) {
      console.error('fetch searches error:', searchErr)
      throw new Error('Search record not found')
    }
    const originalBrand = searchData.original_brand

    // 4. 从 simple_search_history 表拉取抓取结果
    const { data: rows, error: fetchErr } = await supabase
      .from('simple_search_history')
      .select('competitor_name, platform, url, fans_count')
      .eq('search_id', searchId)
    if (fetchErr) {
      console.error('fetch simple_search_history error:', fetchErr)
      throw new Error('Failed to fetch data')
    }

    // 5. 构造 JSON 数据供 AI 分析
    const competitorData = (rows || []).map(r => ({
      competitor_name: r.competitor_name,
      platform: r.platform,
      url: r.url,
      followers: r.fans_count
    }))
    const jsonData = JSON.stringify(competitorData, null, 2)

    // 6. 选择模板并替换占位符，显式说明目标品牌
    const baseTemplate = customTemplate || EMAIL_TEMPLATES[selectedTemplate]
    let promptContent = `Target Brand: ${originalBrand}\nContact: ${contactName}\n\n`
    promptContent += baseTemplate
      .replace('{{targetBrandName}}', originalBrand)
      .replace('{{contactName}}', contactName)
    promptContent += `\n\nJSON Data:\n${jsonData}`

    // 7. 调用内部 Anthropic API 生成邮件
    const origin = req.nextUrl.origin
    const aiRes = await fetch(`${origin}/api/anthropic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: promptContent }] })
    })
    const aiData = await aiRes.json()
    const content = aiData.choices?.[0]?.message?.content || ''

    // 8. 更新状态为 completed
    {
      const { error: updErr2 } = await supabase
        .from('searches')
        .update({ status: 'completed' })
        .eq('id', searchId)
      if (updErr2) console.error('Failed to update status to completed:', updErr2)
    }

    // 9. 返回生成结果
    return NextResponse.json({ content })
  } catch (e: any) {
    console.error('generate-email POST error:', e)
    // 出错时更新状态为 failed
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