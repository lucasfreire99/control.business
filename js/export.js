/* Relatórios: montagem dos dados e exportação para Excel (.xlsx) com ExcelJS. */
const Reports = (() => {
  const S = Store;
  const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const groupName = (g) => S.GROUPS.find((x) => x.id === g).nome;
  const monthsOf = (ano) => Array.from({ length: 12 }, (_, i) => ano + '-' + String(i + 1).padStart(2, '0'));

  /* ================= dados (usados na prévia e no Excel) ================= */
  function pendencias(f) {
    const ym = f.ym || S.nowYm();
    const rows = S.pendencias(ym, f).map(({ e, d, comp }) => [e.nome, groupName(d.g), d.nome, S.fmtYm(comp)]);
    return {
      title: 'Pendências até ' + S.fmtYmLong(ym),
      sheets: [{ name: 'Pendências', cols: [{ label: 'Empresa', w: 34 }, { label: 'Grupo', w: 48 }, { label: 'Documento', w: 80 }, { label: 'Competência', w: 13, kind: 'center' }], rows }],
    };
  }

  function dados(f) {
    const to = f.to || S.nowYm();
    const rows = [];
    S.state().empresas.forEach((e) => {
      if (f.empId && e.id !== f.empId) return;
      const from = f.from && f.from > e.inicio ? f.from : e.inicio;
      if (from > to) return;
      S.monthsBetween(from, to).forEach((m) => S.DOCS.forEach((d) => {
        const r = S.getReg(e.id, d.id, m);
        rows.push([e.nome, e.cnpj || '', groupName(d.g), d.nome, S.fmtYm(m), S.statusOf(e, d, m), (r && r.obs) || '']);
      }));
    });
    return {
      title: 'Dados completos',
      sheets: [{
        name: 'Dados',
        cols: [{ label: 'Empresa', w: 32 }, { label: 'CNPJ', w: 20 }, { label: 'Grupo', w: 44 }, { label: 'Documento', w: 70 },
          { label: 'Competência', w: 13, kind: 'center' }, { label: 'Status', w: 12, kind: 'status' }, { label: 'Observação', w: 60 }],
        rows,
      }],
    };
  }

  function resumo(f) {
    const ano = Number(f.ano || new Date().getFullYear());
    const meses = monthsOf(ano);
    const mcols = MESES_CURTOS.map((m) => ({ label: m + '/' + String(ano).slice(2), w: 9, kind: 'pct' }));
    const rows = S.ativas().filter((e) => !f.empId || e.id === f.empId).map((e) => [e.nome, ...meses.map((m) => S.tally(S.statusesEmpresa(e, m)).pct)]);
    return { title: 'Resumo de conclusão em ' + ano, sheets: [{ name: 'Resumo', cols: [{ label: 'Empresa', w: 36 }, ...mcols], rows }] };
  }

  const build = { pendencias, dados, resumo };

  /* ================= Excel ================= */
  const FONT = 'Arial';
  const BLUE = 'FF2E75B6';
  const thin = { style: 'thin', color: { argb: 'FFA6A6A6' } };
  const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
  const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const utc = (d) => new Date(d + 'T00:00:00Z');

  function styleHeader(c) {
    c.font = { name: FONT, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = solid(BLUE); c.border = BORDER; c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  function styleTitle(ws, range, text) {
    ws.mergeCells(range); const c = ws.getCell(range.split(':')[0]);
    c.value = text; c.font = { name: FONT, size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = solid(BLUE); c.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(c.row).height = 30;
  }
  function body(c, o = {}) {
    c.font = { name: FONT, size: 10, bold: !!o.bold, color: o.color ? { argb: o.color } : undefined };
    c.border = BORDER; c.alignment = { horizontal: o.center ? 'center' : 'left', vertical: 'middle', wrapText: true };
  }
  function cfRule(text, bg, fg) {
    return { type: 'cellIs', operator: 'equal', formulae: ['"' + text + '"'], style: { font: { bold: true, color: { argb: fg } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: bg } } } };
  }
  function statusCF(ws, ref) {
    ws.addConditionalFormatting({
      ref, rules: [cfRule('OK', 'FFC6EFCE', 'FF006100'), cfRule('PENDENTE', 'FFFFC7CE', 'FF9C0006'), cfRule('N/A', 'FFD9D9D9', 'FF595959'), cfRule('-', 'FFF2F2F2', 'FF7F7F7F')],
    });
  }
  function pctCF(ws, ref) {
    const st = (bg, fg) => ({ font: { bold: true, color: { argb: fg } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: bg } } });
    ws.addConditionalFormatting({
      ref, rules: [
        { type: 'cellIs', operator: 'equal', formulae: ['1'], style: st('FFC6EFCE', 'FF006100') },
        { type: 'cellIs', operator: 'lessThan', formulae: ['0.7'], style: st('FFFFC7CE', 'FF9C0006') },
        { type: 'cellIs', operator: 'lessThan', formulae: ['1'], style: st('FFFFEB9C', 'FF9C5700') },
      ],
    });
  }
  const statusList = '"OK,PENDENTE,N/A"';
  function newBook() { const wb = new ExcelJS.Workbook(); wb.creator = S.state().org; wb.created = new Date(); return wb; }
  async function save(wb, name) {
    const buf = await wb.xlsx.writeBuffer();
    UI.download(name + '.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  const safe = (s) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();

  /* ---- planilha genérica de lista ---- */
  async function exportReport(rep, filename) {
    const wb = newBook();
    rep.sheets.forEach((sh) => {
      const ws = wb.addWorksheet(sh.name, { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
      const last = String.fromCharCode(64 + sh.cols.length > 90 ? 90 : 64 + sh.cols.length);
      sh.cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.w || 16; });
      styleTitle(ws, 'A1:' + last + '1', rep.title.toUpperCase());
      ws.mergeCells('A2:' + last + '2');
      ws.getCell('A2').value = S.state().org + ' · gerado em ' + S.fmtDate(S.today());
      ws.getCell('A2').font = { name: FONT, size: 9, color: { argb: 'FF595959' } };
      sh.cols.forEach((c, i) => styleHeader(ws.getCell(4, i + 1)));
      sh.cols.forEach((c, i) => { ws.getCell(4, i + 1).value = c.label; });
      ws.getRow(4).height = 28;
      sh.rows.forEach((r, ri) => {
        r.forEach((val, ci) => {
          const col = sh.cols[ci], c = ws.getCell(5 + ri, ci + 1);
          if (col.kind === 'date') { c.value = val ? utc(val) : null; c.numFmt = 'dd/mm/yyyy'; }
          else if (col.kind === 'pct') { c.value = val == null ? null : val; c.numFmt = '0%'; }
          else c.value = val === '' ? null : val;
          body(c, { center: ['center', 'status', 'date', 'num', 'pct', 'venc'].includes(col.kind), bold: col.kind === 'status' || col.kind === 'venc' });
        });
      });
      const n = sh.rows.length;
      if (n) {
        sh.cols.forEach((c, i) => {
          const L = ws.getColumn(i + 1).letter, ref = L + '5:' + L + (4 + n);
          if (c.kind === 'status') { statusCF(ws, ref); ws.dataValidations.add(ref, { type: 'list', allowBlank: true, formulae: [statusList] }); }
          if (c.kind === 'pct') pctCF(ws, ref);
          if (c.kind === 'venc') ws.addConditionalFormatting({ ref, rules: [cfRule('VENCIDO', 'FFFFC7CE', 'FF9C0006'), cfRule('A VENCER', 'FFFFEB9C', 'FF9C5700')] });
        });
        ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + n, column: sh.cols.length } };
      } else {
        ws.mergeCells('A5:' + last + '5'); ws.getCell('A5').value = 'Nenhum registro para os filtros escolhidos.';
        ws.getCell('A5').font = { name: FONT, size: 10, italic: true };
      }
    });
    await save(wb, filename);
  }

  /* ---- conferência do mês: empresas nas linhas, documentos nas colunas ---- */
  async function conferencia(ym) {
    const wb = newBook();
    const nd = S.DOCS.length, lastCol = 2 + nd + 3;
    const ws = wb.addWorksheet('Conferência', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4, showGridLines: false }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.getColumn(1).width = 34; ws.getColumn(2).width = 19;
    for (let i = 0; i < nd; i++) ws.getColumn(3 + i).width = 13;
    [9, 11, 11].forEach((w, i) => { ws.getColumn(3 + nd + i).width = w; });
    const lastL = ws.getColumn(lastCol).letter;
    styleTitle(ws, 'A1:' + lastL + '1', 'CONFERÊNCIA DE DOCUMENTAÇÃO – ' + S.fmtYmLong(ym).toUpperCase());
    ws.mergeCells('A2:' + lastL + '2'); ws.getCell('A2').value = S.state().org + ' · gerado em ' + S.fmtDate(S.today());
    ws.getCell('A2').font = { name: FONT, size: 9, color: { argb: 'FF595959' } };
    ['EMPRESA', 'CNPJ', ...S.DOCS.map((d) => d.curto.toUpperCase()), 'OK', 'PENDENTES', '% CONCLUÍDO'].forEach((t, i) => { const c = ws.getCell(4, i + 1); c.value = t; styleHeader(c); });
    ws.getRow(4).height = 42;
    const list = S.ativas().filter((e) => e.inicio <= ym);
    const a = ws.getColumn(3).letter, b = ws.getColumn(2 + nd).letter;
    list.forEach((e, ri) => {
      const r = 5 + ri; const sts = S.statusesEmpresa(e, ym); const t = S.tally(sts);
      const c1 = ws.getCell(r, 1); c1.value = e.nome; body(c1, { bold: true });
      const c2 = ws.getCell(r, 2); c2.value = e.cnpj || null; body(c2, { center: true });
      sts.forEach((st, i) => { const c = ws.getCell(r, 3 + i); c.value = st === '' ? null : st; body(c, { center: true, bold: true }); });
      const rng = a + r + ':' + b + r;
      const cok = ws.getCell(r, 3 + nd); cok.value = { formula: 'COUNTIF(' + rng + ',"OK")', result: t.ok }; body(cok, { center: true });
      const cpe = ws.getCell(r, 4 + nd); cpe.value = { formula: 'COUNTIF(' + rng + ',"PENDENTE")', result: t.pend }; body(cpe, { center: true, bold: true });
      const cpc = ws.getCell(r, 5 + nd); cpc.value = { formula: 'IF(' + ws.getColumn(3 + nd).letter + r + '+' + ws.getColumn(4 + nd).letter + r + '=0,"",' + ws.getColumn(3 + nd).letter + r + '/(' + ws.getColumn(3 + nd).letter + r + '+' + ws.getColumn(4 + nd).letter + r + '))', result: t.pct == null ? '' : t.pct };
      cpc.numFmt = '0%'; body(cpc, { center: true, bold: true });
      ws.getRow(r).height = 20;
    });
    const n = list.length;
    let r = 5 + n + 1;
    if (n) {
      const ref = a + '5:' + b + (4 + n);
      statusCF(ws, ref); ws.dataValidations.add(ref, { type: 'list', allowBlank: true, formulae: [statusList] });
      pctCF(ws, ws.getColumn(5 + nd).letter + '5:' + ws.getColumn(5 + nd).letter + (4 + n));
    } else {
      ws.mergeCells('A5:' + lastL + '5'); ws.getCell('A5').value = 'Nenhuma empresa com controle iniciado neste mês.'; ws.getCell('A5').font = { name: FONT, size: 10, italic: true };
    }
    ws.mergeCells('A' + r + ':' + lastL + r);
    ws.getCell('A' + r).value = 'Legenda: OK = entregue | PENDENTE = falta entregar | N/A = não se aplica | - = antes do início do controle | célula vazia = mês futuro.';
    ws.getCell('A' + r).font = { name: FONT, size: 9, color: { argb: 'FF595959' } };
    r += 2;
    const lh = ws.getCell(r, 1); lh.value = 'DOCUMENTOS'; styleHeader(lh);
    ws.mergeCells(r, 2, r, lastCol); ws.getCell(r, 2).value = 'NOME COMPLETO'; styleHeader(ws.getCell(r, 2));
    S.DOCS.forEach((d) => {
      r++; const c = ws.getCell(r, 1); c.value = d.curto; body(c, { bold: true });
      ws.mergeCells(r, 2, r, lastCol); const f = ws.getCell(r, 2); f.value = d.nome; body(f);
    });
    await save(wb, safe('Conferencia - ' + ym));
  }

  /* ---- checklist de uma empresa em um mês ---- */
  async function checklist(eid, ym) {
    const e = S.emp(eid);
    const wb = newBook();
    const ws = wb.addWorksheet('Check List', { views: [{ state: 'frozen', ySplit: 5, showGridLines: false }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    [6, 70, 14, 70].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    styleTitle(ws, 'A1:D1', 'CONTROLE DE DOCUMENTAÇÃO – ' + S.fmtYmLong(ym).toUpperCase());
    const lab = (a, t) => { const c = ws.getCell(a); c.value = t; c.font = { name: FONT, size: 10, bold: true }; c.alignment = { horizontal: 'right', vertical: 'middle' }; };
    const val = (a, t, o = {}) => { const c = ws.getCell(a); c.value = t; c.font = { name: FONT, size: 10, bold: true, color: o.color ? { argb: o.color } : undefined }; c.border = BORDER; c.alignment = { horizontal: 'left', vertical: 'middle' }; return c; };
    lab('B3', 'EMPRESA:'); val('C3', e.nome, { color: 'FF0000FF' }); ws.mergeCells('C3:D3');
    lab('B4', 'CNPJ:'); val('C4', e.cnpj || '–', { color: 'FF0000FF' }); ws.mergeCells('C4:D4');
    lab('B5', 'PROGRESSO / SITUAÇÃO:');
    let r = 7, n = 0; const ranges = []; const all = [];
    S.GROUPS.forEach((g) => {
      ws.getRow(r).height = 24;
      ['Nº', g.nome.toUpperCase(), 'STATUS', 'OBSERVAÇÃO'].forEach((t, i) => { const c = ws.getCell(r, i + 1); c.value = t; styleHeader(c); });
      const start = r + 1;
      S.docsDe(g.id).forEach((d) => {
        r++; n++;
        const reg = S.getReg(e.id, d.id, ym); const st = S.statusOf(e, d, ym); all.push(st);
        const obs = (reg && reg.obs) || '';
        ws.getRow(r).height = Math.max(d.nome.length > 70 ? 30 : 20, Math.ceil(obs.length / 75) * 15 + 5);
        [n, d.nome, st, obs || null].forEach((x, i) => { const c = ws.getCell(r, i + 1); c.value = x === '' ? null : x; body(c, { center: i !== 1 && i !== 3, bold: i === 2 }); });
        ws.dataValidations.add('C' + r, { type: 'list', allowBlank: true, formulae: [statusList] });
      });
      ranges.push('C' + start + ':C' + r); r += 2;
    });
    statusCF(ws, 'C7:C' + r);
    const cnt = (txt) => ranges.map((x) => 'COUNTIF(' + x + ',"' + txt + '")').join('+');
    const t = S.tally(all);
    const fp = ws.getCell('C5'); fp.value = { formula: 'IFERROR((' + cnt('OK') + ')/((' + cnt('OK') + ')+(' + cnt('PENDENTE') + ')),0)', result: t.pct || 0 };
    fp.numFmt = '0%'; fp.font = { name: FONT, size: 11, bold: true }; fp.border = BORDER; fp.alignment = { horizontal: 'center' };
    const fs = ws.getCell('D5'); fs.value = { formula: 'IF((' + cnt('PENDENTE') + ')=0,"COMPLETO","PENDENTE")', result: S.situacao(t) };
    fs.font = { name: FONT, size: 11, bold: true }; fs.border = BORDER; fs.alignment = { horizontal: 'center' };
    ws.addConditionalFormatting({ ref: 'D5', rules: [cfRule('COMPLETO', 'FFC6EFCE', 'FF006100'), cfRule('PENDENTE', 'FFFFC7CE', 'FF9C0006')] });
    await save(wb, safe('Checklist - ' + e.nome + ' - ' + ym));
  }

  /* ---- matriz anual de uma empresa ---- */
  async function matriz(eid, ano) {
    const e = S.emp(eid);
    const wb = newBook();
    const ws = wb.addWorksheet('Controle Mensal', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4, showGridLines: false }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.getColumn(1).width = 80; for (let i = 2; i <= 13; i++) ws.getColumn(i).width = 9.5;
    styleTitle(ws, 'A1:M1', 'CONTROLE MENSAL DE DOCUMENTAÇÃO – ' + e.nome.toUpperCase());
    ws.mergeCells('A2:M2'); ws.getCell('A2').value = 'ANO: ' + ano + '   |   CNPJ: ' + (e.cnpj || '–') + '   |   CONTROLE DESDE: ' + S.fmtYm(e.inicio);
    ws.getCell('A2').font = { name: FONT, size: 10, bold: true };
    const meses = monthsOf(ano);
    let r = 4; const rg = []; const perMonth = meses.map(() => []);
    S.GROUPS.forEach((g) => {
      const h = ws.getCell(r, 1); h.value = g.nome.toUpperCase(); styleHeader(h);
      meses.forEach((m, i) => { const c = ws.getCell(r, i + 2); c.value = utc(m + '-01'); c.numFmt = 'mm/yy'; styleHeader(c); });
      ws.getRow(r).height = 22;
      const start = r + 1;
      S.docsDe(g.id).forEach((d) => {
        r++; ws.getRow(r).height = d.nome.length > 80 ? 30 : 20;
        const a = ws.getCell(r, 1); a.value = d.nome; body(a);
        meses.forEach((m, i) => { const st = S.statusOf(e, d, m); perMonth[i].push(st); const c = ws.getCell(r, i + 2); c.value = st === '' ? null : st; body(c, { center: true, bold: true }); });
      });
      rg.push([start, r]);
      ws.dataValidations.add('B' + start + ':M' + r, { type: 'list', allowBlank: true, formulae: [statusList] });
      statusCF(ws, 'B' + start + ':M' + r);
      r += 2;
    });
    const rp = r, rq = r + 1;
    [['% CONCLUÍDO NO MÊS', rp], ['ITENS PENDENTES NO MÊS', rq]].forEach(([t, row]) => { const c = ws.getCell(row, 1); c.value = t; body(c, { bold: true }); c.alignment = { horizontal: 'right' }; ws.getRow(row).height = 22; });
    meses.forEach((m, i) => {
      const L = ws.getColumn(i + 2).letter;
      const cnt = (txt) => rg.map(([a, b]) => 'COUNTIF(' + L + a + ':' + L + b + ',"' + txt + '")').join('+');
      const t = S.tally(perMonth[i]);
      const c1 = ws.getCell(rp, i + 2); c1.value = { formula: 'IF((' + cnt('OK') + ')+(' + cnt('PENDENTE') + ')=0,"",(' + cnt('OK') + ')/((' + cnt('OK') + ')+(' + cnt('PENDENTE') + ')))', result: t.pct == null ? '' : t.pct };
      c1.numFmt = '0%'; body(c1, { center: true, bold: true });
      const c2 = ws.getCell(rq, i + 2); c2.value = { formula: 'IF((' + cnt('OK') + ')+(' + cnt('PENDENTE') + ')=0,"",' + cnt('PENDENTE') + ')', result: t.app ? t.pend : '' };
      body(c2, { center: true, bold: true });
    });
    pctCF(ws, 'B' + rp + ':M' + rp);
    ws.mergeCells('A' + (rq + 2) + ':M' + (rq + 2));
    ws.getCell('A' + (rq + 2)).value = 'Legenda: OK = entregue | PENDENTE = falta entregar | N/A = não se aplica | - = antes do início do controle | célula vazia = mês futuro.';
    ws.getCell('A' + (rq + 2)).font = { name: FONT, size: 9, color: { argb: 'FF595959' } };
    await save(wb, safe('Controle Mensal - ' + e.nome + ' - ' + ano));
  }

  return { build, exportReport, conferencia, checklist, matriz, MESES_CURTOS, monthsOf };
})();
