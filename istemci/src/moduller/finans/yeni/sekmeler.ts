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

// Yeni ekranın iç gezinmesi: ikinci menünün 14 maddesi aynı sırayla sekme olur (menü verisinden okunur). İkinci menü
// alıma kadar eski ekranlara gider. Parça yazarları (F1-F4) bu dosyaya dokunmaz; yalnız kendi klasörlerindeki ekranı doldurur.
export const YENI_KOK = '/finans/yeni';

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
  eskiYol: string;
}
export const yeniYol = (anahtar: SekmeAnahtari): string => (anahtar === 'ana-sayfa' ? YENI_KOK : `${YENI_KOK}/${anahtar}`);
const maddeler: readonly Madde[] = (finansMenusu.gruplar as readonly { maddeler: readonly Madde[] }[]).flatMap((g) => g.maddeler);
export const SEKMELER: readonly YeniSekme[] = maddeler.map((m) => ({
  anahtar: m.anahtar, baslik: m.baslik, simge: m.simge as SimgeAdi, islem: m.islem, yol: yeniYol(m.anahtar), eskiYol: m.yol,
}));
export const sekmeBul = (bolum: string | undefined): YeniSekme | undefined =>
  (bolum === undefined ? SEKMELER[0] : SEKMELER.find((s) => s.anahtar === bolum && s.anahtar !== 'ana-sayfa'));
