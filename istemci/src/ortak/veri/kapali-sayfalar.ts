import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KapaliSayfalarCevabi, KapaliSayfalarGovdesi } from '#paylasilan/sozlesme/ayarlar.ts';
import { api } from './api.ts';
import { anahtarlar } from './anahtarlar.ts';

const BOS: readonly string[] = [];

// Kabuk süzer, Sistem Ayarları değiştirir; ikisi aynı anahtarı okuduğundan anahtar çevrilince menü hemen değişir.
// Liste gelmeden (ya da alınamazsa) her sayfa açıktır: görünürlük ayarı yüzünden kimse uygulamadan düşmez.
export function useKapaliSayfalar(acik = true): readonly string[] {
  const sorgu = useQuery({
    queryKey: anahtarlar.kapaliSayfalar,
    queryFn: () => api.get<KapaliSayfalarCevabi>('/kapali-sayfalar'),
    enabled: acik,
    staleTime: Infinity,
  });
  return sorgu.data?.kapali ?? BOS;
}

// Ayar ekranı listeyi her açılışta tazeler ve yalnız yüklenmiş listeyle anahtar açar: boş varsayılan "hepsi açık" gibi gösterilmez.
export function useKapaliSayfalarDurumu() {
  const sorgu = useQuery({
    queryKey: anahtarlar.kapaliSayfalar,
    queryFn: () => api.get<KapaliSayfalarCevabi>('/kapali-sayfalar'),
    staleTime: Infinity,
    refetchOnMount: 'always',
  });
  return { kapali: sorgu.data?.kapali ?? BOS, hazir: sorgu.isSuccess && !sorgu.isFetching, hata: sorgu.isError, yenile: () => { void sorgu.refetch(); } };
}

export function useKapaliSayfalarDegistir() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (govde: KapaliSayfalarGovdesi) => api.post<KapaliSayfalarCevabi>('/kapali-sayfalar/degistir', govde),
    onSuccess: (cevap) => { istemci.setQueryData(anahtarlar.kapaliSayfalar, cevap); },
  });
}
