/* 生活事件。从 types/index.ts 按领域拆出，形状不变。 */

export interface LifeEventInput {
  id: number | null;
  title: string;
  category: 'health' | 'travel' | 'routine' | 'training' | 'other';
  startDate: string;
  endDate: string | null;
  notes: string;
  /** 纪元：给这段日子起的名字，所有趋势图叠一层底色，也交给 AI。 */
  epoch: boolean;
}

export interface LifeEvent extends LifeEventInput {
  id: number;
  createdAt: string;
  updatedAt: string;
}
