import { useQueryClient } from '@tanstack/react-query';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';

export const ESKI_SURUM_ILETISI = 'Kayıt başkası tarafından değişti; ekran yenilendi.';

// Düğmeler yalnız işlemi olana görünür; asıl denetim sunucudadır, reddi ekranda yazılır.
export const useIslemVar = (islem: Islem): boolean => (useOturum().data?.islemler ?? []).includes(islem);

export function yazmaIletisi(hata: unknown, varsayilan: string): string {
  return hata instanceof ApiHatasi && eskiSurumMu(hata.govde) ? ESKI_SURUM_ILETISI : hataIletisi(hata, varsayilan);
}

// Merkez komutu: başarıda da hatada da merkezin bütün sorguları yenilenir (sürüm çakışmasında ekran güncel kayda döner).
// Tekrar korumalı uçlar (yanıt, not, kategori ekleme) sonucu bilinmeyen hatada aynı kimlikle yeniden gönderilir; ötekiler sürümle korunur.
export function useMerkezKomutu() {
  const istemci = useQueryClient();
  return async <T>(yol: string, govde: object, korumali: boolean): Promise<T> => {
    try {
      return korumali
        ? await tekrarKorumaliGonder((d) => api.post<T>(yol, govde, d))
        : await api.post<T>(yol, govde);
    } finally {
      void istemci.invalidateQueries({ queryKey: anahtarlar.merkez });
      void istemci.invalidateQueries({ queryKey: anahtarlar.profil, exact: true });
    }
  };
}
