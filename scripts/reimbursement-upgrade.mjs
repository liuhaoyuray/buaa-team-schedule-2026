import fs from 'node:fs/promises';
import path from 'node:path';
export async function applyReimbursementUpgrade(root,template,app){
 const feature=path.join(root,'features/reimbursement'),output=path.join(root,'public');
 await fs.cp(feature,path.join(output,'reimbursement'),{recursive:true,filter:source=>path.basename(source)!=='index.html'});
 await fs.rm(path.join(output,'reimbursement/index.html'),{force:true});
 await fs.copyFile(path.join(feature,'index.html'),path.join(output,'reimbursement.html'));
 // Standalone document lives at the site root; modules and templates live alongside each other.
 template=template.replaceAll('报销台账</button>','报销材料</button>').replaceAll('报销台账</strong>','报销材料</strong>').replaceAll('发票、材料与办理进度，集中管理。','上传发票，直接生成整套材料。').replaceAll('免登录 · 云端同步','本机处理 · ZIP下载');
 app=app.replaceAll('["报销台账","免登录整理报销材料，云端同步办理进度。"]','["报销材料","上传发票，直接生成填好的整套材料。"]');
 return {template,app};
}
