import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BelgeAyrintisi, OnizlemeGovdesi, Revizyon } from '#paylasilan/sozlesme/cizimler.ts';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { dosyaYukle, ikiliOku } from './dosya-aktarimi.ts';
import { AZAMI_MODEL_BAYT, OnizlemeAtlandi, onizlemeTuruMu, webglVarMi } from './onizleme-kurallari.ts';

type UretilecekRevizyon = Pick<Revizyon, 'id' | 'harf' | 'dosyaTuru' | 'boyut' | 'onizlemeKareSayisi'>;

// Önizleme yayının parçası değil, yayından sonraki arka plan işidir: hata yayını geri almaz, yalnız bildirimle uyarır.
// Üç boyutlu kütüphane yalnız üretim başlayınca iner.
export function useOnizleme() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [uretilen, uretilenYaz] = useState<number | null>(null);
  const calisiyor = useRef(false);

  const uret = useCallback(async (belgeId: number, r: UretilecekRevizyon): Promise<void> => {
    if (!onizlemeTuruMu(r.dosyaTuru) || calisiyor.current) return;
    if (r.boyut > AZAMI_MODEL_BAYT) { bildir('bilgi', `Revizyon ${r.harf} 25 MB sınırından büyük; önizleme üretilmedi.`); return; }
    if (!webglVarMi()) { bildir('bilgi', 'Bu cihazda üç boyutlu çizim yok; önizleme üretilmedi.'); return; }
    calisiyor.current = true;
    uretilenYaz(r.id);
    try {
      const veri = await ikiliOku(`/cizimler/${belgeId}/revizyonlar/${r.id}/dosya`);
      const { onizlemeKareleri } = await import('./goruntu/onizleme.ts');
      const kareler = await onizlemeKareleri(veri, r.dosyaTuru);
      const govde: OnizlemeGovdesi = { kareler: [] };
      for (const [kare, icerik] of kareler.entries()) govde.kareler.push({ kare, ozet: await dosyaYukle(icerik, () => {}) });
      await api.post<BelgeAyrintisi>(`/cizimler/${belgeId}/revizyonlar/${r.id}/onizleme`, govde);
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      bildir('tamam', `Revizyon ${r.harf} önizlemesi hazır.`);
    } catch (e) {
      bildir('hata', e instanceof OnizlemeAtlandi ? e.message : hataIletisi(e, 'Önizleme üretilemedi; belge etkilenmedi.'));
    } finally {
      calisiyor.current = false;
      uretilenYaz(null);
    }
  }, [bildir, istemci]);

  return { uret, uretilen };
}
