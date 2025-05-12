import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// 设置最后一次webhook到达后的等待时间（毫秒）
const WAIT_TIME_AFTER_LAST_WEBHOOK = 2 * 60 * 1000; // 2分钟
// 设置绝对最大等待时间（毫秒）
const MAX_TOTAL_WAIT_TIME = 3 * 60 * 1000; // 3分钟

export async function POST(request: NextRequest) {
  console.log('[check-scraping-status] 开始处理请求');
  
  try {
    // 解析请求体
    const { searchId } = await request.json();
    console.log(`[check-scraping-status] 收到searchId: ${searchId}`);
    
    // 验证请求
    if (!searchId) {
      console.log('[check-scraping-status] 缺少searchId参数');
      return NextResponse.json(
        { success: false, message: 'Search ID is required' },
        { status: 400 }
      );
    }
    
    // 1. 检查当前搜索的状态
    console.log(`[check-scraping-status] 从数据库获取搜索状态，id=${searchId}`);
    const { data: searchData, error: searchError } = await supabase
      .from('searches')
      .select('status, updated_at')
      .eq('id', searchId)
      .single();
      
    if (searchError) {
      console.error('[check-scraping-status] 获取搜索状态失败:', searchError);
      return NextResponse.json(
        { success: false, message: 'Failed to get search status', error: searchError },
        { status: 500 }
      );
    }
    
    console.log(`[check-scraping-status] 当前搜索状态: ${searchData.status}, 最后更新: ${searchData.updated_at}`);
    
    // 如果搜索状态不是scraping，返回当前状态
    if (searchData.status !== 'scraping') {
      console.log(`[check-scraping-status] 搜索状态不是scraping，直接返回: ${searchData.status}`);
      return NextResponse.json({
        success: true,
        isCompleted: searchData.status !== 'failed',
        status: searchData.status
      });
    }
    
    // 检查从开始scraping到现在已经过了多长时间
    const now = new Date();
    const searchStartTime = new Date(searchData.updated_at);
    const totalElapsedTime = now.getTime() - searchStartTime.getTime();
    console.log(`[check-scraping-status] 从开始爬取到现在已过: ${Math.round(totalElapsedTime/1000)}秒`);
    
    // 检查是否已超过最大等待时间
    const hasExceededMaxWaitTime = totalElapsedTime > MAX_TOTAL_WAIT_TIME;
    
    if (hasExceededMaxWaitTime) {
      console.log(`[check-scraping-status] 已超过最大等待时间(${MAX_TOTAL_WAIT_TIME/1000}秒)，强制进入下一阶段`);
    }
    
    // 2. 获取所有相关的竞争对手数据
    console.log(`[check-scraping-status] 获取竞争对手数据，searchId=${searchId}`);
    const { data: items, error: itemsError } = await supabase
      .from('simple_search_history')
      .select('*')
      .eq('search_id', searchId);
      
    if (itemsError) {
      console.error('[check-scraping-status] 获取竞争对手数据失败:', itemsError);
      return NextResponse.json(
        { success: false, message: 'Failed to get competitor data', error: itemsError },
        { status: 500 }
      );
    }
    
    // 如果没有数据，可能还在初始阶段
    if (!items || items.length === 0) {
      // 如果已超时，仍然强制进入下一阶段
      if (hasExceededMaxWaitTime) {
        const newStatus = 'user_action_needed';
        console.log(`[check-scraping-status] 超时但没有任何数据，更新状态为: ${newStatus}`);
        
        await supabase
          .from('searches')
          .update({ status: newStatus })
          .eq('id', searchId);
          
        return NextResponse.json({
          success: true,
          isCompleted: true,
          status: newStatus,
          diagnosis: `已等待${Math.round(totalElapsedTime/1000)}秒，但未收到任何数据，需要手动处理`,
          stats: {
            total: 0,
            withData: 0,
            withValidData: 0,
            isStillReceivingWebhooks: false,
            lastUpdateTimeDiff: null,
            totalElapsedTime: Math.round(totalElapsedTime/1000)
          }
        });
      }
      
      console.log('[check-scraping-status] 没有找到竞争对手数据，可能还在初始阶段');
      return NextResponse.json({
        success: true,
        isCompleted: false,
        status: 'scraping',
        diagnosis: `已等待${Math.round(totalElapsedTime/1000)}秒，还未收到任何数据`,
        stats: {
          totalElapsedTime: Math.round(totalElapsedTime/1000)
        }
      });
    }
    
    console.log(`[check-scraping-status] 成功获取${items.length}条竞争对手数据`);
    
    // 3. 计算有多少项有fans_count，多少项没有
    const totalItems = items.length;
    const itemsWithData = items.filter(item => 
      item.fans_count !== null && 
      item.fans_count !== undefined
    );
    const itemsWithValidData = itemsWithData.filter(item => 
      item.fans_count > 200
    );
    
    console.log(`[check-scraping-status] 数据统计: 总计=${totalItems}, 有数据=${itemsWithData.length}, 有效数据=${itemsWithValidData.length}`);
    
    // 记录所有项目的状态，方便调试
    items.forEach((item, index) => {
      console.log(`[check-scraping-status] 项目 #${index+1}: ${item.competitor_name} / ${item.platform} => fans_count=${item.fans_count}, actorRunId=${item.actorRunId?.slice(0, 8)}..., defaultDatasetId=${item.defaultDatasetId?.slice(0, 8) || 'null'}`);
    });
    
    // 4. 检查是否有最近更新的webhook数据
    const lastUpdatedItem = items.reduce((latest, item) => {
      if (!item.updated_at) return latest;
      const itemDate = new Date(item.updated_at);
      return !latest || itemDate > new Date(latest.updated_at) ? item : latest;
    }, null);
    
    // 如果最后更新时间在2分钟内，认为可能还有更多webhook正在处理
    let isStillReceivingWebhooks = false;
    let lastUpdateTimeDiff = null;
    if (lastUpdatedItem && lastUpdatedItem.updated_at) {
      const lastUpdateTime = new Date(lastUpdatedItem.updated_at);
      lastUpdateTimeDiff = now.getTime() - lastUpdateTime.getTime();
      isStillReceivingWebhooks = lastUpdateTimeDiff < WAIT_TIME_AFTER_LAST_WEBHOOK && !hasExceededMaxWaitTime;
      
      console.log(`[check-scraping-status] 最后更新时间: ${lastUpdateTime.toISOString()}, 距现在: ${Math.round(lastUpdateTimeDiff/1000)}秒, 是否仍在接收webhook: ${isStillReceivingWebhooks}`);
    } else {
      console.log('[check-scraping-status] 找不到最后更新时间');
    }
    
    // 5. 决定是否完成以及后续状态
    let isCompleted = false;
    let newStatus = 'scraping';
    
    // 如果满足以下任一条件，认为scraping完成：
    // 1. 所有items都有数据
    // 2. 或者最后一次webhook超过2分钟，且至少有一些数据
    // 3. 或者总时间已经超过最大等待时间
    if (itemsWithData.length === totalItems || 
        (!isStillReceivingWebhooks && itemsWithData.length > 0) ||
        hasExceededMaxWaitTime) {
      
      isCompleted = true;
      
      // 检查是否有无效数据（fans_count <= 200）
      if (itemsWithValidData.length < totalItems) {
        // 有无效数据，需要用户处理
        newStatus = 'user_action_needed';
        console.log('[check-scraping-status] 有无效数据需要用户处理，更新状态为: user_action_needed');
      } else {
        // 所有数据都有效，可以直接进入generating阶段
        newStatus = 'ready_for_generating';
        console.log('[check-scraping-status] 所有数据有效，更新状态为: ready_for_generating');
      }
      
      // 更新搜索状态
      console.log(`[check-scraping-status] 更新数据库搜索状态：${searchData.status} -> ${newStatus}`);
      const { error: updateError } = await supabase
        .from('searches')
        .update({ status: newStatus })
        .eq('id', searchId);
        
      if (updateError) {
        console.error('[check-scraping-status] 更新搜索状态失败:', updateError);
      } else {
        console.log('[check-scraping-status] 数据库状态更新成功');
      }
    } else {
      console.log('[check-scraping-status] 爬取仍在进行中，不更新状态');
    }
    
    // 生成详细的诊断信息
    const timeoutMsg = hasExceededMaxWaitTime ? `(已超时${Math.round(totalElapsedTime/1000)}秒)` : '';
    
    const diagnosis = isCompleted 
      ? `爬取完成${timeoutMsg}，${itemsWithValidData.length}/${totalItems}数据有效` 
      : isStillReceivingWebhooks 
        ? `仍在接收webhook，最后更新${Math.round((lastUpdateTimeDiff || 0)/1000)}秒前，总耗时${Math.round(totalElapsedTime/1000)}秒` 
        : `等待webhook数据，目前只有${itemsWithData.length}/${totalItems}项有数据，总耗时${Math.round(totalElapsedTime/1000)}秒`;
        
    // 6. 返回结果
    console.log(`[check-scraping-status] 返回结果：完成=${isCompleted}, 状态=${newStatus}, 诊断=${diagnosis}`);
    return NextResponse.json({
      success: true,
      isCompleted,
      status: newStatus,
      diagnosis,
      stats: {
        total: totalItems,
        withData: itemsWithData.length,
        withValidData: itemsWithValidData.length,
        isStillReceivingWebhooks,
        lastUpdateTimeDiff: lastUpdateTimeDiff ? Math.round(lastUpdateTimeDiff/1000) : null,
        totalElapsedTime: Math.round(totalElapsedTime/1000),
        hasExceededMaxWaitTime
      }
    });
    
  } catch (error: any) {
    console.error('[check-scraping-status] 错误:', error);
    return NextResponse.json(
      { success: false, message: '内部服务器错误', error: error.message },
      { status: 500 }
    );
  }
} 