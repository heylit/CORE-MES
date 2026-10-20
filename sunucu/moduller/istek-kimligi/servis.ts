import type { TekrarDeposu } from '#cekirdek/tekrar.ts';
import { ANAHTAR_BEKLEME_MS, SAKLAMA_SAAT, TEMIZLIK_SINIRI } from './kurallar.ts';
import { anahtarBul, anahtarEkle, anahtarSil, eskileriSil, sonucYaz } from './sorgular.ts';

// beklemeMs yalnız testten verilir: bekleme sınırı saniyeler beklenmeden sınanır.
export function tekrarDeposuKur(secenek: { beklemeMs?: number } = {}): TekrarDeposu {
  const beklemeMs = secenek.beklemeMs ?? ANAHTAR_BEKLEME_MS;
  return {
  async ayir(db, istek) {
    if (await anahtarEkle(db, istek, beklemeMs)) {
      // Zamanlanmış iş yok; temizlik yeni anahtar yazan her komutta koşar.
      await eskileriSil(db, SAKLAMA_SAAT, TEMIZLIK_SINIRI);
      return null;
    }
    const satir = await anahtarBul(db, istek);
    // Çakışan satır süresi dolmuş bir satırdı ve araya giren temizlikle silindi: komut eskiden koşmuştu, cevabı artık
    // yok. Yeniden deneme süresi dolmuş kimlik gibi taze çalışır.
    if (satir === null) throw new Error('İstek kimliği satırı çakıştıktan sonra bulunamadı');
    return { govdeOzeti: satir.govde_ozeti, durumKodu: satir.durum_kodu, cevap: satir.cevap };
  },
  async sonucYaz(db, anahtar, sonuc) {
    await sonucYaz(db, anahtar, sonuc.durumKodu, sonuc.cevap === undefined ? null : JSON.stringify(sonuc.cevap));
  },
  async birak(db, anahtar) {
    await anahtarSil(db, anahtar);
  },
  };
}

export const tekrarDeposu: TekrarDeposu = tekrarDeposuKur();
