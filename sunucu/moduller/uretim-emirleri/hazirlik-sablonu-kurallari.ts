// 3688: hazırlık şablonunun saf kuralları (SQL yok). Servis ve test aynı kuralı kullanır.
export const TUR_VARSAYILAN = 'varsayilan';
export const SABLON_MADDE_TEKRARI = 'Aynı madde şablonda iki kez yazılamaz.';
export const SABLON_MADDE_KAPALI = 'Hazırlık maddesi bulunamadı ya da kapalı.';
export const SABLON_ROL_YOK = 'Rol bulunamadı.';
export const SABLON_TIP_YOK = 'Operasyon türü bulunamadı.';
export const SABLON_DEGISTI = 'Şablon başkası tarafından değiştirildi; sayfayı yenileyip tekrar deneyin.';
export const OZEL_DURDURAN = 'Durduran madde (CNC, çizim, yayın) bu emirde kapatılamaz.';
export const SABLON_DURDURAN_YETKI = 'Başlatmayı durduran maddeyi (CNC, çizim, yayın) şablonda yalnız müdür kapatabilir.';
export const SABLON_DURDURAN_GEREKCE = 'Başlatmayı durduran maddeyi kapatmak için gerekçe yazın.';
export const SABLON_DEGISIKLIK_YOK = 'Şablonda değişiklik yok.';

// Tür parametresi: "varsayilan" ya da operasyon tipi kimliği.
export const turTipi = (tur: string): number | null => (tur === TUR_VARSAYILAN ? null : Number(tur));

interface Satir { madde: string; gerekli: boolean; rolId: number | null; gun: number }

// Maddeler açık ve tekrarsız olmalı; roller var olmalı. Kapanan madde (gerekli=false) tür şablonunda serbesttir; durduran madde şablonda varsayılan olarak
// gerekli ve kilitlidir (3740: yalnız müdür gerekçeyle kapatır, bkz. durduranKapatmaIhlali); emirde hiçbir zaman kapatılamaz (3642).
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

// 3740 (kullanıcı kararı, Soru Merkezi 26.11): "Kilit kalsın, müdür açsın". Şablon sürümünde yeni kapanan durduran madde (önceki sürümde kapalı olmayan)
// yalnız müdürün (uretim-emirleri.hazirlik-muaf) ve gerekçeyle kapanır. Önceki sürümde zaten kapalı olan madde taşınırken kimse yeniden sorulmaz;
// yeniden açmak herkese serbesttir (gevşetme değil, sıkılaştırmadır).
export function durduranKapatmaIhlali(a: {
  yeni: readonly Satir[]; onceki: readonly Satir[]; durduran: ReadonlySet<string>; mudurMu: boolean; gerekce: string | null;
}): string | null {
  const yeniKapanan = a.yeni.filter((x) => !x.gerekli && a.durduran.has(x.madde) && maddeGerekli(a.onceki, x.madde));
  if (yeniKapanan.length === 0) return null;
  if (!a.mudurMu) return SABLON_DURDURAN_YETKI;
  if (a.gerekce === null || a.gerekce.trim() === '') return SABLON_DURDURAN_GEREKCE;
  return null;
}
