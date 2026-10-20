import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KurumLogosuCevabi, KurumLogosuGovdesi } from '#paylasilan/sozlesme/ayarlar.ts';
import { api } from './api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Giriş ekranının oturumsuz okuduğu logo kopyası (Sistem Ayarları'ndaki kurum logosundan yazılır); yoksa gövdesiz 204 döner.
export const GIRIS_LOGOSU_ADRESI = '/api/giris-logosu';

// Kabuk çizer, Sistem Ayarları değiştirir; ikisi aynı anahtarı okuduğundan yükleme kabuğa hemen yansır.
export function useKurumLogosu(acik = true) {
  return useQuery({
    queryKey: anahtarlar.kurumLogosu,
    queryFn: () => api.get<KurumLogosuCevabi>('/kurum-logosu'),
    enabled: acik,
    staleTime: Infinity,
  });
}

export function useKurumLogosuDegistir() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (govde: KurumLogosuGovdesi) => api.post<KurumLogosuCevabi>('/kurum-logosu/degistir', govde),
    onSuccess: (cevap) => { istemci.setQueryData(anahtarlar.kurumLogosu, cevap); },
  });
}
