import OP from './core.js';
/* Sample project used to demonstrate the tool. */
OP.demo = function () {
  var M = OP.model;
  var p = M.blank();
  p.name = "圖書館預約系統（範例）";
  p.organization = "範例團隊";
  p.manager = 'A. Perera';
  p.start = OP.util.iso(OP.util.todayDn());
  p.issueDate = p.start;
  p.budget = 4000000;

  var R = {};
  [
    ['pm', 'A. Perera', "專案經理", 'Manager', 50, 8000, null],
    ['dev1', 'N. Silva', "開發主管", 'Full-time', 100, 7000, 'pm'],
    ['dev2', 'K. Fernando', "開發人員", 'Full-time', 100, 7000, 'dev1'],
    ['dev3', 'S. Jayasuriya', "介面與體驗設計師", 'Full-time', 100, 7000, 'dev1'],
    ['qa', 'R. Dias', "測試工程師", 'Part-time', 50, 7000, 'pm'],
    ['ba', 'M. Gunawardena', "需求分析師", 'Part-time', 50, 7000, 'pm'],
    ['ops', 'T. Wickrama', "維運工程師", 'Part-time', 50, 7000, 'pm'],
    ['doc', 'L. Bandara', "技術文件編輯", 'Supporter', 50, 5000, 'pm']
  ].forEach(function (d) {
    R[d[0]] = M.newResource(p, { name: d[1], initials: M.initials(d[1]), role: d[2], type: d[3], maxUnits: d[4], rate: d[5] });
    R[d[0]]._boss = d[6];
    p.resources.push(R[d[0]]);
  });
  p.resources.forEach(function (r) { r.reportsTo = r._boss ? R[r._boss].uid : null; delete r._boss; });

  var T = {};
  function add(key, level, name, duration, preds, assign, extra) {
    var t = M.newTask(p, { name: name, level: level, duration: duration });
    if (duration === 0) t.milestone = true;
    t.preds = (preds || []).map(function (k) {
      var parts = k.split(':');
      return { uid: T[parts[0]].uid, type: parts[1] || 'FS', lag: +(parts[2] || 0) };
    });
    t.assignments = (assign || []).map(function (a) {
      var parts = a.split(':');
      return { res: R[parts[0]].uid, units: +(parts[1] || 100) };
    });
    for (var k in extra) t[k] = extra[k];
    if (key) T[key] = t;
    p.tasks.push(t);
  }

  add('init', 1, "專案啟動", 0);
  add('kick', 2, "啟動會議", 1, [], ['pm:50', 'ba:50']);
  add('req', 2, "蒐集需求與使用者故事", 4, ['kick'], ['ba:50', 'dev1']);
  add('plan', 2, "規劃迭代與待辦清單", 2, ['req'], ['pm:50', 'dev1']);
  add('mInit', 2, "確認待辦清單", 0, ['plan']);

  add('s1', 1, "第 1 次迭代：預約功能", 0);
  add('arch', 2, "設計架構與資料庫", 3, ['mInit'], ['dev1', 'dev2']);
  add('ui1', 2, "繪製介面線框圖", 4, ['mInit'], ['dev3']);
  add('api', 2, "預約 API", 5, ['arch'], ['dev1', 'dev2']);
  add('scr', 2, "預約畫面", 5, ['ui1', 'arch'], ['dev3']);
  add('t1', 2, "第 1 次迭代測試", 3, ['api', 'scr'], ['qa:50']);
  add('m1', 2, "第 1 次迭代成果檢視", 0, ['t1']);

  add('s2', 1, "第 2 次迭代：通知與管理功能", 0);
  add('notif', 2, "通知服務", 5, ['m1'], ['dev2']);
  add('admin', 2, "管理儀表板", 6, ['m1'], ['dev1', 'dev3']);
  add('t2', 2, "第 2 次迭代測試", 3, ['notif', 'admin'], ['qa:50']);
  add('m2', 2, "第 2 次迭代成果檢視", 0, ['t2']);

  add('sup', 1, "支援作業", 0);
  add('cm', 2, "組態管理", 5, ['mInit'], ['ops:50'], {});
  add('docs', 2, "使用手冊", 5, ['m1'], ['doc:50']);
  add('deploy', 2, "部署與移交", 2, ['m2', 'docs'], ['ops:50', 'pm:50']);
  add('done', 2, "專案結案", 0, ['deploy']);

  // Summary rows were added with duration 0 above; they are computed from children.
  p.tasks.forEach(function (t, i) { if (M.isSummary(p, i)) { t.milestone = false; t.duration = 1; } });
  return p;
};
