/* 客簿 UI —— 纯前端，数据存 IndexedDB（不可用时退回 localStorage），不联网。 */
(function () {
  'use strict';
  var C = window.Core;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function today() {
    var m = /[?&]today=(\d{4}-\d{2}-\d{2})/.exec(location.search); if (m) return m[1];
    var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  var TODAY = today();

  /* ---------- 状态与存储 ---------- */
  function fresh() {
    return { v: 1, clients: [], projects: [], tasks: [], quotes: [], seq: 1, lastBackup: null,
      settings: { win: 3, tax: 0, validDays: 15, terms: '1. 本报价单在有效期内有效。\n2. 确认后预付 50% 启动，交付验收后结清余款。\n3. 范围外的需求另行报价。', me: { name: '', company: '', contact: '', phone: '', email: '', addr: '', pay: '' } } };
  }
  var S = fresh();
  var UI = { view: 'home', mode: { clients: 'table', projects: 'table', tasks: 'table', quotes: 'table' }, sort: { clients: { k: 'follow', d: 1 }, projects: { k: 'due', d: 1 }, tasks: { k: 'due', d: 1 }, quotes: { k: 'date', d: -1 } }, f: { clients: {}, projects: {}, tasks: {}, quotes: {} }, doc: null, pv: null };
  var DB = null, timer = null, storageOK = true;
  function openDB() { return new Promise(function (res) { try { var rq = indexedDB.open('kebu-crm', 1); rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); }; rq.onsuccess = function () { DB = rq.result; res(); }; rq.onerror = function () { res(); }; } catch (e) { res(); } }); }
  function dbGet() { return new Promise(function (res) { if (DB) { try { var r = DB.transaction('kv').objectStore('kv').get('state'); r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; return; } catch (e) { } } try { var t = localStorage.getItem('kebu-crm-state'); res(t ? JSON.parse(t) : null); } catch (e) { res(null); } }); }
  function persist() {
    return new Promise(function (res) {
      if (DB) { try { var tx = DB.transaction('kv', 'readwrite'); tx.objectStore('kv').put(S, 'state'); tx.oncomplete = function () { storageOK = true; res(); }; tx.onerror = tx.onabort = function () { storageOK = false; banner(); res(); }; return; } catch (e) { } }
      try { localStorage.setItem('kebu-crm-state', JSON.stringify(S)); storageOK = true; } catch (e) { storageOK = false; banner(); } res();
    });
  }
  function save() { clearTimeout(timer); timer = setTimeout(function () { timer = null; persist(); }, 80); }
  function flush() { if (timer) { clearTimeout(timer); timer = null; persist(); } }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
  function uid() { return 'i' + (S.seq++); }
  function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, 2800); }
  function download(name, text, type) { var b = new Blob([text], { type: type || 'text/plain;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

  /* ---------- 数据访问 ---------- */
  function by(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function cname(id) { var c = by(S.clients, id); return c ? c.name : ''; }
  function pname(id) { var p = by(S.projects, id); return p ? p.name : ''; }
  function qTotal(q) { return C.calcQuote(q).total; }
  function projectsOf(cid) { return S.projects.filter(function (p) { return p.client === cid; }); }
  function quotesOf(cid) { return S.quotes.filter(function (q) { return q.client === cid; }); }
  function tasksOfProject(pid) { return S.tasks.filter(function (t) { return t.project === pid; }); }
  function tasksOfClient(cid) { var ids = projectsOf(cid).map(function (p) { return p.id; }); return S.tasks.filter(function (t) { return ids.indexOf(t.project) >= 0; }); }
  var fmt = C.fmt;
  var CLS = {
    '线索': 'mute', '洽谈中': 'info', '合作中': 'good', '已完成': 'good', '暂停': 'warn',
    '待启动': 'mute', '进行中': 'info', '待验收': 'warn', '搁置': 'mute',
    '待办': 'mute', '等待中': 'warn',
    '草稿': 'mute', '已发送': 'info', '已接受': 'good', '已拒绝': 'over', '已过期': 'warn',
    '高': 'over', '中': 'warn', '低': 'mute'
  };
  function chip(t, c) { return t ? '<span class="chip ' + (c || CLS[t] || '') + '">' + esc(t) + '</span>' : ''; }
  function dateChip(date, active) {
    if (!date) return '<span class="mini">—</span>';
    var d = C.diffDays(date, TODAY), h = '<span class="num">' + date + '</span>';
    if (!active) return h;
    if (d < 0) h += ' ' + chip('逾期 ' + (-d) + ' 天', 'over'); else if (d === 0) h += ' ' + chip('今天', 'warn'); else if (d <= S.settings.win) h += ' ' + chip(d + ' 天后', 'info');
    return h;
  }

  /* ---------- 表定义 ---------- */
  var T = {
    clients: {
      label: '客户', arr: 'clients', sk: 'stage', st: C.CLIENT_STAGES, dk: 'follow', dActive: function (r) { return r.stage !== '已完成' && r.stage !== '暂停'; },
      cols: [
        { k: 'name', l: '客户', c: 'c0', v: function (r) { return r.name; }, h: function (r) { return '<span class="t">' + esc(r.name) + '</span><span class="s2">' + esc([r.company !== r.name ? r.company : '', r.contact, r.phone].filter(Boolean).join(' · ')) + '</span>'; } },
        { k: 'stage', l: '阶段', v: function (r) { return C.CLIENT_STAGES.indexOf(r.stage); }, h: function (r) { return chip(r.stage); } },
        { k: 'follow', l: '下次跟进', v: function (r) { return r.follow || ''; }, h: function (r) { return dateChip(r.follow, T.clients.dActive(r)); } },
        { k: 'np', l: '项目', cls: 'hm', v: function (r) { return projectsOf(r.id).length; }, h: function (r) { var n = projectsOf(r.id).length; return n ? n + ' 个项目' : '<span class="mini">无项目</span>'; } },
        { k: 'qa', l: '已接受报价', cls: 'r hm', v: function (r) { return quotesOf(r.id).filter(function (q) { return q.status === '已接受'; }).reduce(function (s, q) { return s + qTotal(q); }, 0); }, h: function (r) { var v = T.clients.cols[4].v(r); return v ? '<span class="num">' + fmt(v) + '</span>' : '<span class="mini">—</span>'; } }
      ],
      card: function (r) { return { t: r.name, m: [r.contact, r.company !== r.name ? r.company : ''].filter(Boolean).join(' · '), f: dateChip(r.follow, T.clients.dActive(r)) + (projectsOf(r.id).length ? ' <span class="mini">' + projectsOf(r.id).length + ' 项目</span>' : '') }; },
      text: function (r) { return [r.name, r.company, r.contact, r.phone, r.email, r.source, r.note].join(' '); }
    },
    projects: {
      label: '项目', arr: 'projects', sk: 'status', st: C.PROJECT_STATUS, dk: 'due', dActive: function (r) { return r.status !== '已完成' && r.status !== '搁置'; },
      cols: [
        { k: 'name', l: '项目', c: 'c0', v: function (r) { return r.name; }, h: function (r) { return '<span class="t">' + esc(r.name) + '</span><span class="s2">' + (cname(r.client) ? esc(cname(r.client)) : '未关联客户') + '</span>'; } },
        { k: 'status', l: '状态', v: function (r) { return C.PROJECT_STATUS.indexOf(r.status); }, h: function (r) { return chip(r.status); } },
        { k: 'due', l: '截止', v: function (r) { return r.due || ''; }, h: function (r) { return dateChip(r.due, T.projects.dActive(r)); } },
        { k: 'prog', l: '任务进度', cls: 'hm', v: function (r) { var a = tasksOfProject(r.id); return a.length ? a.filter(function (t) { return t.status === '已完成'; }).length / a.length : -1; }, h: function (r) { var a = tasksOfProject(r.id), d = a.filter(function (t) { return t.status === '已完成'; }).length; return a.length ? '<span class="num">' + d + ' / ' + a.length + '</span>' : '<span class="mini">无任务</span>'; } },
        { k: 'budget', l: '预算', cls: 'r hm', v: function (r) { return r.budget == null ? -1 : r.budget; }, h: function (r) { return r.budget == null ? '<span class="mini">—</span>' : '<span class="num">' + fmt(r.budget) + '</span>'; } }
      ],
      card: function (r) { var a = tasksOfProject(r.id), d = a.filter(function (t) { return t.status === '已完成'; }).length; return { t: r.name, m: cname(r.client) || '未关联客户', f: dateChip(r.due, T.projects.dActive(r)) + (a.length ? ' <span class="mini num">' + d + '/' + a.length + ' 任务</span>' : '') }; },
      text: function (r) { return [r.name, cname(r.client), r.note].join(' '); }
    },
    tasks: {
      label: '任务', arr: 'tasks', sk: 'status', st: C.TASK_STATUS, dk: 'due', dActive: function (r) { return r.status !== '已完成'; },
      cols: [
        { k: 'title', l: '任务', c: 'c0', v: function (r) { return r.title; }, h: function (r) { var p = by(S.projects, r.project); return '<span class="t">' + esc(r.title) + '</span><span class="s2">' + (p ? esc(p.name) + (cname(p.client) ? ' · ' + esc(cname(p.client)) : '') : '未关联项目') + '</span>'; } },
        { k: 'status', l: '状态', v: function (r) { return C.TASK_STATUS.indexOf(r.status); }, h: function (r) { return chip(r.status); } },
        { k: 'pri', l: '优先级', v: function (r) { return C.PRIORITY.indexOf(r.pri); }, h: function (r) { return chip(r.pri); } },
        { k: 'due', l: '截止', v: function (r) { return r.due || ''; }, h: function (r) { return dateChip(r.due, r.status !== '已完成'); } }
      ],
      card: function (r) { var p = by(S.projects, r.project); return { t: r.title, m: p ? p.name + (cname(p.client) ? ' · ' + cname(p.client) : '') : '未关联项目', f: dateChip(r.due, r.status !== '已完成') + ' ' + chip(r.pri) }; },
      text: function (r) { return [r.title, pname(r.project), cname((by(S.projects, r.project) || {}).client), r.note].join(' '); }
    },
    quotes: {
      label: '报价', arr: 'quotes', sk: 'status', st: C.QUOTE_STATUS, dk: 'valid', dActive: function (r) { return r.status === '已发送'; },
      cols: [
        { k: 'no', l: '报价', c: 'c0', v: function (r) { return r.no; }, h: function (r) { return '<span class="t">' + esc(r.title) + '</span><span class="s2">' + esc(r.no) + ' · ' + (cname(r.client) ? esc(cname(r.client)) : '未关联客户') + '</span>'; } },
        { k: 'status', l: '状态', v: function (r) { return C.QUOTE_STATUS.indexOf(r.status); }, h: function (r) { return chip(r.status); } },
        { k: 'valid', l: '有效期至', v: function (r) { return r.valid || ''; }, h: function (r) { return dateChip(r.valid, r.status === '已发送'); } },
        { k: 'date', l: '报价日期', cls: 'hm', v: function (r) { return r.date || ''; }, h: function (r) { return '<span class="num">' + (r.date || '—') + '</span>'; } },
        { k: 'total', l: '总计', cls: 'r', v: function (r) { return qTotal(r); }, h: function (r) { return '<span class="num t">' + fmt(qTotal(r)) + '</span>'; } }
      ],
      card: function (r) { return { t: r.title, m: r.no + ' · ' + (cname(r.client) || '未关联客户'), f: '<b class="num">' + fmt(qTotal(r)) + '</b> ' + dateChip(r.valid, r.status === '已发送') }; },
      text: function (r) { return [r.no, r.title, cname(r.client), pname(r.project), r.note, (r.items || []).map(function (i) { return i.n + ' ' + i.d; }).join(' ')].join(' '); }
    }
  };
  var ORDER = ['clients', 'projects', 'tasks', 'quotes'];

  function rows(table) {
    var t = T[table], f = UI.f[table], q = (f.q || '').trim().toLowerCase(), so = UI.sort[table];
    var col = t.cols.filter(function (c) { return c.k === so.k; })[0] || t.cols[0];
    var out = S[t.arr].filter(function (r) {
      if (f.st && r[t.sk] !== f.st) return false;
      if (f.client && table !== 'clients' && ((table === 'tasks' ? (by(S.projects, r.project) || {}).client : r.client) !== f.client)) return false;
      if (f.project && table === 'tasks' && r.project !== f.project) return false;
      if (f.date) {
        var dv = r[t.dk], dd = dv ? C.diffDays(dv, TODAY) : null;
        if (f.date === 'none' && dv) return false; if (f.date !== 'none' && !dv) return false;
        if (f.date === 'over' && !(dd < 0 && t.dActive(r))) return false; if (f.date === 'today' && dd !== 0) return false; if (f.date === 'week' && !(dd >= 0 && dd <= 7)) return false;
      }
      if (q && t.text(r).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    out.sort(function (a, b) {
      var x = col.v(a), y = col.v(b);
      if (x === y) return 0;
      var ex = x === '' || x === -1, ey = y === '' || y === -1;
      if (ex !== ey) return ex ? 1 : -1;  // 空值永远排最后
      return (x < y ? -1 : 1) * so.d;
    });
    return out;
  }

  /* ---------- 渲染框架 ---------- */
  var NAV = [['home', '今天'], ['clients', '客户'], ['projects', '项目'], ['tasks', '任务'], ['quotes', '报价'], ['data', '数据']];
  function render() {
    if (render.busy) { render.again = true; return; } render.busy = true;
    try { render1(); } finally { render.busy = false; } if (render.again) { render.again = false; render(); }
  }
  function render1() {
    var rem = C.reminders(S, TODAY, S.settings.win), urgent = rem.filter(function (r) { return r.level !== 'soon'; }).length;
    $('#nav').innerHTML = NAV.map(function (n) { return '<button data-act="nav" data-v="' + n[0] + '" class="' + ((UI.view === n[0] || (UI.view === 'doc' && n[0] === 'quotes')) ? 'on' : '') + '">' + n[1] + (n[0] === 'home' && urgent ? '<span class="dot">' + urgent + '</span>' : '') + '</button>'; }).join('');
    banner();
    $('#quickBtn').style.visibility = (UI.view === 'doc') ? 'hidden' : 'visible';
    ({ home: vHome, clients: vTable, projects: vTable, tasks: vTable, quotes: vTable, data: vData, doc: vDoc })[UI.view](rem);
    document.title = '客簿 · ' + (UI.view === 'doc' ? '报价单' : NAV.filter(function (n) { return n[0] === UI.view; })[0][1]);
  }
  function banner() {
    var b = $('#banner'), msg = '';
    if (!storageOK) msg = '⚠ 无法写入浏览器本地存储（可能是隐私模式或空间已满），改动关闭页面后会丢失，请立即“导出备份”。';
    else if ((S.clients.length + S.quotes.length) && (!S.lastBackup || (Date.parse(TODAY) - Date.parse(S.lastBackup)) / 864e5 > 30)) msg = S.lastBackup ? '距上次导出备份已超过 30 天。' : '你还没导出过备份。数据只在本浏览器里，清理浏览器数据会丢失。';
    if (msg) { b.hidden = false; b.innerHTML = esc(msg) + ' <button class="btn sm" data-act="nav" data-v="data" style="margin-left:10px">去备份</button>'; } else b.hidden = true;
  }
  function heroStats(a) { return '<div class="hstats">' + a.map(function (x) { return '<div class="hstat"><b class="num">' + x[0] + '</b><span>' + x[1] + '</span></div>'; }).join('') + '</div>'; }
  function isEmpty() { return !(S.clients.length || S.projects.length || S.tasks.length || S.quotes.length); }

  /* ---------- 今天 ---------- */
  function vHome(rem) {
    var hero = $('#hero');
    if (isEmpty()) {
      hero.innerHTML = '<div class="eyebrow">KEBU · 单人 CRM</div><h1>一个人的客户、<br>项目、任务和报价</h1><p>客户 → 项目 → 任务 → 报价，四张表互相关联；表格和看板两种看法；报价单一键打印或存成 PDF；到期和跟进在你打开页面时提醒。数据只存在这台设备的浏览器里，不上传、不注册、不收费。</p><div class="btns" style="margin-top:26px"><button class="btn light" data-act="new" data-t="clients">新建第一个客户</button><button class="btn glass" data-act="sample">载入示例数据（可一键清空）</button><button class="btn glass" data-act="nav" data-v="data">导入 CSV / 恢复备份</button></div>';
      $('#content').innerHTML = '<section class="sec"><div class="sec-h"><div><div class="idx">先说清楚</div><h2>它能做什么，不能做什么</h2></div></div><div class="grid2e"><ul class="help"><li><b>能：</b>四张表的增删改查、筛选排序、表格/看板切换、客户—项目—任务—报价关联、报价单（含税/折扣/人民币大写）打印或导出 PDF、CSV/JSON 导入导出。</li><li><b>能：</b>打开页面时，把逾期、今天、未来几天要跟进/交付/到期的事列在最上面。</li></ul><ul class="help"><li><b>不能：</b><b>关闭浏览器后不会提醒</b>——没有后台、没有推送、不发邮件短信。</li><li><b>不能：</b><b>多人协作</b>——数据只在这一台设备，没有账号和权限。换设备请用“导出备份”。</li><li><b>不能：</b>发邮件、同步日历、记录通话——这是一张轻量的本地表。</li></ul></div></section>';
      return;
    }
    var win = S.settings.win, over = rem.filter(function (r) { return r.level === 'over'; }), td = rem.filter(function (r) { return r.level === 'today'; }), soon = rem.filter(function (r) { return r.level === 'soon'; });
    var sent = S.quotes.filter(function (q) { return q.status === '已发送'; }), accY = S.quotes.filter(function (q) { return q.status === '已接受' && (q.date || '').slice(0, 4) === TODAY.slice(0, 4); });
    var sentSum = sent.reduce(function (s, q) { return s + qTotal(q); }, 0), accSum = accY.reduce(function (s, q) { return s + qTotal(q); }, 0);
    var openTasks = S.tasks.filter(function (t) { return t.status !== '已完成'; }), actP = S.projects.filter(function (p) { return p.status === '进行中' || p.status === '待验收'; });
    var wk = ['日', '一', '二', '三', '四', '五', '六'][new Date(TODAY + 'T00:00:00').getDay()];
    hero.innerHTML = '<div class="eyebrow">TODAY · 周' + wk + '</div><div class="hero-row"><div><h1>' + TODAY.replace(/-/g, '.') + '<small>' + (over.length + td.length ? '有 ' + (over.length + td.length) + ' 件事需要现在处理' : '今天没有逾期事项') + '</small></h1><p>提醒范围：逾期 + 今天 + 未来 ' + win + ' 天（可在“数据”页修改）。提醒只在打开本页时计算，关闭浏览器不会通知你。</p></div>' + heroStats([[S.clients.length, '客户'], [actP.length, '进行中项目'], [openTasks.length, '未完成任务']]) + '</div>';
    function group(title, arr, cls) { return arr.length ? '<div class="sec-h" style="margin-top:0;border-top:0;padding-top:0;margin-bottom:6px"><div class="idx" style="margin:0">' + title + ' · ' + arr.length + '</div></div><div class="list" style="margin-bottom:26px">' + arr.map(remRow).join('') + '</div>' : ''; }
    $('#content').innerHTML = '<div class="stat-row"><div class="stat"><b class="num">' + fmt(sentSum) + '</b><span>待回复报价（' + sent.length + ' 张已发送）</span></div><div class="stat"><b class="num">' + fmt(accSum) + '</b><span>' + TODAY.slice(0, 4) + ' 年已接受报价（' + accY.length + ' 张）</span></div><div class="stat"><b>' + S.tasks.filter(function (t) { return t.status !== '已完成' && t.due && C.diffDays(t.due, TODAY) < 0; }).length + '</b><span>逾期任务</span></div><div class="stat"><b>' + S.clients.filter(function (c) { return T.clients.dActive(c) && c.follow && C.diffDays(c.follow, TODAY) <= 0; }).length + '</b><span>今天及之前该跟进的客户</span></div></div>' +
      '<div class="grid2"><section class="sec"><div class="sec-h"><div><div class="idx">页面内提醒</div><h2>该处理的事 <span class="chip">' + rem.length + '</span></h2></div><span class="mini">仅打开本页时显示</span></div>' + (rem.length ? group('已逾期', over) + group('今天', td) + group('未来 ' + win + ' 天', soon) : '<div class="empty">逾期、今天和未来 ' + win + ' 天内没有需要处理的事。要让提醒生效，请给客户设“下次跟进”、给任务/项目设截止日、给已发送的报价设有效期。</div>') + '</section>' +
      '<div><section class="sec"><div class="sec-h"><div><div class="idx">管道</div><h2>客户阶段</h2></div></div><div class="bars">' + C.CLIENT_STAGES.map(function (s) { var n = S.clients.filter(function (c) { return c.stage === s; }).length; return '<div class="b"><span>' + s + '</span><div class="tr"><i style="width:' + (S.clients.length ? n / S.clients.length * 100 : 0) + '%"></i></div><span class="num">' + n + '</span></div>'; }).join('') + '</div></section>' +
      '<section class="sec"><div class="dark"><h3>报价状态</h3><div class="bars" style="margin-top:10px">' + C.QUOTE_STATUS.map(function (s) { var a = S.quotes.filter(function (q) { return q.status === s; }), v = a.reduce(function (x, q) { return x + qTotal(q); }, 0); return '<div class="b" style="grid-template-columns:60px 1fr auto"><span>' + s + ' ' + a.length + '</span><div class="tr"><i style="width:' + (S.quotes.length ? a.length / S.quotes.length * 100 : 0) + '%"></i></div><span class="num">' + fmt(v) + '</span></div>'; }).join('') + '</div></div></section></div></div>';
  }
  function remRow(r) {
    var w = r.level === 'over' ? (-r.days) : r.days;
    return '<div class="rem ' + r.level + '" data-act="open" data-t="' + r.type + '" data-id="' + r.id + '"><div class="w">' + (r.level === 'over' ? w : r.level === 'today' ? '今' : w) + '<small>' + (r.level === 'over' ? '天前逾期' : r.level === 'today' ? '天' : '天后') + '</small></div><div><div class="t">' + esc(r.text) + '</div><div class="s">' + esc(r.sub) + '</div></div><span class="go chip">' + { task: '任务', client: '客户', project: '项目', quote: '报价' }[r.type] + '</span></div>';
  }

  /* ---------- 四张表（表格 / 看板） ---------- */
  function vTable() {
    var table = UI.view, t = T[table], f = UI.f[table], all = S[t.arr], rs = rows(table), mode = UI.mode[table], so = UI.sort[table];
    var stats = {
      clients: [[all.length, '客户'], [all.filter(function (c) { return c.stage === '合作中'; }).length, '合作中'], [all.filter(function (c) { return t.dActive(c) && c.follow && C.diffDays(c.follow, TODAY) <= 7; }).length, '7 天内需跟进（含逾期）']],
      projects: [[all.filter(function (p) { return p.status === '进行中'; }).length, '进行中'], [all.filter(function (p) { return p.status === '待验收'; }).length, '待验收'], [all.filter(function (p) { return t.dActive(p) && p.due && C.diffDays(p.due, TODAY) < 0; }).length, '已逾期']],
      tasks: [[all.filter(function (x) { return x.status !== '已完成'; }).length, '未完成'], [all.filter(function (x) { return x.status !== '已完成' && x.due && C.diffDays(x.due, TODAY) < 0; }).length, '已逾期'], [all.filter(function (x) { return x.status !== '已完成' && x.due === TODAY; }).length, '今天到期']],
      quotes: [[all.length, '报价单'], [fmt(all.filter(function (q) { return q.status === '已发送'; }).reduce(function (s, q) { return s + qTotal(q); }, 0)), '待回复金额'], [fmt(all.filter(function (q) { return q.status === '已接受'; }).reduce(function (s, q) { return s + qTotal(q); }, 0)), '已接受金额']]
    }[table];
    var desc = { clients: '谁是你的客户、聊到哪一步、下次什么时候该联系。', projects: '每个项目属于哪个客户、做到哪、什么时候交。', tasks: '要做的具体事。可关联到项目，客户通过项目自动关联。', quotes: '给客户的报价。点“报价单”可预览、打印或导出 PDF。' }[table];
    $('#hero').innerHTML = '<div class="hero-row"><div><div class="eyebrow">' + table.toUpperCase() + '</div><h1>' + t.label + '<small>' + rs.length + (rs.length !== all.length ? ' / ' + all.length : '') + ' 条</small></h1><p>' + desc + '</p></div>' + heroStats(stats) + '</div>';
    var opts = function (list, sel, ph) { return '<option value="">' + ph + '</option>' + list.map(function (x) { return '<option value="' + (x.id || x) + '"' + ((x.id || x) === sel ? ' selected' : '') + '>' + esc(x.name || x) + '</option>'; }).join(''); };
    var h = '<div class="tools"><input type="text" id="fq" placeholder="搜索' + t.label + '…" value="' + esc(f.q || '') + '" aria-label="搜索">' +
      '<select data-act="fset" data-k="st" aria-label="状态">' + opts(t.st, f.st, '全部状态') + '</select>' +
      (table !== 'clients' ? '<select data-act="fset" data-k="client" aria-label="客户">' + opts(S.clients, f.client, '全部客户') + '</select>' : '') +
      (table === 'tasks' ? '<select data-act="fset" data-k="project" aria-label="项目">' + opts(S.projects, f.project, '全部项目') + '</select>' : '') +
      '<select data-act="fset" data-k="date" aria-label="日期">' + [['', '全部日期'], ['over', '已逾期'], ['today', '今天'], ['week', '7 天内'], ['none', '未设日期']].map(function (o) { return '<option value="' + o[0] + '"' + (f.date === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<select data-act="sort" aria-label="排序">' + t.cols.map(function (c) { return '<option value="' + c.k + '"' + (so.k === c.k ? ' selected' : '') + '>按' + c.l + '排序</option>'; }).join('') + '</select><button class="btn sm" data-act="sortdir" aria-label="切换升降序">' + (so.d > 0 ? '↑ 升序' : '↓ 降序') + '</button>' +
      (f.q || f.st || f.client || f.project || f.date ? '<button class="btn sm" data-act="fclear">清除筛选</button>' : '') + '<span class="sp"></span><div class="seg" role="group" aria-label="视图"><button data-act="mode" data-m="table" class="' + (mode === 'table' ? 'on' : '') + '">表格</button><button data-act="mode" data-m="kanban" class="' + (mode === 'kanban' ? 'on' : '') + '">看板</button></div><button class="btn primary" data-act="new" data-t="' + table + '">+ 新建' + t.label + '</button></div>';
    if (!all.length) h += '<div class="empty">还没有' + t.label + '。点右上“+ 新建' + t.label + '”开始' + (table !== 'clients' ? '。' : '，或在“数据”页导入 CSV。') + '</div>';
    else if (!rs.length) h += '<div class="empty">没有符合筛选条件的' + t.label + '。<button class="btn sm" data-act="fclear" style="margin-left:10px">清除筛选</button></div>';
    else if (mode === 'table') {
      h += '<table class="tbl"><thead><tr>' + t.cols.map(function (c) { return '<th class="s ' + (c.cls || '') + (so.k === c.k ? ' on' : '') + '" data-act="thsort" data-k="' + c.k + '">' + c.l + (so.k === c.k ? (so.d > 0 ? ' ↑' : ' ↓') : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rs.map(function (r) { return '<tr class="rw" data-act="edit" data-t="' + table + '" data-id="' + r.id + '" tabindex="0">' + t.cols.map(function (c) { return '<td class="' + (c.c || '') + ' ' + (c.cls || '') + '">' + c.h(r) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
    } else {
      h += '<div class="kan">' + t.st.map(function (s) {
        var cs = rs.filter(function (r) { return r[t.sk] === s; });
        return '<div class="col" data-col="' + esc(s) + '"><div class="col-h"><span>' + esc(s) + '</span><b class="num">' + cs.length + '</b></div><div class="col-b">' + (cs.length ? cs.map(function (r) {
          var c = t.card(r);
          return '<div class="card" draggable="true" data-act="edit" data-t="' + table + '" data-id="' + r.id + '"><div class="t">' + esc(c.t) + '</div><div class="m">' + esc(c.m) + '</div><div class="f2"><span>' + c.f + '</span><select class="mv" data-act="mv" data-t="' + table + '" data-id="' + r.id + '" aria-label="移动到">' + t.st.map(function (x) { return '<option' + (x === s ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select></div></div>';
        }).join('') : '<div class="col-n">拖到这里</div>') + '</div></div>';
      }).join('') + '</div><p class="mini">看板：把卡片拖到别的列即可改状态；手机上用卡片右下角的下拉框。</p>';
    }
    $('#content').innerHTML = h;
    var q = $('#fq'); q.addEventListener('input', function () { f.q = q.value; clearTimeout(vTable.t); vTable.t = setTimeout(function () { var p = q.selectionStart; render(); var n = $('#fq'); n.focus(); n.setSelectionRange(p, p); }, 200); });
  }
  function setStatus(table, id, st) { var r = by(S[T[table].arr], id); r[T[table].sk] = st; save(); render(); }

  /* ---------- 编辑对话框 ---------- */
  var FIELDS = {
    clients: [['name', '名称', 'text', 1], ['company', '公司', 'text'], ['contact', '联系人', 'text'], ['phone', '电话', 'tel'], ['email', '邮箱', 'email'], ['stage', '阶段', 'sel:' + C.CLIENT_STAGES.join('|')], ['source', '来源', 'text'], ['follow', '下次跟进', 'date'], ['last', '最近联系', 'date'], ['note', '备注', 'area']],
    projects: [['name', '项目名称', 'text', 1], ['client', '客户', 'ref:clients'], ['status', '状态', 'sel:' + C.PROJECT_STATUS.join('|')], ['budget', '预算（元）', 'money'], ['start', '开始日期', 'date'], ['due', '截止日期', 'date'], ['note', '备注', 'area']],
    tasks: [['title', '任务', 'text', 1], ['project', '所属项目', 'ref:projects'], ['status', '状态', 'sel:' + C.TASK_STATUS.join('|')], ['pri', '优先级', 'sel:' + C.PRIORITY.join('|')], ['due', '截止日期', 'date'], ['note', '备注', 'area']]
  };
  var dlg;
  function formHTML(table, r) {
    return '<div class="row">' + FIELDS[table].map(function (f) {
      var k = f[0], v = r[k], t = f[2], inner;
      if (t === 'area') inner = '<textarea name="' + k + '" rows="3">' + esc(v || '') + '</textarea>';
      else if (t.indexOf('sel:') === 0) inner = '<select name="' + k + '" style="width:100%">' + t.slice(4).split('|').map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>';
      else if (t.indexOf('ref:') === 0) { var ar = t.slice(4); inner = '<select name="' + k + '" style="width:100%"><option value="">（不关联）</option>' + S[ar].map(function (x) { return '<option value="' + x.id + '"' + (x.id === v ? ' selected' : '') + '>' + esc(x.name) + (ar === 'projects' && cname(x.client) ? '（' + esc(cname(x.client)) + '）' : '') + '</option>'; }).join('') + '</select>'; }
      else if (t === 'money') inner = '<input type="text" inputmode="decimal" name="' + k + '" value="' + (v == null ? '' : C.plain(v)) + '" placeholder="如 12000.00">';
      else inner = '<input type="' + t + '" name="' + k + '" value="' + esc(v || '') + '"' + (f[3] ? ' required' : '') + '>';
      return '<label class="f' + (t === 'area' ? '" style="grid-column:1/-1' : '') + '"><span>' + f[1] + (f[3] ? ' <em>*</em>' : '') + '</span>' + inner + '</label>';
    }).join('') + '</div>';
  }
  function relHTML(table, r) {
    var li = function (type, id, t, s, ch) { return '<div class="li" data-act="open" data-t="' + type + '" data-id="' + id + '" data-from="rel"><div><div class="t">' + esc(t) + '</div><div class="s">' + s + '</div></div>' + (ch || '') + '</div>'; };
    var h = '';
    if (table === 'clients') {
      var ps = projectsOf(r.id), qs = quotesOf(r.id), ts = tasksOfClient(r.id);
      h += '<div class="rel"><h4>项目（' + ps.length + '）<button type="button" class="btn sm" data-act="newrel" data-t="projects" data-pre="client:' + r.id + '">+ 项目</button></h4>' + (ps.length ? ps.map(function (p) { return li('projects', p.id, p.name, esc(p.due ? '截止 ' + p.due : '无截止日'), chip(p.status)); }).join('') : '<div class="mini">暂无</div>') + '</div>';
      h += '<div class="rel"><h4>报价（' + qs.length + '）<button type="button" class="btn sm" data-act="newrel" data-t="quotes" data-pre="client:' + r.id + '">+ 报价</button></h4>' + (qs.length ? qs.map(function (q) { return li('quotes', q.id, q.no + ' ' + q.title, fmt(qTotal(q)), chip(q.status)); }).join('') : '<div class="mini">暂无</div>') + '</div>';
      h += '<div class="rel"><h4>任务（经由项目，' + ts.length + '）</h4>' + (ts.length ? ts.slice(0, 8).map(function (t) { return li('tasks', t.id, t.title, esc(pname(t.project)) + (t.due ? ' · 截止 ' + t.due : ''), chip(t.status)); }).join('') + (ts.length > 8 ? '<div class="mini">还有 ' + (ts.length - 8) + ' 条，见“任务”页按客户筛选</div>' : '') : '<div class="mini">暂无</div>') + '</div>';
    } else if (table === 'projects') {
      var tk = tasksOfProject(r.id), qq = S.quotes.filter(function (q) { return q.project === r.id; });
      h += '<div class="rel"><h4>任务（' + tk.length + '）<button type="button" class="btn sm" data-act="newrel" data-t="tasks" data-pre="project:' + r.id + '">+ 任务</button></h4>' + (tk.length ? tk.map(function (t) { return li('tasks', t.id, t.title, t.due ? '截止 ' + t.due : '无截止日', chip(t.status)); }).join('') : '<div class="mini">暂无</div>') + '</div>';
      h += '<div class="rel"><h4>报价（' + qq.length + '）<button type="button" class="btn sm" data-act="newrel" data-t="quotes" data-pre="project:' + r.id + '">+ 报价</button></h4>' + (qq.length ? qq.map(function (q) { return li('quotes', q.id, q.no + ' ' + q.title, fmt(qTotal(q)), chip(q.status)); }).join('') : '<div class="mini">暂无</div>') + '</div>';
    }
    return h;
  }
  function quoteForm(q) {
    var projOpts = function (cid, sel) { return '<option value="">（不关联）</option>' + S.projects.filter(function (p) { return !cid || p.client === cid || !p.client || p.id === sel; }).map(function (p) { return '<option value="' + p.id + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join(''); };
    return '<div class="row"><label class="f"><span>报价编号 <em>*</em></span><input type="text" name="no" value="' + esc(q.no) + '" required></label><label class="f"><span>标题 <em>*</em></span><input type="text" name="title" value="' + esc(q.title) + '" required></label>' +
      '<label class="f"><span>客户</span><select name="client" style="width:100%"><option value="">（不关联）</option>' + S.clients.map(function (c) { return '<option value="' + c.id + '"' + (c.id === q.client ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></label><label class="f"><span>项目</span><select name="project" style="width:100%">' + projOpts(q.client, q.project) + '</select></label>' +
      '<label class="f"><span>状态</span><select name="status" style="width:100%">' + C.QUOTE_STATUS.map(function (s) { return '<option' + (s === q.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label><label class="f"><span>报价日期</span><input type="date" name="date" value="' + esc(q.date || '') + '"></label><label class="f"><span>有效期至</span><input type="date" name="valid" value="' + esc(q.valid || '') + '"></label><label class="f"><span>跟进日期（已发送时提醒）</span><input type="date" name="follow" value="' + esc(q.follow || '') + '"></label></div>' +
      '<table class="items"><thead><tr><th style="width:26%">名称</th><th>说明</th><th style="width:70px">数量</th><th style="width:60px">单位</th><th style="width:100px">单价（元）</th><th style="width:92px;text-align:right">金额</th><th style="width:30px"></th></tr></thead><tbody id="itemRows">' + (q.items || []).map(itemRow).join('') + '</tbody></table><button type="button" class="btn sm" data-act="additem">+ 添加一行</button>' +
      '<div class="row" style="margin-top:14px"><label class="f"><span>折扣（元，从小计中减去）</span><input type="text" inputmode="decimal" name="disc" value="' + (q.disc ? C.plain(q.disc) : '') + '" placeholder="0"></label><label class="f"><span>税率（%，在折后金额上计税；不含税填 0）</span><input type="text" inputmode="decimal" name="tax" value="' + (q.tax ? C.pctStr(q.tax) : '') + '" placeholder="0"></label></div><div class="calc" id="calc"></div>' +
      '<label class="f" style="margin-top:14px"><span>备注 / 条款（显示在报价单上；留空则使用“数据”页的默认条款）</span><textarea name="note" rows="3">' + esc(q.note || '') + '</textarea></label>';
  }
  function itemRow(it) { return '<tr><td><input type="text" data-i="n" value="' + esc(it.n) + '" aria-label="名称"></td><td><input type="text" data-i="d" value="' + esc(it.d) + '" aria-label="说明"></td><td><input type="text" inputmode="decimal" data-i="q" value="' + C.qtyStr(it.q == null ? 100 : it.q) + '" aria-label="数量"></td><td><input type="text" data-i="u" value="' + esc(it.u || '') + '" aria-label="单位"></td><td><input type="text" inputmode="decimal" data-i="p" value="' + (it.p ? C.plain(it.p) : '') + '" aria-label="单价"></td><td class="amt num" data-amt></td><td><button type="button" class="btn sm" data-act="delitem" aria-label="删除这一行">×</button></td></tr>'; }
  function readItems() {
    var out = [], bad = null;
    document.querySelectorAll('#itemRows tr').forEach(function (tr, i) {
      var g = function (k) { return tr.querySelector('[data-i=' + k + ']').value.trim(); };
      var n = g('n'), d = g('d'), qs = g('q'), ps = g('p'); if (!n && !d && !ps && (qs === '' || qs === '1')) return;
      var q = qs === '' ? 100 : C.toMinor(qs), p = ps === '' ? 0 : C.toMinor(ps);
      if (q === null || p === null) { bad = '第 ' + (i + 1) + ' 行的数量或单价不是有效数字'; return; }
      out.push({ n: n, d: d, q: q, u: g('u'), p: p });
    });
    return { items: out, bad: bad };
  }
  function calcLive() {
    var r = readItems(), form = $('#dlgForm'); if (!form) return;
    var disc = C.toMinor(form.elements.disc.value || '0'), tax = C.toMinor(form.elements.tax.value || '0');
    var box = $('#calc'); if (!box) return;
    if (r.bad || disc === null || tax === null || disc < 0 || tax < 0) { box.innerHTML = '<div class="mini bad">' + esc(r.bad || '折扣/税率不是有效的非负数字') + '</div>'; return; }
    var q = { items: r.items, disc: disc, tax: tax }, c = C.calcQuote(q);
    document.querySelectorAll('#itemRows tr').forEach(function (tr) { var amt = tr.querySelector('[data-amt]'); var qs = tr.querySelector('[data-i=q]').value.trim(), ps = tr.querySelector('[data-i=p]').value.trim(); var qv = qs === '' ? 100 : C.toMinor(qs), pv = ps === '' ? 0 : C.toMinor(ps); amt.textContent = (qv === null || pv === null) ? '—' : fmt(C.lineAmount({ q: qv, p: pv })); });
    box.innerHTML = '<div><span>小计</span><span class="num">' + fmt(c.sub) + '</span></div>' + (c.disc ? '<div><span>折扣</span><span class="num">-' + fmt(c.disc) + '</span></div>' : '') + (c.discOver ? '<div class="mini warnc">折扣超过小计，已按小计封顶</div>' : '') + (tax ? '<div><span>税额（' + C.pctStr(tax) + '%）</span><span class="num">' + fmt(c.tax) + '</span></div>' : '') + '<div class="tot"><span>总计</span><span class="num">' + fmt(c.total) + '</span></div><div class="mini" style="text-align:right">' + esc(C.cnUpper(c.total)) + '</div>';
  }
  var editing = null;
  function openEditor(table, id, pre) {
    var isNew = !id, r;
    if (isNew) {
      if (table === 'quotes') r = { no: C.nextQuoteNo(S.quotes, TODAY.slice(0, 4)), title: '', client: '', project: '', status: '草稿', date: TODAY, valid: C.addDays(TODAY, S.settings.validDays), follow: '', tax: Math.round((S.settings.tax || 0) * 100), disc: 0, note: '', items: [{ n: '', d: '', q: 100, u: '', p: 0 }] };
      else r = { clients: { stage: '线索', follow: '' }, projects: { status: '待启动' }, tasks: { status: '待办', pri: '中' } }[table];
      r = Object.assign({}, r, pre || {});
      if (table === 'quotes' && r.project && !r.client) r.client = (by(S.projects, r.project) || {}).client || '';
    } else r = by(S[T[table].arr], id);
    if (!r) return;
    editing = { table: table, id: id || null };
    var label = T[table].label;
    dlg.innerHTML = '<div class="dlg-h"><h3 id="dlgTitle">' + (isNew ? '新建' : '编辑') + label + '</h3><button class="dlg-x" data-act="dclose" aria-label="关闭">×</button></div><form id="dlgForm" novalidate><div class="dlg-b">' + (table === 'quotes' ? quoteForm(r) : formHTML(table, r)) + (!isNew ? relHTML(table, r) : '') + '</div><div class="dlg-f">' +
      '<button class="btn primary" type="submit">保存</button>' + (table === 'quotes' ? '<button class="btn" type="button" data-act="savedoc">保存并预览报价单</button>' : '') + (!isNew && table === 'quotes' ? '<button class="btn" type="button" data-act="dup">复制为新报价</button>' : '') + '<span class="sp"></span>' + (!isNew ? '<button class="btn danger" type="button" data-act="del">删除</button>' : '') + '<button class="btn" type="button" data-act="dclose">取消</button></div></form>';
    if (!dlg.open) dlg.showModal();
    $('#dlgForm').addEventListener('submit', function (e) { e.preventDefault(); saveEditor(false); });
    editing.snap = formSnap();
    if (table === 'quotes') {
      calcLive();
      $('#dlgForm').addEventListener('input', function (e) { if (e.target.closest('#itemRows') || e.target.name === 'disc' || e.target.name === 'tax') calcLive(); });
      $('#dlgForm').elements.client.addEventListener('change', function (e) { var sel = $('#dlgForm').elements.project, cur = sel.value, cid = e.target.value; sel.innerHTML = '<option value="">（不关联）</option>' + S.projects.filter(function (p) { return !cid || p.client === cid || !p.client; }).map(function (p) { return '<option value="' + p.id + '"' + (p.id === cur ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join(''); });
    }
    var first = dlg.querySelector('input[type=text],input:not([type])'); if (first && !isNew) { } else if (first) first.focus();
  }
  function formSnap() { var f = $('#dlgForm'); return f ? JSON.stringify(Array.prototype.map.call(f.querySelectorAll('input,select,textarea'), function (x) { return x.value; })) : ''; }
  function dirty() { return editing && editing.snap !== formSnap(); }
  function closeEditor(force) { if (!force && dirty() && !confirm('放弃未保存的修改？')) return false; if (dlg.open) dlg.close(); editing = null; return true; }
  function saveEditor(preview) {
    var table = editing.table, f = $('#dlgForm').elements, isNew = !editing.id, r = isNew ? { id: uid() } : by(S[T[table].arr], editing.id), rec = {};
    function val(k) { return f[k] ? f[k].value.trim() : ''; }
    if (table === 'quotes') {
      var no = val('no'), title = val('title'); if (!no || !title) return toast('编号和标题必填');
      if (S.quotes.some(function (q) { return q.no === no && q.id !== r.id; })) return toast('报价编号 ' + no + ' 已存在，请换一个');
      var it = readItems(); if (it.bad) return toast(it.bad);
      var disc = C.toMinor(val('disc') || '0'), tax = C.toMinor(val('tax') || '0'); if (disc === null || tax === null || disc < 0 || tax < 0) return toast('折扣/税率必须是非负数字');
      rec = { no: no, title: title, client: val('client'), project: val('project'), status: val('status'), date: val('date'), valid: val('valid'), follow: val('follow'), tax: tax, disc: disc, items: it.items, note: f.note.value };
      if (rec.valid && rec.date && rec.valid < rec.date) { if (!confirm('有效期早于报价日期，仍要保存吗？')) return; }
    } else {
      var miss = FIELDS[table].filter(function (x) { return x[3] && !val(x[0]); }); if (miss.length) { toast(miss[0][1] + '必填'); f[miss[0][0]].focus(); return; }
      FIELDS[table].forEach(function (x) {
        var k = x[0], v = x[2] === 'area' ? f[k].value : val(k);
        if (x[2] === 'money') { if (v === '') v = null; else { var m = C.toMinor(v); if (m === null || m < 0) { rec.__bad = x[1]; } v = m; } }
        rec[k] = v;
      });
      if (rec.__bad) return toast(rec.__bad + '不是有效金额');
      if (table === 'projects' && rec.start && rec.due && rec.due < rec.start && !confirm('截止日期早于开始日期，仍要保存吗？')) return;
    }
    Object.assign(r, rec); if (isNew) S[T[table].arr].push(r);
    save(); closeEditor(true); render(); toast(isNew ? '已创建' : '已保存');
    if (preview && table === 'quotes') { UI.view = 'doc'; UI.doc = r.id; render(); window.scrollTo(0, 0); }
  }
  function deleteRec() {
    var table = editing.table, r = by(S[T[table].arr], editing.id), msg = '';
    if (table === 'clients') msg = '删除客户“' + r.name + '”？它的 ' + projectsOf(r.id).length + ' 个项目和 ' + quotesOf(r.id).length + ' 张报价会保留，但变为“未关联客户”。';
    else if (table === 'projects') msg = '删除项目“' + r.name + '”？它的 ' + tasksOfProject(r.id).length + ' 个任务和相关报价会保留，但变为“未关联项目”。';
    else msg = '删除“' + (r.title || r.name) + '”？';
    if (!confirm(msg + '\n\n此操作不可撤销，建议先导出备份。')) return;
    S[T[table].arr] = S[T[table].arr].filter(function (x) { return x.id !== r.id; });
    if (table === 'clients') { S.projects.forEach(function (p) { if (p.client === r.id) p.client = ''; }); S.quotes.forEach(function (q) { if (q.client === r.id) q.client = ''; }); }
    if (table === 'projects') { S.tasks.forEach(function (t) { if (t.project === r.id) t.project = ''; }); S.quotes.forEach(function (q) { if (q.project === r.id) q.project = ''; }); }
    save(); closeEditor(true); render(); toast('已删除');
  }

  /* ---------- 报价单 ---------- */
  function esc2(s) { return esc(s).replace(/\n/g, '<br>'); }
  function sheetHTML(q) {
    var me = S.settings.me, c = by(S.clients, q.client) || {}, calc = C.calcQuote(q), p = by(S.projects, q.project);
    var terms = (q.note && q.note.trim()) ? q.note : S.settings.terms;
    var hasMe = me.name || me.company;
    return '<div class="sheet" id="sheet"><div class="sh-top"><div><h1>报价单</h1><div style="font-size:11px;letter-spacing:3px;color:#6a777d">QUOTATION</div></div><div class="sh-no"><div>编号：<b>' + esc(q.no) + '</b></div><div>日期：' + esc(q.date || '—') + '</div><div>有效期至：' + esc(q.valid || '—') + '</div></div></div>' +
      '<div class="parties"><div class="party"><h4>客户 / CLIENT</h4><p><b>' + esc(c.company || c.name || '（未选择客户）') + '</b>' + (c.contact ? '<br>联系人：' + esc(c.contact) : '') + (c.phone ? '<br>电话：' + esc(c.phone) : '') + (c.email ? '<br>邮箱：' + esc(c.email) : '') + '</p></div>' +
      '<div class="party"><h4>报价方 / FROM</h4><p>' + (hasMe ? '<b>' + esc(me.company || me.name) + '</b>' + (me.company && me.name ? '<br>联系人：' + esc(me.name) : '') + (me.phone ? '<br>电话：' + esc(me.phone) : '') + (me.email ? '<br>邮箱：' + esc(me.email) : '') + (me.addr ? '<br>' + esc(me.addr) : '') : '<span style="color:#b4553a">（请在“数据 → 我的信息”填写，否则这里为空）</span>') + '</p></div></div>' +
      '<div style="margin-bottom:6px"><b style="font-size:15px">' + esc(q.title) + '</b>' + (p ? '<span style="color:#5f737d"> · 项目：' + esc(p.name) + '</span>' : '') + '</div>' +
      '<table class="q"><thead><tr><th style="width:28px">#</th><th>项目名称 / 说明</th><th class="r">数量</th><th>单位</th><th class="r">单价</th><th class="r">金额</th></tr></thead><tbody>' + ((q.items || []).length ? q.items.map(function (it, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(it.n) + (it.d ? '<span class="d">' + esc(it.d) + '</span>' : '') + '</td><td class="r num">' + C.qtyStr(it.q) + '</td><td>' + esc(it.u) + '</td><td class="r num">' + fmt(it.p) + '</td><td class="r num">' + fmt(calc.lines[i]) + '</td></tr>'; }).join('') : '<tr><td colspan="6" style="color:#8b979c;text-align:center">（尚未添加行项目）</td></tr>') + '</tbody></table>' +
      '<table class="tot"><tr><td>小计</td><td class="num">' + fmt(calc.sub) + '</td></tr>' + (calc.disc ? '<tr><td>折扣</td><td class="num">-' + fmt(calc.disc) + '</td></tr>' : '') + (q.tax ? '<tr><td>不含税金额</td><td class="num">' + fmt(calc.base) + '</td></tr><tr><td>税额（' + C.pctStr(q.tax) + '%）</td><td class="num">' + fmt(calc.tax) + '</td></tr>' : '') + '<tr class="g"><td>总计（人民币）</td><td class="num">' + fmt(calc.total) + '</td></tr></table>' +
      '<div class="words"><b>大写金额：</b>' + esc(C.cnUpper(calc.total)) + '</div>' +
      (terms ? '<div class="terms"><h4>备注与条款 / TERMS</h4>' + esc2(terms) + '</div>' : '') + (me.pay ? '<div class="terms"><h4>收款信息 / PAYMENT</h4>' + esc2(me.pay) + '</div>' : '') +
      '<div class="sign"><div>客户确认签章 / 日期</div><div>报价方签章 / 日期</div></div><div class="stamp">由“客簿”本地生成 · 金额按 ' + (q.tax ? '含税率 ' + C.pctStr(q.tax) + '% 计算' : '未计税') + '，四舍五入到分</div></div>';
  }
  function vDoc() {
    var q = by(S.quotes, UI.doc); if (!q) { UI.view = 'quotes'; return render(); }
    $('#hero').innerHTML = '<div class="hero-row"><div><div class="eyebrow">QUOTATION · ' + esc(q.no) + '</div><h1>报价单预览<small>' + fmt(qTotal(q)) + '</small></h1><p>下方就是将要打印的内容。点“打印 / 导出 PDF”，在浏览器打印窗口里目的地选“另存为 PDF”即可。</p></div></div>';
    $('#content').innerHTML = '<div class="desk"><div class="dtool"><button class="btn glass" data-act="nav" data-v="quotes">← 返回报价列表</button><button class="btn glass" data-act="open" data-t="quotes" data-id="' + q.id + '">编辑</button>' + (q.status === '草稿' ? '<button class="btn glass" data-act="markSent" data-id="' + q.id + '">标记为“已发送”</button>' : '') + '<span class="sp"></span><button class="btn light" data-act="print">打印 / 导出 PDF</button></div>' + sheetHTML(q) + '</div>';
  }

  /* ---------- 数据页 ---------- */
  function vData() {
    var me = S.settings.me;
    $('#hero').innerHTML = '<div class="eyebrow">DATA · 导入导出与设置</div><h1>数据与设置</h1><p>共 ' + S.clients.length + ' 个客户 / ' + S.projects.length + ' 个项目 / ' + S.tasks.length + ' 个任务 / ' + S.quotes.length + ' 张报价。全部在这台设备的浏览器里，页面不联网。</p>';
    var h = '<div class="grid2e"><section class="sec"><div class="sec-h"><div><div class="idx">导出</div><h2>CSV / JSON</h2></div></div><div class="btns">' + ORDER.map(function (t) { return '<button class="btn" data-act="exCsv" data-t="' + t + '">' + T[t].label + ' CSV</button>'; }).join('') + '<button class="btn primary" data-act="exJson">完整备份 JSON</button></div><p class="mini" style="margin-top:12px">CSV 带 UTF-8 BOM，Excel 可直接打开；报价 CSV 每个行项目一行。上次备份：' + (S.lastBackup || '从未') + '</p></section>' +
      '<section class="sec"><div class="sec-h"><div><div class="idx">恢复</div><h2>从备份还原</h2></div></div><div class="btns"><button class="btn" data-act="restorePick">选择备份 JSON</button><button class="btn danger" data-act="clear">清空全部数据</button><button class="btn" data-act="sample">载入示例数据</button></div><p class="mini" style="margin-top:12px">还原会<b>覆盖</b>当前全部数据（会先确认）。</p></section></div>' +
      '<section class="sec"><div class="sec-h"><div><div class="idx">导入</div><h2>从 CSV 导入</h2></div></div><div class="tools"><select id="impT" aria-label="导入到哪张表">' + ORDER.map(function (t) { return '<option value="' + t + '">导入到：' + T[t].label + '</option>'; }).join('') + '</select><button class="btn primary" data-act="pickCsv">选择 CSV 文件</button></div><p class="mini">表头必须与导出的 CSV 一致（可先导出一份当模板）。关联列写名称：项目的“客户”、任务的“项目”、报价的“客户/项目”；找不到的客户/项目会自动新建（预览里会提示）。重复的（客户同名、项目同客户同名、任务同项目同名同日、报价同编号）自动跳过。报价同一编号的多行合并为同一张报价的多个行项目。</p><div id="pv">' + (UI.pv ? pvHTML(UI.pv) : '') + '</div></section>' +
      '<div class="grid2e"><section class="sec"><div class="sec-h"><div><div class="idx">报价单抬头</div><h2>我的信息</h2></div></div><form id="meForm">' +
      [['name', '联系人姓名'], ['company', '公司/工作室名称'], ['phone', '电话'], ['email', '邮箱'], ['addr', '地址']].map(function (x) { return '<label class="f"><span>' + x[1] + '</span><input type="text" data-me="' + x[0] + '" value="' + esc(me[x[0]]) + '"></label>'; }).join('') + '<label class="f"><span>收款信息（显示在报价单上，选填）</span><textarea data-me="pay" rows="3">' + esc(me.pay) + '</textarea></label></form></section>' +
      '<section class="sec"><div class="sec-h"><div><div class="idx">默认值</div><h2>报价与提醒</h2></div></div><label class="f"><span>默认条款（报价单备注为空时使用）</span><textarea id="setTerms" rows="5">' + esc(S.settings.terms) + '</textarea></label><div class="row"><label class="f"><span>默认税率（%）</span><input type="text" inputmode="decimal" id="setTax" value="' + (S.settings.tax || '') + '" placeholder="0"></label><label class="f"><span>默认有效期（天）</span><input type="number" id="setValid" min="1" max="365" value="' + S.settings.validDays + '"></label><label class="f"><span>提醒提前天数</span><select id="setWin" style="width:100%">' + [0, 1, 3, 7, 14].map(function (d) { return '<option value="' + d + '"' + (S.settings.win === d ? ' selected' : '') + '>' + (d ? d + ' 天' : '仅逾期和今天') + '</option>'; }).join('') + '</select></label></div></section></div>' +
      '<section class="sec"><div class="sec-h"><div><div class="idx">说明</div><h2>已知限制，如实告知</h2></div></div><ul class="help"><li><b>关闭浏览器时不会提醒。</b>提醒只在你打开本页时计算并显示；没有后台、推送、邮件、短信。</li><li><b>单人使用，不支持多人协作。</b>没有账号、权限、评论、实时同步；数据只在这一台设备的这一个浏览器里。</li><li>换设备/清除浏览器数据前请导出备份；还原是整体覆盖。</li><li>报价单“导出 PDF”依赖浏览器的打印功能（目的地选“另存为 PDF”）；分页由浏览器决定，行项目很多时会自动换页并重复表头。不同浏览器的页边距、页眉页脚设置可能略有差异（建议在打印设置里关闭“页眉和页脚”）。</li><li>金额以“分”为单位计算，行金额=数量×单价（四舍五入到分），税额按折后金额计算并四舍五入到分；只支持人民币。</li><li>删除客户/项目不会连带删除其项目/任务/报价，它们会变为“未关联”。</li><li>调试：网址加 <code>?today=2026-10-18</code> 可固定“今天”。</li></ul></section>';
    $('#content').innerHTML = h;
    document.querySelectorAll('[data-me]').forEach(function (i) { i.addEventListener('change', function () { S.settings.me[i.dataset.me] = i.value.trim(); save(); toast('已保存'); }); });
    $('#setTerms').addEventListener('change', function (e) { S.settings.terms = e.target.value; save(); toast('已保存'); });
    $('#setTax').addEventListener('change', function (e) { var v = C.toMinor(e.target.value || '0'); S.settings.tax = v === null || v < 0 ? 0 : v / 100; save(); render(); });
    $('#setValid').addEventListener('change', function (e) { S.settings.validDays = Math.max(1, Math.min(365, +e.target.value || 15)); save(); });
    $('#setWin').addEventListener('change', function (e) { S.settings.win = +e.target.value; save(); render(); });
  }
  function decodeBuf(buf) { var u = new Uint8Array(buf); try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(u), enc: 'UTF-8' }; } catch (e) { return { text: new TextDecoder('gb18030').decode(u), enc: 'GBK' }; } }
  function startImport(file) {
    var table = $('#impT') ? $('#impT').value : (UI.impT || 'clients'); UI.impT = table;
    file.arrayBuffer().then(function (b) {
      var d = decodeBuf(b), rows = C.parseCSV(d.text), res = C.importRows(S, table, rows, uid);
      UI.pv = { table: table, name: file.name, enc: d.enc, res: res, n: rows.length - 1 }; render();
    });
  }
  function pvHTML(pv) {
    var r = pv.res, t = T[pv.table];
    return '<div class="pv"><b>' + esc(pv.name) + '</b> → ' + t.label + ' <span class="mini">（编码 ' + pv.enc + '，数据行 ' + pv.n + '）</span><div class="mini" style="margin:8px 0"><b>将新增 ' + r.add.length + ' 条</b>' + (r.skip ? ' · 重复跳过 ' + r.skip : '') + (r.errors.length ? ' · <span class="bad" style="color:var(--over)">问题行 ' + r.errors.length + '（不导入）</span>' : '') + '</div>' +
      r.errors.slice(0, 8).map(function (e) { return '<div class="mini bad">' + esc(e) + '</div>'; }).join('') + (r.errors.length > 8 ? '<div class="mini bad">…另有 ' + (r.errors.length - 8) + ' 条</div>' : '') + r.warns.map(function (w) { return '<div class="mini warnc">' + esc(w) + '</div>'; }).join('') +
      (r.add.length ? '<table class="pvt"><tr>' + t.cols.slice(0, 4).map(function (c) { return '<th>' + c.l + '</th>'; }).join('') + '</tr>' + r.add.slice(0, 5).map(function (x) { return '<tr>' + t.cols.slice(0, 4).map(function (c) { var tmp = document.createElement('div'); tmp.innerHTML = c.h(Object.assign({}, x)); return '<td>' + esc(tmp.textContent) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>' : '') +
      '<div class="btns" style="margin-top:10px"><button class="btn primary" data-act="pvok"' + (r.add.length ? '' : ' disabled') + '>确认导入 ' + r.add.length + ' 条</button><button class="btn" data-act="pvno">取消</button></div></div>';
  }

  /* ---------- 导出 / 还原 ---------- */
  function exportCsv(t) { download('客簿-' + T[t].label + '-' + TODAY + '.csv', '\ufeff' + C.toCSV(C.exportRows(S, t)), 'text/csv;charset=utf-8'); }
  function exportJson() { S.lastBackup = TODAY; save(); download('客簿-备份-' + TODAY + '.json', JSON.stringify({ app: 'kebu-crm', version: 1, exportedAt: new Date().toISOString(), data: S }, null, 1), 'application/json'); render(); }
  function restore(text) {
    var o; try { o = JSON.parse(text); } catch (e) { return toast('不是有效的 JSON 文件'); }
    if (!o || o.app !== 'kebu-crm' || !o.data || !Array.isArray(o.data.clients)) return toast('这不是客簿的备份文件');
    var d = o.data; if (!confirm('备份含 ' + d.clients.length + ' 客户 / ' + d.projects.length + ' 项目 / ' + d.tasks.length + ' 任务 / ' + d.quotes.length + ' 报价。\n还原会覆盖当前全部数据，确定吗？')) return;
    S = Object.assign(fresh(), d); S.settings = Object.assign(fresh().settings, d.settings || {}); S.settings.me = Object.assign(fresh().settings.me, (d.settings || {}).me || {}); save(); render(); toast('已还原');
  }

  /* ---------- 事件 ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    var a = el.dataset.act, id = el.dataset.id, t = el.dataset.t;
    if (a === 'dclose') return void closeEditor(false);
    if (a === 'nav') { if (dlg.open && !closeEditor(false)) return; UI.view = el.dataset.v; window.scrollTo(0, 0); return render(); }
    if (a === 'new') return openEditor(t, null);
    if (a === 'newrel') { var pr = el.dataset.pre.split(':'), o = {}; o[pr[0]] = pr[1]; if (!closeEditor(false)) return; return openEditor(t, null, o); }
    if (a === 'quick') { dlg.innerHTML = '<div class="dlg-h"><h3 id="dlgTitle">新建</h3><button class="dlg-x" data-act="dclose" aria-label="关闭">×</button></div><div class="dlg-b"><div class="btns" style="padding-bottom:18px">' + ORDER.map(function (x) { return '<button class="btn primary" data-act="new" data-t="' + x + '">' + T[x].label + '</button>'; }).join('') + '</div></div>'; editing = null; return dlg.showModal(); }
    if (a === 'edit' || a === 'open') {
      if (e.target.closest('select')) return;
      if (a === 'open' && el.dataset.from === 'rel' && !closeEditor(false)) return;
      if (a === 'open' && !el.dataset.from && dlg.open) { if (!closeEditor(false)) return; }
      return openEditor(t, id);
    }
    if (a === 'mode') { UI.mode[UI.view] = el.dataset.m; return render(); }
    if (a === 'thsort') { var so = UI.sort[UI.view]; if (so.k === el.dataset.k) so.d = -so.d; else { so.k = el.dataset.k; so.d = 1; } return render(); }
    if (a === 'sortdir') { UI.sort[UI.view].d *= -1; return render(); }
    if (a === 'fclear') { UI.f[UI.view] = {}; return render(); }
    if (a === 'additem') { $('#itemRows').insertAdjacentHTML('beforeend', itemRow({ n: '', d: '', q: 100, u: '', p: 0 })); calcLive(); return; }
    if (a === 'delitem') { el.closest('tr').remove(); return calcLive(); }
    if (a === 'savedoc') return saveEditor(true);
    if (a === 'del') return deleteRec();
    if (a === 'dup') { var src = by(S.quotes, editing.id); var pre = JSON.parse(JSON.stringify(src)); delete pre.id; pre.no = C.nextQuoteNo(S.quotes, TODAY.slice(0, 4)); pre.title = src.title + '（副本）'; pre.status = '草稿'; pre.date = TODAY; pre.valid = C.addDays(TODAY, S.settings.validDays); pre.follow = ''; closeEditor(true); return openEditor('quotes', null, pre); }
    if (a === 'print') return window.print();
    if (a === 'markSent') { by(S.quotes, id).status = '已发送'; save(); return toast('已标记为已发送'); }
    if (a === 'exCsv') return exportCsv(t);
    if (a === 'exJson') return exportJson();
    if (a === 'restorePick') return $('#restoreIn').click();
    if (a === 'pickCsv') return $('#fileIn').click();
    if (a === 'pvno') { UI.pv = null; return render(); }
    if (a === 'pvok') { var pv = UI.pv, r = pv.res; S.clients = S.clients.concat(r.newClients); S.projects = S.projects.concat(r.newProjects); S[T[pv.table].arr] = S[T[pv.table].arr].concat(r.add); UI.pv = null; save(); render(); return toast('已导入 ' + r.add.length + ' 条' + (r.newClients.length ? '，新建客户 ' + r.newClients.length : '')); }
    if (a === 'clear') { if (!confirm('清空全部数据（客户、项目、任务、报价、设置）？不可撤销，建议先导出备份。')) return; S = fresh(); UI.pv = null; save(); render(); return toast('已清空'); }
    if (a === 'sample') { if (!isEmpty() && !confirm('当前已有数据。载入示例会追加到现有数据后面。继续？')) return; var sm = window.makeSample(TODAY, C), base = S.seq; ['clients', 'projects', 'tasks', 'quotes'].forEach(function (k) { S[k] = S[k].concat(sm[k]); }); S.seq = Math.max(S.seq, sm.seq); if (!S.settings.me.name && !S.settings.me.company) S.settings.me = { name: '（示例）张三', company: '示例设计工作室', contact: '', phone: '13900000000', email: 'me@example.com', addr: '上海市示例路 100 号', pay: '开户名：示例设计工作室\n账号：6222 **** **** 0000' }; UI.view = 'home'; save(); render(); return toast('已载入示例数据，可在“数据”页清空'); }
  });
  document.addEventListener('change', function (e) {
    var el = e.target, a = el.dataset && el.dataset.act;
    if (el.id === 'fileIn') { if (el.files[0]) startImport(el.files[0]); el.value = ''; return; }
    if (el.id === 'restoreIn') { var f = el.files[0]; if (f) f.text().then(restore); el.value = ''; return; }
    if (a === 'fset') { UI.f[UI.view][el.dataset.k] = el.value; return render(); }
    if (a === 'sort') { UI.sort[UI.view].k = el.value; return render(); }
    if (a === 'mv') { return setStatus(el.dataset.t, el.dataset.id, el.value); }
  });
  // 看板拖拽
  var dragged = null;
  document.addEventListener('dragstart', function (e) { var c = e.target.closest && e.target.closest('.card'); if (!c) return; dragged = { t: c.dataset.t, id: c.dataset.id }; c.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', c.dataset.id); } catch (x) { } });
  document.addEventListener('dragend', function () { dragged = null; document.querySelectorAll('.drag,.drop').forEach(function (x) { x.classList.remove('drag', 'drop'); }); });
  document.addEventListener('dragover', function (e) { var col = e.target.closest && e.target.closest('.col'); if (col && dragged) { e.preventDefault(); document.querySelectorAll('.col.drop').forEach(function (x) { if (x !== col) x.classList.remove('drop'); }); col.classList.add('drop'); } else if (!e.target.closest('dialog')) e.preventDefault(); });
  document.addEventListener('drop', function (e) { var col = e.target.closest && e.target.closest('.col'); e.preventDefault(); if (col && dragged) { var d = dragged; dragged = null; setStatus(d.t, d.id, col.dataset.col); } });
  document.addEventListener('keydown', function (e) { if ((e.key === 'Enter') && e.target.matches && e.target.matches('tr.rw')) openEditor(e.target.dataset.t, e.target.dataset.id); });

  /* ---------- 启动 ---------- */
  dlg = $('#dlg');
  dlg.addEventListener('cancel', function (e) { if (dirty() && !confirm('放弃未保存的修改？')) e.preventDefault(); else editing = null; });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) closeEditor(false); });
  openDB().then(dbGet).then(function (d) {
    if (d && d.clients) { S = Object.assign(fresh(), d); S.settings = Object.assign(fresh().settings, d.settings || {}); S.settings.me = Object.assign(fresh().settings.me, (d.settings || {}).me || {}); }
    if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) { } }
    render();
    window.__kebu = { S: function () { return S; }, UI: UI, render: render, openEditor: openEditor };
  });
})();
