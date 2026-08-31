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

function wrapEmailHtml({ eyebrow, title, bodyHtml }) {
  return `
    <div style="font-family: Arial, sans-serif; background:#0b1020; padding:32px; color:#e5eefc;">
      <div style="max-width:480px; margin:0 auto; background:#131826; border-radius:16px; padding:32px; border:1px solid rgba(148,163,184,0.18);">
        <p style="color:#22d3ee; text-transform:uppercase; letter-spacing:0.14em; font-size:12px; font-weight:700; margin:0 0 12px;">${eyebrow}</p>
        <h1 style="margin:0 0 16px; font-size:22px;">${title}</h1>
        ${bodyHtml}
      </div>
    </div>
  `;
}

async function sendEmail({ to, subject, html, text, logLabel, fallbackMessage }) {
  if (!isConfigured()) {
    logger.warn(`[email] Resend no configurado todavia. ${fallbackMessage}`);
    return { sent: false };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, text }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Resend respondio ${response.status}: ${body}`);
    }

    return { sent: true };
  } catch (error) {
    logger.error(`[email] Error enviando ${logLabel}`, error);
    return { sent: false, error: error.message };
  }
}

async function sendVerificationEmail({ to, name, verifyUrl }) {
  const html = wrapEmailHtml({
    eyebrow: 'PlayTik Live',
    title: 'Confirma tu cuenta',
    bodyHtml: `
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
    `,
  });

  return sendEmail({
    to,
    subject: 'Verifica tu cuenta en PlayTik Live',
    html,
    text: `Hola ${name || ''}, verifica tu cuenta entrando a: ${verifyUrl} (vence en 24 horas)`,
    logLabel: 'correo de verificacion',
    fallbackMessage: `Link de verificacion para ${to}: ${verifyUrl}`,
  });
}

async function sendPasswordChangedEmail({ to, name }) {
  const html = wrapEmailHtml({
    eyebrow: 'PlayTik Live',
    title: 'Tu contrasena fue cambiada',
    bodyHtml: `
      <p style="color:#94a3b8; line-height:1.6; margin:0 0 24px;">
        Hola ${name || ''}, te confirmamos que la contrasena de tu cuenta (${to}) acaba de ser cambiada.
      </p>
      <p style="color:#5c6b85; font-size:12px; margin:0; line-height:1.5;">
        Si fuiste tu, no necesitas hacer nada mas. Si no reconoces este cambio, contacta a soporte de inmediato para proteger tu cuenta.
      </p>
    `,
  });

  return sendEmail({
    to,
    subject: 'Tu contrasena en PlayTik Live fue cambiada',
    html,
    text: `Hola ${name || ''}, la contrasena de tu cuenta (${to}) acaba de ser cambiada. Si no fuiste tu, contacta a soporte de inmediato.`,
    logLabel: 'aviso de cambio de contrasena',
    fallbackMessage: `Aviso de cambio de contrasena para ${to} (no enviado, Resend sin configurar).`,
  });
}

function formatAmount(amountCents, currency) {
  const amount = amountCents / 100;
  if (currency === 'COP') {
    return `$${amount.toLocaleString('es-CO')} COP`;
  }
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

const GATEWAY_LABELS = { stripe: 'Stripe', mercadopago: 'MercadoPago', wompi: 'Wompi' };

async function sendPaymentReceiptEmail({
  to,
  name,
  planName,
  amountCents,
  currency,
  gateway,
  paymentId,
  gatewayPaymentId,
  paidAt,
  accessExpiresAt,
}) {
  const amountText = formatAmount(amountCents, currency);
  const gatewayLabel = GATEWAY_LABELS[gateway] || gateway;
  const paidAtText = new Date(paidAt).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' });
  const expiresText = accessExpiresAt
    ? new Date(accessExpiresAt).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })
    : null;

  const html = wrapEmailHtml({
    eyebrow: 'PlayTik Live',
    title: 'Pago confirmado',
    bodyHtml: `
      <p style="color:#94a3b8; line-height:1.6; margin:0 0 24px;">
        Hola ${name || ''}, confirmamos tu pago del plan <strong>${planName}</strong>. Aqui esta el detalle de tu factura:
      </p>
      <table style="width:100%; border-collapse:collapse; font-size:13px; color:#cbd5e1;">
        <tr><td style="padding:6px 0; color:#5c6b85;">Plan</td><td style="padding:6px 0; text-align:right;">${planName}</td></tr>
        <tr><td style="padding:6px 0; color:#5c6b85;">Valor</td><td style="padding:6px 0; text-align:right;">${amountText}</td></tr>
        <tr><td style="padding:6px 0; color:#5c6b85;">Metodo de pago</td><td style="padding:6px 0; text-align:right;">${gatewayLabel}</td></tr>
        <tr><td style="padding:6px 0; color:#5c6b85;">ID de pago</td><td style="padding:6px 0; text-align:right;">#${paymentId}</td></tr>
        <tr><td style="padding:6px 0; color:#5c6b85;">ID de transaccion</td><td style="padding:6px 0; text-align:right;">${gatewayPaymentId}</td></tr>
        <tr><td style="padding:6px 0; color:#5c6b85;">Fecha</td><td style="padding:6px 0; text-align:right;">${paidAtText}</td></tr>
        ${expiresText ? `<tr><td style="padding:6px 0; color:#5c6b85;">Tu acceso vence</td><td style="padding:6px 0; text-align:right;">${expiresText}</td></tr>` : ''}
      </table>
      <p style="color:#5c6b85; font-size:12px; margin:24px 0 0; line-height:1.5;">
        Guarda este correo como comprobante de tu compra. Si no reconoces este pago, contacta a soporte de inmediato.
      </p>
    `,
  });

  return sendEmail({
    to,
    subject: `Comprobante de pago - ${planName}`,
    html,
    text: `Hola ${name || ''}, confirmamos tu pago del plan ${planName} por ${amountText} via ${gatewayLabel} (pago #${paymentId}, transaccion ${gatewayPaymentId}) el ${paidAtText}.${expiresText ? ` Tu acceso vence el ${expiresText}.` : ''}`,
    logLabel: 'comprobante de pago',
    fallbackMessage: `Comprobante de pago #${paymentId} para ${to} (no enviado, Resend sin configurar).`,
  });
}

module.exports = {
  isConfigured,
  sendVerificationEmail,
  sendPasswordChangedEmail,
  sendPaymentReceiptEmail,
};
