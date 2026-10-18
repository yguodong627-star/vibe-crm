const fs=require('fs'),path=require('path'),Core=require('../core.js');
const D=path.join(__dirname,'data'); const E=JSON.parse(fs.readFileSync(D+'/cases.json','utf8'));
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
// 报价计算 vs Decimal
let bad=0;E.quotes.forEach((c,i)=>{const q={items:c.items.map(x=>({q:Core.toMinor(x.q),p:Core.toMinor(x.p)})),disc:Core.toMinor(c.disc),tax:Core.toMinor(c.tax)};const r=Core.calcQuote(q);
  const e=c.exp; if(r.sub!==e.sub||r.disc!==e.disc||r.base!==e.base||r.tax!==e.tax||r.total!==e.total||r.lines.join()!==e.lines.join()){bad++;if(bad<4)console.log('  不符',i,JSON.stringify(c),JSON.stringify(r));}});
ok(bad===0,'报价小计/折扣/税额/总计/每行金额与 Decimal 独立计算完全一致（'+E.quotes.length+' 组，含半入、折扣封顶、税率 6.5%）');
// 大写
let ub=0;E.upper.forEach(u=>{const t=Core.cnUpper(u.cents);if(t!==u.text){ub++;console.log('  大写不符',u.cents,t,u.text);}});ok(ub===0,'人民币大写与独立实现一致（'+E.upper.length+' 个，含零的各种位置、亿/万亿）');
ok(Core.cnUpper(5)==='伍分'&&Core.cnUpper(10000)==='壹佰元整'&&Core.cnUpper(1000001)==='壹万元零壹分'&&Core.cnUpper(0)==='零元整','大写抽查：¥0.05 / ¥100 / ¥10000.01 / 零');
// 解析
ok(Core.toMinor('1,234.5')===123450&&Core.toMinor('0.005')===1&&Core.toMinor('abc')===null&&Core.toMinor('')===null&&Core.toMinor('-3.2')===-320,'toMinor');
ok(Core.qtyStr(250)==='2.5'&&Core.qtyStr(100)==='1'&&Core.qtyStr(1)==='0.01'&&Core.qtyStr(1234)==='12.34','数量显示');
ok(Core.parseDate('2026-02-29')===null&&Core.parseDate('2026/10/5')==='2026-10-05'&&Core.parseDate('2026年10月5日')==='2026-10-05'&&Core.addDays('2026-12-31',1)==='2027-01-01','日期校验（2026 非闰年）');
ok(Core.nextQuoteNo([{no:'Q2026-0009'},{no:'Q2025-0100'}],2026)==='Q2026-0010'&&Core.nextQuoteNo([],2026)==='Q2026-0001','报价编号自增');
// 导入
let id=0;const uid=()=>'x'+(++id);
const rd=n=>Core.parseCSV(fs.readFileSync(D+'/'+n,'utf8'));
let S={clients:[],projects:[],tasks:[],quotes:[]};
let r=Core.importRows(S,'clients',rd('clients.csv'),uid);
ok(r.add.length===3&&r.skip===1&&r.errors.length===2,'客户导入：新增3（含“怪阶段”），重复跳过1，错误2（无效日期、空名） '+JSON.stringify(r.errors));
ok(r.add[0].note==='备注含,逗号和"引号"','引号/逗号转义正确'); ok(r.warns.some(w=>/神秘阶段/.test(w)),'未知阶段给出警告并用默认值');
S.clients=r.add;
r=Core.importRows(S,'projects',rd('projects.csv'),uid);
ok(r.add.length===3&&r.errors.length===1&&r.newClients.length===1&&r.add[0].budget===1200050,'项目导入：3 新增，1 个坏预算被拒，自动新建客户“新客户甲”，预算 12,000.50 → 1200050 分');
S.projects=r.add;S.clients=S.clients.concat(r.newClients);
r=Core.importRows(S,'tasks',rd('tasks.csv'),uid); ok(r.add.length===4&&r.add[0].project===S.projects[0].id,'任务导入并关联到项目'); S.tasks=r.add;
r=Core.importRows(S,'quotes',rd('quotes.csv'),uid); ok(r.add.length===2&&r.add[0].items.length===2,'报价导入：按编号合并多行行项目');
const q1=r.add[0]; const c1=Core.calcQuote(q1);
ok(c1.lines[0]===83333&&c1.lines[1]===1999990&&c1.sub===2083323&&c1.disc===10000&&c1.base===2073323&&c1.tax===124399&&c1.total===2197722,'导入的报价计算：2.5×333.33=833.33(半入)，10×1999.99=19999.90，小计20833.23，折扣100，税6%=1243.99，总计21977.22');
S.quotes=r.add;
// 重复导入
const again=Core.importRows(S,'quotes',rd('quotes.csv'),uid); ok(again.add.length===0&&again.skip===2,'重复导入报价：全部跳过');
// 导出再导入往返
const ex=Core.toCSV(Core.exportRows(S,'quotes')); const S2={clients:S.clients,projects:S.projects,tasks:[],quotes:[]};
const rt=Core.importRows(S2,'quotes',Core.parseCSV(ex),uid); const t1=Core.calcQuote(rt.add[0]).total;
ok(rt.add.length===2&&t1===c1.total&&rt.add[0].items[0].q===250,'报价导出 CSV → 重新导入：行项目与总额一致');
const cx=Core.toCSV(Core.exportRows(S,'clients')); ok(/备注含,逗号和""引号""/.test(cx),'客户 CSV 导出转义');
ok(Core.toCSV([['=cmd|x','-5','abc']])==="'=cmd|x,-5,abc",'CSV 公式注入防护（负数保留）');
// 提醒
S.tasks.push({id:'tt',title:'今日任务',status:'待办',due:'2026-10-18'});
const rem=Core.reminders(S,'2026-10-18',3);
const find=t=>rem.filter(x=>x.text.indexOf(t)>=0)[0];
ok(find('出首页稿').level==='over'&&find('出首页稿').days===-2,'提醒：任务逾期 2 天');
ok(find('收集素材').level==='today','提醒：任务今天到期'); ok(!find('联调'),'提醒：已完成任务不提醒'); ok(!find('写需求文档'),'提醒：10-30 在 3 天窗口外');
ok(find('跟进客户：蓝鲸科技').level==='over','提醒：客户跟进逾期'); ok(find('跟进客户：星河设计').level==='soon'&&find('跟进客户：星河设计').days===2,'提醒：客户跟进 2 天后');
ok(find('报价到期：Q2026-0001').level==='soon'&&find('跟进报价：Q2026-0001').level==='today','提醒：已发送报价到期/跟进'); ok(!find('Q2026-0002'),'提醒：草稿报价不提醒');
ok(rem.every((x,i)=>i===0||rem[i-1].date<=x.date),'提醒按日期排序');
console.log(fails?('\n失败 '+fails+' 项'):'\n全部通过');process.exit(fails?1:0);
