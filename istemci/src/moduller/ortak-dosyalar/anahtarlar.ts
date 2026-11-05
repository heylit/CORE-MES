export const anahtarlar = {
  kok: ['ortak-dosyalar'] as const,
  klasorler: ['ortak-dosyalar', 'klasorler'] as const,
  dosyalar: (klasorId: number, ara: string) => ['ortak-dosyalar', 'dosyalar', klasorId, ara] as const,
  surumler: (dosyaId: number) => ['ortak-dosyalar', 'surumler', dosyaId] as const,
  yetki: (klasorId: number) => ['ortak-dosyalar', 'yetki', klasorId] as const,
  gecmis: (klasorId: number) => ['ortak-dosyalar', 'gecmis', klasorId] as const,
  son: (ara: string) => ['ortak-dosyalar', 'son', ara] as const,
  arsiv: ['ortak-dosyalar', 'arsiv'] as const,
};
