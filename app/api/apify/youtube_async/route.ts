import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'API Key 未配置' }, { status: 500 });
  }

  try {
    // 解析请求体
    const requestData = await request.json();
    const { startUrls, id, searchId } = requestData;
    
    // 验证必要参数
    if (!startUrls || !startUrls.length || !startUrls[0].url) {
      return NextResponse.json({ error: '缺少URL参数' }, { status: 400 });
    }
    
    const url = startUrls[0].url;
    
    console.log(`启动YouTube爬取任务，URL: ${url}`);
    
    // 确定webhook URL
    const webhookUrl = process.env.WEBHOOK_BASE_URL 
      ? `${process.env.WEBHOOK_BASE_URL}/api/apify/youtube_webhook` 
      : 'https://03b9-2604-3d08-247b-b5b0-64ca-886d-909-143b.ngrok-free.app/api/apify/youtube_webhook';
    
    // 构建Apify请求体
    const apifyInput = {
      maxResultStreams: 1,
      maxResults: 1,
      maxResultsShorts: 1,
      includeAboutInfo: true,
      shouldDownloadVideos: false,
      shouldDownloadSubtitles: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadCovers: false,
      sortVideosBy: "POPULAR",
      startUrls
    };
    
    // 调用Apify API异步启动任务
    console.log(`正在发送请求到Apify，webhook: ${webhookUrl}`);
    const apifyResponse = await fetch(
      `https://api.apify.com/v2/actor-tasks/ai.labs~youtube-channel-scraper-brand/runs?token=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...apifyInput,
          webhooks: [
            {
              eventTypes: ['ACTOR.RUN.SUCCEEDED'],
              requestUrl: webhookUrl
            }
          ]
        })
      }
    );
    
    if (!apifyResponse.ok) {
      const errorText = await apifyResponse.text();
      console.error(`Apify API错误: ${apifyResponse.status} - ${errorText}`);
      return NextResponse.json({ error: `Apify API错误: ${apifyResponse.status}` }, { status: 500 });
    }
    
    const apifyData = await apifyResponse.json();
    
    // 更新数据库，记录actorRunId
    if (id && apifyData.data && apifyData.data.id) {
      const { error: updateError } = await supabase
        .from('simple_search_history')
        .update({
          actorRunId: apifyData.data.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      
      if (updateError) {
        console.error('数据库更新失败:', updateError);
        // 继续执行，即使数据库更新失败，任务仍在进行
      }
    }
    
    // 返回成功响应
    return NextResponse.json({
      success: true,
      message: '任务已启动，结果将通过webhook回调',
      taskId: apifyData.data?.id
    });
    
  } catch (error: any) {
    console.error('启动任务失败:', error);
    return NextResponse.json(
      { error: `启动任务失败: ${error.message}` },
      { status: 500 }
    );
  }
} 