const nodemailer = require('nodemailer');
const { db } = require('./db');

const cfg = (k) => db.prepare('SELECT valor FROM config WHERE clave=?').get(k)?.valor;

function transporte() {
  if (process.env.PELU_MAIL_TEST) return nodemailer.createTransport({ jsonTransport: true });
  const user = cfg('smtp_user'), pass = cfg('smtp_pass');
  if (!user || !pass) return null;
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

async function enviar(to, asunto, texto) {
  const t = transporte();
  if (!t) throw new Error('MAIL_NO_CONFIGURADO');
  return t.sendMail({ from: `Chromatica <${cfg('smtp_user') || 'chromatica@local'}>`, to, subject: asunto, text: texto });
}

module.exports = { enviar };