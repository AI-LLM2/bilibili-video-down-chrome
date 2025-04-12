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

// 处理来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCookies') {
    chrome.cookies.getAll({
      domain: request.details.domain
    }, (cookies) => {
      if (chrome.runtime.lastError) {
        console.error('获取cookies失败:', chrome.runtime.lastError);
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ cookies });
      }
    });
    return true; // 保持消息通道开放
  }
  
  if (request.action === 'download') {
    debug('收到下载请求: ' + request.filename);
    debug(`视频URL: ${request.videoUrl}`);
    debug(`音频URL: ${request.audioUrl}`);
    
    // 直接使用chrome.downloads.download而不是fetch
    downloadMedia(request, sendResponse);
    return true; // 保持消息通道开放
  }
});

// 使用chrome.downloads.download直接下载
function downloadMedia(request, sendResponse) {
  try {
    debug('使用chrome.downloads直接下载');
    
    // 记录详细请求信息
    debug('视频下载URL: ' + request.videoUrl);
    debug('音频下载URL: ' + request.audioUrl);
    
    // 格式化请求头为chrome.downloads需要的格式，只保留安全的头部
    const safeHeaders = [
      { name: 'Accept', value: '*/*' },
      { name: 'Accept-Language', value: 'zh-CN,zh;q=0.9' },
      { name: 'Referer', value: 'https://www.bilibili.com' },
      { name: 'Origin', value: 'https://www.bilibili.com' },
      { name: 'Range', value: 'bytes=0-' }
    ];
    
    debug('使用的请求头: ' + JSON.stringify(safeHeaders));
    
    // 首先下载视频
    const videoFilename = request.filename.replace('.mp4', '_video.mp4');
    chrome.downloads.download({
      url: request.videoUrl,
      filename: videoFilename,
      headers: safeHeaders,
      conflictAction: 'uniquify'
    }, (videoDownloadId) => {
      if (chrome.runtime.lastError) {
        debug('视频下载失败: ' + chrome.runtime.lastError.message);
        sendResponse({ success: false, error: '视频下载失败: ' + chrome.runtime.lastError.message });
        return;
      }
      
      debug('视频下载已开始，ID: ' + videoDownloadId);
      
      // 然后下载音频
      const audioFilename = request.filename.replace('.mp4', '_audio.m4a');
      chrome.downloads.download({
        url: request.audioUrl,
        filename: audioFilename,
        headers: safeHeaders,
        conflictAction: 'uniquify'
      }, (audioDownloadId) => {
        if (chrome.runtime.lastError) {
          debug('音频下载失败: ' + chrome.runtime.lastError.message);
          sendResponse({ success: false, error: '音频下载失败: ' + chrome.runtime.lastError.message });
          return;
        }
        
        debug('音频下载已开始，ID: ' + audioDownloadId);
        sendResponse({ success: true, videoId: videoDownloadId, audioId: audioDownloadId });
      });
    });
    
  } catch (error) {
    debug('下载处理失败: ' + error.message);
    sendResponse({ success: false, error: error.message });
  }
}

// 使用webRequest拦截并修改请求
chrome.webRequest.onBeforeSendHeaders.addListener(
  function(details) {
    // 只处理来自bilibili视频服务器的请求
    if (details.url.includes('bilivideo.com')) {
      debug('拦截到视频请求: ' + details.url);
      
      // 修改请求头
      let foundReferer = false;
      let foundOrigin = false;
      let foundRange = false;
      
      for (let i = 0; i < details.requestHeaders.length; i++) {
        if (details.requestHeaders[i].name.toLowerCase() === 'referer') {
          details.requestHeaders[i].value = 'https://www.bilibili.com';
          foundReferer = true;
        }
        else if (details.requestHeaders[i].name.toLowerCase() === 'origin') {
          details.requestHeaders[i].value = 'https://www.bilibili.com';
          foundOrigin = true;
        }
        else if (details.requestHeaders[i].name.toLowerCase() === 'range') {
          foundRange = true;
        }
      }
      
      if (!foundReferer) {
        details.requestHeaders.push({ name: 'Referer', value: 'https://www.bilibili.com' });
      }
      
      if (!foundOrigin) {
        details.requestHeaders.push({ name: 'Origin', value: 'https://www.bilibili.com' });
      }
      
      if (!foundRange) {
        details.requestHeaders.push({ name: 'Range', value: 'bytes=0-' });
      }
      
      // 添加额外的请求头
      details.requestHeaders.push({ name: 'Accept', value: '*/*' });
      details.requestHeaders.push({ name: 'Accept-Language', value: 'zh-CN,zh;q=0.9' });
      
      debug('修改后的请求头: ' + JSON.stringify(details.requestHeaders));
      
      return { requestHeaders: details.requestHeaders };
    }
  },
  { urls: ["*://*.bilivideo.com/*"] },
  ["blocking", "requestHeaders"]
);

// 监听下载状态变化
chrome.downloads.onChanged.addListener(function(delta) {
  if (delta.state) {
    if (delta.state.current === 'complete') {
      debug(`下载完成，ID: ${delta.id}`);
    } else if (delta.state.current === 'interrupted') {
      debug(`下载中断，ID: ${delta.id}, 错误: ${delta.error ? delta.error.current : '未知'}`);
    }
  }
});

// 监听 webRequest 以修改请求头
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    try {
      debug('处理请求头: ' + details.url);
      
      if (details.url.includes('api.bilibili.com') || 
          details.url.includes('bilivideo.com')) {
        const headers = details.requestHeaders;
        
        // 确保包含必要的请求头
        const requiredHeaders = {
          'Origin': 'https://www.bilibili.com',
          'Referer': 'https://www.bilibili.com',
          'Accept': '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9'
        };
        
        for (const [name, value] of Object.entries(requiredHeaders)) {
          if (!headers.some(h => h.name.toLowerCase() === name.toLowerCase())) {
            headers.push({ name, value });
            debug('添加请求头: ' + name);
          }
        }
        
        return { requestHeaders: headers };
      }
    } catch (error) {
      debug('处理请求头失败: ' + error.message);
    }
  },
  {
    urls: [
      'https://*.bilibili.com/*',
      'https://*.bilivideo.com/*'
    ]
  },
  ['blocking', 'requestHeaders']
);

// 监听下载状态
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    console.log('下载完成:', delta.id);
  } else if (delta.state && delta.state.current === 'interrupted') {
    console.error('下载中断:', delta.id);
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