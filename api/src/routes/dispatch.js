const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const router = express.Router();

const FILES_PATH = process.env.FILES_PATH || path.join(__dirname, '../../../data/arquivos');

let botProcess = null;
let broadcastWS = null;
let currentSession = null;
let lastSentIndex = 0;
let botStatus = 'disconnected';

function init(bot, broadcast) {
  botProcess = bot;
  broadcastWS = broadcast;

  const orphaned = db.prepare("SELECT id FROM dispatch_sessions WHERE status = 'RUNNING'").all();
  if (orphaned.length > 0) {
    db.prepare("UPDATE dispatch_sessions SET status = 'STOPPED', finished_at = datetime('now') WHERE status = 'RUNNING'").run();
    console.log(`[Dispatch] ${orphaned.length} sessão(ões) órfã(s) marcada(s) como STOPPED`);
  }
}

function updateBotStatus(status) {
  const previousStatus = botStatus;
  botStatus = status;

  if (previousStatus === 'connected' && status === 'disconnected' && currentSession) {
    console.log('[Dispatch] ⚠️ Bot desconectou durante disparo — auto-stop ativado');

    try { botProcess?.send({ type: 'STOP_DISPATCH' }); } catch (e) {}

    try {
      db.prepare("UPDATE dispatch_sessions SET status = 'STOPPED', finished_at = datetime('now') WHERE id = ?")
        .run(currentSession);
    } catch (e) {}

    broadcastWS?.({
      type: 'PROGRESS',
      data: {
        sent: lastSentIndex,
        total: 0,
        current: null,
        status: 'STOPPED',
        sessionId: currentSession,
        reason: 'Bot desconectou — disparo pausado automaticamente'
      }
    });

    broadcastWS?.({
      type: 'DISPATCH_AUTO_STOPPED',
      data: { sessionId: currentSession, lastSentIndex, reason: 'Bot desconectou' }
    });

    currentSession = null;
  }
}

