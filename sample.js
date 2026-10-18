/* 示例数据：日期相对“今天”生成，让提醒立刻可见。载入后可在“数据”页一键清空。 */
window.makeSample = function (today, Core) {
  var n = 0, id = function () { return 's' + (++n); }, d = function (k) { return Core.addDays(today, k); };
  var c = [
    { id: id(), name: '星河设计工作室', company: '星河设计工作室', contact: '陈小星', phone: '13800000001', email: 'xing@example.com', stage: '合作中', source: '朋友介绍', follow: d(2), last: d(-6), note: '偏好微信沟通，周五不回消息' },
    { id: id(), name: '蓝鲸科技', company: '蓝鲸科技有限公司', contact: '王蓝', phone: '13800000002', email: 'wang@example.com', stage: '洽谈中', source: '官网咨询', follow: d(-2), last: d(-9), note: '对 App 原型报价有顾虑，等预算批复' },
    { id: id(), name: '青禾咖啡', company: '青禾餐饮管理', contact: '周青', phone: '13800000003', email: '', stage: '线索', source: '展会', follow: d(5), last: '', note: '' },
    { id: id(), name: '山海文化', company: '山海文化传媒', contact: '李山', phone: '13800000004', email: 'li@example.com', stage: '已完成', source: '老客户', follow: '', last: d(-40), note: '去年品牌册项目，回款已结清' },
    { id: id(), name: '林先生（个人）', company: '', contact: '林先生', phone: '13800000005', email: '', stage: '暂停', source: '微信群', follow: d(-20), last: d(-60), note: '预算不足，明年再聊' }
  ];
  var p = [
    { id: id(), name: '官网改版', client: c[0].id, status: '进行中', start: d(-30), due: d(9), budget: 2197722, note: '首页+6个内页，响应式' },
    { id: id(), name: '品牌视觉升级', client: c[0].id, status: '待验收', start: d(-60), due: d(-1), budget: 880000, note: '' },
    { id: id(), name: 'App 原型', client: c[1].id, status: '待启动', start: '', due: d(40), budget: 800000, note: '' },
    { id: id(), name: '门店菜单设计', client: c[2].id, status: '待启动', start: '', due: '', budget: null, note: '' },
    { id: id(), name: '品牌册 2025', client: c[3].id, status: '已完成', start: d(-300), due: d(-250), budget: 1500000, note: '' }
  ];
  var t = function (title, pi, st, pri, due, note) { return { id: id(), title: title, project: pi == null ? '' : p[pi].id, status: st, pri: pri, due: due, note: note || '' }; };
  var tasks = [
    t('出首页设计稿', 0, '进行中', '高', d(-2)), t('收集客户素材', 0, '待办', '中', d(0)), t('内页切图', 0, '待办', '中', d(6)), t('前端开发联调', 0, '待办', '高', d(8)),
    t('需求访谈整理', 0, '已完成', '高', d(-20)), t('提交验收稿', 1, '等待中', '高', d(1), '等客户反馈'), t('修改标志细节', 1, '进行中', '中', d(2)),
    t('写需求文档', 2, '待办', '低', d(30)), t('做竞品调研', 2, '待办', '中', ''), t('发票开具', 1, '待办', '中', d(3)), t('菜单拍照素材确认', 3, '待办', '低', ''), t('整理年度作品集', null, '待办', '低', d(14), '个人事务，不属于任何项目')
  ];
  var it = function (nm, ds, q, u, pr) { return { n: nm, d: ds, q: q, u: u, p: pr }; };
  var q = [
    { id: id(), no: 'Q2026-0001', title: '官网改版报价', client: c[0].id, project: p[0].id, status: '已接受', date: d(-45), valid: d(-30), follow: '', tax: 600, disc: 10000, note: '含两轮修改', items: [it('页面设计', '首页+6个内页', 250, '天', 33333), it('前端开发', '响应式，含适配', 1000, '天', 199999)] },
    { id: id(), no: 'Q2026-0002', title: 'App 原型报价', client: c[1].id, project: p[2].id, status: '已发送', date: d(-9), valid: d(3), follow: d(-1), tax: 600, disc: 0, note: '', items: [it('交互原型', 'Figma，约 20 屏', 100, '项', 600000), it('用户流程梳理', '', 200, '天', 100000)] },
    { id: id(), no: 'Q2026-0003', title: '品牌视觉升级报价', client: c[0].id, project: p[1].id, status: '已接受', date: d(-75), valid: d(-60), follow: '', tax: 0, disc: 0, note: '', items: [it('标志优化', '', 100, '项', 380000), it('VI 手册', '', 100, '套', 500000)] },
    { id: id(), no: 'Q2026-0004', title: '菜单设计报价', client: c[2].id, project: p[3].id, status: '草稿', date: d(0), valid: d(15), follow: '', tax: 300, disc: 0, note: '', items: [it('菜单设计', 'A4 双面', 100, '项', 120000), it('印刷对接', '', 50, '天', 80000)] },
    { id: id(), no: 'Q2026-0005', title: '个人作品集网站', client: c[4].id, project: '', status: '已拒绝', date: d(-70), valid: d(-55), follow: '', tax: 0, disc: 0, note: '', items: [it('网站搭建', '', 100, '项', 450000)] },
    { id: id(), no: 'Q2026-0006', title: '品牌册 2025', client: c[3].id, project: p[4].id, status: '已过期', date: d(-320), valid: d(-300), follow: '', tax: 600, disc: 0, note: '', items: [it('设计排版', '', 100, '本', 1415094)] }
  ];
  return { clients: c, projects: p, tasks: tasks, quotes: q, seq: 1000 };
};
