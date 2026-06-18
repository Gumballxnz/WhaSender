/**
 * WhaSender Bot — Processo Baileys
 * Suporta: Código de Pareamento (preferido) + QR Code (fallback)
 * Auto-regeneração automática se não conectar a tempo
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const path = require('path');
const pino = require('pino');
const { sendQueue } = require('./sender');

const SESSION_DIR = process.env.SESSION_PATH || path.join(__dirname, 'session');

let sock = null;
let dispatchControl = { stop: false };
let isConnected = false;
let pairingPhoneNumber = null; // Número para código de pareamento
let pairingCodeRequested = false;
let isStartingBot = false;
let qrCodeCount = 0;
const MAX_QR_CODES = 10;
let pairingTimeout = null;

function killSocket() {
  isConnected = false;
  if (pairingTimeout) {
    clearTimeout(pairingTimeout);
    pairingTimeout = null;
  }
  if (sock) {
    try { sock.ev.removeAllListeners(); } catch(e) {}
    try { sock.end(undefined); } catch(e) {}
    sock = null;
  }
}

/**
 * Inicia o cliente Baileys e gerencia a conexão
 */
async function startBot() {
  if (isStartingBot) return;
  isStartingBot = true;
  killSocket();
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  let { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));
  if (!version || !version[0]) version = [2, 3000, 1015901307];

  // Se tiver número de telefone configurado, usar pairing code em vez de QR
  const usePairingCode = !!pairingPhoneNumber;

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    version,
    printQRInTerminal: !usePairingCode, // Só mostrar QR se não usar pairing code
    defaultQueryTimeoutMs: 60000,
    connectTimeoutMs: 60000,
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    browser: ['Ubuntu', 'Chrome', '110.0.5481.192'],
  });

  isStartingBot = false;

  // Salvar credenciais quando atualizadas
  sock.ev.on('creds.update', saveCreds);

  // Gerenciar eventos de conexão
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    // === QR CODE (fallback) ===
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

    // === CÓDIGO DE PAREAMENTO ===
    if (usePairingCode && !pairingCodeRequested && !sock.authState.creds.registered) {
      pairingCodeRequested = true;
      try {
        // Aguardar 3s para a conexão WebSocket estabilizar
        await new Promise(r => setTimeout(r, 3000));

        const code = await sock.requestPairingCode(pairingPhoneNumber);
        const formattedCode = code?.match(/.{1,4}/g)?.join('-') || code;

        console.log(`[Bot] 📱 Código de pareamento: ${formattedCode}`);
        process.send?.({ type: 'PAIRING_CODE', payload: formattedCode, phone: pairingPhoneNumber });

        // Timeout de 60 segundos para expirar o código
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
        // ❌ Removido o retry automático de 5s para evitar infinite loops e bloqueios do WhatsApp.
        // O bot aguardará o usuário solicitar novamente na interface.
      }
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      pairingCodeRequested = false;

      if (shouldReconnect) {
        console.log(`[Bot] Conexão perdida (código ${statusCode}). Erro real:`, lastDisconnect?.error?.message || lastDisconnect?.error);
        process.send?.({ type: 'BOT_STATUS', status: 'connecting' });
        killSocket();
        setTimeout(() => startBot(), 5000);
      } else {
        console.log('[Bot] Sessão encerrada pelo usuário. Conecte novamente.');
        process.send?.({ type: 'LOGGED_OUT' });
        process.send?.({ type: 'BOT_STATUS', status: 'disconnected' });
        
        try {
          const fs = require('fs');
          fs.rmSync(__dirname + '/session', { recursive: true, force: true });
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
      qrCodeCount = 0; // Resetar contador
      console.log('[Bot] ✅ Conectado ao WhatsApp com sucesso!');
      process.send?.({ type: 'CONNECTED' });
      process.send?.({ type: 'BOT_STATUS', status: 'connected' });
    }
  });

  return sock;
}

/**
 * Ouvir comandos IPC da API
 */
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

        // ✅ SUCESSO — deletar ficheiro e notificar API
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
      // Receber número de telefone para código de pareamento
      pairingPhoneNumber = msg.phone?.replace(/\D/g, '') || null;
      pairingCodeRequested = false;
      qrCodeCount = 0; // Resetar contador
      console.log(`[Bot] Número para pareamento definido: ${pairingPhoneNumber}`);

      // Limpar sessão existente sempre que for gerar um novo código de número
      try {
        const fs = require('fs');
        fs.rmSync(__dirname + '/session', { recursive: true, force: true });
      } catch(e) {}

      // Se já tiver uma sessão ativa, fechar e reiniciar com pairing code
      killSocket();
      setTimeout(() => startBot(), 1000);
      break;
    }

    case 'USE_QR': {
      // Trocar para modo QR Code
      pairingPhoneNumber = null;
      pairingCodeRequested = false;
      qrCodeCount = 0; // Resetar contador
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
      
      // Apagar ficheiros locais da sessão antiga
      try {
        const fs = require('fs');
        fs.rmSync(__dirname + '/session', { recursive: true, force: true });
        console.log('[Bot] Ficheiros da sessão deletados com sucesso.');
      } catch (e) {
        console.error('[Bot] Erro ao deletar pasta session:', e.message);
      }
      
      process.send?.({ type: 'LOGGED_OUT' });
      process.send?.({ type: 'BOT_STATUS', status: 'disconnected' });
      
      // Reiniciar o bot limpo para nova conexão
      setTimeout(() => startBot(), 2000);
      break;
    }
  }
});

// Tratamento de erros
process.on('uncaughtException', (err) => {
  console.error('[Bot] Erro não capturado:', err.message);
  process.send?.({ type: 'ERROR', message: err.message });
});

process.on('unhandledRejection', (err) => {
  console.error('[Bot] Promise rejeitada:', err.message || err);
});

// Verificar se existe sessão salva para conectar automaticamente
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
  // Avisar a API do status inicial desconectado
  setTimeout(() => {
    process.send?.({ type: 'BOT_STATUS', status: 'disconnected' });
  }, 1000);
}
