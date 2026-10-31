import type { ComponentType } from 'react';
import { IKINCI_MENULER } from '#paylasilan/sayfalar.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import type { AkisDegerleri, OlayTuru } from './akislar.ts';
import type { FinansVerisi, FinansYetkisi } from './veri.ts';
import { AnaSayfa } from './ana/index.tsx';
import { Ayarlar } from './ayarlar/index.tsx';
import { Cekler } from './cekler/index.tsx';
import { Firmalar } from './firmalar/index.tsx';
import { Kayitlar } from './kayitlar/index.tsx';
import { Butce, NakitPlani, VergiTakvimi } from './plan/index.tsx';
import { AyKapanisi, DurumVeOneriler, GelirTablosu, KararAraclari, Tahminler } from './raporlar/index.tsx';
import { GenelGider } from './genel-gider.tsx';

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

// Sekme -> ekran ve sahibi parça. Firmalar ve Genel gider rakam yetkisi istemez (kendi işlemiyle açılır).
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
  ayarlar: { ekran: Ayarlar, parca: 'F4' },
};

// Finans verisini beklemeden açılan sekmeler: kendi verisini kendisi okur.
export const VERISIZ: ReadonlySet<SekmeAnahtari> = new Set<SekmeAnahtari>(['firmalar', 'genel-gider']);

export interface YeniSekme {
  anahtar: SekmeAnahtari;
  baslik: string;
  simge: SimgeAdi;
  islem: string;
  yol: string;
  // Menüdeki grubun başlığı (Plan, Raporlar, Sistem); ilk grubun başlığı yoktur.
  grup: string | null;
}
const gruplar = finansMenusu.gruplar as readonly { baslik?: string; maddeler: readonly Madde[] }[];
export const SEKMELER: readonly YeniSekme[] = gruplar.flatMap((g) => g.maddeler.map((m) => ({
  anahtar: m.anahtar, baslik: m.baslik, simge: m.simge as SimgeAdi, islem: m.islem, yol: m.yol, grup: g.baslik ?? null,
})));
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
