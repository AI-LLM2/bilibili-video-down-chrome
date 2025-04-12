# Bilibili Video Downloader Chrome Extension

A Chrome extension that allows you to download videos from Bilibili.

## Features

- Download videos in different qualities (up to 1080p)
- Works with your existing Bilibili login session
- Simple UI for selecting video quality
- Right-click context menu option for quick downloads
- Supports both older video formats and newer DASH formats

## Installation

1. Clone or download this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top right corner
4. Click "Load unpacked" and select the directory containing the extension files
5. The extension is now installed and should appear in your Chrome toolbar

## Usage

### Using the Popup Interface

1. Navigate to a Bilibili video page
2. Click the extension icon in the toolbar
3. Select the desired video quality from the dropdown menu
4. Click "Download Video" to start the download
5. Choose where to save the file when prompted

### Using the Context Menu

1. Navigate to a Bilibili video page
2. Right-click anywhere on the page
3. Select "Download Bilibili Video" from the context menu
4. The download will start automatically with the highest available quality

### About DASH Format Videos

Most newer Bilibili videos use the DASH format, which separates video and audio streams. For these videos:

1. The extension will download both video and audio streams separately
2. Files will be named with `_video.mp4` and `_audio.m4a` suffixes
3. To get a complete video with audio, you'll need to merge these files using a tool like FFmpeg:
   ```
   ffmpeg -i video_file.mp4 -i audio_file.m4a -c:v copy -c:a copy output.mp4
   ```

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