import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Apify API Token
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || '';

export async function POST(request: NextRequest) {
  console.log('[apify-webhook] 开始处理 Apify Webhook 回调');
  
  try {
    // 解析请求体
    const webhookData = await request.json();
    console.log(`[apify-webhook] 收到 webhook 数据:`, JSON.stringify(webhookData));
    
    // 从标准 Apify webhook 格式中提取所需字段
    const eventType = webhookData.eventType;
    const actorRunId = webhookData.eventData?.actorRunId || webhookData.resource?.id;
    const defaultDatasetId = webhookData.resource?.defaultDatasetId;
    
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
    
    // 查找具有该 actorRunId 的记录
    console.log(`[apify-webhook] 通过 actorRunId=${actorRunId} 查找数据库记录`);
    
    // 查找相关数据库记录
    let record;
    const { data: recordData, error: findError } = await supabase
      .from('simple_search_history')
      .select('*')
      .eq('actorRunId', actorRunId)
      .maybeSingle();
    
    if (findError) {
      console.error('[apify-webhook] 查找记录失败:', findError);
      return NextResponse.json({ 
        success: false, 
        message: '查找记录失败', 
        error: findError 
      }, { status: 200 }); // 返回200状态码
    }
    
    if (!recordData) {
      console.log(`[apify-webhook] 未找到 actorRunId=${actorRunId} 的记录`);
      return NextResponse.json({ 
        success: false, 
        message: `未找到 actorRunId=${actorRunId} 的记录`, 
      }, { status: 200 }); // 返回200状态码
    }
    
    record = recordData;
    const { id, competitor_name: name, platform, url, search_id: searchId } = record;
    
    console.log(`[apify-webhook] 找到匹配记录: id=${id}, competitor=${name}, platform=${platform}, searchId=${searchId}`);
    
    // 检查是否已有完整数据
    if (record.defaultDatasetId && record.fans_count && record.dataset) {
      console.log(`[apify-webhook] 记录已有完整数据: defaultDatasetId=${record.defaultDatasetId}, fans_count=${record.fans_count}，跳过处理`);
      return NextResponse.json({ 
        success: true, 
        action: 'already_processed',
        fans_count: record.fans_count
      }, { status: 200 });
    }
    
    if (!defaultDatasetId) {
      console.error('[apify-webhook] webhook数据中找不到defaultDatasetId');
      return NextResponse.json({ 
        success: false, 
        message: 'webhook数据中找不到defaultDatasetId'
      }, { status: 200 }); // 返回200状态码
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
      const response = await fetch(datasetUrl);
      if (!response.ok) {
        throw new Error(`获取数据失败: ${response.status} ${response.statusText}`);
      }
      
      items = await response.json();
      console.log(`[apify-webhook] 获取到${items.length}条数据项`);
      
      // 将完整数据集保存为JSON字符串
      const datasetJson = JSON.stringify(items);
      
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
          }
        } else {
          console.warn('[apify-webhook] Instagram数据集为空');
        }
      } else if (platform === 'linkedin') {
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
          }
        } else {
          console.warn('[apify-webhook] LinkedIn数据集为空');
        }
      } else if (platform === 'twitter') {
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
          }
        } else {
          console.warn('[apify-webhook] Twitter数据集为空');
        }
      } else if (platform === 'youtube') {
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
          }
        } else {
          console.warn('[apify-webhook] YouTube数据集为空');
        }
      } else {
        console.log(`[apify-webhook] 暂不支持处理${platform}平台数据`);
      }
      
      // 更新数据库记录
      console.log(`[apify-webhook] 更新数据库记录: id=${id}, dataset=${datasetJson.length} bytes, fans_count=${fans_count}`);
      
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
        return NextResponse.json({ 
          success: false, 
          message: '更新数据库失败', 
          error: updateError 
        }, { status: 200 }); // 返回200状态码
      }
      
      console.log(`[apify-webhook] 成功更新数据库记录`);
      
    } catch (error: any) {
      console.error('[apify-webhook] 处理数据集出错:', error);
      return NextResponse.json({
        success: false,
        message: '处理数据集出错',
        error: error.message
      }, { status: 200 }); // 返回200状态码
    }
    
    // 返回成功结果
    console.log(`[apify-webhook] 成功处理webhook: platform=${platform}, fans_count=${fans_count}, 数据项数量=${items.length}`);
    return NextResponse.json({
      success: true,
      platform,
      fans_count,
      datasetId: defaultDatasetId,
      recordId: id,
      itemCount: items.length,
      action: 'updated'
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('[apify-webhook] 处理webhook出错:', error);
    return NextResponse.json(
      { success: false, message: '内部服务器错误', error: error.message },
      { status: 200 } // 返回200状态码
    );
  }
} 