# Bilibili Video Downloader Chrome Extension

A Chrome extension that allows you to download videos from Bilibili.

## Features

- Download videos in different qualities (up to 1080p)
- Works with your existing Bilibili login session
- Simple UI for selecting video quality
- Right-click context menu option for quick downloads
- Supports both older video formats and newer DASH formats
- Generate wget commands for terminal downloading
- FFmpeg commands for merging video and audio streams

## Installation

1. Clone or download this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top right corner
4. Click "Load unpacked" and select the directory containing the extension files
5. The extension is now installed and should appear in your Chrome toolbar

## Usage

### Using the Browser Download

1. Navigate to a Bilibili video page
2. Click the extension icon in the toolbar
3. Make sure you're on the "Browser Download" tab
4. Select the desired video quality from the dropdown menu
5. Click "Download Video" to start the download
6. Choose where to save the file when prompted

### Using Terminal Download (wget + ffmpeg)

1. Navigate to a Bilibili video page
2. Click the extension icon in the toolbar
3. Click the "Terminal Download" tab
4. Select the desired video quality from the dropdown menu
5. Click "Generate wget Commands"
6. Copy the commands using the "Copy Commands" button
7. Paste and run the commands in your terminal
8. For DASH format videos, use the provided ffmpeg command to merge the video and audio files

### Using the Context Menu

1. Navigate to a Bilibili video page
2. Right-click anywhere on the page
3. Select "Download Bilibili Video" from the context menu
4. The download will start automatically with the highest available quality

### About DASH Format Videos

Most newer Bilibili videos use the DASH format, which separates video and audio streams. For these videos:

1. When using browser download:
   - The extension will download both video and audio streams separately
   - Files will be named with `_video.mp4` and `_audio.m4a` suffixes
   
2. When using terminal download:
   - The extension generates wget commands for both streams
   - It also provides an ffmpeg command to combine them:
   
   ```
   ffmpeg -i video_file.m4s -i audio_file.m4s -c:v copy -c:a copy -movflags +faststart output.mp4
   ```

## Requirements for Terminal Download

- [wget](https://www.gnu.org/software/wget/) for downloading files via terminal
- [FFmpeg](https://ffmpeg.org/) for merging video and audio streams

## Note on Icons

The extension includes an SVG icon and placeholder PNG files. If you want to generate proper PNG icons:

1. You can use the included `generate-icons.js` script if you have Node.js and Inkscape installed
2. Alternatively, use any image editor to convert the SVG to PNG files in sizes 16x16, 48x48, and 128x128
3. Save the PNG files in the `images` directory as `icon16.png`, `icon48.png`, and `icon128.png`

## Limitations

- This extension relies on Bilibili's API, which may change over time
- It requires you to be logged in to access higher quality videos
- It may not work for all types of Bilibili content (e.g., live streams)
- For DASH format videos, you need to manually merge video and audio files

## License

MIT 