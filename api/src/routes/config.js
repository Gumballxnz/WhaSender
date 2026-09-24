const express = require('express');
const db = require('../db');
const router = express.Router();

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

    if (updates.schedule_time || updates.schedule_enabled) {

      process.emit('settings:schedule-updated');
    }

    res.json({ message: `${count} configuração(ões) atualizada(s)` });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar configurações', details: err.message });
  }
});

module.exports = router;
