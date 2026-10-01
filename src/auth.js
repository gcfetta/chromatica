const crypto = require('crypto');
const express = require('express');
const { db, audit } = require('./db');
const { enviar } = require('./mail');

const sesiones = new Map(); // token -> { userId, exp }
const TTL = 12 * 60 * 60 * 1000;
const COOKIE = 'chromatica_sid';

const hashPw = (pw) => {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
};
const checkPw = (pw, stored) => {
  const [s, h] = stored.split(':');
  const c = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 32);
  return crypto.timingSafeEqual(c, Buffer.from(h, 'hex'));
};
const getCookie = (req) =>
  (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).find(([k]) => k === COOKIE)?.[1];

function requireAuth(req, res, next) {
  const s = sesiones.get(getCookie(req));
  if (!s || s.exp < Date.now()) return res.status(401).json({ error: 'No autenticado' });
  s.exp = Date.now() + TTL;
  req.userId = s.userId;
  next();
}

const router = express.Router();
const hayUsuario = () => db.prepare('SELECT COUNT(*) c FROM usuario').get().c > 0;

router.get('/estado', (_req, res) => res.json({ configurado: hayUsuario() }));

// primera apertura: crea el admin
router.post('/setup', (req, res) => {
  if (hayUsuario()) return res.status(409).json({ error: 'Ya configurado' });
  const { usuario, password, mail } = req.body || {};
  if (!usuario || !password || password.length < 6 || !mail?.includes('@'))
    return res.status(400).json({ error: 'Completá usuario, mail y una contraseña de 6+ caracteres' });
  const id = db.prepare('INSERT INTO usuario(usuario, password_hash, mail_recuperacion) VALUES (?,?,?)')
    .run(usuario.trim(), hashPw(password), mail.trim()).lastInsertRowid;
  audit('usuario', id, 'crear');
  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  const { usuario, password } = req.body || {};
  const u = db.prepare('SELECT * FROM usuario WHERE usuario = ?').get((usuario || '').trim());
  if (!u || !checkPw(password || '', u.password_hash))
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  const token = crypto.randomBytes(24).toString('hex');
  sesiones.set(token, { userId: u.id, exp: Date.now() + TTL });
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL / 1000}`);
  res.json({ ok: true, usuario: u.usuario });
});

router.post('/logout', (req, res) => {
  sesiones.delete(getCookie(req));
  res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; Path=/`);
  res.json({ ok: true });
});

router.get('/yo', requireAuth, (req, res) => {
  const u = db.prepare('SELECT id, usuario, mail_recuperacion FROM usuario WHERE id = ?').get(req.userId);
  res.json(u);
});

// "Olvidé mi usuario o contraseña": manda usuario + contraseña temporal al mail de la pelu
router.post('/recuperar', async (_req, res) => {
  const u = db.prepare('SELECT * FROM usuario LIMIT 1').get();
  if (!u) return res.status(404).json({ error: 'Todavía no hay usuario configurado' });
  const alfabeto = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const temp = Array.from(crypto.randomBytes(10), (b) => alfabeto[b % alfabeto.length]).join('');
  try {
    await enviar(u.mail_recuperacion, 'Chromatica · recuperación de acceso',
      `Usuario: ${u.usuario}\nContraseña temporal: ${temp}\n\nIngresá y cambiala desde el sistema.`);
  } catch (e) {
    return res.status(502).json({ error: e.message === 'MAIL_NO_CONFIGURADO'
      ? 'El envío de mail no está configurado' : 'No se pudo enviar el mail' });
  }
  // la contraseña cambia solo si el mail salió bien
  db.prepare('UPDATE usuario SET password_hash = ? WHERE id = ?').run(hashPw(temp), u.id);
  audit('usuario', u.id, 'recuperar_acceso');
  res.json({ ok: true, enviado_a: u.mail_recuperacion.replace(/(.).+(@.+)/, '$1***$2') });
});

router.post('/cambiar-password', requireAuth, (req, res) => {
  const { actual, nueva } = req.body || {};
  const u = db.prepare('SELECT * FROM usuario WHERE id = ?').get(req.userId);
  if (!checkPw(actual || '', u.password_hash)) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
  if (!nueva || nueva.length < 6) return res.status(400).json({ error: 'La nueva debe tener 6+ caracteres' });
  db.prepare('UPDATE usuario SET password_hash = ? WHERE id = ?').run(hashPw(nueva), u.id);
  audit('usuario', u.id, 'cambiar_password');
  res.json({ ok: true });
});

module.exports = { router, requireAuth };