import { createContext, lazy, useContext, type ComponentType, type LazyExoticComponent } from 'react';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { MALIYET_ANAHTARLARI } from '../planlama-menusu.ts';
import type { CalismaKomutu } from './kayit.ts';
import type { PlanlamaCalismasi } from './tipler.ts';
import type { PlanlamaDeposu } from './veri.ts';
import type { PlanlamaYetkisi } from './yetki.ts';

// Görünüm kaydı: sayfanın görünümleri, adres parçası eski ekranın anahtarıdır. 2538 b: bazı
// görünümler menüde değil, bir sayfanın sekmesidir (AILELER). Bileşenler parçalara iner (PARCA-SOZLESMESI.md); bileşen adları sözleşmededir.
export const KOK = '/plan';

const GORUNUMLER = [
  { anahtar: 'studio', baslik: 'Atölye', simge: 'flag' }, { anahtar: 'plan', baslik: 'Motor', simge: 'gantt' },
  { anahtar: 'ysiparis', baslik: 'Siparişler', simge: 'list' }, { anahtar: 'terminler', baslik: 'Terminler', simge: 'flag' },
  { anahtar: 'denge', baslik: 'Termin ve kâr', simge: 'gauge' }, { anahtar: 'ufuk', baslik: 'Ufuk', simge: 'route' },
  { anahtar: 'yillik', baslik: 'Yıllık plan', simge: 'chart' }, { anahtar: 'sevkiyat', baslik: 'Sevkiyat', simge: 'truck' },
  { anahtar: 'mesaiplan', baslik: 'Ek mesai planı', simge: 'clock' }, { anahtar: 'fasonplan', baslik: 'Fason planı', simge: 'truck' },
  { anahtar: 'malzplan', baslik: 'Malzeme satın alma planı', simge: 'box' },
  { anahtar: 'maliyet', baslik: 'Maliyetler', simge: 'lira' }, { anahtar: 'giderler', baslik: 'Genel gider', simge: 'layers' },
] as const satisfies readonly { anahtar: string; baslik: string; simge: SimgeAdi }[];
export type PlanlamaGorunumu = (typeof GORUNUMLER)[number]['anahtar'];
// 2535 a: kök adres Atölye'dir (günlük çalışma yeri, ikinci menünün ilk maddesi); motor `/plan/plan`. `/plan/studio` eski bağlantı olarak
// Atölye'yi açar.
export const ACILIS: PlanlamaGorunumu = 'studio';
// Bir sayfanın sekmesi olan görünümler (2538 b): adresleri ana görünümün altındadır (`/plan/ysiparis/terminler`); eski tek parçalı adres
// (`/plan/terminler`) yeni adrese yönlenir. Ana görünüm menüdedir, kabuk etkin maddeyi en uzun önekten bulur.
export const AILELER: Partial<Record<PlanlamaGorunumu, readonly PlanlamaGorunumu[]>> = { ysiparis: ['terminler', 'denge'], ufuk: ['yillik'] };
export function aileBasi(g: PlanlamaGorunumu): PlanlamaGorunumu | null {
  for (const [b, l] of Object.entries(AILELER) as [PlanlamaGorunumu, readonly PlanlamaGorunumu[]][]) if (l.includes(g)) return b;
  return null;
}

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
// Planlama atölyesine istek (zz36 TP.istek): stüdyo düğmeleri (tezgâhın "Stüdyoda aç"ı) atölyeyi açar, pano isteneni açar: tezgâhta süzgeç ve
// tezgâh günlüğü, siparişte rayda sipariş, olayda olay formu (v olay türüdür, formda ön seçili gelir; 2171). Adresin sorgusundadır
// (`studio?istek=tez&v=T1`); pano işleyince sorgu silinir.
export const STUDYO_OLAY_TURLERI = ['ariza', 'acil', 'malzeme', 'eksik', 'fason'] as const;
export type StudyoOlayTuru = (typeof STUDYO_OLAY_TURLERI)[number];
export type StudyoIstegi = { tur: 'tez' | 'sip'; v: string } | { tur: 'olay'; v: StudyoOlayTuru };
export function studyoIstegiOku(q: URLSearchParams): StudyoIstegi | null {
  const t = q.get('istek'), v = q.get('v');
  if (t === 'olay') { const o = STUDYO_OLAY_TURLERI.find((x) => x === v); return o ? { tur: 'olay', v: o } : null; }
  return (t === 'tez' || t === 'sip') && v ? { tur: t, v } : null;
}
// Tahtadaki olay düğmeleri (plan çubuğu, yardımcı) atölyenin olay formunu açar; tahta bağlamla verir, yazamayana ve tahta dışında null.
export const OLAY_YOK = 'Olay Planlama atölyesinden eklenir.';
export const OlayAcBaglami = createContext<((t: StudyoOlayTuru) => void) | null>(null);
export const useOlayAc = (): ((t: StudyoOlayTuru) => void) | null => useContext(OlayAcBaglami);
export function studyoAdresi(i: StudyoIstegi | null): string {
  return i ? `${gorunumAdresi('studio')}?${new URLSearchParams({ istek: i.tur, v: i.v }).toString()}` : gorunumAdresi('studio');
}
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
  // Atölyeye istek ve ona geçiş; null isteği adresten siler. Verilmezse stüdyo düğmeleri pasiftir.
  istek?: StudyoIstegi | null;
  studyoAc?: (i: StudyoIstegi | null) => void;
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

