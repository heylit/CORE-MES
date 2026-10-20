// Duruş nedeni dağılımının saf hesabı. Rapor, vardiya özeti ve şerit aynı kuralı buradan alır.
// Nedeni girilmemiş duruş ve duraklatma "Nedeni belirsiz" adıyla ayrı satırda görünür; başka nedene eklenmez, atılmaz.
export interface DurusParcasi { f: number; t: number; s: string; n?: string | null }
export interface NedenToplami { ms: number; n: number }
export interface ParetoSatiri { k: string; l: string; ms: number; n: number; p: boolean }

// Nedeni girilmemiş parçanın toplam anahtarı; gerçek neden kodlarıyla çakışmaz.
export const NEDEN_YOK = '—';
export const NEDEN_YOK_ETIKETI = 'Nedeni belirsiz';

// İş değiştirirken çalışan eski işin kendiliğinden duraklatılması bu nedeni taşır (TMI neden kodu değildir; TMI'ye duraklatma gider).
// Duraklatma emrin durmasıdır, makinenin değil: makinede başka iş çalışırsa o süre çalışmadır; makine boşta kalırsa yeni iş başlayana
// kadar geçen süre plansız duruştur (kullanıcı kararı, soru 33/50).
export const IS_DEGISIMI = 'is-degisimi';
export const IS_DEGISIMI_ETIKETI = 'İş değişimi';

function topla(parcalar: readonly DurusParcasi[], durumlar: readonly string[]): Record<string, NedenToplami> {
  const sonuc: Record<string, NedenToplami> = {};
  for (const x of parcalar) {
    if (!durumlar.includes(x.s)) continue;
    const k = x.n || NEDEN_YOK;
    const t = sonuc[k] ?? (sonuc[k] = { ms: 0, n: 0 });
    t.ms += x.t - x.f; t.n++;
  }
  return sonuc;
}

// Makinenin zaman çizgisinde iş değişimi duraklatması süren parça, makine boşta demektir: "İş değişimi" nedenli duruş olur.
// Başka iş başladığında makinenin durumu o işin durumudur; parça orada biter.
export const isDegisiminiDurusSay = <T extends DurusParcasi>(parcalar: readonly T[]): T[] =>
  parcalar.map((x) => (x.s === 'paused' && x.n === IS_DEGISIMI ? { ...x, s: 'stopped' } : x));

// Rapor dağılımı: duruşlar ve duraklatmalar. Duraklatma bugün neden taşımaz; hepsi nedensiz satıra düşer.
export const nedenToplamlari = (parcalar: readonly DurusParcasi[]): Record<string, NedenToplami> => topla(parcalar, ['stopped', 'paused']);
// Yalnız duruşlar: "en çok duruş nedeni" ve OEE kaybı bunlardan okunur, duraklatma OEE kaybı sayılmaz.
export const durusToplamlari = (parcalar: readonly DurusParcasi[]): Record<string, NedenToplami> => topla(parcalar, ['stopped']);

export function nedenToplamlariniBirlestir(listeler: readonly Record<string, NedenToplami>[]): Record<string, NedenToplami> {
  const sonuc: Record<string, NedenToplami> = {};
  for (const l of listeler) for (const [k, v] of Object.entries(l)) {
    const t = sonuc[k] ?? (sonuc[k] = { ms: 0, n: 0 });
    t.ms += v.ms; t.n += v.n;
  }
  return sonuc;
}

export function paretoSatirlari(toplamlar: Record<string, NedenToplami>, adi: (kod: string) => string | null, planliMi: (kod: string) => boolean): ParetoSatiri[] {
  return Object.entries(toplamlar)
    .map(([k, v]) => ({ k, l: nedenAdi(k, adi), ms: v.ms, n: v.n, p: planliMi(k) }))
    .sort((a, b) => b.ms - a.ms);
}

// Plansız nedenler içinde en çok süre tutan kod; yoksa null.
export function enCokPlansiz(toplamlar: Record<string, NedenToplami>, planliMi: (kod: string) => boolean): string | null {
  const ilk = Object.entries(toplamlar).filter(([k]) => !planliMi(k)).sort((a, b) => b[1].ms - a[1].ms)[0];
  return ilk ? ilk[0] : null;
}

// Ekranda gösterilecek neden adı: nedensiz anahtar etiketi alır, adı bilinmeyen kod olduğu gibi kalır.
export const nedenAdi = (kod: string, adi: (kod: string) => string | null): string => {
  if (kod === NEDEN_YOK) return NEDEN_YOK_ETIKETI;
  if (kod === IS_DEGISIMI) return IS_DEGISIMI_ETIKETI;
  return adi(kod) ?? kod;
};
