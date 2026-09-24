const fs = require('fs');
const path = require('path');

function promiseWithTimeout(promise, ms, errorMsg = 'Timeout da operação esgotado') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMsg));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

async function sendQueue(getSock, queue, delayMs, onProgress, control, startIndex = 0, batchSize = 0, batchPauseMs = 0, maxPauses = 0) {
  const total = queue.length;
  let errosConsecutivos = 0;
  let sentInBatch = 0;
  let pausesTaken = 0;

  const arquivosParaDeletar = [];

  for (let i = startIndex; i < queue.length; i++) {

    if (control.stop) {
      onProgress({ sent: i, total, current: null, status: 'STOPPED', currentIndex: i });

      deletarArquivosEmLote(arquivosParaDeletar);
      return;
    }

    const item = queue[i];

    try {

      if (!fs.existsSync(item.filePath)) {
        throw new Error('Arquivo não encontrado: ' + item.filePath);
      }

      const fileBuffer = fs.readFileSync(item.filePath);

      const mimeType = getMimeType(item.fileName);

      let tentativas = 0;
      let maxTentativas = 20;
      let enviadoComSucesso = false;
      let ultimoErro = null;

      while (!enviadoComSucesso && tentativas < maxTentativas) {
        if (control.stop) {
          deletarArquivosEmLote(arquivosParaDeletar);
          return;
        }

        const activeSock = getSock();
        if (!activeSock) {
          tentativas++;
          await sleep(5000);
          continue;
        }

        try {
          const checkJid = item.jid.split('@')[0];
          const existsCheck = await promiseWithTimeout(
            activeSock.onWhatsApp(checkJid),
            15000,
            'Timeout ao checar existência do número'
          );
          const existsResult = existsCheck?.[0];
          if (!existsResult || !existsResult.exists) {
            console.log(`[Bot] Número ${checkJid} não existe no WhatsApp. Pulando envio.`);
            throw new Error('Número não cadastrado no WhatsApp');
          }
        } catch (e) {
          if (e.message === 'Número não cadastrado no WhatsApp') {
            throw e;
          }
          console.warn('[Bot] Falha ao verificar número no WhatsApp (onWhatsApp):', e.message);
        }

        try {

          await promiseWithTimeout(
            activeSock.sendMessage(item.jid, {
              document: fileBuffer,
              mimetype: mimeType,
              fileName: item.fileName,
            }),
            35000,
            'Timeout ao tentar enviar mensagem via Baileys'
          );
          enviadoComSucesso = true;

          arquivosParaDeletar.push(item.filePath);
          console.log(`[QUEUE] ${item.fileName} marcado para deleção após o disparo completo`);

        } catch (e) {
          ultimoErro = e;

          if (e.message.includes('Connection Closed') || e.message.includes('Socket') || e.message.includes('disconnect')) {
            tentativas++;
            await sleep(5000);
          } else {

            throw e;
          }
        }
      }

      if (!enviadoComSucesso) {

        const isConnectionError = !getSock();
        if (isConnectionError) {
          console.log('[Bot] Conexão perdida permanentemente durante o envio. Forçando parada.');
          control.stop = true;
          onProgress({
            sent: i,
            total,
            current: null,
            status: 'STOPPED',
            currentIndex: i,
            error: 'Disparo pausado: Sem conexão com o WhatsApp após várias tentativas.'
          });
          deletarArquivosEmLote(arquivosParaDeletar);
          return;
        }
        throw ultimoErro || new Error('Tempo esgotado aguardando reconexão');
      }

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

    if (i < queue.length - 1 && !control.stop) {
      sentInBatch++;

      if (batchSize > 0 && sentInBatch >= batchSize && (maxPauses === 0 || pausesTaken < maxPauses)) {
        pausesTaken++;
        console.log(`[Bot] Lote de ${batchSize} atingido (Pausa ${pausesTaken}/${maxPauses}). Pausando por ${batchPauseMs / 1000}s`);
        onProgress({
          sent: i + 1,
          total,
          current: null,
          status: 'PAUSED_BATCH',
          currentIndex: i,
          batchPauseMs
        });

        let waited = 0;
        while (waited < batchPauseMs && !control.stop) {
          await sleep(1000);
          waited += 1000;
        }

        sentInBatch = 0;
      } else {
        await sleep(delayMs);
      }
    }
  }

  if (!control.stop) {
    deletarArquivosEmLote(arquivosParaDeletar);
    onProgress({ sent: total, total, current: null, status: 'DONE', currentIndex: total });
  }
}

function deletarArquivosEmLote(listaArquivos) {
  if (listaArquivos.length === 0) return;

  console.log(`[DELETE] Iniciando deleção em lote de ${listaArquivos.length} arquivos enviados com sucesso...`);

  let deletados = 0;
  let erros = 0;

  listaArquivos.forEach((filePath, index) => {
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletados++;
          console.log(`[DELETE] ${path.basename(filePath)} removido (${deletados}/${listaArquivos.length})`);
        }
      } catch (err) {
        erros++;
        console.error(`[DELETE_ERROR] Falha ao deletar ${filePath}:`, err.message);
      }
    }, index * 3000);
  });
}

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { sendQueue };
