import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const [platform] = process.argv.slice(2);
if (!['android', 'ios'].includes(platform)) {
  throw new Error('Укажите платформу android или ios.');
}

await rm(resolve(process.cwd(), platform), { recursive: true, force: true });
console.log(`Removed generated ${platform} project.`);
