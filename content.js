// 发送调试信息
function sendDebugMessage(type, text) {
  chrome.runtime.sendMessage({
    type: type,
    text: text
  });
  console.log(`[Content Script][${type}] ${text}`);
}

// 调试信息输出
const debug = (message) => {
  console.log('[Content Script][debug]', message);
};

// API 请求基础配置
const API_CONFIG = {
  BASE_URL: 'https://api.bilibili.com',
  QUALITY_LEVELS: {
    '120': { name: '4K', requires: 'vip2' },
    '116': { name: '1080P 60fps', requires: 'vip1' },
    '112': { name: '1080P+', requires: 'vip1' },
    '80': { name: '1080P', requires: 'login' },
    '64': { name: '720P', requires: 'none' },
    '32': { name: '480P', requires: 'none' },
    '16': { name: '360P', requires: 'none' }
  },
  CODEC_PRIORITY: ['avc1', 'hev1', 'av01'], // H.264 > HEVC > AV1
  DEFAULT_HEADERS: {
    'Accept': 'application/json',
    'Referer': 'https://www.bilibili.com',
    'Origin': 'https://www.bilibili.com'
  }
};

// 检查页面是否为视频页面
function checkPage() {
  const url = window.location.href;
  if (!url.includes('bilibili.com/video/')) {
    throw new Error('当前页面不是Bilibili视频页面');
  }
  return true;
}

// 获取所有cookies
async function getAllCookies() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'getCookies', domain: '.bilibili.com' }, 
      (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response && response.cookies) {
          resolve(response.cookies);
        } else {
          reject(new Error('获取cookies失败'));
        }
      }
    );
  });
}

// 构建API请求headers
async function buildHeaders(extraHeaders = {}) {
  const cookies = await getAllCookies();
  const cookieString = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

  return {
    ...API_CONFIG.DEFAULT_HEADERS,
    'Cookie': cookieString,
    'User-Agent': navigator.userAgent,
    ...extraHeaders
  };
}

// 获取视频基本信息
async function getVideoInfo() {
  try {
    const match = window.location.pathname.match(/\/video\/(BV[\w]+)/);
    if (!match) {
      throw new Error('无法获取视频ID');
    }
    const bvid = match[1];
    
    const headers = await buildHeaders();
    const response = await fetch(`${API_CONFIG.BASE_URL}/x/web-interface/view?bvid=${bvid}`, {
      credentials: 'include',
      headers
    });
    
    if (!response.ok) {
      throw new Error(`获取视频信息失败: ${response.status}`);
    }
    
    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`API返回错误: ${data.message}`);
    }
    
    const videoData = data.data;
    debug(`获取到视频信息：${videoData.title} (${bvid})`);
    
    return {
      bvid,
      cid: videoData.cid,
      title: videoData.title,
      duration: videoData.duration,
      desc: videoData.desc,
      owner: videoData.owner.name
    };
  } catch (error) {
    debug('获取视频信息失败: ' + error.message);
    throw error;
  }
}

// 获取用户信息和权限
async function getUserInfo() {
  try {
    const headers = await buildHeaders();
    const response = await fetch(`${API_CONFIG.BASE_URL}/x/web-interface/nav`, {
      credentials: 'include',
      headers
    });
    
    const data = await response.json();
    if (data.code !== 0) {
      throw new Error('获取用户信息失败');
    }
    
    const userInfo = {
      isLogin: data.data.isLogin,
      vipType: data.data.vipType,
      vipStatus: data.data.vipStatus,
      allowedQualities: []
    };
    
    // 确定用户可用的视频质量
    for (const [qn, info] of Object.entries(API_CONFIG.QUALITY_LEVELS)) {
      if (
        info.requires === 'none' ||
        (info.requires === 'login' && userInfo.isLogin) ||
        (info.requires === 'vip1' && userInfo.vipType >= 1) ||
        (info.requires === 'vip2' && userInfo.vipType >= 2)
      ) {
        userInfo.allowedQualities.push(parseInt(qn));
      }
    }
    
    debug(`用户信息: 登录=${userInfo.isLogin}, VIP=${userInfo.vipType}, 可用质量=${userInfo.allowedQualities.join(',')}`);
    return userInfo;
  } catch (error) {
    debug('获取用户信息失败: ' + error.message);
    throw error;
  }
}

