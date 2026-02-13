const fs = require('fs');

const iconPath = './public/icon.png';
const svgPath = './public/icon_padded.svg';

try {
    const base64 = fs.readFileSync(iconPath).toString('base64');
    const svgContent = `<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="white"/>
  <image href="data:image/png;base64,${base64}" x="76.8" y="76.8" width="358.4" height="358.4"/>
</svg>`;
    fs.writeFileSync(svgPath, svgContent);
    console.log('Successfully created self-contained icon_padded.svg');
} catch (err) {
    console.error('Error processing icon:', err.message);
    process.exit(1);
}