function toJid(phone) {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

function buildQueue(maxCount, excludeSessionId = null) {
  const fileNamesFromDisk = fs.readdirSync(FILES_PATH).filter(f => f.toLowerCase().endsWith('.xlsx'));

  const realFileNamesMap = new Map();
  fileNamesFromDisk.forEach(f => realFileNamesMap.set(f.toLowerCase(), f));

  const excludedContactIds = new Set();
  if (excludeSessionId) {
    const sent = db.prepare("SELECT contact_id FROM dispatch_logs WHERE session_id = ? AND status IN ('SENT', 'RESENT')").all(excludeSessionId);
    sent.forEach(row => {
      if (row.contact_id) excludedContactIds.add(row.contact_id);
    });
  }

  const allActiveContacts = db.prepare('SELECT * FROM contacts WHERE active = 1 ORDER BY id ASC').all();

  const queue = allActiveContacts
    .filter(c => !excludedContactIds.has(c.id))
    .filter(c => realFileNamesMap.has((c.file_name || '').toLowerCase()))
    .map(c => {
      const realDiskFileName = realFileNamesMap.get((c.file_name || '').toLowerCase());
      return {
        jid: toJid(c.phone),
        filePath: path.join(FILES_PATH, realDiskFileName),
        fileName: realDiskFileName,
        contactName: c.name,
        contactId: c.id,
      };
    });

  queue.sort((a, b) => {
    const numA = parseInt(a.fileName.match(/\d+/)?.[0] || 0);
    const numB = parseInt(b.fileName.match(/\d+/)?.[0] || 0);
    return numA - numB;
  });

  return queue.slice(0, maxCount);
}

router.post('/start', (req, res) => {
  if (!botProcess) {
    return res.status(503).json({ error: 'Bot não está disponível' });
  }

  if (botStatus !== 'connected') {
    return res.status(503).json({ error: 'Bot não está conectado ao WhatsApp. Conecte primeiro.' });
  }

  if (currentSession) {
    return res.status(409).json({ error: 'Já existe um disparo em andamento', sessionId: currentSession });
  }

  const settings = {};
  db.prepare('SELECT key, value FROM settings').all()
    .forEach(row => { settings[row.key] = row.value; });

  const delayMs = req.body.delay_ms || parseInt(settings.delay_ms) || 30000;
  const maxCount = req.body.max_count || parseInt(settings.max_per_dispatch) || 104;
  const batchSize = req.body.batch_size !== undefined ? parseInt(req.body.batch_size) : (parseInt(settings.batch_size) || 0);
  const batchPauseMins = req.body.batch_pause_minutes !== undefined ? parseInt(req.body.batch_pause_minutes) : (parseInt(settings.batch_pause_minutes) || 10);
  const maxPauses = req.body.max_pauses !== undefined ? parseInt(req.body.max_pauses) : (parseInt(settings.max_pauses) || 0);
  const batchPauseMs = batchPauseMins * 60 * 1000;

  if (req.body.batch_size !== undefined) {
    db.prepare("UPDATE settings SET value = ? WHERE key = 'batch_size'").run(batchSize.toString());
    db.prepare("UPDATE settings SET value = ? WHERE key = 'batch_pause_minutes'").run(batchPauseMins.toString());
    db.prepare("UPDATE settings SET value = ? WHERE key = 'max_pauses'").run(maxPauses.toString());
  }

  const queue = buildQueue(maxCount);

  if (queue.length === 0) {
    return res.status(400).json({
      error: 'Nenhum arquivo correspondente aos contatos foi encontrado na VPS. Faça o upload primeiro.'
    });
  }

  const session = db.prepare('INSERT INTO dispatch_sessions (total, status) VALUES (?, ?)')
    .run(queue.length, 'RUNNING');
  currentSession = session.lastInsertRowid;
  lastSentIndex = 0;

  const startFrom = parseInt(req.body.start_from) || 1;
  const startIndex = Math.max(0, startFrom - 1);

  botProcess.send({ type: 'START_DISPATCH', payload: { queue, delayMs, startIndex, batchSize, batchPauseMs, maxPauses } });

  broadcastWS?.({
    type: 'DISPATCH_STARTED',
    data: { sessionId: currentSession, total: queue.length, delayMs, startIndex }
  });

  res.json({
    message: 'Disparo iniciado',
    sessionId: currentSession,
    total: queue.length,
    delayMs,
  });
});

router.post('/stop', (req, res) => {
  if (!currentSession) {
    return res.status(400).json({ error: 'Nenhum disparo em andamento' });
  }

  try { botProcess?.send({ type: 'STOP_DISPATCH' }); } catch (e) {}

  const sessionId = currentSession;

  setTimeout(() => {
    if (currentSession === sessionId) {
      db.prepare("UPDATE dispatch_sessions SET status = 'STOPPED', finished_at = datetime('now') WHERE id = ?")
        .run(sessionId);
      currentSession = null;
      broadcastWS?.({
        type: 'PROGRESS',
        data: { sent: lastSentIndex, total: 0, current: null, status: 'STOPPED', sessionId }
      });
    }
  }, 3000);

  res.json({ message: 'Comando de pausa enviado', sessionId });
});

router.post('/cancel', (req, res) => {
  const sessionId = currentSession || req.body.sessionId;

  if (!sessionId) {
    return res.status(400).json({ error: 'Nenhum disparo para cancelar' });
  }

  try { botProcess?.send({ type: 'STOP_DISPATCH' }); } catch (e) {}

  db.prepare("UPDATE dispatch_sessions SET status = 'CANCELLED', finished_at = datetime('now') WHERE id = ?")
    .run(sessionId);

  currentSession = null;
  lastSentIndex = 0;

  broadcastWS?.({
    type: 'PROGRESS',
    data: { sent: 0, total: 0, current: null, status: 'CANCELLED', sessionId }
  });

  res.json({ message: 'Disparo cancelado', sessionId });
});

router.post('/resume', (req, res) => {
  if (!botProcess) {
    return res.status(503).json({ error: 'Bot não está disponível' });
  }

  if (botStatus !== 'connected') {
    return res.status(503).json({ error: 'Bot não está conectado ao WhatsApp. Conecte primeiro.' });
  }

  if (currentSession) {
    return res.status(409).json({ error: 'Já existe um disparo em andamento' });
  }

  const sessionId = req.body.sessionId;
  const session = db.prepare("SELECT * FROM dispatch_sessions WHERE id = ? AND status IN ('STOPPED')").get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Sessão não encontrada ou não pode ser retomada' });
  }

  const sentCount = db.prepare("SELECT COUNT(*) as count FROM dispatch_logs WHERE session_id = ? AND status IN ('SENT', 'RESENT')")
    .get(sessionId)?.count || 0;

  const settings = {};
  db.prepare('SELECT key, value FROM settings').all()
    .forEach(row => { settings[row.key] = row.value; });

  const delayMs = req.body.delay_ms || parseInt(settings.delay_ms) || 30000;
  const maxCount = parseInt(settings.max_per_dispatch) || 104;
  const batchSize = parseInt(settings.batch_size) || 0;
  const batchPauseMs = (parseInt(settings.batch_pause_minutes) || 10) * 60 * 1000;
  const maxPauses = parseInt(settings.max_pauses) || 0;

  const queue = buildQueue(maxCount, sessionId);

  if (queue.length === 0) {
    return res.status(400).json({ error: 'Nenhum arquivo encontrado na VPS' });
  }

  const startIndex = 0;

  db.prepare("UPDATE dispatch_sessions SET status = 'RUNNING', finished_at = NULL WHERE id = ?").run(sessionId);
  currentSession = sessionId;
  lastSentIndex = sentCount;

  botProcess.send({ type: 'START_DISPATCH', payload: { queue, delayMs, startIndex, batchSize, batchPauseMs, maxPauses } });

  broadcastWS?.({
    type: 'DISPATCH_RESUMED',
    data: { sessionId, total: queue.length, delayMs, startIndex, sentCount }
  });

  res.json({
    message: `Disparo retomado a partir do contato ${startIndex + 1}`,
    sessionId,
    total: queue.length,
    startIndex,
    sentCount,
    delayMs,
  });
});

