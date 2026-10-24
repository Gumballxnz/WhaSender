const nodemailer = require('nodemailer');
const db = require('../db');

function getEmailConfig() {
  const keys = [
    'email_provider',
    'smtp_host',
    'smtp_port',
    'smtp_secure',
    'smtp_user',
    'smtp_pass',
    'resend_api_key',
    'mail_from_name',
    'mail_from_address'
  ];

  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const config = {
    email_provider: 'disabled',
    smtp_host: '',
    smtp_port: '587',
    smtp_secure: 'false',
    smtp_user: '',
    smtp_pass: '',
    resend_api_key: '',
    mail_from_name: 'WhaSender',
    mail_from_address: 'noreply@whasender.site'
  };

  keys.forEach(k => {
    const row = stmt.get(k);
    if (row && row.value !== undefined && row.value !== null) {
      config[k] = row.value;
    }
  });

  return config;
}

async function sendEmail({ to, subject, html, text, configOverride }) {
  const dbConfig = getEmailConfig();
  const config = configOverride ? { ...dbConfig, ...configOverride } : dbConfig;

  if (!config.email_provider || config.email_provider === 'disabled') {
    return { success: false, reason: 'Provedor de e-mail desativado. Selecione Resend ou SMTP e salve as configurações.' };
  }

  const fromString = `"${config.mail_from_name || 'WhaSender'}" <${config.mail_from_address || 'noreply@whasender.site'}>`;

  if (config.email_provider === 'resend') {
    if (!config.resend_api_key) {
      throw new Error('Chave de API do Resend não configurada');
    }
    if (!config.mail_from_address) {
      throw new Error('E-mail do remetente é obrigatório');
    }

    const recipients = Array.isArray(to) ? to : [to];
    const fromAddress = config.mail_from_address.trim();

    const resendFrom = config.mail_from_name
      ? `"${config.mail_from_name.trim()}" <${fromAddress}>`
      : fromAddress;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.resend_api_key.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: resendFrom,
        to: recipients,
        subject,
        html,
        text
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || `Erro Resend (${res.status})`);
    }

    return { success: true, id: data.id, provider: 'resend' };
  }

  if (config.email_provider === 'smtp') {
    if (!config.smtp_host || !config.smtp_user) {
      throw new Error('Host e usuário SMTP são obrigatórios');
    }

    const port = parseInt(config.smtp_port, 10) || 587;
    const isSecure = config.smtp_secure === 'true' || port === 465;

    const transporter = nodemailer.createTransport({
      host: config.smtp_host.trim(),
      port,
      secure: isSecure,
      auth: {
        user: config.smtp_user.trim(),
        pass: config.smtp_pass || ''
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    const info = await transporter.sendMail({
      from: fromString,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text
    });

    return { success: true, id: info.messageId, provider: 'smtp' };
  }

  throw new Error(`Provedor de email desconhecido: ${config.email_provider}`);
}

async function sendInvitationEmail({ to, organizationName, invitedByName, role, inviteUrl, expiresAt }) {
  const roleName = role === 'admin' ? 'Administrador' : 'Membro';
  const expiresFormatted = expiresAt ? new Date(expiresAt.replace(' ', 'T') + 'Z').toLocaleDateString('pt-BR') : '7 dias';

  const subject = `Convite para a equipe ${organizationName} no WhaSender`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Convite para ${organizationName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #ededed;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #09090b; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="520px" style="max-width: 520px; background-color: #121214; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; overflow: hidden; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);">
          <tr>
            <td style="padding: 32px 32px 24px; text-align: left; border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
              <div style="display: inline-block; padding: 6px 12px; background: rgba(37, 211, 102, 0.1); border: 1px solid rgba(37, 211, 102, 0.2); border-radius: 6px; font-size: 13px; font-weight: 600; color: #25d366; margin-bottom: 16px;">
                WhaSender
              </div>
              <h1 style="margin: 0 0 10px; font-size: 20px; font-weight: 600; color: #ffffff; letter-spacing: -0.5px;">
                Você foi convidado para a equipe
              </h1>
              <p style="margin: 0; font-size: 14px; color: #a1a1aa; line-height: 1.5;">
                <strong style="color: #ffffff;">${invitedByName || 'Um administrador'}</strong> convidou você para fazer parte da organização <strong style="color: #ffffff;">${organizationName}</strong> como <strong style="color: #25d366;">${roleName}</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px; text-align: center;">
              <p style="margin: 0 0 24px; font-size: 13px; color: #71717a; text-align: left; line-height: 1.5;">
                Clique no botão abaixo para aceitar o convite e acessar sua conta ou criar seu cadastro. Este convite é válido até <strong>${expiresFormatted}</strong>.
              </p>
              <a href="${inviteUrl}" style="display: inline-block; width: 100%; box-sizing: border-box; background-color: #25d366; color: #000000; font-size: 14px; font-weight: 600; text-decoration: none; text-align: center; padding: 13px 24px; border-radius: 8px; transition: background-color 0.2s;">
                Aceitar Convite
              </a>
              <p style="margin: 24px 0 0; font-size: 11px; color: #52525b; text-align: left; line-height: 1.4; word-break: break-all;">
                Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                <a href="${inviteUrl}" style="color: #a1a1aa; text-decoration: underline;">${inviteUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px; background-color: #0e0e10; border-top: 1px solid rgba(255, 255, 255, 0.06); text-align: center;">
              <span style="font-size: 11px; color: #52525b;">WhaSender · Plataforma de Automação & Mensageria</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `Você foi convidado para a equipe ${organizationName} no WhaSender por ${invitedByName || 'um administrador'} com o cargo de ${roleName}.\n\nPara aceitar, acesse o link:\n${inviteUrl}\n\nVálido até: ${expiresFormatted}`;

  return sendEmail({ to, subject, html, text });
}

module.exports = {
  getEmailConfig,
  sendEmail,
  sendInvitationEmail
};
