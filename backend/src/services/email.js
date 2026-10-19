/* Email service — Supports Gmail / SMTP (via Nodemailer) and Resend HTTP API */
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  nodemailer = null;
}
const {
  RESEND_API_KEY,
  RESEND_FROM,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} = require('../config');

function buildPasswordResetEmailHtml(team, code) {
  const teamName = team && team.team_name ? team.team_name : 'участник';
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #fdfcf9; border: 1px solid #dcd5c7; border-radius: 8px;">
      <div style="border-bottom: 2px solid #9a3a24; padding-bottom: 14px; margin-bottom: 20px;">
        <h2 style="color: #1d1b18; font-size: 22px; margin: 0; font-weight: 700;">Akylman Quiz Bowl</h2>
        <p style="color: #857f73; font-size: 13px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 0.05em;">Сброс пароля команды</p>
      </div>

      <p style="color: #1d1b18; font-size: 15px; line-height: 1.5;">Здравствуйте, команда <strong>«${escapeHtml(teamName)}»</strong>!</p>
      <p style="color: #4b473f; font-size: 14.5px; line-height: 1.5;">Вы запросили сброс пароля для входа в кабинет турнира Akylman Quiz Bowl.</p>

      <div style="background: #faf7f0; border: 1px solid #b8b0a0; padding: 22px; border-radius: 6px; text-align: center; margin: 24px 0;">
        <p style="font-size: 12.5px; color: #857f73; text-transform: uppercase; letter-spacing: 0.06em; margin: 0 0 10px 0; font-weight: 600;">Ваш код подтверждения:</p>
        <div style="font-size: 34px; font-weight: 800; color: #9a3a24; letter-spacing: 10px; font-family: monospace, monospace;">${escapeHtml(code)}</div>
        <p style="font-size: 13px; color: #857f73; margin: 10px 0 0 0;">Действителен в течение 15 минут</p>
      </div>

      <p style="color: #857f73; font-size: 13px; line-height: 1.5; margin-top: 20px;">Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо. Пароль вашей команды останется без изменений.</p>

      <div style="border-top: 1px solid #e8e3d8; padding-top: 14px; margin-top: 24px; font-size: 12px; color: #968f82; text-align: center;">
        Президентский лицей «Акылман» (Чолпон-Ата) • Akylman Quiz Bowl
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendViaNodemailer({ to, subject, html }) {
  if (!nodemailer) {
    return { ok: false, reason: 'Nodemailer module is not installed' };
  }
  let transporter = null;
  let fromAddress = '';

  const user = String(SMTP_USER || GMAIL_USER || '').trim();
  const pass = String(SMTP_PASS || GMAIL_APP_PASSWORD || '').trim().replace(/\s+/g, '');
  const host = String(SMTP_HOST || (user.endsWith('@gmail.com') ? 'smtp.gmail.com' : '')).trim();
  const port = SMTP_PORT || 587;

  if (user && pass) {
    if (user.endsWith('@gmail.com') || host.includes('gmail.com')) {
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user,
          pass,
        },
      });
    } else {
      transporter = nodemailer.createTransport({
        host: host || 'smtp.gmail.com',
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });
    }
    fromAddress = SMTP_FROM || `Akylman Quiz Bowl <${user}>`;
  }

  if (!transporter) {
    return { ok: false, reason: 'No SMTP/Gmail credentials configured' };
  }

  const info = await transporter.sendMail({
    from: fromAddress,
    to,
    subject,
    html,
  });

  return { ok: true, messageId: info.messageId };
}

async function sendViaResend({ to, subject, html }) {
  if (!RESEND_API_KEY || RESEND_API_KEY.startsWith('re_xx') || RESEND_API_KEY.length < 25) {
    return { ok: false, reason: 'RESEND_API_KEY is not a valid Resend key' };
  }

  const sender = (RESEND_FROM && RESEND_FROM.includes('@') && RESEND_FROM !== '123')
    ? RESEND_FROM
    : 'Akylman Quiz Bowl <onboarding@resend.dev>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: sender,
      to,
      subject,
      html,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    return { ok: false, status: response.status, error: text };
  }

  return { ok: true, data: text };
}

async function sendPasswordResetEmail({ email, team, code }) {
  const subject = 'Код сброса пароля: ' + code + ' — Akylman Quiz Bowl';
  const html = buildPasswordResetEmailHtml(team, code);

  console.log(`[EMAIL] Initiating password reset dispatch to ${email}...`);
  let lastErrorDetail = '';

  // 1. Try Nodemailer (Gmail / SMTP) if credentials provided
  try {
    const smtpRes = await sendViaNodemailer({ to: email, subject, html });
    if (smtpRes.ok) {
      console.log(`✓ Password reset email sent via SMTP/Gmail to ${email} (ID: ${smtpRes.messageId})`);
      return { success: true, provider: 'smtp' };
    } else if (smtpRes.reason) {
      lastErrorDetail = smtpRes.reason;
    }
  } catch (smtpErr) {
    console.error('SMTP send attempt failed:', smtpErr.message);
    if (smtpErr.code === 'EAUTH' || (smtpErr.message && smtpErr.message.includes('535'))) {
      lastErrorDetail = 'Google отклонил пароль (535 BadCredentials). Для Gmail нужен 16-значный пароль приложения (myaccount.google.com/apppasswords), а не обычный пароль от аккаунта.';
    } else {
      lastErrorDetail = `Ошибка SMTP: ${smtpErr.message}`;
    }
  }

  // 2. Try Resend if configured
  try {
    const resendRes = await sendViaResend({ to: email, subject, html });
    if (resendRes.ok) {
      console.log(`✓ Password reset email sent via Resend to ${email}`);
      return { success: true, provider: 'resend' };
    } else {
      console.warn('Resend send attempt failed:', resendRes.reason || resendRes.error);
      if (!lastErrorDetail) {
        lastErrorDetail = resendRes.reason || 'Ошибка сервиса Resend';
      }
    }
  } catch (resendErr) {
    console.error('Resend send attempt error:', resendErr.message);
    if (!lastErrorDetail) {
      lastErrorDetail = `Ошибка Resend: ${resendErr.message}`;
    }
  }

  console.error(`✗ Failed to deliver password reset email to ${email}. Detail: ${lastErrorDetail}`);

  return {
    success: false,
    reason: lastErrorDetail || 'Почтовый сервис не настроен или отклонил отправку.',
    userMessage: lastErrorDetail
      ? `Не удалось отправить письмо: ${lastErrorDetail}`
      : 'Не удалось отправить письмо с кодом. Пожалуйста, проверьте настройки почтового сервера.',
  };
}

module.exports = {
  sendPasswordResetEmail,
};
