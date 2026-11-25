import type { LogoYardimciBaglantiHatasi } from '#paylasilan/sozlesme/logo.ts';
import { baglantiHatasiAciklamasi, baglantiHatasiniAyikla } from './kurallar.ts';

// Yardımcının son "Logo oturumu açılamadı" (503 baglanamadi) cevabı. Süreç belleğindedir (yardimci-surumu.ts gibi); Logo hazırlık ve
// bağlantı izleme ekranı okur. Parola ve kullanıcı adı yardımcıda metinden çıkarılır; burada yalnız gelen ayrıntı saklanır.
let son: LogoYardimciBaglantiHatasi | null = null;

// Yazmadan (GET dışı) gelen son 503. Okumalar (SQL) çalışırken de yazmanın kapalı olduğunu gösterir; başarılı okuma bunu silmez, yalnız başarılı yazma
// ya da açık oturum denemesi siler.
let sonYazma: LogoYardimciBaglantiHatasi | null = null;
export const YAZMA_UYARISI_PENCERESI_MS = 15 * 60_000;

export const sonBaglantiHatasi = (): LogoYardimciBaglantiHatasi | null => son;
export const baglantiHatasiniTemizle = (): void => { son = null; sonYazma = null; };
// Son 15 dakikada yazmadan 503 geldiyse o hata; yoksa null.
export const yazmaUyarisi = (simdi: Date = new Date()): LogoYardimciBaglantiHatasi | null =>
  sonYazma !== null && simdi.getTime() - new Date(sonYazma.zaman).getTime() <= YAZMA_UYARISI_PENCERESI_MS ? sonYazma : null;
// Oturum denemesi oturumun açık olduğunu gördü: eski hata artık geçerli değildir.
export const oturumAcildi = (): void => baglantiHatasiniTemizle();

// Köprü isteği cevaplanınca çağrılır. 503 baglanamadi kaydedilir; Logo Objects'e dokunan bir yazma (GET dışı) başarıyla dönerse oturum açılmıştır, kayıt silinir.
export function yardimciCevabiniIzle(yontem: string, durum: number, govde: unknown, zaman: Date = new Date()): void {
  if (durum === 503) {
    const b = baglantiHatasiniAyikla(govde);
    if (b === null) return;
    const kayit: LogoYardimciBaglantiHatasi = {
      zaman: zaman.toISOString(), adim: b.adim, kod: b.kod, ileti: b.ileti, aciklama: baglantiHatasiAciklamasi(b),
      yenidenDeneme: b.beklemeSn === null || b.beklemeSn === 0 ? null : new Date(zaman.getTime() + b.beklemeSn * 1000).toISOString(),
    };
    son = kayit;
    if (yontem !== 'GET') sonYazma = kayit;
    return;
  }
  if (yontem !== 'GET' && durum >= 200 && durum < 300) { son = null; sonYazma = null; }
}
