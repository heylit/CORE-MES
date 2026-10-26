import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { KmNumunelerCevabi, KmOlcumGovdesi, KmOlcumlerCevabi, KmStudyoParcaCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { api, ApiHatasi, OTURUM_BITTI } from '../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../ortak/veri/istek-kimligi.ts';

// Stüdyonun verisi Kalite Merkezi uçlarındandır (595 1 b, 597 a, 600 a): parçanın resimleri ve balonları, numune planı, numuneler ve ölçümler.
export const studyoAnahtari = {
  parca: (malzemeNo: number) => ['kalite-merkezi', 'studyo', 'parca', malzemeNo] as const,
  emirOlcumleri: (emirId: number) => ['kalite-merkezi', 'studyo', 'emir-olcumleri', emirId] as const,
  emirNumuneleri: (emirId: number) => ['kalite-merkezi', 'studyo', 'emir-numuneleri', emirId] as const,
  acikNumuneler: ['kalite-merkezi', 'studyo', 'numuneler'] as const,
  resimDosyasi: (resimId: number, ozet: string) => ['kalite-merkezi', 'studyo', 'resim-dosyasi', resimId, ozet] as const,
};

export function useStudyoParcasi(malzemeNo: number | null) {
  return useQuery({
    queryKey: studyoAnahtari.parca(malzemeNo ?? 0),
    queryFn: () => api.get<KmStudyoParcaCevabi>(`/kalite-merkezi/studyo/parcalar/${String(malzemeNo)}`),
    enabled: malzemeNo !== null,
    staleTime: 30_000,
  });
}

export function useEmirOlcumleri(emirId: number | null) {
  return useQuery({
    queryKey: studyoAnahtari.emirOlcumleri(emirId ?? 0),
    queryFn: () => api.get<KmOlcumlerCevabi>(`/kalite-merkezi/studyo/emirler/${String(emirId)}/olcumler`),
    enabled: emirId !== null,
    staleTime: 15_000,
  });
}

export function useEmirNumuneleri(emirId: number | null) {
  return useQuery({
    queryKey: studyoAnahtari.emirNumuneleri(emirId ?? 0),
    queryFn: () => api.get<KmNumunelerCevabi>(`/kalite-merkezi/studyo/emirler/${String(emirId)}/numuneler`),
    enabled: emirId !== null,
    staleTime: 15_000,
  });
}

export function useAcikNumuneler() {
  return useQuery({ queryKey: studyoAnahtari.acikNumuneler, queryFn: () => api.get<KmNumunelerCevabi>('/kalite-merkezi/studyo/numuneler'), staleTime: 15_000 });
}

// İkili cevap `api` ile okunmaz (JSON bekler); aynı köken, çerezli oturum ve aynı hata biçimi burada kurulur.
export async function resimDosyasiOku(resimId: number, sinyal?: AbortSignal): Promise<Uint8Array> {
  const cevap = await fetch(`/api/kalite-merkezi/studyo/resimler/${String(resimId)}/dosya`, { credentials: 'include', ...(sinyal ? { signal: sinyal } : {}) });
  if (!cevap.ok) {
    if (cevap.status === 401) window.dispatchEvent(new CustomEvent(OTURUM_BITTI));
    let govde: unknown = null;
    try { govde = await cevap.json(); } catch { /* gövdesiz cevap */ }
    const hataMi = govde !== null && typeof govde === 'object' && 'kod' in govde && 'mesaj' in govde && typeof govde.mesaj === 'string';
    throw new ApiHatasi(cevap.status, hataMi ? govde as HataGovdesi : null);
  }
  return new Uint8Array(await cevap.arrayBuffer());
}

// Dosya özetiyle anahtarlanır: aynı revizyon bir kez indirilir, yeni revizyon yeni anahtardır.
export function useResimDosyasi(resim: { id: number; ozet: string } | null) {
  return useQuery({
    queryKey: studyoAnahtari.resimDosyasi(resim?.id ?? 0, resim?.ozet ?? ''),
    queryFn: ({ signal }) => resimDosyasiOku(resim?.id ?? 0, signal),
    enabled: resim !== null,
    staleTime: Infinity,
  });
}

// Ölçüm tekrar korumalıdır (603 a): cevabı kaybolan gönderim aynı kimlikle yinelenir, ikinci ölçüm yazılmaz.
export function useOlcumYaz() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (govde: KmOlcumGovdesi) => tekrarKorumaliGonder((d) => api.post<KmOlcumlerCevabi>(
      '/kalite-merkezi/studyo/olcumler/yaz', govde,
      { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) },
    )),
    onSettled: (_c, _h, govde) => istemci.invalidateQueries({ queryKey: studyoAnahtari.emirOlcumleri(govde.uretimEmriId) }),
  });
}