router.get('/status', (req, res) => {
  if (!currentSession) {

    const stoppedSession = db.prepare("SELECT * FROM dispatch_sessions WHERE status = 'STOPPED' ORDER BY id DESC LIMIT 1").get();

    return res.json({
      status: 'IDLE',
      sessionId: null,
      stoppedSession: stoppedSession || null
    });
  }

  const session = db.prepare('SELECT * FROM dispatch_sessions WHERE id = ?').get(currentSession);
  res.json({
    status: session?.status || 'UNKNOWN',
    sessionId: currentSession,
    lastSentIndex,
    ...session,
  });
});

router.get('/history', (req, res) => {
  try {
    const sessions = db.prepare('SELECT * FROM dispatch_sessions ORDER BY id DESC LIMIT 50').all();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar histórico', details: err.message });
  }
});

router.get('/history/:id', (req, res) => {
  try {
    const logs = db.prepare(`
      SELECT dl.*, c.name as contact_name, c.phone as contact_phone
      FROM dispatch_logs dl
      LEFT JOIN contacts c ON dl.contact_id = c.id
      WHERE dl.session_id = ?
      ORDER BY dl.id ASC
    `).all(req.params.id);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar logs', details: err.message });
  }
});

router.post('/retry/:logId', (req, res) => {
  if (!botProcess) {
    return res.status(503).json({ error: 'Bot não está disponível' });
  }

  const { logId } = req.params;

  const log = db.prepare('SELECT * FROM dispatch_logs WHERE id = ? AND status = ?')
    .get(logId, 'ERROR');

  if (!log) return res.status(404).json({ error: 'Log de falha não encontrado ou já enviado' });

  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(log.contact_id);
  if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });

  const filePath = path.join(FILES_PATH, log.file_name);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: `Ficheiro ${log.file_name} não encontrado na VPS. Faça upload novamente.`
    });
  }

  botProcess.send({
    type: 'SEND_SINGLE',
    payload: {
      jid: toJid(contact.phone),
      filePath,
      fileName: log.file_name,
      logId: log.id
    }
  });

  res.json({ message: 'Solicitação de reenvio enviada ao bot' });
});

function handleProgress(data) {
  if (!currentSession) return;

  const sessionId = currentSession;

  if (data.currentIndex !== undefined) {
    lastSentIndex = data.currentIndex + 1;
  }

  try {
    const sessionVal = db.prepare('SELECT total FROM dispatch_sessions WHERE id = ?').get(sessionId);
    const total = sessionVal ? sessionVal.total : data.total;

    if (data.current) {
      if (data.status === 'RESENT' && data.logId) {
        db.prepare(`
          UPDATE dispatch_logs
          SET status = 'RESENT', error_message = NULL, sent_at = datetime('now')
          WHERE id = ?
        `).run(data.logId);
      } else {
        const contactId = data.current.contactId || null;

        db.prepare(`
          INSERT INTO dispatch_logs (session_id, contact_id, file_name, status, error_message)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          sessionId,
          contactId,
          data.current.file_name,
          data.status === 'SENDING' ? 'SENT' : data.status,
          data.error || null
        );
      }
    }

    const sentCount = db.prepare("SELECT COUNT(*) as count FROM dispatch_logs WHERE session_id = ? AND status IN ('SENT', 'RESENT')")
      .get(sessionId)?.count || 0;

    data.sent = sentCount;
    data.total = total;

    const sent = data.status === 'SENDING' || data.status === 'DONE' ? data.sent : undefined;
    if (sent !== undefined) {
      const errorCount = db.prepare('SELECT COUNT(*) as count FROM dispatch_logs WHERE session_id = ? AND status = ?')
        .get(sessionId, 'ERROR')?.count || 0;

      db.prepare('UPDATE dispatch_sessions SET sent = ?, errors = ? WHERE id = ?')
        .run(sent, errorCount, sessionId);
    }

    if (['DONE', 'STOPPED', 'CANCELLED'].includes(data.status) && !data.current) {
      db.prepare("UPDATE dispatch_sessions SET status = ?, finished_at = datetime('now') WHERE id = ?")
        .run(data.status, sessionId);
      currentSession = null;
    }
  } catch (err) {
    console.error('[Dispatch] Erro ao processar progresso:', err.message);
  }

  broadcastWS?.({ type: 'PROGRESS', data: { ...data, sessionId } });

  if (data.status === 'ALERT_TOO_MANY_ERRORS') {
    broadcastWS?.({ type: 'ALERT_TOO_MANY_ERRORS', count: 10, message: data.error });
  }
}

module.exports = router;
module.exports.init = init;
module.exports.handleProgress = handleProgress;
module.exports.updateBotStatus = updateBotStatus;
