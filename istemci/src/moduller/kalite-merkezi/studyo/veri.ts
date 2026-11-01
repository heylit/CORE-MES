import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type {
  KmBalon, KmBalonlarGovdesi, KmBalonYeriGovdesi, KmMerkezBelgeleriCevabi, KmMerkezBelgesi, KmNumunelerCevabi, KmOlcumGovdesi, KmOlcumlerCevabi, KmResim, KmResimEkleGovdesi,
  KmStudyoParcaCevabi,
} from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import type {
  KmCmmOnizlemeCevabi, KmCmmOnizleGovdesi, KmCmmPlaniCevabi, KmCmmYazCevabi, KmCmmYazGovdesi,
} from '#paylasilan/sozlesme/kalite-merkezi-cmm.ts';
import { api, ApiHatasi, OTURUM_BITTI } from '../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../../ortak/veri/istek-kimligi.ts';

// Stüdyonun verisi Kalite Merkezi uçlarındandır (595 1 b, 597 a, 600 a): parçanın resimleri ve balonları, numune planı, numuneler ve ölçümler.
export const studyoAnahtari = {
  parca: (malzemeNo: number) => ['kalite-merkezi', 'studyo', 'parca', malzemeNo] as const,
  emirOlcumleri: (emirId: number) => ['kalite-merkezi', 'studyo', 'emir-olcumleri', emirId] as const,
  emirNumuneleri: (emirId: number) => ['kalite-merkezi', 'studyo', 'emir-numuneleri', emirId] as const,
  acikNumuneler: ['kalite-merkezi', 'studyo', 'numuneler'] as const,
  merkezBelgeleri: (ara: string, malzemeNo: number | null) => ['kalite-merkezi', 'studyo', 'merkez-belgeleri', ara, malzemeNo] as const,
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
// Dosya adı (uzantısıyla) cevabın başlığındadır: ortak görüntüleyici IGES ve STL'i uzantıdan tanır; resmin adı belge adıdır.
export interface ResimDosyasi { bayt: Uint8Array; ad: string | null }
export function basliktakiAd(baslik: string | null): string | null {
  const kodlu = baslik === null ? null : /filename\*=UTF-8''([^;]+)/i.exec(baslik)?.[1];
  if (kodlu) { try { return decodeURIComponent(kodlu); } catch { /* bozuk kodlama: düz ada bakılır */ } }
  return (baslik === null ? null : /filename="([^"]+)"/i.exec(baslik)?.[1]) ?? null;
}

export async function resimDosyasiOku(resimId: number, sinyal?: AbortSignal): Promise<ResimDosyasi> {
  const cevap = await fetch(`/api/kalite-merkezi/studyo/resimler/${String(resimId)}/dosya`, { credentials: 'include', ...(sinyal ? { signal: sinyal } : {}) });
  if (!cevap.ok) {
    if (cevap.status === 401) window.dispatchEvent(new CustomEvent(OTURUM_BITTI));
    let govde: unknown = null;
    try { govde = await cevap.json(); } catch { /* gövdesiz cevap */ }
    const hataMi = govde !== null && typeof govde === 'object' && 'kod' in govde && 'mesaj' in govde && typeof govde.mesaj === 'string';
    throw new ApiHatasi(cevap.status, hataMi ? govde as HataGovdesi : null);
  }
  return { bayt: new Uint8Array(await cevap.arrayBuffer()), ad: basliktakiAd(cevap.headers.get('content-disposition')) };
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

// Kontrol planı resim başına bütün yazılır (603 a); resmin sürümü başkasının aynı anda yaptığı değişikliği ezmemek içindir. Cevaptaki resim
// parçanın önbelleğine konur: yeni sürüm sonraki yazımın sürümüdür.
export function useBalonPlaniYaz(malzemeNo: number | null) {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: ({ resim, balonlar }: { resim: KmResim; balonlar: KmBalonlarGovdesi['balonlar'] }) => tekrarKorumaliGonder((d) => api.post<{ resim: KmResim }>(
      `/kalite-merkezi/studyo/resimler/${String(resim.id)}/balonlar`, { surum: resim.surum, balonlar } satisfies KmBalonlarGovdesi,
      { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) },
    )),
    onSuccess: ({ resim }) => {
      if (malzemeNo === null) return;
      istemci.setQueryData<KmStudyoParcaCevabi>(studyoAnahtari.parca(malzemeNo), (o) => o && { ...o, resimler: o.resimler.map((r) => (r.id === resim.id ? resim : r)) });
    },
    onError: () => { if (malzemeNo !== null) void istemci.invalidateQueries({ queryKey: studyoAnahtari.parca(malzemeNo) }); },
  });
}

