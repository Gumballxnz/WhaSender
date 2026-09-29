const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const db = require('../db');
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const FILES_PATH = process.env.FILES_PATH || path.join(__dirname, '../../../data/arquivos');

let botProcess = null;
let broadcastWS = null;
let botStatus = 'disconnected';
let activeSession = null;

function init(bot, broadcast) {
  botProcess = bot;
  broadcastWS = broadcast;

  const orphaned = db.prepare("SELECT id FROM validation_sessions WHERE status = 'RUNNING'").all();
  if (orphaned.length > 0) {
    db.prepare("UPDATE validation_sessions SET status = 'STOPPED', finished_at = datetime('now') WHERE status = 'RUNNING'").run();
  }
}

function updateBotStatus(status) {
  botStatus = status;
}

function handleProgress(data) {
  const { sessionId, checked, validCount, invalidCount, total, resultsChunk, status, lastError } = data;

  if (Array.isArray(resultsChunk) && resultsChunk.length > 0) {
    const insertStmt = db.prepare('INSERT INTO validation_numbers (session_id, phone, exists_wa, jid) VALUES (?, ?, ?, ?)');
    const insertMany = db.transaction((rows) => {
      for (const row of rows) {
        insertStmt.run(sessionId, row.phone, row.exists ? 1 : 0, row.jid || null);
      }
    });
    try {
      insertMany(resultsChunk);
    } catch (err) {
      console.error('[Validator API] Erro ao salvar chunk no SQLite:', err.message);
    }
  }

  const isFinal = status === 'COMPLETED' || status === 'STOPPED' || status === 'ERROR';

  db.prepare(`
    UPDATE validation_sessions
    SET valid_count = ?, invalid_count = ?, status = ?,
        finished_at = CASE WHEN ? THEN datetime('now') ELSE finished_at END
    WHERE id = ?
  `).run(validCount, invalidCount, status, isFinal ? 1 : 0, sessionId);

  if (activeSession && activeSession.id === sessionId) {
    activeSession = {
      ...activeSession,
      checked,
      validCount,
      invalidCount,
      status,
      lastError,
    };
    if (isFinal) {
      activeSession = null;
    }
  }

  broadcastWS?.({
    type: 'VALIDATION_PROGRESS',
    data: {
      sessionId,
      checked,
      validCount,
      invalidCount,
      total,
      status,
      lastError,
    },
  });
}

function extractPhonesFromBuffer(buffer, originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  const phones = [];

  if (ext === '.xlsx' || ext === '.xls') {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        if (!cell) continue;
        const clean = String(cell).replace(/\D/g, '');
        if (clean.length >= 8 && clean.length <= 15) {
          phones.push(clean);
          break;
        }
      }
    }
  } else {
    const text = buffer.toString('utf8');
    const lines = text.split(/[\r\n,;]+/);
    for (const line of lines) {
      const clean = line.replace(/\D/g, '');
      if (clean.length >= 8 && clean.length <= 15) {
        phones.push(clean);
      }
    }
  }

  return [...new Set(phones)];
}

router.post('/start', upload.single('file'), (req, res) => {
  if (botStatus !== 'connected') {
    return res.status(400).json({ error: 'O WhatsApp precisa estar conectado para realizar validações.' });
  }

  const running = db.prepare("SELECT id FROM validation_sessions WHERE status = 'RUNNING'").get();
  if (running) {
    return res.status(400).json({ error: 'Já existe uma validação em andamento.' });
  }

  let phones = [];

  if (req.file && req.file.buffer) {
    phones = extractPhonesFromBuffer(req.file.buffer, req.file.originalname);
  } else if (req.body.phones) {
    const raw = typeof req.body.phones === 'string' ? req.body.phones.split(/[\r\n,;]+/) : req.body.phones;
    phones = [...new Set(raw.map((p) => String(p).replace(/\D/g, '')).filter((p) => p.length >= 8 && p.length <= 15))];
  }

  if (phones.length === 0) {
    return res.status(400).json({ error: 'Nenhum número de telefone válido encontrado para validação.' });
  }

  const sessionName = req.body.name || (req.file ? req.file.originalname : `Validação ${new Date().toLocaleString('pt-BR')}`);
  const chunkSize = Math.max(10, Math.min(100, parseInt(req.body.chunkSize) || 40));
  const delayMs = Math.max(50, Math.min(5000, parseInt(req.body.delayMs) || 300));

  const result = db.prepare('INSERT INTO validation_sessions (name, total, status) VALUES (?, ?, ?)')
    .run(sessionName, phones.length, 'RUNNING');

  const sessionId = result.lastInsertRowid;

  activeSession = {
    id: sessionId,
    name: sessionName,
    total: phones.length,
    checked: 0,
    validCount: 0,
    invalidCount: 0,
    status: 'RUNNING',
  };

  botProcess?.send({
    type: 'START_VALIDATION',
    payload: {
      sessionId,
      numbers: phones,
      chunkSize,
      delayMs,
    },
  });

  broadcastWS?.({
    type: 'VALIDATION_STARTED',
    data: {
      sessionId,
      name: sessionName,
      total: phones.length,
      chunkSize,
      delayMs,
    },
  });

  res.json({
    success: true,
    sessionId,
    total: phones.length,
    message: 'Validação iniciada com sucesso em segundo plano.',
  });
});

