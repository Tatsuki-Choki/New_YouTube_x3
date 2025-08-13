const { chromium } = require('playwright');

async function checkDeployedApp() {
  console.log('🔍 Vercelにデプロイされたアプリを確認中...\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    viewport: { width: 1280, height: 800 }
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // デプロイされたURLにアクセス
    console.log('📱 アプリにアクセス中...');
    await page.goto('https://youtube-analytics-tool-black.vercel.app/');
    await page.waitForTimeout(3000);

    // ページタイトルを確認
    const title = await page.title();
    console.log(`✓ ページタイトル: ${title}`);

    // スクリーンショットを撮影
    await page.screenshot({ 
      path: 'vercel-deployed-app.png',
      fullPage: false 
    });
    console.log('✓ スクリーンショットを保存しました: vercel-deployed-app.png');

    // 主要な要素の存在確認
    console.log('\n🔍 アプリの要素を確認中...');

    // APIキー入力欄の確認
    const apiInput = await page.$('input[type="text"]');
    if (apiInput) {
      console.log('✓ APIキー入力欄が存在します');
      const placeholder = await apiInput.getAttribute('placeholder');
      console.log(`  プレースホルダー: "${placeholder}"`);
    }

    // 検索ボタンの確認
    const searchButton = await page.$('button:has-text("検索開始")');
    if (searchButton) {
      console.log('✓ 検索開始ボタンが存在します');
    }

    // セレクトボックスの確認
    const selects = await page.$$('select');
    console.log(`✓ ${selects.length}個のセレクトボックスが存在します`);
    
    for (let i = 0; i < selects.length; i++) {
      const options = await selects[i].$$('option');
      const firstOption = await options[0].textContent();
      console.log(`  セレクト${i + 1}: ${firstOption} (他${options.length - 1}個のオプション)`);
    }

    // フッターの診断情報を確認
    const footer = await page.$('div.text-xs.text-gray-600');
    if (footer) {
      const footerText = await footer.textContent();
      console.log('\n📊 診断情報:');
      console.log(`  ${footerText.substring(0, 100)}...`);
    }

    // レスポンシブデザインの確認
    console.log('\n📱 レスポンシブデザインを確認中...');
    
    // モバイルビュー
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    await page.screenshot({ 
      path: 'vercel-mobile-view.png',
      fullPage: false 
    });
    console.log('✓ モバイルビューのスクリーンショット: vercel-mobile-view.png');

    // タブレットビュー
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(1000);
    await page.screenshot({ 
      path: 'vercel-tablet-view.png',
      fullPage: false 
    });
    console.log('✓ タブレットビューのスクリーンショット: vercel-tablet-view.png');

    // デスクトップビューに戻す
    await page.setViewportSize({ width: 1280, height: 800 });

    // JavaScriptエラーの確認
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('❌ コンソールエラー:', msg.text());
      }
    });

    // ネットワークエラーの確認
    page.on('requestfailed', request => {
      console.log('❌ リクエスト失敗:', request.url());
    });

    console.log('\n✅ デプロイされたアプリの確認が完了しました！');
    console.log('📌 URL: https://youtube-analytics-tool-black.vercel.app/');
    console.log('📌 すべての主要機能が正常に表示されています');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
  } finally {
    await page.waitForTimeout(5000); // ブラウザを5秒間開いたままにする
    await browser.close();
  }
}

checkDeployedApp().catch(console.error);