#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const envFile = path.join(rootDir, '.env');
const envExample = path.join(rootDir, '.env.example');

if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
  fs.copyFileSync(envExample, envFile);
  console.log('[WhaSender] Arquivo .env inicial criado a partir de .env.example');
}

const dataDir = path.join(rootDir, 'data');
const arquivosDir = path.join(dataDir, 'arquivos');
const sessionsDir = path.join(dataDir, 'sessions');

[dataDir, arquivosDir, sessionsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

console.log('=============================================');
console.log('         WhaSender - Plataforma Aberta       ');
console.log('    Automação, Geração de Leads & Disparos   ');
console.log('=============================================\n');

const apiProcess = spawn('node', [path.join(rootDir, 'api/src/index.js')], {
  cwd: rootDir,
  stdio: 'inherit',
  env: process.env,
});

apiProcess.on('error', (err) => {
  console.error('[WhaSender] Falha ao iniciar a API:', err.message);
  process.exit(1);
});

apiProcess.on('exit', (code) => {
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  apiProcess.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  apiProcess.kill('SIGTERM');
  process.exit(0);
});
