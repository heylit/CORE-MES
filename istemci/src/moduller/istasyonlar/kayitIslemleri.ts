import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Ekleme ve güncelleme aynı komut ailesidir; başarıda bütün istasyon sorgularını tazeler (seçim listeleri dahil).
// Güncelleme okunan sürümü taşır: arada başkası yazdıysa sunucu 409 döner ve pencere iletiyi gösterir.
export function useKayitIslemleri(temelYol: string, kapat: () => void) {
  const istemci = useQueryClient();
  const [hata, hataYaz] = useState<string | null>(null);
  const bitti = () => {
    void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    kapat();
  };
  const basarisiz = (h: unknown) => hataYaz(hataIletisi(h, 'İşlem tamamlanamadı.'));

  const kaydet = useMutation({
    mutationFn: ({ kayit, govde }: { kayit: { id: number; surum: number } | null; govde: object }) =>
      api.post(kayit === null ? temelYol : `${temelYol}/${kayit.id}/guncelle`, kayit === null ? govde : { ...govde, surum: kayit.surum }),
    onMutate: () => hataYaz(null),
    onSuccess: bitti,
    onError: basarisiz,
  });
  const sil = useMutation({
    mutationFn: (id: number) => api.post(`${temelYol}/${id}/sil`),
    onMutate: () => hataYaz(null),
    onSuccess: bitti,
    onError: basarisiz,
  });

  return { kaydet, sil, hata, mesgul: kaydet.isPending || sil.isPending };
}
