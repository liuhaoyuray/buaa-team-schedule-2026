import sys,json,openpyxl,re,hashlib
from pathlib import Path
if len(sys.argv)!=4: raise SystemExit('usage: extract.py undergraduate.xlsx graduate.xlsx output.json')
files={'本科生':Path(sys.argv[1]),'研究生':Path(sys.argv[2])};records=[];comparisons=[];sources=[];audits=[];origins={}
def num(v):
 if isinstance(v,(int,float)) and not isinstance(v,bool):return v
 if isinstance(v,str):
  t=v.strip().replace('−','-').replace('，',',').replace(',','')
  try:return float(t[:-1])/100 if t.endswith('%') else float(t)
  except ValueError:return None
 return None
def s(v):return str(v).strip() if v is not None else ''
def merged_value(sheet,row,col):
 value=sheet.cell(row,col).value
 if value is not None:return value
 for area in sheet.merged_cells.ranges:
  if area.min_row<=row<=area.max_row and area.min_col<=col<=area.max_col:return sheet.cell(area.min_row,area.min_col).value
 return None
for kind,path in files.items():
 w=openpyxl.load_workbook(path,data_only=True);sheet=w.worksheets[0];cmp=w.worksheets[2];source=path.name
 sources.append({'file':source,'sheet':sheet.title.strip(),'comparison':cmp.title,'cutoff':'2026-10-12' if kind=='本科生' else '2026-10-14','sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 college=None;code=None;summary=[]
 for row in sheet.iter_rows(min_row=5,values_only=False):
  vals=[c.value for c in row];v=vals+[None]*max(0,18-len(vals));n=row[0].row;level=s(v[4]);
  if s(v[0]) in ('总计','年级','学生数','青年数','团员数','团青比','团总支总数','团支部总数','兼职团干部总数','新发展团员数'):
   summary.append({'row':n,'cells':[s(x) for x in v[:17]]});continue
  if v[0] is not None and isinstance(v[0],(int,float)):code=s(v[0]);college=s(v[1])
  if not college or not (re.fullmatch(r'20\d\d级',level) if kind=='本科生' else level in ('硕士','博士','合计')):continue
  if kind=='本科生':
   rec={'kind':kind,'code':code,'college':college,'level':level,'branchesGeneral':num(v[2]),'branches':num(v[3]),'students':num(v[5]),'members':num(v[6]),'newMembers':num(v[7]),'cadres':num(v[8]),'youthRatioOriginal':num(v[9]),'studentRatioOriginal':None,'remark':s(merged_value(sheet,n,11)),'row':n}
  else:
   rec={'kind':kind,'code':code,'college':college,'level':level,'branchesGeneral':num(v[2]),'branches':num(v[3]),'freshStudents':num(v[5]),'otherStudents':num(v[6]),'freshMembers':num(v[7]),'otherMembers':num(v[8]),'newMembers':num(v[9]),'cadres':num(v[10]),'youthRatioOriginal':num(v[11]),'studentRatioOriginal':num(v[12]),'members':num(v[13]),'youthOriginal':num(v[14]),'students':num(v[15]),'remark':s(merged_value(sheet,n,17)),'row':n}
  records.append(rec)
 for row in cmp.iter_rows(min_row=3,values_only=False):
  v=[c.value for c in row];v+= [None]*max(0,24-len(v));name=s(v[0]);level=s(v[1]);
  if not name or name=='总计' or level not in ['本科生','研究生']:continue
  fields=['branchesGeneral','branches','students']+(['masters','doctor'] if kind=='研究生' else [])+['members','cadres']
  metrics={}
  for i,k in enumerate(fields):
   pos=2+i*3;metrics[k]={'current':num(v[pos]),'previous':num(v[pos+1]),'changeOriginal':s(v[pos+2])}
  comparisons.append({'kind':kind,'college':name,'metrics':metrics,'remark':s(v[23 if kind=='研究生' else 17]),'row':row[0].row})
 origins[kind]=summary
# Preserve invalid ratio values instead of silently interpreting them as percentages.
for r in records:
 for field in ['youthRatioOriginal','studentRatioOriginal']:
  value=r.get(field)
  if value is not None and not 0<=value<=1:
   audits.append({'kind':r['kind'],'college':r['college'],'issue':'原表比例超出0%—100%，需要核对','field':field,'detail':value,'row':r['row']})
# Preserve errors without substituting main-year values with the comparison sheet.
for r in records:
 if r['kind']=='研究生' and r['level']=='合计':
  detail=[x for x in records if x['kind']==r['kind'] and x['college']==r['college'] and x['level'] in ('硕士','博士')]
  for field in ['students','members','branches','newMembers','cadres']:
   if len(detail)==2 and r[field] is not None and all(x[field] is not None for x in detail) and abs(r[field]-sum(x[field] for x in detail))>0.001:
    audits.append({'kind':'研究生','college':r['college'],'issue':'合计与硕士、博士之和不一致','field':field,'total':r[field],'detail':sum(x[field] for x in detail),'row':r['row']})
for c in comparisons:
 main=[r for r in records if r['kind']==c['kind'] and r['college']==c['college'] and (r['kind']=='本科生' or r['level']=='合计')]
 if not main:continue
 for field in ['branchesGeneral','branches','students','members','cadres']:
  values=[x[field] for x in main];a=sum(values) if all(x is not None for x in values) else None;b=c['metrics'][field]['current']
  if a is not None and b is not None and abs(a-b)>0.001:audits.append({'kind':c['kind'],'college':c['college'],'issue':'2026明细表与对比表不一致','field':field,'detail':a,'comparison':b,'row':c['row']})
for kind in ['本科生','研究生']:
 rr=[r for r in records if r['kind']==kind and (kind=='本科生' or r['level']=='合计')]
 for field,rowname,col in [('students','总计',5),('members','总计',6)] if kind=='本科生' else [('students','学生数',8),('members','团员数',8)]:
  summary=next((r for r in origins[kind] if r['cells'][0]==rowname),None)
  if summary:
   reported=num(summary['cells'][col]);calculated=sum(r[field] for r in rr if r[field] is not None)
   if reported is not None and abs(reported-calculated)>0.001:audits.append({'kind':kind,'college':'全校','issue':'表尾总数与逐学院合计之和不一致','field':field,'detail':calculated,'reported':reported,'row':summary['row']})
for kind in ['本科生','研究生']:
 codes={}
 for r in records:codes.setdefault((kind,r['code']),set()).add(r['college']) if r['kind']==kind else None
 for (_,code),names in codes.items():
  if len(names)>1:audits.append({'kind':kind,'college':' / '.join(sorted(names)),'issue':'相同系号对应多个单位','field':'code','detail':code})
for college in sorted({r['college'] for r in records}):
 codes={kind:sorted({r['code'] for r in records if r['kind']==kind and r['college']==college}) for kind in ['本科生','研究生']}
 if all(codes.values()) and codes['本科生']!=codes['研究生']:
  audits.append({'kind':'本科生 / 研究生','college':college,'issue':'同一单位在本科、研究生表中的系号不同','field':'code','detail':'本科 '+','.join(codes['本科生'])+'；研究生 '+','.join(codes['研究生'])})
data={'sources':sources,'records':records,'comparisons':comparisons,'sourceSummaries':origins,'audits':audits,'notes':['本科生数据截至2026-10-12，研究生数据截至2026-10-14。','团青比为团员数除以28周岁以下青年数；本科生原表未提供各行青年数，不能用学生总数替代。','2025与2026对比使用各自对比表原值；明细查询使用2026明细表。','研究生合计行包含硕士和博士；本科生以年级行汇总。','青年数原表部分为按比例反推的小数，不作为精确人数汇总。']}
Path(sys.argv[3]).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(json.dumps({'records':len(records),'comparisons':len(comparisons),'audits':len(audits),'undergrad':sum(r['students'] or 0 for r in records if r['kind']=='本科生'),'undergrad_members':sum(r['members'] or 0 for r in records if r['kind']=='本科生'),'grad':sum(r['students'] or 0 for r in records if r['kind']=='研究生' and r['level']=='合计'),'grad_members':sum(r['members'] or 0 for r in records if r['kind']=='研究生' and r['level']=='合计')},ensure_ascii=False))
