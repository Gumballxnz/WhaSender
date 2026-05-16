const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const FILES_PATH = process.env.FILES_PATH || '/opt/whasender/data/arquivos';

// Obter limite de upload da VPS
router.get('/limit', (req, res) => {
  res.json({ 
    maxSize: '100MB',
    maxFiles: 104,
    description: 'Limite configurado no Nginx e API'
  });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, FILES_PATH);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.xlsx') {
      cb(null, true);
    } else {
      cb(new Error('Apenas ficheiros .xlsx são permitidos'));
    }
  }
});

// Upload múltiplo
router.post('/upload', upload.array('files', 150), (req, res) => {
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

// Listar ficheiros na VPS
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

// Limpar todos os ficheiros
router.delete('/all', (req, res) => {
  try {
    const files = fs.readdirSync(FILES_PATH).filter(f => f.endsWith('.xlsx'));
    files.forEach(f => fs.unlinkSync(path.join(FILES_PATH, f)));
    res.json({ success: true, deleted: files.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar UM ficheiro específico
router.delete('/:filename', (req, res) => {
  const { filename } = req.params;
  
  // Segurança: evitar path traversal
  if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Nome de arquivo inválido' });
  }

  const filePath = path.join(FILES_PATH, filename);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: `Ficheiro ${filename} removido` });
    } else {
      res.status(404).json({ error: 'Ficheiro não encontrado' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
