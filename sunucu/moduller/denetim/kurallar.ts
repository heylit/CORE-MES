// 'pin' ve 'token' sözcük olarak aranır: 'pins' (çizim iğneleri), 'spindle', 'clippingPlanes' gibi adlar maskelenmez.
// Bitişik yazımda sözcük sınırı büyük harftir ('yeniPin', 'userPIN'); tamamı aynı harfle yazılmış 'spin' sınır taşımaz.
const GIZLI_ICEREN = /parola|sifre/i;
const GIZLI_SONEK = /(?:password|passwd|secret)$/i;
const GIZLI_AD = /^(?:pin|token)$|_(?:pin|token)$/i;
const GIZLI_BITISIK = /[a-z0-9](?:P[iI][nN]|T[oO][kK][eE][nN])$/;
// Sır özeti (pin_ozeti, kart_ozeti, belirtec_ozeti): özet de sırdır; kısa PIN'in özeti çevrimdışı denenerek çözülür.
// Değişiklik defteri sütun adını taşır, adı ayrıca işaretlenemez.
const GIZLI_OZET = /_ozeti$/i;
// Kişiyi tek başına tanıtan kimlik numaraları: İK gövdesi serbest sözlüktür, sözleşmede işaretlenemez.
const KISISEL_KIMLIK = /^(?:tckn|tc_?kimlik(?:_?no)?|sgk_?no)$/i;
// Banka hesabı, ücret, sağlık (KVKK md. 6) ve iletişim verisi: İK gövdesi aynı serbest sözlüktür. 'engel' tek başına plan ve
// stokta engelleyen durumdur, maskelenmez; yalnız 'engelDurumu' kişinin engellilik derecesidir.
const KISISEL_HASSAS = /^(?:iban(?:_?no)?|kan_?grubu|engel_?durumu|ucret_?gecmisi|adres|telefon|dogum_?tarihi)$|^maas|_(?:iban|maas|adres|telefon)$/i;
const KISISEL_HASSAS_BITISIK = /[a-z0-9](?:Iban|IBAN|Maas|Adres|Telefon)$/;

// Ad listesi ikinci katmandır: asıl işaret sözleşmededir (paylasilan/gizli.ts), çekirdek onu kayda vermeden uygular.
export const gizliAnahtarMi = (anahtar: string): boolean =>
  GIZLI_ICEREN.test(anahtar) || GIZLI_SONEK.test(anahtar) || GIZLI_AD.test(anahtar) || GIZLI_BITISIK.test(anahtar)
  || GIZLI_OZET.test(anahtar)
  || KISISEL_KIMLIK.test(anahtar) || KISISEL_HASSAS.test(anahtar)
  || KISISEL_HASSAS_BITISIK.test(anahtar);

// Gizli alan deftere hiç yazılmaz; alan adı kalır ki komutun ne taşıdığı görülsün.
export function gizle(deger: unknown): unknown {
  if (Array.isArray(deger)) return deger.map(gizle);
  if (deger === null || typeof deger !== 'object') return deger;
  return Object.fromEntries(
    Object.entries(deger).map(([anahtar, ic]) => [anahtar, gizliAnahtarMi(anahtar) ? '[gizli]' : gizle(ic)]),
  );
}

// DNT-01: listede yalnız hangi kaydın etkilendiğini söyleyen yol parametresi döner. Kayıt parametrenin türünü tutmaz;
// ayırt edilebilen tek tür, adı `id` ya da `...Id` olan ve değeri tam sayı olandır (`:id`, `:adimId`, `:kisiId`).
// Metin değerli parametreler (`:kimlik`, `:anahtar`, `:ozet`, `:tur`) içerik taşıyabilir; gövdeyle birlikte gizlenir.
const KIMLIK_ADI = /^id$|^[a-z][A-Za-z0-9]*Id$/;

export function kimlikParametreleri(parametre: unknown): Record<string, number> {
  if (parametre === null || typeof parametre !== 'object' || Array.isArray(parametre)) return {};
  return Object.fromEntries(
    Object.entries(parametre).filter(([ad, deger]) => KIMLIK_ADI.test(ad) && !gizliAnahtarMi(ad) && Number.isSafeInteger(deger)),
  ) as Record<string, number>;
}

// 2158-4 a: sınırlı hesabın okuma kaydı yalnız hangi kaydın okunduğunu tutar. Kimlik adlı tam sayı (ya da tam sayı dizisi) kalır;
// öteki her değer (arama metni, tarih, durum, gizli adlı alan) adıyla "[gizli]" olur: arama kutusuna yazılan kişisel veri ya da
// sır kayda girmez. Düz nesne değilse bütünü gizlenir; boşsa (parametresiz uç) null.
const okunurKimlik = (ad: string, deger: unknown): boolean => KIMLIK_ADI.test(ad) && !gizliAnahtarMi(ad)
  && (Number.isSafeInteger(deger) || (Array.isArray(deger) && deger.length <= 100 && deger.every((d) => Number.isSafeInteger(d))));