router.post('/stop', (req, res) => {
  botProcess?.send({ type: 'STOP_VALIDATION' });

  db.prepare("UPDATE validation_sessions SET status = 'STOPPED', finished_at = datetime('now') WHERE status = 'RUNNING'").run();

  if (activeSession) {
    activeSession.status = 'STOPPED';
  }

  broadcastWS?.({ type: 'VALIDATION_STOPPED' });
  res.json({ success: true, message: 'Solicitação de parada enviada.' });
});

router.get('/status', (req, res) => {
  const running = db.prepare("SELECT * FROM validation_sessions WHERE status = 'RUNNING' ORDER BY id DESC LIMIT 1").get();
  res.json({
    active: !!running,
    session: running || null,
    botConnected: botStatus === 'connected',
  });
});

router.get('/sessions', (req, res) => {
  const sessions = db.prepare('SELECT * FROM validation_sessions ORDER BY id DESC LIMIT 50').all();
  res.json({ sessions });
});

router.get('/sessions/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM validation_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  const numbers = db.prepare('SELECT phone, exists_wa, jid, checked_at FROM validation_numbers WHERE session_id = ? ORDER BY id ASC LIMIT 500').all(req.params.id);

  res.json({ session, numbers });
});

router.get('/export/:sessionId/:type', (req, res) => {
  const { sessionId, type } = req.params;
  const session = db.prepare('SELECT * FROM validation_sessions WHERE id = ?').get(sessionId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  let query = 'SELECT phone, exists_wa, jid, checked_at FROM validation_numbers WHERE session_id = ?';
  const params = [sessionId];

  if (type === 'valid') {
    query += ' AND exists_wa = 1';
  } else if (type === 'invalid') {
    query += ' AND exists_wa = 0';
  }

  const rows = db.prepare(query).all(...params);

  const formatted = rows.map((r, idx) => ({
    Item: idx + 1,
    Telefone: r.phone,
    Status: r.exists_wa === 1 ? 'WhatsApp Ativo' : 'Sem WhatsApp',
    JID: r.jid || '',
    VerificadoEm: r.checked_at,
  }));

  const ws = XLSX.utils.json_to_sheet(formatted);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Numeros');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `validacao_${type}_sessao_${sessionId}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
});

router.post('/move-to-files/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = db.prepare('SELECT * FROM validation_sessions WHERE id = ?').get(sessionId);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });

  const valids = db.prepare('SELECT phone FROM validation_numbers WHERE session_id = ? AND exists_wa = 1').all(sessionId);
  if (valids.length === 0) {
    return res.status(400).json({ error: 'Não há números com WhatsApp ativo nesta sessão para mover.' });
  }

  if (!fs.existsSync(FILES_PATH)) {
    fs.mkdirSync(FILES_PATH, { recursive: true });
  }

  const data = valids.map((v, i) => ({
    Nome: `Lead ${i + 1}`,
    Telefone: v.phone,
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Contatos');

  const safeName = `validados_sessao_${sessionId}_${Date.now()}.xlsx`;
  const destPath = path.join(FILES_PATH, safeName);
  XLSX.writeFile(wb, destPath);

  res.json({
    success: true,
    fileName: safeName,
    count: valids.length,
    message: `${valids.length} números válidos movidos para a pasta de arquivos com sucesso.`,
  });
});

module.exports = router;
module.exports.init = init;
module.exports.updateBotStatus = updateBotStatus;
module.exports.handleProgress = handleProgress;
