import type { ETIKET_MERKEZI_SAYFALARI } from '#paylasilan/sayfalar/etiket-merkezi.ts';
import type { ISTASYONLAR_IKINCI_MENU } from '#paylasilan/sayfalar/istasyonlar.ts';
import type { RECETE_ROTA_IKINCI_MENU } from '#paylasilan/sayfalar/recete-rota.ts';
import type { ROTA_IKINCI_MENU } from '#paylasilan/sayfalar/rota.ts';
import type { MALZEMELER_IKINCI_MENU } from '#paylasilan/sayfalar/malzemeler.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';

// Menü tek kaynaktır (`paylasilan/sayfalar/malzemeler.ts`): madde anahtarı prototipin görünüm adıdır, adres maddenin yoludur.
// İstemci menüyü değer olarak yalnız toplayıcıdan alır; buradaki tablo tiple menüye bağlıdır (eksik, fazla ya da farklı yol derlenmez).
type Madde = (typeof MALZEMELER_IKINCI_MENU)['gruplar'][number]['maddeler'][number];
// Logo gönderimi prototipin görünümü değil, kendi sayfasıdır (`rotalar.tsx`).
export type KatalogGorunumu = Exclude<Madde['anahtar'], 'logo'>;
// Menünün simgeleri istemcinin setinde olmalı: toplayıcıya girmeden de derlenirken denetlenir.
type SimgeSetinde<S extends SimgeAdi> = S;
export type MenuSimgeleri = SimgeSetinde<Madde['simge']>;

export const GORUNUM_YOLLARI = {
  new: '/malzemeler/yeni',
  cat: '/malzemeler',
  tpl: '/malzemeler/sablonlar',
  mayar: '/malzemeler/ayarlar',
  kilavuz: '/malzemeler/kilavuz',
} as const satisfies { [A in KatalogGorunumu]: Extract<Madde, { anahtar: A }>['yol'] };

// Eski çerçeve (572, 527 1 a): yeni ekran menü adresindedir, çerçeve kişi menüsündeki "Eski görünüm" ile bu kökün altında açılır.
// Görünümün eski adresi menü yolunun aynı alt yoludur (`/malzemeler/sablonlar` -> `/malzemeler/eski/sablonlar`).
export const ESKI_KOK = '/malzemeler/eski';

// Adresin görünümü (menü yolu ya da eski adresi); tanımsız alt yol null (ekran köke döner).
export function adrestekiGorunum(adres: string): KatalogGorunumu | null {
  const temiz = adres.length > 1 ? adres.replace(/\/+$/, '') : adres;
  const yol = temiz === ESKI_KOK || temiz.startsWith(`${ESKI_KOK}/`) ? `/malzemeler${temiz.slice(ESKI_KOK.length)}` : temiz;
  const bulunan = Object.entries(GORUNUM_YOLLARI).find(([, y]) => y === yol);
  return bulunan ? (bulunan[0] as KatalogGorunumu) : null;
}

// Prototipin kabuk dışına götürdüğü sayfalar: çerçeve yalnız anahtar yollar, adres burada ve sahibinin menüsüne tiple bağlıdır.
// Operasyon listesi istasyonlarındır; prototipin "Operasyonlar sayfasında belirlenir" bağlantısı oraya gider (kart #544).
// Rota şablonları Rota'nındır; kartın Operasyonlar adımındaki "Şablonları düzenle" oraya gider (kart #688).
// Rotası olan kartın operasyon ve reçetesi Reçete ve Rota'nın ürün ve rotalar görünümünde düzenlenir (233 a).
type ReceteRotaMaddesi = (typeof RECETE_ROTA_IKINCI_MENU)['gruplar'][number]['maddeler'][number];
type IstasyonMaddesi = (typeof ISTASYONLAR_IKINCI_MENU)['gruplar'][number]['maddeler'][number];
type RotaMaddesi = (typeof ROTA_IKINCI_MENU)['gruplar'][number]['maddeler'][number];
export const DIS_SAYFALAR = {
  'operasyon-tipleri': '/istasyonlar/operasyon-tipleri',
  'rota-sablonlari': '/rota/sablonlar',
  'urun-rotalari': '/recete-rota/schema',
} as const satisfies {
  'operasyon-tipleri': Extract<IstasyonMaddesi, { anahtar: 'operasyon-tipleri' }>['yol'];
  'rota-sablonlari': Extract<RotaMaddesi, { anahtar: 'sablonlar' }>['yol'];
  'urun-rotalari': Extract<ReceteRotaMaddesi, { anahtar: 'schema' }>['yol'];
};

export function disSayfaYolu(anahtar: unknown): string | null {
  return typeof anahtar === 'string' && Object.hasOwn(DIS_SAYFALAR, anahtar) ? DIS_SAYFALAR[anahtar as keyof typeof DIS_SAYFALAR] : null;
}

// 269 a: kartın etiketi Etiket Merkezi'nde kart no ile açılır; geçersiz no için adres kurulmaz.
const ETIKET_MERKEZI: (typeof ETIKET_MERKEZI_SAYFALARI)[number]['yol'] = '/etiket-merkezi';
export function malzemeEtiketiYolu(no: unknown): string | null {
  return typeof no === 'number' && Number.isSafeInteger(no) && no > 0 ? `${ETIKET_MERKEZI}?tur=malzeme&id=${no}` : null;
}
