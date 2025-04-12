// 监听来自content script和devtools的消息
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "devtools-panel") {
    // 存储devtools连接
    const devtoolsPort = port;
    
    // 监听来自devtools的消息
    devtoolsPort.onMessage.addListener((message) => {
      console.log('Message from devtools:', message);
    });
  }
});

// 调试信息输出
const debug = (message) => {
  console.log('[Background][debug]', message);
};

// Listen for download requests
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 处理获取cookies的请求
  if (request.action === 'getCookies') {
    console.log('Getting cookies for domain:', request.domain);
    chrome.cookies.getAll({ domain: request.domain }, (cookies) => {
      const cookieMap = {};
      cookies.forEach(cookie => {
        cookieMap[cookie.name] = cookie.value;
      });
      console.log('Cookies retrieved:', Object.keys(cookieMap).length);
      sendResponse({ cookies: cookieMap });
    });
    return true; // Required for async response
  }
  
  // 处理下载请求
  if (request.action === 'download') {
    debug('收到下载请求');
    handleDownload(request, sendResponse);
    return true; // 保持消息通道开放
  }
});

// 下载处理函数
async function handleDownload(request, sendResponse) {
  try {
    debug('开始处理下载');
    debug(`视频URL: ${request.videoUrl}`);
    debug(`音频URL: ${request.audioUrl}`);
    
    // 更新headers
    const fullHeaders = {
      ...request.headers,
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Range': 'bytes=0-',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Connection': 'keep-alive',
      'DNT': '1'
    };
    
    // 下载视频流（带重试逻辑）
    debug('开始下载视频流');
    let videoBlob = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        const videoResponse = await fetch(request.videoUrl, {
          headers: fullHeaders,
          credentials: 'include',
          mode: 'cors',
          cache: 'no-cache'
        });
        
        if (!videoResponse.ok) {
          throw new Error(`HTTP ${videoResponse.status}`);
        }
        
        videoBlob = await videoResponse.blob();
        debug(`视频流下载完成，大小: ${videoBlob.size} bytes`);
        break;
      } catch (error) {
        retryCount++;
        debug(`视频下载重试 ${retryCount}/${maxRetries}: ${error.message}`);
        if (retryCount === maxRetries) {
          throw new Error(`视频下载失败: ${error.message}`);
        }
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
    
    // 下载音频流（带重试逻辑）
    debug('开始下载音频流');
    let audioBlob = null;
    retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        const audioResponse = await fetch(request.audioUrl, {
          headers: fullHeaders,
          credentials: 'include',
          mode: 'cors',
          cache: 'no-cache'
        });
        
        if (!audioResponse.ok) {
          throw new Error(`HTTP ${audioResponse.status}`);
        }
        
        audioBlob = await audioResponse.blob();
        debug(`音频流下载完成，大小: ${audioBlob.size} bytes`);
        break;
      } catch (error) {
        retryCount++;
        debug(`音频下载重试 ${retryCount}/${maxRetries}: ${error.message}`);
        if (retryCount === maxRetries) {
          throw new Error(`音频下载失败: ${error.message}`);
        }
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
    
    // 合并视频和音频
    debug('开始合并视频和音频');
    const combinedBlob = new Blob([videoBlob, audioBlob], { type: 'video/mp4' });
    const blobUrl = URL.createObjectURL(combinedBlob);
    
    // 开始下载
    chrome.downloads.download({
      url: blobUrl,
      filename: request.filename,
      saveAs: true,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        debug(`下载错误: ${chrome.runtime.lastError.message}`);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        debug(`下载已开始，ID: ${downloadId}`);
        sendResponse({ success: true });
        
        // 监听下载完成事件
        chrome.downloads.onChanged.addListener(function onChanged(delta) {
          if (delta.id === downloadId && delta.state) {
            if (delta.state.current === 'complete') {
              debug('下载完成');
              URL.revokeObjectURL(blobUrl);
              chrome.downloads.onChanged.removeListener(onChanged);
            } else if (delta.state.current === 'interrupted') {
              debug('下载中断');
              URL.revokeObjectURL(blobUrl);
              chrome.downloads.onChanged.removeListener(onChanged);
            }
          }
        });
      }
    });
    
  } catch (error) {
    debug(`下载处理失败: ${error.message}`);
    sendResponse({ success: false, error: error.message });
  }
} 