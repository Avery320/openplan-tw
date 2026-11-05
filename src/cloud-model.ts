import type { Project } from './types';

export interface TaskSummary {
  uid: number;
  name: string;
  finish: string;
  deadline: string;
  percent: number;
  milestone: boolean;
  critical: boolean;
  people: string[];
}

export interface PlanSummary {
  start: string;
  finish: string;
  percent: number;
  tasks: TaskSummary[];
}

export interface ProjectCard extends PlanSummary {
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
}

export interface CloudProject {
  id: string;
  revision: number;
  plan: Project;
}

export interface Snapshot {
  id: string;
  name: string;
  createdAt: string;
}

export const MAX_PLAN_BYTES = 600_000;

export function taipeiToday(): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts();
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

export function shortDate(value: string): string {
  return value ? value.replaceAll('-', '/') : '—';
}
