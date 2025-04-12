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

// Debug logging
function debug(message) {
  console.log('[Background][debug]', message);
}

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
    
    downloadMedia(request, sendResponse);
    return true; // 保持消息通道开放
  }
});

// 设置请求规则
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1, 2, 3], // 移除旧规则
  addRules: [{
    id: 1,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Referer', operation: 'set', value: 'https://www.bilibili.com' },
        { header: 'Origin', operation: 'set', value: 'https://www.bilibili.com' },
        { header: 'Range', operation: 'set', value: 'bytes=0-' },
        { header: 'User-Agent', operation: 'set', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
        { header: 'Accept', operation: 'set', value: '*/*' },
        { header: 'Accept-Language', operation: 'set', value: 'zh-CN,zh;q=0.9,en;q=0.8' },
        { header: 'Accept-Encoding', operation: 'set', value: 'gzip, deflate, br' }
      ]
    },
    condition: {
      urlFilter: '*://*.bilivideo.com/*',
      resourceTypes: ['media'],
      excludedInitiatorDomains: ['www.bilibili.com']
    }
  }]
});

// 使用chrome.downloads.download直接下载
async function downloadMedia(request, sendResponse) {
  try {
    debug('开始下载流程');
    
    // 获取所有必要的cookie
    const cookies = await new Promise((resolve, reject) => {
      chrome.cookies.getAll({ domain: '.bilibili.com' }, (cookies) => {
        if (chrome.runtime.lastError) {
          reject(new Error('获取cookies失败: ' + chrome.runtime.lastError.message));
        } else {
          resolve(cookies);
        }
      });
    });
    
    // 构建cookie字符串
    const cookieString = cookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
    
    debug('获取到cookie: ' + cookieString);
    
    // 构建安全的请求头数组
    const requestHeaders = [
      { name: 'Cookie', value: cookieString },
      { name: 'Referer', value: 'https://www.bilibili.com' },
      { name: 'User-Agent', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    ];
    
    // 首先下载视频
    const videoFilename = request.filename.replace('.mp4', '_video.mp4');
    const videoDownloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: request.videoUrl,
        filename: videoFilename,
        headers: requestHeaders,
        conflictAction: 'uniquify',
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error('视频下载失败: ' + chrome.runtime.lastError.message));
        } else {
          resolve(downloadId);
        }
      });
    });
    
    debug('视频下载已开始，ID: ' + videoDownloadId);
    
    // 然后下载音频
    const audioFilename = request.filename.replace('.mp4', '_audio.m4a');
    const audioDownloadId = await new Promise((resolve, reject) => {
      chrome.downloads.download({
        url: request.audioUrl,
        filename: audioFilename,
        headers: requestHeaders,
        conflictAction: 'uniquify',
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error('音频下载失败: ' + chrome.runtime.lastError.message));
        } else {
          resolve(downloadId);
        }
      });
    });
    
    debug('音频下载已开始，ID: ' + audioDownloadId);
    sendResponse({ success: true, videoId: videoDownloadId, audioId: audioDownloadId });
    
  } catch (error) {
    debug('下载处理失败: ' + error.message);
    sendResponse({ success: false, error: error.message });
  }
}

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