// 获取视频流信息
async function getPlayUrl(videoInfo, userInfo) {
  try {
    const cookies = await getAllCookies();
    
    // 构建完整的请求参数
    const params = new URLSearchParams({
      bvid: videoInfo.bvid,
      cid: videoInfo.cid,
      qn: Math.max(...userInfo.allowedQualities),
      fnver: 0,
      fnval: 4048,
      fourk: 1,
      platform: 'pc',
      high_quality: 1,
      type: '',
      otype: 'json'
    });

    // 添加必要的认证参数
    if (cookies.bili_jct) {
      params.set('csrf', cookies.bili_jct);
    }

    // 构建完整的headers
    const headers = {
      'User-Agent': navigator.userAgent,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Origin': 'https://www.bilibili.com',
      'Referer': `https://www.bilibili.com/video/${videoInfo.bvid}`,
      'Connection': 'keep-alive',
      'Sec-Fetch-Site': 'same-site',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty'
    };

    // 添加cookie
    if (Object.keys(cookies).length > 0) {
      const cookieString = Object.entries(cookies)
        .map(([name, value]) => `${name}=${value}`)
        .join('; ');
      headers['Cookie'] = cookieString;
    }

    // 尝试从页面获取buvid
    const buvidMatch = document.cookie.match(/buvid3=[^;]+/);
    if (buvidMatch) {
      headers['Cookie'] = headers['Cookie'] ? 
        `${headers['Cookie']}; ${buvidMatch[0]}` : 
        buvidMatch[0];
    }

    // 添加时间戳和随机数防止缓存
    params.set('t', Date.now());
    params.set('r', Math.random().toString(36).slice(2));

    // 首先尝试web接口
    let response = await fetch(`${API_CONFIG.BASE_URL}/x/player/playurl?${params}`, {
      method: 'GET',
      credentials: 'include',
      headers
    });

    if (!response.ok || response.status === 403) {
      // 如果web接口失败，尝试使用app接口
      params.set('platform', 'android');
      params.set('device', 'android');
      params.set('build', '6720300');
      
      response = await fetch(`${API_CONFIG.BASE_URL}/pgc/player/api/playurl?${params}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          ...headers,
          'User-Agent': 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36'
        }
      });
    }

    if (!response.ok) {
      throw new Error(`获取播放地址失败: ${response.status}`);
    }

    const data = await response.json();
    if (data.code !== 0) {
      // 如果返回错误，等待一段时间后重试
      if (data.code === -412 || data.message.includes('神秘力量')) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return getPlayUrl(videoInfo, userInfo); // 递归重试
      }
      throw new Error(`API返回错误: ${data.message}`);
    }

    return data.data;
  } catch (error) {
    debug('获取播放地址失败: ' + error.message);
    throw error;
  }
}

// 选择最佳视频流
function selectBestStream(streams, type = 'video') {
  if (type === 'video') {
    // 按编码优先级过滤
    for (const codec of API_CONFIG.CODEC_PRIORITY) {
      const matchingStreams = streams.filter(s => s.codecs.startsWith(codec));
      if (matchingStreams.length > 0) {
        // 在相同编码中选择最高码率
        return matchingStreams.reduce((best, current) => 
          current.bandwidth > best.bandwidth ? current : best
        );
      }
    }
    return streams[0]; // 如果没有匹配的编码，返回第一个流
  } else {
    // 音频流直接选择最高码率
    return streams.reduce((best, current) => 
      current.bandwidth > best.bandwidth ? current : best
    );
  }
}

// 准备下载信息
async function prepareDownload(playData, videoInfo) {
  try {
    const videoStream = selectBestStream(playData.dash.video, 'video');
    const audioStream = selectBestStream(playData.dash.audio, 'audio');
    
    if (!videoStream || !audioStream) {
      throw new Error('无法找到可用的视频或音频流');
    }
    
    debug(`选择视频流: ${videoStream.id} - ${videoStream.codecs} - ${videoStream.width}x${videoStream.height}`);
    debug(`选择音频流: ${audioStream.id} - ${Math.round(audioStream.bandwidth / 1000)}kbps`);
    
    // 获取cookies和认证信息
    const cookies = await getAllCookies();
    const cookieString = Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    
    // 更新URL中的参数
    const updateUrl = (url, isVideo = true) => {
      const urlObj = new URL(url);
      const newDeadline = Math.floor(Date.now() / 1000) + 3600;
      
      // 清除所有现有参数
      urlObj.search = '';
      const params = new URLSearchParams(urlObj.search);
      
      // 基础参数
      params.set('deadline', newDeadline.toString());
      params.set('platform', 'pc');
      params.set('high_quality', '1');
      params.set('nbs', '1');
      params.set('os', 'pc');
      
      // 添加认证参数
      if (cookies.bili_jct) {
        params.set('csrf', cookies.bili_jct);
      }
      if (cookies.SESSDATA) {
        params.set('session', cookies.SESSDATA);
      }
      
      // 针对不同类型的流添加特定参数
      if (isVideo) {
        params.set('qn', videoStream.id.toString());
        params.set('vtype', 'mp4');
        params.set('fourk', '1');
        params.set('fnver', '0');
        params.set('fnval', '4048');
      } else {
        params.set('qn', audioStream.id.toString());
        params.set('type', 'mp4');
        params.set('mime_type', 'audio/mp4');
        params.set('otype', 'json');
        params.set('pts', '0');
      }
      
      // 添加时间戳和随机数防止缓存
      params.set('t', Date.now().toString());
      params.set('r', Math.random().toString(36).slice(2));
      
      urlObj.search = params.toString();
      return urlObj.toString();
    };
    
    // 构建下载文件名
    const quality = `${videoStream.height}p${videoStream.frameRate > 30 ? videoStream.frameRate : ''}`;
    const codec = videoStream.codecs.split('.')[0];
    const filename = `${videoInfo.title}_${quality}_${codec}.mp4`
      .replace(/[\\/:*?"<>|]/g, '_');
    
    // 构建基础headers
    const baseHeaders = {
      'Referer': 'https://www.bilibili.com',
      'Origin': 'https://www.bilibili.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'identity',
      'Range': 'bytes=0-',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Cookie': cookieString
    };

    // 验证URL是否可访问
    const checkUrl = async (url, headers) => {
      try {
        const response = await fetch(url, {
          method: 'HEAD',
          headers: headers
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return true;
      } catch (error) {
        debug(`URL检查失败: ${url} - ${error.message}`);
        return false;
      }
    };

    // 准备下载配置
    const videoUrl = updateUrl(videoStream.baseUrl, true);
    const audioUrl = updateUrl(audioStream.baseUrl, false);

    // 验证视频和音频URL
    const [videoValid, audioValid] = await Promise.all([
      checkUrl(videoUrl, baseHeaders),
      checkUrl(audioUrl, baseHeaders)
    ]);

    if (!videoValid || !audioValid) {
      throw new Error('无法访问媒体文件，请检查网络连接或重试');
    }

    return {
      video: {
        url: videoUrl,
        headers: {
          ...baseHeaders,
          'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5'
        }
      },
      audio: {
        url: audioUrl,
        headers: {
          ...baseHeaders,
          'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5'
        }
      },
      filename,
      quality,
      videoCodec: videoStream.codecs,
      resolution: `${videoStream.width}x${videoStream.height}`,
      fps: videoStream.frameRate,
      retryConfig: {
        maxRetries: 3,
        retryDelay: 1000,
        currentRetry: 0,
        exponentialBackoff: true
      }
    };
  } catch (error) {
    debug('准备下载信息失败: ' + error.message);
    throw error;
  }
}

// 开始下载流程
async function startDownload() {
  try {
    debug('开始下载流程');
    checkPage();
    
    // 获取视频和用户信息
    const videoInfo = await getVideoInfo();
    const userInfo = await getUserInfo();
    
    // 获取播放数据
    const playData = await getPlayUrl(videoInfo, userInfo);
    
    // 准备下载信息
    const downloadInfo = await prepareDownload(playData, videoInfo);
    
    // 构建下载请求headers
    const headers = await buildHeaders({
      'Accept': '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Range': 'bytes=0-',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Connection': 'keep-alive',
      'DNT': '1'
    });
    // 发送下载请求
    chrome.runtime.sendMessage({
      action: 'download',
      video: downloadInfo.video,
      audio: downloadInfo.audio,
      filename: downloadInfo.filename,
      retryConfig: downloadInfo.retryConfig,
      headers
    }, (response) => {
      if (response && response.success) {
        debug(`下载已开始: ${downloadInfo.filename}`);
        debug(`视频信息: ${downloadInfo.resolution}@${downloadInfo.fps}fps (${downloadInfo.videoCodec})`);
      } else {
        const errorMsg = response ? response.error : '未知错误';
        debug('下载请求失败: ' + errorMsg);
        if (errorMsg.includes('Failed to fetch') || errorMsg.includes('403')) {
          debug('尝试更新认证信息并重试...');
          // 延迟重试
          setTimeout(() => startDownload(), 2000);
        }
      }
    });
    
  } catch (error) {
    debug('下载过程失败: ' + error.message);
    throw error;
  }
}

// 注入下载按钮
async function injectDownloadButton() {
  try {
    // 等待工具栏加载
    const container = await new Promise(resolve => {
      const observer = new MutationObserver((mutations, obs) => {
        const toolbar = document.querySelector('.video-toolbar-left');
        if (toolbar) {
          obs.disconnect();
          resolve(toolbar);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      // 如果已经存在，直接返回
      const existing = document.querySelector('.video-toolbar-left');
      if (existing) {
        observer.disconnect();
        resolve(existing);
      }
    });
    
    if (container) {
      const button = document.createElement('div');
      button.className = 'video-toolbar-left-item';
      button.innerHTML = '<span class="video-toolbar-item-text">下载视频</span>';
      button.onclick = () => {
        button.style.pointerEvents = 'none';
        button.querySelector('span').textContent = '准备下载...';
        
        startDownload()
          .catch(error => {
            debug('下载失败: ' + error.message);
            alert('下载失败: ' + error.message);
          })
          .finally(() => {
            button.style.pointerEvents = '';
            button.querySelector('span').textContent = '下载视频';
          });
      };
      
      container.appendChild(button);
      debug('下载按钮已注入');
    }
  } catch (error) {
    debug('注入下载按钮失败: ' + error.message);
  }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debug('收到消息: ' + JSON.stringify(request));
  
  if (request.action === 'downloadVideo') {
    debug('收到下载请求');
    
    // 检查是否在正确的页面
    if (!window.location.href.includes('bilibili.com/video/')) {
      sendResponse({ success: false, error: '请在B站视频页面使用此功能' });
      return false;
    }
    
    // 异步处理下载
    startDownload()
      .then(() => {
        debug('下载开始成功');
        sendResponse({ success: true });
      })
      .catch(error => {
        debug('下载失败: ' + error.message);
        sendResponse({ success: false, error: error.message });
      });
    
    // 保持消息通道开放以等待异步响应
    return true;
  }
  
  // 对于未知的消息类型
  sendResponse({ success: false, error: '未知的操作请求' });
  return false;
});

// 页面加载完成后注入按钮
window.addEventListener('load', () => {
  injectDownloadButton();
}); 