export function okumaIzi(deger: unknown): Record<string, unknown> | string | null {
  if (deger === undefined || deger === null) return null;
  if (typeof deger !== 'object' || Array.isArray(deger)) return '[gizli]';
  const girdiler = Object.entries(deger);
  if (girdiler.length === 0) return null;
  return Object.fromEntries(girdiler.map(([ad, ic]) => [ad, okunurKimlik(ad, ic) ? ic : '[gizli]']));
}

// 2158-4 a: okuma kaydı 2 yıl saklanır; veritabanı tetiği de aynı süreyi uygular (göç 20261106098000).
export const OKUMA_SAKLAMA_GUN = 730;

export interface DegisiklikAlani { alan: string; eski: unknown; yeni: unknown }

// Defter alanı "sutun" ya da jsonb sütununda "sutun.anahtar"dır; gizli adlı alanın iki değeri de çıkmaz. Alan adı kalır ki
// neyin değiştiği görülsün. Değer nesneyse içindeki gizli adlar da maskelenir. Sıra alan adına göre (kararlı görünüm).
export function degisiklikAlanlari(alanlar: Record<string, { eski?: unknown; yeni?: unknown }>): DegisiklikAlani[] {
  return Object.entries(alanlar)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([alan, { eski = null, yeni = null }]) => {
      const gizli = alan.split('.').some(gizliAnahtarMi);
      return { alan, eski: gizli && eski !== null ? '[gizli]' : gizle(eski), yeni: gizli && yeni !== null ? '[gizli]' : gizle(yeni) };
    });
}

// Yol araması parça eşleşmesidir; kullanıcının yazdığı `%` ve `_` joker değil harf sayılır (ESCAPE '\').
export const icerenKalibi = (metin: string): string => `%${metin.replace(/[\\%_]/g, (h) => `\\${h}`)}%`;

// Değişiklik akışı (1962, 1966 a): okuyan modül tablo başına hangi alanların değerini göreceğini verir. Değeri yalnız bu alanlar taşır;
// değişen öteki alanların yalnız adı döner (akış onları "planı etkilemez" diye gösterir). jsonb alanı "sutun.anahtar" biçimindedir,
// izin sütun adıyla verilir. Gizli ad kuralı izinli alanda da geçerlidir.
export interface AkisAlanlari { alanlar: DegisiklikAlani[]; digerAlanlar: string[] }

export function akisAlanlari(
  alanlar: Record<string, { eski?: unknown; yeni?: unknown }>, izinli: readonly string[],
): AkisAlanlari {
  const izin = new Set(izinli);
  const hepsi = degisiklikAlanlari(alanlar);
  return {
    alanlar: hepsi.filter((a) => izin.has(a.alan.split('.')[0] ?? a.alan)),
    digerAlanlar: hepsi.filter((a) => !izin.has(a.alan.split('.')[0] ?? a.alan)).map((a) => a.alan),
  };
}

export const AKIS_EN_COK_SATIR = 500;
export const AKIS_EN_COK_TABLO = 50;
// Tablo adı tetiğin TG_TABLE_NAME'idir: küçük harf, rakam ve alt çizgi.
const TABLO_ADI = /^[a-z][a-z0-9_]{0,62}$/;

// Okuyan modülün sözlüğü kod sabitidir; yanlış sözlük sessizce boş akış vermesin diye okumadan önce denetlenir.
export function akisIstegiHatasi(istek: { tablolar: Readonly<Record<string, readonly string[]>>; sinir: number }): string | null {
  const tablolar = Object.keys(istek.tablolar);
  if (tablolar.length === 0) return 'Akış için en az bir tablo verilmeli.';
  if (tablolar.length > AKIS_EN_COK_TABLO) return `Akış en çok ${String(AKIS_EN_COK_TABLO)} tablodan okunur.`;
  const bozuk = tablolar.find((t) => !TABLO_ADI.test(t));
  if (bozuk !== undefined) return `Tablo adı geçersiz: ${bozuk}`;
  if (!Number.isSafeInteger(istek.sinir) || istek.sinir < 1 || istek.sinir > AKIS_EN_COK_SATIR) {
    return `Akış sınırı 1 ile ${String(AKIS_EN_COK_SATIR)} arasında olmalı.`;
  }
  return null;
}
