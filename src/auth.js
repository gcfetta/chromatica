const crypto = require('crypto');
const express = require('express');
const { db, audit } = require('./db');

const sesiones = new Map(); // token -> { userId, exp }
const TTL = 12 * 60 * 60 * 1000;
const RESET_TTL = 10 * 60 * 1000;
const resets = new Map();   // token -> { userId, exp }   (olvidé mi contraseña)
const COOKIE = 'chromatica_sid';

const hashPw = (pw) => {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
};
const checkPw = (pw, stored) => {
  if (!stored) return false;
  const [s, h] = stored.split(':');
  return crypto.timingSafeEqual(crypto.scryptSync(pw, Buffer.from(s, 'hex'), 32), Buffer.from(h, 'hex'));
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

// freno simple contra adivinar contraseñas: 8 fallos seguidos = 5 minutos bloqueado
let fallos = { n: 0, hasta: 0 };
const bloqueado = () => Date.now() < fallos.hasta;
const fallo = () => { if (++fallos.n >= 8) fallos = { n: 0, hasta: Date.now() + 5 * 60 * 1000 }; };

function abrirSesion(res, userId) {
  const token = crypto.randomBytes(24).toString('hex');
  sesiones.set(token, { userId, exp: Date.now() + TTL });
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${TTL / 1000}`);
}

const router = express.Router();
const hayUsuario = () => db.prepare('SELECT COUNT(*) c FROM usuario').get().c > 0;
const norm = (s) => String(s || '').trim().toLowerCase();

router.get('/estado', (_req, res) => res.json({ configurado: hayUsuario() }));

// Primera vez: mail + usuario + contraseña, crea la cuenta y deja la sesión iniciada
router.post('/setup', (req, res) => {
  if (hayUsuario()) return res.status(409).json({ error: 'Ya configurado' });
  const { mail, usuario, password } = req.body || {};
  if (!/^\S+@\S+\.\S+$/.test(String(mail || '').trim())) return res.status(400).json({ error: 'Ingresá un mail válido' });
  if (String(usuario || '').trim().length < 3) return res.status(400).json({ error: 'El usuario debe tener 3+ caracteres' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener 6+ caracteres' });
  const id = db.prepare('INSERT INTO usuario(usuario, password_hash, mail_recuperacion) VALUES (?,?,?)')
    .run(String(usuario).trim(), hashPw(password), String(mail).trim()).lastInsertRowid;
  audit('usuario', id, 'crear');
  abrirSesion(res, id);
  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  if (bloqueado()) return res.status(429).json({ error: 'Demasiados intentos. Esperá unos minutos.' });
  const { usuario, password } = req.body || {};
  const u = db.prepare('SELECT * FROM usuario WHERE lower(usuario) = ?').get(norm(usuario));
  if (!u || !checkPw(password || '', u.password_hash)) { fallo(); return res.status(401).json({ error: 'Usuario o contraseña incorrectos' }); }
  fallos = { n: 0, hasta: 0 };
  abrirSesion(res, u.id);
  res.json({ ok: true, usuario: u.usuario });
});

router.post('/logout', (req, res) => {
  sesiones.delete(getCookie(req));
  res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; Path=/`);
  res.json({ ok: true });
});

router.get('/yo', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT id, usuario, mail_recuperacion FROM usuario WHERE id = ?').get(req.userId));
});

// Olvidé mi contraseña, paso 1: escribe el mail con el que se creó la cuenta
router.post('/olvide', (req, res) => {
  if (bloqueado()) return res.status(429).json({ error: 'Demasiados intentos. Esperá unos minutos.' });
  const u = db.prepare('SELECT id, mail_recuperacion FROM usuario LIMIT 1').get();
  if (!u) return res.status(404).json({ error: 'Todavía no hay cuenta creada' });
  if (norm(req.body?.mail) !== norm(u.mail_recuperacion)) { fallo(); return res.status(401).json({ error: 'Ese no es el mail con el que se creó la cuenta' }); }
  const token = crypto.randomBytes(16).toString('hex');
  resets.set(token, { userId: u.id, exp: Date.now() + RESET_TTL });
  res.json({ ok: true, token });
});

// paso 2: contraseña nueva (el usuario no cambia)
router.post('/restablecer', (req, res) => {
  const { token, nueva } = req.body || {};
  const r = resets.get(token);
  if (!r || r.exp < Date.now()) return res.status(401).json({ error: 'Se venció el paso anterior. Empezá de nuevo.' });
  if (!nueva || nueva.length < 6) return res.status(400).json({ error: 'La contraseña debe tener 6+ caracteres' });
  db.prepare('UPDATE usuario SET password_hash = ? WHERE id = ?').run(hashPw(nueva), r.userId);
  resets.delete(token);
  audit('usuario', r.userId, 'restablecer_password');
  abrirSesion(res, r.userId);
  res.json({ ok: true });
});

// Con sesión: cambiar la contraseña sabiendo la actual
router.post('/cambiar-password', requireAuth, (req, res) => {
  if (bloqueado()) return res.status(429).json({ error: 'Demasiados intentos. Esperá unos minutos.' });
  const { actual, nueva } = req.body || {};
  const u = db.prepare('SELECT * FROM usuario WHERE id = ?').get(req.userId);
  if (!checkPw(actual || '', u.password_hash)) { fallo(); return res.status(401).json({ error: 'Contraseña actual incorrecta' }); }
  if (!nueva || nueva.length < 6) return res.status(400).json({ error: 'La nueva debe tener 6+ caracteres' });
  db.prepare('UPDATE usuario SET password_hash = ? WHERE id = ?').run(hashPw(nueva), u.id);
  audit('usuario', u.id, 'cambiar_password');
  res.json({ ok: true });
});

module.exports = { router, requireAuth };