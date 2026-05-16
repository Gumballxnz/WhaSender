/**
 * WhaSender — Lógica de envio de arquivos
 * Lê cada arquivo do disco individualmente para economizar RAM
 */

const fs = require('fs');
const path = require('path');

/**
 * Envia a fila de arquivos sequencialmente com delay entre envios
 * @param {function} getSock — função que retorna a instância ativa do Baileys
 * @param {Array<{jid: string, filePath: string, fileName: string, contactName: string}>} queue
 * @param {number} delayMs — delay entre envios em milissegundos
 * @param {function} onProgress — callback({ sent, total, current, status, error? })
 * @param {object} control — objeto com flag { stop: false } para cancelamento
 * @param {number} startIndex — índice inicial para o envio (padrão 0)
 */
async function sendQueue(getSock, queue, delayMs, onProgress, control, startIndex = 0, batchSize = 0, batchPauseMs = 0, maxPauses = 0) {
  const total = queue.length;
  let errosConsecutivos = 0;
  let sentInBatch = 0;
  let pausesTaken = 0;

  for (let i = startIndex; i < queue.length; i++) {
    // Verificar se o disparo foi cancelado
    if (control.stop) {
      onProgress({ sent: i, total, current: null, status: 'STOPPED', currentIndex: i });
      return;
    }

    const item = queue[i];

    try {
      // Verificar se o arquivo existe antes de tentar enviar
      if (!fs.existsSync(item.filePath)) {
        throw new Error(`Arquivo não encontrado: ${item.filePath}`);
      }

      // Ler o arquivo do disco (não manter em memória)
      const fileBuffer = fs.readFileSync(item.filePath);

      // Determinar o MIME type baseado na extensão
      const mimeType = getMimeType(item.fileName);

      // Sistema de tentativas (Retry) em caso de queda de conexão
      let tentativas = 0;
      let maxTentativas = 6; // Aguarda até 30 segundos (6 x 5s) para o bot reconectar
      let enviadoComSucesso = false;
      let ultimoErro = null;

      while (!enviadoComSucesso && tentativas < maxTentativas) {
        if (control.stop) return;
        
        const activeSock = getSock();
        if (!activeSock) {
          tentativas++;
          await sleep(5000);
          continue;
        }

        try {
          await activeSock.sendMessage(item.jid, {
            document: fileBuffer,
            mimetype: mimeType,
            fileName: item.fileName,
          });
          enviadoComSucesso = true;

          // ✅ SUCESSO — deletar ficheiro imediatamente para economizar espaço
          try {
            fs.unlinkSync(item.filePath);
            console.log(`[DELETE] ${item.fileName} removido após envio bem-sucedido`);
          } catch (deleteErr) {
            console.error(`[DELETE_ERROR] Não foi possível deletar ${item.fileName}:`, deleteErr.message);
          }

        } catch (e) {
          ultimoErro = e;
          // Se for erro de conexão fechada, esperar reconexão
          if (e.message.includes('Connection Closed') || e.message.includes('Socket') || e.message.includes('disconnect')) {
            tentativas++;
            await sleep(5000);
          } else {
            // Se for erro definitivo, quebrar o loop para cair no catch externo
            throw e;
          }
        }
      }

      if (!enviadoComSucesso) {
        // ❌ FALHA DEFINITIVA — NÃO deletar ficheiro para permitir reenvio manual
        throw ultimoErro || new Error('Tempo esgotado aguardando reconexão');
      }

      // Resetar contador de erros consecutivos
      errosConsecutivos = 0;

      onProgress({
        sent: i + 1,
        total,
        current: { name: item.contactName, file_name: item.fileName, contactId: item.contactId },
        status: 'SENDING',
        currentIndex: i
      });

    } catch (err) {
      errosConsecutivos++;

      onProgress({
        sent: i + 1,
        total,
        current: { name: item.contactName, file_name: item.fileName, contactId: item.contactId },
        status: 'ERROR',
        error: err.message,
        currentIndex: i
      });

      // Alerta se muitos erros consecutivos (possível bloqueio do WhatsApp)
      if (errosConsecutivos >= 10) {
        onProgress({
          sent: i + 1,
          total,
          current: null,
          status: 'ALERT_TOO_MANY_ERRORS',
          error: `${errosConsecutivos} erros consecutivos — possível bloqueio temporário`
        });
      }
    }

    // Aplicar delay entre envios (exceto após o último item)
    if (i < queue.length - 1 && !control.stop) {
      sentInBatch++;
      
      // Checar se atingiu o limite do lote e se não excedeu o limite máximo de pausas
      if (batchSize > 0 && sentInBatch >= batchSize && (maxPauses === 0 || pausesTaken < maxPauses)) {
        pausesTaken++;
        console.log(`[Bot] Lote de ${batchSize} atingido (Pausa ${pausesTaken}/${maxPauses === 0 ? 'Infinito' : maxPauses}). Pausando por ${batchPauseMs / 1000}s`);
        onProgress({
          sent: i + 1,
          total,
          current: null,
          status: 'PAUSED_BATCH',
          currentIndex: i,
          batchPauseMs
        });

        // Esperar o tempo de pausa (em blocos de 1 segundo para permitir cancelamento)
        let waited = 0;
        while (waited < batchPauseMs && !control.stop) {
          await sleep(1000);
          waited += 1000;
        }
        
        sentInBatch = 0; // Resetar contador de lote
      } else {
        await sleep(delayMs);
      }
    }
  }

  // Disparo finalizado
  if (!control.stop) {
    onProgress({ sent: total, total, current: null, status: 'DONE', currentIndex: total });
  }
}

/**
 * Determinar MIME type baseado na extensão do arquivo
 */
function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.csv': 'text/csv',
    '.txt': 'text/plain',
    '.zip': 'application/zip',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Sleep utilitário
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { sendQueue };
