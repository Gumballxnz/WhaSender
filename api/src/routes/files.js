const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const router = express.Router();

const FILES_PATH = process.env.FILES_PATH || path.join(__dirname, '../../../data/arquivos');

if (!fs.existsSync(FILES_PATH)) {
  fs.mkdirSync(FILES_PATH, { recursive: true });
}
const SESSIONS_PATH = process.env.SESSIONS_PATH || path.join(__dirname, '../../../data/sessions');
try {
  if (!fs.existsSync(SESSIONS_PATH)) {
    fs.mkdirSync(SESSIONS_PATH, { recursive: true });
  }
} catch (err) {
  console.warn(`[Files API] Warning: Não foi possível criar SESSIONS_PATH (${SESSIONS_PATH}): ${err.message}`);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FILES_PATH),
  filename: (req, file, cb) => cb(null, file.originalname),
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.post('/upload', upload.array('files', 200), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Nenhum ficheiro recebido' });
  }

  const uploaded = req.files.map(f => ({
    name: f.originalname,
    size: f.size,
  }));

  res.json({
    success: true,
    count: uploaded.length,
    files: uploaded,
  });
});

router.get('/limit', (req, res) => {
  res.json({
    maxSize: '100MB',
    maxFiles: 104,
    description: 'Limite configurado no Nginx e API'
  });
});

router.get('/', (req, res) => {
  try {
    const files = fs.readdirSync(FILES_PATH)
      .filter(f => f.endsWith('.xlsx'))
      .map(f => ({
        name: f,
        size: fs.statSync(path.join(FILES_PATH, f)).size,
      }))
      .sort((a, b) => {
        const numA = parseInt(a.name.match(/\d+/)?.[0] || 0);
        const numB = parseInt(b.name.match(/\d+/)?.[0] || 0);
        return numA - numB;
      });

    res.json({ count: files.length, files });
  } catch (err) {
    res.json({ count: 0, files: [], error: err.message });
  }
});

