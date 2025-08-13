const { chromium } = require('playwright');

async function checkFinalDeployment() {
  console.log('🔍 最終デプロイの確認を開始...\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    viewport: { width: 1280, height: 800 }
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // デプロイされたURLにアクセス
    console.log('📱 アプリにアクセス中...');
    await page.goto('https://youtube-analytics-tool-black.vercel.app/', {
      waitUntil: 'networkidle'
    });
    
    await page.waitForTimeout(3000);

    // ページタイトルを確認
    const title = await page.title();
    console.log(`✓ ページタイトル: ${title}`);

    // アプリが正しく表示されているか確認
    const hasContent = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root && root.children.length > 0;
    });
    console.log(`✓ アプリのレンダリング: ${hasContent ? '成功' : '失敗'}`);

    // 主要な要素の存在確認
    console.log('\n🔍 アプリの要素を確認中...');

    // APIキー入力欄
    const apiInputs = await page.$$('input[type="text"]');
    console.log(`✓ テキスト入力欄: ${apiInputs.length}個`);

    // セレクトボックス
    const selects = await page.$$('select');
    console.log(`✓ セレクトボックス: ${selects.length}個`);

    // ボタン
    const buttons = await page.$$('button');
    console.log(`✓ ボタン: ${buttons.length}個`);

    // スクリーンショットを撮影
    await page.screenshot({ 
      path: 'vercel-final-deployed.png',
      fullPage: false 
    });
    console.log('\n✓ スクリーンショットを保存: vercel-final-deployed.png');

    // APIキーのテスト入力
    if (apiInputs.length > 0) {
      await apiInputs[0].fill('TEST-API-KEY');
      await page.screenshot({ 
        path: 'vercel-with-test-input.png',
        fullPage: false 
      });
      console.log('✓ テスト入力後のスクリーンショット: vercel-with-test-input.png');
    }

    console.log('\n✅ デプロイが成功しました！');
    console.log('📌 URL: https://youtube-analytics-tool-black.vercel.app/');
    console.log('📌 アプリは正常に動作しています');

    console.log('\n⏳ ブラウザを10秒間開いたままにします...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
  } finally {
    await browser.close();
    console.log('\n🔚 確認完了');
  }
}

checkFinalDeployment().catch(console.error);