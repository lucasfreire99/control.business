/* Mescla de alterações (3 vias) para quando duas pessoas salvam ao mesmo tempo.
   base   = última versão que este navegador sincronizou
   local  = o que este navegador tem agora
   theirs = a versão mais nova que está no servidor
   Regra: o que só um lado mudou é mantido; se os dois mudaram o mesmo item, vale o do servidor. */
const Merge = (() => {
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const byId = (arr) => { const m = {}; (arr || []).forEach((x) => { m[x.id] = x; }); return m; };

  // decide um item: devolve { value, conflict }
  function pick(b, l, t) {
    const lc = !eq(b, l), tc = !eq(b, t);
    if (!lc) return { value: t, conflict: false };
    if (!tc) return { value: l, conflict: false };
    return { value: eq(l, t) ? t : t, conflict: !eq(l, t) };
  }

  function merge3(base, local, theirs) {
    const out = clone(theirs);
    const conflicts = [];
    base = base || {};

    ['org'].forEach((k) => { if (!eq(local[k], base[k])) out[k] = local[k]; });

    ['empresas'].forEach((k) => {
      const bm = byId(base[k]), lm = byId(local[k]), tm = byId(theirs[k]);
      const order = (theirs[k] || []).map((x) => x.id);
      (local[k] || []).forEach((x) => { if (!tm[x.id] && !order.includes(x.id)) order.push(x.id); });
      const res = [];
      order.forEach((id) => {
        const r = pick(bm[id], lm[id], tm[id]);
        if (r.conflict) conflicts.push(k + ':' + id);
        if (r.value) res.push(clone(r.value));
      });
      out[k] = res;
    });

    const keys = new Set([...Object.keys(base.registros || {}), ...Object.keys(local.registros || {}), ...Object.keys(theirs.registros || {})]);
    out.registros = {};
    keys.forEach((k) => {
      const r = pick((base.registros || {})[k], (local.registros || {})[k], (theirs.registros || {})[k]);
      if (r.conflict) conflicts.push('registro:' + k);
      if (r.value) out.registros[k] = clone(r.value);
    });

    const seen = new Set((base.log || []).map((x) => x.t + '|' + x.m));
    const mine = (local.log || []).filter((x) => !seen.has(x.t + '|' + x.m));
    out.log = mine.concat(theirs.log || []).slice(0, 300);
    return { data: out, conflicts };
  }
  return { merge3, eq };
})();
if (typeof module !== 'undefined') module.exports = Merge;
