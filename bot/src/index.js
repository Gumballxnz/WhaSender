const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const pino = require('pino');
const { sendQueue } = require('./sender');

const SESSION_DIR = process.env.SESSION_PATH || path.join(__dirname, 'session');

let sock = null;
let dispatchControl = { stop: false };
let isConnected = false;
let pairingPhoneNumber = null;
let pairingCodeRequested = false;
let isStartingBot = false;
let qrCodeCount = 0;
const MAX_QR_CODES = 10;
let pairingTimeout = null;
let isClosingIntentionally = false;

function killSocket() {
  isConnected = false;
  if (pairingTimeout) {
    clearTimeout(pairingTimeout);
    pairingTimeout = null;
  }
  if (sock) {
    isClosingIntentionally = true;
    try { sock.ev.removeAllListeners(); } catch(e) {}
    try { sock.end(undefined); } catch(e) {}
    sock = null;
  }
}

async function startBot() {
  if (isStartingBot) return;
  isStartingBot = true;
  isClosingIntentionally = false;
  killSocket();
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  let { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));
  if (!version || !version[0]) version = [2, 3000, 1015901307];

  const usePairingCode = !!pairingPhoneNumber;

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    version,
    printQRInTerminal: !usePairingCode,
    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: true,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    browser: ['Windows', 'Chrome', '125.0.0.0'],
  });

  isStartingBot = false;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {

    if (qr && !usePairingCode) {
      qrCodeCount++;
      if (qrCodeCount > MAX_QR_CODES) {
        console.log(`[Bot] Limite de ${MAX_QR_CODES} QR Codes atingido sem conexão. Parando bot...`);
        killSocket();
        process.send?.({ type: 'BOT_STATUS', status: 'disconnected' });
        process.send?.({ type: 'ERROR', message: 'Limite de tentativas do QR Code atingido. Clique em Gerar novamente.' });
        qrCodeCount = 0;
        return;
      }
      process.send?.({ type: 'QR', payload: qr });
      console.log(`[Bot] QR Code gerado (${qrCodeCount}/${MAX_QR_CODES}) — escaneie no WhatsApp`);
    }

    if (usePairingCode && !pairingCodeRequested && !sock.authState.creds.registered) {
      pairingCodeRequested = true;
      try {

        await new Promise(r => setTimeout(r, 3000));

        const code = await sock.requestPairingCode(pairingPhoneNumber);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

        console.log(`[Bot] 📱 Código de pareamento: ${formattedCode}`);
        process.send?.({ type: 'PAIRING_CODE', payload: formattedCode, phone: pairingPhoneNumber });

        if (pairingTimeout) clearTimeout(pairingTimeout);
        pairingTimeout = setTimeout(() => {
          if (sock && !sock.authState.creds.registered) {
            console.log('[Bot] Tempo limite do código de pareamento esgotado.');
            killSocket();
            pairingPhoneNumber = null;
            pairingCodeRequested = false;
            process.send?.({ type: 'PAIRING_CODE_EXPIRED' });
            process.send?.({ type: 'BOT_STATUS', status: 'disconnected' });
          }
        }, 60000);
      } catch (err) {
        console.error('[Bot] Erro ao gerar código de pareamento:', err.message);
        process.send?.({ type: 'PAIRING_CODE_ERROR', message: err.message });

      }
    }

    if (connection === 'close') {
      isConnected = false;
      pairingCodeRequested = false;

      if (isClosingIntentionally) {
        console.log('[Bot] Conexão fechada de forma intencional.');
        isClosingIntentionally = false;
        return;
      }

      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        console.log(`[Bot] Conexão perdida (código ${statusCode}). Erro real:`, lastDisconnect?.error?.message || lastDisconnect?.error);
        process.send?.({ type: 'BOT_STATUS', status: 'connecting' });

        isClosingIntentionally = true;
        killSocket();

        setTimeout(() => startBot(), 5000);
      } else {
        console.log('[Bot] Sessão encerrada pelo usuário (ou número banido). Conecte novamente.');
        process.send?.({ type: 'LOGGED_OUT' });
        process.send?.({ type: 'BOT_STATUS', status: 'disconnected' });

        try {
          const fs = require('fs');
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        } catch(e) {}
      }
    }

    if (connection === 'open') {
      if (pairingTimeout) {
        clearTimeout(pairingTimeout);
        pairingTimeout = null;
      }
      isConnected = true;
      pairingCodeRequested = false;
      qrCodeCount = 0;
      console.log('[Bot] ✅ Conectado ao WhatsApp com sucesso!');
      process.send?.({ type: 'CONNECTED' });
      process.send?.({ type: 'BOT_STATUS', status: 'connected' });
    }
  });

  return sock;
}

