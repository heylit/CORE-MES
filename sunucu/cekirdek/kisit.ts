import { kisitIhlali } from './db.ts';
import { UygulamaHatasi } from './hata.ts';

export interface KisitIletisi {
  ileti: string;
  // Formda hatanın gösterileceği alan (sözleşmedeki gövde alanının adı).
  alan?: string;
}

// Anahtar göçteki kısıt ya da tekil dizin adıdır; değer kullanıcıya gösterilecek ileti.
export type KisitEslemesi = Readonly<Record<string, string | KisitIletisi>>;

// Adı eşlemede olmayan ihlalin, türüne göre iletisi. Silmede ihlal edilen yabancı anahtar başka modülün
// tablosundadır: modül o adı bilemez, yeni bağlanan her modülde eşleme eskirdi. Modülün kendi kısıtı ada göre yazılır.
export type KisitYedegi = Readonly<Partial<Record<'CAKISMA' | 'BAGIMLI_KAYIT' | 'GECERSIZ', string | KisitIletisi>>>;

// Veritabanı kısıt adını bu uzunlukta keser; daha uzun anahtar hiçbir ihlalle eşleşmez.
const AD_EN_FAZLA_BAYT = 63;

function uzunAnahtar(esleme: KisitEslemesi): string | undefined {
  return Object.keys(esleme).find((ad) => Buffer.byteLength(ad, 'utf8') > AD_EN_FAZLA_BAYT);
}

// Kuralı veritabanı kısıtı tutar: önce bakıp sonra yazmak eşzamanlı iki komutu ayıramaz. Yazma burada koşar;
// eşlemedeki kısıt ihlal edilirse modülün iletisiyle uygulama hatası çıkar. Hata kodunu ihlalin türü belirler
// (tekillik CAKISMA, yabancı anahtar BAGIMLI_KAYIT, denetim GECERSIZ), eşleme yalnız iletiyi ve alanı verir.
// Ad eşlemede yoksa o tür için verilmiş yedek kullanılır; o da yoksa hata dokunulmadan geçer. Kısıt dışındaki
// her hata ve kısıt adı taşımayan boş geçilemez ihlali de dokunulmadan geçer.
// İhlal transaction'ı iptal eder ve burada ara kayıt noktası açılmaz: çıkan hata istek sınırına kadar
// yükselmelidir. Yakalayıp aynı transaction'da sürdüren komutun sonraki sorguları reddedilir, yazıları geri alınır.
// Ertelenmiş kısıt bitiş komutunda, buranın dışında denetlenir: çevrilmesi için yazmanın içinde
// `SET CONSTRAINTS <ad> IMMEDIATE` ile hemen denetletilir.
export async function kisitKorumali<T>(esleme: KisitEslemesi, is: () => Promise<T>, yedek: KisitYedegi = {}): Promise<T> {
  const uzun = uzunAnahtar(esleme);
  if (uzun !== undefined) throw new Error(`Kısıt adı ${AD_EN_FAZLA_BAYT} baytı aşıyor, hiçbir ihlalle eşleşmez: ${uzun}`);
  try {
    return await is();
  } catch (hata) {
    const ihlal = kisitIhlali(hata);
    if (ihlal === null) throw hata;
    const { kisit } = ihlal.iz;
    const adla = kisit !== null && Object.hasOwn(esleme, kisit) ? esleme[kisit] : undefined;
    const karsilik = adla ?? (yedek as Partial<Record<string, string | KisitIletisi>>)[ihlal.hata.kod];
    if (karsilik === undefined) throw hata;
    const { ileti, alan } = typeof karsilik === 'string' ? { ileti: karsilik, alan: undefined } : karsilik;
    throw new UygulamaHatasi(ihlal.hata.kod, ileti, { alan });
  }
}
