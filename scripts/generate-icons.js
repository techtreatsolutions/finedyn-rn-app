const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, '..', 'src', 'assets', 'logo.png');
const RES_DIR = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

// Android mipmap sizes for app icons
const ICON_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// Splash screen drawable sizes (logo centered)
const SPLASH_SIZES = {
  'drawable-mdpi': 200,
  'drawable-hdpi': 300,
  'drawable-xhdpi': 400,
  'drawable-xxhdpi': 600,
  'drawable-xxxhdpi': 800,
};

async function getImageInfo(imgPath) {
  const meta = await sharp(imgPath).metadata();
  return { width: meta.width, height: meta.height };
}

async function generateAppIcons() {
  console.log('Generating app icons...');
  const info = await getImageInfo(LOGO_PATH);
  console.log(`Logo dimensions: ${info.width}x${info.height}`);

  // The logo is horizontal with the circle icon on the left.
  // Extract just the left portion (the circular icon) for the app icon.
  // The circle icon takes roughly the height of the image as its width.
  const iconRegion = {
    left: 0,
    top: 0,
    width: info.height,  // square crop from left
    height: info.height,
  };

  for (const [folder, size] of Object.entries(ICON_SIZES)) {
    const dir = path.join(RES_DIR, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Regular icon
    await sharp(LOGO_PATH)
      .extract(iconRegion)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(dir, 'ic_launcher.png'));

    // Round icon - same but composited on circular mask
    const roundMask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="white"/></svg>`
    );

    const iconBuffer = await sharp(LOGO_PATH)
      .extract(iconRegion)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();

    await sharp(iconBuffer)
      .composite([{ input: roundMask, blend: 'dest-in' }])
      .png()
      .toFile(path.join(dir, 'ic_launcher_round.png'));

    console.log(`  ${folder}: ${size}x${size} ✓`);
  }
}

async function generateSplashAssets() {
  console.log('Generating splash screen assets...');

  for (const [folder, width] of Object.entries(SPLASH_SIZES)) {
    const dir = path.join(RES_DIR, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Resize logo maintaining aspect ratio
    await sharp(LOGO_PATH)
      .resize(width, null, { fit: 'inside' })
      .png()
      .toFile(path.join(dir, 'splash_logo.png'));

    console.log(`  ${folder}: width=${width} ✓`);
  }
}

async function main() {
  await generateAppIcons();
  await generateSplashAssets();
  console.log('\nDone! Icons and splash assets generated.');
}

main().catch(console.error);
