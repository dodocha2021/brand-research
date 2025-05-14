import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Apify API Token
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || '';

// 用于存储已处理的actorRunId，避免重复处理
const processedRunIds = new Set<string>();

export async function POST(req: NextRequest) {
  console.log('[competitor-scrape-webhook] 开始处理webhook回调');
  
  try {
    // 解析请求体
    const body = await req.json();
    console.log('[competitor-scrape-webhook] Webhook payload:', JSON.stringify(body).substring(0, 500) + '...');
    
    // 从Apify标准webhook格式中提取必要信息
    console.log('[competitor-scrape-webhook] 原始eventType:', body.eventType);
    console.log('[competitor-scrape-webhook] 原始eventData:', body.eventData ? JSON.stringify(body.eventData) : 'undefined');
    console.log('[competitor-scrape-webhook] 原始resource:', body.resource ? JSON.stringify(body.resource) : 'undefined');
    
    const eventType = body.eventType || '';
    const actorRunId = body.eventData?.actorRunId || body.resource?.id || body.resource?.actorRunId || '';
    const defaultDatasetId = body.resource?.defaultDatasetId || '';
    
    console.log(`[competitor-scrape-webhook] 提取的信息: eventType=${eventType}, actorRunId=${actorRunId}, defaultDatasetId=${defaultDatasetId}`);
    
    if (!actorRunId) {
      console.error('[competitor-scrape-webhook] Missing actorRunId in webhook data');
      return NextResponse.json({ 
        success: false, 
        message: 'Missing actorRunId in webhook data' 
      }, { status: 200 });
    }
    
    // 检查是否已经处理过这个actorRunId
    if (processedRunIds.has(actorRunId)) {
      console.log(`[competitor-scrape-webhook] 重复的actorRunId=${actorRunId}，跳过处理`);
      return NextResponse.json({ 
        success: true, 
        message: `actorRunId=${actorRunId}已被处理，跳过`,
      }, { status: 200 });
    }
    
    // 添加到已处理集合
    processedRunIds.add(actorRunId);
    
    // 仅处理成功完成的任务
    if (eventType && eventType !== 'ACTOR.RUN.SUCCEEDED') {
      console.log(`[competitor-scrape-webhook] 非成功事件，忽略处理: ${eventType}`);
      return NextResponse.json({ 
        success: true, 
        message: `忽略非成功事件: ${eventType}` 
      }, { status: 200 });
    }
    
    // 根据actorRunId查找已有记录
    console.log(`[competitor-scrape-webhook] 查找actorRunId为${actorRunId}的记录`);
    
    // 先打印所有匹配actorRunId模式的记录，帮助调试
    console.log(`[competitor-scrape-webhook] 查询包含此actorRunId模式的所有记录`);
    const { data: allRecords, error: searchError } = await supabase
      .from('competitor_search_history')
      .select('id, actorRunId')
      .ilike('actorRunId', `%${actorRunId.substring(0, 5)}%`)
      .limit(10);
      
    if (searchError) {
      console.error('[competitor-scrape-webhook] 模糊查询错误:', searchError);
      console.error(`[competitor-scrape-webhook] 错误代码: ${searchError.code}, 消息: ${searchError.message}, 详情: ${searchError.details}`);
    } else {
      console.log(`[competitor-scrape-webhook] 找到${allRecords.length}条可能相关的记录:`, JSON.stringify(allRecords));
    }
    
    // 标准查询
    console.log(`[competitor-scrape-webhook] 执行精确查询: actorRunId=${actorRunId}`);
    const queryResult = await supabase
      .from('competitor_search_history')
      .select('*')
      .eq('actorRunId', actorRunId)
      .limit(1);
    
    const { data: existingRecords, error: findError, status: queryStatus, statusText: queryStatusText } = queryResult;
    
    console.log(`[competitor-scrape-webhook] 查询结果: 状态=${queryStatus}, 状态文本=${queryStatusText}`);
    
    if (findError) {
      console.error('[competitor-scrape-webhook] 查询数据库错误:', findError);
      console.error(`[competitor-scrape-webhook] 错误代码: ${findError.code}, 消息: ${findError.message}, 详情: ${findError.details}`);
      return NextResponse.json({ 
        success: false, 
        message: '查询数据库错误', 
        error: findError.message 
      }, { status: 200 });
    }
    
    // 如果找不到匹配的记录，返回错误
    if (!existingRecords || existingRecords.length === 0) {
      console.log('[competitor-scrape-webhook] 未找到匹配的记录:', actorRunId);
      return NextResponse.json({
        success: false,
        message: '未找到匹配的记录',
        actorRunId
      }, { status: 200 });
    }
    
    const record = existingRecords[0];
    console.log(`[competitor-scrape-webhook] 找到匹配记录: id=${record.id}, platform=${record.platform}`);
    
    // 首先更新defaultDatasetId
    if (defaultDatasetId) {
      console.log(`[competitor-scrape-webhook] 更新defaultDatasetId: ${defaultDatasetId}`);
      const { error: updateDatasetIdError } = await supabase
        .from('competitor_search_history')
        .update({
          defaultDatasetId
        })
        .eq('id', record.id);
        
      if (updateDatasetIdError) {
        console.error('[competitor-scrape-webhook] 更新defaultDatasetId失败:', updateDatasetIdError);
      }
    }
    
    // 从Apify获取完整数据
    const platform = record.platform;
    let apiData: any[] = [];
    let result = {
      platform,
      actorRunId,
      url: record.competitor_url || '',
      fans_count: null,
      total_views: null,
      success: false
    };
    
    // 准备更新数据
    const updateData: any = {};
    
    if (defaultDatasetId) {
      // 获取数据集内容
      console.log(`[competitor-scrape-webhook] 从Apify获取数据集: ${defaultDatasetId}`);
      const datasetUrl = `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_API_TOKEN}`;
      
      try {
        const response = await fetch(datasetUrl);
        if (!response.ok) {
          throw new Error(`获取数据失败: ${response.status} ${response.statusText}`);
        }
        
        apiData = await response.json();
        console.log(`[competitor-scrape-webhook] 获取到${apiData.length}条数据项`);
        
        // 保存API返回的原始数据到dataset字段
        updateData.dataset = JSON.stringify(apiData);
        
        // 根据平台处理数据
        if (platform === 'youtube') {
          result = processYouTubeData(apiData, result);
        } else if (platform === 'instagram') {
          result = processInstagramData(apiData, result);
        } else if (platform === 'tiktok') {
          result = processTikTokData(apiData, result);
        } else if (platform === 'twitter') {
          result = processTwitterData(apiData, result);
        } else if (platform === 'linkedin') {
          result = processLinkedInData(apiData, result);
        }
      } catch (error: any) {
        console.error('[competitor-scrape-webhook] 处理Apify数据出错:', error);
        return NextResponse.json({ 
          success: false, 
          message: '处理Apify数据出错', 
          error: error.message 
        }, { status: 200 });
      }
    } else if (body.data && Array.isArray(body.data)) {
      // 如果webhook中已包含数据，直接处理
      apiData = body.data;
      // 根据平台处理数据
      if (platform === 'youtube') {
        result = processYouTubeData(apiData, result);
      } else if (platform === 'instagram') {
        result = processInstagramData(apiData, result);
      } else if (platform === 'tiktok') {
        result = processTikTokData(apiData, result);
      } else if (platform === 'twitter') {
        result = processTwitterData(apiData, result);
      } else if (platform === 'linkedin') {
        result = processLinkedInData(apiData, result);
      }
    }
    
    // 更新数据库
    console.log(`[competitor-scrape-webhook] 更新数据库: url=${result.url}, fans_count=${result.fans_count}`);
    
    // 只添加确实存在的字段
    if (result.url) {
      updateData.competitor_url = result.url;
    }
    
    if (result.fans_count !== null && result.fans_count !== undefined) {
      updateData.followers = result.fans_count;
    }
    
    // 添加YouTube的total_views字段
    if (result.total_views !== null && result.total_views !== undefined) {
      updateData.total_views = result.total_views;
    }
    
    if (defaultDatasetId) {
      updateData.defaultDatasetId = defaultDatasetId;
    }
    
    // 添加原始webhook数据到dataset字段
    if (!updateData.dataset) {
      updateData.dataset = body.data ? JSON.stringify(body.data) : JSON.stringify(body);
    }
    
    console.log(`[competitor-scrape-webhook] 将要更新的字段:`, JSON.stringify(updateData));
    
    // 执行数据库更新
    const updateResult = await supabase
      .from('competitor_search_history')
      .update(updateData)
      .eq('id', record.id);
    
    const { error: updateError, data: updatedData, count: updateCount, status: updateStatus, statusText: updateStatusText } = updateResult;
    
    console.log(`[competitor-scrape-webhook] 更新结果: 状态=${updateStatus}, 状态文本=${updateStatusText}, 影响行数=${updateCount}`);
    
    if (updateError) {
      console.error('[competitor-scrape-webhook] 更新记录失败:', updateError);
      console.error(`[competitor-scrape-webhook] 错误代码: ${updateError.code}, 消息: ${updateError.message}, 详情: ${updateError.details}`);
      return NextResponse.json({ 
        success: false, 
        message: '更新记录失败', 
        error: updateError.message 
      }, { status: 200 });
    }
    
    console.log(`[competitor-scrape-webhook] 成功更新记录 ID ${record.id}`);
    console.log(`[competitor-scrape-webhook] 更新后的数据:`, updatedData);
    
    return NextResponse.json({
      success: true,
      message: '竞争对手数据已更新',
      result,
      updatedData
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('[competitor-scrape-webhook] 处理webhook出错:', error);
    return NextResponse.json({ 
      success: false, 
      message: '处理webhook出错', 
      error: error.message 
    }, { status: 200 });
  }
}

// 处理不同平台的数据提取
function processYouTubeData(data: any[], result: any): any {
  if (!Array.isArray(data) || data.length === 0) return result;
  
  const item = data[0];
  result.url = extractYouTubeUrl(item);
  
  // 尝试不同的路径获取订阅者数量
  if (item.aboutChannelInfo?.numberOfSubscribers !== undefined) {
    const subCount = item.aboutChannelInfo.numberOfSubscribers;
    result.fans_count = typeof subCount === 'string' 
      ? parseInt(subCount.replace(/,/g, '')) 
      : subCount;
  } else if (item.subscriberCount !== undefined) {
    result.fans_count = item.subscriberCount;
  } else if (item.channel?.subscriberCount !== undefined) {
    result.fans_count = item.channel.subscriberCount;
  } else if (item.numberOfSubscribers !== undefined) {
    result.fans_count = item.numberOfSubscribers;
  }

  // 提取channelTotalViews数据
  if (item.aboutChannelInfo?.channelTotalViews !== undefined) {
    const viewCount = item.aboutChannelInfo.channelTotalViews;
    result.total_views = typeof viewCount === 'string'
      ? parseInt(viewCount.replace(/,/g, ''))
      : viewCount;
  } else if (item.channelTotalViews !== undefined) {
    result.total_views = item.channelTotalViews;
  } else if (item.channel?.totalViews !== undefined) {
    result.total_views = item.channel.totalViews;
  }
  
  result.success = result.fans_count ? result.fans_count > 200 : false;
  return result;
}

function processInstagramData(data: any[], result: any): any {
  if (!Array.isArray(data) || data.length === 0) return result;
  
  const item = data[0];
  if (item.username) {
    result.url = `https://www.instagram.com/${item.username}`;
  }
  
  if (item.followersCount !== undefined) {
    result.fans_count = item.followersCount;
  }
  
  result.success = result.fans_count ? result.fans_count > 200 : false;
  return result;
}

function processTikTokData(data: any[], result: any): any {
  if (!Array.isArray(data) || data.length === 0) return result;
  
  const item = data[0];
  if (item.authorMeta && item.authorMeta.name) {
    result.url = `https://www.tiktok.com/@${item.authorMeta.name}`;
  }
  
  if (item.authorMeta && item.authorMeta.fans !== undefined) {
    result.fans_count = item.authorMeta.fans;
  }
  
  result.success = result.fans_count ? result.fans_count > 200 : false;
  return result;
}

function processTwitterData(data: any[], result: any): any {
  if (!Array.isArray(data) || data.length === 0) return result;
  
  const item = data[0];
  if (item.author && item.author.userName) {
    result.url = `https://twitter.com/${item.author.userName}`;
  }
  
  if (item.author && item.author.followers !== undefined) {
    result.fans_count = item.author.followers;
  }
  
  result.success = result.fans_count ? result.fans_count > 200 : false;
  return result;
}

function processLinkedInData(data: any[], result: any): any {
  if (!Array.isArray(data) || data.length === 0) return result;
  
  const item = data[0];
  // LinkedIn URLs通常已包含在数据中
  if (item.profileUrl) {
    result.url = item.profileUrl;
  } else if (item.linkedin_url) {
    result.url = item.linkedin_url;
  } else if (item.basic_info && item.basic_info.linkedin_url) {
    result.url = item.basic_info.linkedin_url;
  }
  
  // 处理不同格式的LinkedIn粉丝数据
  if (item.stats && item.stats.follower_count !== undefined) {
    result.fans_count = item.stats.follower_count;
  } else if (item.stats && item.stats.employee_count !== undefined) {
    // 如果没有粉丝数，使用员工数作为替代
    result.fans_count = item.stats.employee_count;
  } else if (item.basic_info && item.basic_info.follower_count !== undefined) {
    result.fans_count = item.basic_info.follower_count;
  }
  
  result.success = result.fans_count ? result.fans_count > 200 : false;
  return result;
}

// 提取YouTube URL
function extractYouTubeUrl(item: any): string {
  if (item.channelUrl) return item.channelUrl;
  if (item.channel && item.channel.url) return item.channel.url;
  if (item.authorUrl) return item.authorUrl;
  
  // 如果以上都不存在，尝试根据频道ID构造URL
  if (item.channelId) return `https://www.youtube.com/channel/${item.channelId}`;
  if (item.channel && item.channel.id) return `https://www.youtube.com/channel/${item.channel.id}`;
  
  return '';
}
