/* engine.js — math core: parser/evaluator, number formatting, stats, distributions, solvers. No DOM. */
(function (G) {
'use strict';

const S = {
  vars: { x: 0, y: 0, z: 0, t: 0, a: 0, b: 0, c: 0, d: 0 }, ans: 0,
  mode: { angle: 'DEG', note: 'NORM', fix: -1, cplx: 'REAL', base: 'DEC', mp: true },
  lists: [[], [], []], f: null, g: null, stat: null, mats: {}, vecs: {}, op: null, seed: 0
};
const VARS = ['x', 'y', 'z', 't', 'a', 'b', 'c', 'd'];

class CalcError extends Error {}
const err = m => { throw new CalcError(m); };

/* ---------- value helpers (number | complex {re,im} | {mat} | {vec}) ---------- */
const isN = v => typeof v === 'number';
const isC = v => v !== null && typeof v === 'object' && 'im' in v;
const isM = v => v !== null && typeof v === 'object' && Array.isArray(v.mat);
const isV = v => v !== null && typeof v === 'object' && Array.isArray(v.vec);
const Re = v => isN(v) ? v : v.re, Im = v => isN(v) ? 0 : v.im;
function real(v) { if (isN(v)) return v; err('Invalid data type'); }
function int(v) { v = real(v); if (!Number.isInteger(v)) err('Domain'); return v; }
function chk(x) {
  if (Number.isNaN(x)) err('Domain');
  if (!Number.isFinite(x) || Math.abs(x) >= 1e100) err('Overflow');
  return Math.abs(x) < 1e-99 ? 0 : x;
}
function cx(re, im) {
  re = chk(re); im = chk(im);
  const m = Math.max(Math.abs(re), Math.abs(im));
  if (Math.abs(im) <= 1e-13 * m) im = 0;
  if (Math.abs(re) <= 1e-13 * m) re = 0;
  return im === 0 ? re : { re, im };
}
const scale = (m, s) => isM(m) ? { mat: m.mat.map(r => r.map(x => mul(x, s))) } : { vec: m.vec.map(x => mul(x, s)) };

function add(a, b) {
  if (isM(a) || isM(b)) {
    if (!isM(a) || !isM(b)) err('Invalid data type');
    if (a.mat.length !== b.mat.length || a.mat[0].length !== b.mat[0].length) err('Dimension mismatch');
    return { mat: a.mat.map((r, i) => r.map((x, j) => add(x, b.mat[i][j]))) };
  }
  if (isV(a) || isV(b)) {
    if (!isV(a) || !isV(b)) err('Invalid data type');
    if (a.vec.length !== b.vec.length) err('Dimension mismatch');
    return { vec: a.vec.map((x, i) => add(x, b.vec[i])) };
  }
  if (isN(a) && isN(b)) { // cancellation below 13 digits is binary noise (TI: 0.1+0.2−0.3 = 0)
    const s = a + b; return chk(Math.abs(s) <= 1e-13 * Math.max(Math.abs(a), Math.abs(b)) ? 0 : s);
  }
  return cx(Re(a) + Re(b), Im(a) + Im(b));
}
function neg(a) { return isN(a) ? -a : isC(a) ? { re: -a.re, im: -a.im } : scale(a, -1); }
const sub = (a, b) => add(a, neg(b));
function mul(a, b) {
  if (isM(a) && isM(b)) {
    const A = a.mat, B = b.mat;
    if (A[0].length !== B.length) err('Dimension mismatch');
    return { mat: A.map(r => B[0].map((_, j) => r.reduce((s, x, k) => add(s, mul(x, B[k][j])), 0))) };
  }
  if (isM(a) && isV(b)) {
    if (a.mat[0].length !== b.vec.length) err('Dimension mismatch');
    return { vec: a.mat.map(r => r.reduce((s, x, k) => add(s, mul(x, b.vec[k])), 0)) };
  }
  if (isM(a) || isV(a)) { if (isM(b) || isV(b)) err('Invalid data type'); return scale(a, b); }
  if (isM(b) || isV(b)) return scale(b, a);
  if (isN(a) && isN(b)) return chk(a * b);
  return cx(Re(a) * Re(b) - Im(a) * Im(b), Re(a) * Im(b) + Im(a) * Re(b));
}
function div(a, b) {
  if (isM(b) || isV(b)) err('Invalid data type');
  if (isM(a) || isV(a)) return scale(a, div(1, b));
  if (Re(b) === 0 && Im(b) === 0) err('Division by 0');
  if (isN(a) && isN(b)) return chk(a / b);
  const d = Re(b) ** 2 + Im(b) ** 2;
  return cx((Re(a) * Re(b) + Im(a) * Im(b)) / d, (Im(a) * Re(b) - Re(a) * Im(b)) / d);
}
function cln(a) { if (Re(a) === 0 && Im(a) === 0) err('Domain'); return cx(Math.log(Math.hypot(Re(a), Im(a))), Math.atan2(Im(a), Re(a))); }
function cexp(a) { const m = Math.exp(Re(a)); return cx(m * Math.cos(Im(a)), m * Math.sin(Im(a))); }
const cplxOK = () => S.mode.cplx !== 'REAL';

function pow(a, b) {
  if (isM(a)) {
    let n = int(b); const k = a.mat.length;
    if (k !== a.mat[0].length) err('Dimension mismatch');
    if (n < 0) { a = inverse(a); n = -n; }
    let r = identity(k); for (let i = 0; i < n; i++) r = mul(r, a);
    return r;
  }
  if (isV(a) || isM(b) || isV(b)) err('Invalid data type');
  if (isN(a) && isN(b)) {
    if (a === 0) { if (b > 0) return 0; err('Domain'); }
    if (a > 0 || Number.isInteger(b)) return chk(Math.pow(a, b));
    const q = rat(Math.abs(b), 999);
    if (q && q[1] % 2 === 1) { const r = Math.pow(-a, b); return chk(q[0] % 2 ? -r : r); }
    if (!cplxOK()) err('Domain');
  }
  if (Re(a) === 0 && Im(a) === 0) { if (Re(b) > 0) return 0; err('Domain'); }
  if (isN(b) && Number.isInteger(b) && Math.abs(b) <= 64) { // exact repeated multiplication for complex^int
    let r = 1, base = b < 0 ? div(1, a) : a;
    for (let i = 0; i < Math.abs(b); i++) r = mul(r, base);
    return r;
  }
  return cexp(mul(b, cln(a)));
}
function sqrtv(a) {
  if (isN(a)) { if (a >= 0) return Math.sqrt(a); if (!cplxOK()) err('Domain'); return cx(0, Math.sqrt(-a)); }
  if (isC(a)) { const m = Math.hypot(a.re, a.im); return cx(Math.sqrt((m + a.re) / 2), Math.sign(a.im) * Math.sqrt((m - a.re) / 2)); }
  err('Invalid data type');
}
function nroot(n, x) {
  n = real(n); x = real(x);
  if (n === 0) err('Domain');
  if (n === 2) return sqrtv(x);
  if (n === 3) return chk(Math.cbrt(x));
  if (x < 0) { if (Number.isInteger(n) && Math.abs(n) % 2 === 1) return chk(-Math.pow(-x, 1 / n)); return pow(x, 1 / n); }
  return chk(Math.pow(x, 1 / n));
}
function absv(a) {
  if (isN(a)) return Math.abs(a);
  if (isC(a)) return Math.hypot(a.re, a.im);
  err('Invalid data type');
}
function inv(a) { return isM(a) ? inverse(a) : div(1, a); }

/* ---------- angles & trig ---------- */
const UNIT = { DEG: 180, RAD: Math.PI, GRAD: 200 };
const toRad = (x, u) => x * Math.PI / UNIT[u || S.mode.angle];
const fromRad = (x, u) => x * UNIT[u || S.mode.angle] / Math.PI;
const angConv = (x, from) => real(x) * UNIT[S.mode.angle] / UNIT[from];
function trigArg(x) { x = real(x); const full = 2 * UNIT[S.mode.angle]; return S.mode.angle === 'RAD' ? x : toRad(x % full); }
const snap = (r, x) => Math.abs(r) < 1e-14 && Math.abs(x) > 1e-9 ? 0 : r;
function sin(x) { const r = trigArg(x); return snap(Math.sin(r), r); }
function cos(x) { const r = trigArg(x); return snap(Math.cos(r), r); }
function tan(x) { const r = trigArg(x); const c = snap(Math.cos(r), r); if (c === 0) err('Domain'); return snap(Math.sin(r), r) / c; }
function asin(x) { x = real(x); if (Math.abs(x) > 1) err('Domain'); return fromRad(Math.asin(x)); }
function acos(x) { x = real(x); if (Math.abs(x) > 1) err('Domain'); return fromRad(Math.acos(x)); }
const atan = x => fromRad(Math.atan(real(x)));
function lnv(a) {
  if (isN(a) && a > 0) return Math.log(a);
  if (isN(a) && (a === 0 || !cplxOK())) err('Domain');
  return cln(a);
}
function logv(a) { if (isN(a) && a > 0) return chk(Math.log10(a)); return div(lnv(a), Math.LN10); }
function expv(a) { if (isN(a)) return chk(Math.exp(a)); if (isC(a)) return cexp(a); err('Invalid data type'); }
function fact(n) { n = real(n); if (!Number.isInteger(n) || n < 0 || n > 69) err('Domain'); let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
function nCr(n, r) {
  n = real(n); r = real(r);
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0) err('Domain');
  if (r > n) return 0;
  r = Math.min(r, n - r); let v = 1;
  for (let i = 1; i <= r; i++) v = v * (n - r + i) / i;
  return chk(Math.round(v) === v || v > 1e15 ? v : Math.round(v));
}
function nPr(n, r) {
  n = real(n); r = real(r);
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0) err('Domain');
  if (r > n) return 0;
  let v = 1; for (let i = 0; i < r; i++) v *= n - i;
  return chk(v);
}
const gcd2 = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };

