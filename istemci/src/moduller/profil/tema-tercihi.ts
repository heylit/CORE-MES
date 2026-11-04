import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import type { TemaCevabi, TemaSecGovdesi, TemaTercihi } from '#paylasilan/sozlesme/profil.ts';
import { api, ApiHatasi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { secimiDinle, tercihUygula } from '../../ortak/veri/tema.ts';

// Tema kişinin profilindedir (karar 2072 a): giren kişinin teması sunucudan okunup uygulanır, kişinin her seçimi profiline
// yazılır. Kaydı olmayan kişide cihazın son teması kalır. Ekranda bir şey çizmez; kabuğun üst çubuğunda her sayfada durur.
export const temaAnahtari = (kisiId: number) => ['profil', 'tema', kisiId] as const;

export function TemaEsitleyici(): null {
  const kisiId = useOturum().data?.id ?? null;
  const istemci = useQueryClient();
  const sorgu = useQuery({
    queryKey: temaAnahtari(kisiId ?? 0),
    queryFn: () => api.get<TemaCevabi>('/profil/tema'),
    enabled: kisiId !== null,
    staleTime: Infinity,
  });
  const surum = useRef<number | null>(null);

  useEffect(() => {
    if (sorgu.data === undefined) return;
    surum.current = sorgu.data.surum;
    if (sorgu.data.tema !== null) tercihUygula(sorgu.data.tema);
  }, [sorgu.data]);

  useEffect(() => {
    if (kisiId === null) return undefined;
    const anahtar = temaAnahtari(kisiId);
    // Sıra korunur: hızlı art arda seçimde son seçim en son yazılır.
    let zincir: Promise<void> = Promise.resolve();
    const yaz = async (tema: TemaTercihi, ikinciDeneme: boolean): Promise<void> => {
      if (surum.current === null) {
        const okunan = await istemci.fetchQuery({ queryKey: anahtar, queryFn: () => api.get<TemaCevabi>('/profil/tema') });
        surum.current = okunan.surum;
      }
      const govde: TemaSecGovdesi = { tema, surum: surum.current };
      try {
        const sonuc = await api.post<TemaCevabi>('/profil/tema-sec', govde, { istekKimligi: yeniIstekKimligi(), arkaPlan: true });
        surum.current = sonuc.surum;
        istemci.setQueryData(anahtar, sonuc);
      } catch (hata) {
        // Aynı kişinin başka ekranı araya yazdı: son seçim bu ekrandadır, güncel sürümle bir kez daha yazılır.
        if (!ikinciDeneme && hata instanceof ApiHatasi && eskiSurumMu(hata.govde)) {
          surum.current = null;
          await yaz(tema, true);
        }
        // Yazılamayan tercih cihazda uygulanmış kalır; profil bir sonraki seçimde yeniden yazılır.
      }
    };
    return secimiDinle((tema) => { zincir = zincir.then(() => yaz(tema, false)).catch(() => undefined); });
  }, [kisiId, istemci]);

  return null;
}
