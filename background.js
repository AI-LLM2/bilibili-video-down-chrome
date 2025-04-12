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
  
  if (request.action === 'getMediaUrls') {
    // 用于重新获取媒体URL的消息处理
    debug('正在重新获取媒体URL');
    sendResponse({ success: true, message: '请在页面上重新获取媒体URL' });
    return true;
  }
});

// 移除所有请求规则
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1, 2, 3]
});

// 使用XMLHttpRequest下载媒体文件
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
    
    // 尝试直接下载方法（不使用fetch或XHR）
    const directDownload = async (url, filename) => {
      return new Promise((resolve, reject) => {
        debug(`尝试直接下载: ${filename}`);
        chrome.downloads.download({
          url: url,
          filename: filename,
          conflictAction: 'uniquify',
          saveAs: false
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            debug(`直接下载失败: ${chrome.runtime.lastError.message}`);
            reject(new Error(`下载失败: ${chrome.runtime.lastError.message}`));
          } else {
            debug(`直接下载开始，ID: ${downloadId}`);
            resolve({ downloadId });
          }
        });
      });
    };
    
    // 使用XMLHttpRequest下载
    const xhrDownload = async (url, filename, isVideo = false) => {
      debug(`开始使用XMLHttpRequest下载: ${filename}`);
      
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        
        // 设置请求头
        xhr.setRequestHeader('Referer', 'https://www.bilibili.com/');
        xhr.setRequestHeader('Origin', 'https://www.bilibili.com');
        xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        xhr.setRequestHeader('Cookie', cookieString);
        xhr.setRequestHeader('Range', 'bytes=0-');
        xhr.setRequestHeader('Accept', '*/*');
        xhr.setRequestHeader('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8');
        
        xhr.onload = function() {
          if (xhr.status === 200 || xhr.status === 206) {
            debug(`XHR响应状态: ${xhr.status}`);
            
            // 检查响应内容类型
            const contentType = xhr.getResponseHeader('content-type');
            debug(`内容类型: ${contentType}`);
            
            if (contentType && contentType.includes('text/html')) {
              reject(new Error('服务器返回HTML而非媒体文件，请重新获取下载链接'));
              return;
            }
            
            const blob = xhr.response;
            debug(`获取到Blob: ${blob.size} 字节, 类型: ${blob.type}`);
            
            // 设置适当的MIME类型
            let correctBlob = blob;
            if (isVideo && !blob.type.includes('video')) {
              correctBlob = new Blob([blob], { type: 'video/mp4' });
            } else if (!isVideo && !blob.type.includes('audio')) {
              correctBlob = new Blob([blob], { type: 'audio/mp4' });
            }
            
            // 创建Blob URL
            const blobUrl = URL.createObjectURL(correctBlob);
            
            // 使用chrome.downloads API下载Blob
            chrome.downloads.download({
              url: blobUrl,
              filename: filename,
              conflictAction: 'uniquify',
              saveAs: false
            }, (downloadId) => {
              if (chrome.runtime.lastError) {
                debug(`Blob下载失败: ${chrome.runtime.lastError.message}`);
                URL.revokeObjectURL(blobUrl);
                reject(new Error(`下载失败: ${chrome.runtime.lastError.message}`));
              } else {
                debug(`Blob下载已开始，ID: ${downloadId}`);
                // 稍后释放Blob URL
                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
                resolve({ downloadId, blob: correctBlob });
              }
            });
          } else {
            debug(`XHR响应错误: ${xhr.status}`);
            reject(new Error(`响应错误: ${xhr.status} ${xhr.statusText}`));
          }
        };
        
        xhr.onerror = function() {
          debug(`XHR请求失败: 网络错误`);
          reject(new Error('网络错误'));
        };
        
        xhr.ontimeout = function() {
          debug(`XHR请求超时`);
          reject(new Error('请求超时'));
        };
        
        xhr.send();
      });
    };
    
    // 尝试下载的函数，先尝试直接下载，如果失败则使用XHR
    const tryDownload = async (url, filename, isVideo = false) => {
      try {
        debug(`首先尝试直接下载 ${filename}`);
        return await directDownload(url, filename);
      } catch (error) {
        debug(`直接下载失败，尝试XHR下载: ${error.message}`);
        return await xhrDownload(url, filename, isVideo);
      }
    };
    
    // 下载视频和音频
    try {
      // 下载视频
      const videoFilename = request.filename.replace('.mp4', '_video.mp4');
      debug('开始下载视频: ' + videoFilename);
      debug('视频URL: ' + request.videoUrl);
      
      const videoResult = await tryDownload(request.videoUrl, videoFilename, true);
      
      // 下载音频
      const audioFilename = request.filename.replace('.mp4', '_audio.m4a');
      debug('开始下载音频: ' + audioFilename);
      debug('音频URL: ' + request.audioUrl);
      
      const audioResult = await tryDownload(request.audioUrl, audioFilename, false);
      
      // 提供命令行合并说明
      const mergeInstructions = `
视频和音频下载完成！请使用以下FFmpeg命令合并它们：

ffmpeg -i "${videoFilename}" -i "${audioFilename}" -c:v copy -c:a copy "${request.filename}"

如果您没有安装FFmpeg，请从 https://ffmpeg.org/download.html 下载。
      `;
      
      debug(mergeInstructions);
      
      sendResponse({ 
        success: true, 
        videoId: videoResult.downloadId, 
        audioId: audioResult.downloadId,
        message: mergeInstructions
      });
    } catch (error) {
      debug('下载处理失败: ' + error.message);
      sendResponse({ success: false, error: error.message });
    }
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