// Balon yeri (913 a) plan sürümünü değiştirmez; balonun kendi sürümüyle yazılır, cevaptaki balon parçanın önbelleğindeki resme konur.
export function useBalonYeriYaz(malzemeNo: number | null) {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: ({ balon, yer, yerKipi }: { balon: KmBalon } & Omit<KmBalonYeriGovdesi, 'surum'>) => tekrarKorumaliGonder((d) => api.post<{ balon: KmBalon }>(
      `/kalite-merkezi/studyo/balonlar/${String(balon.id)}/yer`, { surum: balon.surum, yer, yerKipi } satisfies KmBalonYeriGovdesi,
      { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) },
    )),
    onSuccess: ({ balon }) => {
      if (malzemeNo === null) return;
      istemci.setQueryData<KmStudyoParcaCevabi>(studyoAnahtari.parca(malzemeNo), (o) => o && {
        ...o, resimler: o.resimler.map((r) => (r.balonlar.some((b) => b.id === balon.id) ? { ...r, balonlar: r.balonlar.map((b) => (b.id === balon.id ? balon : b)) } : r)),
      });
    },
    onError: () => { if (malzemeNo !== null) void istemci.invalidateQueries({ queryKey: studyoAnahtari.parca(malzemeNo) }); },
  });
}

// Parça verilirse kartına Çizim Merkezi'nde bağlı belgeler başta gelir (1306).
export function useMerkezBelgeleri(ara: string, acik: boolean, malzemeNo: number | null = null) {
  const sorgu = new URLSearchParams();
  if (ara) sorgu.set('ara', ara);
  if (malzemeNo !== null) sorgu.set('malzemeNo', String(malzemeNo));
  const ek = sorgu.toString();
  return useQuery({
    queryKey: studyoAnahtari.merkezBelgeleri(ara, malzemeNo),
    queryFn: () => api.get<KmMerkezBelgeleriCevabi>(`/kalite-merkezi/studyo/merkez-belgeleri${ek ? `?${ek}` : ''}`),
    enabled: acik,
    staleTime: 15_000,
  });
}

const parcayaKoy = (istemci: ReturnType<typeof useQueryClient>, resim: KmResim) => {
  istemci.setQueryData<KmStudyoParcaCevabi>(studyoAnahtari.parca(resim.malzemeNo), (o) => o && {
    ...o, resimler: o.resimler.some((r) => r.id === resim.id) ? o.resimler.map((r) => (r.id === resim.id ? resim : r)) : [...o.resimler, resim],
  });
};

// Belge merkezindeki yayındaki revizyon parçaya alınır (603 a); revizyon harfi belgenin yayındaki harfidir.
export function useResimAl() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: ({ malzemeNo, belge }: { malzemeNo: number; belge: KmMerkezBelgesi }) => tekrarKorumaliGonder((d) => api.post<{ resim: KmResim }>(
      '/kalite-merkezi/studyo/resimler/al', { malzemeNo, merkezBelgeId: belge.id, revizyon: belge.harf || null } satisfies KmResimEkleGovdesi,
      { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) },
    )),
    onSuccess: ({ resim }) => { parcayaKoy(istemci, resim); },
  });
}

// Kaldırılan resim pasif kalır (balon ve ölçümleri silinmez); sürüm başkasının değişikliğini ezmemek içindir.
export function useResimKaldir() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (resim: KmResim) => tekrarKorumaliGonder((d) => api.post<{ resim: KmResim }>(
      `/kalite-merkezi/studyo/resimler/${String(resim.id)}/kaldir`, { surum: resim.surum },
      { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) },
    )),
    onSuccess: ({ resim }) => { parcayaKoy(istemci, resim); },
    onError: (_h, resim) => istemci.invalidateQueries({ queryKey: studyoAnahtari.parca(resim.malzemeNo) }),
  });
}

// CMM sonuç dönüşü (1439 a): önizleme yazmaz; yazma tekrar korumalıdır ve emrin ölçümlerini yeniler.
export function useCmmOnizle() {
  return useMutation({ mutationFn: (govde: KmCmmOnizleGovdesi) => api.post<KmCmmOnizlemeCevabi>('/kalite-merkezi/studyo/olcumler/cmm-onizle', govde) });
}

export function useCmmYaz() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (govde: KmCmmYazGovdesi) => tekrarKorumaliGonder((d) => api.post<KmCmmYazCevabi>(
      '/kalite-merkezi/studyo/olcumler/cmm-yaz', govde,
      { istekKimligi: d.istekKimligi, zamanAsimiMs: d.zamanAsimiMs, ...(d.sinyal ? { sinyal: d.sinyal } : {}) },
    )),
    onSettled: (_c, _h, govde) => istemci.invalidateQueries({ queryKey: studyoAnahtari.emirOlcumleri(govde.uretimEmriId) }),
  });
}

export function useCmmPlani(resimId: number | null, acik: boolean) {
  return useQuery({
    queryKey: ['kalite-merkezi', 'studyo', 'cmm-plani', resimId] as const,
    queryFn: () => api.get<KmCmmPlaniCevabi>(`/kalite-merkezi/studyo/resimler/${String(resimId)}/cmm-plani`),
    enabled: acik && resimId !== null,
  });
}
