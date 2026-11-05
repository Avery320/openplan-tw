const LABELS: Record<string, string> = {
  Draft: '草稿', 'In review': '審查中', Approved: '已核准', Baselined: '已設定基準線', Final: '定稿',
  Work: '人力', Material: '材料', Cost: '成本',
  Manager: '主管', 'Full-time': '全職', 'Part-time': '兼職', Supporter: '支援人員',
};

export function labelFor(value: string): string {
  return Object.hasOwn(LABELS, value) ? LABELS[value] : value;
}

export const LINK_LABELS: Record<string, string> = {
  FS: '完成後開始（FS）', SS: '同時開始（SS）', FF: '同時完成（FF）', SF: '開始後完成（SF）',
};
