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

// Kabuk dışına götüren sayfalar: adres burada ve sahibinin menüsüne tiple bağlıdır.
// Operasyon listesi istasyonlarındır; "Operasyonlar sayfasında belirlenir" bağlantısı oraya gider (kart #544).
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

// 269 a, 1288: kartların etiketi yalnız Etiket Merkezi'nde, kart no ile basılır. Geçersiz no adrese girmez; geçerli no yoksa ya da
// Etiket Merkezi'nin bir seçimde kabul ettiğinden fazlası varsa adres kurulmaz (sınır sunucuda da denetlenir).
const ETIKET_MERKEZI: (typeof ETIKET_MERKEZI_SAYFALARI)[number]['yol'] = '/etiket-merkezi';
export const ETIKET_SECIM_SINIRI = 200;
export function malzemeEtiketiYolu(nolar: readonly unknown[]): string | null {
  const gecerli = nolar.filter((no): no is number => typeof no === 'number' && Number.isSafeInteger(no) && no > 0);
  if (gecerli.length === 0 || gecerli.length > ETIKET_SECIM_SINIRI) return null;
  return `${ETIKET_MERKEZI}?tur=malzeme&id=${[...new Set(gecerli)].join(',')}`;
}
