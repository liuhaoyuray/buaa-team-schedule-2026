const paths = {
  home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-7H9v7H3z"/>',
  query: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  week: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-12 0v10m6-10v10"/>',
  planner: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-12 5 2 2 4-4"/>',
  duty: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2m6 2V2M8 10h8m-8 4h8m-8 4h4"/>',
  person: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
  directory: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
  hours: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7"/><path d="M3 8v13"/>',
  office: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8m-8 4h5m0 4h3m-8 0h1"/>',
  colleges: '<path d="m3 9 9-5 9 5-9 5zM6 11v6c3 3 9 3 12 0v-6m3-2v8"/>',
  awards: '<circle cx="12" cy="8" r="5"/><path d="m8 12-2 9 6-3 6 3-2-9"/>',
  league: '<path d="M4 20V4m0 16h16M8 16v-4m5 4V8m5 8v-6"/>',
  gallery: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-4 4 3 4-5 5 5"/>',
  lottery: '<path d="M4 10h16v11H4zM3 6h18v4H3zM12 6v15m0-15H8a2 2 0 1 1 2-2l2 2Zm0 0h4a2 2 0 1 0-2-2l-2 2Z"/>',
  settings: '<path d="M4 7h16M4 12h16M4 17h16M8 5v4m8 1v4m-6 1v4"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
  more: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>'
};

export function icon(id) {
  return '<svg class="ws-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[id]+'</svg>';
}

export const routes = {
  home: ['工作台首页', '打开常用操作'],
  query: ['查空闲', '按日期和时段查找空闲人员', '时段查询 查课表'],
  week: ['一周空闲总览', '按教学周比较各节次的空闲人数', '一周总览'],
  planner: ['共同排期', '为选中的同学找共同空闲的时间'],
  duty: ['本学期值班表', '查看、下载已确认的值班安排', '值班安排'],
  person: ['个人课表', '按姓名和教学周查看课程'],
  directory: ['人员名录', '查找两部门成员及联系方式'],
  hours: ['志愿时长导入', '按岗位和日期生成导入文件', '录时长 批量时长'],
  office: ['报销材料', '上传发票，生成报销材料包', '报销台账 财务'],
  colleges: ['学院系号与签领表', '查询系号，生成物资签领表', '学院代码'],
  awards: ['志愿服务荣誉库', '查找历年获奖人员、项目和团队', '志愿荣誉 五星级'],
  league: ['团统数据', '查询和导出各学院团员统计', '团员 研究生 本科生'],
  gallery: ['活动记录与照片', '查看或发布活动记录和照片', '照片墙 相册'],
  lottery: ['幸运抽奖', '选择人员名单，开始现场抽奖'],
  settings: ['校历与数据设置', '查看课表来源，设置停课或补课日期', '数据与校历']
};

export const groups = [
  {label:'人员与排班', ids:['query','week','planner','person','duty','directory'], sidebar:['query','planner','duty']},
  {label:'材料办理', ids:['hours','office','colleges'], sidebar:['hours','office','colleges']},
  {label:'档案与活动', ids:['awards','league','gallery'], sidebar:['awards','league','gallery']},
  {label:'其他工具', ids:['lottery','settings'], sidebar:[]}
];

export const common = ['query','hours','office','duty'];

export function routeLink(id, detail = false) {
  const [label, description] = routes[id];
  return '<a href="#'+id+'" data-ws-route="'+id+'"><span class="ws-route-icon">'+icon(id)+'</span>'+
    '<span class="ws-route-label"><strong>'+label+'</strong>'+(detail?'<small>'+description+'</small>':'')+'</span>'+
    (detail?'<span class="ws-route-arrow">'+icon('arrow')+'</span>':'')+'</a>';
}
