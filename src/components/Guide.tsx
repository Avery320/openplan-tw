import { useState } from 'react';
import { useApp } from '../store';
import Icon from './Icon';

// A getting-started checklist for new users. Steps tick themselves off as the plan fills in.
export default function Guide() {
  const st = useApp();
  const [exported, setExported] = useState(false);
  if (!st.guide) return null;
  const tasks = st.p.tasks;
  const steps: [string, string, boolean, string, () => void][] = [
    ["列出工作項目", "在表格填入任務和工期，再用縮排將任務分到各階段。", tasks.length >= 2, "顯示任務表", () => st.setView('gantt')],
    ["設定任務依賴", "輸入前置任務編號，例如 2 或 3SS+1d，即可排定時程。", tasks.some(t => t.preds.length > 0), "顯示任務表", () => st.setView('gantt')],
    ["設定人員與成本", "新增人員及費率，然後指派給各項任務。", tasks.some(t => t.assignments.length > 0), "資源清單", () => st.setView('resources')],
    ["匯出成果", "下載圖表、報表或 Excel 檔案。", exported, "開啟匯出選單", () => { setExported(true); st.setUI({ backstage: true, bsPage: 'export' }); }]
  ];
  const done = steps.filter(s => s[2]).length;
  return (
    <aside className="guide" aria-label="開始使用">
      <div className="guide-head">
        <b>開始使用</b><span className="muted">{done}／{steps.length}</span>
        <button className="icon-btn" title="隱藏指南" aria-label="隱藏指南" onClick={() => st.setUI({ guide: false })}><Icon name="x" /></button>
      </div>
      <ol>
        {steps.map(([title, text, ok, action, run]) => (
          <li key={title} className={ok ? 'ok' : ''}>
            <span className="guide-mark" aria-hidden="true">{ok ? <Icon name="check" /> : null}</span>
            <div><b>{title}</b><span>{text}</span>{!ok && <button className="linkbtn" onClick={run}>{action}</button>}</div>
          </li>
        ))}
      </ol>
      {!tasks.length && <p className="guide-tip">第一次使用嗎？可從 <button className="linkbtn" onClick={() => st.setUI({ backstage: true, bsPage: 'new' })}>檔案 › 新增</button> 選擇範本。</p>}
    </aside>
  );
}
