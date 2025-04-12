// 发送调试信息
function sendDebugMessage(type, text) {
  chrome.runtime.sendMessage({
    type: type,
    text: text
  });
  console.log(`[Content Script][${type}] ${text}`); // 同时在控制台输出
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
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Origin': 'https://www.bilibili.com',
    'Referer': 'https://www.bilibili.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'User-Agent': navigator.userAgent
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
      { 
        action: 'getCookies',
        domain: '.bilibili.com',
        details: {
          domain: '.bilibili.com'
        }
      }, 
      (response) => {
        if (chrome.runtime.lastError) {
          debug('获取cookies失败: ' + chrome.runtime.lastError.message);
          reject(chrome.runtime.lastError);
        } else if (response && response.cookies) {
          const cookieObj = {};
          response.cookies.forEach(cookie => {
            cookieObj[cookie.name] = cookie.value;
          });
          debug('成功获取cookies');
          resolve(cookieObj);
        } else {
          debug('获取cookies失败: 响应格式错误');
          reject(new Error('获取cookies失败'));
        }
      }
    );
  });
}

// 构建API请求headers
async function buildHeaders(extraHeaders = {}) {
  try {
    const cookies = await getAllCookies();
    const cookieString = Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');

    return {
      ...API_CONFIG.DEFAULT_HEADERS,
      'Cookie': cookieString,
      ...extraHeaders
    };
  } catch (error) {
    debug('构建headers失败: ' + error.message);
    throw error;
  }
}

// 检查响应状态
function checkResponse(response, context = '') {
  if (!response.ok) {
    const error = new Error(`${context} 失败: HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response;
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

// 获取视频流
async function getPlayUrl(videoInfo, userInfo) {
  try {
    const headers = await buildHeaders();
    
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

    const response = await fetch(`${API_CONFIG.BASE_URL}/x/player/playurl?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
      headers
    });

    const data = await checkResponse(response, '获取视频流').json();
    
    if (data.code !== 0) {
      throw new Error(`API返回错误: ${data.message}`);
    }

    return data.data;
  } catch (error) {
    debug('获取视频流失败: ' + error.message);
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
    
    // 更新URL中的deadline参数
    const updateDeadline = (url) => {
      const urlObj = new URL(url);
      const newDeadline = Math.floor(Date.now() / 1000) + 3600;
      urlObj.searchParams.set('deadline', newDeadline);
      return urlObj.toString();
    };
    
    // 构建下载文件名
    const quality = `${videoStream.height}p${videoStream.frameRate > 30 ? videoStream.frameRate : ''}`;
    const codec = videoStream.codecs.split('.')[0];
    const filename = `${videoInfo.title}_${quality}_${codec}.mp4`
      .replace(/[\\/:*?"<>|]/g, '_'); // 替换非法字符
    
    return {
      video: updateDeadline(videoStream.baseUrl),
      audio: updateDeadline(audioStream.baseUrl),
      filename,
      quality,
      videoCodec: videoStream.codecs,
      resolution: `${videoStream.width}x${videoStream.height}`,
      fps: videoStream.frameRate
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
      videoUrl: downloadInfo.video,
      audioUrl: downloadInfo.audio,
      filename: downloadInfo.filename,
      headers
    }, (response) => {
      if (response && response.success) {
        debug(`下载已开始: ${downloadInfo.filename}`);
        debug(`视频信息: ${downloadInfo.resolution}@${downloadInfo.fps}fps (${downloadInfo.videoCodec})`);
      } else {
        debug('下载请求失败: ' + (response ? response.error : '未知错误'));
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
  if (request.action === 'downloadVideo') {
    debug('收到下载请求');
    startDownload()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// 页面加载完成后注入按钮
window.addEventListener('load', () => {
  injectDownloadButton();
}); 