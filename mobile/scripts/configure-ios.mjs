import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const appRoot = resolve(process.cwd(), 'ios/App');
const infoPath = resolve(appRoot, 'App/Info.plist');
const entitlementsPath = resolve(appRoot, 'App/App.entitlements');
const projectPath = resolve(appRoot, 'App.xcodeproj/project.pbxproj');

const entitlements = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.associated-domains</key>
  <array>
    <string>applinks:gamchat.ru</string>
  </array>
</dict>
</plist>
`;
await writeFile(entitlementsPath, entitlements);

let info = await readFile(infoPath, 'utf8');
if (!info.includes('<string>gamchat</string>')) {
  const urlTypes = `  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>ru.gamleetee.gamchat</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>gamchat</string>
      </array>
    </dict>
  </array>
`;
  info = info.replace('</dict>\n</plist>', `${urlTypes}</dict>\n</plist>`);
  await writeFile(infoPath, info);
}

let project = await readFile(projectPath, 'utf8');
if (!project.includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')) {
  project = project.replaceAll(
    'PRODUCT_BUNDLE_IDENTIFIER = ru.gamleetee.gamchat;',
    'PRODUCT_BUNDLE_IDENTIFIER = ru.gamleetee.gamchat;\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/App.entitlements;'
  );
  await writeFile(projectPath, project);
}

console.log('Configured iOS Universal Links for https://gamchat.ru.');
