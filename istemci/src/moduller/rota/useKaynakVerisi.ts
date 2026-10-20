import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import type {
  IsMerkezleriCevabi, IstasyonlarCevabi, MakineDurumlariCevabi, MakinelerCevabi, PlanAyarlariCevabi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import type { TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';

// Kaynaklar bölümünün verisi: sahibi istasyonlar ve vardiya modülleridir, ekran yalnız uçlarını çağırır.
export const kaynakAnahtari = ['rotalar', 'kaynaklar'] as const;

export function useKaynakVerisi() {
  const [merkezler, istasyonlar, makineler, ayarlar, durumlar, takvim] = useQueries({
    queries: [
      { queryKey: [...kaynakAnahtari, 'merkez'], queryFn: () => api.get<IsMerkezleriCevabi>('/is-merkezleri?pasifler=true') },
      { queryKey: [...kaynakAnahtari, 'istasyon'], queryFn: () => api.get<IstasyonlarCevabi>('/istasyonlar?pasifler=true') },
      { queryKey: [...kaynakAnahtari, 'makine'], queryFn: () => api.get<MakinelerCevabi>('/makineler?pasifler=true') },
      { queryKey: [...kaynakAnahtari, 'ayar'], queryFn: () => api.get<PlanAyarlariCevabi>('/istasyon-plan-ayarlari') },
      { queryKey: [...kaynakAnahtari, 'durum'], queryFn: () => api.get<MakineDurumlariCevabi>('/makine-durumlari') },
      // Vardiya modülünün kendi anahtarı: vardiya yazması cevabı bu sorguya yazar (anahtar dışarı açılmadı, BASKA-MODUL-ISTEKLERI).
      { queryKey: ['vardiya', 'takvim'], queryFn: () => api.get<TakvimCevabi>('/vardiya-takvimi') },
    ],
  });
  const hepsi = [merkezler, istasyonlar, makineler, ayarlar, durumlar, takvim];
  return {
    yukleniyor: hepsi.some((q) => q.isPending),
    hata: hepsi.some((q) => q.isError),
    hataNesnesi: hepsi.find((q) => q.isError)?.error ?? null,
    yenile: () => { for (const q of hepsi) void q.refetch(); },
    merkezler: merkezler.data?.isMerkezleri ?? [],
    istasyonlar: istasyonlar.data?.istasyonlar ?? [],
    makineler: makineler.data?.makineler ?? [],
    ayarlar: ayarlar.data?.ayarlar ?? [],
    durumlar: durumlar.data?.durumlar ?? [],
    takvim: takvim.data,
  };
}

// Yazma: komut gönderilir, bütün kaynak verisi ve rota seçenekleri yenilenir; hata bildirilir.
export function useKaynakYaz() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  return useMutation({
    mutationFn: ({ yol, govde }: { yol: string; govde?: unknown }) => api.post<unknown>(yol, govde),
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: ['rotalar'] });
      await istemci.invalidateQueries({ queryKey: ['vardiya', 'takvim'] });
    },
    onError: (e) => bildir('hata', hataIletisi(e, 'Kaydedilemedi.')),
  });
}
