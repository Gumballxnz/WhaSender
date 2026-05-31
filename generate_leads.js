/**
 * WhaSender — Gerador de Leads de Alta Performance (Movitel Moçambique)
 * Gera 106 planilhas com 25.000 contatos únicos cada (total de 2.650.000 contatos).
 * Sem duplicidade global. Nomes formatados de "sucesso1" a "sucesso25000".
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// Configurações (Lê de variáveis de ambiente se executado via API, ou usa valores padrão)
const TOTAL_PARTES = parseInt(process.env.TOTAL_PARTES) || 106;
const LEADS_POR_PARTE = parseInt(process.env.LEADS_POR_PARTE) || 25000;
const TOTAL_LEADS = TOTAL_PARTES * LEADS_POR_PARTE;

// Caminho de saída padrão (detecta VPS ou Local)
let OUTPUT_DIR = '/opt/whasender/data/arquivos';

if (!fs.existsSync(OUTPUT_DIR)) {
  // Fallback para pasta local do projeto
  OUTPUT_DIR = path.join(__dirname, 'arquivos_gerados');
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

console.log(`[Gerador] Direto de saída configurado para: ${OUTPUT_DIR}`);

/**
 * Executa a geração em massa
 */
async function generate() {
  console.time('Tempo total de execucao');
  console.log(`\n[1/3] 📱 Sorteando ${TOTAL_LEADS.toLocaleString()} números únicos da Movitel...`);
  console.time('Sorteio de numeros');
  if (process.send) {
    process.send({ type: 'PROGRESS', current: 0, total: TOTAL_PARTES, message: `Sorteando ${TOTAL_LEADS.toLocaleString()} leads únicos...` });
  }

  const numerosSet = new Set();
  
  // Obter prefixo a ser gerado ('87', '86' ou 'ambos')
  const PREFIXO_GERACAO = process.env.PREFIXO_GERACAO || '87';
  const prefixos = [];
  if (PREFIXO_GERACAO === '87') {
    prefixos.push('25887');
  } else if (PREFIXO_GERACAO === '86') {
    prefixos.push('25886');
  } else {
    prefixos.push('25886', '25887');
  }

  // Regex para encontrar 5 ou mais dígitos idênticos consecutivos (ex: 11111, 22222, etc.)
  const regexRepeticao = /(\d)\1{4,}/;

  while (numerosSet.size < TOTAL_LEADS) {
    // Escolher prefixo aleatório (86 ou 87)
    const prefixo = prefixos[Math.floor(Math.random() * prefixos.length)];
    const sufixo = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
    const numeroCompleto = `+${prefixo}${sufixo}`;
    
    // Validar se possui 5 ou mais repetições consecutivas do mesmo dígito
    if (regexRepeticao.test(numeroCompleto)) {
      continue; // Descartar e gerar outro
    }
    
    numerosSet.add(numeroCompleto);
  }

  console.timeEnd('Sorteio de numeros');
  console.log(`[Gerador] Concluído! Todos os ${numerosSet.size.toLocaleString()} números são únicos.`);

  // Converter para Array para fatiar por partes
  console.log('\n[2/3] 🔄 Convertendo e preparando particionamento...');
  const numerosArray = Array.from(numerosSet);
  numerosSet.clear(); // Liberar RAM do Set global imediatamente

  console.log('\n[3/3] 💾 Criando planilhas XLSX sequencialmente...');
  
  for (let parte = 1; parte <= TOTAL_PARTES; parte++) {
    const inicioTime = Date.now();
    
    // Fatiar a parte atual
    const offsetInicio = (parte - 1) * LEADS_POR_PARTE;
    const offsetFim = offsetInicio + LEADS_POR_PARTE;
    const numerosLote = numerosArray.slice(offsetInicio, offsetFim);

    // Montar o Array de Arrays (AOA) para o SheetJS
    const aoa = [['Nome', 'Telefone']];
    for (let k = 0; k < LEADS_POR_PARTE; k++) {
      aoa.push([`sucesso${k + 1}`, numerosLote[k]]);
    }

    // Gerar planilha e workbook
    const ws = xlsx.utils.aoa_to_sheet(aoa);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Leads');

    // Nome do arquivo final
    const filename = `parte_${parte}.xlsx`;
    const filepath = path.join(OUTPUT_DIR, filename);

    // Escrever arquivo no disco de forma síncrona
    xlsx.writeFile(wb, filepath);

    if (process.send) {
      process.send({ type: 'PROGRESS', current: parte, total: TOTAL_PARTES, message: `Planilha parte_${parte}.xlsx gerada.` });
    }

    const tempoGasto = ((Date.now() - inicioTime) / 1000).toFixed(2);
    console.log(`[${parte}/${TOTAL_PARTES}] Planilha ${filename} gerada com sucesso em ${tempoGasto}s.`);

    // Garantir que a garbage collection do Node libere memória
    if (global.gc) global.gc();
  }

  console.log('\n=========================================');
  console.log('✅ GERAÇÃO EM MASSA CONCLUÍDA COM SUCESSO!');
  console.log(`Destino: ${OUTPUT_DIR}`);
  console.log(`Total de planilhas: ${TOTAL_PARTES}`);
  console.log(`Total de leads: ${TOTAL_LEADS.toLocaleString()}`);
  console.timeEnd('Tempo total de execucao');
  console.log('=========================================\n');
}

generate().catch(err => {
  console.error('[ERRO] Falha crítica na geração dos leads:', err);
});