/* ---------- random (seedable) ---------- */
let rs = 0;
function rnd() {
  if (!rs) return Math.random();
  rs = (rs * 16807) % 2147483647; return rs / 2147483647;
}

/* ---------- matrices & vectors ---------- */
const identity = n => ({ mat: Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j))) });
function rowEchelon(M, reduced) {
  const A = M.map(r => r.map(real)), R = A.length, C = A[0].length; let lead = 0;
  const tol = 1e-12 * Math.max(...A.flat().map(Math.abs)); // relative, so 1ᴇ-13-sized systems still solve
  for (let r = 0; r < R && lead < C; r++, lead++) {
    let p = r;
    for (let i = r + 1; i < R; i++) if (Math.abs(A[i][lead]) > Math.abs(A[p][lead])) p = i;
    if (Math.abs(A[p][lead]) <= tol) { r--; continue; }
    [A[r], A[p]] = [A[p], A[r]];
    const lv = A[r][lead]; A[r] = A[r].map(x => x / lv);
    for (let i = reduced ? 0 : r + 1; i < R; i++) if (i !== r) { const f = A[i][lead]; A[i] = A[i].map((x, j) => x - f * A[r][j]); }
  }
  // clean rounding noise: whole rows at noise level, and entries tiny next to their row's largest
  return A.map(r => { const mx = Math.max(...r.map(Math.abs)); return r.map(x => mx <= tol || Math.abs(x) <= 1e-12 * mx ? 0 : x); });
}
function det(m) {
  if (!isM(m)) err('Invalid data type');
  const A = m.mat.map(r => r.map(real)), n = A.length;
  if (n !== A[0].length) err('Dimension mismatch');
  let d = 1;
  for (let c = 0; c < n; c++) {
    let p = c; for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[p][c])) p = i;
    if (A[p][c] === 0) return 0;
    if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; d = -d; }
    d *= A[c][c];
    for (let i = c + 1; i < n; i++) { const f = A[i][c] / A[c][c]; for (let j = c; j < n; j++) A[i][j] -= f * A[c][j]; }
  }
  return d;
}
function inverse(m) {
  const n = m.mat.length; if (n !== m.mat[0].length) err('Dimension mismatch');
  if (Math.abs(det(m)) <= 1e-14 * Math.max(...m.mat.flat().map(absv)) ** n) err('Singular matrix');
  const aug = m.mat.map((r, i) => [...r.map(real), ...identity(n).mat[i]]);
  return { mat: rowEchelon(aug, true).map(r => r.slice(n)) };
}
const transpose = m => { if (!isM(m)) err('Invalid data type'); return { mat: m.mat[0].map((_, j) => m.mat.map(r => r[j])) }; };
function vecs(a, b) { if (!isV(a) || !isV(b)) err('Invalid data type'); if (a.vec.length !== b.vec.length) err('Dimension mismatch'); }
function dotP(a, b) { vecs(a, b); return a.vec.reduce((s, x, i) => add(s, mul(x, b.vec[i])), 0); }
function crossP(a, b) {
  vecs(a, b); const [a1, a2, a3 = 0] = a.vec.map(real), [b1, b2, b3 = 0] = b.vec.map(real);
  return { vec: [a2 * b3 - a3 * b2, a3 * b1 - a1 * b3, a1 * b2 - a2 * b1] };
}
function norm(a) { if (isV(a)) return Math.hypot(...a.vec.map(absv)); if (isM(a)) return Math.hypot(...a.mat.flat().map(absv)); return absv(a); }

/* ---------- numeric calculus ---------- */
function withVar(v, val, f) { const s = S.vars[v]; S.vars[v] = val; try { return f(); } finally { S.vars[v] = s; } }
function nderiv(e, v, x0, H) {
  x0 = real(x0); H = H === undefined ? 1e-3 : real(H);
  if (H <= 0) err('Tolerance not met');
  return (real(withVar(v, x0 + H, e)) - real(withVar(v, x0 - H, e))) / (2 * H);
}
const XK = [0.991455371120812639, 0.949107912342758525, 0.864864423359769073, 0.741531185599394440, 0.586087235467691130, 0.405845151377397167, 0.207784955007898468, 0];
const WK = [0.022935322010529225, 0.063092092629978553, 0.104790010322250184, 0.140653259715525919, 0.169004726639267903, 0.190350578064785410, 0.204432940075298892, 0.209482141084727828];
const WG = [0.129484966168869693, 0.279705391489276668, 0.381830050505118945, 0.417959183673469388];
function fnint(e, v, a, b) {
  a = real(a); b = real(b);
  if (a === b) return 0;
  // substitution x = a+(b-a)(3t²-2t³) on t∈[0,1] tames endpoint singularities like 1/√x
  const w = b - a, f = t => { const dw = 6 * t * (1 - t) * w; return dw === 0 ? 0 : real(withVar(v, a + w * t * t * (3 - 2 * t), e)) * dw; };
  let evals = 0;
  function gk(lo, hi) {
    const c = (lo + hi) / 2, h = (hi - lo) / 2; const fc = f(c);
    let k = WK[7] * fc, g = WG[3] * fc;
    for (let i = 0; i < 7; i++) {
      const s = f(c - h * XK[i]) + f(c + h * XK[i]);
      k += WK[i] * s; if (i % 2 === 1) g += WG[(i - 1) / 2] * s;
    }
    evals += 15; return [k * h, g * h];
  }
  function rec(lo, hi, tol, depth) {
    const [k, g] = gk(lo, hi);
    if (Math.abs(k - g) <= tol || depth > 40 || evals > 200000) return k;
    const m = (lo + hi) / 2;
    return rec(lo, m, tol / 2, depth + 1) + rec(m, hi, tol / 2, depth + 1);
  }
  const est = Math.abs(gk(0, 1)[0]); // integrate over t ∈ [0,1]
  return chk(rec(0, 1, Math.max(1e-11 * est, 1e-13), 0));
}
function sumprod(e, v, lo, hi, isProd) {
  lo = int(lo); hi = int(hi);
  if (lo > hi) err('Argument');
  if (hi - lo > 1e6) err('Argument');
  let acc = isProd ? 1 : 0;
  for (let k = lo; k <= hi; k++) { const t = withVar(v, k, e); acc = isProd ? mul(acc, t) : add(acc, t); }
  return acc;
}

