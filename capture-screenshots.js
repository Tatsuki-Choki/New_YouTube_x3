const { chromium } = require('playwright');
const path = require('path');

async function captureScreenshots() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  // アプリケーションを開く
  const appPath = 'file://' + path.resolve(__dirname, 'index.html');
  await page.goto(appPath);
  await page.waitForTimeout(2000);

  // 1. 初期画面のスクリーンショット
  await page.screenshot({ 
    path: 'screenshots/01_initial_screen.png',
    fullPage: false 
  });
  console.log('✓ 初期画面をキャプチャしました');

  // 2. APIキー入力画面
  const apiInput = await page.$('input[type="text"]');
  if (apiInput) {
    await apiInput.fill('YOUR-API-KEY-HERE-EXAMPLE');
  }
  await page.screenshot({ 
    path: 'screenshots/02_api_key_input.png',
    fullPage: false 
  });
  console.log('✓ APIキー入力画面をキャプチャしました');

  // 3. 検索キーワード入力
  const searchInputs = await page.$$('input[type="text"]');
  if (searchInputs.length > 1) {
    await searchInputs[1].fill('料理 レシピ');
  }
  await page.screenshot({ 
    path: 'screenshots/03_search_keyword.png',
    fullPage: false 
  });
  console.log('✓ 検索キーワード入力画面をキャプチャしました');

  // 4. 詳細検索条件の設定
  const numberInput = await page.$('input[type="number"]');
  if (numberInput) {
    await numberInput.fill('50000');
  }
  const selects = await page.$$('select');
  if (selects.length >= 2) {
    await selects[0].selectOption('US');
    await selects[1].selectOption('week');
  }
  await page.screenshot({ 
    path: 'screenshots/04_search_filters.png',
    fullPage: false 
  });
  console.log('✓ 検索条件設定画面をキャプチャしました');

  // 5. ショート動画フィルター
  if (selects.length >= 3) {
    await selects[2].selectOption('exclude');
  }
  await page.screenshot({ 
    path: 'screenshots/05_shorts_filter.png',
    fullPage: false 
  });
  console.log('✓ ショート動画フィルター設定をキャプチャしました');

  // デモデータを追加して結果画面を表示
  await page.evaluate(() => {
    // React のステートを直接操作してデモデータを追加
    const demoVideos = [
      {
        id: { videoId: 'demo1' },
        snippet: {
          title: '【簡単レシピ】10分でできる絶品パスタの作り方',
          channelTitle: 'クッキングチャンネル',
          channelId: 'channel1',
          publishedAt: '2024-01-15T10:00:00Z',
          description: '今回は誰でも簡単に作れる絶品パスタのレシピをご紹介します。'
        },
        statistics: {
          viewCount: '250000',
          likeCount: '15000',
          commentCount: '500'
        },
        channelStatistics: {
          subscriberCount: '50000'
        },
        contentDetails: {
          duration: 'PT10M30S'
        }
      },
      {
        id: { videoId: 'demo2' },
        snippet: {
          title: '【話題】バズった料理系YouTuberの秘密',
          channelTitle: 'トレンドメディア',
          channelId: 'channel2',
          publishedAt: '2024-01-10T15:00:00Z',
          description: '最近バズった料理系YouTuberの成功の秘密を分析しました。'
        },
        statistics: {
          viewCount: '500000',
          likeCount: '25000',
          commentCount: '1200'
        },
        channelStatistics: {
          subscriberCount: '100000'
        },
        contentDetails: {
          duration: 'PT15M45S'
        }
      },
      {
        id: { videoId: 'demo3' },
        snippet: {
          title: '初心者でも失敗しない！基本の和食レシピ',
          channelTitle: '和食の達人',
          channelId: 'channel3',
          publishedAt: '2024-01-05T12:00:00Z',
          description: '和食の基本を丁寧に解説します。'
        },
        statistics: {
          viewCount: '180000',
          likeCount: '8000',
          commentCount: '300'
        },
        channelStatistics: {
          subscriberCount: '30000'
        },
        contentDetails: {
          duration: 'PT20M00S'
        }
      }
    ];

    // Reactコンポーネントの状態を更新
    window.demoVideos = demoVideos;
  });

  // 6. 検索結果画面
  await page.evaluate(() => {
    const resultsHTML = `
      <div style="margin-top: 20px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h3 style="font-size: 18px; font-weight: bold; margin-bottom: 15px;">検索結果: 3件</h3>
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background: #f3f4f6;">
                <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e5e7eb;">タイトル</th>
                <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e5e7eb;">チャンネル</th>
                <th style="padding: 8px; text-align: right; border-bottom: 2px solid #e5e7eb;">再生回数</th>
                <th style="padding: 8px; text-align: right; border-bottom: 2px solid #e5e7eb;">登録者数</th>
                <th style="padding: 8px; text-align: right; border-bottom: 2px solid #e5e7eb;">倍率</th>
                <th style="padding: 8px; text-align: center; border-bottom: 2px solid #e5e7eb;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">【簡単レシピ】10分でできる絶品パスタ</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">クッキングチャンネル</td>
                <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb;">250,000</td>
                <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb;">50,000</td>
                <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: bold;">5.0x</td>
                <td style="padding: 8px; text-align: center; border-bottom: 1px solid #e5e7eb;">
                  <button style="padding: 4px 12px; background: #3b82f6; color: white; border-radius: 4px; cursor: pointer;">コメント取得</button>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">【話題】バズった料理系YouTuberの秘密</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">トレンドメディア</td>
                <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb;">500,000</td>
                <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb;">100,000</td>
                <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: bold;">5.0x</td>
                <td style="padding: 8px; text-align: center; border-bottom: 1px solid #e5e7eb;">
                  <button style="padding: 4px 12px; background: #3b82f6; color: white; border-radius: 4px; cursor: pointer;">コメント取得</button>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">初心者でも失敗しない！基本の和食レシピ</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">和食の達人</td>
                <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb;">180,000</td>
                <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb;">30,000</td>
                <td style="padding: 8px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #10b981; font-weight: bold;">6.0x</td>
                <td style="padding: 8px; text-align: center; border-bottom: 1px solid #e5e7eb;">
                  <button style="padding: 4px 12px; background: #3b82f6; color: white; border-radius: 4px; cursor: pointer;">コメント取得</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style="margin-top: 15px;">
          <button style="padding: 8px 16px; background: #10b981; color: white; border-radius: 4px; margin-right: 10px; cursor: pointer;">動画リストをCSV出力</button>
        </div>
      </div>
    `;
    
    const container = document.querySelector('#root');
    const resultsDiv = document.createElement('div');
    resultsDiv.innerHTML = resultsHTML;
    container.appendChild(resultsDiv);
  });

  await page.waitForTimeout(1000);
  await page.screenshot({ 
    path: 'screenshots/06_search_results.png',
    fullPage: false 
  });
  console.log('✓ 検索結果画面をキャプチャしました');

  // 7. 倍率フィルターボタン
  await page.evaluate(() => {
    const filterHTML = `
      <div style="margin-top: 15px; padding: 15px; background: #f9fafb; border-radius: 8px;">
        <h4 style="font-size: 14px; font-weight: bold; margin-bottom: 10px;">登録者数倍率でフィルター:</h4>
        <div style="display: flex; gap: 10px;">
          <button style="padding: 6px 12px; background: white; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer;">1倍以上</button>
          <button style="padding: 6px 12px; background: #3b82f6; color: white; border-radius: 4px; cursor: pointer;">2倍以上</button>
          <button style="padding: 6px 12px; background: white; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer;">3倍以上</button>
        </div>
      </div>
    `;
    
    const container = document.querySelector('#root > div:last-child');
    const filterDiv = document.createElement('div');
    filterDiv.innerHTML = filterHTML;
    if (container) {
      container.appendChild(filterDiv);
    }
  });

  await page.waitForTimeout(500);
  await page.screenshot({ 
    path: 'screenshots/07_ratio_filter.png',
    fullPage: false 
  });
  console.log('✓ 倍率フィルター画面をキャプチャしました');

  // 8. コメント取得結果
  await page.evaluate(() => {
    const commentsHTML = `
      <div style="margin-top: 20px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <h3 style="font-size: 18px; font-weight: bold; margin-bottom: 15px;">コメント一覧: 【簡単レシピ】10分でできる絶品パスタ</h3>
        <div style="max-height: 400px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 4px; padding: 15px;">
          <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #e5e7eb;">
            <div style="font-weight: bold; color: #374151;">山田太郎</div>
            <div style="margin-top: 5px; color: #4b5563;">このレシピ最高です！家族にも大好評でした。また作ります！</div>
            <div style="margin-top: 5px; font-size: 12px; color: #9ca3af;">👍 125 • 2024年1月16日</div>
          </div>
          <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #e5e7eb;">
            <div style="font-weight: bold; color: #374151;">佐藤花子</div>
            <div style="margin-top: 5px; color: #4b5563;">初心者でも簡単に作れました。味付けのコツが分かりやすくて助かりました。</div>
            <div style="margin-top: 5px; font-size: 12px; color: #9ca3af;">👍 89 • 2024年1月16日</div>
          </div>
          <div style="margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #e5e7eb;">
            <div style="font-weight: bold; color: #374151;">鈴木次郎</div>
            <div style="margin-top: 5px; color: #4b5563;">材料も手に入りやすくて良いですね。週末に挑戦してみます。</div>
            <div style="margin-top: 5px; font-size: 12px; color: #9ca3af;">👍 45 • 2024年1月15日</div>
          </div>
        </div>
        <div style="margin-top: 15px;">
          <button style="padding: 8px 16px; background: #10b981; color: white; border-radius: 4px; cursor: pointer;">コメントをCSV出力</button>
        </div>
      </div>
    `;
    
    const container = document.querySelector('#root');
    const commentsDiv = document.createElement('div');
    commentsDiv.innerHTML = commentsHTML;
    container.appendChild(commentsDiv);
  });

  await page.waitForTimeout(500);
  await page.screenshot({ 
    path: 'screenshots/08_comments.png',
    fullPage: false 
  });
  console.log('✓ コメント画面をキャプチャしました');

  // 9. CSV出力成功メッセージ
  await page.evaluate(() => {
    const successHTML = `
      <div style="position: fixed; top: 20px; right: 20px; padding: 15px 20px; background: #10b981; color: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 1000;">
        ✅ CSVファイルのダウンロードが開始されました
      </div>
    `;
    
    const successDiv = document.createElement('div');
    successDiv.innerHTML = successHTML;
    document.body.appendChild(successDiv);
  });

  await page.waitForTimeout(500);
  await page.screenshot({ 
    path: 'screenshots/09_csv_export_success.png',
    fullPage: false 
  });
  console.log('✓ CSV出力成功画面をキャプチャしました');

  await browser.close();
  console.log('\n✅ すべてのスクリーンショットの撮影が完了しました！');
}

captureScreenshots().catch(console.error);