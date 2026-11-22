import { createContext, lazy, useContext, type ComponentType, type LazyExoticComponent } from 'react';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { MALIYET_ANAHTARLARI, ONERILEN_IKINCI_MENU } from '../planlama-menusu.ts';
import type { CalismaKomutu } from './kayit.ts';
import type { PlanlamaCalismasi } from './tipler.ts';
import type { PlanlamaDeposu } from './veri.ts';
import type { PlanlamaYetkisi } from './yetki.ts';

// Görünüm kaydı: sıra, başlık ve simge Planlama'nın ikinci menüsünden (planlama-menusu.ts), adres parçası eski ekranın anahtarıdır.
// Bileşenler parçalara iner (PARCA-SOZLESMESI.md); parçalar bu dosyaya dokunmaz, bileşen adları sözleşmededir.
export const KOK = '/plan';

const PLANLAMA_GRUBU = ONERILEN_IKINCI_MENU.gruplar[0].maddeler;
// Planlama ayarları (3561) Veri grubunda durur ama planın çalışmasını ve taslağını kullandığı için bu iskeletin görünümüdür.
const AYARLAR_MADDESI = ONERILEN_IKINCI_MENU.gruplar[1].maddeler.find((m) => m.anahtar === 'ayarlar');
if (AYARLAR_MADDESI === undefined) throw new Error('Planlama ikinci menüsünde Planlama ayarları maddesi yok (paylasilan/sayfalar/plan.ts).');
type MenuGorunumu = (typeof PLANLAMA_GRUBU)[number]['anahtar'] | 'ayarlar';
// Kapasite sayfasının bölümleri (3038): menüde tek "Kapasite" maddesi, bölüm adresin sorgusundadır (`kapasite?bolum=mesaiplan`). Bölüm
// anahtarları eski sayfaların anahtarıdır: eski adresler (`/plan/mesaiplan`) ve `git('mesaiplan')` aynı bölümü açar.
export const KAPASITE_BOLUMLERI = [['ufuk', 'Yük haritası', 'gauge'], ['mesaiplan', 'Ek mesai', 'clock'], ['fasonplan', 'Fason', 'truck'], ['yillik', 'Yıllık plan', 'chart']] as const;
export type KapasiteBolumu = (typeof KAPASITE_BOLUMLERI)[number][0];
export type PlanlamaGorunumu = MenuGorunumu | KapasiteBolumu;
export const kapasiteBolumuMu = (x: string | undefined | null): x is KapasiteBolumu => KAPASITE_BOLUMLERI.some(([k]) => k === x);
export function kapasiteBolumuOku(q: URLSearchParams): KapasiteBolumu {
  const b = q.get('bolum');
  return kapasiteBolumuMu(b) ? b : 'ufuk';
}
// Kök adres Kokpit'tir (ikinci menünün ilk maddesi, adresi `/plan`; 3282). Motor `/plan/plan`'dadır.
export const ACILIS: PlanlamaGorunumu = 'kokpit';

// Dönem ölçeği eski ekranda bütün görünümlerin ortak düğmesiydi (zs-olcek-ortak: varsayılan Hafta, ölçek değişince kayma sıfırlanır).
export const DONEM_OLCEKLERI = [['gun', 'Gün'], ['hafta', 'Hafta'], ['ay', 'Ay'], ['yil', 'Yıl']] as const;
export type DonemOlcegi = (typeof DONEM_OLCEKLERI)[number][0];
export interface PlanlamaOlcegi {
  olcek: DonemOlcegi;
  // Bugünden kaç dönem ileri (eksi: geri).
  kayma: number;
}
export const ACILIS_OLCEGI: PlanlamaOlcegi = { olcek: 'hafta', kayma: 0 };

// Görünümler arası taşınan seçim (eski ekranın secJob, gySec, rsTez, rsT'si). `zaman` plan saatidir (calisma.D ekseni); null şu andır.
export interface PlanlamaSecimi {
  siparis: string | null;
  adim: string | null;
  tezgah: string | null;
  zaman: number | null;
}
export const BOS_SECIM: PlanlamaSecimi = { siparis: null, adim: null, tezgah: null, zaman: null };

