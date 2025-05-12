import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: NextRequest) {
  try {
    // 解析请求体
    const { search_id, competitor_name, platform, url, fans_count, dataset } = await request.json();
    
    // 验证请求
    if (!search_id || !competitor_name || !platform || !url) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // 准备基本数据
    const timestamp = new Date().toISOString();
    const baseData = {
      search_id,
      competitor_name,
      platform,
      url,
      updated_at: timestamp
    };
    
    // 如果有粉丝数和数据集，添加到数据中
    const fullData = {
      ...baseData,
      ...(fans_count !== undefined && { fans_count }),
      ...(dataset !== undefined && { dataset })
    };
    
    // 首先检查记录是否已存在
    const { data: existingRecord, error: checkError } = await supabase
      .from('simple_search_history')
      .select('id')
      .eq('search_id', search_id)
      .eq('competitor_name', competitor_name)
      .eq('platform', platform)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') { // PGRST116是"没有找到记录"的错误
      console.error('Error checking existing record:', checkError);
      return NextResponse.json(
        { success: false, message: 'Database check failed', error: checkError },
        { status: 500 }
      );
    }
    
    let result;
    
    if (existingRecord) {
      // 记录存在，更新它
      const { error: updateError } = await supabase
        .from('simple_search_history')
        .update(fullData)
        .eq('id', existingRecord.id);
        
      if (updateError) {
        console.error('Error updating data:', updateError);
        return NextResponse.json(
          { success: false, message: 'Database update failed', error: updateError },
          { status: 500 }
        );
      }
      
      result = { message: 'Competitor data updated successfully', id: existingRecord.id };
    } else {
      // 记录不存在，插入新记录
      const { data: newRecord, error: insertError } = await supabase
        .from('simple_search_history')
        .insert(fullData)
        .select('id')
        .single();
      
      if (insertError) {
        console.error('Error inserting data:', insertError);
        return NextResponse.json(
          { success: false, message: 'Database insert failed', error: insertError },
          { status: 500 }
        );
      }
      
      result = { message: 'Competitor data inserted successfully', id: newRecord.id };
    }
    
    return NextResponse.json({
      success: true,
      ...result,
      fans_count
    });
    
  } catch (error: any) {
    console.error('Error in update-competitor:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: error.message },
      { status: 500 }
    );
  }
}

// 添加DELETE方法以支持删除功能
export async function DELETE(request: NextRequest) {
  try {
    // 解析请求体
    const { search_id, id } = await request.json();
    
    // 验证请求
    if (!search_id || !id) {
      return NextResponse.json(
        { success: false, message: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // 删除记录
    const { error: deleteError } = await supabase
      .from('simple_search_history')
      .delete()
      .eq('search_id', search_id)
      .eq('id', id);
    
    if (deleteError) {
      console.error('Error deleting data:', deleteError);
      return NextResponse.json(
        { success: false, message: 'Database delete failed', error: deleteError },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Competitor data deleted successfully'
    });
  } catch (error: any) {
    console.error('Error in delete-competitor:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error', error: error.message },
      { status: 500 }
    );
  }
} 