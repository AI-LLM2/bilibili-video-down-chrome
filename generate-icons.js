const fs = require('fs');
const { execSync } = require('child_process');

// This script assumes you have Inkscape installed
// Alternatively, you can manually convert the SVG to PNG files using any image editor

const sizes = [16, 48, 128];

try {
  console.log('Generating icons...');
  
  sizes.forEach(size => {
    const command = `inkscape -w ${size} -h ${size} images/icon.svg -o images/icon${size}.png`;
    console.log(`Running: ${command}`);
    
    try {
      execSync(command);
      console.log(`Successfully generated ${size}x${size} icon`);
    } catch (error) {
      console.error(`Failed to generate ${size}x${size} icon using Inkscape.`);
      console.error('Please manually convert the SVG to PNG files using an image editor.');
      console.error('You need icon16.png, icon48.png, and icon128.png in the images directory.');
    }
  });
} catch (error) {
  console.error('Error generating icons:', error);
} 