process.on('message', async (msg) => {
  switch (msg.type) {
    case 'START_DISPATCH': {
      if (!sock?.user) {
        process.send?.({ type: 'ERROR', message: 'Bot não está conectado ao WhatsApp' });
        return;
      }
      dispatchControl = { stop: false };
      const { queue, delayMs, startIndex = 0, batchSize = 0, batchPauseMs = 0, maxPauses = 0 } = msg.payload;
      console.log(`[Bot] Iniciando disparo: ${queue.length} contatos, delay ${delayMs}ms, lote ${batchSize}, pausa ${batchPauseMs}ms (Max pausas: ${maxPauses}), a partir do índice ${startIndex}`);
      await sendQueue(() => isConnected ? sock : null, queue, delayMs, (progress) => {
        process.send?.({ type: 'PROGRESS', data: progress });
      }, dispatchControl, startIndex, batchSize, batchPauseMs, maxPauses);
      break;
    }

    case 'SEND_SINGLE': {
      if (!sock) return;
      const { jid, filePath, fileName, logId } = msg.payload;

      try {
        const fileBuffer = fs.readFileSync(filePath);
        await sock.sendMessage(jid, {
          document: fileBuffer,
          mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileName,
        });

        try { fs.unlinkSync(filePath); } catch(e) {}

        process.send?.({
          type: 'PROGRESS',
          data: {
            status: 'RESENT',
            current: { name: jid.split('@')[0], file_name: fileName },
            logId
          }
        });
      } catch (err) {
        process.send?.({ type: 'ERROR', message: `Falha ao reenviar ${fileName}: ${err.message}` });
      }
      break;
    }

    case 'STOP_DISPATCH': {
      console.log('[Bot] ⛔ Parando disparo...');
      dispatchControl.stop = true;
      break;
    }

    case 'GET_STATUS': {
      const connected = sock?.user ? true : false;
      process.send?.({ type: 'BOT_STATUS', status: connected ? 'connected' : 'disconnected' });
      break;
    }

    case 'SET_PAIRING_PHONE': {

      pairingPhoneNumber = msg.phone?.replace(/\D/g, '') || null;
      pairingCodeRequested = false;
      qrCodeCount = 0;
      console.log(`[Bot] Número para pareamento definido: ${pairingPhoneNumber}`);

      try {
        const fs = require('fs');
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
      } catch(e) {}

      killSocket();
      setTimeout(() => startBot(), 1000);
      break;
    }

    case 'USE_QR': {

      pairingPhoneNumber = null;
      pairingCodeRequested = false;
      qrCodeCount = 0;
      console.log('[Bot] Trocando para modo QR Code');
      killSocket();
      setTimeout(() => startBot(), 1000);
      break;
    }

    case 'STOP_CONNECTION': {
      console.log('[Bot] 🛑 Parando tentativa de conexão...');
      killSocket();
      pairingPhoneNumber = null;
      pairingCodeRequested = false;
      qrCodeCount = 0;
      process.send?.({ type: 'BOT_STATUS', status: 'disconnected' });
      break;
    }

    case 'LOGOUT': {
      console.log('[Bot] Desconectando sessão...');
      if (sock) {
        try { await sock.logout(); } catch(e) {}
      }
      killSocket();
      pairingCodeRequested = false;

      try {
        const fs = require('fs');
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        console.log('[Bot] Ficheiros da sessão deletados com sucesso.');
      } catch (e) {
        console.error('[Bot] Erro ao deletar pasta session:', e.message);
      }

      process.send?.({ type: 'LOGGED_OUT' });
      process.send?.({ type: 'BOT_STATUS', status: 'disconnected' });

      setTimeout(() => startBot(), 2000);
      break;
    }
  }
});

process.on('uncaughtException', (err) => {
  console.error('[Bot] Erro não capturado:', err.message);
  process.send?.({ type: 'ERROR', message: err.message });
});

process.on('unhandledRejection', (err) => {
  console.error('[Bot] Promise rejeitada:', err.message || err);
});

const fs = require('fs');
const hasSavedSession = () => fs.existsSync(path.join(SESSION_DIR, 'creds.json'));

if (hasSavedSession()) {
  console.log('[Bot] Sessão salva encontrada. Iniciando conexão automática...');
  startBot().catch(err => {
    console.error('[Bot] Falha ao iniciar:', err.message);
    process.send?.({ type: 'ERROR', message: `Falha ao iniciar: ${err.message}` });
  });
} else {
  console.log('[Bot] Nenhuma sessão ativa. Aguardando comando do usuário para iniciar.');

  setTimeout(() => {
    process.send?.({ type: 'BOT_STATUS', status: 'disconnected' });
  }, 1000);
}
