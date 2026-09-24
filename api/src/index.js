const path = require('path');
require('dotenv').config({ path: process.env.ENV_PATH || path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { fork } = require('child_process');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const cors = require('cors');

const db = require('./db');

const authRoutes = require('./routes/auth');
const contactsRoutes = require('./routes/contacts');
const configRoutes = require('./routes/config');
const dispatchRoutes = require('./routes/dispatch');
const filesRoutes = require('./routes/files');
const authMiddleware = require('./middleware/auth');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
const server = createServer(app);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(authMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/settings', configRoutes);
app.use('/api/dispatch', dispatchRoutes);
app.use('/api/files', filesRoutes);

app.get('/api/bot/status', (req, res) => {
  res.json({ status: botStatus, pairingCode: lastPairingCode });
});

app.post('/api/bot/pair', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Número de telefone é obrigatório' });

  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 10) return res.status(400).json({ error: 'Número de telefone inválido' });

  lastPairingCode = null;
  botProcess?.send({ type: 'SET_PAIRING_PHONE', phone: cleanPhone });
  res.json({ message: 'Código de pareamento será gerado. Aguarde...', phone: cleanPhone });
});

app.post('/api/bot/qr', (req, res) => {
  lastPairingCode = null;
  botProcess?.send({ type: 'USE_QR' });
  res.json({ message: 'Trocando para modo QR Code...' });
});

app.post('/api/bot/logout', (req, res) => {
  botProcess?.send({ type: 'LOGOUT' });
  lastPairingCode = null;
  res.json({ message: 'Desconectando sessão...' });
});

app.post('/api/bot/stop', (req, res) => {
  botProcess?.send({ type: 'STOP_CONNECTION' });
  lastPairingCode = null;
  res.json({ message: 'Conexão interrompida.' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), botStatus });
});

const wss = new WebSocketServer({ server, path: '/ws' });

function broadcastWS(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

wss.on('connection', (ws, req) => {

  const url = new URL(req.url, 'wss://x');
  const token = url.searchParams.get('token');

  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    ws.close(4001, 'Não autorizado');
    return;
  }

  console.log('[WS] Cliente conectado');
  ws.send(JSON.stringify({ type: 'CONNECTED' }));
  ws.send(JSON.stringify({ type: 'BOT_STATUS', status: botStatus }));

  if (lastPairingCode && botStatus === 'pairing') {
    ws.send(JSON.stringify({ type: 'PAIRING_CODE', payload: lastPairingCode }));
  }

  ws.on('close', () => {
    console.log('[WS] Cliente desconectado');
  });
});

let botStatus = 'disconnected';
let botProcess = null;
let lastPairingCode = null;

function startBotProcess() {
  const botPath = path.join(__dirname, '../../bot/src/index.js');

  botProcess = fork(botPath, [], {
    env: { ...process.env },
    silent: false,
  });

  console.log('[API] Bot iniciado como processo filho (PID:', botProcess.pid, ')');

  botProcess.on('message', (msg) => {
    switch (msg.type) {
      case 'QR':
        botStatus = 'qr';
        lastPairingCode = null;
        broadcastWS({ type: 'QR', payload: msg.payload });
        break;

      case 'PAIRING_CODE':
        botStatus = 'pairing';
        lastPairingCode = msg.payload;
        console.log(`[API] Código de pareamento gerado: ${msg.payload}`);
        broadcastWS({ type: 'PAIRING_CODE', payload: msg.payload, phone: msg.phone });
        break;

      case 'PAIRING_CODE_ERROR':
        console.error('[API] Erro no código de pareamento:', msg.message);
        broadcastWS({ type: 'PAIRING_CODE_ERROR', message: msg.message });
        break;

      case 'PAIRING_CODE_EXPIRED':
        lastPairingCode = null;
        botStatus = 'disconnected';
        broadcastWS({ type: 'PAIRING_CODE_EXPIRED' });
        broadcastWS({ type: 'BOT_STATUS', status: 'disconnected' });
        break;

      case 'CONNECTED':
        botStatus = 'connected';
        lastPairingCode = null;
        dispatchRoutes.updateBotStatus('connected');
        broadcastWS({ type: 'BOT_STATUS', status: 'connected' });
        break;

      case 'LOGGED_OUT':
        botStatus = 'disconnected';
        lastPairingCode = null;
        dispatchRoutes.updateBotStatus('disconnected');
        broadcastWS({ type: 'BOT_STATUS', status: 'disconnected' });
        break;

      case 'BOT_STATUS':
        botStatus = msg.status;
        dispatchRoutes.updateBotStatus(msg.status);
        broadcastWS({ type: 'BOT_STATUS', status: msg.status });
        break;

      case 'PROGRESS':
        dispatchRoutes.handleProgress(msg.data);
        break;

      case 'ERROR':
        console.error('[Bot Error]', msg.message);
        broadcastWS({ type: 'BOT_ERROR', message: msg.message });
        break;
    }
  });

  botProcess.on('exit', (code) => {
    console.log(`[API] Bot encerrado com código ${code}`);
    botStatus = 'disconnected';
    dispatchRoutes.updateBotStatus('disconnected');
    broadcastWS({ type: 'BOT_STATUS', status: 'disconnected' });

    if (code !== 0) {
      console.log('[API] Reiniciando bot em 10s...');
      setTimeout(() => startBotProcess(), 10000);
    }
  });

  dispatchRoutes.init(botProcess, broadcastWS);
}

