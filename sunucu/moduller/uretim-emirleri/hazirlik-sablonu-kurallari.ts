// 3688: hazırlık şablonunun saf kuralları (SQL yok). Servis ve test aynı kuralı kullanır.
export const TUR_VARSAYILAN = 'varsayilan';
export const SABLON_MADDE_TEKRARI = 'Aynı madde şablonda iki kez yazılamaz.';
export const SABLON_MADDE_KAPALI = 'Hazırlık maddesi bulunamadı ya da kapalı.';
export const SABLON_ROL_YOK = 'Rol bulunamadı.';
export const SABLON_TIP_YOK = 'Operasyon türü bulunamadı.';
export const SABLON_DEGISTI = 'Şablon başkası tarafından değiştirildi; sayfayı yenileyip tekrar deneyin.';
export const OZEL_DURDURAN = 'Durduran madde (CNC, çizim, yayın) bu emirde kapatılamaz.';
export const SABLON_DURDURAN = 'Başlatmayı durduran madde (CNC, çizim, yayın) şablonda kapatılamaz.';
export const SABLON_DEGISIKLIK_YOK = 'Şablonda değişiklik yok.';

// Tür parametresi: "varsayilan" ya da operasyon tipi kimliği.
export const turTipi = (tur: string): number | null => (tur === TUR_VARSAYILAN ? null : Number(tur));

interface Satir { madde: string; gerekli: boolean; rolId: number | null; gun: number }

// Maddeler açık ve tekrarsız olmalı; roller var olmalı. Kapanan madde (gerekli=false) tür şablonunda serbesttir; durduran üç madde ne şablonda ne emirde kapatılabilir
// (başlatma kapısı şablondan bağımsızdır; 3642 GEREKMEZ_DURDURAN ile aynı kural).
export function sablonIhlali(satirlar: readonly Satir[], acikMaddeler: ReadonlySet<string>, varOlanRoller: ReadonlySet<number>): string | null {
  const gorulen = new Set<string>();
  for (const s of satirlar) {
    if (!acikMaddeler.has(s.madde)) return SABLON_MADDE_KAPALI;
    if (gorulen.has(s.madde)) return SABLON_MADDE_TEKRARI;
    gorulen.add(s.madde);
    if (s.rolId !== null && !varOlanRoller.has(s.rolId)) return SABLON_ROL_YOK;
  }
  return null;
}

// Kayıt öncesi kıyas: sıralı, kanonik. Aynı içerikli kayıt yeni sürüm üretmez.
export const sablonKanonik = (satirlar: readonly Satir[]): string =>
  JSON.stringify([...satirlar].sort((a, b) => a.madde.localeCompare(b.madde)).map((s) => [s.madde, s.gerekli, s.rolId, s.gun]));

// Şablon satırında olmayan madde gerekli sayılır (yeni eklenen madde şablonu bozmaz).
export const maddeGerekli = (satirlar: readonly Satir[], madde: string): boolean => satirlar.find((s) => s.madde === madde)?.gerekli ?? true;
