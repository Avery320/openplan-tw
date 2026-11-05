import OP from '../core';
import type { Project } from '../types';

const M = OP.model;

// [outline level, task name, duration in days (0 = milestone), predecessors by row ID]
type Line = [number, string, number, string?];

export interface Template { id: string; name: string; desc: string; tasks: Line[] }

export const TEMPLATES: Template[] = [
  {
    id: 'fyp', name: "畢業專題", desc: "從提案、研究製作到撰寫報告與繳交。",
    tasks: [
      [1, "提案", 1], [2, "選定題目與指導老師", 5], [2, "文獻回顧", 10, '2'], [2, "撰寫專題計畫書", 5, '3'],
      [2, "提案通過", 0, '4'],
      [1, "研究與製作", 1], [2, "需求分析與設計", 10, '5'], [2, "製作成果或執行實驗", 25, '7'], [2, "測試與評估", 10, '8'],
      [1, "撰寫報告", 1], [2, "撰寫報告初稿", 15, '9'], [2, "取得指導老師回饋", 5, '11'], [2, "完成報告與簡報", 7, '12'],
      [2, "繳交成果", 0, '13']
    ]
  },
  {
    id: 'sprint', name: "軟體開發迭代", desc: "兩輪設計、開發與檢視，最後發布版本。",
    tasks: [
      [1, "第 1 次迭代", 1], [2, "迭代規劃", 1], [2, "設計", 2, '2'], [2, "開發", 5, '3'], [2, "程式碼審查與測試", 2, '4'],
      [2, "迭代成果檢視", 1, '5'],
      [1, "第 2 次迭代", 1], [2, "迭代規劃", 1, '6'], [2, "開發", 6, '8'], [2, "程式碼審查與測試", 2, '9'], [2, "迭代成果檢視", 1, '10'],
      [1, "發布", 1], [2, "發布前準備", 2, '11'], [2, "部署至正式環境", 1, '13'], [2, "發布", 0, '14']
    ]
  },
  {
    id: 'event', name: "活動企劃", desc: "規劃場地、講者、宣傳、後勤與活動當天流程。",
    tasks: [
      [1, "前期規劃", 1], [2, "設定目標與預算", 3], [2, "預訂場地", 5, '2'], [2, "確認講者或表演者", 10, '2'],
      [1, "宣傳", 1], [2, "設計宣傳素材", 5, '3'], [2, "開放報名", 10, '6'],
      [1, "執行", 1], [2, "安排餐飲與設備", 5, '3'], [2, "最後彩排", 1, '4, 7, 9'], [2, "活動當天", 0, '10'],
      [2, "回饋問卷與結案", 3, '11']
    ]
  },
  {
    id: 'research', name: "研究計畫", desc: "從研究問題、倫理審查、資料蒐集到分析與論文。",
    tasks: [
      [1, "前期準備", 1], [2, "確定研究問題", 5], [2, "文獻回顧", 15, '2'], [2, "通過研究倫理審查", 10, '2'],
      [1, "資料蒐集", 1], [2, "設計問卷或研究工具", 5, '3'], [2, "蒐集資料", 20, '4, 6'],
      [1, "分析與撰寫", 1], [2, "分析資料", 10, '7'], [2, "撰寫論文", 15, '9'], [2, "投稿", 0, '10']
    ]
  }
];

export function fromTemplate(t: Template): Project {
  let p = M.blank();
  p.name = t.name;
  t.tasks.forEach(([level, name, duration]) => p.tasks.push(M.newTask(p, { name, level, duration, milestone: duration === 0 })));
  t.tasks.forEach(([, , , preds], i) => { if (preds) p.tasks[i].preds = M.parsePreds(p, preds, p.tasks[i].uid).preds; });
  p = M.normalize(p);
  return p;
}
