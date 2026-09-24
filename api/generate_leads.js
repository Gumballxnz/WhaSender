const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const SESSION_ID = parseInt(process.env.SESSION_ID) || 0;
const TOTAL_PARTES = parseInt(process.env.TOTAL_PARTES) || 106;
const LEADS_POR_PARTE = parseInt(process.env.LEADS_POR_PARTE) || 25000;
const PREFIXO = process.env.PREFIXO_GERACAO || '87';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/whasender.db');
const FILES_PATH = process.env.SESSION_DIR || process.env.FILES_PATH || path.join(__dirname, '../data/arquivos');

if (!SESSION_ID) {
  console.error('[Gerador] SESSION_ID é obrigatório');
  process.exit(1);
}

const PREFIXO_MAP = {
  '84': ['25884'],
  '85': ['25885'],
  '86': ['25886'],
  '87': ['25887'],
  'ambos': ['25886', '25887'],
  'todos': ['25884', '25885', '25886', '25887'],
};

const prefixos = PREFIXO_MAP[PREFIXO];
if (!prefixos) {
  console.error(`[Gerador] Prefixo inválido: "${PREFIXO}". Use: 84, 85, 86, 87, ambos ou todos.`);
  process.exit(1);
}

const prefixCodes = PREFIXO === 'ambos' ? ['86', '87'] : PREFIXO === 'todos' ? ['84', '85', '86', '87'] : [PREFIXO];

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 20000');

const checkPhone = db.prepare('SELECT 1 FROM generated_phones WHERE phone = ? LIMIT 1');

const insertPhone = db.prepare('INSERT OR IGNORE INTO generated_phones (phone, prefix, session_id) VALUES (?, ?, ?)');
const insertMany = db.transaction((phones) => {
  let inserted = 0;
  for (const p of phones) {
    const result = insertPhone.run(p.phone, p.prefix, p.sessionId);
    if (result.changes > 0) inserted++;
  }
  return inserted;
});

if (!fs.existsSync(FILES_PATH)) {
  fs.mkdirSync(FILES_PATH, { recursive: true });
}

function gerarNumero(prefixo5) {

  const restante = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
  return `+${prefixo5}${restante}`;
}

function gerarNumerosUnicos(quantidade) {
  const numeros = [];
  let tentativas = 0;
  const maxTentativas = quantidade * 20;

  const localBatchPhones = new Set();

  while (numeros.length < quantidade && tentativas < maxTentativas) {
    tentativas++;

    const prefixo5 = prefixos[Math.floor(Math.random() * prefixos.length)];
    const numero = gerarNumero(prefixo5);

    if (localBatchPhones.has(numero)) {
      continue;
    }

    const exists = checkPhone.get(numero);
    if (!exists) {
      localBatchPhones.add(numero);
      numeros.push({
        phone: numero,
        prefix: prefixo5.substring(3),
      });
    }
  }

  if (numeros.length < quantidade) {
    console.warn(`[Gerador] ⚠️ Só foi possível gerar ${numeros.length}/${quantidade} números únicos (espaço de números pode estar a esgotar para este prefixo)`);
  }

  return numeros;
}

function escreverXLSX(filePath, numeros, parteIndex) {

  try {
    const XLSX = require('xlsx');
    const data = numeros.map((n, i) => ({
      Nome: `sucesso${i + 1}`,
      Numero: n.phone,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contatos');
    XLSX.utils.sheet_add_aoa(ws, [['Nome', 'Numero']], { origin: 'A1' });
    XLSX.writeFile(wb, filePath);
  } catch (err) {

    try {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Contatos');
      sheet.columns = [
        { header: 'Nome', key: 'nome', width: 15 },
        { header: 'Numero', key: 'numero', width: 20 },
      ];
      numeros.forEach((n, i) => {
        sheet.addRow({ nome: `sucesso${i + 1}`, numero: n.phone });
      });

      return workbook.xlsx.writeFile(filePath);
    } catch (err2) {
      throw new Error(`Nenhuma biblioteca de Excel disponível. Instale 'xlsx' ou 'exceljs'. Erros: ${err.message} / ${err2.message}`);
    }
  }
}

async function main() {
  const totalLeads = TOTAL_PARTES * LEADS_POR_PARTE;
  const prefixoLabel = PREFIXO === 'ambos' ? '86 e 87' : PREFIXO === 'todos' ? '84, 85, 86 e 87' : PREFIXO;

  console.log(`[Gerador] ═══════════════════════════════════════════`);
  console.log(`[Gerador] Sessão #${SESSION_ID}`);
  console.log(`[Gerador] Prefixo: ${prefixoLabel}`);
  console.log(`[Gerador] Partes: ${TOTAL_PARTES} × ${LEADS_POR_PARTE.toLocaleString()} = ${totalLeads.toLocaleString()} leads`);
  console.log(`[Gerador] Saída: ${FILES_PATH}`);
  console.log(`[Gerador] ═══════════════════════════════════════════`);

  process.send?.({
    type: 'PROGRESS',
    current: 0,
    total: TOTAL_PARTES,
    message: `Sorteando ${totalLeads.toLocaleString()} números únicos (Prefixo ${prefixoLabel})...`
  });

  for (let parte = 1; parte <= TOTAL_PARTES; parte++) {
    const fileName = `parte_${parte}.xlsx`;
    const filePath = path.join(FILES_PATH, fileName);

    const numeros = gerarNumerosUnicos(LEADS_POR_PARTE);

    const phonesToInsert = numeros.map(n => ({
      phone: n.phone,
      prefix: n.prefix,
      sessionId: SESSION_ID,
    }));
    const inserted = insertMany(phonesToInsert);

    await escreverXLSX(filePath, numeros, parte);

    const percentual = Math.round((parte / TOTAL_PARTES) * 100);
    console.log(`[Gerador] ✅ ${fileName} — ${numeros.length.toLocaleString()} números (${inserted} novos no banco) — ${percentual}%`);

    process.send?.({
      type: 'PROGRESS',
      current: parte,
      total: TOTAL_PARTES,
      message: `Parte ${parte}/${TOTAL_PARTES} gerada (${numeros.length.toLocaleString()} contatos) — ${percentual}%`
    });
  }

  db.prepare("UPDATE generation_sessions SET status = 'DONE', finished_at = datetime('now') WHERE id = ?")
    .run(SESSION_ID);

  const totalNoBanco = db.prepare('SELECT SUM(count) as count FROM phone_stats').get().count || 0;
  console.log(`[Gerador] ═══════════════════════════════════════════`);
  console.log(`[Gerador] ✅ CONCLUÍDO — ${TOTAL_PARTES} planilhas geradas com sucesso`);
  console.log(`[Gerador] 📊 Total global no banco: ${totalNoBanco.toLocaleString()} números únicos`);
  console.log(`[Gerador] ═══════════════════════════════════════════`);

  db.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('[Gerador] ❌ ERRO FATAL:', err.message);

  try {
    db.prepare("UPDATE generation_sessions SET status = 'ERROR', finished_at = datetime('now'), error_message = ? WHERE id = ?")
      .run(err.message, SESSION_ID);
    db.close();
  } catch (e) {}

  process.exit(1);
});