// Motor sayfasının tek ekranı tahtadır; Veri ikinci menüde ayrı sayfadır ve geçmişin bölümleri onun içindedir (3308-2 a). `altSec` Veri
// sayfasını bölümüyle açar. Eski adresler (`plan?ekran=veri&bolum=kisitlar`) yeni yerine yönlenir.
export const MOTOR_EKRANLARI = ['tahta', 'veri'] as const;
export type MotorEkrani = (typeof MOTOR_EKRANLARI)[number];
export interface PlanlamaAltEkrani { ekran: MotorEkrani; bolum: string | null }
export function altEkranAdresi(a: PlanlamaAltEkrani): string {
  if (a.ekran === 'tahta') return gorunumAdresi('plan');
  return a.bolum ? `${gorunumAdresi('veri')}?${new URLSearchParams({ bolum: a.bolum }).toString()}` : gorunumAdresi('veri');
}
export function eskiEkranAdresi(q: URLSearchParams): string | null {
  const e = q.get('ekran'); const b = q.get('bolum');
  if (e === 'veri') return altEkranAdresi({ ekran: 'veri', bolum: b });
  if (e === 'gecmis') return altEkranAdresi({ ekran: 'veri', bolum: b === 'iz' ? 'iz' : 'defter' });
  return e === 'bugun' || e === 'hesap' ? gorunumAdresi('plan') : null;
}
// Olay formu her planlama sayfasının üstündeki şeritten açılır (3308-1 a); tür formda ön seçili gelir. Yazamayana null, düğme pasif kalır.
export const PLAN_OLAY_TURLERI = ['ariza', 'acil', 'malzeme', 'eksik', 'fason'] as const;
export type PlanOlayTuru = (typeof PLAN_OLAY_TURLERI)[number];
export const OLAY_YOK = 'Olay eklemek plan yazma yetkisi ister.';
export const OlayAcBaglami = createContext<((t: PlanOlayTuru) => void) | null>(null);
export const useOlayAc = (): ((t: PlanOlayTuru) => void) | null => useContext(OlayAcBaglami);
export const TAHTA: PlanlamaAltEkrani = { ekran: 'tahta', bolum: null };
// Her görünüme verilen ortak özellikler. `git` başka görünüme geçer; `yenile` açılış okumalarını yeniden yapar. `calisma` çalışmanın güncel
// halidir (değişiklikten sonra yenisi gelir; `depo.calisma` açılıştakidir). `komut` yazma yetkisi yoksa ya da çalışma kaydı yoksa null'dır.
// `olcek` ve `secim` görünüm değişince korunur, sayfa yenilenince açılış haline döner (eski ekranda da kaydedilmezdi); çalışmaya yazılmaz.
// `olcekSec` ölçeği değiştirir ve kaymayı sıfırlar; `kaydir(0)` bugüne döner, başka sayı kaymaya eklenir. `sec` verilen alanları değiştirir.
export interface PlanlamaEkranOzellikleri {
  depo: PlanlamaDeposu;
  calisma: PlanlamaCalismasi | null;
  komut: CalismaKomutu | null;
  yetki: PlanlamaYetkisi;
  git: (g: PlanlamaGorunumu) => void;
  yenile: () => void;
  olcek: PlanlamaOlcegi;
  olcekSec: (o: DonemOlcegi) => void;
  kaydir: (n: number) => void;
  secim: PlanlamaSecimi;
  sec: (s: Partial<PlanlamaSecimi>) => void;
  // Motor'un ekranı (hep tahta) ve Veri sayfasına bölümüyle geçiş. Verilmezse Veri bağlantıları pasif kalır (iskeletsiz çizim, testler).
  alt?: PlanlamaAltEkrani;
  altSec?: (a: PlanlamaAltEkrani) => void;
}

export interface GorunumKaydi {
  anahtar: MenuGorunumu;
  baslik: string;
  simge: SimgeAdi;
  parca: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8';
  bilesen: LazyExoticComponent<ComponentType<PlanlamaEkranOzellikleri>>;
}

const parca = <M extends Record<string, unknown>>(yukle: () => Promise<M>, ad: keyof M & string) =>
  lazy(async () => ({ default: (await yukle())[ad] as ComponentType<PlanlamaEkranOzellikleri> }));

