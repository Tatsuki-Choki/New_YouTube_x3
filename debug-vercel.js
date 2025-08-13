const { chromium } = require('playwright');

async function debugVercelApp() {
  console.log('🔍 Vercelアプリのデバッグを開始...\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    devtools: true // 開発者ツールを開く
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // コンソールログを監視
  const consoleLogs = [];
  page.on('console', msg => {
    const log = `[${msg.type()}] ${msg.text()}`;
    consoleLogs.push(log);
    console.log(log);
  });

  // ページエラーを監視
  page.on('pageerror', error => {
    console.error('❌ ページエラー:', error.message);
  });

  // ネットワークリクエストを監視
  const failedRequests = [];
  page.on('requestfailed', request => {
    const failure = `${request.url()} - ${request.failure().errorText}`;
    failedRequests.push(failure);
    console.error('❌ リクエスト失敗:', failure);
  });

  try {
    // デプロイされたURLにアクセス
    console.log('📱 アプリにアクセス中...');
    const response = await page.goto('https://youtube-analytics-tool-black.vercel.app/', {
      waitUntil: 'networkidle'
    });
    
    console.log(`\n📊 レスポンスステータス: ${response.status()}`);
    
    // HTMLコンテンツを確認
    const htmlContent = await page.content();
    console.log(`\n📄 HTMLサイズ: ${htmlContent.length} bytes`);
    
    // rootエレメントの内容を確認
    const rootContent = await page.evaluate(() => {
      const root = document.getElementById('root');
      return root ? root.innerHTML : 'root要素が見つかりません';
    });
    console.log(`\n🎯 #root要素の内容: ${rootContent.substring(0, 100)}...`);

    // スクリプトタグを確認
    const scripts = await page.evaluate(() => {
      const scriptTags = Array.from(document.querySelectorAll('script'));
      return scriptTags.map(s => ({
        src: s.src || 'inline',
        type: s.type || 'text/javascript'
      }));
    });
    console.log('\n📜 読み込まれたスクリプト:');
    scripts.forEach(s => console.log(`  - ${s.type}: ${s.src}`));

    // Reactが読み込まれているか確認
    const hasReact = await page.evaluate(() => {
      return typeof window.React !== 'undefined';
    });
    console.log(`\n⚛️ React読み込み: ${hasReact ? '✓' : '✗'}`);

    // ReactDOMが読み込まれているか確認
    const hasReactDOM = await page.evaluate(() => {
      return typeof window.ReactDOM !== 'undefined';
    });
    console.log(`⚛️ ReactDOM読み込み: ${hasReactDOM ? '✓' : '✗'}`);

    // Babelが読み込まれているか確認
    const hasBabel = await page.evaluate(() => {
      return typeof window.Babel !== 'undefined';
    });
    console.log(`🔧 Babel読み込み: ${hasBabel ? '✓' : '✗'}`);

    // app.jsxファイルの存在を確認
    const appJsxResponse = await page.evaluate(async () => {
      try {
        const response = await fetch('/app.jsx');
        return {
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get('content-type')
        };
      } catch (error) {
        return { error: error.message };
      }
    });
    console.log('\n📦 app.jsxファイルの状態:', JSON.stringify(appJsxResponse, null, 2));

    // ネットワークエラーのまとめ
    if (failedRequests.length > 0) {
      console.log('\n❌ 失敗したリクエスト:');
      failedRequests.forEach(req => console.log(`  - ${req}`));
    }

    // コンソールログのまとめ
    if (consoleLogs.length > 0) {
      console.log('\n📝 コンソールログまとめ:');
      consoleLogs.forEach(log => console.log(`  ${log}`));
    }

    console.log('\n⏳ ブラウザを開いたままにしています... (手動で確認してください)');
    await page.waitForTimeout(30000); // 30秒待機

  } catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
  } finally {
    await browser.close();
    console.log('\n🔚 デバッグ完了');
  }
}

debugVercelApp().catch(console.error);