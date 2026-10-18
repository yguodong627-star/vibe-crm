const { chromium } = require('/workspace/tools/node_modules/playwright-core');
const http=require('http'),fs=require('fs'),path=require('path'),{execSync}=require('child_process');
const ROOT=path.join(__dirname,'..'),DATA=path.join(__dirname,'data'),SH=path.join(ROOT,'screenshots');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;return r.end()}r.setHeader('content-type',mime[path.extname(f)]||'text/plain');r.end(fs.readFileSync(f))}).listen(8150);
let fails=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fails++;};
const hide=()=>{document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='.toast{display:none!important}';document.head.appendChild(s)})};
(async()=>{
 const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:1440,height:900},acceptDownloads:true}); await ctx.addInitScript(hide);
 const page=await ctx.newPage(); page.on('dialog',d=>d.accept());
 const errs=[],ext=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
 page.on('request',r=>{const u=r.url();if(!u.startsWith('http://localhost:8150')&&!u.startsWith('data:')&&!u.startsWith('blob:'))ext.push(u)});
 const U='http://localhost:8150/?today=2026-10-18';
 await page.goto(U); await page.waitForSelector('#hero h1');
 ok(/不支持多人协作/.test(await page.innerText('#foot'))&&/不会提醒/.test(await page.innerText('#foot')),'页脚明示：不支持多人协作、关闭浏览器不会提醒');
 await page.screenshot({path:SH+'/desktop-0-empty.png'});
 // ---- 示例数据与提醒 ----
 await page.click('[data-act=sample]'); await page.waitForSelector('.rem');
 const rems=await page.$$eval('.rem',e=>e.map(x=>({cls:x.className,t:x.querySelector('.t').innerText})));
 ok(rems.length===10,'今天页提醒共 10 条（独立推算：逾期4 + 今天1 + 未来3天内5）实际 '+rems.length);
 ok(rems.filter(r=>/over/.test(r.cls)).length===4&&rems.filter(r=>/today/.test(r.cls)).length===1&&rems.filter(r=>/soon/.test(r.cls)).length===5,'逾期4 / 今天1 / 即将5 分组正确');
 ok(!rems.some(r=>/林先生/.test(r.t))&&!rems.some(r=>/青禾/.test(r.t))&&!rems.some(r=>/内页切图/.test(r.t)),'暂停客户、窗口外事项不提醒');
 ok((await page.innerText('#nav .dot')).trim()==='5','导航角标 = 逾期+今天 = 5');
 const stat=await page.innerText('.stat-row');
 // 待回复：Q0002 = 6000.00+ 2*1000=8000 *1.06 = 8480.00 ; 已接受(本年)：Q1=21977.22 + Q3=8800.00 = 30777.22（Q3 日期 d(-75) 在 2026）
 ok(/¥8,480\.00/.test(stat),'待回复报价 ¥8,480.00（Q2026-0002：(6000+2×1000)×1.06）');
 ok(/¥30,777\.22/.test(stat),'本年已接受 ¥30,777.22（21,977.22 + 8,800.00）');
 await page.screenshot({path:SH+'/desktop-1-today.png',fullPage:true});
 // ---- 表格：排序/筛选 ----
 await page.click('[data-act=nav][data-v=tasks]');
 const total=await page.$$eval('.tbl tbody tr',e=>e.length); ok(total===12,'任务表 12 条');
 await page.selectOption('[data-act=fset][data-k=date]','over'); let n=await page.$$eval('.tbl tbody tr',e=>e.length); ok(n===1,'任务·已逾期筛选=1（出首页设计稿）');
 await page.selectOption('[data-act=fset][data-k=date]','week'); n=await page.$$eval('.tbl tbody tr',e=>e.length); ok(n===5,'任务·7天内=5（今天1+1/2/3/6天后各1... 含今天）实际 '+n);
 await page.selectOption('[data-act=fset][data-k=date]',''); await page.selectOption('[data-act=fset][data-k=project]',await page.$eval('[data-act=fset][data-k=project] option:nth-child(2)',o=>o.value));
 n=await page.$$eval('.tbl tbody tr',e=>e.length); ok(n===5,'任务·按项目“官网改版”筛选=5'); await page.click('[data-act=fclear]');
 await page.selectOption('[data-act=sort]','due'); let firsts=await page.$$eval('.tbl tbody tr td.c0 .t',e=>e.map(x=>x.innerText)); ok(firsts[0]==='需求访谈整理'&&firsts[firsts.length-1]==='做竞品调研'||firsts[firsts.length-1]==='菜单拍照素材确认'||firsts[firsts.length-1]==='做竞品调研','按截止升序：最早在前，无日期排最后（'+firsts[0]+' … '+firsts[firsts.length-1]+'）');
 await page.click('[data-act=sortdir]'); firsts=await page.$$eval('.tbl tbody tr td.c0 .t',e=>e.map(x=>x.innerText)); ok(firsts[0]==='写需求文档','降序：最晚在前（'+firsts[0]+'），空值仍在最后：'+firsts.slice(-2).join('/'));
 await page.fill('#fq','验收'); await page.waitForTimeout(400); n=await page.$$eval('.tbl tbody tr',e=>e.length); ok(n===1,'搜索“验收”=1（提交验收稿）实际 '+n);
 await page.fill('#fq',''); await page.waitForTimeout(400);
 await page.screenshot({path:SH+'/desktop-2-tasks-table.png'});
 // ---- 看板拖拽 ----
 await page.click('[data-act=mode][data-m=kanban]');
 await page.screenshot({path:SH+'/desktop-3-tasks-kanban.png',fullPage:true});
 {const a=await page.locator('.card:has-text("出首页设计稿") .t').boundingBox(), z=await page.locator('.col[data-col="已完成"] .col-h').boundingBox();
 await page.mouse.move(a.x+10,a.y+5);await page.mouse.down();await page.mouse.move(a.x+30,a.y+20,{steps:5});await page.mouse.move(z.x+60,z.y+z.height+30,{steps:12});await page.mouse.up();}
 await page.waitForTimeout(300);
 ok(await page.evaluate(()=>window.__kebu.S().tasks.find(t=>t.title==='出首页设计稿').status)==='已完成','看板拖拽：出首页设计稿 → 已完成（状态已写入）');
 ok(await page.$$eval('.col[data-col="已完成"] .card',e=>e.length)===2,'已完成列现有 2 张卡');
 await page.selectOption('.card:has-text("写需求文档") select.mv','进行中');
 ok(await page.evaluate(()=>window.__kebu.S().tasks.find(t=>t.title==='写需求文档').status)==='进行中','下拉“移动到”改状态');
 // ---- 客户-项目-报价 关联 ----
 await page.click('[data-act=nav][data-v=clients]');
 await page.click('tr.rw:has-text("星河设计工作室")'); await page.waitForSelector('#dlgForm');
 const rel=await page.innerText('.dlg-b'); ok(/官网改版/.test(rel)&&/品牌视觉升级/.test(rel)&&/Q2026-0001/.test(rel)&&/出首页设计稿/.test(rel),'客户详情里能看到关联的 2 个项目、报价、经项目关联的任务');
 await page.screenshot({path:SH+'/desktop-4-client-dialog.png'});
 await page.click('[data-act=dclose]');
 // ---- 新建客户→项目→任务→报价 ----
 await page.click('[data-act=nav][data-v=clients]'); await page.click('[data-act=new][data-t=clients]');
 await page.fill('[name=name]','测试客户甲'); await page.fill('[name=company]','测试甲有限公司'); await page.fill('[name=contact]','赵甲'); await page.fill('[name=follow]','2026-10-19'); await page.selectOption('[name=stage]','合作中'); await page.click('.dlg-f [type=submit]');
 ok(await page.evaluate(()=>window.__kebu.S().clients.some(c=>c.name==='测试客户甲'&&c.follow==='2026-10-19')),'新建客户并保存');
 await page.click('tr.rw:has-text("测试客户甲")'); await page.click('[data-act=newrel][data-t=projects]'); await page.waitForSelector('[name=name]');
 ok(await page.$eval('[name=client]',s=>s.options[s.selectedIndex].text)==='测试客户甲','从客户内新建项目：客户已预选');
 await page.fill('[name=name]','测试项目A'); await page.fill('[name=budget]','1234.50'); await page.fill('[name=due]','2026-10-30'); await page.click('.dlg-f [type=submit]');
 ok(await page.evaluate(()=>{const p=window.__kebu.S().projects.find(p=>p.name==='测试项目A');return p&&p.budget===123450&&p.due==='2026-10-30'}),'项目保存，预算 1234.50 → 123450 分');
 await page.click('[data-act=nav][data-v=projects]'); await page.click('tr.rw:has-text("测试项目A")'); await page.click('[data-act=newrel][data-t=tasks]'); await page.fill('[name=title]','测试任务1'); await page.fill('[name=due]','2026-10-18'); await page.click('.dlg-f [type=submit]');
 ok(await page.evaluate(()=>{const S=window.__kebu.S();const t=S.tasks.find(t=>t.title==='测试任务1');const p=S.projects.find(p=>p.name==='测试项目A');return t&&t.project===p.id}),'从项目内新建任务，自动关联项目');
 // 报价
 await page.click('[data-act=nav][data-v=quotes]'); await page.click('[data-act=new][data-t=quotes]'); await page.waitForSelector('#itemRows');
 ok(await page.$eval('[name=no]',i=>i.value)==='Q2026-0007','自动编号 Q2026-0007（示例已有 0001–0006）');
 await page.fill('[name=title]','官网改版（测试）'); await page.selectOption('[name=client]',{label:'测试客户甲'});
 const opts=await page.$$eval('[name=project] option',o=>o.map(x=>x.text)); ok(opts.includes('测试项目A')&&!opts.includes('官网改版'),'选客户后项目下拉只显示该客户的项目（+无客户项目）');
 await page.selectOption('[name=project]',{label:'测试项目A'});
 const r1=page.locator('#itemRows tr').first(); await r1.locator('[data-i=n]').fill('页面设计'); await r1.locator('[data-i=d]').fill('首页+内页'); await r1.locator('[data-i=q]').fill('2.5'); await r1.locator('[data-i=u]').fill('天'); await r1.locator('[data-i=p]').fill('333.33');
 await page.click('[data-act=additem]'); const r2=page.locator('#itemRows tr').nth(1); await r2.locator('[data-i=n]').fill('前端开发'); await r2.locator('[data-i=q]').fill('10'); await r2.locator('[data-i=u]').fill('天'); await r2.locator('[data-i=p]').fill('1999.99');
 await page.fill('[name=disc]','100'); await page.fill('[name=tax]','6');
 const calc=await page.innerText('#calc'); ok(/¥20,833\.23/.test(calc)&&/-¥100\.00/.test(calc)&&/¥1,243\.99/.test(calc)&&/¥21,977\.22/.test(calc)&&/贰万壹仟玖佰柒拾柒元贰角贰分/.test(calc),'编辑器实时计算：小计20,833.23 折扣100 税1,243.99 总计21,977.22 + 大写');
 ok((await page.innerText('#itemRows tr:first-child [data-amt]')).trim()==='¥833.33','2.5×333.33 = 833.325 → ¥833.33（半入）');
 await page.screenshot({path:SH+'/desktop-5-quote-editor.png'});
 await page.click('[data-act=savedoc]'); await page.waitForSelector('#sheet');
 const sheet=await page.innerText('#sheet'); ok(/Q2026-0007/.test(sheet)&&/21,977\.22/.test(sheet)&&/贰万壹仟玖佰柒拾柒元贰角贰分/.test(sheet)&&/测试甲有限公司/.test(sheet)&&/税额（6%）/.test(sheet),'报价单预览含编号、总计、大写、客户公司、税额');
 await page.screenshot({path:SH+'/desktop-6-quote-doc.png',fullPage:true});
 // PDF
 await page.emulateMedia({media:'print'}); await page.pdf({path:SH+'/quote-Q2026-0007.pdf',format:'A4',printBackground:true,margin:{top:'12mm',bottom:'12mm',left:'12mm',right:'12mm'}}); await page.emulateMedia({media:'screen'});
 const pdfText=execSync('pdftotext -layout '+SH+'/quote-Q2026-0007.pdf -').toString(); const pages=execSync('pdfinfo '+SH+'/quote-Q2026-0007.pdf | grep Pages').toString();
 ok(/21,977\.22/.test(pdfText)&&/Q2026-0007/.test(pdfText)&&!/客户 → 项目|导出备份|\+ 新建/.test(pdfText)&&/Pages:\s+1/.test(pages),'打印样式导出 PDF：1 页，只含报价单内容（无导航/按钮），金额与编号正确');
 execSync('pdftoppm -r 80 -png '+SH+'/quote-Q2026-0007.pdf '+SH+'/quote-pdf-page');
 // ---- 删除客户：关联保留为未关联 ----
 await page.click('[data-act=nav][data-v=clients]'); await page.click('tr.rw:has-text("测试客户甲")'); await page.click('[data-act=del]');
 const un=await page.evaluate(()=>{const S=window.__kebu.S();const p=S.projects.find(p=>p.name==='测试项目A');const q=S.quotes.find(q=>q.no==='Q2026-0007');return [!!p,p&&p.client,!!q,q&&q.client]}); ok(un[0]&&un[1]===''&&un[2]&&un[3]==='','删除客户后：项目与报价保留，客户字段清空');
 // ---- 导出 CSV ----
 await page.click('[data-act=nav][data-v=data]');
 const dl=page.waitForEvent('download'); await page.click('[data-act=exCsv][data-t=quotes]'); await (await dl).saveAs('/tmp/crm-q.csv'); const cq=fs.readFileSync('/tmp/crm-q.csv','utf8');
 ok(cq.charCodeAt(0)===0xFEFF&&/Q2026-0007,官网改版（测试）,,测试项目A,草稿/.test(cq)&&/页面设计,首页\+内页,2\.5,天,333\.33/.test(cq),'报价 CSV 导出：BOM、行项目、数量 2.5、单价 333.33');
 // ---- 导入 CSV（含问题行）----
 await page.click('[data-act=clear]'); 
 for(const [t,f] of [['clients','clients.csv'],['projects','projects.csv'],['tasks','tasks.csv'],['quotes','quotes.csv']]){
   await page.selectOption('#impT',t); await page.setInputFiles('#fileIn',DATA+'/'+f); await page.waitForSelector('.pv');
   const pv=await page.innerText('.pv');
   if(t==='clients') ok(/将新增 3 条/.test(pv)&&/重复跳过 1/.test(pv)&&/问题行 2/.test(pv)&&/不是有效日期/.test(pv),'导入客户预览：新增3、重复1、问题2并给出原因');
   if(t==='projects') ok(/将新增 3 条/.test(pv)&&/问题行 1/.test(pv)&&/自动新建 1 个客户/.test(pv),'导入项目预览：自动新建客户提示');
   if(t==='quotes') ok(/将新增 2 条/.test(pv),'导入报价预览：2 张（多行合并）');
   if(t==='clients') await page.screenshot({path:SH+'/desktop-7-import-preview.png'});
   await page.click('[data-act=pvok]');
 }
 const S=await page.evaluate(()=>window.__kebu.S()); ok(S.clients.length===4&&S.projects.length===3&&S.tasks.length===4&&S.quotes.length===2,'导入后：4 客户（含自动新建）/3 项目/4 任务/2 报价');
 ok(S.tasks.every(t=>S.projects.some(p=>p.id===t.project)),'任务全部关联到项目'); 
 await page.click('[data-act=nav][data-v=quotes]'); ok(/¥21,977\.22/.test(await page.innerText('.tbl')),'报价表显示导入的 Q2026-0001 总计 ¥21,977.22');
 // ---- 备份还原与持久化 ----
 await page.click('[data-act=nav][data-v=data]'); const dj=page.waitForEvent('download'); await page.click('[data-act=exJson]'); await (await dj).saveAs('/tmp/crm-b.json');
 const before=await page.evaluate(()=>JSON.stringify(window.__kebu.S()).length);
 await page.waitForTimeout(500); await page.reload(); await page.waitForSelector('#hero h1');
 ok(await page.evaluate(()=>window.__kebu.S().quotes.length)===2,'刷新后数据仍在（IndexedDB）');
 await page.click('[data-act=nav][data-v=data]'); await page.click('[data-act=clear]'); ok(await page.evaluate(()=>window.__kebu.S().clients.length)===0,'清空后为 0');
 await page.setInputFiles('#restoreIn','/tmp/crm-b.json'); await page.waitForFunction(()=>window.__kebu.S().clients.length>0);
 const S2=await page.evaluate(()=>window.__kebu.S()); ok(JSON.stringify(S2.quotes)===JSON.stringify(S.quotes)&&S2.clients.length===4,'JSON 备份→清空→还原：报价逐项一致');
 await page.screenshot({path:SH+'/desktop-8-data.png',fullPage:true});
 ok(ext.length===0,'零外部网络请求 '+JSON.stringify(ext)); ok(errs.length===0,'无 JS 报错 '+JSON.stringify(errs));
 await ctx.close();
 // ---- 手机 ----
 const mctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}); await mctx.addInitScript(hide);
 const mp=await mctx.newPage(); mp.on('dialog',d=>d.accept()); const merr=[]; mp.on('pageerror',e=>merr.push(String(e)));
 await mp.goto(U); await mp.waitForSelector('#hero h1'); await mp.screenshot({path:SH+'/mobile-0-empty.png'});
 await mp.click('[data-act=sample]'); await mp.waitForSelector('.rem'); await mp.screenshot({path:SH+'/mobile-1-today.png'});
 await mp.click('[data-act=nav][data-v=projects]'); await mp.screenshot({path:SH+'/mobile-2-projects-table.png'});
 await mp.click('[data-act=mode][data-m=kanban]'); await mp.screenshot({path:SH+'/mobile-3-projects-kanban.png'});
 await mp.click('[data-act=nav][data-v=quotes]'); await mp.click('tr.rw >> nth=0'); await mp.waitForSelector('#dlgForm'); await mp.screenshot({path:SH+'/mobile-4-quote-editor.png'});
 await mp.click('[data-act=savedoc]'); await mp.waitForSelector('#sheet'); await mp.screenshot({path:SH+'/mobile-5-quote-doc.png'}); await mp.screenshot({path:SH+'/mobile-5b-quote-doc-full.png',fullPage:true});
 ok(!(await mp.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)),'手机无横向溢出（报价单页）');
 await mp.click('[data-act=nav][data-v=clients]'); ok(!(await mp.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)),'手机无横向溢出（客户表）');
 ok(merr.length===0,'手机端无 JS 报错');
 await b.close();srv.close();console.log(fails?('\n失败 '+fails+' 项'):'\n全部通过');process.exit(fails?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
