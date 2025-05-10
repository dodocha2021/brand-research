import { NextRequest, NextResponse } from 'next/server'
import { ApifyClient } from 'apify-client'
import { supabase } from '@/lib/supabase'

const APIFY_TOKEN = process.env.APIFY_TOKEN || process.env.APIFY_API_KEY

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  console.log("--------- INSTAGRAM WEBHOOK START ---------");
  console.log("Instagram Webhook 调用开始, 请求 URL:", req.url);
  
  // 记录请求头，检查是否有问题
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });
  console.log("请求头:", JSON.stringify(headers));
  
  let payload;
  try {
    const text = await req.text();
    console.log("请求体原始文本:", text);
    
    try {
      payload = JSON.parse(text);
      console.log("Instagram Webhook 收到的 payload:", JSON.stringify(payload));
    } catch (parseErr) {
      console.error("JSON 解析错误:", parseErr);
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }
  } catch (err) {
    console.error("读取请求体错误:", err);
    return NextResponse.json({ ok: false, error: "Failed to read request body" }, { status: 400 });
  }

  if (!payload) {
    console.error("Payload 为空");
    return NextResponse.json({ ok: false, error: "Empty payload" }, { status: 400 });
  }

  const {
    eventType,
    runId,
    outputKeyValueStoreId,
    searchId,
  } = payload;

  console.log("解析后的字段:", { eventType, runId, outputKeyValueStoreId, searchId });

  if (eventType !== 'ACTOR.RUN.SUCCEEDED' || !runId || !outputKeyValueStoreId || !searchId) {
    console.warn("Instagram Webhook 无效的事件或缺少字段:", { eventType, runId, outputKeyValueStoreId, searchId });
    return NextResponse.json({ ok: false, error: "Invalid event or missing fields" });
  }

  // 读取 OUTPUT.json
  console.log(`Instagram Webhook 开始读取 OUTPUT，runId: ${runId}, keyValueStoreId: ${outputKeyValueStoreId}`);
  
  if (!APIFY_TOKEN) {
    console.error("APIFY_TOKEN 未配置");
    return NextResponse.json({ ok: false, error: "Apify token not configured" }, { status: 500 });
  }
  
  try {
    const client = new ApifyClient({ token: APIFY_TOKEN });
    console.log("ApifyClient 已创建");
    
    const kv = client.keyValueStore(outputKeyValueStoreId);
    console.log("KeyValueStore 客户端已创建");
    
    const record = await kv.getRecord('OUTPUT');
    console.log("OUTPUT 读取结果:", record ? "成功" : "失败");
    
    if (!record?.value) {
      console.warn(`Instagram Webhook: run ${runId} 没有找到 OUTPUT`);
      return NextResponse.json({ ok: false, error: "Missing OUTPUT" });
    }
    
    console.log(`Instagram Webhook 成功读取 OUTPUT，数据大小: ${JSON.stringify(record.value).length} 字符`);
    console.log("数据样例:", JSON.stringify(record.value).substring(0, 500) + "...");

    // 将结果写入 simple_search_history
    console.log(`Instagram Webhook 准备写入数据库，searchId: ${searchId}`);
    try {
      const { data, error } = await supabase.from('simple_search_history').insert({
        search_id: searchId,
        platform: 'instagram',
        data: record.value,
      }).select();
      
      if (error) {
        console.error("Instagram Webhook 数据插入失败:", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      
      console.log("Instagram Webhook 数据插入成功:", data);
      
      // 检查是否全部完成
      await checkAllTasksCompleted(searchId);
      
      console.log("--------- INSTAGRAM WEBHOOK END ---------");
      return NextResponse.json({ ok: true });
    } catch (dbErr: any) {
      console.error("Instagram Webhook 数据库操作异常:", dbErr);
      return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
    }
  } catch (apifyErr: any) {
    console.error("Apify API 调用失败:", apifyErr);
    return NextResponse.json({ ok: false, error: apifyErr.message }, { status: 500 });
  }
}

async function checkAllTasksCompleted(searchId: string) {
  console.log(`开始检查任务完成情况，searchId: ${searchId}`);
  try {
    const { data: searchRow, error: searchError } = await supabase
      .from('searches')
      .select('competitor_count')
      .eq('id', searchId)
      .single();

    if (searchError) {
      console.error("获取 searches 数据错误:", searchError);
      return;
    }
    
    const expected = (searchRow?.competitor_count || 5) * 5;
    console.log(`预计任务总数: ${expected}`);

    const { count, error: countError } = await supabase
      .from('simple_search_history')
      .select('*', { count: 'exact', head: true })
      .eq('search_id', searchId);

    if (countError) {
      console.error("统计 simple_search_history 数据错误:", countError);
      return;
    }

    console.log(`当前任务数量: ${count}`);
    if (count === expected) {
      console.log("所有任务均已完成，开始更新 searches 状态为 completed");
      const { error: updateError } = await supabase
        .from('searches')
        .update({ status: 'completed' })
        .eq('id', searchId);
        
      if (updateError) {
        console.error("更新 searches 状态失败:", updateError);
      } else {
        console.log("更新 searches 状态成功");
      }
    } else {
      console.log(`任务未全部完成，当前: ${count}/${expected}`);
    }
  } catch (err) {
    console.error("检查任务完成情况时发生错误:", err);
  }
}