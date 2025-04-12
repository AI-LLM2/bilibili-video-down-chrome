document.addEventListener('DOMContentLoaded', () => {
  const downloadBtn = document.getElementById('download-btn');
  const getWgetBtn = document.getElementById('get-wget-btn');
  const copyCommandsBtn = document.getElementById('copy-commands-btn');
  const wgetCommandsEl = document.getElementById('wget-commands');
  const statusEl = document.getElementById('status');
  const qualitySelect = document.getElementById('quality-select');
  const videoTitleEl = document.getElementById('video-title');
  const notBilibiliEl = document.getElementById('not-bilibili');
  const bilibiliVideoEl = document.getElementById('bilibili-video');
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  // Tab switching logic
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Update active tab
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Show corresponding content
      const tabId = tab.getAttribute('data-tab');
      tabContents.forEach(content => {
        content.classList.remove('active');
      });
      document.getElementById(`${tabId}-tab`).classList.add('active');
    });
  });

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
  
  // Handle get wget commands button click
  getWgetBtn.addEventListener('click', () => {
    getWgetBtn.disabled = true;
    wgetCommandsEl.value = 'Generating commands...';
    copyCommandsBtn.classList.add('hidden');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      const qualityId = qualitySelect.value;

      chrome.tabs.sendMessage(currentTab.id, { 
        action: 'getWgetCommands', 
        qualityId: qualityId 
      }, (response) => {
        getWgetBtn.disabled = false;
        
        if (chrome.runtime.lastError || !response || !response.success) {
          wgetCommandsEl.value = 'Failed to generate commands. Please try again.';
          return;
        }

        // Display commands in textarea
        wgetCommandsEl.value = response.commands;
        copyCommandsBtn.classList.remove('hidden');
      });
    });
  });
  
  // Handle copy commands button click
  copyCommandsBtn.addEventListener('click', () => {
    wgetCommandsEl.select();
    document.execCommand('copy');
    
    // Indicate copied
    const originalText = copyCommandsBtn.textContent;
    copyCommandsBtn.textContent = 'Copied!';
    setTimeout(() => {
      copyCommandsBtn.textContent = originalText;
    }, 2000);
  });
}); 