// Parçanın giriş dosyası bir kez istenir, bütün görünümleri ve çubuk aynı sözü bekler: aynı dosya iki yoldan aynı anda istenince test ortamının
// modül yükleyicisi ikinciye yarım modül verebiliyor (Atölye kökte açılınca görünüm ve çubuk birlikte istenir).
const birKez = <M,>(yukle: () => Promise<M>): (() => Promise<M>) => { let soz: Promise<M> | null = null; return () => (soz ??= yukle()); };
const motor = birKez(() => import('./motor/index.tsx'));
const siparis = birKez(() => import('./siparis/index.tsx'));
const maliyet = birKez(() => import('./maliyet/index.tsx'));
const ufuk = birKez(() => import('./ufuk/index.tsx'));

// Her sayfanın üstündeki plan çubuğu (Soru 497/10 a) P1'indir; motor sayfası kendi çubuğunu çizer, iskelet ötekilerin üstüne koyar. Çubuk
// P1'in giriş dosyasından (Tahta) da yüklenir; önce giriş dosyası beklenir. Üretim paketinde çubuk zaten motor parçasındadır.
export const PlanSeridi = lazy(async () => {
  await motor();
  return { default: (await import('./motor/ust/PlanSeridi.tsx')).PlanSeridi };
});

const BILESENLER: Record<PlanlamaGorunumu, Pick<GorunumKaydi, 'parca' | 'bilesen'>> = {
  plan: { parca: 'P1', bilesen: parca(motor, 'PlanlamaMotoru') },
  studio: { parca: 'P1', bilesen: parca(motor, 'PlanlamaAtolyesi') },
  ysiparis: { parca: 'P2', bilesen: parca(siparis, 'Siparisler') },
  terminler: { parca: 'P2', bilesen: parca(siparis, 'Terminler') },
  denge: { parca: 'P2', bilesen: parca(siparis, 'TerminVeKar') },
  maliyet: { parca: 'P3', bilesen: parca(maliyet, 'Maliyetler') },
  giderler: { parca: 'P3', bilesen: parca(maliyet, 'GenelGider') },
  mesaiplan: { parca: 'P3', bilesen: parca(maliyet, 'EkMesaiPlani') },
  fasonplan: { parca: 'P3', bilesen: parca(maliyet, 'FasonPlani') },
  malzplan: { parca: 'P4', bilesen: parca(() => import('./malzeme/index.tsx'), 'MalzemePlani') },
  yillik: { parca: 'P5', bilesen: parca(ufuk, 'YillikPlan') },
  ufuk: { parca: 'P5', bilesen: parca(ufuk, 'Ufuk') },
  sevkiyat: { parca: 'P6', bilesen: parca(() => import('./sevkiyat/index.tsx'), 'Sevkiyat') },
};

export const GORUNUM_KAYITLARI: readonly GorunumKaydi[] = GORUNUMLER.map((m) => ({
  anahtar: m.anahtar, baslik: m.baslik, simge: m.simge, ...BILESENLER[m.anahtar],
}));

const kayitli = (x: string | undefined): PlanlamaGorunumu | null => GORUNUM_KAYITLARI.find((k) => k.anahtar === x)?.anahtar ?? null;
// Adres parçalarından görünüm: `/plan/:gorunum/:sekme`. Sekme yalnız kendi ailesinin altında okunur; yanlış eşleşme null'dır.
export function gorunumOku(parca: string | undefined, sekme?: string): PlanlamaGorunumu | null {
  const g = kayitli(parca); if (g === null) return null;
  if (sekme === undefined) return g;
  const s = kayitli(sekme);
  return s !== null && aileBasi(s) === g ? s : null;
}

// Açılış görünümü kök adrestedir; sekme görünümü ailesinin altındadır. `/plan/studio` ve eski tek parçalı adresler yine açılır.
export function gorunumAdresi(g: PlanlamaGorunumu): string {
  if (g === ACILIS) return KOK;
  const b = aileBasi(g);
  return b ? `${KOK}/${b}/${g}` : `${KOK}/${g}`;
}

// Maliyet ve kâr gösteren görünümler birim maliyet okumasını da ister (menüdeki gibi; planlama rolü maliyet görmez, 200 a).
export function gorunumAcik(g: PlanlamaGorunumu, yetki: PlanlamaYetkisi): boolean {
  return MALIYET_ANAHTARLARI.includes(g) ? yetki.maliyetOku : yetki.planlamaOku;
}
