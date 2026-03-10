const fs = require('fs');
const path = require('path');

const cliptoolDir = path.join(__dirname, '..');
const outDir = path.join(cliptoolDir, 'out');
const uiDir = path.join(cliptoolDir, '..', 'clipagent', 'ui');
const uiOutDir = path.join(uiDir, 'out');

try {
  fs.rmSync(uiOutDir, { recursive: true, force: true });
} catch (_) {}
fs.mkdirSync(uiDir, { recursive: true });
fs.renameSync(outDir, uiOutDir);
