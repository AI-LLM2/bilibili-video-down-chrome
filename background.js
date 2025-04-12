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
    
    // 首先下载视频
    const videoFilename = request.filename.replace('.mp4', '_video.mp4');
    chrome.downloads.download({
      url: request.videoUrl,
      filename: videoFilename,
      // 不传递headers参数，依靠webRequest拦截
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
        // 不传递headers参数，依靠webRequest拦截
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
  // Chrome 要求使用extraHeaders来修改某些特殊头部
  (() => {
    let params = ["blocking", "requestHeaders"];
    // 根据浏览器环境添加extraHeaders
    if (chrome.webRequest.OnBeforeSendHeadersOptions && 
        chrome.webRequest.OnBeforeSendHeadersOptions.hasOwnProperty('EXTRA_HEADERS')) {
      params.push('extraHeaders');
    } else {
      try {
        params.push('extraHeaders');
      } catch (e) {
        debug('不支持extraHeaders参数');
      }
    }
    return params;
  })()
);

// 下载状态监听
chrome.downloads.onChanged.addListener(function(delta) {
  if (delta.state) {
    if (delta.state.current === 'complete') {
      debug(`下载完成，ID: ${delta.id}`);
    } else if (delta.state.current === 'interrupted') {
      debug(`下载中断，ID: ${delta.id}, 错误: ${delta.error ? delta.error.current : '未知'}`);
    }
  }
});

// 旧的下载处理函数，已不使用
// async function handleDownload(request, sendResponse) {
//   // ...旧代码，已被替换...
// } 