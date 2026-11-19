export const anahtarlar = {
  kok: ['ortak-dosyalar'] as const,
  klasorler: ['ortak-dosyalar', 'klasorler'] as const,
  dosyalar: (klasorId: number, ara: string) => ['ortak-dosyalar', 'dosyalar', klasorId, ara] as const,
  surumler: (dosyaId: number) => ['ortak-dosyalar', 'surumler', dosyaId] as const,
  yetki: (klasorId: number) => ['ortak-dosyalar', 'yetki', klasorId] as const,
  gecmis: (klasorId: number) => ['ortak-dosyalar', 'gecmis', klasorId] as const,
  son: (ara: string, firmaId: number | null, projeId: number | null) => ['ortak-dosyalar', 'son', ara, firmaId, projeId] as const,
  arsiv: (onayBekleyen: boolean) => ['ortak-dosyalar', 'arsiv', onayBekleyen] as const,
  hazirKayitlar: (liste: string, ara: string) => ['ortak-dosyalar', 'hazir', liste, ara] as const,
  hazirKayit: (liste: string, anahtar: string) => ['ortak-dosyalar', 'hazir-kayit', liste, anahtar] as const,
};