let scheduledJob = null;

function toCronUTC(timeCAT) {
  const [h, m] = timeCAT.split(':').map(Number);
  const hourUTC = (h - 2 + 24) % 24;
  return `${m} ${hourUTC} * * *`;
}

function setupSchedule() {

  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
  }

  const settings = {};
  db.prepare('SELECT key, value FROM settings').all()
    .forEach(row => { settings[row.key] = row.value; });

  if (settings.schedule_enabled !== 'true') {
    console.log('[Cron] Agendamento desativado');
    return;
  }

  const cronExpr = toCronUTC(settings.schedule_time || '15:00');
  console.log(`[Cron] Agendamento ativado: ${settings.schedule_time} CAT → cron UTC: ${cronExpr}`);

  scheduledJob = cron.schedule(cronExpr, () => {
    console.log('[Cron] ⏰ Disparo agendado iniciando...');

    if (botStatus !== 'connected') {
      console.log('[Cron] Bot não está conectado — disparo cancelado');
      broadcastWS({ type: 'CRON_SKIPPED', reason: 'Bot desconectado' });
      return;
    }

    const maxCount = parseInt(settings.max_per_dispatch) || 104;
    const delayMs = parseInt(settings.delay_ms) || 30000;

    const contacts = db.prepare('SELECT * FROM contacts WHERE active = 1 ORDER BY id ASC LIMIT ?')
      .all(maxCount);

    if (contacts.length === 0) {
      console.log('[Cron] Nenhum contato ativo — disparo cancelado');
      return;
    }

    const session = db.prepare('INSERT INTO dispatch_sessions (total, status) VALUES (?, ?)')
      .run(contacts.length, 'RUNNING');

    const queue = contacts.map(c => ({
      jid: `${c.phone.replace(/\D/g, '')}@s.whatsapp.net`,
      filePath: path.join(process.env.FILES_PATH || path.resolve(__dirname, '../../data/arquivos'), c.file_name),
      fileName: c.file_name,
      contactName: c.name,
      contactId: c.id,
    }));

    botProcess?.send({ type: 'START_DISPATCH', payload: { queue, delayMs } });

    broadcastWS({
      type: 'DISPATCH_STARTED',
      data: { sessionId: session.lastInsertRowid, total: contacts.length, delayMs, source: 'cron' }
    });
  });
}

process.on('settings:schedule-updated', () => {
  console.log('[Cron] Configurações de agendamento atualizadas — reconfigurando...');
  setupSchedule();
});

const distPath = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT_API || 3002;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`[API] ✅ WhaSender rodando em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`[API] WebSocket disponível em ws://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/ws`);

  startBotProcess();

  setupSchedule();
});

function cleanupAndExit() {
  console.log('[API] Encerrando sistema...');
  if (botProcess) botProcess.kill();
  process.exit(0);
}
process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);
