import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const { searchId } = await request.json();
    
    // 验证请求
    if (!searchId) {
      return NextResponse.json(
        { success: false, message: 'Search ID is required' },
        { status: 400 }
      );
    }
    
    // 从数据库获取所有相关记录
    const { data, error } = await supabase
      .from('simple_search_history')
      .select('*')
      .eq('search_id', searchId);
    
    if (error) {
      console.error('Error fetching data:', error);
      return NextResponse.json(
        { success: false, message: 'Database fetch failed', error },
        { status: 500 }
      );
    }
    
    // 转换数据为前端需要的格式
    const items = data.map(item => ({
      id: item.id,
      name: item.competitor_name,
      platform: item.platform,
      url: item.url,
      followers: item.fans_count,
      actorRunId: item.actorRunId,
      defaultDatasetId: item.defaultDatasetId,
      success: Boolean(item.fans_count && item.fans_count > 200)
    }));
    
    return NextResponse.json({
      success: true,
      items
    });
    
  } catch (error: any) {
    console.error('Error in get-competitor-data:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: error.message },
      { status: 500 }
    );
  }
} 