/* ---------- constants & conversions ---------- */
const CONST = [
  ['c', 'speed of light', 299792458, 'm/s'], ['g', 'grav. accel.', 9.80665, 'm/s²'], ['h', "Planck's const", 6.62607015e-34, 'J·s'],
  ['N_A', "Avogadro's", 6.02214076e23, '/mol'], ['R', 'ideal gas', 8.314462618, 'J/mol/K'], ['m_e', 'electron mass', 9.1093837015e-31, 'kg'],
  ['m_p', 'proton mass', 1.67262192369e-27, 'kg'], ['m_n', 'neutron mass', 1.67492749804e-27, 'kg'], ['m_μ', 'muon mass', 1.883531627e-28, 'kg'],
  ['G', 'univ. gravitation', 6.6743e-11, 'm³/kg/s²'], ['F', 'Faraday', 96485.33212, 'C/mol'], ['a_0', 'Bohr radius', 5.29177210903e-11, 'm'],
  ['r_e', 'class. e⁻ radius', 2.8179403262e-15, 'm'], ['k', 'Boltzmann', 1.380649e-23, 'J/K'], ['e', 'electron charge', 1.602176634e-19, 'C'],
  ['u', 'atomic mass unit', 1.6605390666e-27, 'kg'], ['atm', 'std. atmosphere', 101325, 'Pa'], ['ε_0', 'permittivity vac.', 8.8541878128e-12, 'F/m'],
  ['μ_0', 'permeability vac.', 1.25663706212e-6, 'N/A²'], ['C_c', "Coulomb's const", 8.987551792261e9, 'm/F']
];
const CONSTV = Object.fromEntries(CONST.map(c => ['#' + c[0], c[2]]));
const lin = k => x => mul(x, k);
const CONV = {
  'in►cm': lin(2.54), 'cm►in': lin(1 / 2.54), 'ft►m': lin(0.3048), 'm►ft': lin(1 / 0.3048), 'yd►m': lin(0.9144), 'm►yd': lin(1 / 0.9144),
  'mile►km': lin(1.609344), 'km►mile': lin(1 / 1.609344), 'n mile►km': lin(1.852), 'km►n mile': lin(1 / 1.852),
  'acre►m²': lin(4046.8564224), 'm²►acre': lin(1 / 4046.8564224), 'gal US►L': lin(3.785411784), 'L►gal US': lin(1 / 3.785411784),
  'gal UK►L': lin(4.54609), 'L►gal UK': lin(1 / 4.54609), 'oz►g': lin(28.349523125), 'g►oz': lin(1 / 28.349523125),
  'lb►kg': lin(0.45359237), 'kg►lb': lin(1 / 0.45359237), 'cal►J': lin(4.184), 'J►cal': lin(1 / 4.184),
  'km/h►m/s': lin(1 / 3.6), 'm/s►km/h': lin(3.6), 'atm►Pa': lin(101325), 'Pa►atm': lin(1 / 101325),
  'mmHg►Pa': lin(133.322387415), 'Pa►mmHg': lin(1 / 133.322387415), 'hp►kW': lin(0.745699872), 'kW►hp': lin(1 / 0.745699872),
  '°F►°C': x => (real(x) - 32) * 5 / 9, '°C►°F': x => real(x) * 9 / 5 + 32, '°C►K': x => real(x) + 273.15, 'K►°C': x => real(x) - 273.15
};

/* ---------- stat vars & functions ---------- */
function statVal(name) {
  if (!S.stat || S.stat.vals[name] === undefined) err('Calculate 1-Var,2-Var Stat or a regression.');
  return S.stat.vals[name];
}
function regPredict(which, v) {
  const st = S.stat; if (!st || st.vals.a === undefined || st.vals.b === undefined) err('Calculate 1-Var,2-Var Stat or a regression.');
  v = real(v); const { a, b } = st.vals;
  if (which === 'x' && a === 0) err('Division by 0');
  return which === 'y' ? a * v + b : (v - b) / a;
}
function evalFn(row, x) {
  if (!row || !row.length) err('Invalid function');
  const f = compile(row, {});
  return withVar('x', x, f);
}

/* ---------- integer / base helpers ---------- */
const RADIX = { DEC: 10, HEX: 16, BIN: 2, OCT: 8 };
const toInt32 = v => { v = Math.trunc(real(v)); return v | 0; };
function roundv(x, n) {
  if (isC(x)) return cx(roundv(x.re, n), roundv(x.im, n));
  x = real(x); n = n === undefined ? 9 : int(n);
  if (n < 0 || n > 9) err('Domain');
  return roundDec(x, n);
}
function lcm(a, b) { a = int(a); b = int(b); if (a <= 0 || b <= 0) err('Domain'); return a / gcd2(a, b) * b; }
function gcd(a, b) { a = int(a); b = int(b); if (a < 0 || b < 0) err('Domain'); return gcd2(a, b); }
function polarC(r, th) { r = real(r); const a = toRad(real(th)); return cx(r * Math.cos(a), r * Math.sin(a)); }
function argv(a) { return isC(a) ? fromRad(Math.atan2(a.im, a.re)) : (real(a) < 0 ? fromRad(Math.PI) : 0); }

const FN = {
  'sin(': sin, 'cos(': cos, 'tan(': tan, 'sin⁻¹(': asin, 'cos⁻¹(': acos, 'tan⁻¹(': atan,
  'sinh(': x => chk(Math.sinh(real(x))), 'cosh(': x => chk(Math.cosh(real(x))), 'tanh(': x => Math.tanh(real(x)),
  'sinh⁻¹(': x => Math.asinh(real(x)),
  'cosh⁻¹(': x => { x = real(x); if (x < 1) err('Domain'); return Math.acosh(x); },
  'tanh⁻¹(': x => { x = real(x); if (Math.abs(x) >= 1) err('Domain'); return Math.atanh(x); },
  'ln(': lnv, 'log(': logv, '√(': sqrtv, 'e^(': expv, '10^(': x => pow(10, x),
  'logBASE(': (x, b) => div(lnv(x), lnv(b)),
  'abs(': x => isM(x) || isV(x) ? norm(x) : absv(x), 'round(': roundv,
  'iPart(': x => Math.trunc(real(x)), 'fPart(': x => { x = real(x); return x - Math.trunc(x); }, 'int(': x => Math.floor(real(x)),
  'min(': (a, b) => Math.min(real(a), real(b)), 'max(': (a, b) => Math.max(real(a), real(b)),
  'mod(': (a, b) => { a = real(a); b = real(b); if (b === 0) err('Division by 0'); return a - b * Math.floor(a / b); },
  'lcm(': lcm, 'gcd(': gcd,
  'conj(': a => isC(a) ? { re: a.re, im: -a.im } : real(a), 'real(': a => Re(a), 'imag(': a => Im(a), 'arg(': argv,
  'P►Rx(': (r, t) => real(r) * cos(t), 'P►Ry(': (r, t) => real(r) * sin(t),
  'R►Pr(': (x, y) => Math.hypot(real(x), real(y)), 'R►Pθ(': (x, y) => fromRad(Math.atan2(real(y), real(x))),
  'randint(': (a, b) => { a = int(a); b = int(b); if (a > b) [a, b] = [b, a]; return a + Math.floor(rnd() * (b - a + 1)); },
  'f(': x => evalFn(S.f, x), 'g(': x => evalFn(S.g, x),
  'det(': det, 'Identity(': n => { n = int(n); if (n < 1 || n > 3) err('Invalid dimension'); return identity(n); },
  'ref(': m => { if (!isM(m)) err('Invalid data type'); return { mat: rowEchelon(m.mat, false) }; },
  'rref(': m => { if (!isM(m)) err('Invalid data type'); return { mat: rowEchelon(m.mat, true) }; },
  'DotP(': dotP, 'CrossP(': crossP, 'norm(': norm,
  'not(': a => ~toInt32(a), "2's(": a => -toInt32(a),
  "$x'(": y => regPredict('x', y), "$y'(": x => regPredict('y', x)
};
const ARITY = { 'round(': [1, 2], 'logBASE(': [2, 2] };
const POSTFIX = new Set(['²', '⁻¹', '!', '%', '°', '′', '″', 'ʳ', 'ᵍ', 'ᵀ']);
const ANGU = { '°': 'DEG', 'ʳ': 'RAD', 'ᵍ': 'GRAD' };
const HINTS = new Set(['►n/d◄►Un/d', '►DMS', '►Pfactor', '►F◄►D', '►r∠θ', '►a+bi', '►Hex', '►Bin', '►Oct', '►Dec']);

/* ---------- lexer ---------- */
const isTpl = t => t !== null && typeof t === 'object';
function digitOK(t, radix) {
  if (typeof t !== 'string' || t.length !== 1) return false;
  const d = parseInt(t, 16);
  return !Number.isNaN(d) && /[0-9A-F]/.test(t) && d < radix;
}
function lex(row) {
  const radix = RADIX[S.mode.base], T = [];
  for (let i = 0; i < row.length;) {
    const t = row[i];
    if (isTpl(t)) { T.push({ k: 'tpl', v: t }); i++; continue; }
    if (digitOK(t, radix) || t === '.' || t === 'ᴇ') {
      let s = '';
      while (i < row.length && (digitOK(row[i], radix) || row[i] === '.')) s += row[i++];
      let e = '';
      if (row[i] === 'ᴇ' && radix === 10) {
        i++; if (row[i] === '‾' || row[i] === '−') { e = '-'; i++; }
        let d = ''; while (i < row.length && /^[0-9]$/.test(row[i])) d += row[i++];
        if (!d) err('Syntax'); e += d;
        if (row[i] === '.' || row[i] === 'ᴇ') err('Syntax'); // 2ᴇ3.5, 1ᴇ3ᴇ2
      }
      if ((s.match(/\./g) || []).length > 1 || s === '.') err('Syntax');
      let v;
      if (radix === 10) v = Number((s || '1') + (e ? 'e' + e : ''));
      else { if (s.includes('.')) err('Syntax'); v = parseInt(s, radix); if (v >= 2 ** 31) v -= 2 ** 32; }
      T.push({ k: 'n', v, dec: s.includes('.') });
      continue;
    }
    T.push({ k: 's', v: t }); i++;
  }
  return T;
}

