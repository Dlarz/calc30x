/* ui.js — keypad, MathPrint editor, screens (home, menus, wizards, editors). */
(function () {
'use strict';
const S = E.S, VARS = E.VARS;
const $ = id => document.getElementById(id);
const clone = x => JSON.parse(JSON.stringify(x));
const isT = t => t !== null && typeof t === 'object';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/* ================= MathPrint editor ================= */
const SLOTS = { frac: ['a', 'b'], mixed: ['u', 'a', 'b'], pow: ['a'], sqrt: ['a'], root: ['n', 'a'], exp: ['a'], ten: ['a'], logb: ['n', 'a'], abs: ['a'], deriv: ['a', 'p'], int: ['lo', 'hi', 'a'], sum: ['v', 'lo', 'hi', 'a'], prod: ['v', 'lo', 'hi', 'a'] };
const VERT = { frac: { a: { down: 'b' }, b: { up: 'a' } }, mixed: { a: { down: 'b' }, b: { up: 'a' } }, int: { lo: { up: 'hi' }, hi: { down: 'lo' } },
  sum: { lo: { up: 'hi' }, v: { up: 'hi' }, hi: { down: 'lo' } }, prod: { lo: { up: 'hi' }, v: { up: 'hi' }, hi: { down: 'lo' } },
  deriv: { a: { down: 'p' }, p: { up: 'a' } }, root: { n: { down: 'a' }, a: { up: 'n' } }, logb: { n: { up: 'a' }, a: { down: 'n' } } };
function mk(t) { const o = { t }; SLOTS[t].forEach(s => { o[s] = []; }); if (t === 'sum' || t === 'prod') o.v = ['x']; return o; }
const MT = {
  sin: ['sin(', 'sin⁻¹(', 'sinh(', 'sinh⁻¹('], cos: ['cos(', 'cos⁻¹(', 'cosh(', 'cosh⁻¹('], tan: ['tan(', 'tan⁻¹(', 'tanh(', 'tanh⁻¹('],
  lnlog: ['ln(', 'log(', () => S.mode.mp ? mk('logb') : 'logBASE('],
  e10: [() => S.mode.mp ? mk('exp') : 'e^(', () => S.mode.mp ? mk('ten') : '10^('],
  pi: ['π', 'ℯ', 'i'], fact: ['!', ' nCr ', ' nPr '], var: VARS
};
const SIMPLE = { add: '+', sub: '−', mul: '×', div: '÷', lp: '(', rp: ')', neg: '‾', comma: ',', '.': '.', ee: 'ᴇ', sq: '²', recip: '⁻¹', percent: '%', sto: '→', answer: 'ans' };

class Ed {
  constructor(row) { this.clear(); if (row) this.set(row); }
  clear() { this.root = []; this.c = { r: this.root, i: 0 }; this.mt = null; this.ins = false; this.dirty = false; }
  set(row) { this.root = clone(row); this.c = { r: this.root, i: this.root.length }; this.mt = null; this.dirty = false; }
  empty() { return !this.root.length; }
  parent(row) {
    const walk = r => {
      for (let i = 0; i < r.length; i++) {
        const n = r[i]; if (!isT(n) || !SLOTS[n.t]) continue;
        for (const s of SLOTS[n.t]) { if (n[s] === row) return { n, s, pr: r, pi: i }; const f = walk(n[s]); if (f) return f; }
      }
      return null;
    };
    return walk(this.root);
  }
  put(item, forceIns) {
    const { r, i } = this.c; this.dirty = true;
    if (typeof item === 'string') {
      if (!this.ins && !forceIns && i < r.length && typeof r[i] === 'string') r[i] = item; else r.splice(i, 0, item);
      this.c = { r, i: i + 1 };
    } else {
      r.splice(i, 0, item);
      const s = item.t === 'sum' || item.t === 'prod' || item.t === 'int' ? 'lo' : SLOTS[item.t][0];
      this.c = { r: item[s], i: item[s].length };
    }
    return { r, i };
  }
  grab() { // take the operand just before the cursor (MathPrint pre-population of templates)
    const { r, i } = this.c; let j = i;
    const numch = t => typeof t === 'string' && /^[0-9A-F.ᴇ]$/.test(t);
    if (j > 0 && numch(r[j - 1])) { while (j > 0 && (numch(r[j - 1]) || ((r[j - 1] === '‾' || r[j - 1] === '−') && r[j - 2] === 'ᴇ'))) j--; }
    else if (j > 0 && r[j - 1] === ')') {
      let depth = 0;
      while (j > 0) { j--; const t = r[j]; if (t === ')') depth++; else if (typeof t === 'string' && t.endsWith('(') && --depth === 0) break; }
      if (depth !== 0) return [];
    } else if (j > 0 && (VARS.includes(r[j - 1]) || ['π', 'ℯ', 'ans', 'i'].includes(r[j - 1]) || (isT(r[j - 1]) && r[j - 1].t !== 'pow'))) j--;
    else return [];
    const out = r.splice(j, i - j); this.c = { r, i: j }; return out;
  }
  tpl(t, slotWhenGrabbed, grabInto) {
    const o = mk(t);
    if (grabInto) { const g = this.grab(); o[grabInto] = g; this.put(o); if (g.length) this.c = { r: o[slotWhenGrabbed], i: 0 }; }
    else this.put(o);
  }
  tap(k) {
    const opts = MT[k], make = o => typeof o === 'function' ? o() : o;
    if (this.mt && this.mt.k === k) {
      const m = this.mt; m.n = (m.n + 1) % opts.length;
      m.r.splice(m.i, 1); this.c = { r: m.r, i: m.i }; this.put(make(opts[m.n]), true);
      this.mt = m;
    } else {
      const at = this.put(make(opts[0]));
      this.mt = { k, n: 0, r: at.r, i: at.i };
    }
  }
  left() {
    const { r, i } = this.c;
    if (i > 0) { const it = r[i - 1]; if (isT(it) && SLOTS[it.t]) { const sl = SLOTS[it.t], rr = it[sl[sl.length - 1]]; this.c = { r: rr, i: rr.length }; } else this.c.i--; return true; }
    const p = this.parent(r); if (!p) return false;
    const sl = SLOTS[p.n.t], k = sl.indexOf(p.s);
    if (k > 0) { const rr = p.n[sl[k - 1]]; this.c = { r: rr, i: rr.length }; } else this.c = { r: p.pr, i: p.pi };
    return true;
  }
  right() {
    const { r, i } = this.c;
    if (i < r.length) { const it = r[i]; if (isT(it) && SLOTS[it.t]) this.c = { r: it[SLOTS[it.t][0]], i: 0 }; else this.c.i++; return true; }
    const p = this.parent(r); if (!p) return false;
    const sl = SLOTS[p.n.t], k = sl.indexOf(p.s);
    if (k + 1 < sl.length) this.c = { r: p.n[sl[k + 1]], i: 0 }; else this.c = { r: p.pr, i: p.pi + 1 };
    return true;
  }
  vert(dir) {
    this.mt = null; // leaving the spot: the next tap of a multi-tap key starts fresh
    let row = this.c.r;
    for (let p = this.parent(row); p; p = this.parent(p.pr)) {
      const to = VERT[p.n.t] && VERT[p.n.t][p.s] && VERT[p.n.t][p.s][dir];
      if (to) { const rr = p.n[to]; this.c = { r: rr, i: rr.length }; return true; }
    }
    return false;
  }
  del() {
    const { r, i } = this.c; this.dirty = true;
    if (i < r.length) { r.splice(i, 1); return; }
    if (i > 0) { r.splice(i - 1, 1); this.c.i--; return; }
    const p = this.parent(r);
    if (p && SLOTS[p.n.t].every(s => !p.n[s].length || (s === 'v'))) { p.pr.splice(p.pi, 1); this.c = { r: p.pr, i: p.pi }; }
  }
  key(k) {
    if (!(this.mt && this.mt.k === k)) this.mt = null;
    const mp = S.mode.mp;
    if (/^[0-9]$/.test(k)) { this.put(k); return true; }
    if ('ABCDEF'.includes(k) && k.length === 1) { if (S.mode.base === 'HEX') this.put(k); return true; }
    if (SIMPLE[k]) { this.put(SIMPLE[k]); return true; }
    if (MT[k]) { this.tap(k); return true; }
    switch (k) {
      case 'pow': mp ? this.tpl('pow') : this.put('^'); return true;
      case 'sqrt': mp ? this.tpl('sqrt') : this.put('√('); return true;
      case 'nroot': mp ? this.tpl('root', 'a', 'n') : this.put('ˣ√'); return true;
      case 'frac': mp ? this.tpl('frac', 'b', 'a') : this.put('⁄'); return true;
      case 'mixed': mp ? this.tpl('mixed', 'a', 'u') : this.put('⌟'); return true;
      case 'ddx': mp ? this.tpl('deriv') : this.put('nDeriv('); return true;
      case 'integral': mp ? this.tpl('int') : this.put('fnInt('); return true;
      case 'left': return this.left() || true;
      case 'right': return this.right() || true;
      case 'home': this.c = { r: this.root, i: 0 }; return true;
      case 'end': this.c = { r: this.root, i: this.root.length }; return true;
      case 'up': return this.vert('up');
      case 'down': return this.vert('down');
      case 'del': this.del(); return true;
      case 'insert': this.ins = !this.ins; return true;
    }
    return false;
  }
}

/* ================= rendering ================= */
const TOKH = { '‾': '<span class="ng">-</span>', '²': '<span class="sup">2</span>', '⁻¹': '<span class="sup">-1</span>', 'ᴇ': '<span class="ee">ᴇ</span>',
  'ℯ': '<i>e</i>', '⁄': '<span class="cl">/</span>', '⌟': '<span class="cl">⌟</span>', 'ˣ√': '<span class="sup">x</span>√', 'ᵀ': '<span class="sup">T</span>',
  '^': '^', ' nCr ': '<span class="sm"> nCr </span>', ' nPr ': '<span class="sm"> nPr </span>', 'ans': 'ans' };
function tokH(t) {
  if (TOKH[t]) return TOKH[t];
  if (t[0] === '#') { const [a, b] = t.slice(1).split('_'); return `<i>${esc(a)}</i>${b ? `<span class="sub">${esc(b)}</span>` : ''}`; }
  if (t[0] === '$') return esc(t.slice(1));
  return esc(t).replace(/⁻¹/g, '<span class="sup">-1</span>');
}
function rrow(row, ctx) {
  const cur = ctx.c && ctx.c.r === row ? ctx.c.i : -1;
  if (!row.length) return cur === 0 ? '<span class="blk">&nbsp;</span>' : (ctx.noph ? '' : '<span class="ph"></span>');
  let h = '';
  row.forEach((t, i) => {
    if (i === cur) {
      if (!ctx.ins && typeof t === 'string') { h += `<span class="blk">${tokH(t)}</span>`; return; }
      h += '<span class="bar"></span>';
    }
    h += typeof t === 'string' ? tokH(t) : tplH(t, ctx);
  });
  if (cur === row.length) h += ctx.ins ? '<span class="bar"></span>' : '<span class="blk">&nbsp;</span>';
  return h;
}
function tplH(t, ctx) {
  const R = s => rrow(t[s], ctx), cl = !S.mode.mp && !ctx.c, P = s => t[s].length > 1 ? `(${R(s)})` : R(s);
  switch (t.t) {
    case 'frac': return cl ? `${P('a')}<span class="cl">/</span>${P('b')}` : `<span class="fr"><span class="fn">${R('a')}</span><span>${R('b')}</span></span>`;
    case 'mixed': return cl ? `${R('u')}<span class="cl">⌟</span>${R('a')}<span class="cl">/</span>${R('b')}` : `${R('u')}<span class="fr"><span class="fn">${R('a')}</span><span>${R('b')}</span></span>`;
    case 'pow': return cl ? `^(${R('a')})` : `<span class="sup">${R('a')}</span>`;
    case 'sqrt': return cl ? `√(${R('a')})` : `<span class="sq"><span class="sqs">√</span><span class="sqr">${R('a')}</span></span>`;
    case 'root': return `<span class="sq"><span class="ri">${R('n')}</span><span class="sqs">√</span><span class="sqr">${R('a')}</span></span>`;
    case 'exp': return `<i>e</i><span class="sup">${R('a')}</span>`;
    case 'ten': return `10<span class="sup">${R('a')}</span>`;
    case 'logb': return `log<span class="sub">${R('n')}</span>(${R('a')})`;
    case 'abs': return `|${R('a')}|`;
    case 'deriv': return `<span class="fr"><span class="fn"><i>d</i></span><span><i>dx</i></span></span>(${R('a')})|<span class="sub">x=${R('p')}</span>`;
    case 'int': return `<span class="bs">∫</span><span class="lims"><span class="bl">${R('hi')}</span><span class="bl">${R('lo')}</span></span>(${R('a')})<i>dx</i>`;
    case 'sum': case 'prod': return `<span class="bo"><span class="bl">${R('hi')}</span><span class="bs">${t.t === 'sum' ? 'Σ' : 'Π'}</span><span class="bl">${R('v')}=${R('lo')}</span></span>(${R('a')})`;
    case 'mat': return `<span class="mx"><table>${t.rows.map(r => `<tr>${r.map(c => `<td>${rrow(c, {})}</td>`).join('')}</tr>`).join('')}</table></span>`;
    case 'vec': return `<span class="mx"><table><tr>${t.items.map(c => `<td>${rrow(c, {})}</td>`).join('')}</tr></table></span>`;
  }
  return '?';
}
const show = (row, ed) => rrow(row, ed ? { c: ed.c, ins: ed.ins } : { noph: true });
const shortNum = v => {
  if (v === undefined || v === null) return '';
  if (Number.isNaN(v)) return 'Error';
  if (!E.isN(v)) return rrow(E.fmtVal(v, {}, false), {});
  let s = String(+v.toPrecision(7));
  if (s.length > 8) s = v.toExponential(2).replace('e+', 'ᴇ').replace('e', 'ᴇ');
  return esc(s.replace('-', '⁻'));
};
const valH = v => rrow(E.fmtVal(v, {}, false), {});

/* ================= screen stack ================= */
const stack = [];
const top = () => stack[stack.length - 1];
const push = s => { stack.push(s); };
const pop = () => { if (stack.length > 1) stack.pop(); };
const goHome = () => { stack.length = 1; };
let second = false, off = false, contrast = 0;

function errScreen(msg) {
  push({ draw: () => `<div class="ln err">ERROR</div><div class="ln">${esc(msg)}</div><div class="fill"></div><div class="ln sm">[clear] zurück · [quit] home</div>`,
    key: k => { if (k === 'quit') goHome(); else pop(); return true; } });
}
function guard(f) {
  try { f(); } catch (e) {
    if (!(e instanceof E.CalcError)) { console.error(e); errScreen('Syntax'); } else errScreen(e.message);
  }
}
function msgScreen(lines, after) {
  push({ draw: () => lines.map(l => `<div class="ln">${l}</div>`).join(''), key: () => { pop(); if (after) after(); return true; } });
}

/* ---------- generic menu ---------- */
function Menu(tabs, title) {
  const m = { tab: 0, sel: 0, ed: null };
  m.draw = () => {
    const T = tabs[m.tab], head = `<div class="ttl">${title ? `<span>${title}</span>` : ''}${tabs.map((t, i) => `<span class="${i === m.tab ? 'on' : ''}">${esc(t.name)}</span>`).join('')}</div>`;
    return head + T.items.map((it, i) => `<div class="ln mi ${i === m.sel ? 'inv' : ''}">${i < 9 ? i + 1 : i === 9 ? 0 : ' '}:${typeof it[0] === 'function' ? it[0]() : it[0]}</div>`).join('');
  };
  m.key = k => {
    const T = tabs[m.tab], n = T.items.length;
    if (k === 'left' || k === 'right') { if (tabs.length > 1) { m.tab = (m.tab + (k === 'right' ? 1 : tabs.length - 1)) % tabs.length; m.sel = 0; } return true; }
    if (k === 'up') { m.sel = (m.sel + n - 1) % n; return true; }
    if (k === 'down') { m.sel = (m.sel + 1) % n; return true; }
    let pick = -1;
    if (k === 'enter') pick = m.sel;
    else if (/^[0-9]$/.test(k)) pick = k === '0' ? 9 : +k - 1;
    if (pick >= 0 && pick < n) { stack.splice(stack.indexOf(m), 1); guard(() => T.items[pick][1]()); return true; }
    if (k === 'clear') { pop(); return true; }
    return true;
  };
  return m;
}
const tabsOf = (name, items) => ({ name, items });
function curEd() { const s = top(); return s && s.ed ? (typeof s.ed === 'function' ? s.ed() : s.ed) : null; }
function openMenu(tabs, title) {
  const ed = curEd();
  const wrap = tabs.map(t => tabsOf(t.name, t.items.map(([lab, act]) => [lab, typeof act === 'function' ? act : () => { if (ed) { ed.mt = null; insertItem(ed, act); } }])));
  push(Menu(wrap, title));
}
function insertItem(ed, a) {
  if (typeof a === 'string') ed.put(a, true);
  else if (a.tpl) ed.tpl(a.tpl);
}

/* ---------- forms (wizards) ---------- */
const numRow = v => E.numTok(v);
function Form(title, fields, onGo, goLabel) {
  // field: {lab, row?} → number field with editor; {lab, opts:[..], v} → choice
  fields.forEach(f => { if (!f.opts) f.ed = new Ed(f.row || []); });
  const F = { sel: 0, fields };
  F.ed = () => { const f = fields[F.sel]; return f && f.ed; };
  F.draw = () => {
    let h = title ? `<div class="ttl"><span>${title}</span></div>` : '';
    fields.forEach((f, i) => {
      if (f.hide && f.hide()) return;
      const on = i === F.sel;
      if (f.opts) h += `<div class="ln mi">${f.lab}${f.opts.map((o, j) => `<span class="${j === f.v ? 'inv' : ''} ${on && j === f.v ? 'cur' : ''}" style="margin-left:.35em">${o}</span>`).join('')}</div>`;
      else h += `<div class="ln mi${on ? '' : ''}">${f.lab}${on ? show(f.ed.root, f.ed) : show(f.ed.root)}</div>`;
    });
    if (goLabel !== null) h += `<div class="ln"><span class="${F.sel === fields.length ? 'inv cur' : ''}">${goLabel || 'CALC'}</span></div>`;
    return h;
  };
  F.vals = () => fields.map(f => f.opts ? f.v : (f.ed.empty() ? (f.optional ? undefined : E.err('Syntax')) : E.evaluate(f.ed.root).v));
  F.key = k => {
    const n = fields.length + (goLabel === null ? 0 : 1), f = fields[F.sel];
    const hid = i => fields[i] && fields[i].hide && fields[i].hide(), step = d => { do F.sel = (F.sel + d + n) % n; while (hid(F.sel)); };
    if (k === 'up') { if (!(f && f.ed && f.ed.vert('up'))) step(-1); return true; }
    if (k === 'down') { if (!(f && f.ed && f.ed.vert('down'))) step(1); return true; }
    if (k === 'enter') {
      if (F.sel === fields.length || (goLabel === null && F.sel === fields.length - 1) || F.goAny) { guard(() => onGo(F.noEval ? null : F.vals(), F)); return true; }
      do F.sel++; while (hid(F.sel)); return true;
    }
    // clear only empties an input field (guide sequences start with clear); quit/back leave the wizard
    if (k === 'clear') { if (f && f.ed) f.ed.clear(); else pop(); return true; }
    if (!f) return false;
    if (f.opts) { if (k === 'left' || k === 'right') { f.v = (f.v + (k === 'right' ? 1 : f.opts.length - 1)) % f.opts.length; } return true; }
    if (k === 'top' || k === 'bottom') return true;
    if (F.fresh !== F.sel && !['left', 'right', 'del', 'insert', 'home', 'end'].includes(k)) f.ed.clear();
    F.fresh = F.sel;
    return f.ed.key(k);
  };
  return F;
}
/* result list: lines [{lab, v, row?, paste?}] */
function Results(title, lines, opts) {
  const R = { sel: 0 };
  R.draw = () => (title ? `<div class="ttl"><span>${title}</span></div>` : '') +
    lines.map((l, i) => `<div class="ln mi ${i === R.sel ? 'inv' : ''}">${l.lab}${l.lab && !l.nolab ? '=' : ''}${l.row ? rrow(l.row, {}) : l.v === undefined ? '' : valH(l.v)}</div>`).join('');
  R.key = k => {
    const n = lines.length;
    if (k === 'up') { R.sel = (R.sel + n - 1) % n; return true; }
    if (k === 'down') { R.sel = (R.sel + 1) % n; return true; }
    if (k === 'enter') {
      const l = lines[R.sel];
      if (opts && opts.onEnter) return opts.onEnter(l), true;
      if (l && (l.paste || l.v !== undefined)) guard(() => {
        const v = l.v, row = l.paste || (E.isN(v) ? numRow(v) : E.isC(v) ? [...numRow(v.re), v.im < 0 ? '−' : '+', ...numRow(Math.abs(v.im)), 'i'] : E.err('Invalid data type'));
        goHome(); Home.ed.mt = null; row.forEach(t => Home.ed.put(t, true));
      });
      return true;
    }
    if (k === 'clear') { pop(); return true; }
    return true;
  };
  return R;
}

/* ---------- grid editor (data lists, matrices, vectors) ---------- */
function Grid(o) { // o: {cols, rows(), get(c,r), set(c,r,v), del?(c,r), head(c), name(c,r), title, onData?}
  const G = { c: 0, r: 0, off: 0, ed: new Ed() };
  const load = () => { const v = o.get(G.c, G.r); G.ed.set(E.isN(v) && Number.isFinite(v) ? numRow(v) : []); G.ed.dirty = false; G.fresh = true; };
  load(); G.reload = load;
  const commit = () => {
    if (!G.ed.dirty) return true;
    if (G.ed.empty()) { G.ed.dirty = false; return true; }
    const v = E.real(E.evaluate(G.ed.root).v);
    o.set(G.c, G.r, v); G.ed.dirty = false; return true;
  };
  const move = (dc, dr) => {
    let ok = false; guard(() => { ok = commit(); });
    if (!ok) return;
    G.c = Math.max(0, Math.min(o.cols - 1, G.c + dc));
    G.r = Math.max(0, Math.min(o.rows(G.c) - 1, G.r + dr));
    load();
  };
  G.draw = () => {
    const vis = 4; if (G.r < G.off) G.off = G.r; if (G.r >= G.off + vis) G.off = G.r - vis + 1;
    let h = `<table class="grid"><tr>${Array.from({ length: o.cols }, (_, c) => `<th class="${c === G.c ? 'inv' : ''}">${o.head(c)}</th>`).join('')}</tr>`;
    for (let r = G.off; r < G.off + vis; r++) {
      h += '<tr>' + Array.from({ length: o.cols }, (_, c) => {
        const v = o.get(c, r), sel = c === G.c && r === G.r;
        return `<td class="${sel ? 'inv' : ''}">${v === undefined ? (r < o.rows(c) ? '' : '') : shortNum(v)}</td>`;
      }).join('') + '</tr>';
    }
    return h + `</table><div class="ln mi">${o.name(G.c, G.r)}=${show(G.ed.root, G.ed)}</div>`;
  };
  G.key = k => {
    if (k === 'up') return move(0, -1), true;
    if (k === 'down') return move(0, 1), true;
    if (k === 'left' && (!G.ed.dirty || G.ed.c.i === 0)) return move(-1, 0), true;
    if (k === 'right' && (!G.ed.dirty || G.ed.c.i === G.ed.root.length)) return move(1, 0), true;
    if (k === 'enter') { guard(() => { commit(); }); if (o.next) { const [dc, dr] = o.next(G.c, G.r); G.c = dc; G.r = dr; } else G.r = Math.min(o.rows(G.c) - 1, G.r + 1); load(); return true; }
    if (k === 'del' && o.del && !G.ed.dirty) { o.del(G.c, G.r); load(); return true; }
    if (k === 'clear') {
      if (!G.ed.empty() && (G.ed.dirty || !o.onClear)) { G.ed.clear(); G.ed.dirty = true; G.fresh = false; return true; }
      if (o.onClear) o.onClear(); else pop(); return true;
    }
    if (k === 'top' || k === 'bottom') return move(0, k === 'top' ? -G.r : o.rows(G.c) - 1 - G.r), true;
    if (k === 'data' && o.onData) { o.onData(G); return true; }
    // first edit (menu inserts too) replaces the shown value; operators and sto→ keep it as their left operand
    if (G.fresh && !['del', 'insert', 'home', 'end', 'sto', ...AUTO_ANS].includes(k)) G.ed.clear();
    G.fresh = false;
    return G.ed.key(k);
  };
  return G;
}

/* ================= home screen ================= */
const Home = { ed: new Ed(), hist: [], sel: -1 };
const AUTO_ANS = ['add', 'sub', 'mul', 'div', 'pow', 'sq', 'recip', 'sto', 'percent'];
function lines() { const L = []; Home.hist.forEach((h, i) => { L.push({ i, part: 'in' }); L.push({ i, part: 'out' }); }); return L; }
Home.draw = () => {
  const L = lines(), selL = Home.sel >= 0 ? L[L.length - 1 - Home.sel] : null;
  let h = '<div class="fill"></div>';
  const from = Math.max(0, Math.min(Home.hist.length - 12, selL ? selL.i : Infinity)); // keep the selection rendered
  Home.hist.slice(from).forEach((e, k) => {
    const i = from + k;
    const sIn = selL && selL.i === i && selL.part === 'in', sOut = selL && selL.i === i && selL.part === 'out';
    h += `<div class="ln"><span class="in ${sIn ? 'hsel' : ''}" ${sIn ? 'id="selx"' : ''}>${show(e.i)}</span></div>`;
    h += `<div class="ln r"><span class="in ${sOut ? 'hsel' : ''}" ${sOut ? 'id="selx"' : ''}>${rrow(outRow(e), {})}</span></div>`;
  });
  h += `<div class="ln" id="edl"><span class="in">${Home.sel < 0 ? show(Home.ed.root, Home.ed) : show(Home.ed.root) || '&nbsp;'}</span></div>`;
  return h;
};
const exRow = o => o.exact || o.alt; // alt: exact form of a decimal-first result, shown after ◂▸≈
const outRow = e => e.ex && exRow(e.o) ? exRow(e.o) : e.o.dec;
function calc(row) {
  guard(() => {
    if (!row.length) { if (!Home.hist.length) return; row = clone(Home.hist[Home.hist.length - 1].i); }
    const r = E.evaluate(row);
    const o = E.formatResult(r.v, r.flags);
    S.ans = r.v;
    Home.hist.push({ i: clone(row), o, ex: !!o.exact });
    if (Home.hist.length > 40) Home.hist.shift();
    Home.ed.clear();
  });
}
Home.key = k => {
  const ed = Home.ed;
  if (Home.sel >= 0) {
    const L = lines(), l = L[L.length - 1 - Home.sel], e = Home.hist[l.i];
    if (k === 'up') { Home.sel = Math.min(L.length - 1, Home.sel + 1); return true; }
    if (k === 'down') { Home.sel--; return true; }
    if (k === 'enter') {
      const row = l.part === 'in' ? e.i : outRow(e);
      if (!row.some(t => isT(t) && (t.t === 'mat' || t.t === 'vec'))) clone(row).forEach(t => { const c = ed.c; c.r.splice(c.i, 0, t); c.i++; });
      else ed.put('ans', true);
      ed.mt = null; Home.sel = -1; return true;
    }
    if (k === 'tog' || k === 'fd') { if (exRow(e.o)) e.ex = !e.ex; return true; }
    if (k === 'clear') { Home.sel = -1; return true; }
    Home.sel = -1;
  }
  if (k === 'enter') { calc(ed.root); return true; }
  if (k === 'up') { if (!ed.vert('up') && Home.hist.length) Home.sel = 0; return true; }
  if (k === 'top') { ed.mt = null; if (Home.hist.length) Home.sel = 0; return true; } // 2nd▲: history even from a denominator
  if (k === 'clear') { if (!ed.empty()) ed.clear(); else Home.hist = []; return true; }
  if (k === 'fd' && !ed.empty()) { ed.mt = null; ed.put('►F◄►D', true); return true; }
  if (k === 'tog' || k === 'fd') { const e = Home.hist[Home.hist.length - 1]; if (e && exRow(e.o)) e.ex = !e.ex; return true; }
  if (k === 'op') { applyOp(); return true; }
  if (AUTO_ANS.includes(k) && ed.empty()) ed.put('ans');
  return ed.key(k);
};
function applyOp() {
  guard(() => {
    if (!S.op) E.err('[2nd] [set op]: Operation is not defined.');
    const base = Home.ed.empty() ? ['ans'] : Home.ed.root;
    const v = E.evaluate(base).v;
    const row = [...numRow(E.real(v)), ...S.op];
    const shownRow = Home.ed.empty() ? [...E.fmtReal(E.real(v)), ...S.op] : [...base, ...S.op];
    const r = E.evaluate(row), o = E.formatResult(r.v, r.flags);
    S.ans = r.v; Home.hist.push({ i: clone(shownRow), o, ex: !!o.exact }); Home.ed.clear();
  });
}

/* ================= mode screen ================= */
const MODES = [
  ['angle', ['DEG', 'RAD', 'GRAD'], ['DEGREE', 'RADIAN', 'GRADIAN']],
  ['note', ['NORM', 'SCI', 'ENG'], ['NORMAL', 'SCI', 'ENG']],
  ['fix', [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9], ['FLOAT', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']],
  ['cplx', ['REAL', 'a+bi', 'r∠θ'], ['REAL', 'a+bi', 'r∠θ']],
  ['base', ['DEC', 'HEX', 'BIN', 'OCT'], ['DEC', 'HEX', 'BIN', 'OCT']],
  ['mp', [true, false], ['MATHPRINT', 'CLASSIC']]
];
function ModeScreen() {
  const M = { r: 0, c: 0 };
  M.c = MODES[0][1].indexOf(S.mode.angle);
  M.draw = () => MODES.map(([key, vals, labs], r) => `<div class="ln mi sm">${labs.map((l, c) => `<span class="${vals[c] === S.mode[key] ? 'inv' : ''} ${r === M.r && c === M.c ? 'cur' : ''}" style="margin-right:.45em;padding:0 .1em">${l}</span>`).join('')}</div>`).join('');
  M.key = k => {
    const n = MODES[M.r][1].length;
    if (k === 'left') M.c = (M.c + n - 1) % n;
    else if (k === 'right') M.c = (M.c + 1) % n;
    else if (k === 'up' || k === 'down') {
      M.r = (M.r + (k === 'down' ? 1 : MODES.length - 1)) % MODES.length;
      M.c = Math.max(0, MODES[M.r][1].indexOf(S.mode[MODES[M.r][0]]));
    } else if (k === 'enter') S.mode[MODES[M.r][0]] = MODES[M.r][1][M.c];
    else if (k === 'clear' || k === 'mode') pop();
    return true;
  };
  return M;
}

/* ================= menus ================= */
const mp = (tpl, tok) => S.mode.mp ? { tpl } : tok;
function mathMenu() {
  const ed = curEd();
  const T = [
    { name: 'MATH', items: [['►n/d◄►Un/d', '►n/d◄►Un/d'], ['lcm(', 'lcm('], ['gcd(', 'gcd('], ['►Pfactor', '►Pfactor'], ['sum(', mp('sum', 'sum(')], ['prod(', mp('prod', 'prod(')], ['nDeriv(', mp('deriv', 'nDeriv(')], ['fnInt(', mp('int', 'fnInt(')]] },
    { name: 'NUM', items: [['abs(', mp('abs', 'abs(')], ['round(', 'round('], ['iPart(', 'iPart('], ['fPart(', 'fPart('], ['int(', 'int('], ['min(', 'min('], ['max(', 'max('], ['mod(', 'mod(']] },
    { name: 'DMS', items: [['° Grad', '°'], ['′ Minuten', '′'], ['″ Sekunden', '″'], ['ʳ Radiant', 'ʳ'], ['ᵍ Gon', 'ᵍ'], ['►DMS', '►DMS']] },
    { name: 'R◄►P', items: [['P►Rx(', 'P►Rx('], ['P►Ry(', 'P►Ry('], ['R►Pr(', 'R►Pr('], ['R►Pθ(', 'R►Pθ(']] }
  ];
  if (!ed) return;
  openMenu(T);
}
function constantsMenu() {
  const items = u => E.CONST.map(c => [`${tokH('#' + c[0])} ${u ? c[3] : c[1]}`, '#' + c[0]]);
  openMenu([{ name: 'NAMES', items: items(false) }, { name: 'UNITS', items: items(true) }]);
}
function convertMenu() {
  const K = Object.keys(E.CONV), it = l => l.map(k => [k, k]);
  openMenu([{ name: 'LÄNGE', items: it(K.slice(0, 10)) }, { name: 'FL/VOL', items: it(K.slice(10, 16)) }, { name: 'MASSE', items: it(K.slice(16, 20)) },
    { name: 'TEMP', items: it(K.slice(30)) }, { name: 'SONST', items: it(K.slice(20, 30)) }]);
}
function recallMenu() {
  const ed = curEd(); if (!ed) return;
  push(Menu([{ name: 'RECALL VAR', items: VARS.map(v => [() => `${v} = ${shortNum(S.vars[v])}`, () => { (E.isN(S.vars[v]) ? numRow(S.vars[v]) : E.fmtVal(S.vars[v], {}, false)).forEach(t => ed.put(t, true)); }]) }]));
}
function yesNo(title, yesFirst, act) {
  const yes = ['Yes', act], no = ['No', () => {}];
  push(Menu([{ name: title, items: yesFirst ? [yes, no] : [no, yes] }]));
}
function clearVars() { VARS.forEach(v => { S.vars[v] = 0; }); S.stat = null; }
function resetAll() {
  Object.assign(S, { ans: 0, mode: { angle: 'DEG', note: 'NORM', fix: -1, cplx: 'REAL', base: 'DEC', mp: true }, lists: [[], [], []], f: null, g: null, stat: null, mats: {}, vecs: {}, op: null });
  clearVars(); Home.hist = []; Home.ed.clear(); goHome();
  try { localStorage.removeItem('calc30x'); } catch (e) { /* storage unavailable */ }
}

/* ---------- data editor & statistics ---------- */
function dataEditor() {
  const L = () => S.lists, reload = G => { G.r = Math.min(G.r, L()[G.c].length); G.reload(); };
  const g = Grid({
    cols: 3, rows: c => Math.min(50, L()[c].length + 1), get: (c, r) => L()[c][r], head: c => 'L' + (c + 1), name: (c, r) => `L${c + 1}(${r + 1})`,
    set: (c, r, v) => { L()[c][r] = v; }, del: (c, r) => { L()[c].splice(r, 1); },
    onData: G => push(Menu([
      tabsOf('CLR', [['Clear L1', () => { L()[0] = []; reload(G); }], ['Clear L2', () => { L()[1] = []; reload(G); }], ['Clear L3', () => { L()[2] = []; reload(G); }], ['Clear ALL', () => { S.lists = [[], [], []]; reload(G); }]]),
      tabsOf('OPS', [['Sort Sm-Lg', () => { L()[G.c].sort((a, b) => a - b); reload(G); }], ['Sort Lg-Sm', () => { L()[G.c].sort((a, b) => b - a); reload(G); }]])
    ]))
  });
  push(g);
}
const LISTS = ['L1', 'L2', 'L3'];
const statMem = {}, tblMem = { start: ['0'], step: ['1'], ask: 0 };
function statForm(kind) {
  const one = kind === '1-Var';
  const fields = one ? [{ lab: 'DATA:', opts: LISTS, v: 0 }, { lab: 'FRQ:', opts: ['ONE', ...LISTS], v: 0 }]
    : [{ lab: 'xDATA:', opts: LISTS, v: 0 }, { lab: 'yDATA:', opts: LISTS, v: 1 }, { lab: 'FRQ:', opts: ['ONE', ...LISTS], v: 0 }];
  const isReg = !one && kind !== '2-Var';
  if (isReg) fields.push({ lab: 'RegEQ→', opts: ['NO', 'f(x)', 'g(x)'], v: 0 });
  const mem = statMem[one ? 1 : 2] || []; fields.forEach((f, i) => { if (mem[i] !== undefined) f.v = mem[i]; }); // wizards keep their choices
  push(Form(kind.toUpperCase(), fields, vals => {
    statMem[one ? 1 : 2] = vals.slice();
    const st = one ? E.runStats('1-Var', vals[0], -1, vals[1] - 1) : E.runStats(kind, vals[0], vals[1], vals[2] - 1);
    if (isReg && vals[3] && st.eq) { if (vals[3] === 1) S.f = st.eq; else S.g = st.eq; }
    pop(); statVarsScreen();
  }));
}
function statVarsScreen() {
  const st = S.stat; if (!st) { msgScreen(['Calculate 1-Var,', '2-Var Stat or', 'a regression.']); return; }
  const lines = st.order.map(n => n.endsWith('(') ? { lab: n, nolab: true, paste: ['$' + n] }
    : { lab: n, v: st.vals[n], row: st.vals[n] === undefined ? ['E', 'r', 'r', 'o', 'r'] : null, paste: ['$' + n] });
  if (st.eq) lines.unshift({ lab: 'y', row: st.eq, paste: clone(st.eq) });
  push(Results(st.title, lines));
}
function distForm(name) {
  const F = (fields, run, out) => push(Form(name, fields, vals => { const r = run(vals); pop(); S.ans = Array.isArray(r) ? r[r.length - 1] : r; push(Results(name, out ? out(vals, r) : [{ lab: 'P', v: r }])); }));
  const nf = (lab, row) => ({ lab, row: row ? [...row] : [] });
  const BIG = ['1', 'ᴇ', '9', '9'], NBIG = ['‾', ...BIG];
  const re = E.real;
  switch (name) {
    case 'Normalpdf': return F([nf('x='), nf('μ=', '0'), nf('σ=', '1')], v => E.normalpdf(re(v[0]), re(v[1]), re(v[2])));
    case 'Normalcdf': return F([nf('LOWER=', NBIG), nf('UPPER=', BIG), nf('μ=', '0'), nf('σ=', '1')], v => E.normalcdf(re(v[0]), re(v[1]), re(v[2]), re(v[3])));
    case 'invNormal': return F([nf('area=', '1'), nf('μ=', '0'), nf('σ=', '1')], v => E.invNormal(re(v[0]), re(v[1]), re(v[2])), (v, r) => [{ lab: 'x', v: r }]);
    default: { // Binomial/Poisson pdf/cdf: x as SINGLE value, LIST (data list → results saved to a list) or ALL (binomial only)
      const bin = name[0] === 'B', f = { Binomialpdf: E.binompdf, Binomialcdf: E.binomcdf, Poissonpdf: E.poisspdf, Poissoncdf: E.poisscdf }[name];
      const md = { lab: '', opts: bin ? ['SINGLE', 'LIST', 'ALL'] : ['SINGLE', 'LIST'], v: 0 }, par = bin ? [nf('TRIALS='), nf('p=')] : [nf('μ=', '1')];
      const k = 1 + par.length, isL = () => md.v === 1;
      const fields = [md, ...par, { lab: 'x=', row: [], optional: true, hide: () => md.v !== 0 },
        { lab: 'LIST:', opts: LISTS, v: 0, hide: () => !isL() }, { lab: 'SAVE→', opts: LISTS, v: 1, hide: () => !isL() }];
      return push(Form(name, fields, v => {
        const P = par.map((_, i) => re(v[1 + i])), g = x => bin ? f(P[0], P[1], x) : f(P[0], x);
        let out;
        if (v[0] === 2) {
          const n = P[0];
          if (!Number.isInteger(n) || n < 0) E.err('Input must be non-negative Integer.');
          if (n > 49) E.err('TRIALS: Enter 0≤n≤49');
          out = []; for (let x = 0; x <= n; x++) out.push({ lab: `P(${x})`, v: g(x) });
        } else if (v[0] === 1) {
          const xs = S.lists[v[k + 1]]; if (!xs.length) E.err('Statistics');
          const ps = xs.map(g); S.lists[v[k + 2]] = ps;
          out = xs.map((x, i) => ({ lab: `P(${shortNum(x)})`, v: ps[i] }));
        } else {
          if (v[k] === undefined) E.err('Syntax');
          out = [{ lab: 'P', v: g(re(v[k])) }];
        }
        S.ans = out[out.length - 1].v; pop(); push(Results(name + (v[0] ? ' ' + md.opts[v[0]] : ''), out));
      }));
    }
  }
}
function statRegMenu() {
  push(Menu([
    tabsOf('STAT-REG', [['StatVars', statVarsScreen], ['1-Var Stats', () => statForm('1-Var')], ['2-Var Stats', () => statForm('2-Var')], ...E.REGS.map(r => [r, () => statForm(r)])]),
    tabsOf('DISTR', ['Normalpdf', 'Normalcdf', 'invNormal', 'Binomialpdf', 'Binomialcdf', 'Poissonpdf', 'Poissoncdf'].map(n => [n, () => distForm(n)]))
  ]));
}

/* ---------- function table ---------- */
function funcEdit(then) {
  push(Form('', [{ lab: 'f(x)=', row: S.f || [] }, { lab: 'g(x)=', row: S.g || [], optional: true }], (v, F) => {
    S.f = F.fields[0].ed.empty() ? null : clone(F.fields[0].ed.root);
    S.g = F.fields[1].ed.empty() ? null : clone(F.fields[1].ed.root);
    pop(); then();
  }, null));
  top().noEval = true;
}
function tableSetup() {
  push(Form('TABLE SETUP', [{ lab: 'Start=', row: tblMem.start }, { lab: 'Step=', row: tblMem.step }, { lab: '', opts: ['Auto', 'Ask-x'], v: tblMem.ask }], (v, F) => {
    const start = E.real(v[0]), step = E.real(v[1]); if (step === 0) E.err('Step size must not be 0.');
    Object.assign(tblMem, { start: clone(F.fields[0].ed.root), step: clone(F.fields[1].ed.root), ask: v[2] });
    pop(); push(TableView(start, step, v[2] === 1));
  }));
}
function TableView(start, step, ask) {
  const xs = [];
  const getx = r => ask ? xs[r] : start + r * step;
  const fv = (row, x) => { if (!row || x === undefined) return undefined; try { return E.real(E.withVar('x', x, E.compile(row, {}))); } catch (e) { return NaN; } };
  const G = Grid({
    cols: 1 + (S.g ? 2 : 1), rows: () => 1000, head: c => ['x', 'f(x)', 'g(x)'][c], name: (c, r) => c === 0 ? 'x' : ['', 'f', 'g'][c] + '(' + shortNum(getx(r)) + ')',
    get: (c, r) => c === 0 ? getx(r) : fv(c === 1 ? S.f : S.g, getx(r)),
    set: (c, r, v) => { if (c !== 0) return; if (ask) xs[r] = v; else start = v - r * step; },
    onClear: () => { pop(); tableSetup(); } // guide: clear in the table opens Table Setup
  });
  return G;
}
function tableKey() {
  push(Menu([tabsOf('TABLE', [['Add/Edit Func', () => funcEdit(tableSetup)], ['f(', () => goHomePut('f(')], ['g(', () => goHomePut('g(')]])]));
}
function goHomePut(t) { goHome(); Home.ed.mt = null; Home.ed.put(t, true); }

/* ---------- expression evaluation ---------- */
function usedVars(row, acc = new Set()) {
  row.forEach(t => { if (typeof t === 'string' && VARS.includes(t)) acc.add(t); else if (isT(t) && SLOTS[t.t]) SLOTS[t.t].forEach(s => usedVars(t[s], acc)); });
  return acc;
}
function exprEval() {
  push(Form('EXPR-EVAL', [{ lab: 'Expr=', row: Home.ed.empty() ? [] : Home.ed.root }], (v, F) => {
    const row = clone(F.fields[0].ed.root), vs = [...usedVars(row)];
    if (!row.length) E.err('Syntax');
    const fin = vals => { vs.forEach((x, i) => { S.vars[x] = vals[i]; }); const r = E.evaluate(row); S.ans = r.v; push(Results('EXPR-EVAL', [{ lab: '', row, nolab: true }, { lab: '', nolab: true, v: r.v, row: (() => { const o = E.formatResult(r.v, r.flags); return o.exact || o.dec; })() }])); };
    pop();
    if (!vs.length) return fin([]);
    push(Form('Werte', vs.map(x => ({ lab: x + '=', row: numRow(E.isN(S.vars[x]) ? S.vars[x] : 0) })), vals => { pop(); fin(vals); }));
  }, null));
  top().noEval = true;
}

/* ---------- solvers ---------- */
function numSolv() {
  push(Form('NUM-SOLV  links = rechts', [{ lab: '', row: [] }, { lab: '=', row: ['0'] }], (v, F) => {
    const L = clone(F.fields[0].ed.root), R = clone(F.fields[1].ed.root);
    const vs = [...usedVars([...L, ...R])]; if (!vs.length) E.err('Invalid equation');
    const dflt = vs.includes('x') ? vs.indexOf('x') : 0;
    pop();
    const fields = [{ lab: 'Löse nach:', opts: vs, v: dflt }, ...vs.map(x => ({ lab: x + '=', row: numRow(E.isN(S.vars[x]) ? S.vars[x] : 0) })),
      { lab: 'Untergr.=', row: ['‾', '1', 'ᴇ', '9', '9'] }, { lab: 'Obergr.=', row: ['1', 'ᴇ', '9', '9'] }];
    push(Form('NUM-SOLV', fields, vals => {
      const sv = vs[vals[0]], lo = E.real(vals[vals.length - 2]), hi = E.real(vals[vals.length - 1]);
      if (lo > hi) E.err('Bounds: Enter LOWER≤UPPER');
      vs.forEach((x, i) => { S.vars[x] = vals[i + 1]; });
      const fl = E.compile(L, {}), fr = E.compile(R, {});
      const f = x => E.withVar(sv, x, () => E.real(fl()) - E.real(fr()));
      const x = E.numSolve(f, E.real(S.vars[sv]), lo, hi);
      S.vars[sv] = x; S.ans = x;
      push(Results('NUM-SOLV', [{ lab: sv, v: x }, { lab: 'L−R', v: f(x) }]));
    }, 'SOLVE'));
  }, null));
  top().noEval = true;
}
function polySolv() {
  push(Menu([tabsOf('POLY-SOLV', [['ax²+bx+c=0', () => polyForm(2)], ['ax³+bx²+cx+d=0', () => polyForm(3)]])]));
}
function polyForm(deg) {
  const names = ['a', 'b', 'c', 'd'].slice(0, deg + 1);
  push(Form(deg === 2 ? 'ax²+bx+c=0' : 'ax³+bx²+cx+d=0', names.map(n => ({ lab: n + '=', row: [] })), vals => {
    const r = E.polySolve(vals);
    const lines = r.roots.map((x, i) => ({ lab: 'x' + (i + 1), row: r.exact ? r.exact[i] : E.fmtVal(x, { root: true }, true), v: x }));
    if (deg === 2) { const [a, b, c] = vals.map(E.real), h = -b / (2 * a); lines.push({ lab: 'Scheitel x', v: h, row: E.fmtVal(h, {}, true) }, { lab: 'Scheitel y', v: c - b * b / (4 * a), row: E.fmtVal(c - b * b / (4 * a), {}, true) }); }
    push(Results('LÖSUNGEN', lines));
  }, 'SOLVE'));
}
function sysSolv() {
  push(Menu([tabsOf('SYS-SOLV', [['2×2 lin. Gleichungen', () => sysForm(2)], ['3×3 lin. Gleichungen', () => sysForm(3)]])]));
}
function sysForm(n) {
  const v = ['x', 'y', 'z'].slice(0, n), cols = n === 2 ? ['a', 'b', 'c'] : ['a', 'b', 'c', 'd'];
  const fields = [];
  for (let r = 1; r <= n; r++) cols.forEach((c, j) => fields.push({ lab: (j === 0 ? '' : j === n ? '=' : '+') + c + r + (j < n ? '·' + v[j] : '') + ': ', row: [] }));
  push(Form(n === 2 ? 'ax+by=c' : 'ax+by+cz=d', fields, vals => {
    const A = []; for (let r = 0; r < n; r++) A.push(vals.slice(r * (n + 1), (r + 1) * (n + 1)));
    const s = E.sysSolve(A);
    if (s.none) return push(Results('SYS-SOLV', [{ lab: 'Keine Lösung', nolab: true }]));
    if (s.inf) return push(Results('SYS-SOLV', [{ lab: 'Unendlich viele Lösungen', nolab: true }]));
    push(Results('SYS-SOLV', s.x.map((x, i) => ({ lab: v[i], v: x, row: E.fmtVal(x, {}, true) }))));
  }, 'SOLVE'));
}

/* ---------- vectors & matrices ---------- */
function editMat(name, isVec) {
  const fields = isVec ? [{ lab: 'Dim:', opts: ['2', '3'], v: 1 }] : [{ lab: 'Zeilen:', opts: ['1', '2', '3'], v: 1 }, { lab: 'Spalten:', opts: ['1', '2', '3'], v: 1 }];
  push(Form((isVec ? '[' + name + ']' : '[' + name + ']') + ' Dimension', fields, v => {
    pop();
    if (isVec) {
      const n = v[0] + 2, old = (S.vecs[name] || { vec: [] }).vec; S.vecs[name] = { vec: Array.from({ length: n }, (_, i) => old[i] || 0) };
      const M = S.vecs[name].vec;
      push(Grid({ cols: n, rows: () => 1, get: (c, r) => r ? undefined : M[c], set: (c, r, x) => { M[c] = x; }, head: c => ['x', 'y', 'z'][c], name: c => `${name}${c + 1}`, next: (c, r) => [(c + 1) % n, 0] }));
    } else {
      const R = v[0] + 1, C = v[1] + 1, old = (S.mats[name] || { mat: [] }).mat;
      S.mats[name] = { mat: Array.from({ length: R }, (_, i) => Array.from({ length: C }, (_, j) => (old[i] && old[i][j]) || 0)) };
      const M = S.mats[name].mat;
      push(Grid({ cols: C, rows: () => R, get: (c, r) => M[r] && M[r][c], set: (c, r, x) => { M[r][c] = x; }, head: c => 'Sp' + (c + 1), name: (c, r) => `${name}${r + 1}${c + 1}`, next: (c, r) => c + 1 < C ? [c + 1, r] : [0, (r + 1) % R] }));
    }
  }, 'OK'));
}
function vectorMenu() {
  openMenu([{ name: 'VECTOR', items: [['[u]', '[u]'], ['[v]', '[v]'], ['[w]', '[w]']] },
    { name: 'MATH', items: [['DotP(', 'DotP('], ['CrossP(', 'CrossP('], ['norm(', 'norm(']] },
    { name: 'EDIT', items: ['u', 'v', 'w'].map(n => [`[${n}] ${S.vecs[n] ? S.vecs[n].vec.length + 'D' : ''}`, () => editMat(n, true)]) }]);
}
function matrixMenu() {
  openMenu([{ name: 'MATRIX', items: [['[A]', '[A]'], ['[B]', '[B]'], ['[C]', '[C]']] },
    { name: 'MATH', items: [['det(', 'det('], ['ᵀ Transpose', 'ᵀ'], ['Identity(', 'Identity('], ['ref(', 'ref('], ['rref(', 'rref(']] },
    { name: 'EDIT', items: ['A', 'B', 'C'].map(n => [`[${n}] ${S.mats[n] ? S.mats[n].mat.length + '×' + S.mats[n].mat[0].length : ''}`, () => editMat(n, false)]) }]);
}

/* ---------- set op ---------- */
function setOp() {
  push(Form('SET OP  op=', [{ lab: 'op=', row: S.op || [] }], (v, F) => {
    S.op = F.fields[0].ed.empty() ? null : clone(F.fields[0].ed.root);
    pop(); msgScreen(['Operation set!', '[2nd] [op] fügt', 'sie im Home ein.']);
  }, null));
  top().noEval = true;
}

/* ================= global keys ================= */
const SEC = { mode: 'quit', del: 'insert', lnlog: 'ddx', math: 'matrix', data: 'statreg', e10: 'integral', ee: 'vector', fact: 'random', table: 'expreval',
  pi: 'complex', sin: 'numsolv', cos: 'polysolv', tan: 'syssolv', div: 'percent', pow: 'nroot', frac: 'recip', lp: 'constants', rp: 'op', mul: 'setop',
  sq: 'sqrt', 7: 'mixed', 8: 'convert', 9: 'basen', sub: 'ctrdn', var: 'clearvar', 4: 'D', 5: 'E', 6: 'F', add: 'ctrup', sto: 'recall', 1: 'A', 2: 'B', 3: 'C',
  tog: 'fd', on: 'off', 0: 'reset', '.': 'comma', neg: 'answer', left: 'home', right: 'end', up: 'top', down: 'bottom' };
function global(k) {
  switch (k) {
    case 'quit': goHome(); return;
    case 'off': off = true; return;
    case 'ctrdn': contrast = Math.max(-4, contrast - 1); return;
    case 'ctrup': contrast = Math.min(4, contrast + 1); return;
    case 'mode': push(ModeScreen()); return;
    case 'math': if (curEd()) mathMenu(); return;
    case 'data': if (S.mode.base !== 'DEC') return errScreen('Change mode to DEC.'); dataEditor(); return;
    case 'statreg': if (S.mode.base !== 'DEC') return errScreen('Change mode to DEC.'); statRegMenu(); return;
    case 'table': if (S.mode.base !== 'DEC') return errScreen('Change mode to DEC.'); tableKey(); return;
    case 'expreval': exprEval(); return;
    case 'constants': if (curEd()) constantsMenu(); return;
    case 'convert': if (curEd()) convertMenu(); return;
    case 'basen': if (curEd()) openMenu([{ name: 'CONVERT', items: [['►Hex', '►Hex'], ['►Bin', '►Bin'], ['►Oct', '►Oct'], ['►Dec', '►Dec']] },
      { name: 'LOGIC', items: [['and', ' and '], ['or', ' or '], ['xor', ' xor '], ['xnor', ' xnor '], ['not(', 'not('], ["2's(", "2's("], ['nand', ' nand ']] }]); return;
    case 'complex': if (curEd()) openMenu([{ name: 'COMPLEX', items: [['conj(', 'conj('], ['real(', 'real('], ['imag(', 'imag('], ['arg(', 'arg('], ['►r∠θ', '►r∠θ'], ['►a+bi', '►a+bi'], ['∠', '∠']] }]); return;
    case 'random': if (curEd()) openMenu([{ name: 'RAND', items: [['rand', 'rand'], ['randint(', 'randint(']] }]); return;
    case 'recall': recallMenu(); return;
    case 'clearvar': yesNo('CLEAR VAR', true, clearVars); return;
    case 'reset': yesNo('RESET', false, resetAll); return;
    case 'numsolv': numSolv(); return;
    case 'polysolv': polySolv(); return;
    case 'syssolv': sysSolv(); return;
    case 'vector': if (S.mode.base !== 'DEC') return errScreen('Change mode to DEC.'); vectorMenu(); return;
    case 'matrix': if (S.mode.base !== 'DEC') return errScreen('Change mode to DEC.'); matrixMenu(); return;
    case 'setop': setOp(); return;
    case 'clear': pop(); return;
  }
}
function press(k) {
  if (off) { if (k === 'on') off = false; draw(); return; }
  if (k === '2nd') { second = !second; draw(); return; }
  if (second) { k = SEC[k] || k; second = false; }
  const s = top();
  const handled = !['quit', 'off', 'ctrdn', 'ctrup'].includes(k) && s.key && s.key(k);
  if (!handled) global(k);
  save(); draw();
}

/* ================= drawing ================= */
function draw() {
  const m = S.mode, ed = curEd();
  $('ind').innerHTML = off ? '' : [second ? '2ND' : '', m.angle, m.fix >= 0 ? 'FIX' : '', m.note !== 'NORM' ? m.note : '', { HEX: 'H', BIN: 'B', OCT: 'O' }[m.base] || '',
    m.cplx !== 'REAL' ? m.cplx : '', m.mp ? '' : 'CLASSIC', ed && ed.mt ? '▸' : '', '<span class="sp"></span>',
    top() === Home && Home.hist.length ? (Home.sel >= 0 ? '▲▼' : '▲') : ''].filter(Boolean).map(x => x[0] === '<' ? x : `<span>${x}</span>`).join('');
  const scr = $('scr');
  scr.className = off ? 'off' : '';
  scr.innerHTML = top().draw();
  $('lcd').style.filter = `contrast(${1 + contrast * 0.12}) brightness(${1 - contrast * 0.05})`;
  const focus = document.getElementById('selx') || scr.querySelector('.blk,.bar,.inv');
  if (top() === Home) scr.scrollTop = scr.scrollHeight;
  if (focus) focus.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/* ================= persistence ================= */
function save() {
  try { localStorage.setItem('calc30x', JSON.stringify({ S: { vars: S.vars, ans: S.ans, mode: S.mode, lists: S.lists, f: S.f, g: S.g, stat: S.stat, mats: S.mats, vecs: S.vecs, op: S.op }, hist: Home.hist.slice(-20) })); }
  catch (e) { /* storage full/unavailable: keep running */ }
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem('calc30x') || 'null');
    if (d) { Object.assign(S, d.S); Home.hist = d.hist || []; }
  } catch (e) { /* corrupt state: start fresh */ }
}

/* ================= keypad ================= */
const FRAC_ICON = '<span style="display:inline-flex;flex-direction:column;align-items:center;font-size:.75em;line-height:.9"><span style="border-bottom:1px solid;padding:0 2px">□</span><span>□</span></span>';
const KEYS = [
  ['2nd', '2nd', '', 'blue'], ['mode', 'mode', 'quit'], ['del', 'delete', 'insert'], 'DPAD',
  ['lnlog', 'ln log', '<i>d</i>/<i>dx</i>□'], ['math', 'math', 'matrix'], ['data', 'data', 'stat-reg/distr'],
  ['e10', '<i>e</i><sup>□</sup>10<sup>□</sup>', '∫□<sup>□</sup><i>dx</i>'], ['ee', 'EE', 'vector'], ['fact', '!<span style="font-size:.75em;line-height:.95;margin-left:2px;display:inline-block">nCr<br>nPr</span>', 'random'], ['table', 'table', 'expr-eval'], ['clear', 'clear', ''],
  ['pi', '<i>π</i><span style="display:inline-flex;flex-direction:column;font-size:.6em;line-height:.95"><i>e</i><i>i</i></span>', 'complex'], ['sin', 'sin<br>sin<sup>-1</sup>', 'num-solv', 'two'], ['cos', 'cos<br>cos<sup>-1</sup>', 'poly-solv', 'two'], ['tan', 'tan<br>tan<sup>-1</sup>', 'sys-solv', 'two'], ['div', '÷', '%', 'op'],
  ['pow', '<i>x</i><sup>□</sup>', '<sup>□</sup>√‾', ''], ['frac', FRAC_ICON, '<sup>1</sup>/<sub>□</sub>'], ['lp', '(', 'constants'], ['rp', ')', 'op'], ['mul', '×', 'set op', 'op'],
  ['sq', '<i>x</i>²', '√‾'], ['7', '7', '□<sup>□</sup>/<sub>□</sub>', 'num'], ['8', '8', 'convert', 'num'], ['9', '9', 'base n', 'num'], ['sub', '−', '◂◑', 'op'],
  ['var', '<i>x</i><span style="display:inline-flex;flex-direction:column;font-size:.55em;line-height:.95"><i>yzt</i><i>abcd</i></span>', 'clear var'], ['4', '4', 'D', 'num'], ['5', '5', 'E', 'num'], ['6', '6', 'F', 'num'], ['add', '+', '◑▸', 'op'],
  ['sto', 'sto→', 'recall'], ['1', '1', 'A', 'num'], ['2', '2', 'B', 'num'], ['3', '3', 'C', 'num'], ['tog', '◂▸≈', 'f◂▸d', 'op'],
  ['on', 'on', 'off'], ['0', '0', 'reset', 'num'], ['.', '.', ',', 'num'], ['neg', '(−)', 'answer', 'num'], ['enter', 'enter', '', 'op']
];
function buildKeys() {
  const host = $('keys');
  KEYS.forEach(k => {
    if (k === 'DPAD') {
      const d = document.createElement('div'); d.id = 'dpad';
      d.innerHTML = '<span style="top:4%;left:46%">▲</span><span style="bottom:4%;left:46%">▼</span><span style="left:5%;top:40%">◀</span><span style="right:5%;top:40%">▶</span>';
      d.addEventListener('pointerdown', ev => {
        ev.preventDefault(); const b = d.getBoundingClientRect();
        const x = (ev.clientX - b.left) / b.width - 0.5, y = (ev.clientY - b.top) / b.height - 0.5;
        tick(d); press(Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up'));
      });
      host.appendChild(d); return;
    }
    const [id, lab, l2, cls] = k;
    const c = document.createElement('div'); c.className = 'cell';
    c.innerHTML = `<div class="l2">${l2 || '&nbsp;'}</div><button class="k ${cls || ''}" data-k="${id}">${lab}</button>`;
    const b = c.querySelector('button');
    b.addEventListener('pointerdown', ev => { ev.preventDefault(); tick(b); press(id); });
    host.appendChild(c);
  });
}
function tick(el) {
  el.classList.add('pressed'); setTimeout(() => el.classList.remove('pressed'), 90);
  if (navigator.vibrate) navigator.vibrate(8);
}
const KB = { Enter: 'enter', Backspace: 'del', Delete: 'del', Escape: 'clear', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'add', '-': 'sub', '*': 'mul', '/': 'frac', '(': 'lp', ')': 'rp', '^': 'pow', '.': '.', ',': '.', 'x': 'var' };
document.addEventListener('keydown', e => { const k = /^[0-9]$/.test(e.key) ? e.key : KB[e.key]; if (k) { e.preventDefault(); press(k); } });

window.back = () => { if (second) second = false; else if (stack.length > 1) pop(); else press('clear'); draw(); };
window.calcPress = press; // for automated testing
load();
stack.push(Home);
buildKeys();
draw();
// web app (iPhone/browser): offline cache, and keep the screen on like the Android app does natively
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
const wake = () => { if ('wakeLock' in navigator && document.visibilityState === 'visible') navigator.wakeLock.request('screen').catch(() => {}); };
wake(); document.addEventListener('visibilitychange', wake); document.addEventListener('pointerdown', wake, { once: true });
})();
