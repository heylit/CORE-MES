// Operasyon gruplarının tek kaynağı: sözleşme, İstasyonlar ve Reçete-Rota ekranları ile malzemeler kataloğu aynı listeyi okur.
// Zod taşımaz ki istemci değer olarak ithal edebilsin. Sıra ekrandaki sıradır; kod veritabanındaki grup kısıtıyla aynı olmalıdır.
export const OPERASYON_GRUPLARI = [
  ['KES', 'Kesim'], ['SKL', 'Şekillendirme'], ['TAL', 'Talaşlı imalat'], ['KYN', 'Kaynak'], ['ISL', 'Isıl işlem'], ['YZY', 'Yüzey hazırlık'],
  ['KAP', 'Kaplama'], ['BOY', 'Boya'], ['MRK', 'Markalama'], ['MON', 'Montaj'], ['KAL', 'Kalite kontrol'], ['DEP', 'Depo operasyonları'],
  ['PAK', 'Paketleme ve sevk'], ['FAS', 'Fason'],
] as const satisfies readonly (readonly [string, string])[];

export type OperasyonGrubu = (typeof OPERASYON_GRUPLARI)[number][0];
export const OPERASYON_GRUP_KODLARI = OPERASYON_GRUPLARI.map(([kod]) => kod) as unknown as readonly [OperasyonGrubu, ...OperasyonGrubu[]];
export const OPERASYON_GRUP_ADLARI = Object.fromEntries(OPERASYON_GRUPLARI) as Readonly<Record<OperasyonGrubu, string>>;
