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

// TikTok API 端点
const TIKTOK_SCRAPER_ENDPOINT = 'https://api.apify.com/v2/actor-tasks/ai.labs~tiktok-profile-scraper-branddeepresearch/runs?token=' + APIFY_API_TOKEN;

// Instagram API 端点
const INSTAGRAM_SCRAPER_ENDPOINT = 'https://api.apify.com/v2/actor-tasks/ai.labs~instagram-profile-scraper-branddeepresearch/runs?token=' + APIFY_API_TOKEN;

// LinkedIn API 端点
const LINKEDIN_SCRAPER_ENDPOINT = 'https://api.apify.com/v2/actor-tasks/ai.labs~linkedin-company-detail-brand/runs?token=' + APIFY_API_TOKEN;

// Twitter API 端点
const TWITTER_SCRAPER_ENDPOINT = 'https://api.apify.com/v2/actor-tasks/ai.labs~twitter-brandresearch/runs?token=' + APIFY_API_TOKEN;

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

/**
 * 超时检查配置
 * 
 * 注意：该超时检查机制用于为当前用户请求提供即时反馈，与系统级的定期检查(check-scraping-status)互为补充
 * - scrape-followers 中的检查：在用户请求时立即判断任务是否已超时，提供即时反馈
 * - check-scraping-status 中的检查：系统级的定期检查，确保长时间运行的任务不会无限期挂起
 * 
 * 这种双重检查机制可以提高用户体验并保障系统稳定性
 */
const TIMEOUT_MINUTES = 3;

/**
 * 检查任务是否已超时
 * 该函数在用户请求过程中调用，用于提供即时反馈
 * @param createdTime 任务创建时间
 * @returns 是否已超时
 */
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

// TikTok数据集项结构
interface TikTokDatasetItem {
  authorMeta?: {
    fans?: number;
  };
  [key: string]: any;
}

// Instagram数据集项结构
interface InstagramDatasetItem {
  followersCount?: number;
  [key: string]: any;
}

// LinkedIn数据集项结构
interface LinkedInDatasetItem {
  stats?: {
    follower_count?: number;
  };
  [key: string]: any;
}