/* ---------- parser → closures ---------- */
const SLOT1 = { pow: 'a', sqrt: 'a', exp: 'a', ten: 'a', abs: 'a' };
function compile(row, flags) {
  const T = lex(row); let p = 0;
  const sv = () => (T[p] && T[p].k === 's') ? T[p].v : null;
  const sc = r => compile(r, flags);
  function startsPrimary() {
    const t = T[p]; if (!t) return false;
    if (t.k === 'n') return true;
    if (t.k === 'tpl') return t.v.t !== 'pow';
    const s = t.v;
    return s === '(' || VARS.includes(s) || s === 'π' || s === 'ℯ' || s === 'i' || s === 'ans' || s === 'rand' ||
      s[0] === '#' || s[0] === '[' || (s[0] === '$' && s.length > 1) || (s.length > 1 && s.endsWith('('));
  }
  function close() { if (sv() === ')') p++; else if (p < T.length) err('Syntax'); }
  function statement() {
    let f = conv();
    if (sv() === '→') {
      p++; const v = sv();
      if (VARS.includes(v)) { p++; const g = f; return () => { const r = g(); if (isM(r) || isV(r)) err('Invalid data type'); S.vars[v] = r; return r; }; }
      if (v === 'rand') { p++; const g = f; return () => { const r = int(g()); rs = Math.abs(r) % 2147483646 + 1; return r; }; }
      err('Syntax');
    }
    return f;
  }
  function conv() {
    let f = lor();
    for (;;) {
      const s = sv();
      if (CONV[s]) { p++; flags.dec = true; const g = f, c = CONV[s]; f = () => c(g()); }
      else if (HINTS.has(s)) { p++; flags.hint = s; }
      else return f;
    }
  }
  function lor() {
    let f = land();
    for (;;) {
      const o = sv();
      if (o !== ' or ' && o !== ' xor ' && o !== ' xnor ') return f;
      p++; const l = f, r = land();
      f = o === ' or ' ? () => toInt32(l()) | toInt32(r()) : o === ' xor ' ? () => toInt32(l()) ^ toInt32(r()) : () => ~(toInt32(l()) ^ toInt32(r()));
    }
  }
  function land() {
    let f = addx();
    for (;;) {
      const o = sv();
      if (o !== ' and ' && o !== ' nand ') return f;
      p++; const l = f, r = addx();
      f = o === ' and ' ? () => toInt32(l()) & toInt32(r()) : () => ~(toInt32(l()) & toInt32(r()));
    }
  }
  function addx() {
    let f = mulx();
    for (;;) {
      const o = sv();
      if (o !== '+' && o !== '−') return f;
      p++; const l = f, r = mulx();
      f = o === '+' ? () => add(l(), r()) : () => sub(l(), r());
    }
  }
  function mulx() {
    let f = perm();
    for (;;) {
      const o = sv();
      if (o === '×' || o === '÷' || o === '∠') {
        p++; const l = f, r = perm();
        f = o === '×' ? () => mul(l(), r()) : o === '÷' ? () => div(l(), r()) : () => polarC(l(), r());
      } else if (startsPrimary()) { const l = f, r = perm(); f = () => mul(l(), r()); }
      else return f;
    }
  }
  function perm() {
    let f = fracx();
    while (sv() === ' nCr ' || sv() === ' nPr ') {
      const o = sv(); p++; const l = f, r = fracx();
      f = o === ' nCr ' ? () => nCr(l(), r()) : () => nPr(l(), r());
    }
    return f;
  }
  function fracx() {
    let f = negx();
    if (sv() === '⌟') {
      p++; const u = f, a = negx(); if (sv() !== '⁄') err('Syntax'); p++; const b = negx();
      f = () => mixed(u(), a(), b());
    }
    while (sv() === '⁄') { p++; const l = f, r = negx(); f = () => div(l(), r()); }
    return f;
  }
  function negx() {
    // a minus where an operand is expected (e.g. 10^−6 typed with the − key) acts as (−)
    if (sv() === '‾' || sv() === '−') { p++; const g = negx(); return () => neg(g()); }
    return powx();
  }
  function powx() {
    let f = postfix();
    while (sv() === '^' || sv() === 'ˣ√') {
      const o = sv(); p++; flags.root = true;
      let r; if (sv() === '‾' || sv() === '−') { p++; const g = postfix(); r = () => neg(g()); } else r = postfix();
      const l = f; f = o === '^' ? () => pow(l(), r()) : () => nroot(l(), r());
    }
    return f;
  }
  function postfix() {
    let f = primary();
    for (;;) {
      const t = T[p];
      if (t && t.k === 'tpl' && t.v.t === 'pow') {
        p++; flags.root = true; const e = sc(t.v.a), b = f; f = () => pow(b(), e()); continue;
      }
      const o = sv(); if (!POSTFIX.has(o)) return f;
      p++; const g = f;
      if (o === '²') f = () => { const v = g(); return mul(v, v); };
      else if (o === '⁻¹') f = () => inv(g());
      else if (o === '!') f = () => fact(g());
      else if (o === '%') f = () => div(g(), 100);
      else if (o === 'ᵀ') f = () => transpose(g());
      else if (ANGU[o]) { const u = ANGU[o]; f = dmsChain(() => angConv(g(), u)); }
      else if (o === '′') f = dmsChain(() => angConv(real(g()) / 60, 'DEG'));
      else if (o === '″') f = dmsChain(() => angConv(real(g()) / 3600, 'DEG'));
    }
  }
  function dmsChain(f) { // 12°31′45″ → sum of parts
    while (T[p] && T[p].k === 'n' && T[p + 1] && (T[p + 1].v === '′' || T[p + 1].v === '″')) {
      const v = T[p].v, d = T[p + 1].v === '′' ? 60 : 3600; p += 2; const g = f;
      f = () => add(g(), angConv(v / d, 'DEG'));
    }
    return f;
  }
  function args() {
    const a = [];
    if (sv() === ')') { p++; return a; }
    for (;;) { a.push(conv()); if (sv() === ',') { p++; continue; } close(); return a; }
  }
  function varArg() { if (sv() !== ',') err('Syntax'); p++; const v = sv(); if (!VARS.includes(v)) err('Syntax'); p++; return v; }
  function primary() {
    const t = T[p]; if (!t) err('Syntax');
    if (t.k === 'n') { p++; if (t.dec) flags.dec = true; const v = t.v; return () => v; }
    if (t.k === 'tpl') { p++; return tpl(t.v); }
    const s = t.v; p++;
    if (s === '(') { const f = conv(); close(); return f; }
    if (VARS.includes(s)) return () => S.vars[s];
    if (s === 'π') { flags.pi = true; return () => Math.PI; }
    if (s === 'ℯ') return () => Math.E;
    if (s === 'i') return () => ({ re: 0, im: 1 });
    if (s === 'ans') return () => S.ans;
    if (s === 'rand') return () => rnd();
    if (s[0] === '#' && CONSTV[s] !== undefined) { flags.dec = true; return () => CONSTV[s]; }
    if (s[0] === '[') {
      const n = s[1];
      return () => { const v = 'ABC'.includes(n) ? S.mats[n] : S.vecs[n]; if (!v) err('Undefined'); return JSON.parse(JSON.stringify(v)); };
    }
    if (s[0] === '$' && !s.endsWith('(')) return () => statVal(s.slice(1));
    if (s === 'nDeriv(' || s === 'fnInt(' || s === 'sum(' || s === 'prod(') {
      const e = conv(), v = varArg(), rest = [];
      while (sv() === ',') { p++; rest.push(conv()); }
      close();
      const need = { 'nDeriv(': [1, 2], 'fnInt(': [2, 3], 'sum(': [2, 2], 'prod(': [2, 2] }[s];
      if (rest.length < need[0] || rest.length > need[1]) err('Argument');
      if (s === 'nDeriv(') return () => nderiv(e, v, rest[0](), rest[1] && rest[1]());
      if (s === 'fnInt(') return () => fnint(e, v, rest[0](), rest[1]());
      return () => sumprod(e, v, rest[0](), rest[1](), s === 'prod(');
    }
    if (FN[s]) {
      if (/^(sin|cos|tan)/.test(s)) flags.root = true;
      if (/⁻¹\($/.test(s) && !s.includes('h')) flags.invtrig = true;
      const a = args(), F = FN[s], ar = ARITY[s] || [F.length, F.length];
      if (a.length < ar[0] || a.length > ar[1]) err('Argument');
      if (/^(sin|cos|tan)(⁻¹)?\($/.test(s)) { // like the TI: exact forms only for special angles (value² ∈ {0,¼,⅓,½,¾,1,3})
        const inv = s.includes('⁻¹'), special = x => isN(x) && (x === 0 || !!rat(x * x, 4));
        return () => { const xs = a.map(g => g()), v = F(...xs); if (!special(inv ? xs[0] : v)) flags.dec = true; return v; };
      }
      return () => F(...a.map(g => g()));
    }
    err('Syntax');
  }
  function tpl(v) {
    switch (v.t) {
      case 'frac': { const a = sc(v.a), b = sc(v.b); return () => div(a(), b()); }
      case 'mixed': { const u = sc(v.u), a = sc(v.a), b = sc(v.b); return () => mixed(u(), a(), b()); }
      case 'sqrt': { flags.root = true; const a = sc(v.a); return () => sqrtv(a()); }
      case 'root': { flags.root = true; const n = sc(v.n), a = sc(v.a); return () => nroot(n(), a()); }
      case 'exp': { const a = sc(v.a); return () => expv(a()); }
      case 'ten': { const a = sc(v.a); return () => pow(10, a()); }
      case 'logb': { const n = sc(v.n), a = sc(v.a); return () => div(lnv(a()), lnv(n())); }
      case 'abs': { const a = sc(v.a); return () => FN['abs('](a()); }
      case 'deriv': { const a = sc(v.a), pt = sc(v.p); return () => nderiv(a, 'x', pt()); }
      case 'int': { const lo = sc(v.lo), hi = sc(v.hi), a = sc(v.a); return () => fnint(a, 'x', lo(), hi()); }
      case 'sum': case 'prod': {
        if (v.v.length !== 1 || !VARS.includes(v.v[0])) err('Syntax');
        const lo = sc(v.lo), hi = sc(v.hi), a = sc(v.a), vn = v.v[0];
        return () => sumprod(a, vn, lo(), hi(), v.t === 'prod');
      }
    }
    err('Syntax');
  }
  if (!T.length) err('Syntax');
  const f = statement();
  if (p < T.length) err('Syntax');
  return f;
}
function mixed(u, a, b) { u = real(u); const f = div(a, b); return u < 0 || Object.is(u, -0) ? sub(u, f) : add(u, f); }

/* ---------- top-level evaluate ---------- */
function evaluate(row) {
  const flags = {};
  const f = compile(row, flags);
  const v = f();
  return { v, flags };
}

/* ---------- number formatting → display rows ---------- */
const chars = s => s.split('').map(c => c === '-' ? '‾' : c);
function rat(x, maxQ) { // continued fraction: x ≥ 0 → [p,q] or null
  // cap q so a chance match (≈ tol·q² fractions near x) stays unlikely: 40sin(46°) must not become 152759/5309
  maxQ = Math.min(maxQ, Math.floor(Math.sqrt(1e-4 / (1e-13 * x))));
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0, v = x;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(v), h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxQ) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (Math.abs(x - h1 / k1) <= 1e-13 * x) return [h1, k1]; // relative, so 1ᴇ-13 is not snapped to 0
    const fr = v - a; if (fr < 1e-15) break; v = 1 / fr;
  }
  return null;
}
function trimZ(s) { return s.includes('.') ? s.replace(/\.?0+$/, '') : s; }
function sciRow(mant, e) {
  return S.mode.mp ? [...chars(mant), '×', '1', '0', { t: 'pow', a: chars(String(e)) }] : [...chars(mant), 'ᴇ', ...chars(String(e))];
}
// decimal (not binary) rounding, half away from zero like the TI: 2.675 → 2.68, −2.5 → −3
function roundDec(x, n) {
  const f = 10 ** n, y = Math.round(+(Math.abs(x) * f).toPrecision(15));
  return (x < 0 ? -y : y) / f || 0;
}
const exp10 = x => +x.toExponential().split('e')[1];
function roundSig(x, s) {
  if (!x || !Number.isFinite(x)) return x;
  const p = s - 1 - exp10(x);
  return p >= 0 ? roundDec(x, p) : roundDec(x / 10 ** -p, 0) * 10 ** -p;
}
function fmtReal(x) {
  if (S.mode.base !== 'DEC') return baseRow(x, S.mode.base);
  if (x === 0 || Object.is(x, -0)) return ['0'];
  const m = S.mode, fix = m.fix;
  x = roundSig(x, 10); // to the 10 shown digits first, so 9999999999.5 → 1×10¹⁰
  const ax = Math.abs(x);
  const sci = m.note !== 'NORM' || ax >= 1e10 || (fix < 0 && ax < 1e-3);
  if (!sci) {
    const s = fix >= 0 ? roundDec(x, fix).toFixed(fix) : ax >= 1 ? trimZ(x.toPrecision(10)) : trimZ(roundDec(x, 10).toFixed(10));
    if (/^-?0(\.0*)?$/.test(s) && fix < 0) return ['0'];
    return chars(s);
  }
  if (m.note === 'ENG') {
    let e3 = Math.floor(exp10(x) / 3) * 3, d = fix >= 0 ? fix : 9 - (exp10(x) - e3);
    let mv = roundDec(x / 10 ** e3, d);
    if (Math.abs(mv) >= 1000) { e3 += 3; d = fix >= 0 ? fix : 9; mv = roundDec(x / 10 ** e3, d); }
    const ms = mv.toFixed(d);
    return sciRow(fix >= 0 ? ms : trimZ(ms), e3);
  }
  if (fix >= 0) x = roundSig(x, fix + 1);
  const [mant, e] = x.toExponential(fix >= 0 ? fix : 9).split('e');
  return sciRow(fix >= 0 ? mant : trimZ(mant), +e);
}
function baseRow(x, base) {
  if (!isN(x)) err('Invalid data type');
  let v = Math.trunc(x); const r = RADIX[base];
  if (base !== 'DEC' && v < 0) v = v >>> 0;
  return chars(v.toString(r).toUpperCase() + { HEX: 'h', BIN: 'b', OCT: 'o', DEC: 'd' }[base]);
}
const digits = n => chars(String(n));
function sqfree(n) { let k = 1, m = n; for (let f = 2; f * f <= m; f++) while (m % (f * f) === 0) { m /= f * f; k *= f; } return [k, m]; }
function fracRow(num, q, sign) { // num: row, q: int
  const r = q === 1 ? num : [{ t: 'frac', a: num, b: digits(q) }];
  return sign ? ['‾', ...r] : r;
}
function exactRow(x, fl) {
  if (!isN(x) || !Number.isFinite(x) || x === 0) return null;
  const ax = Math.abs(x), sg = x < 0;
  if (ax >= 1e10 || Math.abs(ax - Math.round(ax)) <= 1e-12 * ax) return null; // integers print plainly
  const r = rat(ax, 9999);
  if (r && r[0] < 1e10) return S.mode.mp ? fracRow(digits(r[0]), r[1], sg) : [...(sg ? ['‾'] : []), ...digits(r[0]), '⁄', ...digits(r[1])];
  if (!S.mode.mp) return null;
  if (fl.pi || (fl.invtrig && S.mode.angle === 'RAD')) {
    const q = rat(ax / Math.PI, 1000);
    if (q && q[0] < 1e6) return fracRow([...(q[0] > 1 ? digits(q[0]) : []), 'π'], q[1], sg);
  }
  if (fl.root) {
    const q = rat(ax * ax, 9999);
    if (q && q[0] * q[1] < 1e9) {
      const [k, m] = sqfree(q[0] * q[1]);
      if (m > 1) {
        const g = gcd2(k, q[1]), kk = k / g, qq = q[1] / g;
        return fracRow([...(kk > 1 ? digits(kk) : []), { t: 'sqrt', a: digits(m) }], qq, sg);
      }
    }
  }
  return null;
}
function fmtVal(v, fl, exact) {
  const one = x => (exact && exactRow(x, fl)) || fmtReal(x);
  if (isN(v)) return one(v);
  if (isC(v)) {
    if ((S.mode.cplx === 'r∠θ' && fl.hint !== '►a+bi') || fl.hint === '►r∠θ') {
      const r = Math.hypot(v.re, v.im), th = fromRad(Math.atan2(v.im, v.re));
      return [...one(r), '∠', ...one(th)];
    }
    const out = v.re !== 0 ? one(v.re) : [];
    const ai = Math.abs(v.im), ir = one(ai), im = ir.length === 1 && ir[0] === '1' ? [] : ir; // 1.0000000001i shows as i
    if (v.re !== 0 || v.im < 0) out.push(v.im < 0 ? (v.re !== 0 ? '−' : '‾') : '+');
    return [...out, ...im, 'i'];
  }
  if (isM(v)) return [{ t: 'mat', rows: v.mat.map(r => r.map(x => fmtVal(x, fl, exact))) }];
  if (isV(v)) return [{ t: 'vec', items: v.vec.map(x => fmtVal(x, fl, exact)) }];
  err('Invalid data type');
}
function dmsRow(x) {
  x = real(x); const sg = x < 0; x = Math.abs(x);
  let d = Math.floor(x), m = Math.floor((x - d) * 60), s = +(((x - d) * 60 - m) * 60).toPrecision(10);
  if (s >= 60) { s -= 60; m++; } if (m >= 60) { m -= 60; d++; }
  return [...(sg ? ['‾'] : []), ...digits(d), '°', ...digits(m), '′', ...fmtReal(+s.toFixed(6)), '″'];
}
function pfactorRow(x) {
  x = real(x);
  if (!Number.isInteger(x) || x < 2 || x > 1e12) err('Domain');
  const out = []; let n = x;
  const push = (f, k) => { if (out.length) out.push('×'); out.push(...digits(f)); if (k > 1) out.push({ t: 'pow', a: digits(k) }); };
  for (let f = 2; f * f <= n; f++) { let k = 0; while (n % f === 0) { n /= f; k++; } if (k) push(f, k); }
  if (n > 1) push(n, 1);
  return out;
}
function mixedRow(x) {
  const r = isN(x) && rat(Math.abs(x), 9999);
  if (!r || r[1] === 1 || r[0] < r[1]) return null;
  const u = Math.floor(r[0] / r[1]), a = r[0] - u * r[1];
  const row = [{ t: 'mixed', u: digits(u), a: digits(a), b: digits(r[1]) }];
  if (!S.mode.mp) return [...(x < 0 ? ['‾'] : []), ...digits(u), '⌟', ...digits(a), '⁄', ...digits(r[1])];
  return x < 0 ? ['‾', ...row] : row;
}
/* result → {exact,dec} display rows; exact may be null */
function formatResult(v, flags) {
  const h = flags.hint;
  if (h === '►DMS') return { exact: null, dec: dmsRow(v) };
  if (h === '►Pfactor') return { exact: null, dec: pfactorRow(v) };
  if (h && /►(Hex|Bin|Oct|Dec)/.test(h)) return { exact: null, dec: baseRow(real(v), h.slice(1).toUpperCase()) };
  const modeOK = S.mode.note === 'NORM' && S.mode.fix < 0 && S.mode.base === 'DEC', allowExact = !flags.dec && modeOK;
  if (h === '►n/d◄►Un/d') { const m = mixedRow(v); if (m) return { exact: m, dec: fmtVal(v, flags, false) }; }
  const dec = fmtVal(v, flags, false);
  let exact = allowExact ? fmtVal(v, flags, true) : null;
  if (exact && JSON.stringify(exact) === JSON.stringify(dec)) exact = null;
  if (h === '►F◄►D') { // flip whatever would be shown by default
    if (exact) return { exact: null, dec };
    const fr = fmtVal(v, Object.assign({}, flags, { dec: false }), true);
    return { exact: JSON.stringify(fr) === JSON.stringify(dec) ? null : fr, dec };
  }
  if (!exact && flags.dec && !h && modeOK) { // decimal-first result (0.75): ◂▸≈ may still show 3/4
    const fr = fmtVal(v, Object.assign({}, flags, { dec: false }), true);
    if (JSON.stringify(fr) !== JSON.stringify(dec)) return { exact: null, dec, alt: fr };
  }
  return { exact, dec };
}

