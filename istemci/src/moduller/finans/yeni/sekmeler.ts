import { createElement, lazy, Suspense, type ComponentType } from 'react';
import { IKINCI_MENULER } from '#paylasilan/sayfalar.ts';
import { DurumKutusu } from '../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import type { AkisDegerleri, OlayTuru } from './akislar.ts';
import type { FinansVerisi, FinansYetkisi } from './veri.ts';

// Ekranın iç gezinmesi: ikinci menünün 14 maddesi aynı sırayla sekme olur (menü verisinden okunur). Her sekme menü maddesinin
// adresinde açılır (1418, 1392 a): menü, hızlı işler ve başka modüllerin bağları değişmeden ekrana gelir.
export const YENI_KOK = '/finans';

export interface EkranOzellikleri {
  // Rakam yetkisi (finans.oku) olmayanda null: Firmalar ve Genel gider veri beklemeden açılır.
  finans: FinansVerisi | null;
  yetki: FinansYetkisi;
  // Olay seçiciyi ya da doğrudan bir olayın formunu açar; ilk değerler (firma, seçili fatura) verilebilir.
  kayitGir: (tur?: OlayTuru, ilk?: Partial<AkisDegerleri>) => void;
}

// Menünün sabit verisi: anahtar ve sırası değişirse test kırılır (yeni madde kayda bilerek eklenir).
const finansMenusu = IKINCI_MENULER.find((m) => m.kok === '/finans');
if (!finansMenusu) throw new Error('Finans ikinci menüsü bulunamadı');
type Madde = (typeof finansMenusu)['gruplar'][number]['maddeler'][number];
// Kabuk şeridinin madde sayıları (firmalar, çekler) aynı uçtan sekmelere de yazılır: şerit bu ekranda çizilmez.
export const SAYAC_UCU: string | undefined = finansMenusu.sayacUcu;
export type SekmeAnahtari = Madde['anahtar'];

// Ekranlar ana pakete girmez: rotalar.tsx bu dosyayı sabit olarak ithal eder, kabuk da rotaları hevesli tarar; doğrudan ithal
// bütün bölümleri (ve grafik kitaplığını) ilk açılışta indirtiyordu. Bir bölüm ilk açılınca hepsi birlikte indirilir, sekmeler arası geçiş beklemez.
const yukleyiciler = {
  ana: () => import('./ana/index.tsx'),
  ayarlar: () => import('./ayarlar/index.tsx'),
  cekler: () => import('./cekler/index.tsx'),
  firmalar: () => import('./firmalar/index.tsx'),
  kayitlar: () => import('./kayitlar/index.tsx'),
  plan: () => import('./plan/index.tsx'),
  raporlar: () => import('./raporlar/index.tsx'),
  genelGider: () => import('./genel-gider.tsx'),
  saatlikMaliyet: () => import('../saatlik-maliyet/SaatlikMaliyet.tsx'),
};
let hepsi: Promise<unknown> | null = null;
// İndirilemeyen bölüm (bağlantı koptu) burada sessiz kalır: açıldığında kendi beklemesi hatayı gösterir, sonraki açılış yeniden dener.
const hepsiniYukle = (): Promise<unknown> => (hepsi ??= Promise.all(Object.values(yukleyiciler).map((y) => y())).catch(() => { hepsi = null; }));

// Bekleme bölümün içinde çizilir: kabuğun rota beklemesine düşen ekran sekmeleriyle birlikte kaybolurdu. Ötekiler açılan bölüm
// geldikten sonra istenir: aynı klasörü iki yerden aynı anda istemek test ortamının modül yükleyicisinde yarım modül döndürüyordu.
function tembel<M>(yukle: () => Promise<M>, sec: (m: M) => ComponentType<EkranOzellikleri>): ComponentType<EkranOzellikleri> {
  const Ekran = lazy(async () => {
    const m = await yukle();
    void hepsiniYukle();
    return { default: sec(m) };
  });
  return (ozellik) => createElement(Suspense, { fallback: createElement(DurumKutusu, { durum: 'yukleniyor' }) }, createElement(Ekran, ozellik));
}

