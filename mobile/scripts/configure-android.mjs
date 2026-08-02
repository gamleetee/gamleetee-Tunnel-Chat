import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const manifestPath = resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml');
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
console.log('Configured Android App Links for https://gamchat.ru.');