/* number → editable token row at full precision (for regression equations etc.) */
function numTok(v) {
  if (Object.is(v, -0)) v = 0;
  let s = trimZ(Math.abs(v) >= 1e10 || (Math.abs(v) < 1e-4 && v !== 0) ? '' : v.toPrecision(12));
  if (!s || s.includes('e')) { let [m, e] = v.toExponential(11).split('e'); s = trimZ(m) + 'ᴇ' + (+e); }
  return chars(s);
}
function termRow(row, v, suffix, first) {
  if (!first) row.push(v < 0 ? '−' : '+');
  row.push(...numTok(first ? v : Math.abs(v)), ...suffix);
  return row;
}

/* ---------- statistics ---------- */
function getData(li, fi) {
  const xs = S.lists[li]; if (!xs || !xs.length) err('Statistics');
  let fs = fi >= 0 ? S.lists[fi] : xs.map(() => 1);
  if (fs.length !== xs.length) err('Dimension mismatch');
  if (fs.some(f => f < 0)) err('Frequency: Enter FREQ≥0');
  return { xs, fs };
}
function oneVar(xs, fs) {
  const n = fs.reduce((s, f) => s + f, 0); if (n <= 0) err('Statistics');
  const sx = xs.reduce((s, x, i) => s + fs[i] * x, 0), sxx = xs.reduce((s, x, i) => s + fs[i] * x * x, 0);
  const mean = sx / n, ss = xs.reduce((s, x, i) => s + fs[i] * (x - mean) ** 2, 0);
  const V = { n, 'x̄': mean, Sx: n > 1 && fs.every(Number.isInteger) ? Math.sqrt(ss / (n - 1)) : undefined, 'σx': Math.sqrt(ss / n), 'Σx': sx, 'Σx²': sxx };
  const live = xs.filter((_, i) => fs[i] > 0);
  V.minX = Math.min(...live); V.maxX = Math.max(...live);
  // weighted quartiles; for integer frequencies identical to expanding the list (guide: only Sx fails for non-integer)
  const p = xs.map((x, i) => [x, fs[i]]).filter(q => q[1] > 0).sort((u, v) => u[0] - v[0]);
  const h = Number.isInteger(n) ? Math.floor(n / 2) : n / 2;
  V.Med = wMedian(p);
  V.Q1 = h > 0 ? wMedian(wPart(p, h)) : p[0][0]; V.Q3 = h > 0 ? wMedian(wPart(p, h, true)) : p[0][0];
  return V;
}
function wMedian(p) { // p: sorted [x, weight] pairs
  const W = p.reduce((s, q) => s + q[1], 0); let c = 0;
  for (let i = 0; i < p.length; i++) {
    c += p[i][1];
    if (Math.abs(c - W / 2) <= 1e-12 * W) return i + 1 < p.length ? (p[i][0] + p[i + 1][0]) / 2 : p[i][0];
    if (c > W / 2) return p[i][0];
  }
  return p[p.length - 1][0];
}
function wPart(p, h, top) { // the lowest (or highest) total weight h of sorted pairs
  const src = top ? [...p].reverse() : p, out = []; let c = 0;
  for (const [x, w] of src) { if (c >= h) break; const t = Math.min(w, h - c); out.push([x, t]); c += t; }
  return top ? out.reverse() : out;
}
function linFit(X, Y, W) { // weighted least squares y = a x + b, plus r
  const n = W.reduce((s, w) => s + w, 0);
  const mx = X.reduce((s, x, i) => s + W[i] * x, 0) / n, my = Y.reduce((s, y, i) => s + W[i] * y, 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  X.forEach((x, i) => { sxx += W[i] * (x - mx) ** 2; syy += W[i] * (Y[i] - my) ** 2; sxy += W[i] * (x - mx) * (Y[i] - my); });
  if (sxx === 0) err('Statistics');
  const a = sxy / sxx, b = my - a * mx, r = syy === 0 ? 1 : sxy / Math.sqrt(sxx * syy);
  return { a, b, r };
}
function polyFit(X, Y, W, deg) {
  const k = deg + 1, A = Array.from({ length: k }, () => Array(k + 1).fill(0));
  X.forEach((x, i) => {
    for (let r = 0; r < k; r++) { for (let c = 0; c < k; c++) A[r][c] += W[i] * x ** (2 * deg - r - c); A[r][k] += W[i] * Y[i] * x ** (deg - r); }
  });
  if (Math.abs(det({ mat: A.map(r => r.slice(0, k)) })) < 1e-300) err('Statistics');
  const sol = rowEchelon(A, true).map(r => r[k]);
  const n = W.reduce((s, w) => s + w, 0), my = Y.reduce((s, y, i) => s + W[i] * y, 0) / n;
  let res = 0, tot = 0;
  X.forEach((x, i) => { const yh = sol.reduce((s, c, j) => s + c * x ** (deg - j), 0); res += W[i] * (Y[i] - yh) ** 2; tot += W[i] * (Y[i] - my) ** 2; });
  return { coef: sol, R2: tot === 0 ? 1 : 1 - res / tot };
}
const REGS = ['LinReg ax+b', 'PropReg ax', 'RecipReg a/x+b', 'QuadraticReg', 'CubicReg', 'LnReg a+blnx', 'PwrReg ax^b', 'ExpReg ab^x', 'expReg ae^(bx)'];
function runStats(kind, xi, yi, fi) {
  const { xs, fs } = getData(xi, fi);
  if (kind === '1-Var') { const V = oneVar(xs, fs); S.stat = { title: '1-Var:L' + (xi + 1), vals: V, order: ['n', 'x̄', 'Sx', 'σx', 'Σx', 'Σx²', 'minX', 'Q1', 'Med', 'Q3', 'maxX'] }; return S.stat; }
  const ys = S.lists[yi]; if (!ys || ys.length !== xs.length) err('Dimension mismatch');
  const V1 = oneVar(xs, fs), V2 = oneVar(ys, fs);
  const V = { n: V1.n, 'x̄': V1['x̄'], Sx: V1.Sx, 'σx': V1['σx'], 'ȳ': V2['x̄'], Sy: V2.Sx, 'σy': V2['σx'], 'Σx': V1['Σx'], 'Σx²': V1['Σx²'], 'Σy': V2['Σx'], 'Σy²': V2['Σx²'],
    'Σxy': xs.reduce((s, x, i) => s + fs[i] * x * ys[i], 0), minX: V1.minX, maxX: V1.maxX, minY: V2.minX, maxY: V2.maxX };
  let order = ['n', 'x̄', 'Sx', 'σx', 'ȳ', 'Sy', 'σy', 'Σx', 'Σx²', 'Σy', 'Σy²', 'Σxy'], eq = null, title = kind;
  const W = fs, safeLog = arr => arr.map(v => { if (v <= 0) err('Domain'); return Math.log(v); });
  const linStore = (fit, eqf) => { Object.assign(V, { a: fit.a, b: fit.b, 'r²': fit.r * fit.r, r: fit.r }); order.push('a', 'b', 'r²', 'r'); eq = eqf; };
  switch (kind) {
    case '2-Var': case 'LinReg ax+b': { const f = linFit(xs, ys, W); linStore(f, () => termRow(termRow([], f.a, ['x'], true), f.b, [])); break; }
    case 'PropReg ax': {
      const sxx = xs.reduce((s, x, i) => s + W[i] * x * x, 0); if (sxx === 0) err('Statistics');
      V.a = V['Σxy'] / sxx; order.push('a'); eq = () => termRow([], V.a, ['x'], true); break;
    }
    case 'RecipReg a/x+b': { const f = linFit(xs.map(x => { if (x === 0) err('Domain'); return 1 / x; }), ys, W); linStore(f, () => termRow(termRow([], f.a, ['÷', 'x'], true), f.b, [])); break; }
    case 'QuadraticReg': case 'CubicReg': {
      const deg = kind === 'QuadraticReg' ? 2 : 3; if (xs.length < deg + 1) err('Statistics');
      const f = polyFit(xs, ys, W, deg), names = ['a', 'b', 'c', 'd'];
      f.coef.forEach((c, i) => { V[names[i]] = c; order.push(names[i]); }); V['R²'] = f.R2; order.push('R²');
      eq = () => f.coef.reduce((row, c, i) => termRow(row, c, deg - i === 0 ? [] : deg - i === 1 ? ['x'] : ['x', { t: 'pow', a: digits(deg - i) }], i === 0), []);
      break;
    }
    case 'LnReg a+blnx': { const f = linFit(safeLog(xs), ys, W); Object.assign(V, { a: f.b, b: f.a, 'r²': f.r * f.r, r: f.r }); order.push('a', 'b', 'r²', 'r'); eq = () => termRow(termRow([], f.b, [], true), f.a, ['ln(', 'x', ')']); break; }
    case 'PwrReg ax^b': { const f = linFit(safeLog(xs), safeLog(ys), W); const a = Math.exp(f.b); Object.assign(V, { a, b: f.a, 'r²': f.r * f.r, r: f.r }); order.push('a', 'b', 'r²', 'r'); eq = () => [...numTok(a), 'x', { t: 'pow', a: numTok(f.a) }]; break; }
    case 'ExpReg ab^x': { const f = linFit(xs, safeLog(ys), W); const a = Math.exp(f.b), b = Math.exp(f.a); Object.assign(V, { a, b, 'r²': f.r * f.r, r: f.r }); order.push('a', 'b', 'r²', 'r'); eq = () => [...numTok(a), '×', ...numTok(b), { t: 'pow', a: ['x'] }]; break; }
    case 'expReg ae^(bx)': { const f = linFit(xs, safeLog(ys), W); const a = Math.exp(f.b); Object.assign(V, { a, b: f.a, 'r²': f.r * f.r, r: f.r }); order.push('a', 'b', 'r²', 'r'); eq = () => [...numTok(a), { t: 'exp', a: [...numTok(f.a), 'x'] }]; break; }
    default: err('Statistics');
  }
  if (kind === '2-Var' || kind === 'LinReg ax+b') order.push("x'(", "y'(");
  order.push('minX', 'maxX', 'minY', 'maxY');
  S.stat = { title, vals: V, order, eq: eq && eq() };
  return S.stat;
}

/* ---------- distributions ---------- */
function erfc(x) {
  if (x < 0) return 2 - erfc(-x);
  if (x < 2) {
    let term = x, s = x; for (let n = 1; n < 200 && term > 1e-17 * s; n++) { term *= 2 * x * x / (2 * n + 1); s += term; }
    return 1 - 2 / Math.sqrt(Math.PI) * Math.exp(-x * x) * s;
  }
  let f = x; for (let k = 80; k >= 1; k--) f = x + (k / 2) / f;
  return Math.exp(-x * x) / (Math.sqrt(Math.PI) * f);
}
const Q = z => 0.5 * erfc(z / Math.SQRT2); // upper tail
function normalpdf(x, mu, s) { if (s <= 0) err('Enter sigma>0'); const z = (x - mu) / s; return Math.exp(-z * z / 2) / (s * Math.sqrt(2 * Math.PI)); }
function normalcdf(lo, hi, mu, s) {
  if (s <= 0) err('Enter sigma>0'); if (lo > hi) err('Bounds: Enter LOWER≤UPPER');
  const a = (lo - mu) / s, b = (hi - mu) / s;
  if (a >= 0) return Q(a) - Q(b);
  if (b <= 0) return Q(-b) - Q(-a);
  return 1 - Q(b) - Q(-a);
}
function invNormal(p, mu, s) {
  if (s <= 0) err('Enter sigma>0'); if (!(p > 0 && p < 1)) err('Enter 0<area<1');
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  let x;
  const tail = q => (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  if (p < 0.02425) x = tail(Math.sqrt(-2 * Math.log(p)));
  else if (p > 1 - 0.02425) x = -tail(Math.sqrt(-2 * Math.log(1 - p)));
  else { const q = p - 0.5, r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  for (let i = 0; i < 2; i++) { const e = (x < 0 ? Q(-x) : 1 - Q(x)) - p, u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2); x -= u / (1 + x * u / 2); }
  return mu + s * x;
}
function binompdf(n, p, x) {
  if (!Number.isInteger(n) || n < 0) err('Input must be non-negative Integer.');
  if (!(p >= 0 && p <= 1)) err('Probability: Enter 0≤p≤1');
  if (!Number.isInteger(x) || x < 0) err('Input must be non-negative Integer.');
  if (x > n) return 0;
  if (p === 0) return x === 0 ? 1 : 0; if (p === 1) return x === n ? 1 : 0;
  let l = x * Math.log(p) + (n - x) * Math.log1p(-p);
  for (let i = 1; i <= x; i++) l += Math.log((n - x + i) / i);
  return Math.exp(l);
}
function binomcdf(n, p, x) { binompdf(n, p, x); /* validates n, p, x */ let s = 0; for (let k = 0; k <= Math.min(x, n); k++) s += binompdf(n, p, k); return Math.min(1, s); }
function poisspdf(mu, x) {
  if (!(mu > 0)) err('Mean: Enter mu>0'); if (!Number.isInteger(x) || x < 0) err('Input must be non-negative Integer.');
  let l = -mu + x * Math.log(mu); for (let i = 2; i <= x; i++) l -= Math.log(i);
  return Math.exp(l);
}
function poisscdf(mu, x) { poisspdf(mu, x); let s = 0; for (let k = 0; k <= x; k++) s += poisspdf(mu, k); return Math.min(1, s); }

/* ---------- solvers ---------- */
function quadExact(a, b, c) { // integer coefficients → exact rows for (-b ± √D)/(2a), or null
  if (![a, b, c].every(Number.isInteger) || !S.mode.mp) return null;
  const D = b * b - 4 * a * c, [k, m] = sqfree(Math.abs(D));
  if (D >= 0 && m <= 1) return null; // rational roots (incl. double root, D=0) → normal formatting
  let P = -b, K = k, Qd = 2 * a;
  const g = gcd2(gcd2(P, K), Qd); P /= g; K /= g; Qd /= g;
  if (Qd < 0) { P = -P; Qd = -Qd; }
  const rad = [...(K > 1 ? digits(K) : []), { t: 'sqrt', a: digits(m) }];
  const mk = sgn => {
    if (D < 0) { // complex: P/Qd ± (K√m/Qd)i, each part reduced on its own
      const g1 = gcd2(Math.abs(P), Qd), p1 = Math.abs(P) / g1, q1 = Qd / g1, g2 = gcd2(K, Qd), k2 = K / g2, q2 = Qd / g2;
      const re = P === 0 ? [] : [...(P < 0 ? ['‾'] : []), ...(q1 === 1 ? digits(p1) : [{ t: 'frac', a: digits(p1), b: digits(q1) }]), sgn > 0 ? '+' : '−'];
      const num = m === 1 ? digits(k2) : [...(k2 > 1 ? digits(k2) : []), { t: 'sqrt', a: digits(m) }];
      const imPart = q2 === 1 ? (m === 1 && k2 === 1 ? [] : num) : [{ t: 'frac', a: num, b: digits(q2) }];
      return [...(P === 0 && sgn < 0 ? ['‾'] : []), ...re, ...imPart, 'i'];
    }
    const num = P === 0 ? (sgn < 0 ? ['‾', ...rad] : rad) : [...(P < 0 ? ['‾'] : []), ...digits(Math.abs(P)), sgn > 0 ? '+' : '−', ...rad];
    return Qd === 1 ? num : [{ t: 'frac', a: num, b: digits(Qd) }];
  };
  return [mk(1), mk(-1)];
}
function quadRoots(a, b, c) {
  const D = b * b - 4 * a * c;
  if (D >= 0) {
    const q = -(b + (b >= 0 ? 1 : -1) * Math.sqrt(D)) / 2;
    let x1 = q / a, x2 = q === 0 ? 0 : c / q;
    if (x1 < x2) [x1, x2] = [x2, x1];
    return [x1, x2];
  }
  const re = -b / (2 * a), im = Math.sqrt(-D) / (2 * Math.abs(a));
  return [cx(re, im), cx(re, -im)];
}
function polySolve(co) { // co: [a,b,c] or [a,b,c,d]
  co = co.map(real);
  if (co[0] === 0) err('Highest degree coefficient cannot be zero.');
  if (co.length === 3) return { roots: quadRoots(...co), exact: quadExact(...co) };
  const [a, b, c, d] = co, f = x => ((a * x + b) * x + c) * x + d;
  // repeated roots (discriminant 0) in closed form: bisection is inexact there, e.g. (x−1)³ gave 1.000001271
  const T = [18 * a * b * c * d, -4 * b ** 3 * d, b * b * c * c, -4 * a * c ** 3, -27 * a * a * d * d];
  const D = T.reduce((s, t) => s + t, 0), D0 = b * b - 3 * a * c;
  if (Math.abs(D) <= 1e-12 * Math.max(...T.map(Math.abs))) {
    if (Math.abs(D0) <= 1e-12 * Math.max(b * b, Math.abs(3 * a * c))) { const r = -b / (3 * a) || 0; return { roots: [r, r, r], exact: null }; }
    const r2 = (9 * a * d - b * c) / (2 * D0) || 0, r1 = (4 * a * b * c - 9 * a * a * d - b ** 3) / (a * D0) || 0;
    return { roots: [r1, r2, r2].sort((x, y) => y - x), exact: null };
  }
  const M = 1 + Math.max(Math.abs(b / a), Math.abs(c / a), Math.abs(d / a));
  let lo = -M, hi = M; if (f(lo) > 0) [lo, hi] = [hi, lo];
  for (let i = 0; i < 300; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
  let r = (lo + hi) / 2;
  const nr = r - f(r) / ((3 * a * r + 2 * b) * r + c); if (Number.isFinite(nr) && Math.abs(f(nr)) < Math.abs(f(r))) r = nr;
  const rr = rat(Math.abs(r), 9999); if (rr && Math.abs(f(Math.sign(r) * rr[0] / rr[1])) <= Math.abs(f(r))) r = Math.sign(r) * rr[0] / rr[1];
  if (d === 0) r = 0; // x is a factor: deflate exactly (x³−2x showed a root of -0)
  const qb = b + a * r, qc = c + qb * r, rest = quadRoots(a, qb, qc);
  const all = [r, ...rest];
  const reals = all.filter(isN).sort((x, y) => y - x), cplx = all.filter(isC);
  return { roots: [...reals, ...cplx], exact: null };
}
function sysSolve(A) { // A: n rows of n+1 numbers
  const n = A.length, M = A.map(r => r.map(real));
  const sc = Math.max(...M.flat().map(Math.abs));
  const rank = m => rowEchelon(m, false).filter(r => r.some(x => Math.abs(x) > 1e-10 * sc)).length;
  const rA = rank(M.map(r => r.slice(0, n))), rAug = rank(M);
  if (rA < n) return { none: rAug > rA, inf: rAug === rA };
  return { x: rowEchelon(M, true).map(r => r[n]) };
}
function numSolve(f, guess, lo, hi) { // f: x → real
  const g = x => { try { const v = f(x); return Number.isFinite(v) ? v : NaN; } catch (e) { return NaN; } };
  const brent = (a, b, fa, fb) => { // bisection; null when the sign change was a pole, not a root
    const lim = Math.max(Math.abs(fa), Math.abs(fb));
    for (let i = 0; i < 200; i++) {
      const m = (a + b) / 2, fm = g(m);
      if (fm === 0 || Math.abs(b - a) <= 1e-15 * Math.max(1, Math.abs(m))) return Math.abs(fm) <= lim ? m : null;
      if (Number.isNaN(fm)) return null;
      if (Math.sign(fm) === Math.sign(fa)) { a = m; fa = fm; } else { b = m; fb = fm; }
    }
    const m = (a + b) / 2; return Math.abs(g(m)) <= lim ? m : null;
  };
  let pole = false;
  guess = Math.min(Math.max(guess, lo), hi);
  const f0 = g(guess); if (f0 === 0) return guess;
  // Newton/secant first (converges for repeated roots too)
  let x = guess, h = 1e-6 * Math.max(1, Math.abs(guess));
  for (let i = 0; i < 100; i++) {
    const fx = g(x); if (Number.isNaN(fx)) break; if (fx === 0) return x;
    const d = (g(x + h) - g(x - h)) / (2 * h); if (!d || Number.isNaN(d)) break;
    const nx = x - fx / d; if (!Number.isFinite(nx) || nx < lo || nx > hi) break;
    if (Math.abs(nx - x) <= 1e-14 * Math.max(1, Math.abs(x))) { if (Math.abs(g(nx)) < 1e-9 * Math.max(1, Math.abs(f0))) return nx; break; }
    x = nx;
  }
  // expanding bracket search around guess
  for (let step = 1e-3 * Math.max(1, Math.abs(guess)), k = 0; k < 120; k++, step *= 1.6) {
    for (const s of [1, -1]) {
      const xb = guess + s * step; if (xb < lo || xb > hi) continue;
      const fb = g(xb), xa = guess + s * step / 1.6 * (k > 0), fa = k > 0 ? g(xa) : f0;
      if (!Number.isNaN(fa) && !Number.isNaN(fb) && Math.sign(fa) !== Math.sign(fb)) {
        const r = brent(xa, xb, fa, fb); if (r !== null) return r; pole = true;
      }
    }
  }
  err(pole ? 'Singularity' : 'No sign change found. Try new guess.');
}

G.E = {
  S, VARS, CalcError, err, compile, evaluate, formatResult, fmtReal, fmtVal, exactRow, numTok, real, isN, isC, isM, isV,
  CONST, CONV, REGS, runStats, normalpdf, normalcdf, invNormal, binompdf, binomcdf, poisspdf, poisscdf,
  polySolve, sysSolve, numSolve, withVar, rat, identity, digits
};
})(typeof window !== 'undefined' ? window : globalThis);