const AnaSayfa = tembel(yukleyiciler.ana, (m) => m.AnaSayfa);
const Ayarlar = tembel(yukleyiciler.ayarlar, (m) => m.Ayarlar);
const Cekler = tembel(yukleyiciler.cekler, (m) => m.Cekler);
const Firmalar = tembel(yukleyiciler.firmalar, (m) => m.Firmalar);
const Kayitlar = tembel(yukleyiciler.kayitlar, (m) => m.Kayitlar);
const NakitPlani = tembel(yukleyiciler.plan, (m) => m.NakitPlani);
const Butce = tembel(yukleyiciler.plan, (m) => m.Butce);
const VergiTakvimi = tembel(yukleyiciler.plan, (m) => m.VergiTakvimi);
const DurumVeOneriler = tembel(yukleyiciler.raporlar, (m) => m.DurumVeOneriler);
const GelirTablosu = tembel(yukleyiciler.raporlar, (m) => m.GelirTablosu);
const KararAraclari = tembel(yukleyiciler.raporlar, (m) => m.KararAraclari);
const AyKapanisi = tembel(yukleyiciler.raporlar, (m) => m.AyKapanisi);
const Tahminler = tembel(yukleyiciler.raporlar, (m) => m.Tahminler);
const GenelGider = tembel(yukleyiciler.genelGider, (m) => m.GenelGider);
const SaatlikMaliyet = tembel(yukleyiciler.saatlikMaliyet, (m) => m.SaatlikMaliyet);

// Sekme -> ekran ve sahibi parça. Firmalar, Genel gider ve Saatlik maliyetler rakam yetkisi istemez (kendi işlemiyle açılır).
export const EKRANLAR: Record<SekmeAnahtari, { ekran: ComponentType<EkranOzellikleri>; parca: 'F1' | 'F2' | 'F3' | 'F4' | 'var' }> = {
  'ana-sayfa': { ekran: AnaSayfa, parca: 'F4' },
  kayitlar: { ekran: Kayitlar, parca: 'F1' },
  firmalar: { ekran: Firmalar, parca: 'F1' },
  cekler: { ekran: Cekler, parca: 'F2' },
  nakit: { ekran: NakitPlani, parca: 'F2' },
  butce: { ekran: Butce, parca: 'F2' },
  vergi: { ekran: VergiTakvimi, parca: 'F2' },
  durum: { ekran: DurumVeOneriler, parca: 'F3' },
  'gelir-tablosu': { ekran: GelirTablosu, parca: 'F3' },
  'karar-araclari': { ekran: KararAraclari, parca: 'F3' },
  'ay-sonu': { ekran: AyKapanisi, parca: 'F3' },
  tahminler: { ekran: Tahminler, parca: 'F3' },
  'genel-gider': { ekran: GenelGider, parca: 'var' },
  'saatlik-maliyet': { ekran: SaatlikMaliyet, parca: 'var' },
  ayarlar: { ekran: Ayarlar, parca: 'F4' },
};

// Finans verisini beklemeden açılan sekmeler: kendi verisini kendisi okur.
export const VERISIZ: ReadonlySet<SekmeAnahtari> = new Set<SekmeAnahtari>(['firmalar', 'genel-gider', 'saatlik-maliyet']);

export interface YeniSekme {
  anahtar: SekmeAnahtari;
  baslik: string;
  simge: SimgeAdi;
  islem: string;
  // İşlemin yanında sekmeyi açan öteki işlemler (menüdeki `veya`; 3165 a: Ayarlar beş eylemden biriyle açılır).
  veya: readonly string[];
  yol: string;
  // Menüdeki grubun başlığı (Plan, Raporlar, Sistem); ilk grubun başlığı yoktur.
  grup: string | null;
}
const gruplar = finansMenusu.gruplar as readonly { baslik?: string; maddeler: readonly Madde[] }[];
export const SEKMELER: readonly YeniSekme[] = gruplar.flatMap((g) => g.maddeler.map((m) => ({
  anahtar: m.anahtar, baslik: m.baslik, simge: m.simge as SimgeAdi, islem: m.islem, veya: 'veya' in m && Array.isArray(m.veya) ? (m.veya as readonly string[]) : [], yol: m.yol, grup: g.baslik ?? null,
})));
// Sekme, kendi işlemi ya da `veya` listesindeki işlemlerden biriyle açılır.
export const sekmeAcik = (s: YeniSekme, varMi: (islem: string) => boolean): boolean => varMi(s.islem) || s.veya.some(varMi);
const YOLLAR = new Map(SEKMELER.map((s) => [s.anahtar, s.yol]));
export const yeniYol = (anahtar: SekmeAnahtari): string => YOLLAR.get(anahtar) ?? YENI_KOK;

// Sondaki `/` aynı adrestir (yönlendirici de öyle eşler); menüde olmayan adres sekme değildir.
export const adrestenSekme = (yol: string): YeniSekme | undefined => {
  const temiz = yol.length > 1 ? yol.replace(/\/+$/, '') : yol;
  return SEKMELER.find((s) => s.yol === temiz);
};

// TS geçişinin deneme adresi (`/finans/yeni`, `/finans/yeni/<bölüm>`) aynı bölümün adresine düşer; bilinmeyen bölüm Ana sayfa'ya.
export const ESKI_DENEME_KOKU = '/finans/yeni';
export const denemeAdresindenYeni = (bolum: string | undefined): string =>
  SEKMELER.find((s) => s.anahtar === bolum)?.yol ?? YENI_KOK;
