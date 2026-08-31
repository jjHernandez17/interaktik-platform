// tiktokinteractive/backend/src/services/emailService.js
//
// Correo transaccional via Resend (API HTTPS, no SMTP): Railway bloquea
// puertos SMTP salientes (587/465/25) fuera del plan Pro, asi que el envio
// tiene que salir por HTTPS. Si no esta configurado, no truena el registro:
// solo deja el link de verificacion en el log para poder probar manualmente
// mientras se configura.

const env = require('../config/env');
const logger = require('../config/logger');

function isConfigured() {
  return Boolean(env.RESEND_API_KEY);
}

function buildVerificationEmailHtml({ name, verifyUrl }) {
  return `
    <div style="font-family: Arial, sans-serif; background:#0b1020; padding:32px; color:#e5eefc;">
      <div style="max-width:480px; margin:0 auto; background:#131826; border-radius:16px; padding:32px; border:1px solid rgba(148,163,184,0.18);">
        <p style="color:#22d3ee; text-transform:uppercase; letter-spacing:0.14em; font-size:12px; font-weight:700; margin:0 0 12px;">PlayTik Live</p>
        <h1 style="margin:0 0 16px; font-size:22px;">Confirma tu cuenta</h1>
        <p style="color:#94a3b8; line-height:1.6; margin:0 0 24px;">
          Hola ${name || ''}, gracias por registrarte. Confirma tu correo para activar tu cuenta y comenzar tu prueba gratuita de 2 dias.
        </p>
        <a href="${verifyUrl}" style="display:inline-block; padding:14px 24px; border-radius:12px; background:linear-gradient(135deg,#7c5cff,#22d3ee); color:#fff; text-decoration:none; font-weight:700;">
          Verificar mi cuenta
        </a>
        <p style="color:#5c6b85; font-size:12px; margin:28px 0 0; line-height:1.5;">
          Este enlace vence en 24 horas. Si no creaste esta cuenta, puedes ignorar este correo.<br>
          Si el boton no funciona, copia este link: ${verifyUrl}
        </p>
      </div>
    </div>
  `;
}

async function sendVerificationEmail({ to, name, verifyUrl }) {
  if (!isConfigured()) {
    logger.warn(`[email] Resend no configurado todavia. Link de verificacion para ${to}: ${verifyUrl}`);
    return { sent: false };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject: 'Verifica tu cuenta en PlayTik Live',
        html: buildVerificationEmailHtml({ name, verifyUrl }),
        text: `Hola ${name || ''}, verifica tu cuenta entrando a: ${verifyUrl} (vence en 24 horas)`,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Resend respondio ${response.status}: ${body}`);
    }

    return { sent: true };
  } catch (error) {
    logger.error('[email] Error enviando correo de verificacion', error);
    return { sent: false, error: error.message };
  }
}

module.exports = {
  isConfigured,
  sendVerificationEmail,
};