// Twitter数据集项结构
interface TwitterDatasetItem {
  author?: {
    followers?: number;
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
    
    // 关键修改：更新 searches 表状态为 'scraping'
    const { error: updateError } = await supabase
      .from('searches')
      .update({ status: 'scraping' })
      .eq('id', searchId);
      
    if (updateError) {
      console.error('Error updating search status to scraping:', updateError);
      return NextResponse.json(
        { success: false, message: 'Failed to update search status', error: updateError },
        { status: 500 }
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
    
    // 处理每个平台的爬取
    for (const item of items) {
      const { id, competitor_name: name, platform, url, actorRunId, defaultDatasetId, updated_at: updatedAt, fans_count } = item;
      
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
      
      /**
       * 任务状态和超时检查
       * 为用户提供即时反馈，而非等待系统定期检查
       */
      if (actorRunId && !defaultDatasetId) {
        if (updatedAt && checkTimeout(updatedAt)) {
          // 超时，标记为失败
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
      
      // 根据平台类型选择不同的爬取逻辑
      if (platform === 'youtube' && url) {
        try {
          // 构建 YouTube Apify 请求体
          const apifyRequest = {
            maxResultStreams: 0,
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
      } else if (platform === 'tiktok' && url) {
        // TikTok平台处理逻辑
        try {
          // 构建 TikTok Apify 请求体
          const apifyRequest = {
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
          
          // 发送请求给 Apify
          const apifyResponse = await fetch(TIKTOK_SCRAPER_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(apifyRequest)
          });
          
          if (!apifyResponse.ok) {
            const errorText = await apifyResponse.text();
            throw new Error(`Apify TikTok request failed: ${errorText}`);
          }
          
          // 获取 Apify 响应
          const apifyData = await apifyResponse.json();
          
          // 确保我们有一个任务 ID
          if (!apifyData.data || !apifyData.data.id) {
            throw new Error('Missing actor run ID in Apify TikTok response');
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
            console.error('Error updating actorRunId for TikTok:', updateError);
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
      } else if (platform === 'instagram' && url) {
        // Instagram平台处理逻辑
        try {
          // 从 URL 中提取 Instagram 用户名
          let username = url;
          if (url.includes('instagram.com')) {
            try {
              const urlObj = new URL(url);
              const pathParts = urlObj.pathname.split('/').filter(part => part);
              if (pathParts.length > 0) {
                username = pathParts[0];
              }
            } catch (error) {
              console.warn('无法从 URL 解析用户名，使用原始输入:', url);
            }
          }
        
          // 构建 Instagram Apify 请求体
          const apifyRequest = {
            usernames: [username]
          };
          
          // 发送请求给 Apify
          const apifyResponse = await fetch(INSTAGRAM_SCRAPER_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(apifyRequest)
          });
          
          if (!apifyResponse.ok) {
            const errorText = await apifyResponse.text();
            throw new Error(`Apify Instagram request failed: ${errorText}`);
          }
          
          // 获取 Apify 响应
          const apifyData = await apifyResponse.json();
          
          // 确保我们有一个任务 ID
          if (!apifyData.data || !apifyData.data.id) {
            throw new Error('Missing actor run ID in Apify Instagram response');
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
            console.error('Error updating actorRunId for Instagram:', updateError);
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
      } else if (platform === 'linkedin' && url) {
        // LinkedIn平台处理逻辑
        try {
          // 构建 LinkedIn Apify 请求体
          const apifyRequest = {
            identifier: [url]
          };
          
          // 发送请求给 Apify
          const apifyResponse = await fetch(LINKEDIN_SCRAPER_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(apifyRequest)
          });
          
          if (!apifyResponse.ok) {
            const errorText = await apifyResponse.text();
            throw new Error(`Apify LinkedIn request failed: ${errorText}`);
          }
          
          // 获取 Apify 响应
          const apifyData = await apifyResponse.json();
          
          // 确保我们有一个任务 ID
          if (!apifyData.data || !apifyData.data.id) {
            throw new Error('Missing actor run ID in Apify LinkedIn response');
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
            console.error('Error updating actorRunId for LinkedIn:', updateError);
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
      } else if (platform === 'twitter' && url) {
        // Twitter平台处理逻辑
        try {
          // 构建 Twitter Apify 请求体
          const apifyRequest = {
            maxItems: 1,
            sort: "Latest",
            startUrls: [url]
          };
          
          // 发送请求给 Apify
          const apifyResponse = await fetch(TWITTER_SCRAPER_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(apifyRequest)
          });
          
          if (!apifyResponse.ok) {
            const errorText = await apifyResponse.text();
            throw new Error(`Apify Twitter request failed: ${errorText}`);
          }
          
          // 获取 Apify 响应
          const apifyData = await apifyResponse.json();
          
          // 确保我们有一个任务 ID
          if (!apifyData.data || !apifyData.data.id) {
            throw new Error('Missing actor run ID in Apify Twitter response');
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
            console.error('Error updating actorRunId for Twitter:', updateError);
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
      } else if ((platform === 'youtube' || platform === 'tiktok' || platform === 'instagram' || platform === 'linkedin' || platform === 'twitter') && !url) {
        // 平台但没有 URL
        results.push({
          id,
          name,
          platform,
          url: undefined,
          followers: null,
          success: false,
          error: `${platform.charAt(0).toUpperCase() + platform.slice(1)} URL 不存在`
        });
      } else {
        // 对于其他平台，暂时添加一个占位结果
        results.push({
          id,
          name,
          platform,
          url: url || undefined,
          followers: null,
          success: true // 非目标平台暂时视为成功
        });
      }
    }
    
    // 返回结果
    return NextResponse.json({
      success: true,
      results
    });
    
  } catch (error: any) {
    console.error('Error in scrape-followers:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: error.message },
      { status: 500 }
    );
  }
}