// Background service worker to handle downloads
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startDownload') {
    // Download the video using Chrome's download API
    chrome.downloads.download({
      url: request.url,
      filename: request.filename,
      saveAs: true,
      headers: Object.entries(request.headers).map(([name, value]) => ({ name, value }))
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Download failed:', chrome.runtime.lastError);
      } else {
        console.log('Download started with ID:', downloadId);
      }
    });
  }
});

// Set up the context menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'downloadBilibili',
    title: 'Download Bilibili Video',
    contexts: ['page'],
    documentUrlPatterns: ['*://*.bilibili.com/video/*']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'downloadBilibili') {
    chrome.tabs.sendMessage(tab.id, { action: 'getVideoInfo' }, (response) => {
      if (!response || !response.success) {
        console.error('Could not get video info');
        return;
      }
      
      // Use the highest quality by default
      const highestQuality = response.qualities[0].id;
      
      chrome.tabs.sendMessage(tab.id, { 
        action: 'downloadVideo', 
        qualityId: highestQuality 
      });
    });
  }
}); 