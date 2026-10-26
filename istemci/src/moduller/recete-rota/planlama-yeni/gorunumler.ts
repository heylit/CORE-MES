import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { MALIYET_ANAHTARLARI, ONERILEN_IKINCI_MENU } from '../planlama-menusu.ts';
import type { CalismaKomutu } from './kayit.ts';
import type { PlanlamaCalismasi } from './tipler.ts';
import type { PlanlamaDeposu } from './veri.ts';
import type { PlanlamaYetkisi } from './yetki.ts';

// Görünüm kaydı: sıra, başlık ve simge ikinci menünün Planlama grubundan (planlama-menusu.ts), adres parçası eski ekranın anahtarıdır.
// Bileşenler parçalara iner (PARCA-SOZLESMESI.md); parçalar bu dosyaya dokunmaz, bileşen adları sözleşmededir.
export const KOK = '/recete-rota/planlama-yeni';

const PLANLAMA_GRUBU = ONERILEN_IKINCI_MENU.gruplar[1].maddeler;
export type PlanlamaGorunumu = (typeof PLANLAMA_GRUBU)[number]['anahtar'];
// Kök adres Planlama motoru'dur (ikinci menünün ilk planlama maddesi).
export const ACILIS: PlanlamaGorunumu = 'plan';

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

// Planlama motoru sayfasının ekranları (eski b-kabuk EKRANLAR: tahta, veri, geçmiş; stüdyo ayrı görünümdür) ve Plan ekranının iki sayfası (zk-kabuk:
// Bugünün kararları, Nasıl hesaplandı; Başka menüsünden açılır). Ekran ve bölümü adresin sorgusundadır (`?ekran=veri&bolum=kisitlar`): görünüm anahtarı ikinci menünündür, ekran onun içindedir. Bölüm ekranın kendi anahtarıdır.
export const MOTOR_EKRANLARI = ['tahta', 'veri', 'gecmis', 'bugun', 'hesap'] as const;
export type MotorEkrani = (typeof MOTOR_EKRANLARI)[number];
export interface PlanlamaAltEkrani { ekran: MotorEkrani; bolum: string | null }
export const TAHTA: PlanlamaAltEkrani = { ekran: 'tahta', bolum: null };
export function altEkranOku(q: URLSearchParams): PlanlamaAltEkrani {
  const e = MOTOR_EKRANLARI.find((x) => x === q.get('ekran'));
  return !e || e === 'tahta' ? TAHTA : { ekran: e, bolum: q.get('bolum') };
}
export function altEkranAdresi(a: PlanlamaAltEkrani): string {
  if (a.ekran === 'tahta') return gorunumAdresi('plan');
  const q = new URLSearchParams({ ekran: a.ekran }); if (a.bolum) q.set('bolum', a.bolum);
  return `${gorunumAdresi('plan')}?${q.toString()}`;
}

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
  // Motor sayfasının ekranı (yalnız `plan` görünümünde tahta dışı olabilir) ve ona geçiş; geçiş `plan` görünümüne gider. Verilmezse ekran tahtadır,
  // ekran düğmeleri pasif kalır (iskeletsiz çizim, testler).
  alt?: PlanlamaAltEkrani;
  altSec?: (a: PlanlamaAltEkrani) => void;
}

export interface GorunumKaydi {
  anahtar: PlanlamaGorunumu;
  baslik: string;
  simge: SimgeAdi;
  parca: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';
  bilesen: LazyExoticComponent<ComponentType<PlanlamaEkranOzellikleri>>;
}

const parca = <M extends Record<string, unknown>>(yukle: () => Promise<M>, ad: keyof M & string) =>
  lazy(async () => ({ default: (await yukle())[ad] as ComponentType<PlanlamaEkranOzellikleri> }));

// Her sayfanın üstündeki plan çubuğu (Soru 497/10 a) P1'indir; motor sayfası kendi çubuğunu çizer, iskelet ötekilerin üstüne koyar.
export const PlanSeridi = lazy(async () => ({ default: (await import('./motor/ust/PlanSeridi.tsx')).PlanSeridi }));

const BILESENLER: Record<PlanlamaGorunumu, Pick<GorunumKaydi, 'parca' | 'bilesen'>> = {
  plan: { parca: 'P1', bilesen: parca(() => import('./motor/index.tsx'), 'PlanlamaMotoru') },
  studio: { parca: 'P1', bilesen: parca(() => import('./motor/index.tsx'), 'PlanlamaAtolyesi') },
  ysiparis: { parca: 'P2', bilesen: parca(() => import('./siparis/index.tsx'), 'Siparisler') },
  terminler: { parca: 'P2', bilesen: parca(() => import('./siparis/index.tsx'), 'Terminler') },
  denge: { parca: 'P2', bilesen: parca(() => import('./siparis/index.tsx'), 'TerminVeKar') },
  maliyet: { parca: 'P3', bilesen: parca(() => import('./maliyet/index.tsx'), 'Maliyetler') },
  giderler: { parca: 'P3', bilesen: parca(() => import('./maliyet/index.tsx'), 'GenelGider') },
  mesaiplan: { parca: 'P3', bilesen: parca(() => import('./maliyet/index.tsx'), 'EkMesaiPlani') },
  fasonplan: { parca: 'P3', bilesen: parca(() => import('./maliyet/index.tsx'), 'FasonPlani') },
  malzplan: { parca: 'P4', bilesen: parca(() => import('./malzeme/index.tsx'), 'MalzemePlani') },
  yillik: { parca: 'P5', bilesen: parca(() => import('./ufuk/index.tsx'), 'YillikPlan') },
  ufuk: { parca: 'P5', bilesen: parca(() => import('./ufuk/index.tsx'), 'Ufuk') },
  sevkiyat: { parca: 'P6', bilesen: parca(() => import('./sevkiyat/index.tsx'), 'Sevkiyat') },
};

export const GORUNUM_KAYITLARI: readonly GorunumKaydi[] = PLANLAMA_GRUBU.map((m) => ({
  anahtar: m.anahtar, baslik: m.baslik, simge: m.simge, ...BILESENLER[m.anahtar],
}));

export function gorunumOku(parca: string | undefined): PlanlamaGorunumu | null {
  return GORUNUM_KAYITLARI.find((k) => k.anahtar === parca)?.anahtar ?? null;
}

export function gorunumAdresi(g: PlanlamaGorunumu): string { return `${KOK}/${g}`; }

// Maliyet ve kâr gösteren görünümler birim maliyet okumasını da ister (menüdeki gibi; planlama rolü maliyet görmez, 200 a).
export function gorunumAcik(g: PlanlamaGorunumu, yetki: PlanlamaYetkisi): boolean {
  return MALIYET_ANAHTARLARI.includes(g) ? yetki.maliyetOku : yetki.planlamaOku;
}
