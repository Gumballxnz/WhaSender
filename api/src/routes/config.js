const express = require('express');
const db = require('../db');
const { getEmailConfig, sendEmail } = require('../utils/mailer');
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
  const allowedKeys = [
    'delay_ms',
    'schedule_time',
    'schedule_enabled',
    'max_per_dispatch',
    'batch_size',
    'batch_pause_minutes',
    'max_pauses'
  ];
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

router.get('/email', (req, res) => {
  try {
    const config = getEmailConfig();
    res.json({
      email_provider: config.email_provider || 'disabled',
      smtp_host: config.smtp_host || '',
      smtp_port: config.smtp_port || '587',
      smtp_secure: config.smtp_secure || 'false',
      smtp_user: config.smtp_user || '',
      has_smtp_pass: Boolean(config.smtp_pass),
      has_resend_key: Boolean(config.resend_api_key),
      resend_api_key_masked: config.resend_api_key ? `re_...${config.resend_api_key.slice(-4)}` : '',
      mail_from_name: config.mail_from_name || 'WhaSender',
      mail_from_address: config.mail_from_address || 'noreply@whasender.site'
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter configurações de e-mail', details: err.message });
  }
});

router.put('/email', (req, res) => {
  const {
    email_provider,
    smtp_host,
    smtp_port,
    smtp_secure,
    smtp_user,
    smtp_pass,
    resend_api_key,
    mail_from_name,
    mail_from_address
  } = req.body;

  try {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    db.transaction(() => {
      if (email_provider !== undefined) stmt.run('email_provider', String(email_provider));
      if (smtp_host !== undefined) stmt.run('smtp_host', String(smtp_host).trim());
      if (smtp_port !== undefined) stmt.run('smtp_port', String(smtp_port).trim());
      if (smtp_secure !== undefined) stmt.run('smtp_secure', String(smtp_secure));
      if (smtp_user !== undefined) stmt.run('smtp_user', String(smtp_user).trim());
      if (smtp_pass !== undefined && smtp_pass !== '') stmt.run('smtp_pass', String(smtp_pass));
      if (resend_api_key !== undefined && resend_api_key !== '') stmt.run('resend_api_key', String(resend_api_key).trim());
      if (mail_from_name !== undefined) stmt.run('mail_from_name', String(mail_from_name).trim());
      if (mail_from_address !== undefined) stmt.run('mail_from_address', String(mail_from_address).trim());
    })();

    res.json({ success: true, message: 'Configurações de e-mail salvas com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar configurações de e-mail', details: err.message });
  }
});

router.post('/email/test', async (req, res) => {
  const targetEmail = req.body.email || req.user?.email;

  if (!targetEmail) {
    return res.status(400).json({ error: 'Informe um e-mail de destino para o teste' });
  }

  const {
    email_provider,
    smtp_host,
    smtp_port,
    smtp_secure,
    smtp_user,
    smtp_pass,
    resend_api_key,
    mail_from_name,
    mail_from_address
  } = req.body;

  const configOverride = {};
  if (email_provider) configOverride.email_provider = email_provider;
  if (smtp_host) configOverride.smtp_host = smtp_host;
  if (smtp_port) configOverride.smtp_port = smtp_port;
  if (smtp_secure !== undefined) configOverride.smtp_secure = smtp_secure;
  if (smtp_user) configOverride.smtp_user = smtp_user;
  if (smtp_pass) configOverride.smtp_pass = smtp_pass;
  if (resend_api_key) configOverride.resend_api_key = resend_api_key;
  if (mail_from_name) configOverride.mail_from_name = mail_from_name;
  if (mail_from_address) configOverride.mail_from_address = mail_from_address;

  try {
    const result = await sendEmail({
      to: targetEmail,
      subject: 'Teste de Configuração de E-mail — WhaSender',
      html: `
        <div style="font-family: sans-serif; background: #09090b; color: #ededed; padding: 32px; border-radius: 8px;">
          <h2 style="color: #25d366; margin-top: 0;">WhaSender</h2>
          <p>Este é um e-mail de teste para confirmar que seu provedor de e-mail está configurado e funcionando corretamente!</p>
          <p style="color: #a1a1aa; font-size: 13px;">Data/Hora do envio: ${new Date().toLocaleString('pt-BR')}</p>
        </div>
      `,
      text: `WhaSender: Este é um e-mail de teste confirmando que seu envio de e-mails está ativo.`,
      configOverride: Object.keys(configOverride).length > 0 ? configOverride : undefined
    });

    if (!result.success) {
      return res.status(400).json({ error: result.reason || 'Provedor de e-mail desativado' });
    }

    res.json({ success: true, message: `E-mail de teste enviado para ${targetEmail}`, details: result });
  } catch (err) {
    res.status(500).json({ error: `Falha no envio de teste: ${err.message}` });
  }
});

module.exports = router;
