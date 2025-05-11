import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Apify API Token
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || '';

// YouTube API 端点
const YOUTUBE_SCRAPER_ENDPOINT = 'https://api.apify.com/v2/actor-tasks/ai.labs~youtube-channel-scraper-brand/runs?token=' + APIFY_API_TOKEN;

// 定义请求和响应的类型
interface ScrapeRequest {
  searchId: string;
}

interface ScrapedItem {
  id: string;
  name: string;
  platform: string;
  url?: string;
  followers?: number | null;
  success?: boolean;
  error?: string;
  actorRunId?: string;
  defaultDatasetId?: string;
}

// 在适当的位置添加超时检查
const TIMEOUT_MINUTES = 3;

// 检查是否超时
const checkTimeout = (createdTime: string) => {
  const created = new Date(createdTime);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  return diffMins >= TIMEOUT_MINUTES;
};

// 添加一个接口来定义数据集项的结构
interface DatasetItem {
  aboutChannelInfo?: {
    numberOfSubscribers?: number;
  };
  [key: string]: any;
}

export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const requestData: ScrapeRequest = await request.json();
    const { searchId } = requestData;
    
    // 验证请求
    if (!searchId) {
      return NextResponse.json(
        { success: false, message: 'Search ID is required' },
        { status: 400 }
      );
    }
    
    // 从数据库读取该searchId下的所有记录
    const { data: items, error: fetchError } = await supabase
      .from('simple_search_history')
      .select('*')
      .eq('search_id', searchId);
    
    if (fetchError) {
      console.error('Error fetching data:', fetchError);
      return NextResponse.json(
        { success: false, message: 'Database fetch failed', error: fetchError },
        { status: 500 }
      );
    }
    
    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No records found for this search ID' },
        { status: 404 }
      );
    }
    
    // 处理结果数组
    const results: ScrapedItem[] = [];
    let needUserAction = false;
    
    // 处理每个平台的爬取
    for (const item of items) {
      const { id, competitor_name: name, platform, url, actorRunId, defaultDatasetId, updated_at: updatedAt, fans_count } = item;
      
      // 如果是 YouTube 平台且有 URL，发送 Apify 请求
      if (platform === 'youtube' && url) {
        // 如果已经有粉丝数据，直接添加到结果中
        if (fans_count !== null && fans_count !== undefined) {
          results.push({
            id,
            name,
            platform,
            url,
            followers: fans_count,
            success: fans_count > 200,
            actorRunId,
            defaultDatasetId
          });
          continue;
        }
        
        // 如果有 actorRunId 但没有 defaultDatasetId，检查是否超时
        if (actorRunId && !defaultDatasetId) {
          if (updatedAt && checkTimeout(updatedAt)) {
            // 超时，标记需要用户干预
            needUserAction = true;
            results.push({
              id,
              name,
              platform,
              url,
              followers: null,
              success: false,
              error: '请求超时，请重试',
              actorRunId
            });
          } else {
            // 尚未超时，等待webhook回调
            results.push({
              id,
              name,
              platform,
              url,
              followers: null,
              success: false,
              error: '处理中，请等待',
              actorRunId
            });
          }
          continue;
        }
        
        // 如果没有 actorRunId，发起新的请求
        if (!actorRunId) {
          try {
            // 构建 Apify 请求体
            const apifyRequest = {
              maxResultStreams: 1,
              maxResults: 1,
              maxResultsShorts: 1,
              sortVideosBy: "POPULAR",
              startUrls: [
                {
                  url,
                  method: "GET"
                }
              ]
            };
            
            // 发送请求给 Apify
            const apifyResponse = await fetch(YOUTUBE_SCRAPER_ENDPOINT, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(apifyRequest)
            });
            
            if (!apifyResponse.ok) {
              const errorText = await apifyResponse.text();
              throw new Error(`Apify request failed: ${errorText}`);
            }
            
            // 获取 Apify 响应
            const apifyData = await apifyResponse.json();
            
            // 确保我们有一个任务 ID
            if (!apifyData.data || !apifyData.data.id) {
              throw new Error('Missing actor run ID in Apify response');
            }
            
            // 更新数据库中的 actorRunId
            const { error: updateError } = await supabase
              .from('simple_search_history')
              .update({
                actorRunId: apifyData.data.id,
                updated_at: new Date().toISOString()
              })
              .eq('id', id);
            
            if (updateError) {
              console.error('Error updating actorRunId:', updateError);
              needUserAction = true;
              results.push({
                id,
                name,
                platform,
                url,
                followers: null,
                success: false,
                error: `数据库更新错误: ${updateError.message}`
              });
              continue;
            }
            
            // 添加到结果数组
            results.push({
              id,
              name,
              platform,
              url,
              followers: null,
              success: true,
              actorRunId: apifyData.data.id
            });
            
          } catch (error: any) {
            console.error(`Error processing ${platform} for ${name}:`, error);
            needUserAction = true;
            results.push({
              id,
              name,
              platform,
              url,
              followers: null,
              success: false,
              error: error.message
            });
          }
        }
      } else if (platform === 'youtube' && !url) {
        // YouTube 平台但没有 URL
        results.push({
          id,
          name,
          platform,
          url: undefined,
          followers: null,
          success: false,
          error: 'YouTube URL 不存在'
        });
        // 缺少 URL 需要用户行动
        needUserAction = true;
      } else {
        // 对于其他平台，暂时添加一个占位结果
        results.push({
          id,
          name,
          platform,
          url: url || undefined,
          followers: null,
          success: true // 非 YouTube 平台暂时视为成功
        });
      }
    }
    
    // 返回结果
    return NextResponse.json({
      success: true,
      results,
      needUserAction
    });
    
  } catch (error: any) {
    console.error('Error in scrape-followers:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: error.message, needUserAction: true },
      { status: 500 }
    );
  }
}