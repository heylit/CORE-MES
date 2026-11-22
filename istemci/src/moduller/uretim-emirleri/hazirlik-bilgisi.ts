import type { HazirlikCevabi, HazirlikMaddesi, UYARAN_HAZIRLIK_MADDELERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

export type Hal = HazirlikCevabi['maddeler'][number]['durum'];
export type IsEmriSatiri = HazirlikCevabi['isEmirleri'][number];

// Hazırlık maddelerinin tek bilgi kaynağı (3581): adı, sahibi, "git" bağlantısı, hâlin görünümü ve iş emri hücresinin hâli. Adım tablosu,
// Adım Durumu sayfası ve Üretim Terminali aynı listeyi okur. Maddenin hâlini sahibi modül verir (sunucuda çözücü); burası yalnız gösterir.
// Muafiyet yalnız müdürde (uretim-emirleri.hazirlik-muaf, 264 a) ve yalnız muaf tutulabilen maddede açılır (121 a). Uyaran maddenin
// (2146-1 a) eksiği "Uyarı" görünür ve satırı durdurmaz.
export type Gorunum = { ton: RozetTonu; simge: SimgeAdi; ad: string; aciklama: string };
const HAL: Record<Hal, Gorunum> = {
  tamam: { ton: 'tamam', simge: 'check', ad: 'Tamam', aciklama: 'Tamam.' },
  eksik: { ton: 'hata', simge: 'x', ad: 'Eksik', aciklama: 'Eksik: tamamlanmadan iş emri başlamaz.' },
  muaf: { ton: 'uyari', simge: 'lock', ad: 'Muaf', aciklama: 'Müdür gerekçeyle muaf tuttu; iş başlar.' },
  gerekmez: { ton: 'pasif', simge: 'minus', ad: 'Gerekmez', aciklama: 'Bu emirde gerekmiyor.' },
  bilinmiyor: { ton: 'pasif', simge: 'help', ad: 'Bilinmiyor', aciklama: 'Sistem bu maddeyi henüz denetlemiyor; başlatmayı durdurmaz.' },
};
const UYARI: Gorunum = { ton: 'uyari', simge: 'alert', ad: 'Uyarı', aciklama: 'Eksik, ama başlatmayı durdurmaz: iş uyarıyla başlar.' };
export const hazirlikUyarirMi = (m: HazirlikMaddesi): boolean => MADDE[m].uyarir;
export const halGorunumu = (madde: HazirlikMaddesi, hal: Hal): Gorunum => (hal === 'eksik' && hazirlikUyarirMi(madde) ? UYARI : HAL[hal]);

// Sözleşmedeki değer zod taşıdığından istemciye yalnız tipi girer; `uyarir` bayrağı tip düzeyinde uyaran madde listesine bağlıdır.
type Uyaran = (typeof UYARAN_HAZIRLIK_MADDELERI)[number];
interface MaddeBilgisi<K extends HazirlikMaddesi = HazirlikMaddesi> {
  ad: string; kisa: string; sahip: string; not?: string; git: { yol: string; islem: string; ad: string } | null; uyarir: K extends Uyaran ? true : false;
}
export const MADDE: { [K in HazirlikMaddesi]: MaddeBilgisi<K> } = {
  cnc: { ad: 'CNC kurulumu', kisa: 'CNC', sahip: 'CNC Kurulum', git: { yol: '/cnc-kurulum', islem: 'sayfa.cnc-kurulum', ad: "CNC Kurulum'da aç" }, uyarir: false },
  cizim: { ad: 'Çizim revizyonu', kisa: 'Çizim', sahip: 'Kalite Merkezi', git: { yol: '/kalite-merkezi', islem: 'sayfa.kalite-merkezi', ad: 'Çizimi aç' }, uyarir: false },
  rota: { ad: 'Rota yürürlükte', kisa: 'Rota', sahip: 'Reçete ve Rota', git: { yol: '/recete-rota', islem: 'sayfa.recete-rota', ad: "Reçete ve Rota'da aç" }, uyarir: true },
  malzeme: { ad: 'Malzeme (girdi stoğu)', kisa: 'Malzeme', sahip: 'Stok Merkezi', git: { yol: '/stok', islem: 'sayfa.stok', ad: "Stok Merkezi'nde aç" }, uyarir: true },
  'takim-omru': { ad: 'Takım ömrü', kisa: 'Takım', sahip: 'CNC Kurulum', git: { yol: '/cnc-kurulum', islem: 'sayfa.cnc-kurulum', ad: "CNC Kurulum'da aç" }, uyarir: true },
  // 3199 (D): plan işin içine özel takım değişimi koyduysa uyarır; kaynak Planlama'daki kayıtlı plandır.
  'takim-hazirla': { ad: 'Takım hazırla', kisa: 'Takım hazırla', sahip: 'Planlama', git: { yol: '/plan', islem: 'sayfa.plan', ad: "Planlama'da aç" }, uyarir: true },
  makine: { ad: 'Makine durumu', kisa: 'Makine', sahip: 'İstasyonlar', git: { yol: '/istasyonlar', islem: 'sayfa.istasyonlar', ad: "İstasyonlar'da aç" }, uyarir: true },
  yayin: { ad: 'Terminale gönderildi', kisa: 'Terminal', sahip: 'Üretim Hazırlık', not: 'Terminale gönderilen iş, seçili istasyonun operatör ekranında başlatılabilir.', git: { yol: '/arkon/hazirlik', islem: 'sayfa.arkon', ad: "Üretim Hazırlık'ta aç" }, uyarir: false },
  // 2227-1: ön hazırlık ve hazırlık adımları terminalde işaretlenir; matris yalnız uyarır.
  talimat: { ad: 'Hazırlık talimatı', kisa: 'Talimat', sahip: 'Terminal', git: null, uyarir: true },
  // 2227-1 b: iş emrine özel madde Üretim Hazırlık'ta eklenir ve işaretlenir.
  'ek-madde': { ad: 'Ek hazırlık maddesi', kisa: 'Ek madde', sahip: 'Üretim Hazırlık', git: { yol: '/arkon/hazirlik', islem: 'sayfa.arkon', ad: "Üretim Hazırlık'ta aç" }, uyarir: true },
  // 2893-4 a: liste rota adımında tanımlanır; aparat stokta, ölçü aleti türünde kalibrasyonu geçerli alet aranır.
  aparat: { ad: 'Aparat', kisa: 'Aparat', sahip: 'Stok Merkezi', git: { yol: '/stok', islem: 'sayfa.stok', ad: "Stok Merkezi'nde aç" }, uyarir: true },
  'olcu-aleti': { ad: 'Ölçü aleti (kalibrasyon)', kisa: 'Ölçü', sahip: 'Ölçü Aletleri', git: { yol: '/kalibrasyon', islem: 'sayfa.kalibrasyon', ad: "Ölçü Aletleri'nde aç" }, uyarir: true },
};

// Hücre kimliği: emir geneli madde yalnız madde, iş emri düzeyindeki madde madde ve iş emri.
export interface Hucre { madde: HazirlikMaddesi; isEmriId: number | null }

export function hucreHali(v: HazirlikCevabi, h: Hucre): Hal {
  if (h.isEmriId === null) return v.maddeler.find((m) => m.madde === h.madde)?.durum ?? 'bilinmiyor';
  return v.isEmirleri.find((i) => i.isEmriId === h.isEmriId)?.maddeler.find((m) => m.madde === h.madde)?.durum ?? 'bilinmiyor';
}

// Satır başlar mı: durduran maddenin iş emri düzeyindeki hücresi ya da emir geneli hâli eksikse durur; uyaran madde durdurmaz.
export function satirDurur(v: HazirlikCevabi, satir: IsEmriSatiri): boolean {
  return v.maddeler.some((m) => !hazirlikUyarirMi(m.madde) && (m.isEmriDuzeyi ? hucreHali(v, { madde: m.madde, isEmriId: satir.isEmriId }) : m.durum) === 'eksik');
}
// Uyaran maddelerden eksik olan hücre sayısı (açık iş emirleri ve emir geneli).
export function uyariSayisi(v: HazirlikCevabi): number {
  const acik = v.isEmirleri.filter((i) => !i.bitti);
  return v.maddeler.filter((m) => hazirlikUyarirMi(m.madde)).reduce((t, m) => t + (m.isEmriDuzeyi
    ? acik.filter((i) => hucreHali(v, { madde: m.madde, isEmriId: i.isEmriId }) === 'eksik').length
    : m.durum === 'eksik' ? 1 : 0), 0);
}
