#!/usr/bin/env python3
"""独立于前端实现，用 Decimal 计算报价金额与大写，生成对照用例 + 导入用 CSV。"""
import json, random, os
from decimal import Decimal as Dc, ROUND_HALF_UP
random.seed(1018)
OUT = os.path.join(os.path.dirname(__file__), 'data'); os.makedirs(OUT, exist_ok=True)
def r2(x): return int((x * 100).quantize(Dc('1'), rounding=ROUND_HALF_UP))
def calc(items, disc, tax):
    lines = [int((Dc(q) * Dc(p) * 100).quantize(Dc('1'), rounding=ROUND_HALF_UP)) for q, p in items]
    sub = sum(lines); d = min(int(Dc(disc) * 100), max(sub, 0)); base = sub - d
    t = int((Dc(base) * Dc(tax) / Dc(100)).quantize(Dc('1'), rounding=ROUND_HALF_UP)); return dict(lines=lines, sub=sub, disc=d, base=base, tax=t, total=base + t)
cases = []
fixed = [
  ([('1','100.00')], '0', '0'),
  ([('2.5','333.33')], '0', '6'),                       # 833.325 -> 833.33 ; tax
  ([('3','0.01'), ('0.5','0.01')], '0', '13'),         # 半分四舍五入
  ([('10','1999.99'), ('1','5000')], '1000', '6'),
  ([('1','100'), ('1','200')], '9999', '0'),            # 折扣超过小计 -> 封顶
  ([('7','1234.56')], '0.01', '3'),
  ([('0.33','99.99')], '0', '6.5'),
  ([('1','100000000')], '0', '0'),
]
for items, disc, tax in fixed: cases.append(dict(items=[dict(q=a, p=b) for a, b in items], disc=disc, tax=tax, exp=calc(items, disc, tax)))
for _ in range(300):
    n = random.randint(1, 6)
    items = [(str(random.choice([1, 2, 3, 0.5, 1.5, 2.25, 10, 12.34, 0.01, 99])), '%d.%02d' % (random.randint(0, 99999), random.randint(0, 99))) for _ in range(n)]
    disc = random.choice(['0', '0', '%d.%02d' % (random.randint(0, 500), random.randint(0, 99))]); tax = random.choice(['0', '6', '3', '13', '1', '9', '6.5', '0.5'])
    cases.append(dict(items=[dict(q=a, p=b) for a, b in items], disc=disc, tax=tax, exp=calc(items, disc, tax)))
# 大写（独立实现：逐位 + 清理）
def cn(cents):
    if cents == 0: return '零元整'
    D = '零壹贰叁肆伍陆柒捌玖'; yuan, jf = divmod(cents, 100); jiao, fen = jf // 10, jf % 10
    s = ''
    if yuan:
        digits = str(yuan)[::-1]; parts = []
        units = ['', '拾', '佰', '仟']
        groups = [digits[i:i+4] for i in range(0, len(digits), 4)]
        gsuf = ['', '万', '亿', '万亿']
        txt = ''
        for gi in range(len(groups) - 1, -1, -1):
            g = groups[gi]; gs = ''
            for pi in range(len(g) - 1, -1, -1):
                d = int(g[pi]); gs += D[d] + (units[pi] if d else '')
            gs = gs.rstrip('零')
            while '零零' in gs: gs = gs.replace('零零', '零')
            if gs:
                # 本组不足千位且前面已有内容 -> 补零
                if txt and int(g[::-1]) < 1000 and not gs.startswith('零'): gs = '零' + gs
                txt += gs + gsuf[gi]
        s = txt + '元'
    if jiao == 0 and fen == 0: s += '整'
    else:
        if jiao: s += D[jiao] + '角'
        elif yuan: s += '零'
        s += (D[fen] + '分') if fen else '整'
    return s
nums = [1, 5, 10, 100, 105, 1005, 10001, 100001, 1000000, 10000100, 100010000, 123456789012, 20000, 20050, 99999999, 100000000, 1234567890123, 1000000000, 100000000000, 1, 999, 100100, 5000000, 7000000001]
upper = [dict(cents=c, text=cn(c)) for c in nums]
json.dump(dict(quotes=cases, upper=upper), open(OUT + '/cases.json', 'w'), ensure_ascii=False)
# 导入用 CSV（UTF-8 BOM），含问题行
open(OUT + '/clients.csv', 'wb').write(('\ufeff名称,公司,联系人,电话,邮箱,阶段,来源,下次跟进,最近联系,备注\n'
 '星河设计,星河设计工作室,陈小星,13800000001,a@x.com,合作中,朋友介绍,2026-10-20,2026-10-10,"备注含,逗号和""引号"""\n'
 '蓝鲸科技,蓝鲸科技有限公司,王蓝,13800000002,,洽谈中,官网,2026-10-17,,\n'
 '星河设计,重复行,,,,,,,,\n'
 '无效日期客户,,,,,线索,,2026/13/45,,\n'
 '怪阶段,,,,,神秘阶段,,,,\n'
 ',空名,,,,,,,,\n').encode('utf-8'))
open(OUT + '/projects.csv', 'wb').write(('\ufeff项目名称,客户,状态,开始日期,截止日期,预算(元),备注\n'
 '官网改版,星河设计,进行中,2026-09-01,2026-10-25,"12,000.50",\n'
 'App 原型,蓝鲸科技,待启动,,2026-11-30,8000,\n'
 '孤儿项目,新客户甲,进行中,,,,\n'
 '坏预算,星河设计,进行中,,,abc,\n').encode('utf-8'))
open(OUT + '/tasks.csv', 'wb').write(('\ufeff任务,项目,状态,优先级,截止日期,备注\n'
 '出首页稿,官网改版,进行中,高,2026-10-16,\n'
 '收集素材,官网改版,待办,中,2026-10-18,\n'
 '写需求文档,App 原型,待办,低,2026-10-30,\n'
 '联调,官网改版,已完成,高,2026-10-10,\n').encode('utf-8'))
open(OUT + '/quotes.csv', 'wb').write(('\ufeff编号,标题,客户,项目,状态,日期,有效期至,跟进日期,税率(%),折扣(元),行-名称,行-说明,行-数量,行-单位,行-单价(元),备注\n'
 'Q2026-0001,官网改版报价,星河设计,官网改版,已发送,2026-09-01,2026-10-19,2026-10-18,6,100,设计,首页+内页,2.5,天,333.33,含两轮修改\n'
 'Q2026-0001,,,,,,,,,,开发,响应式,10,天,1999.99,\n'
 'Q2026-0002,原型报价,蓝鲸科技,App 原型,草稿,2026-10-10,2026-11-10,,0,0,原型,Figma,1,项,8000,\n').encode('utf-8'))
print(len(cases), 'cases;', upper[:6])
