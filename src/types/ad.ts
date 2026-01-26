export interface Ad {
  id: string;
  userId: string;
  username?: string;
  text: string;
  createdAt: Date;
  status: 'active' | 'deleted';
}
