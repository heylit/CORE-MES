import type { LogoYardimciBaglantiHatasi } from '#paylasilan/sozlesme/logo.ts';
import { baglantiHatasiAciklamasi, baglantiHatasiniAyikla } from './kurallar.ts';

// Yardımcının son "Logo oturumu açılamadı" (503 baglanamadi) cevabı. Süreç belleğindedir (yardimci-surumu.ts gibi); Logo hazırlık ve
// bağlantı izleme ekranı okur. Parola ve kullanıcı adı yardımcıda metinden çıkarılır; burada yalnız gelen ayrıntı saklanır.
let son: LogoYardimciBaglantiHatasi | null = null;

export const sonBaglantiHatasi = (): LogoYardimciBaglantiHatasi | null => son;
export const baglantiHatasiniTemizle = (): void => { son = null; };

// Köprü isteği cevaplanınca çağrılır. 503 baglanamadi kaydedilir; Logo Objects'e dokunan bir yazma (GET dışı) başarıyla dönerse oturum açılmıştır, kayıt silinir.
export function yardimciCevabiniIzle(yontem: string, durum: number, govde: unknown, zaman: Date = new Date()): void {
  if (durum === 503) {
    const b = baglantiHatasiniAyikla(govde);
    if (b === null) return;
    son = {
      zaman: zaman.toISOString(), adim: b.adim, kod: b.kod, ileti: b.ileti, aciklama: baglantiHatasiAciklamasi(b),
      yenidenDeneme: b.beklemeSn === null || b.beklemeSn === 0 ? null : new Date(zaman.getTime() + b.beklemeSn * 1000).toISOString(),
    };
    return;
  }
  if (yontem !== 'GET' && durum >= 200 && durum < 300) son = null;
}
