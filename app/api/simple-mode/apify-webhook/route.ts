import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Apify API Token
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || '';

// 用于存储已处理的actorRunId，避免重复处理
const processedRunIds = new Set<string>();

export async function POST(request: NextRequest) {
  console.log('[apify-webhook] 开始处理 Apify Webhook 回调');
  
  let webhookData;
  let actorRunId;
  
  try {
    // 解析请求体
    webhookData = await request.json();
    console.log(`[apify-webhook] 收到 webhook 数据:`, JSON.stringify(webhookData));
    
    // 从标准 Apify webhook 格式中提取所需字段
    const eventType = webhookData.eventType;
    actorRunId = webhookData.eventData?.actorRunId || webhookData.resource?.id;
    
    if (!eventType || !actorRunId) {
      console.error('[apify-webhook] 缺少 eventType 或 actorRunId');
      // 返回200状态码但在内容中包含错误信息
      return NextResponse.json({ 
        success: false, 
        message: '缺少 eventType 或 actorRunId' 
      }, { status: 200 });
    }
    
    console.log(`[apify-webhook] 事件类型: ${eventType}, 运行ID: ${actorRunId}`);
    
    // 只处理成功事件
    if (eventType !== 'ACTOR.RUN.SUCCEEDED') {
      console.log(`[apify-webhook] 非成功事件，忽略处理: ${eventType}`);
      return NextResponse.json({ success: true, action: 'ignored' }, { status: 200 });
    }
    
    // 检查是否已经处理过这个actorRunId
    if (processedRunIds.has(actorRunId)) {
      console.log(`[apify-webhook] 重复的actorRunId=${actorRunId}，跳过处理`);
      return NextResponse.json({ 
        success: true, 
        message: `actorRunId=${actorRunId}已被处理，跳过`,
        action: 'skipped_duplicate'
      }, { status: 200 });
    }
    
    // 添加到已处理集合
    processedRunIds.add(actorRunId);
    
    // 异步处理数据，不阻塞响应
    processWebhookDataAsync(webhookData, actorRunId);
    
    // 立即返回成功响应
    return NextResponse.json({
      success: true,
      actorRunId,
      message: '请求已接收，正在异步处理数据',
      action: 'async_processing'
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('[apify-webhook] 处理webhook出错:', error);
    return NextResponse.json(
      { success: false, message: '内部服务器错误', error: error.message },
      { status: 200 } // 返回200状态码
    );
  }
}

// 异步处理webhook数据的函数
async function processWebhookDataAsync(webhookData: any, actorRunId: string) {
  try {
    console.log(`[apify-webhook] 异步处理 webhook 数据: ${JSON.stringify(webhookData)}`);
    console.log(`[apify-webhook] 事件类型: ${webhookData.eventType}, 运行ID: ${actorRunId}`);
    
    const defaultDatasetId = webhookData.resource?.defaultDatasetId;
    
    if (!defaultDatasetId) {
      console.error('[apify-webhook] webhook数据中找不到defaultDatasetId');
      return;
    }
    
    // 查找具有该 actorRunId 的记录
    console.log(`[apify-webhook] 通过 actorRunId=${actorRunId} 查找数据库记录`);
    
    // 重试逻辑：重试间隔2秒，最大等待时间20秒
    let record;
    const maxWaitTime = 20000; // 20秒
    const retryInterval = 2000; // 2秒
    const maxRetries = Math.floor(maxWaitTime / retryInterval); // 10次重试
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        console.log(`[apify-webhook] 开始数据库查询 (尝试 ${retryCount + 1}/${maxRetries + 1}): actorRunId=${actorRunId}`);
        
        const { data: recordData, error: findError } = await supabase
          .from('simple_search_history')
          .select('*')
          .eq('actorRunId', actorRunId)
          .maybeSingle();
        
        console.log(`[apify-webhook] 数据库查询完成 (尝试 ${retryCount + 1}/${maxRetries + 1})`);
        
        if (findError) {
          console.error(`[apify-webhook] 数据库查询错误 (尝试 ${retryCount + 1}/${maxRetries + 1}):`, {
            error: findError,
            code: findError.code,
            message: findError.message,
            details: findError.details,
            hint: findError.hint,
            actorRunId: actorRunId
          });
          
          if (retryCount === maxRetries) {
            // 最后一次尝试也失败了
            console.error(`[apify-webhook] 数据库查询在所有重试后仍然失败，放弃处理`);
            return;
          }
        } else if (recordData) {
          // 找到记录，退出重试循环
          console.log(`[apify-webhook] 成功找到记录 (尝试 ${retryCount + 1}/${maxRetries + 1}): id=${recordData.id}, competitor=${recordData.competitor_name}, platform=${recordData.platform}`);
          record = recordData;
          break;
        } else {
          // 记录不存在，记录重试信息
          console.log(`[apify-webhook] 未找到 actorRunId=${actorRunId} 的记录 (尝试 ${retryCount + 1}/${maxRetries + 1})`);
          
          if (retryCount === maxRetries) {
            // 达到最大重试次数，记录错误并放弃
            console.error(`[apify-webhook] 重试超时：在 ${maxWaitTime/1000} 秒内未找到 actorRunId=${actorRunId} 的记录，共重试 ${maxRetries + 1} 次，放弃处理`);
            return;
          }
        }
      } catch (unexpectedError) {
        // 捕获数据库查询过程中的任何意外错误
        console.error(`[apify-webhook] 数据库查询发生意外错误 (尝试 ${retryCount + 1}/${maxRetries + 1}):`, {
          error: unexpectedError,
          errorType: typeof unexpectedError,
          errorName: unexpectedError instanceof Error ? unexpectedError.name : 'Unknown',
          errorMessage: unexpectedError instanceof Error ? unexpectedError.message : String(unexpectedError),
          errorStack: unexpectedError instanceof Error ? unexpectedError.stack : undefined,
          actorRunId: actorRunId
        });
        
        if (retryCount === maxRetries) {
          // 最后一次尝试也失败了
          console.error(`[apify-webhook] 数据库查询在所有重试后仍然发生意外错误，放弃处理`);
          return;
        }
      }
      
      retryCount++;
      
      // 等待重试间隔（除非这是最后一次尝试）
      if (retryCount <= maxRetries) {
        console.log(`[apify-webhook] 等待 ${retryInterval/1000} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      }
    }
    
    if (!record) {
      console.error(`[apify-webhook] 重试逻辑结束但仍未找到记录，这不应该发生`);
      return;
    }
    
    const { id, competitor_name: name, platform, url, search_id: searchId } = record;
    
    console.log(`[apify-webhook] 找到匹配记录: id=${id}, competitor=${name}, platform=${platform}, searchId=${searchId}`);
    
    // 检查是否已有完整数据
    if (record.defaultDatasetId && record.fans_count && record.dataset) {
      console.log(`[apify-webhook] 记录已有完整数据: defaultDatasetId=${record.defaultDatasetId}, fans_count=${record.fans_count}，跳过处理`);
      return;
    }
    
    console.log(`[apify-webhook] 数据集ID: ${defaultDatasetId}`);
    
    // 先更新数据库中的 defaultDatasetId（即使fans_count还未获取）
    if (!record.defaultDatasetId) {
      console.log(`[apify-webhook] 更新数据库记录的defaultDatasetId: ${defaultDatasetId}`);
      const { error: updateDatasetIdError } = await supabase
        .from('simple_search_history')
        .update({
          defaultDatasetId: defaultDatasetId,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
        
      if (updateDatasetIdError) {
        console.error('[apify-webhook] 更新defaultDatasetId失败:', updateDatasetIdError);
      }
    }
    
    // 获取数据集内容
    let items = [];
    let fans_count = null;
    const datasetUrl = `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_API_TOKEN}`;
    console.log(`[apify-webhook] 获取数据集: ${datasetUrl}`);
    
    try {
      console.log(`[apify-webhook] 开始请求Apify数据集...`);
      const response = await fetch(datasetUrl);
      console.log(`[apify-webhook] Apify响应状态: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[apify-webhook] Apify API错误响应: ${errorText}`);
        throw new Error(`获取数据失败: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      items = await response.json();
      console.log(`[apify-webhook] 获取到${items.length}条数据项`);
      console.log(`[apify-webhook] 第一条数据样本:`, items.length > 0 ? JSON.stringify(items[0]).substring(0, 500) : '无数据');
      
      // 将完整数据集保存为JSON字符串
      const datasetJson = JSON.stringify(items);
      console.log(`[apify-webhook] 处理平台: ${platform}`);
      
      if (platform === 'tiktok') {
        // 处理TikTok平台数据  
        if (items.length > 0) {
          // 从第一项数据中提取fans数量
          const firstItem = items[0];
          
          if (firstItem.authorMeta && firstItem.authorMeta.fans !== undefined) {
            fans_count = firstItem.authorMeta.fans;
            console.log(`[apify-webhook] 提取到TikTok粉丝数: ${fans_count}`);
          } else {
            console.warn('[apify-webhook] 未在TikTok数据中找到fans数量');
            console.log('[apify-webhook] TikTok数据内容:', JSON.stringify(firstItem).substring(0, 1000));
          }
        } else {
          console.warn('[apify-webhook] TikTok数据集为空');
        }
      } else if (platform === 'instagram') {
        console.log(`[apify-webhook] 处理Instagram平台数据，数据项数量: ${items.length}`);
        // 处理Instagram平台数据
        if (items.length > 0) {
          // 从数据中提取followers数量
          console.log('[apify-webhook] Instagram数据样本:', JSON.stringify(items[0]).substring(0, 1000));
          
          const firstItem = items[0];
          if (firstItem.followersCount !== undefined) {
            fans_count = firstItem.followersCount;
            console.log(`[apify-webhook] 提取到Instagram粉丝数: ${fans_count}`);
          } else {
            console.warn('[apify-webhook] 未在Instagram数据中找到followersCount字段');
            console.log('[apify-webhook] Instagram数据可用字段:', Object.keys(firstItem));
          }
        } else {
          console.warn('[apify-webhook] Instagram数据集为空');
        }
      } else if (platform === 'linkedin') {
        console.log(`[apify-webhook] 处理LinkedIn平台数据，数据项数量: ${items.length}`);
        // 处理LinkedIn平台数据
        if (items.length > 0) {
          // 从数据中提取follower_count数量
          console.log('[apify-webhook] LinkedIn数据样本:', JSON.stringify(items[0]).substring(0, 1000));
          
          const firstItem = items[0];
          if (firstItem.stats && firstItem.stats.follower_count !== undefined) {
            fans_count = firstItem.stats.follower_count;
            console.log(`[apify-webhook] 提取到LinkedIn粉丝数: ${fans_count}`);
          } else {
            console.warn('[apify-webhook] 未在LinkedIn数据中找到stats.follower_count字段');
            console.log('[apify-webhook] LinkedIn数据可用字段:', Object.keys(firstItem));
          }
        } else {
          console.warn('[apify-webhook] LinkedIn数据集为空');
        }
      } else if (platform === 'twitter') {
        console.log(`[apify-webhook] 处理Twitter平台数据，数据项数量: ${items.length}`);
        // 处理Twitter平台数据
        if (items.length > 0) {
          // 从数据中提取followers数量
          console.log('[apify-webhook] Twitter数据样本:', JSON.stringify(items[0]).substring(0, 1000));
          
          const firstItem = items[0];
          if (firstItem.author && firstItem.author.followers !== undefined) {
            fans_count = firstItem.author.followers;
            console.log(`[apify-webhook] 提取到Twitter粉丝数: ${fans_count}`);
          } else {
            console.warn('[apify-webhook] 未在Twitter数据中找到author.followers字段');
            console.log('[apify-webhook] Twitter数据可用字段:', Object.keys(firstItem));
            if (firstItem.author) {
              console.log('[apify-webhook] Twitter author字段:', Object.keys(firstItem.author));
            }
          }
        } else {
          console.warn('[apify-webhook] Twitter数据集为空');
        }
      } else if (platform === 'youtube') {
        console.log(`[apify-webhook] 处理YouTube平台数据，数据项数量: ${items.length}`);
        // 处理YouTube平台数据
        if (items.length > 0) {
          // 从数据中提取subscribers数量
          console.log('[apify-webhook] YouTube数据样本:', JSON.stringify(items[0]).substring(0, 1000));
          
          // 处理不同格式的YouTube数据
          let subscriberCount = null;
          const firstItem = items[0];
          
          // 查找不同可能的字段路径
          if (firstItem.aboutChannelInfo && firstItem.aboutChannelInfo.numberOfSubscribers !== undefined) {
            const subCount = firstItem.aboutChannelInfo.numberOfSubscribers;
            console.log(`[apify-webhook] 从aboutChannelInfo.numberOfSubscribers找到数据: ${subCount}`);
            
            // 可能是格式化的字符串，如 "120,000"
            if (typeof subCount === 'string') {
              subscriberCount = parseInt(subCount.replace(/,/g, ''));
            } else {
              subscriberCount = subCount;
            }
          } else if (firstItem.subscriberCount !== undefined) {
            console.log(`[apify-webhook] 从subscriberCount找到数据: ${firstItem.subscriberCount}`);
            subscriberCount = firstItem.subscriberCount;
          } else if (firstItem.channel && firstItem.channel.subscriberCount !== undefined) {
            console.log(`[apify-webhook] 从channel.subscriberCount找到数据: ${firstItem.channel.subscriberCount}`);
            subscriberCount = firstItem.channel.subscriberCount;
          } else if (firstItem.numberOfSubscribers !== undefined) {
            console.log(`[apify-webhook] 从numberOfSubscribers找到数据: ${firstItem.numberOfSubscribers}`);
            subscriberCount = firstItem.numberOfSubscribers;
          }
          
          if (subscriberCount !== null) {
            fans_count = subscriberCount;
            console.log(`[apify-webhook] 提取到YouTube订阅者数: ${fans_count}`);
          } else {
            console.warn('[apify-webhook] 未在YouTube数据中找到subscribers数量');
            console.log('[apify-webhook] YouTube数据可用字段:', Object.keys(firstItem));
          }
        } else {
          console.warn('[apify-webhook] YouTube数据集为空');
        }
      } else {
        console.log(`[apify-webhook] 暂不支持处理${platform}平台数据`);
      }
      
      // 更新数据库记录
      console.log(`[apify-webhook] 准备更新数据库记录: id=${id}, dataset=${datasetJson.length} bytes, fans_count=${fans_count}`);
      
      const { error: updateError } = await supabase
        .from('simple_search_history')
        .update({
          defaultDatasetId: defaultDatasetId,
          fans_count: fans_count,
          dataset: datasetJson,  // 保存完整数据集
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
        
      if (updateError) {
        console.error('[apify-webhook] 更新数据库失败:', updateError);
        console.error('[apify-webhook] 更新数据库失败详情:', JSON.stringify(updateError));
        return;
      }
      
      console.log(`[apify-webhook] 成功更新数据库记录 - fans_count: ${fans_count}`);
      
    } catch (error: any) {
      console.error('[apify-webhook] 处理数据集出错:', error);
      console.error('[apify-webhook] 错误堆栈:', error.stack);
    }
    
    // 输出成功处理的信息
    console.log(`[apify-webhook] 成功处理webhook: platform=${platform}, fans_count=${fans_count}, 数据项数量=${items.length}`);
    
  } catch (error: any) {
    console.error('[apify-webhook] 异步处理webhook出错:', error);
  }
} 