// Her sayfanın üstündeki plan çubuğu (Soru 497/10 a) P1'indir; motor sayfası kendi çubuğunu çizer, iskelet ötekilerin üstüne koyar.
// Olay formu da P1'indir; iskelet onu plan yazabilen kişide yükler, pencere tür seçilince açılır.
export const OlayPenceresi = lazy(async () => ({ default: (await import('./motor/olay/OlayFormu.tsx')).OlayPenceresi }));
export const PlanSeridi = lazy(async () => ({ default: (await import('./motor/ust/PlanSeridi.tsx')).PlanSeridi }));

const BILESENLER: Record<MenuGorunumu, Pick<GorunumKaydi, 'parca' | 'bilesen'>> = {
  plan: { parca: 'P1', bilesen: parca(() => import('./motor/index.tsx'), 'PlanlamaMotoru') },
  veri: { parca: 'P1', bilesen: parca(() => import('./ic/veri/Sayfa.tsx'), 'VeriSayfasi') },
  kokpit: { parca: 'P7', bilesen: parca(() => import('./kokpit/index.tsx'), 'Kokpit') },
  ysiparis: { parca: 'P2', bilesen: parca(() => import('./siparis/index.tsx'), 'Siparisler') },
  terminler: { parca: 'P2', bilesen: parca(() => import('./siparis/index.tsx'), 'Terminler') },
  denge: { parca: 'P2', bilesen: parca(() => import('./siparis/index.tsx'), 'TerminVeKar') },
  maliyet: { parca: 'P3', bilesen: parca(() => import('./maliyet/index.tsx'), 'Maliyetler') },
  giderler: { parca: 'P3', bilesen: parca(() => import('./maliyet/index.tsx'), 'GenelGider') },
  kapasite: { parca: 'P5', bilesen: parca(() => import('./ufuk/index.tsx'), 'Kapasite') },
  malzplan: { parca: 'P4', bilesen: parca(() => import('./malzeme/index.tsx'), 'MalzemePlani') },
  sevkiyat: { parca: 'P6', bilesen: parca(() => import('./sevkiyat/index.tsx'), 'Sevkiyat') },
  ayarlar: { parca: 'P8', bilesen: parca(() => import('./ayarlar/Sayfa.tsx'), 'PlanlamaAyarlari') },
};

export const GORUNUM_KAYITLARI: readonly GorunumKaydi[] = [
  ...PLANLAMA_GRUBU.map((m) => ({ anahtar: m.anahtar, baslik: m.baslik, simge: m.simge, ...BILESENLER[m.anahtar] })),
  { anahtar: 'ayarlar', baslik: AYARLAR_MADDESI.baslik, simge: AYARLAR_MADDESI.simge, ...BILESENLER.ayarlar },
];

export function gorunumOku(parca: string | undefined): PlanlamaGorunumu | null {
  if (kapasiteBolumuMu(parca)) return parca;
  return GORUNUM_KAYITLARI.find((k) => k.anahtar === parca)?.anahtar ?? null;
}
// Kapasite bölümü menüde Kapasite maddesidir (sayfa adı, iz satırı, yetki).
export const menuGorunumu = (g: PlanlamaGorunumu): MenuGorunumu => (kapasiteBolumuMu(g) ? 'kapasite' : g);

// Açılış görünümü menüdeki gibi kök adrestedir; `/plan/plan` eski bağlantılar için yine açılır.
export function gorunumAdresi(g: PlanlamaGorunumu): string {
  if (kapasiteBolumuMu(g)) return g === 'ufuk' ? `${KOK}/kapasite` : `${KOK}/kapasite?bolum=${g}`;
  return g === ACILIS ? KOK : `${KOK}/${g}`;
}

// Maliyet ve kâr gösteren görünümler birim maliyet okumasını da ister (menüdeki gibi; planlama rolü maliyet görmez, 200 a).
export function gorunumAcik(g: PlanlamaGorunumu, yetki: PlanlamaYetkisi): boolean {
  return MALIYET_ANAHTARLARI.includes(g) ? yetki.maliyetOku : yetki.planlamaOku;
}
