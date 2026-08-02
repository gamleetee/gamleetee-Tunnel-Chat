import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const manifestPath = resolve(root, 'android/app/src/main/AndroidManifest.xml');
let manifest = await readFile(manifestPath, 'utf8');

if (!manifest.includes('android:host="gamchat.ru"')) {
  const filters = `
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="gamchat.ru" android:pathPrefix="/" />
            </intent-filter>
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="gamchat" />
            </intent-filter>`;
  manifest = manifest.replace('        </activity>', `${filters}\n        </activity>`);
}

if (!manifest.includes('android:usesCleartextTraffic=')) {
  manifest = manifest.replace('<application', '<application android:usesCleartextTraffic="false"');
}
await writeFile(manifestPath, manifest);

const iconSvg = await readFile(resolve(root, '../public/icons/gamchat.svg'), 'utf8');
const iconBase64 = iconSvg.match(/data:image\/(?:png|webp);base64,([^"]+)/u)?.[1];
if (!iconBase64) throw new Error('В GCH-иконке отсутствует встроенное изображение.');
const sourceIcon = Buffer.from(iconBase64, 'base64');
if (sourceIcon.length < 5_000) throw new Error('Исходная GCH-иконка повреждена.');

const resRoot = resolve(root, 'android/app/src/main/res');
const launcherSizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const foregroundSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

for (const [density, size] of Object.entries(launcherSizes)) {
  const directory = resolve(resRoot, `mipmap-${density}`);
  await mkdir(directory, { recursive: true });
  const launcher = await sharp(sourceIcon).resize(size, size).png().toBuffer();
  await writeFile(resolve(directory, 'ic_launcher.png'), launcher);
  await writeFile(resolve(directory, 'ic_launcher_round.png'), launcher);

  const foregroundSize = foregroundSizes[density];
  const inner = Math.round(foregroundSize * 0.72);
  const padding = foregroundSize - inner;
  const top = Math.floor(padding / 2);
  const left = Math.floor(padding / 2);
  const foreground = await sharp(sourceIcon)
    .resize(inner, inner)
    .extend({
      top,
      bottom: padding - top,
      left,
      right: padding - left,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
  await writeFile(resolve(directory, 'ic_launcher_foreground.png'), foreground);
}

const adaptiveDirectory = resolve(resRoot, 'mipmap-anydpi-v26');
await mkdir(adaptiveDirectory, { recursive: true });
const adaptiveIcon = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/gamchat_icon_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
await writeFile(resolve(adaptiveDirectory, 'ic_launcher.xml'), adaptiveIcon);
await writeFile(resolve(adaptiveDirectory, 'ic_launcher_round.xml'), adaptiveIcon);

const valuesDirectory = resolve(resRoot, 'values');
await mkdir(valuesDirectory, { recursive: true });
await writeFile(
  resolve(valuesDirectory, 'gamchat_icon_colors.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources><color name="gamchat_icon_background">#18171D</color></resources>\n'
);

console.log('Configured Android App Links and the purple GCH launcher icon.');
