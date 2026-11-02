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
