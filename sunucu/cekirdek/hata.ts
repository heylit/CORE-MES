import { ESKI_SURUM_ILETISI, ESKI_SURUM_NEDENI, HATA_DURUMU, KAPSAM_DISI_ILETISI } from '#paylasilan/hata.ts';
import type { EskiSurumAyrintisi, HataGovdesi, HataKodu } from '#paylasilan/hata.ts';

export interface HataEki {
  alan?: string;
  ayrinti?: unknown;
  // Reddedilen komutun o ana kadarki yazıları geri alınmaz (örnek: hatalı giriş denemesinin kaydı).
  yazilarKalir?: boolean;
}

export class UygulamaHatasi extends Error {
  readonly kod: HataKodu;
  readonly alan: string | undefined;
  readonly ayrinti: unknown;
  readonly yazilarKalir: boolean;

  constructor(kod: HataKodu, mesaj: string, ek: HataEki = {}) {
    super(mesaj);
    this.name = 'UygulamaHatasi';
    this.kod = kod;
    this.alan = ek.alan;
    this.ayrinti = ek.ayrinti;
    this.yazilarKalir = ek.yazilarKalir ?? false;
  }

  get mesaj(): string {
    return this.message;
  }

  get durum(): number {
    return HATA_DURUMU[this.kod];
  }

  govde(): HataGovdesi {
    const govde: HataGovdesi = { kod: this.kod, mesaj: this.message };
    if (this.alan !== undefined) govde.alan = this.alan;
    if (this.ayrinti !== undefined) govde.ayrinti = this.ayrinti;
    return govde;
  }
}

export const dogrulama = (mesaj: string, alan?: string, ayrinti?: unknown): UygulamaHatasi =>
  new UygulamaHatasi('DOGRULAMA', mesaj, { alan, ayrinti });

export const oturumYok = (mesaj = 'Oturum açılmamış.'): UygulamaHatasi =>
  new UygulamaHatasi('OTURUM_YOK', mesaj);

export const yetkiYok = (mesaj = 'Bu işlem için yetkiniz yok.'): UygulamaHatasi =>
  new UygulamaHatasi('YETKI_YOK', mesaj);

// İşlemi olan kişinin veri kapsamı dışındaki kayda yazması: kod işlem reddiyle aynıdır, ileti tektir.
export const kapsamDisi = (): UygulamaHatasi => yetkiYok(KAPSAM_DISI_ILETISI);

export const bulunamadi = (mesaj = 'Kayıt bulunamadı.'): UygulamaHatasi =>
  new UygulamaHatasi('BULUNAMADI', mesaj);

export const cakisma = (mesaj: string, ayrinti?: unknown): UygulamaHatasi =>
  new UygulamaHatasi('CAKISMA', mesaj, { ayrinti });

// Beklenen sürümle yazılamayan kayıt: ileti ve neden tektir, modül kendi metnini yazmaz.
export const eskiSurum = (): UygulamaHatasi =>
  cakisma(ESKI_SURUM_ILETISI, { neden: ESKI_SURUM_NEDENI } satisfies EskiSurumAyrintisi);

// Yabancı anahtarın iki yönü de aynı koda düşer: veritabanı ikisini ayrı kodla bildirmez.
export const bagimliKayit = (
  mesaj = 'İşlem yapılamadı: bağlanmak istenen kayıt yok ya da bu kayda bağlı başka kayıtlar var.',
): UygulamaHatasi => new UygulamaHatasi('BAGIMLI_KAYIT', mesaj);

export const gecersiz = (
  mesaj = 'Girilen değerler kabul edilmedi. Bilgileri kontrol edip yeniden deneyin.',
): UygulamaHatasi => new UygulamaHatasi('GECERSIZ', mesaj);

export const onayGerekli = (mesaj: string, ayrinti?: unknown): UygulamaHatasi =>
  new UygulamaHatasi('ONAY_GEREKLI', mesaj, { ayrinti });

// İsteği yineleyen istemcinin kendisidir; sunucunun doluluğu MESGUL'dür.
export const cokBuyuk = (mesaj: string): UygulamaHatasi => new UygulamaHatasi('COK_BUYUK', mesaj);
export const cokIstek = (mesaj: string): UygulamaHatasi => new UygulamaHatasi('COK_ISTEK', mesaj);

export const mesgul = (mesaj = 'Sistem şu an meşgul, birkaç saniye sonra tekrar deneyin.'): UygulamaHatasi =>
  new UygulamaHatasi('MESGUL', mesaj);

// Oturum veritabanında tutulur: veritabanı yokken isteğin kimin olduğu bilinemez, yetki kararı verilemez.
export const veritabaniYok = (mesaj = 'Veritabanına ulaşılamıyor, kimlik doğrulanamadı.'): UygulamaHatasi =>
  new UygulamaHatasi('VERITABANI_YOK', mesaj);
