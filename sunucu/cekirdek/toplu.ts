import { HATA_DURUMU } from '#paylasilan/hata.ts';
import { kisitIhlali, vtVeriHatasi } from './db.ts';
import { UygulamaHatasi } from './hata.ts';

// Toplu komutta satırın reddi: ileti "Satır N: ..." olur, alan gövdedeki yerini (`satirlar.<sıra>.<alan>`), ayrıntı Excel satırını taşır.
// Kullanıcının düzeltebileceği ret sarılır: uygulama hatası ve önce kendi çevirisinden geçen veritabanı kısıt ya da değer hatası
// (kaynak `neden` olarak kalır, günlük kısıt izini yine yazar). Sistem hatası (5xx: meşgul, veritabanı yok, beklenmeyen) satıra
// bağlanmaz, olduğu gibi fırlar. `yazilarKalir` bilerek taşınmaz: toplu komutta bir satırın reddi bütün satırları geri alır.
export async function satirdaReddet<T>(sira: number, satir: number, is: () => Promise<T>): Promise<T> {
  try {
    return await is();
  } catch (ham) {
    const hata = ham instanceof UygulamaHatasi ? ham : kisitIhlali(ham)?.hata ?? vtVeriHatasi(ham);
    if (hata === null || hata.durum >= HATA_DURUMU.SUNUCU) throw ham;
    const ek = typeof hata.ayrinti === 'object' && hata.ayrinti !== null ? hata.ayrinti : {};
    const alan = hata.alan === undefined ? `satirlar.${String(sira)}` : `satirlar.${String(sira)}.${hata.alan}`;
    throw new UygulamaHatasi(hata.kod, `Satır ${String(satir)}: ${hata.message}`, {
      alan, ayrinti: { ...ek, satir }, ...(ham === hata ? {} : { neden: ham }),
    });
  }
}
