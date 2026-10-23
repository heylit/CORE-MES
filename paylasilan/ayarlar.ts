import type { AyarTanimi, TurDegerleri } from './ayar-tanimi.ts';
import { ARKON_AYARLARI } from './ayarlar/arkon.ts';
import { KABUK_AYARLARI } from './ayarlar/kabuk.ts';
import { ETIKET_MERKEZI_AYARLARI } from './ayarlar/etiket-merkezi.ts';
import { GUVENLIK_AYARLARI } from './ayarlar/guvenlik.ts';
import { IDARI_ISLER_AYARLARI } from './ayarlar/idari-isler.ts';
import { IK_AYARLARI } from './ayarlar/ik.ts';
import { LOGO_AYARLARI } from './ayarlar/logo.ts';
import { MALZEMELER_AYARLARI } from './ayarlar/malzemeler.ts';
import { NIZAMIYE_AYARLARI } from './ayarlar/nizamiye.ts';
import { ROTA_AYARLARI } from './ayarlar/rota.ts';
import { SATIN_ALMA_AYARLARI } from './ayarlar/satin-alma.ts';
import { SEVKIYAT_AYARLARI } from './ayarlar/sevkiyat.ts';
import { SIPARISLER_AYARLARI } from './ayarlar/siparisler.ts';
import { SMARTES_AYARLARI } from './ayarlar/smartes.ts';
import { STOK_AYARLARI } from './ayarlar/stok.ts';
import { URETIM_EMIRLERI_AYARLARI } from './ayarlar/uretim-emirleri.ts';

export type { AyarTuru } from './ayar-tanimi.ts';

// Ayarın tanımı koddadır, değeri veritabanında: burada olmayan anahtar okunamaz ve yazılamaz.
// Değer hiç yazılmamışsa tanımın varsayılanı geçerlidir. Modül ayarlarını `ayarlar/<modül>.ts` dosyasında bildirir.
export const AYAR_TANIMLARI = {
  ...ARKON_AYARLARI,
  ...KABUK_AYARLARI,
  ...ETIKET_MERKEZI_AYARLARI,
  ...GUVENLIK_AYARLARI,
  ...IDARI_ISLER_AYARLARI,
  ...IK_AYARLARI,
  ...LOGO_AYARLARI,
  ...MALZEMELER_AYARLARI,
  ...NIZAMIYE_AYARLARI,
  ...ROTA_AYARLARI,
  ...SATIN_ALMA_AYARLARI,
  ...SEVKIYAT_AYARLARI,
  ...SIPARISLER_AYARLARI,
  ...SMARTES_AYARLARI,
  ...STOK_AYARLARI,
  ...URETIM_EMIRLERI_AYARLARI,
} as const satisfies Record<string, AyarTanimi>;

export type AyarAnahtari = keyof typeof AYAR_TANIMLARI;
export type AyarDegeri<A extends AyarAnahtari> = TurDegerleri[(typeof AYAR_TANIMLARI)[A]['tur']];

// Belge numarası kalıbı taşıyan anahtarlar: numara isteyen modül yalnız bunlardan birini verebilir.
export type NumaraAnahtari = { [A in AyarAnahtari]: (typeof AYAR_TANIMLARI)[A]['tur'] extends 'numara' ? A : never }[AyarAnahtari];

export const AYAR_ANAHTARLARI = Object.keys(AYAR_TANIMLARI) as AyarAnahtari[];

// Bugün kayıtlı olmayan türler de dallarıyla derlensin diye tanım geniş türüyle verilir.
export const ayarTanimi = (anahtar: AyarAnahtari): AyarTanimi => AYAR_TANIMLARI[anahtar];

// `satisfies` her tanımın varsayılanını kendi türüyle denetler; genel anahtarla indeksli erişim bu bağı kaybeder
// (sayı ayarı kayıtlıyken `boolean | number | null` olur), tür bu yüzden burada verilir.
export const varsayilanDeger = <A extends AyarAnahtari>(anahtar: A): AyarDegeri<A> => AYAR_TANIMLARI[anahtar].varsayilan as AyarDegeri<A>;

export const ayarAnahtariMi = (deger: unknown): deger is AyarAnahtari =>
  typeof deger === 'string' && Object.hasOwn(AYAR_TANIMLARI, deger);
