export const ORTAMLAR = ['gelistirme', 'test', 'canli'] as const;
export type Ortam = (typeof ORTAMLAR)[number];