router.delete('/all', (req, res) => {
  try {
    const files = fs.readdirSync(FILES_PATH).filter(f => f.endsWith('.xlsx'));
    files.forEach(f => fs.unlinkSync(path.join(FILES_PATH, f)));
    res.json({ success: true, deleted: files.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:filename', (req, res) => {
  const { filename } = req.params;

  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Nome de arquivo inválido' });
  }

  const filePath = path.join(FILES_PATH, filename);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: `Ficheiro ${filename} removido com sucesso` });
    } else {
      res.status(404).json({ error: 'Ficheiro não encontrado' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/download/:filename', (req, res) => {
  const { filename } = req.params;

  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Nome de arquivo inválido' });
  }

  const filePath = path.join(FILES_PATH, filename);

  try {
    if (fs.existsSync(filePath)) {
      res.download(filePath, filename);
    } else {
      res.status(404).json({ error: 'Ficheiro não encontrado' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/download-zip', (req, res) => {
  try {
    const archiver = require('archiver');
    const files = fs.readdirSync(FILES_PATH).filter(f => f.endsWith('.xlsx'));

    if (files.length === 0) {
      return res.status(404).json({ error: 'Nenhum arquivo para compactar' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=whasender_leads_${Date.now()}.zip`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      console.error('[ZIP] Erro ao criar arquivo ZIP:', err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });

    archive.pipe(res);

    files.forEach(f => {
      archive.file(path.join(FILES_PATH, f), { name: f });
    });

    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let generationStatus = {
  running: false,
  current: 0,
  total: 0,
  message: '',
  sessionId: null,
};

router.get('/generate/status', (req, res) => {
  res.json(generationStatus);
});

router.get('/generate/metrics', (req, res) => {
  try {
    const totalNumbers = db.prepare('SELECT SUM(count) as count FROM phone_stats').get().count || 0;

    const byPrefix = db.prepare(
      'SELECT prefix, count FROM phone_stats ORDER BY prefix'
    ).all();

    const totalSessions = db.prepare('SELECT COUNT(*) as count FROM generation_sessions').get().count;
    const completedSessions = db.prepare("SELECT COUNT(*) as count FROM generation_sessions WHERE status = 'DONE'").get().count;

    const activePrefixes = byPrefix.map(r => r.prefix);

    res.json({
      totalNumbers,
      totalSessions,
      completedSessions,
      activePrefixes,
      uniqueGuaranteed: '100%',
      byPrefix,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/generate/history', (req, res) => {
  try {
    const sessions = db.prepare(
      'SELECT * FROM generation_sessions ORDER BY id DESC LIMIT 50'
    ).all();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate', (req, res) => {
  if (generationStatus.running) {
    return res.status(409).json({ error: 'Já existe uma geração em andamento' });
  }

  const partes = parseInt(req.body.partes) || 106;
  const contatosPorParte = parseInt(req.body.contatosPorParte) || 25000;
  const prefixo = req.body.prefixo || '87';
  const totalLeads = partes * contatosPorParte;

  if (partes < 1 || partes > 500) {
    return res.status(400).json({ error: 'Partes deve ser de 1 a 500' });
  }
  if (contatosPorParte < 1 || contatosPorParte > 50000) {
    return res.status(400).json({ error: 'Contatos por parte deve ser de 1 a 50000' });
  }
  if (!['84', '85', '86', '87', 'ambos', 'todos'].includes(prefixo)) {
    return res.status(400).json({ error: 'Prefixo inválido. Deve ser 84, 85, 86, 87, ambos ou todos.' });
  }

  const session = db.prepare(
    'INSERT INTO generation_sessions (prefix, total_numbers, total_parts, numbers_per_part, status) VALUES (?, ?, ?, ?, ?)'
  ).run(prefixo, totalLeads, partes, contatosPorParte, 'RUNNING');

  const sessionId = session.lastInsertRowid;

  const prefixoText = prefixo === 'ambos' ? '86 e 87' : prefixo === 'todos' ? '84, 85, 86 e 87' : prefixo;

  generationStatus = {
    running: true,
    current: 0,
    total: partes,
    message: `Sorteando ${totalLeads.toLocaleString()} números únicos (Prefixo ${prefixoText})...`,
    sessionId,
  };

  res.json({ success: true, message: 'Geração de leads iniciada', sessionId });

  const { fork } = require('child_process');
  const scriptPath = path.join(__dirname, '../../generate_leads.js');

  const sessionDir = path.join(SESSIONS_PATH, `session_${sessionId}`);

  const child = fork(scriptPath, [], {
    env: {
      ...process.env,
      SESSION_ID: sessionId.toString(),
      TOTAL_PARTES: partes.toString(),
      LEADS_POR_PARTE: contatosPorParte.toString(),
      PREFIXO_GERACAO: prefixo,
      SESSION_DIR: sessionDir,
    }
  });

  console.log(`[Files API] Geração #${sessionId} iniciada via processo filho (PID: ${child.pid})`);

  child.on('message', (msg) => {
    if (msg.type === 'PROGRESS') {
      generationStatus.current = msg.current;
      generationStatus.total = msg.total;
      generationStatus.message = msg.message;
    }
  });

  child.on('exit', (code) => {
    console.log(`[Files API] Gerador #${sessionId} (PID: ${child.pid}) encerrado com código ${code}`);
    generationStatus.running = false;

    if (code === 0) {
      generationStatus.message = `Geração concluída com sucesso! ${partes} planilhas prontas.`;
    } else {
      generationStatus.message = `Falha na geração (Código de erro: ${code})`;

      try {
        const s = db.prepare('SELECT status FROM generation_sessions WHERE id = ?').get(sessionId);
        if (s && s.status === 'RUNNING') {
          db.prepare("UPDATE generation_sessions SET status = 'ERROR', finished_at = datetime('now'), error_message = ? WHERE id = ?")
            .run(`Processo encerrado com código ${code}`, sessionId);
        }
      } catch (e) {}
    }
  });

  child.on('error', (err) => {
    console.error('[Files API] Erro no processo filho do gerador:', err);
    generationStatus.running = false;
    generationStatus.message = `Falha na geração: ${err.message}`;
    try {
      db.prepare("UPDATE generation_sessions SET status = 'ERROR', finished_at = datetime('now'), error_message = ? WHERE id = ?")
        .run(err.message, sessionId);
    } catch (e) {}
  });
});

router.get('/generate/download-zip/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const sessionDir = path.join(SESSIONS_PATH, `session_${sessionId}`);

  try {
    if (!fs.existsSync(sessionDir)) {
      return res.status(404).json({ error: 'Arquivos desta geração não foram encontrados no servidor' });
    }

    const archiver = require('archiver');
    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.xlsx'));

    if (files.length === 0) {
      return res.status(404).json({ error: 'Nenhuma planilha encontrada para esta geração' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=leads_gerados_sessao_${sessionId}.zip`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      console.error(`[ZIP] Erro ao criar ZIP para sessão ${sessionId}:`, err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
    });

    archive.pipe(res);

    files.forEach(f => {
      archive.file(path.join(sessionDir, f), { name: f });
    });

    archive.finalize();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate/move-to-files/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const sessionDir = path.join(SESSIONS_PATH, `session_${sessionId}`);

  try {
    if (!fs.existsSync(sessionDir)) {
      return res.status(404).json({ error: 'Arquivos desta geração não foram encontrados no servidor' });
    }

    const files = fs.readdirSync(sessionDir).filter(f => f.endsWith('.xlsx'));
    if (files.length === 0) {
      return res.status(404).json({ error: 'Nenhuma planilha encontrada para mover nesta geração' });
    }

    if (!fs.existsSync(FILES_PATH)) {
      fs.mkdirSync(FILES_PATH, { recursive: true });
    }

    files.forEach(f => {
      fs.copyFileSync(path.join(sessionDir, f), path.join(FILES_PATH, f));
    });

    res.json({
      success: true,
      movedCount: files.length,
      message: `${files.length} planilhas da sessão #${sessionId} copiadas com sucesso para a fila de disparo.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate/clear', (req, res) => {
  if (generationStatus.running) {
    return res.status(400).json({ error: 'Não é possível zerar o banco de dados enquanto uma geração está em andamento.' });
  }

  try {

    db.transaction(() => {
      db.prepare('DROP TRIGGER IF EXISTS trg_phone_insert').run();
      db.prepare('DROP TRIGGER IF EXISTS trg_phone_delete').run();

      db.prepare('DELETE FROM generated_phones').run();
      db.prepare('DELETE FROM phone_stats').run();
      db.prepare('DELETE FROM generation_sessions').run();

      db.prepare(`
        CREATE TRIGGER trg_phone_insert AFTER INSERT ON generated_phones
        BEGIN
          INSERT INTO phone_stats (prefix, count)
          VALUES (new.prefix, 1)
          ON CONFLICT(prefix) DO UPDATE SET count = count + 1;
        END;
      `).run();

      db.prepare(`
        CREATE TRIGGER trg_phone_delete AFTER DELETE ON generated_phones
        BEGIN
          UPDATE phone_stats SET count = count - 1 WHERE prefix = old.prefix;
        END;
      `).run();
    })();

    db.prepare('VACUUM').run();

    res.json({ success: true, message: 'Banco de dados anti-duplicata zerado com sucesso e espaço em disco liberado!' });
  } catch (err) {
    console.error('[Clear DB Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
