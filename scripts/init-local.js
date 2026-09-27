import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function initializeLocalFolders() {
    for (const folder of ['logs/decisions', 'logs/audit', 'tmp', 'data', 'uploads', 'artifacts']) {
        mkdirSync(new URL(`../${folder}/`, import.meta.url), { recursive: true });
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    initializeLocalFolders();
    console.log('Initialized ignored local folders: logs, tmp, data, uploads, artifacts.');
}
