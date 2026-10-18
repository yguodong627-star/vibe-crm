/* 客簿 core —— 纯函数：金额/日期、报价计算、人民币大写、提醒、CSV 解析与导入校验。
   金额一律整数“分”，数量用整数“百分之一”，税率用整数“基点”(0.01%)；四舍五入统一为“半入”。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CLIENT_STAGES = ['线索', '洽谈中', '合作中', '已完成', '暂停'];
  var PROJECT_STATUS = ['待启动', '进行中', '待验收', '已完成', '搁置'];
  var TASK_STATUS = ['待办', '进行中', '等待中', '已完成'];
  var PRIORITY = ['高', '中', '低'];
  var QUOTE_STATUS = ['草稿', '已发送', '已接受', '已拒绝', '已过期'];

  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = '0' + n; return n; }
  /* 十进制字符串 → 乘 100 后的整数（最多两位小数，多出的按半入处理）；非法返回 null */
  function toMinor(s) {
    if (s == null) return null;
    s = String(s).replace(/[\s\u00a0¥￥,，元]/g, '');
    if (s === '') return null;
    var neg = false; if (s[0] === '-' || s[0] === '－') { neg = true; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
    var m = /^(\d+)(?:\.(\d+))?$/.exec(s); if (!m) return null;
    var f = (m[2] || '') + '000', v = parseInt(m[1], 10) * 100 + parseInt(f.slice(0, 2), 10);
    if (parseInt(f[2], 10) >= 5) v += 1;
    return neg ? -v : v;
  }
  function fmt(c) {
    var neg = c < 0; if (neg) c = -c;
    return (neg ? '-' : '') + '¥' + String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + pad(c % 100);
  }
  function plain(c) { var neg = c < 0; if (neg) c = -c; return (neg ? '-' : '') + Math.floor(c / 100) + '.' + pad(c % 100); }
  function pctStr(bp) { return plain(bp).replace(/\.?0+$/, ''); }
  function qtyStr(q) { var neg = q < 0; if (neg) q = -q; var w = Math.floor(q / 100), f = q % 100; return (neg ? '-' : '') + w + (f ? '.' + pad(f).replace(/0$/, '') : ''); }
  function roundDiv(a, b) { var s = a < 0 ? -1 : 1; a = Math.abs(a); return s * Math.floor((a + b / 2) / b); }

  /* ---------- 日期 ---------- */
  function validYMD(y, m, d) { return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function parseDate(s) {
    if (s == null) return null; s = String(s).trim(); if (!s) return null;
    var m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T].*)?$/.exec(s) || /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (!m || !validYMD(+m[1], +m[2], +m[3])) return null;
    return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
  }
  function dayNum(ds) { var p = ds.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function diffDays(a, b) { return dayNum(a) - dayNum(b); }
  function addDays(ds, k) { var d = new Date((dayNum(ds) + k) * 86400000); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }

  /* ---------- 报价计算 ---------- */
  // item: {n 名称, d 说明, q 数量×100, u 单位, p 单价(分)}；q: {items, disc 折扣(分), tax 税率(基点)}
  function lineAmount(it) { return roundDiv((it.q || 0) * (it.p || 0), 100); }
  function calcQuote(q) {
    var lines = (q.items || []).map(function (it) { return lineAmount(it); });
    var sub = lines.reduce(function (s, x) { return s + x; }, 0);
    var disc = Math.max(0, Math.min(q.disc || 0, Math.max(sub, 0)));
    var base = sub - disc, taxBp = q.tax || 0, tax = roundDiv(base * taxBp, 10000);
    return { lines: lines, sub: sub, disc: disc, discOver: (q.disc || 0) > Math.max(sub, 0), base: base, tax: tax, total: base + tax };
  }
  function nextQuoteNo(quotes, year) {
    var mx = 0, re = new RegExp('^Q' + year + '-(\\d+)$');
    quotes.forEach(function (q) { var m = re.exec(q.no || ''); if (m) mx = Math.max(mx, +m[1]); });
    return 'Q' + year + '-' + pad(mx + 1, 4);
  }

  /* ---------- 人民币大写 ---------- */
  function cnUpper(minor) {
    var D = '零壹贰叁肆伍陆柒捌玖', U = ['', '拾', '佰', '仟'], B = ['', '万', '亿', '万亿'];
    minor = Math.round(minor); var neg = minor < 0; if (neg) minor = -minor;
    if (minor === 0) return '零元整';
    var yi = Math.floor(minor / 100), jiao = Math.floor(minor / 10) % 10, fen = minor % 10;
    function g4(g) { var s = '', z = false, d = [Math.floor(g / 1000), Math.floor(g / 100) % 10, Math.floor(g / 10) % 10, g % 10]; d.forEach(function (x, i) { if (x === 0) { if (s) z = true; } else { if (z) { s += '零'; z = false; } s += D[x] + U[3 - i]; } }); return s; }
    var s = '';
    if (yi > 0) {
      var gs = [], t = yi; while (t > 0) { gs.push(t % 10000); t = Math.floor(t / 10000); }
      var need = false;
      for (var i = gs.length - 1; i >= 0; i--) {
        var g = gs[i]; if (g === 0) { if (s) need = true; continue; }
        if (s && (need || g < 1000)) s += '零'; need = false; s += g4(g) + B[i];
      }
      s += '元';
    }
    if (jiao === 0 && fen === 0) s += '整';
    else { if (jiao) s += D[jiao] + '角'; else if (yi > 0) s += '零'; if (fen) s += D[fen] + '分'; else s += '整'; }
    return (neg ? '负' : '') + s;
  }

  /* ---------- 提醒（只在打开页面时计算） ---------- */
  function reminders(S, today, win) {
    var out = [];
    function push(type, id, date, text, sub) {
      var d = diffDays(date, today);
      if (d > win) return;
      out.push({ type: type, id: id, date: date, days: d, level: d < 0 ? 'over' : d === 0 ? 'today' : 'soon', text: text, sub: sub });
    }
    var cname = function (id) { var c = S.clients.filter(function (x) { return x.id === id; })[0]; return c ? c.name : ''; };
    S.tasks.forEach(function (t) { if (t.status !== '已完成' && t.due) push('task', t.id, t.due, '任务：' + t.title, '截止 ' + t.due + (t.pri ? ' · 优先级' + t.pri : '')); });
    S.clients.forEach(function (c) { if (c.stage !== '已完成' && c.stage !== '暂停' && c.follow) push('client', c.id, c.follow, '跟进客户：' + c.name, '计划跟进 ' + c.follow + (c.stage ? ' · ' + c.stage : '')); });
    S.projects.forEach(function (p) { if (p.status !== '已完成' && p.status !== '搁置' && p.due) push('project', p.id, p.due, '项目交付：' + p.name, (cname(p.client) ? cname(p.client) + ' · ' : '') + '交付 ' + p.due); });
    S.quotes.forEach(function (q) {
      if (q.status === '已发送') {
        if (q.valid) push('quote', q.id, q.valid, '报价到期：' + (q.no || '') + ' ' + q.title, (cname(q.client) || '未关联客户') + ' · 有效期至 ' + q.valid + '，对方尚未答复');
        if (q.follow) push('quote', q.id, q.follow, '跟进报价：' + (q.no || '') + ' ' + q.title, (cname(q.client) || '未关联客户') + ' · 计划跟进 ' + q.follow);
      }
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], cur = '', q = false, i = 0, c;
    while (i < text.length) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i += 2; continue; } q = false; i++; continue; } cur += c; i++; continue; }
      if (c === '"' && cur === '') { q = true; i++; continue; }
      if (c === ',') { row.push(cur); cur = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++; continue; }
      cur += c; i++;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function csvCell(v) {
    v = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v)) v = "'" + v;  // 防公式注入（纯数字不动）
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function toCSV(rows) { return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'); }

  /* ---------- 导出行 / 导入解析 ---------- */
  var HEAD = {
    clients: ['名称', '公司', '联系人', '电话', '邮箱', '阶段', '来源', '下次跟进', '最近联系', '备注'],
    projects: ['项目名称', '客户', '状态', '开始日期', '截止日期', '预算(元)', '备注'],
    tasks: ['任务', '项目', '状态', '优先级', '截止日期', '备注'],
    quotes: ['编号', '标题', '客户', '项目', '状态', '日期', '有效期至', '跟进日期', '税率(%)', '折扣(元)', '行-名称', '行-说明', '行-数量', '行-单位', '行-单价(元)', '备注']
  };
  function nameOf(list, id, key) { var x = list.filter(function (z) { return z.id === id; })[0]; return x ? x[key] : ''; }
  function exportRows(S, table) {
    var r = [HEAD[table]];
    if (table === 'clients') S.clients.forEach(function (c) { r.push([c.name, c.company, c.contact, c.phone, c.email, c.stage, c.source, c.follow, c.last, c.note]); });
    if (table === 'projects') S.projects.forEach(function (p) { r.push([p.name, nameOf(S.clients, p.client, 'name'), p.status, p.start, p.due, p.budget == null ? '' : plain(p.budget), p.note]); });
    if (table === 'tasks') S.tasks.forEach(function (t) { r.push([t.title, nameOf(S.projects, t.project, 'name'), t.status, t.pri, t.due, t.note]); });
    if (table === 'quotes') S.quotes.forEach(function (q) {
      var items = q.items && q.items.length ? q.items : [{ n: '', d: '', q: 0, u: '', p: 0 }];
      items.forEach(function (it, i) { r.push([q.no, q.title, nameOf(S.clients, q.client, 'name'), nameOf(S.projects, q.project, 'name'), q.status, q.date, q.valid, q.follow, q.tax ? plain(q.tax) : '', q.disc ? plain(q.disc) : '', it.n, it.d, qtyStr(it.q), it.u, plain(it.p), i === 0 ? q.note : '']); });
    });
    return r;
  }
  /* 导入：rows 为 parseCSV 结果（含表头）。返回 {add:[], skip:n, errors:[], warns:[], newClients:[], newProjects:[]}
     关联按“名称”匹配：先匹配现有数据与本次新增；客户找不到会自动新建（并提示）。 */
  function importRows(S, table, rows, uid) {
    var res = { add: [], skip: 0, errors: [], warns: [], newClients: [], newProjects: [] };
    if (!rows.length) { res.errors.push('文件是空的'); return res; }
    var head = rows[0].map(function (x) { return x.replace(/\s/g, ''); }), want = HEAD[table], col = {};
    want.forEach(function (h) { var i = head.indexOf(h.replace(/\s/g, '')); if (i < 0 && /\(.*\)/.test(h)) i = head.indexOf(h.replace(/\(.*\)/, '')); col[h] = i; });
    var req = { clients: ['名称'], projects: ['项目名称'], tasks: ['任务'], quotes: ['编号', '标题'] }[table];
    var miss = req.filter(function (h) { return col[h] < 0; });
    if (miss.length) { res.errors.push('找不到必需的列：' + miss.join('、') + '。表头应为：' + want.join('，')); return res; }
    var g = function (r, h) { return col[h] >= 0 && col[h] < r.length ? r[col[h]].trim() : ''; };
    var clients = S.clients.slice(), projects = S.projects.slice(), seen = {}, unk = {};
    function findClient(name, rowN) {
      if (!name) return '';
      var c = clients.filter(function (x) { return x.name === name; })[0];
      if (!c) { c = { id: uid(), name: name, stage: CLIENT_STAGES[0], created: '' }; clients.push(c); res.newClients.push(c); }
      return c.id;
    }
    function findProject(name, clientId) {
      if (!name) return '';
      var p = projects.filter(function (x) { return x.name === name && (!clientId || x.client === clientId || !x.client); })[0] || projects.filter(function (x) { return x.name === name; })[0];
      if (!p) { p = { id: uid(), name: name, client: clientId || '', status: PROJECT_STATUS[0] }; projects.push(p); res.newProjects.push(p); }
      return p.id;
    }
    function enumVal(v, list, label, def) { if (!v) return def; if (list.indexOf(v) >= 0) return v; unk[label + '“' + v + '”'] = 1; return def; }
    function dateVal(v, label, n) { if (!v) return ''; var d = parseDate(v); if (!d) { res.errors.push('第 ' + n + ' 行：' + label + '“' + v + '”不是有效日期（应为 YYYY-MM-DD）'); return null; } return d; }
    var quotesByNo = {};
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i], n = i + 1; if (r.every(function (x) { return x.trim() === ''; })) continue;
      var d1, d2, d3, rec;
      if (table === 'clients') {
        var name = g(r, '名称'); if (!name) { res.errors.push('第 ' + n + ' 行：名称为空'); continue; }
        d1 = dateVal(g(r, '下次跟进'), '下次跟进', n); d2 = dateVal(g(r, '最近联系'), '最近联系', n); if (d1 === null || d2 === null) continue;
        if (seen[name] || clients.some(function (c) { return c.name === name; })) { res.skip++; continue; } seen[name] = 1;
        rec = { id: uid(), name: name, company: g(r, '公司'), contact: g(r, '联系人'), phone: g(r, '电话'), email: g(r, '邮箱'), stage: enumVal(g(r, '阶段'), CLIENT_STAGES, '阶段', CLIENT_STAGES[0]), source: g(r, '来源'), follow: d1, last: d2, note: g(r, '备注') };
        res.add.push(rec); clients.push(rec);
      } else if (table === 'projects') {
        var pn = g(r, '项目名称'); if (!pn) { res.errors.push('第 ' + n + ' 行：项目名称为空'); continue; }
        d1 = dateVal(g(r, '开始日期'), '开始日期', n); d2 = dateVal(g(r, '截止日期'), '截止日期', n); if (d1 === null || d2 === null) continue;
        var bud = g(r, '预算(元)'), budC = bud === '' ? null : toMinor(bud); if (bud !== '' && budC === null) { res.errors.push('第 ' + n + ' 行：预算“' + bud + '”不是有效金额'); continue; }
        var cid = findClient(g(r, '客户'), n), key = cid + '|' + pn;
        if (seen[key] || projects.some(function (p) { return p.name === pn && (p.client || '') === cid; })) { res.skip++; continue; } seen[key] = 1;
        rec = { id: uid(), name: pn, client: cid, status: enumVal(g(r, '状态'), PROJECT_STATUS, '状态', PROJECT_STATUS[0]), start: d1, due: d2, budget: budC, note: g(r, '备注') };
        res.add.push(rec); projects.push(rec);
      } else if (table === 'tasks') {
        var tt = g(r, '任务'); if (!tt) { res.errors.push('第 ' + n + ' 行：任务为空'); continue; }
        d1 = dateVal(g(r, '截止日期'), '截止日期', n); if (d1 === null) continue;
        var pid = findProject(g(r, '项目'), ''), k2 = pid + '|' + tt + '|' + d1;
        if (seen[k2] || S.tasks.some(function (t) { return (t.project || '') === pid && t.title === tt && (t.due || '') === d1; })) { res.skip++; continue; } seen[k2] = 1;
        res.add.push({ id: uid(), title: tt, project: pid, status: enumVal(g(r, '状态'), TASK_STATUS, '状态', TASK_STATUS[0]), pri: enumVal(g(r, '优先级'), PRIORITY, '优先级', '中'), due: d1, note: g(r, '备注') });
      } else {
        var no = g(r, '编号'), title = g(r, '标题');
        if (!no) { res.errors.push('第 ' + n + ' 行：编号为空'); continue; }
        var q = quotesByNo[no];
        if (!q && !title) { res.errors.push('第 ' + n + ' 行：该编号首行的标题为空'); quotesByNo[no] = 'skip'; continue; }
        if (!q) {
          if (S.quotes.some(function (x) { return x.no === no; })) { quotesByNo[no] = 'skip'; res.skip++; continue; }
          d1 = dateVal(g(r, '日期'), '日期', n); d2 = dateVal(g(r, '有效期至'), '有效期至', n); d3 = dateVal(g(r, '跟进日期'), '跟进日期', n); if (d1 === null || d2 === null || d3 === null) { quotesByNo[no] = 'skip'; continue; }
          var tx = g(r, '税率(%)'), txB = tx === '' ? 0 : toMinor(tx), ds = g(r, '折扣(元)'), dsC = ds === '' ? 0 : toMinor(ds);
          if (txB === null || dsC === null || txB < 0 || dsC < 0) { res.errors.push('第 ' + n + ' 行：税率或折扣不是有效数字'); quotesByNo[no] = 'skip'; continue; }
          var qc = findClient(g(r, '客户'), n);
          q = { id: uid(), no: no, title: title, client: qc, project: findProject(g(r, '项目'), qc), status: enumVal(g(r, '状态'), QUOTE_STATUS, '状态', QUOTE_STATUS[0]), date: d1, valid: d2, follow: d3, tax: txB, disc: dsC, items: [], note: g(r, '备注') };
          quotesByNo[no] = q; res.add.push(q);
        } else if (q === 'skip') continue;
        var iname = g(r, '行-名称');
        if (iname || g(r, '行-单价(元)')) {
          var qv = g(r, '行-数量') === '' ? 100 : toMinor(g(r, '行-数量')), pv = toMinor(g(r, '行-单价(元)') || '0');
          if (qv === null || pv === null) { res.errors.push('第 ' + n + ' 行：数量或单价不是有效数字'); continue; }
          q.items.push({ n: iname, d: g(r, '行-说明'), q: qv, u: g(r, '行-单位'), p: pv });
        }
      }
    }
    var u = Object.keys(unk); if (u.length) res.warns.push('以下取值不在预设列表里，已改为默认值：' + u.join('、'));
    if (res.newClients.length) res.warns.push('将自动新建 ' + res.newClients.length + ' 个客户：' + res.newClients.slice(0, 5).map(function (c) { return c.name; }).join('、') + (res.newClients.length > 5 ? '…' : ''));
    if (res.newProjects.length) res.warns.push('将自动新建 ' + res.newProjects.length + ' 个项目：' + res.newProjects.slice(0, 5).map(function (c) { return c.name; }).join('、') + (res.newProjects.length > 5 ? '…' : ''));
    return res;
  }

  return { CLIENT_STAGES: CLIENT_STAGES, PROJECT_STATUS: PROJECT_STATUS, TASK_STATUS: TASK_STATUS, PRIORITY: PRIORITY, QUOTE_STATUS: QUOTE_STATUS, toMinor: toMinor, fmt: fmt, plain: plain, pctStr: pctStr, qtyStr: qtyStr, parseDate: parseDate, diffDays: diffDays, addDays: addDays, lineAmount: lineAmount, calcQuote: calcQuote, nextQuoteNo: nextQuoteNo, cnUpper: cnUpper, reminders: reminders, parseCSV: parseCSV, toCSV: toCSV, exportRows: exportRows, importRows: importRows, HEAD: HEAD };
});
