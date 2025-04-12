document.addEventListener('DOMContentLoaded', () => {
  const downloadBtn = document.getElementById('download-btn');
  const statusEl = document.getElementById('status');
  const qualitySelect = document.getElementById('quality-select');
  const videoTitleEl = document.getElementById('video-title');
  const notBilibiliEl = document.getElementById('not-bilibili');
  const bilibiliVideoEl = document.getElementById('bilibili-video');

  // Check if we're on a Bilibili video page
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const url = currentTab.url;
    
    if (!url.match(/bilibili\.com\/video\//)) {
      notBilibiliEl.classList.remove('hidden');
      bilibiliVideoEl.classList.add('hidden');
      return;
    }

    // We're on a Bilibili video page, get the video info
    chrome.tabs.sendMessage(currentTab.id, { action: 'getVideoInfo' }, (response) => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = 'Error: Please refresh the page and try again.';
        return;
      }

      if (!response || !response.success) {
        statusEl.textContent = 'Error: Could not retrieve video information.';
        return;
      }

      // Update UI with video info
      videoTitleEl.textContent = response.title;
      
      // Populate quality options
      qualitySelect.innerHTML = '';
      response.qualities.forEach(quality => {
        const option = document.createElement('option');
        option.value = quality.id;
        option.textContent = quality.name;
        qualitySelect.appendChild(option);
      });
    });
  });

  // Handle download button click
  downloadBtn.addEventListener('click', () => {
    downloadBtn.disabled = true;
    statusEl.textContent = 'Requesting download...';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      const qualityId = qualitySelect.value;

      chrome.tabs.sendMessage(currentTab.id, { 
        action: 'downloadVideo', 
        qualityId: qualityId 
      }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          statusEl.textContent = 'Download failed. Please try again.';
          downloadBtn.disabled = false;
          return;
        }

        // If there's a specific message in the response, show it
        if (response.message) {
          statusEl.textContent = response.message;
        } else {
          statusEl.textContent = 'Download started!';
        }
        
        setTimeout(() => {
          downloadBtn.disabled = false;
        }, 3000);
      });
    });
  });
}); 