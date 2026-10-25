// Calendario propio (con el estilo del sistema) para todos los <input type="date">.
// El input sigue guardando el valor AAAA-MM-DD y dispara "input" y "change", así que el resto del código no cambia.
const Calendario = (() => {
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DOW = ['LU', 'MA', 'MI', 'JU', 'VI', 'SÁ', 'DO'];
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  let pop = null, inp = null, vista = null;

  function cerrar() { pop?.remove(); pop = null; inp = null; }

  function pintar() {
    const { y, m } = vista, hoy = iso(new Date()), sel = inp.value, min = inp.min, max = inp.max;
    const primero = new Date(y, m, 1), inicio = new Date(y, m, 1 - ((primero.getDay() + 6) % 7));
    const dias = Array.from({ length: 42 }, (_, i) => { const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d; });
    const fuera = (s) => (min && s < min) || (max && s > max);
    pop.innerHTML = `<div class="cal-cab"><button type="button" class="cal-nav" data-c="mes" data-d="-1" title="Mes anterior">‹</button>
        <b>${MESES[m]} ${y}</b><button type="button" class="cal-nav" data-c="mes" data-d="1" title="Mes siguiente">›</button></div>
      <div class="cal-dow">${DOW.map((x) => `<span>${x}</span>`).join('')}</div>
      <div class="cal-dias">${dias.map((d) => { const s = iso(d); return `<button type="button" data-c="dia" data-s="${s}" class="${d.getMonth() !== m ? 'fuera' : ''} ${s === sel ? 'sel' : ''} ${s === hoy ? 'hoy' : ''}" ${fuera(s) ? 'disabled' : ''}>${d.getDate()}</button>`; }).join('')}</div>
      <div class="cal-pie"><button type="button" class="btn-lnk" data-c="hoy" ${fuera(hoy) ? 'disabled' : ''}>Hoy</button>${inp.required ? '' : '<button type="button" class="btn-lnk" data-c="borrar">Borrar</button>'}</div>`;
  }

  function ubicar() {
    const r = inp.getBoundingClientRect(), w = pop.offsetWidth, hgt = pop.offsetHeight;
    const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
    const top = r.bottom + 8 + hgt > innerHeight - 8 ? Math.max(8, r.top - hgt - 8) : r.bottom + 8;
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }

  function abrir(input) {
    cerrar(); inp = input;
    const v = input.value ? parse(input.value) : new Date();
    vista = { y: v.getFullYear(), m: v.getMonth() };
    pop = document.createElement('div'); pop.className = 'cal-pop';
    document.body.appendChild(pop);
    pintar(); ubicar();
  }

  function poner(valor) {
    inp.value = valor;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    cerrar();
  }

  document.addEventListener('mousedown', (ev) => {
    const t = ev.target;
    if (t.closest?.('.cal-pop')) return;
    if (t.matches?.('input[type=date]') && !t.disabled) { ev.preventDefault(); inp === t ? cerrar() : abrir(t); }
    else cerrar();
  }, true);

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('.cal-pop [data-c]'); if (!b || b.disabled) return;
    const c = b.dataset.c;
    if (c === 'mes') { const d = new Date(vista.y, vista.m + Number(b.dataset.d), 1); vista = { y: d.getFullYear(), m: d.getMonth() }; pintar(); }
    else if (c === 'dia') poner(b.dataset.s);
    else if (c === 'hoy') poner(iso(new Date()));
    else if (c === 'borrar') poner('');
  });

  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && pop) { cerrar(); ev.stopPropagation(); } }, true);
  addEventListener('resize', cerrar);
  document.addEventListener('scroll', (ev) => { if (pop && !ev.target.closest?.('.cal-pop')) cerrar(); }, true);
  return { abrir, cerrar };
})();