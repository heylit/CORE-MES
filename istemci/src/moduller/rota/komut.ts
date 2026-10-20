import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';

// Tekrar korumalı rota ve plan komutları. Cevabı yitirilen komutu (ağ kopması, zaman aşımı, 5xx) kullanıcı yeniden
// gönderirse aynı kimlik gider; sunucu ikinci kez uygulamaz. Her tıkta yeni kimlik gitseydi ikinci kayıt yazılırdı.
// Kimlik başarıda ya da sunucunun kararıyla (4xx) bırakılır; aynı komut sonra bilerek yeniden verilebilir.
const sonucuBilinmeyenler = new Map<string, string>();

export async function korumaliPost<T>(yol: string, govde?: unknown): Promise<T> {
  const anahtar = `${yol}\n${JSON.stringify(govde ?? null)}`;
  const istekKimligi = sonucuBilinmeyenler.get(anahtar) ?? yeniIstekKimligi();
  sonucuBilinmeyenler.set(anahtar, istekKimligi);
  try {
    const cevap = await api.post<T>(yol, govde, { istekKimligi });
    sonucuBilinmeyenler.delete(anahtar);
    return cevap;
  } catch (hata) {
    if (!yenidenDenenebilirMi(hata)) sonucuBilinmeyenler.delete(anahtar);
    throw hata;
  }
}
