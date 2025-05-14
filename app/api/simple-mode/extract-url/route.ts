import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 定义调试信息接口
interface DebugInfo {
  steps: string[];
  rawResults: {
    social_accounts?: string[];
    verify_urls?: string[];
    social_accounts_error?: string;
    verify_urls_error?: string;
    [key: string]: any;
  };
}

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

    // 用于收集调试信息
    const debugInfo: DebugInfo = {
      steps: [],
      rawResults: {}
    };

    // 3. 第一步：调用gpt4o_search的social_accounts任务获取可能的URL
    const origin = req.nextUrl.origin
    debugInfo.steps.push(`1. 调用social_accounts任务查找候选URL，品牌: ${name}, 平台: ${platform}`);
    
    const searchRes = await fetch(`${origin}/api/gpt4o_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: name,
        task: 'social_accounts',
        platform,
        region: 'Global',
        options: {
          maxResults: 3  // 最多获取3个候选URL
        }
      })
    })
    
    if (!searchRes.ok) {
      const text = await searchRes.text()
      console.error('gpt4o_search (social_accounts) error:', searchRes.status, text)
      debugInfo.steps.push(`Error: social_accounts调用失败 (${searchRes.status})`);
      debugInfo.rawResults.social_accounts_error = text;
      
      return NextResponse.json(
        { 
          error: `gpt4o_search failed: ${searchRes.status}`,
          debug: debugInfo 
        },
        { status: 500 }
      )
    }
    
    const searchData = await searchRes.json()
    const candidateUrls = searchData.results || []
    
    debugInfo.steps.push(`2. social_accounts任务返回${candidateUrls.length}个候选URL`);
    debugInfo.rawResults.social_accounts = candidateUrls;
    
    // 如果没有找到候选URL，直接返回空结果
    if (candidateUrls.length === 0) {
      debugInfo.steps.push(`3. 没有找到候选URL，返回空结果`);
      
      return NextResponse.json({
        name,
        platform,
        url: '',
        debug: debugInfo
      })
    }
    
    // 4. 第二步：调用verify_urls任务从候选URL中选择最佳URL
    debugInfo.steps.push(`3. 调用verify_urls任务验证${candidateUrls.length}个候选URL`);
    
    const verifyRes = await fetch(`${origin}/api/gpt4o_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: name,
        task: 'verify_urls',
        platform,
        region: 'Global',
        options: {
          candidateUrls: candidateUrls
        }
      })
    })
    
    if (!verifyRes.ok) {
      const text = await verifyRes.text()
      console.error('gpt4o_search (verify_urls) error:', verifyRes.status, text)
      debugInfo.steps.push(`Error: verify_urls调用失败 (${verifyRes.status})`);
      debugInfo.rawResults.verify_urls_error = text;
      
      return NextResponse.json(
        { 
          error: `gpt4o_search verification failed: ${verifyRes.status}`,
          debug: debugInfo
        },
        { status: 500 }
      )
    }
    
    const verifyData = await verifyRes.json()
    const finalUrl = verifyData.results && verifyData.results.length > 0 ? verifyData.results[0] : ''
    
    debugInfo.steps.push(`4. verify_urls任务选择了最佳URL: ${finalUrl || '(无)'}`);
    debugInfo.rawResults.verify_urls = verifyData.results || [];

    // 5. 返回结果
    return NextResponse.json({
      name,
      platform,
      url: finalUrl,
      debug: debugInfo
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
      { 
        error: e.message || 'Internal error',
        debug: {
          error: e.message,
          stack: e.stack
        }
      },
      { status: 500 }
    )
  }
}