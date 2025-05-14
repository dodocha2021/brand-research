import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Apify API Token
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || '';

// 各平台的API端点
const YOUTUBE_SCRAPER_ENDPOINT = 'https://api.apify.com/v2/actor-tasks/ai.labs~youtube-channel-scraper-brand/runs?token=' + APIFY_API_TOKEN;
const TIKTOK_SCRAPER_ENDPOINT = 'https://api.apify.com/v2/actor-tasks/ai.labs~tiktok-profile-scraper-branddeepresearch/runs?token=' + APIFY_API_TOKEN;
const INSTAGRAM_SCRAPER_ENDPOINT = 'https://api.apify.com/v2/actor-tasks/ai.labs~instagram-profile-scraper-branddeepresearch/runs?token=' + APIFY_API_TOKEN;
const LINKEDIN_SCRAPER_ENDPOINT = 'https://api.apify.com/v2/actor-tasks/ai.labs~linkedin-company-detail-brand/runs?token=' + APIFY_API_TOKEN;
const TWITTER_SCRAPER_ENDPOINT = 'https://api.apify.com/v2/actor-tasks/ai.labs~twitter-brandresearch/runs?token=' + APIFY_API_TOKEN;

export async function POST(req: NextRequest) {
  try {
    // 完整打印请求头信息
    console.log('[start-scrape] 请求头:', Object.fromEntries(req.headers.entries()));
    
    const requestData = await req.json();
    console.log('[start-scrape] 收到请求体:', JSON.stringify(requestData));
    
    const { url, platform, competitorId } = requestData;
    
    if (!url || !platform || !competitorId) {
      console.error('[start-scrape] 参数缺失:', { url, platform, competitorId });
      return NextResponse.json({ 
        success: false, 
        message: '缺少必要参数' 
      }, { status: 400 });
    }
    
    console.log(`[start-scrape] 启动抓取任务: platform=${platform}, url=${url}, competitorId=${competitorId}, competitorId类型=${typeof competitorId}`);
    
    // 检查competitorId是否有效
    try {
      const { data: checkData, error: checkError } = await supabase
        .from('competitor_search_history')
        .select('id')
        .eq('id', competitorId)
        .single();
      
      if (checkError) {
        console.error(`[start-scrape] 检查competitorId存在性失败:`, checkError);
      } else if (!checkData) {
        console.error(`[start-scrape] competitorId=${competitorId}在数据库中不存在!`);
      } else {
        console.log(`[start-scrape] competitorId=${competitorId}在数据库中验证成功`);
      }
    } catch (e) {
      console.error(`[start-scrape] 检查competitorId异常:`, e);
    }
    
    // 根据平台选择合适的endpoint
    let apifyEndpoint;
    let apifyRequest = {};
    
    switch (platform.toLowerCase()) {
      case 'youtube':
        apifyEndpoint = YOUTUBE_SCRAPER_ENDPOINT;
        apifyRequest = {
          maxResultStreams: 0,
          maxResults: 1,
          maxResultsShorts: 1,
          includeAboutInfo: true,
          shouldDownloadVideos: false,
          shouldDownloadSubtitles: false,
          shouldDownloadSlideshowImages: false,
          shouldDownloadCovers: false,
          sortVideosBy: "POPULAR",
          startUrls: [
            {
              url,
              method: "GET"
            }
          ]
        };
        break;
      case 'tiktok':
        apifyEndpoint = TIKTOK_SCRAPER_ENDPOINT;
        apifyRequest = {
          excludePinnedPosts: false,
          profiles: [url],
          resultsPerPage: 1,
          shouldDownloadAvatars: false,
          shouldDownloadCovers: true,
          shouldDownloadSlideshowImages: false,
          shouldDownloadSubtitles: false,
          shouldDownloadVideos: false,
          profileScrapeSections: ["videos"],
          profileSorting: "latest"
        };
        break;
      case 'instagram':
        apifyEndpoint = INSTAGRAM_SCRAPER_ENDPOINT;
        let username = url;
        if (url.includes('instagram.com')) {
          try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(part => part);
            if (pathParts.length > 0) {
              username = pathParts[0];
            }
          } catch (error) {
            console.warn('无法从URL解析用户名，使用原始输入:', url);
          }
        }
        apifyRequest = {
          usernames: [username]
        };
        break;
      case 'linkedin':
        apifyEndpoint = LINKEDIN_SCRAPER_ENDPOINT;
        apifyRequest = {
          identifier: [url]
        };
        break;
      case 'twitter':
        apifyEndpoint = TWITTER_SCRAPER_ENDPOINT;
        apifyRequest = {
          maxItems: 1,
          sort: "Latest",
          startUrls: [url]
        };
        break;
      default:
        throw new Error(`不支持的平台: ${platform}`);
    }
    
    // 打印完整请求
    console.log(`[start-scrape] Optimized ${platform} request:`, JSON.stringify(apifyRequest));
    
    // 调用Apify API启动任务
    console.log(`[start-scrape] 调用Apify API: ${apifyEndpoint}`);
    const response = await fetch(apifyEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apifyRequest),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Apify API错误: ${errorText}`);
    }
    
    const result = await response.json();
    console.log(`[start-scrape] Apify完整响应:`, JSON.stringify(result));
    
    // 确保我们获取正确的actorRunId
    // Apify返回的格式可能是 result.data.id
    let actorRunId = '';
    if (result.data && result.data.id) {
      actorRunId = result.data.id;
    } else if (result.id) {
      actorRunId = result.id;
    } else {
      throw new Error('无法从Apify响应中提取actorRunId');
    }
    
    console.log(`[start-scrape] 获取到actorRunId: ${actorRunId}`);
    
    // 更新数据库，保存actorRunId
    console.log(`[start-scrape] 更新数据库记录 ID=${competitorId} 的actorRunId=${actorRunId}`);
    
    // 打印数据库连接信息
    console.log(`[start-scrape] 使用的Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 20)}...`);
    
    try {
      // 首先，检查记录是否存在
      console.log(`[start-scrape] 检查记录是否存在: ID=${competitorId}`);
      const { data: existingRecord, error: checkError } = await supabase
        .from('competitor_search_history')
        .select('id, actorRunId, competitor_url, platform')
        .eq('id', competitorId)
        .single();
      
      if (checkError) {
        console.error(`[start-scrape] 检查记录存在性失败:`, checkError);
        console.error(`[start-scrape] 错误代码: ${checkError.code}, 消息: ${checkError.message}, 详情: ${checkError.details}`);
      } else if (!existingRecord) {
        console.error(`[start-scrape] 记录不存在: ID=${competitorId}`);
      } else {
        console.log(`[start-scrape] 找到记录:`, JSON.stringify(existingRecord));
      }
      
      // 执行更新操作
      console.log(`[start-scrape] 准备执行更新: actorRunId=${actorRunId}`);
      const updateResult = await supabase
        .from('competitor_search_history')
        .update({
          actorRunId
        })
        .eq('id', competitorId);
      
      const { error, data, count, status, statusText } = updateResult;
        
      if (error) {
        console.error(`[start-scrape] 数据库更新错误:`, error);
        console.error(`[start-scrape] 错误代码: ${error.code}, 消息: ${error.message}, 详情: ${error.details}`);
        console.error(`[start-scrape] 数据库更新SQL: update competitor_search_history set actorRunId='${actorRunId}' where id='${competitorId}'`);
        throw new Error(`数据库更新错误: ${error.message}`);
      } else {
        console.log(`[start-scrape] 数据库更新成功! ID=${competitorId}, actorRunId=${actorRunId}`);
        console.log(`[start-scrape] 更新结果: 状态=${status}, 状态文本=${statusText}, 影响行数=${count}`);
        console.log(`[start-scrape] 返回数据:`, data);
      }
    } catch (e) {
      console.error(`[start-scrape] 数据库更新异常:`, e);
      throw e;
    }
    
    // 验证数据已正确保存
    console.log(`[start-scrape] 验证数据库更新`);
    const { data: verifyData, error: verifyError } = await supabase
      .from('competitor_search_history')
      .select('actorRunId')
      .eq('id', competitorId)
      .single();
      
    if (verifyError) {
      console.error(`[start-scrape] 验证查询错误:`, verifyError);
    } else if (verifyData) {
      console.log(`[start-scrape] 数据库验证: 记录ID=${competitorId}的actorRunId=${verifyData.actorRunId}`);
      if (verifyData.actorRunId !== actorRunId) {
        console.error(`[start-scrape] 警告: 数据库中的actorRunId(${verifyData.actorRunId})与期望值(${actorRunId})不匹配`);
      }
    }
    
    console.log(`[start-scrape] 数据库更新成功，等待webhook回调`);
    
    return NextResponse.json({
      success: true,
      message: '抓取任务已启动',
      actorRunId
    });
    
  } catch (error: any) {
    console.error('[start-scrape] 错误:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message 
    }, { status: 500 });
  }
} 