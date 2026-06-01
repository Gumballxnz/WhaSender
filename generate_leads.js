/**
 * WhaSender — Gerador de Leads de Alta Performance (Movitel Moçambique)
 * Gera 106 planilhas com 25.000 contatos únicos cada (total de 2.650.000 contatos).
 * Sem duplicidade global. Nomes formatados de "sucesso1" a "sucesso25000".
 */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// Configurações (Lê de variáveis de ambiente se executado via API, ou usa valores padrão)
const REGEN_PARTE_NAME = process.env.REGEN_PARTE_NAME || null;
const TOTAL_PARTES = REGEN_PARTE_NAME ? 1 : (parseInt(process.env.TOTAL_PARTES) || 106);
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
  
  // 1. CARREGAR NÚMEROS HISTÓRICOS E DESCOBRIR PRÓXIMA PARTE SEQUENCIAL
  const numerosExistentes = new Set();
  let proximaParteInicio = 1;

  if (fs.existsSync(OUTPUT_DIR)) {
    const arquivosExistentes = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.xlsx'));
    
    if (REGEN_PARTE_NAME) {
      console.log(`\n[Gerador] 🔄 MODO REGENERAÇÃO DE PARTE: ${REGEN_PARTE_NAME}`);
    } else {
      console.log(`\n[Gerador] 📂 Analisando ${arquivosExistentes.length} planilhas existentes na VPS...`);
      // Identificar próximo índice de parte disponível
      let maxNum = 0;
      for (const f of arquivosExistentes) {
        const match = f.match(/parte_(\d+)\.xlsx/);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxNum) maxNum = num;
        }
      }
      proximaParteInicio = maxNum + 1;
      console.log(`[Gerador] 🔢 Próxima planilha será nomeada a partir de: parte_${proximaParteInicio}.xlsx`);
    }

    // Carregar os contatos já existentes para garantir Unicidade Perpétua
    if (arquivosExistentes.length > 0) {
      console.time('Leitura de base historica');
      for (const arquivo of arquivosExistentes) {
        // Se estivermos regenerando um arquivo específico, não faz sentido carregar ele próprio se ele ainda existir!
        if (REGEN_PARTE_NAME && arquivo === REGEN_PARTE_NAME) continue;
        
        try {
          const filepath = path.join(OUTPUT_DIR, arquivo);
          const workbook = xlsx.readFile(filepath);
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          
          // Conversão rápida para JSON
          const rows = xlsx.utils.sheet_to_json(sheet);
          for (const row of rows) {
            const telefone = row.Telefone || row['Telefone'] || Object.values(row)[1];
            if (telefone) {
              numerosExistentes.add(telefone.toString().trim());
            }
          }
        } catch (err) {
          console.error(`[Gerador] ⚠️ Falha ao ler base histórica de ${arquivo}:`, err.message);
        }
      }
      console.timeEnd('Leitura de base historica');
      console.log(`[Gerador] 🔒 Total de ${numerosExistentes.size.toLocaleString()} números históricos bloqueados para evitar repetição.`);
    }
  }

  console.log(`\n[1/3] 📱 Sorteando ${TOTAL_LEADS.toLocaleString()} novos números únicos da Movitel...`);
  console.time('Sorteio de numeros');
  if (process.send) {
    process.send({ type: 'PROGRESS', current: 0, total: TOTAL_PARTES, message: `Sorteando ${TOTAL_LEADS.toLocaleString()} leads únicos...` });
  }

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

  // Sorteio de inteiros puros (unicidade ultra-rápida, sem manipulação pesada de strings)
  const sufixosSet = new Set();
  while (sufixosSet.size < TOTAL_LEADS) {
    const r = Math.floor(Math.random() * 10000000);
    sufixosSet.add(r);
  }

  // Converter inteiros em números de telefone formatados com o prefixo
  const numerosSet = new Set();
  
  // Função rápida de formatação de 7 dígitos (muito mais rápida que padStart)
  function format7(val) {
    if (val < 10) return '000000' + val;
    if (val < 100) return '00000' + val;
    if (val < 1000) return '0000' + val;
    if (val < 10000) return '000' + val;
    if (val < 100000) return '00' + val;
    if (val < 1000000) return '0' + val;
    return '' + val;
  }

  // Preencher os números completos
  for (const sufixoVal of sufixosSet) {
    const prefixo = prefixos[Math.floor(Math.random() * prefixos.length)];
    const sufixoStr = format7(sufixoVal);
    const numeroCompleto = `+${prefixo}${sufixoStr}`;

    // Validar se possui 5 ou mais repetições consecutivas
    if (regexRepeticao.test(numeroCompleto)) {
      continue;
    }
    
    // Validar contra a base histórica (impedindo duplicatas perpétuas)
    if (numerosExistentes.has(numeroCompleto)) {
      continue;
    }

    numerosSet.add(numeroCompleto);
  }

  sufixosSet.clear(); // liberar memória

  // Se algum número falhou na regex ou colidiu com a base histórica, completamos os que faltam de forma rápida
  let repeticoesHistoricas = 0;
  while (numerosSet.size < TOTAL_LEADS) {
    const prefixo = prefixos[Math.floor(Math.random() * prefixos.length)];
    const sufixoVal = Math.floor(Math.random() * 10000000);
    const sufixoStr = format7(sufixoVal);
    const numeroCompleto = `+${prefixo}${sufixoStr}`;

    if (regexRepeticao.test(numeroCompleto)) {
      continue;
    }
    if (numerosExistentes.has(numeroCompleto)) {
      repeticoesHistoricas++;
      continue;
    }
    numerosSet.add(numeroCompleto);
  }

  console.timeEnd('Sorteio de numeros');
  console.log(`[Gerador] Concluído! Todos os ${numerosSet.size.toLocaleString()} novos números são únicos.`);
  if (repeticoesHistoricas > 0) {
    console.log(`[Gerador] Evitadas ${repeticoesHistoricas.toLocaleString()} repetições históricas durante o sorteio.`);
  }

  numerosExistentes.clear(); // Liberar RAM da base histórica antes de fatiar

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

    // Nome do arquivo final dinâmico sequencial ou fixo de regeneração
    const filename = REGEN_PARTE_NAME ? REGEN_PARTE_NAME : `parte_${proximaParteInicio + parte - 1}.xlsx`;
    const filepath = path.join(OUTPUT_DIR, filename);

    // Escrever arquivo no disco de forma síncrona
    xlsx.writeFile(wb, filepath);

    if (process.send) {
      process.send({ type: 'PROGRESS', current: parte, total: TOTAL_PARTES, message: `Planilha ${filename} gerada.` });
    }

    const tempoGasto = ((Date.now() - inicioTime) / 1000).toFixed(2);
    console.log(`[${parte}/${TOTAL_PARTES}] Planilha ${filename} gerada com sucesso em ${tempoGasto}s.`);

    // Garantir que a garbage collection do Node libere memória
    if (global.gc) global.gc();
  }

  console.log('\n=========================================');
  console.log('✅ GERAÇÃO EM MASSA CONCLUÍDA COM SUCESSO!');
  console.log(`Destino: ${OUTPUT_DIR}`);
  if (REGEN_PARTE_NAME) {
    console.log(`Planilha regenerada: ${REGEN_PARTE_NAME}`);
  } else {
    console.log(`Total de planilhas criadas: ${TOTAL_PARTES}`);
    console.log(`Faixa gerada: parte_${proximaParteInicio}.xlsx a parte_${proximaParteInicio + TOTAL_PARTES - 1}.xlsx`);
  }
  console.log(`Total de novos leads: ${TOTAL_LEADS.toLocaleString()}`);
  console.timeEnd('Tempo total de execucao');
  console.log('=========================================\n');
}

generate().catch(err => {
  console.error('[ERRO] Falha crítica na geração dos leads:', err);
});
