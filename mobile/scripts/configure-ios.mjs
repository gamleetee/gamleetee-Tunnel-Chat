import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const appRoot = resolve(root, 'ios/App');
const infoPath = resolve(appRoot, 'App/Info.plist');
const entitlementsPath = resolve(appRoot, 'App/App.entitlements');
const privacyPath = resolve(appRoot, 'PrivacyInfo.xcprivacy');
const projectPath = resolve(appRoot, 'App.xcodeproj/project.pbxproj');

const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>com.apple.developer.associated-domains</key><array><string>applinks:gamchat.ru</string></array></dict></plist>
`;
await writeFile(entitlementsPath, entitlements);

const privacyManifest = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array><string>C617.1</string></array>
    </dict>
  </array>
</dict>
</plist>
`;
await writeFile(privacyPath, privacyManifest);

let info = await readFile(infoPath, 'utf8');
if (!info.includes('<string>gamchat</string>')) {
  const urlTypes = `  <key>CFBundleURLTypes</key>
  <array><dict><key>CFBundleURLName</key><string>ru.gamleetee.gamchat</string><key>CFBundleURLSchemes</key><array><string>gamchat</string></array></dict></array>
`;
  info = info.replace('</dict>\n</plist>', `${urlTypes}</dict>\n</plist>`);
}
if (!info.includes('<key>UIFileSharingEnabled</key>')) {
  const documentSharing = `  <key>UIFileSharingEnabled</key>
  <true/>
  <key>LSSupportsOpeningDocumentsInPlace</key>
  <true/>
`;
  info = info.replace('</dict>\n</plist>', `${documentSharing}</dict>\n</plist>`);
}
await writeFile(infoPath, info);

let project = await readFile(projectPath, 'utf8');
if (!project.includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')) {
  project = project.replaceAll(
    'PRODUCT_BUNDLE_IDENTIFIER = ru.gamleetee.gamchat;',
    'PRODUCT_BUNDLE_IDENTIFIER = ru.gamleetee.gamchat;\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;'
  );
  await writeFile(projectPath, project);
}

const iconSvg = await readFile(resolve(root, '../public/icons/gamchat.svg'), 'utf8');
const iconBase64 = iconSvg.match(/data:image\/(?:png|webp);base64,([^"]+)/u)?.[1];
if (!iconBase64) throw new Error('В GCH-иконке отсутствует встроенное изображение.');
const sourceIcon = Buffer.from(iconBase64, 'base64');
if (sourceIcon.length < 5_000) throw new Error('Исходная GCH-иконка повреждена.');

const iconDirectory = resolve(appRoot, 'App/Assets.xcassets/AppIcon.appiconset');
await rm(iconDirectory, { recursive: true, force: true });
await mkdir(iconDirectory, { recursive: true });

const definitions = [
  ['iphone', '20x20', '2x', 40], ['iphone', '20x20', '3x', 60],
  ['iphone', '29x29', '2x', 58], ['iphone', '29x29', '3x', 87],
  ['iphone', '40x40', '2x', 80], ['iphone', '40x40', '3x', 120],
  ['iphone', '60x60', '2x', 120], ['iphone', '60x60', '3x', 180],
  ['ipad', '20x20', '1x', 20], ['ipad', '20x20', '2x', 40],
  ['ipad', '29x29', '1x', 29], ['ipad', '29x29', '2x', 58],
  ['ipad', '40x40', '1x', 40], ['ipad', '40x40', '2x', 80],
  ['ipad', '76x76', '1x', 76], ['ipad', '76x76', '2x', 152],
  ['ipad', '83.5x83.5', '2x', 167],
  ['ios-marketing', '1024x1024', '1x', 1024]
];

const images = [];
const generatedSizes = new Set();
for (const [idiom, size, scale, pixels] of definitions) {
  const filename = `AppIcon-${pixels}.png`;
  if (!generatedSizes.has(pixels)) {
    await writeFile(resolve(iconDirectory, filename), await sharp(sourceIcon).resize(pixels, pixels).png().toBuffer());
    generatedSizes.add(pixels);
  }
  images.push({ idiom, size, scale, filename });
}

await writeFile(
  resolve(iconDirectory, 'Contents.json'),
  `${JSON.stringify({ images, info: { author: 'gamleetee', version: 1 } }, null, 2)}\n`
);

console.log('Configured iOS Universal Links, document storage privacy and the purple GCH app icon.');
