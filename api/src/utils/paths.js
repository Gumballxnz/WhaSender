const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '../../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const FILES_PATH = process.env.FILES_PATH || path.join(DATA_DIR, 'arquivos');
const SESSIONS_PATH = process.env.SESSIONS_PATH || path.join(DATA_DIR, 'sessions');

function ensureDirExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch {}
  }
}

ensureDirExists(DATA_DIR);
ensureDirExists(FILES_PATH);
ensureDirExists(SESSIONS_PATH);

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  FILES_PATH,
  SESSIONS_PATH,
  ensureDirExists,
};
