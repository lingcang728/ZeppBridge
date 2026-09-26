/* 生活事件。从 types/index.ts 按领域拆出，形状不变。 */

export interface LifeEventInput {
  id: number | null;
  title: string;
  category: 'health' | 'travel' | 'routine' | 'training' | 'other';
  startDate: string;
  endDate: string | null;
  notes: string;
}

export interface LifeEvent extends LifeEventInput {
  id: number;
  createdAt: string;
  updatedAt: string;
}
