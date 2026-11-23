import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => readFile(path.join(root, p), 'utf8');
await mkdir(path.join(root, 'dist'), { recursive: true });
const [core, plugin, html, css, bridge, ui] = await Promise.all([
  read('src/core.js'), read('src/plugin.js'), read('src/ui.html'), read('src/style.css'), read('src/message-bridge.js'), read('src/ui.js')
]);
await writeFile(path.join(root, 'dist/code.js'), core + '\n' + plugin);
await writeFile(path.join(root, 'dist/ui.html'), html.replace('/* STYLES */', css).replace('/* UI_SCRIPT */', bridge+'\n'+ui));
console.log('Built dist/code.js and dist/ui.html');
