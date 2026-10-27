import { useRef } from 'react';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';

export const ESKI_SURUM_ILETISI = 'Kayıt başkası tarafından değişti, yeniden yükleyin.';

const useIslemVar = (islem: Islem): boolean => (useOturum().data?.islemler ?? []).includes(islem);

// Düğmeler yalnız işlemi olana görünür; asıl denetim ve durum kuralı sunucudadır, reddi ekranda yazılır.
export const useYazabilir = (): boolean => useIslemVar('siparisler.yaz');
export const useOnaylayabilir = (): boolean => useIslemVar('siparisler.onayla');
// 291 a: eşiği aşan teklif iskontosunu yalnız müdür onaylar.
export const useIskontoOnaylar = (): boolean => useIslemVar('siparisler.iskonto-onayla');
// 180: fiyat, tutar ve teklif sürümü yalnız fiyatı görene; sunucu da bu alanları boş döner.
export const useFiyatGorur = (): boolean => useIslemVar('siparisler.fiyat-oku');
// 44, 65 a: teklifi plana dener; maliyet dökümü ayrı işlemdir. 63 b, 871: geciktiren termini siparisler.termin-onayla yetkilisi onaylar.
export const useTerminDener = (): boolean => useIslemVar('siparisler.termin-dene');
export const useMaliyetOkur = (): boolean => useIslemVar('siparisler.maliyet-oku');
export const useTerminOnaylar = (): boolean => useIslemVar('siparisler.termin-onayla');
// 195 a: elle çarpanı plan.yaz 2'ye, siparisler.onayla 3'e kadar verir; sınırı sunucu denetler, ekran yalnız uyarır.
// Değerler Plan sözleşmesindeki ELLE_CARPAN'dır (istemci sözleşmeden değer ithal etmez).
export const ELLE_CARPAN = { enAz: 0.5, planlama: 2, enCok: 3 } as const;
// 237 a: çarpanı okuma ucu bu işlemlerden birini ister; hiçbiri olmayana kart çizilmez (403 kutusu çıkmaz).
const CARPAN_OKUMA: readonly Islem[] = ['plan.yaz', 'plan.bedel-ayari', 'siparisler.fiyat-oku', 'siparisler.onayla'];
export const useCarpanGorur = (): boolean => {
  const islemler = useOturum().data?.islemler ?? [];
  return CARPAN_OKUMA.some((i) => islemler.includes(i));
};
// 306 a: bant ucu (GET /plan/siparisler/:id/bant) bu işlemlerden birini ister.
const BANT_OKUMA: readonly Islem[] = ['plan.yaz', 'plan.bedel-ayari', 'siparisler.fiyat-oku'];
export const useBantGorur = (): boolean => {
  const islemler = useOturum().data?.islemler ?? [];
  return BANT_OKUMA.some((i) => islemler.includes(i));
};
export function useCarpanSiniri(): number | null {
  const genis = useIslemVar('siparisler.onayla');
  const planlama = useIslemVar('plan.yaz');
  return genis ? ELLE_CARPAN.enCok : planlama ? ELLE_CARPAN.planlama : null;
}

export const surumCakismasiMi = (hata: unknown): boolean => hata instanceof ApiHatasi && eskiSurumMu(hata.govde);

export function yazmaIletisi(hata: unknown, varsayilan: string): string {
  return surumCakismasiMi(hata) ? ESKI_SURUM_ILETISI : hataIletisi(hata, varsayilan);
}

// Tekrar korumalı komut: aynı gövde sonucu bilinmeyen bir hatadan sonra yeniden gönderilirse aynı kimlikle gider,
// kayıt en çok bir kez açılır. Gövde değişirse ya da sunucu karar verirse (4xx) yeni kimlik alınır.
export function useKorumaliGonderim() {
  const son = useRef<{ anahtar: string; kimlik: string } | null>(null);
  return async <T>(yol: string, govde: object): Promise<T> => {
    const anahtar = `${yol} ${JSON.stringify(govde)}`;
    const istekKimligi = son.current?.anahtar === anahtar ? son.current.kimlik : yeniIstekKimligi();
    son.current = { anahtar, kimlik: istekKimligi };
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

// Sürüm çakışmasında ekranın kaydı sunucudaki güncel haliyle yeniden okunur.
export function eskiyseYenile(istemci: QueryClient, anahtar: QueryKey, hata: unknown): void {
  if (surumCakismasiMi(hata)) void istemci.invalidateQueries({ queryKey: anahtar });
}
