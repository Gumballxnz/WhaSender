/**
 * WhaSender — Rotas de Configurações
 * Gerenciamento de delay, agendamento e limites
 */

const express = require('express');
const db = require('../db');
const router = express.Router();

/**
 * GET /api/settings
 * Retornar todas as configurações como objeto
 */
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(row => { settings[row.key] = row.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar configurações', details: err.message });
  }
});

/**
 * PUT /api/settings
 * Atualizar configurações em lote
 * Body: { delay_ms, schedule_time, schedule_enabled, max_per_dispatch }
 */
router.put('/', (req, res) => {
  const allowedKeys = ['delay_ms', 'schedule_time', 'schedule_enabled', 'max_per_dispatch'];
  const updates = req.body;

  try {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const updateMany = db.transaction(() => {
      let updated = 0;
      for (const [key, value] of Object.entries(updates)) {
        if (allowedKeys.includes(key)) {
          stmt.run(key, String(value));
          updated++;
        }
      }
      return updated;
    });

    const count = updateMany();

    // Se o agendamento foi atualizado, notificar o index.js para reconfigurar o cron
    if (updates.schedule_time || updates.schedule_enabled) {
      // Emitir evento via módulo global (o index.js escuta isso)
      process.emit('settings:schedule-updated');
    }

    res.json({ message: `${count} configuração(ões) atualizada(s)` });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar configurações', details: err.message });
  }
});

module.exports = router;
