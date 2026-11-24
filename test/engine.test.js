// Self-check for engine.js: node test/engine.test.js
require('../web/engine.js');
const assert = require('assert');
const E = globalThis.E;
const fr = (a, b) => ({ t: 'frac', a: [...a], b: [...b] });
const ev = row => E.evaluate(typeof row === 'string' ? [...row] : row).v;
const show = row => { const r = E.evaluate(typeof row === 'string' ? [...row] : row); const f = E.formatResult(r.v, r.flags); return txt(f.exact || f.dec); };
function txt(row) {
  return row.map(t => typeof t === 'string' ? (t === '‾' ? '-' : t) : t.t === 'frac' ? `(${txt(t.a)})/(${txt(t.b)})` : t.t === 'sqrt' ? `√(${txt(t.a)})` : t.t === 'pow' ? `^(${txt(t.a)})` : '?').join('');
}
const near = (a, b) => assert(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
let n = 0; const t = (name, f) => { f(); n++; };

t('arith', () => { near(ev('1+2×3'), 7); near(ev('6÷2(1+2)'), 9); near(ev(['‾', '3', '²']), -9); near(ev(['2', '^', '3', '^', '2']), 64); });
t('− key as sign', () => { // user report: 12×10^(−6)·1/80×357.5×80 gave Syntax
  near(ev(['1', '2', '×', '1', '0', { t: 'pow', a: ['−', '6'] }, fr('1', '80'), '×', '3', '5', '7', '.', '5', '×', '8', '0']), 0.00429);
  near(ev('5−−3'), 8); near(ev(['−', '2', '²']), -4); near(ev(['2', '^', '−', '1']), 0.5);
});
t('mathprint pow right assoc',() => near(ev(['2', { t: 'pow', a: ['3', { t: 'pow', a: ['2'] }] }]), 512));
t('fraction exact', () => assert.strictEqual(show([fr('3', '4'), '+', '1']), '(7)/(4)'));
t('decimal forces decimal', () => assert.strictEqual(show([fr('1.2', '1'), '+', '1']), '2.2'));
t('0.1+0.2', () => assert.strictEqual(show('0.1+0.2'), '0.3'));
t('sqrt exact', () => assert.strictEqual(show([{ t: 'sqrt', a: ['8'] }]), '2√(2)'));
t('sin30 = 1/2', () => assert.strictEqual(show(['sin(', '3', '0', ')']), '(1)/(2)'));
t('cos30 = √3/2', () => assert.strictEqual(show(['cos(', '3', '0', ')']), '(√(3))/(2)'));
t('sin180 = 0', () => assert.strictEqual(show(['sin(', '1', '8', '0', ')']), '0'));
t('tan90 domain', () => assert.throws(() => ev(['tan(', '9', '0', ')']), /Domain/));
t('pi form', () => assert.strictEqual(show(['2', 'π']), '2π'));
t('pi/6 in RAD from asin', () => { E.S.mode.angle = 'RAD'; assert.strictEqual(show(['sin⁻¹(', fr('1', '2'), ')']), '(π)/(6)'); E.S.mode.angle = 'DEG'; });
t('1/3 decimal', () => assert.strictEqual(txt(E.fmtReal(1 / 3)), '0.3333333333'));
t('big sci', () => assert.strictEqual(txt(E.fmtReal(123456789012)), '1.23456789×10^(11)'));
t('small sci', () => assert.strictEqual(txt(E.fmtReal(0.0001234)), '1.234×10^(-4)'));
t('EE input', () => near(ev(['2', 'ᴇ', '5']), 2e5));
t('nCr nPr fact', () => { near(ev(['5', '2', ' nCr ', '5']), 2598960); near(ev(['8', ' nPr ', '3']), 336); near(ev(['4', '!']), 24); });
t('log/ln', () => { near(ev(['l', 'o', 'g', '(', '1', ')'].slice(0, 0).concat(['log(', '1', '0', '0', '0', ')'])), 3); near(ev(['ln(', 'ℯ', ')']), 1); });
t('logbase exact int', () => assert.strictEqual(show([{ t: 'logb', n: ['2'], a: ['8'] }]), '3'));
t('cube root', () => { near(ev([{ t: 'root', n: ['3'], a: ['‾', '8'] }]), -2); near(ev([{ t: 'root', n: ['6'], a: ['6', '4'] }]), 2); });
t('store & vars', () => { ev(['1', '5', '→', 'x']); near(ev(['x', '²']), 225); near(ev(['2', 'x']), 30); });
t('ans', () => { E.S.ans = 3; near(ev(['ans', '+', '1']), 4); });
t('sum template (image example)', () => near(ev([fr('', '2')].map(() => ({ t: 'frac', a: [{ t: 'sum', v: ['x'], lo: ['1'], hi: ['1', '0'], a: ['2', 'x', '+', '1'] }], b: ['2'] }))), 60));
t('nDeriv TI style', () => near(ev([{ t: 'deriv', a: ['x', { t: 'pow', a: ['3'] }], p: ['1'] }]), 3.000001));
t('fnInt', () => { near(ev([{ t: 'int', lo: ['0'], hi: ['1'], a: ['x', '²'] }]), 1 / 3); near(ev([{ t: 'int', lo: ['0'], hi: ['1'], a: [{ t: 'frac', a: ['1'], b: [{ t: 'sqrt', a: ['x'] }] }] }]), 2); });
t('DMS', () => { near(ev(['1', '2', '°', '3', '1', '′', '4', '5', '″', '+', '2', '6', '°', '5', '4', '′', '3', '8', '″']), 39.43972222222); });
t('percent', () => near(ev(['5', '0', '%']), 0.5));
t('implicit mult paren', () => near(ev(['2', '(', '3', ')', '(', '4', ')']), 24));
t('negative base odd root', () => near(ev(['(', '‾', '8', ')', { t: 'pow', a: [fr('1', '3')] }]), -2));
t('sqrt negative real mode', () => assert.throws(() => ev([{ t: 'sqrt', a: ['‾', '4'] }]), /Domain/));
t('complex', () => { const v = ev(['(', '2', '+', '3', 'i', ')', '(', '1', '−', 'i', ')']); assert.deepStrictEqual(v, { re: 5, im: 1 }); assert.strictEqual(show(['(', '2', '+', '3', 'i', ')', '(', '1', '−', 'i', ')']), '5+i'); });
t('syntax', () => { assert.throws(() => ev(['+']), /Syntax/); assert.throws(() => ev(['1', '+']), /Syntax/); });
t('div by 0', () => assert.throws(() => ev(['1', '÷', '0']), /Division/));
t('auto close paren', () => near(ev(['sin(', '9', '0']), 1));
t('stats 1-var', () => { E.S.lists[0] = [45, 55, 55, 55]; const s = E.runStats('1-Var', 0, -1, -1); near(s.vals['x̄'], 52.5); near(s.vals.Sx, 5); });
t('linreg', () => { E.S.lists[0] = [1, 2, 3, 4, 5]; E.S.lists[1] = [5, 8, 11, 14, 17]; const s = E.runStats('LinReg ax+b', 0, 1, -1); near(s.vals.a, 3); near(s.vals.b, 2); near(s.vals.r, 1); });
t('quadreg', () => { E.S.lists[0] = [0, 1, 2, 3]; E.S.lists[1] = [1, 2, 5, 10]; const s = E.runStats('QuadraticReg', 0, 1, -1); near(s.vals.a, 1); near(s.vals.b, 0); near(s.vals.c, 1); });
t('normal', () => { near(E.normalcdf(-1, 1, 0, 1), 0.682689492137); near(E.invNormal(0.975, 0, 1), 1.959963984540); near(E.normalpdf(0, 0, 1), 0.398942280401); near(E.normalcdf(-1e99, 1.5, 0, 1), 0.933192798731); });
t('binomial', () => { near(E.binompdf(20, 0.6, 6), 38760 * 0.6 ** 6 * 0.4 ** 14); near(E.binomcdf(100, 0.5, 50), 0.539794618); near(E.poisscdf(3, 2), 0.42319008112684); });
t('poly quad exact', () => { const r = E.polySolve([1, -1, -1]); assert.strictEqual(txt(r.exact[0]), '(1+√(5))/(2)'); near(r.roots[0], 1.6180339887); });
t('poly quad complex', () => { const r = E.polySolve([1, 0, 1]); assert.strictEqual(txt(r.exact[0]), 'i'); assert.strictEqual(txt(r.exact[1]), '-i'); });
t('poly cubic', () => { const r = E.polySolve([1, -6, 11, -6]); near(r.roots[0], 3); near(r.roots[1], 2); near(r.roots[2], 1); });
t('sys', () => { const r = E.sysSolve([[1, 1, 3], [1, -1, 1]]); near(r.x[0], 2); near(r.x[1], 1); assert(E.sysSolve([[1, 1, 1], [2, 2, 3]]).none); assert(E.sysSolve([[1, 1, 1], [2, 2, 2]]).inf); });
t('numsolve', () => { near(E.numSolve(x => x * x - 2, 1, -1e99, 1e99), Math.SQRT2); near(E.numSolve(x => Math.cos(x) - x, 0, -1e99, 1e99), 0.7390851332); });
t('matrix', () => { E.S.mats.A = { mat: [[1, 2], [3, 4]] }; near(ev(['det(', '[A]', ')']), -2); const v = ev(['[A]', '⁻¹']); near(v.mat[0][0], -2); near(v.mat[1][1], -0.5); });
t('vectors', () => { E.S.vecs.u = { vec: [1, 0, 0] }; E.S.vecs.v = { vec: [0, 1, 0] }; assert.deepStrictEqual(ev(['CrossP(', '[u]', ',', '[v]', ')']).vec, [0, 0, 1]); near(ev(['norm(', '[u]', ')']), 1); });
t('►DMS', () => { const r = E.evaluate(['1', '.', '5', '►DMS']); assert.strictEqual(txt(E.formatResult(r.v, r.flags).dec), '1°30′0″'); });
t('mixed', () => { const r = E.evaluate([fr('9', '2'), '►n/d◄►Un/d']); assert.strictEqual(E.formatResult(r.v, r.flags).exact[0].t, 'mixed'); });
t('fix mode', () => { E.S.mode.fix = 2; assert.strictEqual(txt(E.fmtReal(2 / 3)), '0.67'); E.S.mode.fix = -1; });
t('hex', () => { E.S.mode.base = 'HEX'; near(ev(['F', 'F', '+', '1']), 256); assert.strictEqual(txt(E.fmtReal(256)), '100h'); E.S.mode.base = 'DEC'; });
t('conv', () => near(ev(['1', '2', 'in►cm']), 30.48));
// regressions from the full bug hunt
const toks = s => [...s].map(c => c === '-' ? '‾' : c);
t('∫ lower bound', () => {
  near(ev([{ t: 'int', lo: ['1'], hi: ['2'], a: ['x', '²'] }]), 7 / 3);
  near(ev(['fnInt(', 'x', ',', 'x', ',', '2', ',', '5', ')']), 10.5);
  near(ev([{ t: 'int', lo: ['1'], hi: ['2'], a: [fr('1', 'x')] }]), Math.LN2);
});
t('tiny values not 0', () => {
  assert.strictEqual(show(['1', 'ᴇ', '‾', '1', '3']), '1×10^(-13)');
  assert.strictEqual(show(toks('6ᴇ-34×3ᴇ8÷5ᴇ-7')), '3.6×10^(-19)');
});
t('float noise is 0', () => { assert.strictEqual(show('0.1+0.2−0.3'), '0'); assert.strictEqual(show('1.1×1.1−1.21'), '0'); assert.strictEqual(show(['2', 'sin(', '3', '0', ')', '−', '1']), '0'); });
const rnd = (a, d) => ev(['round(', ...toks(a), ',', d, ')']);
t('round half away', () => { near(rnd('-2.5', '0'), -3); near(rnd('-1.245', '2'), -1.25); near(rnd('2.675', '2'), 2.68); });
t('FIX decimal ties', () => { E.S.mode.fix = 2; assert.strictEqual(txt(E.fmtReal(2.675)), '2.68'); assert.strictEqual(txt(E.fmtReal(1.005)), '1.01'); E.S.mode.fix = -1; });
t('10-digit carry', () => assert.strictEqual(txt(E.fmtReal(9999999999.5)), '1×10^(10)'));
t('no fake fractions', () => {
  assert.strictEqual(show(['4', '0', 'sin(', '4', '6', ')']), '28.77359201');
  assert.strictEqual(show(['1', '2', { t: 'sqrt', a: ['5', '2'] }]), '24√(13)');
  assert.strictEqual(show(['1', '0', '0', '0', '0', 'π']), '10000π');
});
t('poly repeated roots', () => {
  assert.deepStrictEqual(E.polySolve([1, -3, 3, -1]).roots, [1, 1, 1]);
  assert.deepStrictEqual(E.polySolve([1, 0, -3, 2]).roots, [1, 1, -2]);
  const q = E.polySolve([1, 2, 1]); assert.strictEqual(q.exact, null); assert.deepStrictEqual(q.roots, [-1, -1]);
  assert(!E.polySolve([1, 0, -2, 0]).roots.some(r => Object.is(r, -0)));
});
t('poly complex reduced', () => { assert.strictEqual(txt(E.polySolve([4, 4, 5]).exact[0]), '-(1)/(2)+i'); assert.strictEqual(txt(E.polySolve([6, -4, 1]).exact[0]), '(1)/(3)+(√(2))/(6)i'); });
t('small-scale linear algebra', () => {
  const r = E.sysSolve([[1e-13, 2e-13, 3e-13], [3e-13, 4e-13, 5e-13]]); near(r.x[0], -1); near(r.x[1], 2);
  E.S.mats.B = { mat: [[1e-5, 0], [0, 1e-5]] }; near(ev(['[B]', '⁻¹']).mat[0][0], 1e5);
});
t('numsolve pole', () => {
  assert.throws(() => E.numSolve(x => 1 / x, 1, -1e99, 1e99), /Singularity/);
  near(E.numSolve(x => 1 / x - 2, -2, -1e99, 1e99), 0.5);
});
t('invNormal tail', () => near(E.invNormal(1e-10, 0, 1), -6.361340902404056));
t('cdf validation', () => { assert.throws(() => E.binomcdf(10, 0.5, -1)); assert.throws(() => E.poisscdf(-2, 1)); });
t('weighted quartiles', () => {
  E.S.lists[0] = [12, 13, 10, 11]; E.S.lists[1] = [1, 0.5, 1, 0.5]; const v = E.runStats('1-Var', 0, -1, 1).vals;
  assert.strictEqual(v.Sx, undefined); assert(Number.isFinite(v.Q1) && Number.isFinite(v.Med) && Number.isFinite(v.Q3));
  E.S.lists[0] = [1, 2, 3, 4, 5]; const w = E.runStats('1-Var', 0, -1, -1).vals; assert.deepStrictEqual([w.Q1, w.Med, w.Q3], [1.5, 3, 4.5]);
});
t('EE junk is Syntax', () => { assert.throws(() => ev(['2', 'ᴇ', '3', '.', '5']), /Syntax/); assert.throws(() => ev(toks('1.5ᴇ3ᴇ2')), /Syntax/); });
t('►a+bi in r∠θ mode', () => { E.S.mode.cplx = 'r∠θ'; const r = E.evaluate(['2', '∠', '3', '0', '►a+bi']); assert(/i$/.test(txt(E.formatResult(r.v, r.flags).dec))); E.S.mode.cplx = 'REAL'; });
t('decimal result toggles to fraction', () => { const r = E.evaluate(toks('0.75')); const o = E.formatResult(r.v, r.flags); assert.strictEqual(txt(o.dec), '0.75'); assert.strictEqual(txt(o.alt), '(3)/(4)'); });
console.log(`engine: ${n} checks passed`);
