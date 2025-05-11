import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// 定义数据结构类型
interface ChannelInfo {
  aboutChannelInfo?: {
    numberOfSubscribers?: number;
  };
  [key: string]: any;
}

export async function POST(request: NextRequest) {
  try {
    console.log('========== YOUTUBE WEBHOOK STARTED ==========');
    
    // 解析 webhook 请求体
    const payload = await request.json();
    
    console.log('Received YouTube webhook payload:', JSON.stringify(payload, null, 2));
    
    // 验证这是一个成功完成的任务通知
    if (payload.eventType !== 'ACTOR.RUN.SUCCEEDED') {
      console.log(`Ignoring event type: ${payload.eventType}`);
      return NextResponse.json(
        { success: false, message: 'Not a success event' },
        { status: 200 } // 仍然返回 200 以免 Apify 重试
      );
    }
    
    // 提取必要的信息
    const { actorRunId } = payload.eventData;
    const { defaultDatasetId } = payload.resource;
    
    console.log(`Processing webhook: actorRunId=${actorRunId}, defaultDatasetId=${defaultDatasetId}`);
    
    // 验证必要的字段存在
    if (!actorRunId || !defaultDatasetId) {
      console.error('Missing required fields in webhook payload');
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // 通过 Apify API 获取数据集内容
    console.log(`Fetching dataset from Apify: ${defaultDatasetId}`);
    const datasetUrl = `https://api.apify.com/v2/datasets/${defaultDatasetId}/items`;
    const datasetResponse = await fetch(datasetUrl);
    
    if (!datasetResponse.ok) {
      console.error(`Failed to fetch dataset: ${datasetResponse.status} - ${datasetResponse.statusText}`);
      return NextResponse.json(
        { success: false, message: 'Failed to fetch dataset' },
        { status: 200 }
      );
    }
    
    console.log('Dataset fetch successful, status:', datasetResponse.status);
    const datasetData = await datasetResponse.json() as ChannelInfo[];
    console.log('Dataset data received, length:', datasetData.length);
    
    if (!datasetData || datasetData.length === 0) {
      console.error('Empty dataset received');
      return NextResponse.json(
        { success: false, message: 'Empty dataset received' },
        { status: 200 }
      );
    }
    
    // 提取粉丝数
    let fansCount = null;
    const channelInfo = datasetData.find((item: ChannelInfo) => 
      item.aboutChannelInfo && item.aboutChannelInfo.numberOfSubscribers
    );
    
    if (channelInfo && channelInfo.aboutChannelInfo) {
      fansCount = channelInfo.aboutChannelInfo.numberOfSubscribers;
      console.log(`Found fans count: ${fansCount}`);
    } else {
      console.log('Could not find aboutChannelInfo.numberOfSubscribers in dataset');
    }
    
    // 将完整数据集保存为JSON字符串
    const datasetJson = JSON.stringify(datasetData);
    
    // 通过actorRunId查找记录
    console.log(`Looking for record with actorRunId: ${actorRunId}`);
    const { data: records, error: searchError } = await supabase
      .from('simple_search_history')
      .select('*')
      .eq('actorRunId', actorRunId);
    
    if (searchError) {
      console.error('Error searching database:', searchError);
      return NextResponse.json(
        { success: false, message: 'Error searching database', error: searchError },
        { status: 200 }
      );
    }
    
    if (!records || records.length === 0) {
      console.error(`No records found with actorRunId: ${actorRunId}`);
      return NextResponse.json(
        { success: false, message: 'No matching records found', actorRunId },
        { status: 200 }
      );
    }
    
    // 更新找到的记录
    const recordToUpdate = records[0];
    console.log(`Updating record: id=${recordToUpdate.id}, competitor_name=${recordToUpdate.competitor_name}`);
    
    const { error: updateError } = await supabase
      .from('simple_search_history')
      .update({
        defaultDatasetId: defaultDatasetId,
        fans_count: fansCount,
        dataset: datasetJson,
        updated_at: new Date().toISOString()
      })
      .eq('id', recordToUpdate.id);
    
    if (updateError) {
      console.error('Error updating database:', updateError);
      return NextResponse.json(
        { success: false, message: 'Error updating database', error: updateError },
        { status: 200 }
      );
    }
    
    console.log(`Database update successful for id=${recordToUpdate.id}, fans_count=${fansCount}`);
    
    // 验证更新是否成功
    const { data: verifyData, error: verifyError } = await supabase
      .from('simple_search_history')
      .select('id, fans_count, url, actorRunId')
      .eq('id', recordToUpdate.id)
      .single();
      
    if (verifyError) {
      console.error('Error verifying update:', verifyError);
    } else {
      console.log('Verification after update:', JSON.stringify(verifyData));
    }
    
    // 返回处理结果
    console.log(`Webhook processing complete: fansCount=${fansCount}, actorRunId=${actorRunId}`);
    console.log('========== YOUTUBE WEBHOOK COMPLETED ==========');
    return NextResponse.json({
      success: true,
      message: 'YouTube data processed successfully',
      recordId: recordToUpdate.id,
      fansCount,
      actorRunId
    });
    
  } catch (error: any) {
    console.error('Error processing YouTube webhook:', error);
    console.log('========== YOUTUBE WEBHOOK FAILED ==========');
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: error.message },
      { status: 200 } // 修改为 200，而不是 500，以防止 Apify 重试
    );
  }
}
