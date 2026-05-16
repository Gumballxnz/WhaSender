/**
 * WhaSender — Rotas de Contatos
 * CRUD completo + importação em massa
 */

const express = require('express');
const db = require('../db');
const router = express.Router();

/**
 * GET /api/contacts
 * Listar todos os contatos
 */
router.get('/', (req, res) => {
  try {
    const contacts = db.prepare('SELECT * FROM contacts ORDER BY id ASC').all();
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar contatos', details: err.message });
  }
});

/**
 * POST /api/contacts
 * Criar um novo contato
 */
router.post('/', (req, res) => {
  const { name, phone, file_name } = req.body;

  if (!name || !phone || !file_name) {
    return res.status(400).json({ error: 'Nome, telefone e nome do arquivo são obrigatórios' });
  }

  // Limpar telefone — manter apenas dígitos
  const cleanPhone = phone.replace(/\D/g, '');

  try {
    const stmt = db.prepare('INSERT INTO contacts (name, phone, file_name) VALUES (?, ?, ?)');
    const result = stmt.run(name, cleanPhone, file_name);
    res.status(201).json({
      id: result.lastInsertRowid,
      name,
      phone: cleanPhone,
      file_name,
      active: 1,
    });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Este número de telefone já está cadastrado' });
    }
    res.status(500).json({ error: 'Erro ao criar contato', details: err.message });
  }
});

/**
 * PUT /api/contacts/:id
 * Atualizar um contato existente
 */
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { name, phone, file_name, active } = req.body;

  try {
    const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    const updatedName = name || existing.name;
    const updatedPhone = phone ? phone.replace(/\D/g, '') : existing.phone;
    const updatedFile = file_name || existing.file_name;
    const updatedActive = active !== undefined ? active : existing.active;

    db.prepare('UPDATE contacts SET name = ?, phone = ?, file_name = ?, active = ? WHERE id = ?')
      .run(updatedName, updatedPhone, updatedFile, updatedActive, id);

    res.json({ id: Number(id), name: updatedName, phone: updatedPhone, file_name: updatedFile, active: updatedActive });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Este número de telefone já está cadastrado' });
    }
    res.status(500).json({ error: 'Erro ao atualizar contato', details: err.message });
  }
});

/**
 * DELETE /api/contacts/:id
 * Remover um contato
 */
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  try {
    const result = db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }
    res.json({ message: 'Contato removido com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover contato', details: err.message });
  }
});

/**
 * POST /api/contacts/import
 * Importar contatos em massa via JSON array
 * Body: [{ name, phone, file_name }]
 */
router.post('/import', (req, res) => {
  const contacts = req.body;

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: 'Envie um array de contatos' });
  }

  const stmt = db.prepare('INSERT OR IGNORE INTO contacts (name, phone, file_name) VALUES (?, ?, ?)');
  const insertMany = db.transaction((contactsList) => {
    let inserted = 0;
    let skipped = 0;

    for (const c of contactsList) {
      if (!c.name || !c.phone || !c.file_name) {
        skipped++;
        continue;
      }
      const cleanPhone = c.phone.toString().replace(/\D/g, '');
      const result = stmt.run(c.name, cleanPhone, c.file_name);
      if (result.changes > 0) {
        inserted++;
      } else {
        skipped++;
      }
    }

    return { inserted, skipped };
  });

  try {
    const result = insertMany(contacts);
    res.json({
      message: `Importação concluída: ${result.inserted} inseridos, ${result.skipped} ignorados`,
      ...result,
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro na importação', details: err.message });
  }
});

module.exports = router;
