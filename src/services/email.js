/* Email service — Resend HTTP API only */
const { RESEND_API_KEY, RESEND_FROM } = require('../config');

function buildPasswordResetEmailHtml(team, code) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1e40af;">Сброс пароля</h2>
      <p>Здравствуйте, ${escapeHtml(team.captain_name || 'пользователь')}!</p>
      <p>Вы запросили сброс пароля для вашей команды в Akylman Quiz Bowl.</p>
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <p style="font-size: 14px; color: #6b7280; margin: 0 0 10px 0;">Ваш код для сброса пароля:</p>
        <p style="font-size: 32px; font-weight: bold; color: #1e40af; letter-spacing: 8px; margin: 0; font-family: monospace;">${escapeHtml(code)}</p>
      </div>
      <p style="color: #6b7280; font-size: 14px;">Этот код действителен в течение 15 минут.</p>
      <p style="color: #ef4444; font-size: 14px;">Если вы не запрашивали сброс пароля, проигнорируйте это письмо.</p>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendPasswordResetEmail({ email, team, code }) {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const subject = 'Код сброса пароля - Akylman Quiz Bowl';
  const html = buildPasswordResetEmailHtml(team, code);

  console.log(`Sending password reset email via Resend to ${email}...`);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: email,
      subject,
      html,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error('✗ Resend API error:', response.status, text);
    throw new Error(`Resend API error: ${response.status}`);
  }

  console.log(`✓ Password reset email sent via Resend to ${email}`);
}

module.exports = {
  sendPasswordResetEmail,
};
