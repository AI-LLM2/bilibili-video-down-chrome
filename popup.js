document.addEventListener('DOMContentLoaded', function() {
  const downloadBtn = document.getElementById('downloadBtn');
  const statusDiv = document.getElementById('status');

  // 添加调试日志函数
  function logStatus(message, isError = false) {
    console.log(`[Popup] ${message}`);
    statusDiv.textContent = message;
    if (isError) {
      statusDiv.style.color = 'red';
    } else {
      statusDiv.style.color = 'black';
    }
  }

  downloadBtn.addEventListener('click', () => {
    try {
      logStatus('正在检查当前页面...');
      
      // Get the current active tab
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const tab = tabs[0];
        console.log('Current tab:', tab);
        
        if (!tab.url.includes('bilibili.com')) {
          logStatus('请导航到Bilibili视频页面', true);
          return;
        }

        logStatus('正在获取视频信息...');
        
        // Send message to content script to start download
        chrome.tabs.sendMessage(tab.id, { action: 'downloadVideo' }, (response) => {
          console.log('Response from content script:', response);
          
          if (chrome.runtime.lastError) {
            console.error('Runtime error:', chrome.runtime.lastError);
            logStatus(`错误: ${chrome.runtime.lastError.message}`, true);
            return;
          }

          if (response && response.success) {
            logStatus('下载已开始！');
          } else {
            const errorMessage = response?.error || '未知错误';
            console.error('Download failed:', errorMessage);
            logStatus(`下载失败: ${errorMessage}`, true);
          }
        });
      });
    } catch (error) {
      console.error('Error in popup:', error);
      logStatus(`错误: ${error.message}`, true);
    }
  });
}); 