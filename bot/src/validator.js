function promiseWithTimeout(promise, ms, errorMsg = 'Timeout da operação esgotado') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMsg)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

async function validateQueue(getSock, numbers, chunkSize = 40, delayMs = 300, onProgress, control) {
  const total = numbers.length;
  let checked = 0;
  let validCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < total; i += chunkSize) {
    if (control.stop) {
      onProgress({ checked, validCount, invalidCount, total, resultsChunk: [], status: 'STOPPED' });
      return;
    }

    const chunk = numbers.slice(i, i + chunkSize);
    const activeSock = getSock();

    if (!activeSock) {
      onProgress({ checked, validCount, invalidCount, total, resultsChunk: [], status: 'ERROR', error: 'Bot desconectado' });
      return;
    }

    try {
      const waResults = await promiseWithTimeout(
        activeSock.onWhatsApp(...chunk),
        20000,
        'Timeout ao verificar lote no WhatsApp'
      );

      const chunkProcessed = chunk.map((phone) => {
        const clean = phone.replace(/\D/g, '');
        const found = Array.isArray(waResults) ? waResults.find((r) => r && r.jid && (r.jid.startsWith(clean) || r.jid.includes(clean))) : null;
        const exists = Boolean(found && found.exists !== false);
        return {
          phone: clean,
          exists,
          jid: exists ? found.jid : null,
        };
      });

      for (const item of chunkProcessed) {
        if (item.exists) validCount++;
        else invalidCount++;
      }

      checked += chunk.length;

      onProgress({
        checked,
        validCount,
        invalidCount,
        total,
        resultsChunk: chunkProcessed,
        status: checked >= total ? 'COMPLETED' : 'VALIDATING',
      });
    } catch (err) {
      const fallbackChunk = chunk.map((phone) => ({
        phone: phone.replace(/\D/g, ''),
        exists: false,
        jid: null,
      }));
      invalidCount += chunk.length;
      checked += chunk.length;

      onProgress({
        checked,
        validCount,
        invalidCount,
        total,
        resultsChunk: fallbackChunk,
        status: checked >= total ? 'COMPLETED' : 'VALIDATING',
        lastError: err.message,
      });
    }

    if (i + chunkSize < total && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = { validateQueue };
