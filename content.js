// Main content script that runs on Bilibili video pages
(() => {
  // Helper function to extract video ID from URL
  function getVideoId() {
    const match = location.pathname.match(/\/video\/([A-Za-z0-9]+)/);
    return match ? match[1] : null;
  }

  // Helper function to get CSRF token from cookies
  function getCsrfToken() {
    const match = document.cookie.match(/bili_jct=([^;]+)/);
    return match ? match[1] : '';
  }

  // Helper function to fetch video information
  async function fetchVideoInfo() {
    const videoId = getVideoId();
    if (!videoId) {
      return { success: false, message: 'Could not find video ID' };
    }

    try {
      // Get video basic info
      const infoResponse = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${videoId}`);
      const infoData = await infoResponse.json();
      
      if (infoData.code !== 0) {
        throw new Error(`Failed to get video info: ${infoData.message}`);
      }

      const cid = infoData.data.cid;
      const title = infoData.data.title;

      // Get video playurl (contains stream URLs)
      const playurlResponse = await fetch(`https://api.bilibili.com/x/player/playurl?bvid=${videoId}&cid=${cid}&qn=116&fnval=16&fourk=1`, {
        headers: {
          'Referer': location.href
        }
      });
      const playurlData = await playurlResponse.json();
      
      if (playurlData.code !== 0) {
        throw new Error(`Failed to get playurl: ${playurlData.message}`);
      }

      // Extract available qualities
      let qualities = [];
      
      // New API format (dash)
      if (playurlData.data && playurlData.data.accept_quality && playurlData.data.accept_description) {
        qualities = playurlData.data.accept_quality.map((q, index) => {
          return {
            id: q,
            name: playurlData.data.accept_description[index]
          };
        });
      } 
      // If we have dash format data but no accept_quality
      else if (playurlData.data && playurlData.data.dash && playurlData.data.dash.video) {
        // Extract qualities from dash video array
        const uniqueQualities = new Set();
        playurlData.data.dash.video.forEach(video => {
          if (video.id && !uniqueQualities.has(video.id)) {
            uniqueQualities.add(video.id);
            qualities.push({
              id: video.id,
              name: getQualityName(video.id, video.width, video.height)
            });
          }
        });
        
        // Sort by quality (highest first)
        qualities.sort((a, b) => b.id - a.id);
      }
      
      // Fallback - add at least one quality option
      if (qualities.length === 0) {
        qualities.push({
          id: 80, // Default to 1080p
          name: '1080P'
        });
      }

      return {
        success: true,
        videoId,
        cid,
        title,
        qualities
      };
    } catch (error) {
      console.error('Error fetching video info:', error);
      return { success: false, message: error.message };
    }
  }

  // Helper function to get quality name from ID
  function getQualityName(id, width, height) {
    const qualityMap = {
      120: '4K',
      116: '1080P 60FPS',
      112: '1080P+',
      80: '1080P',
      74: '720P 60FPS',
      64: '720P',
      32: '480P',
      16: '360P'
    };
    
    if (qualityMap[id]) {
      return qualityMap[id];
    }
    
    // Generate name based on resolution if available
    if (width && height) {
      return `${height}P`;
    }
    
    return `Quality ${id}`;
  }

  // Helper function to download video
  async function downloadVideo(qualityId) {
    const videoId = getVideoId();
    if (!videoId) {
      return { success: false, message: 'Could not find video ID' };
    }

    try {
      // First get cid from video info
      const infoResponse = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${videoId}`);
      const infoData = await infoResponse.json();
      
      if (infoData.code !== 0) {
        throw new Error(`Failed to get video info: ${infoData.message}`);
      }

      const cid = infoData.data.cid;
      const title = infoData.data.title;

      // Get download URL with higher fnval for better format support
      // fnval=4048 requests more formats including DASH with Dolby audio
      const playurlResponse = await fetch(`https://api.bilibili.com/x/player/playurl?bvid=${videoId}&cid=${cid}&qn=${qualityId}&fnval=4048&fourk=1`, {
        headers: {
          'Referer': location.href
        }
      });
      const playurlData = await playurlResponse.json();
      
      if (playurlData.code !== 0) {
        throw new Error(`Failed to get playurl: ${playurlData.message}`);
      }

      // Extract video URL based on available data structure
      let videoUrl = '';
      let audioUrl = '';
      let isDash = false;
      
      // Check for dash format (newer videos)
      if (playurlData.data && playurlData.data.dash) {
        isDash = true;
        
        // Find the video with the selected quality or the highest available
        const videoStreams = playurlData.data.dash.video || [];
        let selectedVideoStream = null;
        
        if (videoStreams.length > 0) {
          // Try to find the stream with requested quality
          selectedVideoStream = videoStreams.find(v => v.id === parseInt(qualityId));
          
          // If not found, use the highest quality
          if (!selectedVideoStream) {
            selectedVideoStream = videoStreams[0];
          }
          
          videoUrl = selectedVideoStream.baseUrl || selectedVideoStream.base_url;
          console.log('Using dash video URL:', videoUrl);
        }
        
        // Get audio stream (typically the first one has the best quality)
        const audioStreams = playurlData.data.dash.audio || [];
        if (audioStreams.length > 0) {
          audioUrl = audioStreams[0].baseUrl || audioStreams[0].base_url;
          console.log('Using dash audio URL:', audioUrl);
        }
      } 
      // Check for durl format (older videos)
      else if (playurlData.data && playurlData.data.durl && playurlData.data.durl.length > 0) {
        videoUrl = playurlData.data.durl[0].url;
        console.log('Using durl format URL:', videoUrl);
      } else {
        throw new Error('Could not find valid video URL in API response');
      }
      
      if (!videoUrl) {
        throw new Error('Empty video URL found in API response');
      }
      
      // For DASH format, we need to download both video and audio separately
      if (isDash && audioUrl) {
        // Download video first
        chrome.runtime.sendMessage({
          action: 'startDownload',
          url: videoUrl,
          filename: `${title}_video.mp4`,
          headers: {
            'Referer': 'https://www.bilibili.com/',
            'User-Agent': navigator.userAgent
          }
        });
        
        // Then download audio
        chrome.runtime.sendMessage({
          action: 'startDownload',
          url: audioUrl,
          filename: `${title}_audio.m4a`,
          headers: {
            'Referer': 'https://www.bilibili.com/',
            'User-Agent': navigator.userAgent
          }
        });
        
        return { 
          success: true, 
          message: 'Downloading video and audio separately. You will need to combine them using a tool like FFmpeg.'
        };
      } else {
        // For durl format or when audio is not available, just download the video
        chrome.runtime.sendMessage({
          action: 'startDownload',
          url: videoUrl,
          filename: `${title}.mp4`,
          headers: {
            'Referer': 'https://www.bilibili.com/',
            'User-Agent': navigator.userAgent
          }
        });
        
        return { success: true };
      }
    } catch (error) {
      console.error('Error downloading video:', error);
      return { success: false, message: error.message };
    }
  }

  // Helper function to generate wget commands and FFmpeg instructions
  function generateWgetCommands(title, videoUrl, audioUrl, isDash) {
    const safeTitle = title.replace(/[^\w\s]/gi, '_'); // Replace special chars
    const userAgent = navigator.userAgent;
    let commands = '';
    
    if (isDash && audioUrl) {
      // Generate wget command for video
      commands += `# Download video stream\nwget --header="Referer: https://www.bilibili.com" \\\n     --user-agent="${userAgent}" \\\n     -O "${safeTitle}_video.m4s" "${videoUrl}"\n\n`;
      
      // Generate wget command for audio
      commands += `# Download audio stream\nwget --header="Referer: https://www.bilibili.com" \\\n     --user-agent="${userAgent}" \\\n     -O "${safeTitle}_audio.m4s" "${audioUrl}"\n\n`;
      
      // Generate FFmpeg command to merge
      commands += `# Merge video and audio with FFmpeg\nffmpeg -i "${safeTitle}_video.m4s" -i "${safeTitle}_audio.m4s" -c:v copy -c:a copy -movflags +faststart "${safeTitle}.mp4"`;
    } else {
      // Generate wget command for direct video download
      commands += `# Download video\nwget --header="Referer: https://www.bilibili.com" \\\n     --user-agent="${userAgent}" \\\n     -O "${safeTitle}.mp4" "${videoUrl}"`;
    }
    
    return {
      success: true,
      type: 'wget_commands',
      title: safeTitle,
      commands: commands,
      isDash: isDash,
      videoUrl: videoUrl,
      audioUrl: audioUrl || null
    };
  }

  // Helper function to get wget commands for downloading
  async function getWgetCommands(qualityId) {
    const videoId = getVideoId();
    if (!videoId) {
      return { success: false, message: 'Could not find video ID' };
    }

    try {
      // First get cid from video info
      const infoResponse = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${videoId}`);
      const infoData = await infoResponse.json();
      
      if (infoData.code !== 0) {
        throw new Error(`Failed to get video info: ${infoData.message}`);
      }

      const cid = infoData.data.cid;
      const title = infoData.data.title;

      // Get download URL with higher fnval for better format support
      const playurlResponse = await fetch(`https://api.bilibili.com/x/player/playurl?bvid=${videoId}&cid=${cid}&qn=${qualityId}&fnval=4048&fourk=1`, {
        headers: {
          'Referer': location.href
        }
      });
      const playurlData = await playurlResponse.json();
      
      if (playurlData.code !== 0) {
        throw new Error(`Failed to get playurl: ${playurlData.message}`);
      }

      // Extract video URL based on available data structure
      let videoUrl = '';
      let audioUrl = '';
      let isDash = false;
      
      // Check for dash format (newer videos)
      if (playurlData.data && playurlData.data.dash) {
        isDash = true;
        
        // Find the video with the selected quality or the highest available
        const videoStreams = playurlData.data.dash.video || [];
        let selectedVideoStream = null;
        
        if (videoStreams.length > 0) {
          // Try to find the stream with requested quality
          selectedVideoStream = videoStreams.find(v => v.id === parseInt(qualityId));
          
          // If not found, use the highest quality
          if (!selectedVideoStream) {
            selectedVideoStream = videoStreams[0];
          }
          
          videoUrl = selectedVideoStream.baseUrl || selectedVideoStream.base_url;
        }
        
        // Get audio stream (typically the first one has the best quality)
        const audioStreams = playurlData.data.dash.audio || [];
        if (audioStreams.length > 0) {
          audioUrl = audioStreams[0].baseUrl || audioStreams[0].base_url;
        }
      } 
      // Check for durl format (older videos)
      else if (playurlData.data && playurlData.data.durl && playurlData.data.durl.length > 0) {
        videoUrl = playurlData.data.durl[0].url;
      } else {
        throw new Error('Could not find valid video URL in API response');
      }
      
      if (!videoUrl) {
        throw new Error('Empty video URL found in API response');
      }
      
      // Generate wget commands and FFmpeg instructions
      return generateWgetCommands(title, videoUrl, audioUrl, isDash);
    } catch (error) {
      console.error('Error generating wget commands:', error);
      return { success: false, message: error.message };
    }
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getVideoInfo') {
      fetchVideoInfo().then(sendResponse);
      return true; // Required for async sendResponse
    } else if (request.action === 'downloadVideo') {
      downloadVideo(request.qualityId).then(sendResponse);
      return true; // Required for async sendResponse
    } else if (request.action === 'getWgetCommands') {
      // Handle request for wget commands
      getWgetCommands(request.qualityId).then(sendResponse);
      return true; // Required for async sendResponse
    }
  });
})(); 