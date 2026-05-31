const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const FILES_PATH = process.env.FILES_PATH || '/opt/whasender/data/arquivos';

const ignoreNextWatchEvent = new Set();
let ignoreAllWatchEvents = false;

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
    // Segurança máxima: path.basename remove qualquer tentativa de Path Traversal (ex: ../../../etc/passwd.xlsx)
    const safeName = path.basename(file.originalname);
    cb(null, safeName);
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
    ignoreAllWatchEvents = true;
    const files = fs.readdirSync(FILES_PATH).filter(f => f.endsWith('.xlsx'));
    files.forEach(f => fs.unlinkSync(path.join(FILES_PATH, f)));
    
    // Desativar a flag após um pequeno delay para dar tempo ao watcher de processar os eventos de exclusão em massa
    setTimeout(() => { ignoreAllWatchEvents = false; }, 2000);
    
    res.json({ success: true, deleted: files.length });
  } catch (err) {
    ignoreAllWatchEvents = false;
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
      // Deletamos o arquivo físico. O watcher automático cuidará da auto-regeneração circular instantânea!
      fs.unlinkSync(filePath);
      res.json({ success: true, message: `Ficheiro ${filename} removido e colocado na fila de regeneração circular` });
    } else {
      res.status(404).json({ error: 'Ficheiro não encontrado' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download de um arquivo específico
router.get('/download/:filename', (req, res) => {
  const { filename } = req.params;
  
  // Segurança: evitar path traversal
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

// Estado da geração automática
let generationStatus = {
  running: false,
  current: 0,
  total: 0,
  message: ''
};

// Rota de status da geração
router.get('/generate/status', (req, res) => {
  res.json(generationStatus);
});

// Rota de início da geração (Fase 5.2 - Execução via Processo Filho/Fork para evitar travamentos de Event Loop)
router.post('/generate', (req, res) => {
  if (generationStatus.running) {
    return res.status(409).json({ error: 'Já existe uma geração em andamento' });
  }

  const partes = parseInt(req.body.partes) || 106;
  const contatosPorParte = parseInt(req.body.contatosPorParte) || 25000;
  const prefixo = req.body.prefixo || '87'; // '87', '86' ou 'ambos'
  const totalLeads = partes * contatosPorParte;

  if (partes < 1 || partes > 150) {
    return res.status(400).json({ error: 'Partes deve ser de 1 a 150' });
  }
  if (contatosPorParte < 1 || contatosPorParte > 50000) {
    return res.status(400).json({ error: 'Contatos por parte deve ser de 1 a 50000' });
  }
  if (!['87', '86', 'ambos'].includes(prefixo)) {
    return res.status(400).json({ error: 'Prefixo inválido. Deve ser 87, 86 ou ambos.' });
  }

  const prefixoText = prefixo === 'ambos' ? '86 e 87' : prefixo;

  generationStatus = {
    running: true,
    current: 0,
    total: partes,
    message: `Sorteando ${totalLeads.toLocaleString()} números únicos (Prefixo ${prefixoText})...`
  };

  // Responder de imediato para o frontend para evitar Gateway Timeout (504) no Nginx/Cloudflare
  res.json({ success: true, message: 'Geração de leads iniciada' });

  // Iniciar o gerador de leads como processo filho separado (libera o Event Loop da API Express por completo)
  const { fork } = require('child_process');
  
  // Caminho do script na VPS (/opt/whasender/generate_leads.js) ou local
  const scriptPath = path.join(__dirname, '../../../generate_leads.js');

  const child = fork(scriptPath, [], {
    env: {
      ...process.env,
      TOTAL_PARTES: partes.toString(),
      LEADS_POR_PARTE: contatosPorParte.toString(),
      PREFIXO_GERACAO: prefixo
    }
  });

  console.log(`[Files API] Geração iniciada via processo filho (PID: ${child.pid})`);

  // Escutar atualizações de progresso via IPC
  child.on('message', (msg) => {
    if (msg.type === 'PROGRESS') {
      generationStatus.current = msg.current;
      generationStatus.total = msg.total;
      generationStatus.message = msg.message;
    }
  });

  // Capturar encerramento do gerador
  child.on('exit', (code) => {
    console.log(`[Files API] Processo filho do gerador (PID: ${child.pid}) encerrado com código ${code}`);
    generationStatus.running = false;
    
    if (code === 0) {
      generationStatus.message = `Geração concluída com sucesso! ${partes} planilhas prontas.`;
    } else {
      generationStatus.message = `Falha na geração (Código de erro: ${code})`;
    }
  });

  child.on('error', (err) => {
    console.error('[Files API] Erro no processo filho do gerador:', err);
    generationStatus.running = false;
    generationStatus.message = `Falha na geração: ${err.message}`;
  });
});

// Watcher automático de arquivos para loop de leads Movitel infinitos em tempo real
if (fs.existsSync(FILES_PATH)) {
  console.log(`[Files API Watcher] 👁️ Monitor de leads ativos inicializado em: ${FILES_PATH}`);
  
  fs.watch(FILES_PATH, (eventType, filename) => {
    if (!filename || !filename.endsWith('.xlsx')) return;
    
    // Capturar exclusão de arquivos com o padrão 'parte_X.xlsx'
    const match = filename.match(/^parte_(\d+)\.xlsx$/);
    if (!match) return;
    
    // Aguardar leve delay para dar tempo do sistema operacional concluir a deleção e liberar o lock
    setTimeout(() => {
      const filePath = path.join(FILES_PATH, filename);
      const existe = fs.existsSync(filePath);
      
      if (!existe) {
        // Ignorar se a exclusão foi em massa (all)
        if (ignoreAllWatchEvents) return;
        
        console.log(`[Files API Watcher] ⚠️ Planilha ${filename} foi enviada ou deletada da pasta de leads!`);
        console.log(`[Files API Watcher] 🚀 Iniciando regeneração assíncrona infinita de ${filename} com leads Movitel únicos...`);
        
        // Disparar o script gerador assíncrono para recriar apenas este arquivo com o mesmo nome e novos contatos únicos
        const { fork } = require('child_process');
        const scriptPath = path.join(__dirname, '../../../generate_leads.js');
        
        const child = fork(scriptPath, [], {
          env: {
            ...process.env,
            TOTAL_PARTES: '1',
            LEADS_POR_PARTE: '25000',
            PREFIXO_GERACAO: '87', // Prefixo default Movitel
            REGEN_PARTE_NAME: filename,
            OUTPUT_DIR: FILES_PATH
          }
        });
        
        child.on('exit', (code) => {
          if (code === 0) {
            console.log(`[Files API Watcher] ✅ Planilha circular ${filename} regenerada com sucesso!`);
          } else {
            console.error(`[Files API Watcher] ❌ Erro ao regenerar planilha circular ${filename} (Código: ${code})`);
          }
        });
      }
    }, 500);
  });
}

module.exports = router;
