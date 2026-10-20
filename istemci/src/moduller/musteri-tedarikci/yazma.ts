import { useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import type { FirmaAyrintiCevabi, FirmaCevabi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';

export const ESKI_SURUM_ILETISI = 'Kayıt başkası tarafından değişti, yeniden yükleyin.';

// Yazma düğmeleri yalnız yazma işlemi olana görünür; asıl denetim sunucudadır.
export function useYazabilir(): boolean {
  return (useOturum().data?.islemler ?? []).includes('musteri-tedarikci.yaz');
}

export const surumCakismasiMi = (hata: unknown): boolean => hata instanceof ApiHatasi && eskiSurumMu(hata.govde);

export function yazmaIletisi(hata: unknown, varsayilan: string): string {
  return surumCakismasiMi(hata) ? ESKI_SURUM_ILETISI : hataIletisi(hata, varsayilan);
}

// Yazma cevabındaki kart ayrıntıya konur (adres komutları adres listesini de getirir); liste yeniden okunur.
export function cevabiYaz(istemci: QueryClient, cevap: FirmaCevabi | FirmaAyrintiCevabi): void {
  istemci.setQueryData<FirmaAyrintiCevabi>(anahtarlar.ayrinti(cevap.firma.id), (onceki) => {
    if ('adresler' in cevap) return cevap;
    return onceki && { ...onceki, firma: cevap.firma };
  });
  void istemci.invalidateQueries({ queryKey: anahtarlar.listeler });
}

export function eskiyseYenile(istemci: QueryClient, id: number, hata: unknown): void {
  if (surumCakismasiMi(hata)) void istemci.invalidateQueries({ queryKey: anahtarlar.ayrinti(id) });
}

// Tekrar korumalı ekleme: aynı gövde sonucu bilinmeyen bir hatadan sonra yeniden gönderilirse aynı kimlikle gider,
// kayıt en çok bir kez açılır. Gövde değişirse ya da sunucu karar verirse (4xx) yeni kimlik alınır.
export function useKorumaliEkleme() {
  const son = useRef<{ govde: string; kimlik: string } | null>(null);
  return async <T>(yol: string, govde: object): Promise<T> => {
    const metin = JSON.stringify(govde);
    const istekKimligi = son.current?.govde === metin ? son.current.kimlik : yeniIstekKimligi();
    son.current = { govde: metin, kimlik: istekKimligi };
    try {
      const cevap = await tekrarKorumaliGonder((deneme) => api.post<T>(yol, govde, deneme), { istekKimligi });
      son.current = null;
      return cevap;
    } catch (hata) {
      if (!yenidenDenenebilirMi(hata)) son.current = null;
      throw hata;
    }
  };
}
