import type { ComponentType } from 'react';
import { IKINCI_MENULER } from '#paylasilan/sayfalar.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import type { RrVerisi } from './veri.ts';
import type { RrYetkisi } from './yetki.ts';
import { Operasyonlar, UrunVeRotalar } from './rotalar/index.tsx';
import { Kaynaklar, Malzemeler, Sureler } from './kaynaklar/index.tsx';
import { Stok, UretimEmirleri } from './emirler/index.tsx';
import { SartnameTalimat } from './sartnameler/index.tsx';

// Yeni ekranın iç gezinmesi: ikinci menünün "Reçete ve Rota" grubunun yedi maddesi aynı sırayla sekme olur (menü verisinden okunur).
// Planlama grubu bu ekranda yoktur (ayrı iş). Sekmenin adresi menü maddesinin adresidir (541, 527 1 a). Parça yazarları (R1-R3) bu
// dosyaya dokunmaz; yalnız kendi klasörlerindeki ekranı doldurur.

export interface EkranOzellikleri {
  veri: RrVerisi;
  yetki: RrYetkisi;
  // Başka bölüme geçer (ör. emirden ürünün rotasına); kimlik bölümün seçili kaydıdır, adres değil bileşen durumu olarak verilir.
  git: (anahtar: SekmeAnahtari, kimlik?: string) => void;
  // Başka bölümden gelen seçili kayıt (ürün, emir ya da revizyon kimliği); yoksa null.
  kimlik: string | null;
}

const menu = IKINCI_MENULER.find((m) => m.kok === '/recete-rota');
if (!menu) throw new Error('Reçete ve Rota ikinci menüsü bulunamadı');
type Madde = (typeof menu)['gruplar'][0]['maddeler'][number];
export type SekmeAnahtari = Madde['anahtar'];

// Sekme -> ekran ve sahibi parça. Anahtarlar bugünkü çerçevenin sekme kimlikleridir.
export const EKRANLAR: Record<SekmeAnahtari, { ekran: ComponentType<EkranOzellikleri>; parca: 'R1' | 'R2' | 'R3' }> = {
  orders: { ekran: UretimEmirleri, parca: 'R3' },
  stock: { ekran: Stok, parca: 'R3' },
  schema: { ekran: UrunVeRotalar, parca: 'R1' },
  ops: { ekran: Operasyonlar, parca: 'R1' },
  sureler: { ekran: Sureler, parca: 'R2' },
  items: { ekran: Malzemeler, parca: 'R2' },
  res: { ekran: Kaynaklar, parca: 'R2' },
  // Rota modülünün kütüphaneleri (989 a); rota tarafı olduğu için R1'in alanındadır.
  sartnameler: { ekran: SartnameTalimat, parca: 'R1' },
};

export interface YeniSekme {
  anahtar: SekmeAnahtari;
  baslik: string;
  simge: SimgeAdi;
  islem: string;
  yol: string;
}
// Kök adres ilk maddedir (Üretim emirleri).
const maddeler: readonly Madde[] = menu.gruplar[0].maddeler;
export const SEKMELER: readonly YeniSekme[] = maddeler.map((m) => ({
  anahtar: m.anahtar, baslik: m.baslik, simge: m.simge as SimgeAdi, islem: m.islem, yol: m.yol,
}));
// Sondaki `/` aynı adrestir (yönlendirici de öyle eşler).
export const sekmeBul = (adres: string): YeniSekme | undefined => SEKMELER.find((s) => s.yol === adres.replace(/(.)\/+$/, '$1'));
