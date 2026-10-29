import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdimSartnameleriGovdesi, KomutCevabi, TalimatTaslakKaydetGovdesi, TalimatTaslakKomutGovdesi, RevizyonSartnameleriCevabi, SartnameCevabi, SartnameEkleGovdesi, SartnameKopyalaGovdesi, SartnameKunyeGovdesi, SartnamelerCevabi, SartnameTaslakGovdesi, StandartCevabi,
  StandartEkleGovdesi, TalimatSablonEkleGovdesi, TalimatSablonKaydetGovdesi, TalimatSablonlariCevabi, TalimatSablonuCevabi,
  TalimatlarCevabi,
} from '#paylasilan/sozlesme/rota.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import { anahtarlar as rrAnahtarlari, type RrVerisi } from '../veri.ts';

// Şartname ve talimat sayfasının okuma ve yazmaları: rota modülünün uçları. Yetki ve sürüm denetimi uçtadır; ekran yalnız gizler.

const KOK = ['recete-rota', 'yeni', 'sartname-talimat'] as const;
export const anahtarlar = {
  sartnameler: [...KOK, 'sartnameler'] as const,
  sartname: (id: number) => [...KOK, 'sartname', id] as const,
  sablonlar: [...KOK, 'sablonlar'] as const,
  sablon: (id: number) => [...KOK, 'sablon', id] as const,
  revizyon: (id: number) => [...KOK, 'revizyon', id] as const,
  talimat: (urunId: number, opNo: number) => [...KOK, 'talimat', urunId, opNo] as const,
};

export const useSartnameler = () => useQuery({
  queryKey: anahtarlar.sartnameler,
  queryFn: () => api.get<SartnamelerCevabi>('/rota/sartnameler'),
});
export const useSartname = (id: number | null) => useQuery({
  queryKey: anahtarlar.sartname(id ?? 0),
  enabled: id !== null,
  queryFn: () => api.get<SartnameCevabi>(`/rota/sartnameler/${String(id)}`),
});
export const useSablonlar = () => useQuery({
  queryKey: anahtarlar.sablonlar,
  queryFn: () => api.get<TalimatSablonlariCevabi>('/rota/talimat-sablonlari'),
});
export const useSablon = (id: number | null) => useQuery({
  queryKey: anahtarlar.sablon(id ?? 0),
  enabled: id !== null,
  queryFn: () => api.get<TalimatSablonuCevabi>(`/rota/talimat-sablonlari/${String(id)}`),
});

// Ekleme ve kopyalama uçları tekrar korumalıdır (yinelenen istek ikinci kayıt açmaz); öteki komutlar sürümle korunur.
const kimlik = (ad: string) => (ad === 'ekle' || ad === 'kopyala' ? { istekKimligi: yeniIstekKimligi() } : {});

export type SartnameKomutu =
  | { ad: 'ekle'; govde: SartnameEkleGovdesi }
  | { ad: 'kopyala'; id: number; govde: SartnameKopyalaGovdesi }
  | { ad: 'kunye'; id: number; govde: SartnameKunyeGovdesi }
  | { ad: 'taslak-kaydet'; id: number; govde: SartnameTaslakGovdesi }
  | { ad: 'surum-ac' | 'taslak-sil' | 'yayinla' | 'pasife-al' | 'etkinlestir'; id: number; govde: { surum: number } };

// Cevap şartnamenin güncel hâlidir: ayrıntı önbelleğe yazılır, liste yeniden okunur (sayılar ve durum değişir).
export function useSartnameKomutu() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (k: SartnameKomutu) => api.post<SartnameCevabi>(
      k.ad === 'ekle' ? '/rota/sartnameler/ekle' : `/rota/sartnameler/${String(k.id)}/${k.ad}`, k.govde, kimlik(k.ad),
    ),
    onSuccess: (c) => {
      istemci.setQueryData(anahtarlar.sartname(c.sartname.id), c);
      void istemci.invalidateQueries({ queryKey: anahtarlar.sartnameler });
    },
  });
}

export function useStandartEkle() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (g: StandartEkleGovdesi) => api.post<StandartCevabi>('/rota/standartlar/ekle', g, kimlik('ekle')),
    onSuccess: () => { void istemci.invalidateQueries({ queryKey: anahtarlar.sartnameler }); },
  });
}

export type SablonKomutu =
  | { ad: 'ekle'; govde: TalimatSablonEkleGovdesi }
  | { ad: 'kaydet'; id: number; govde: TalimatSablonKaydetGovdesi }
  | { ad: 'durum'; id: number; govde: { surum: number; aktif: boolean } };

export function useSablonKomutu() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (k: SablonKomutu) => api.post<TalimatSablonuCevabi>(
      k.ad === 'ekle' ? '/rota/talimat-sablonlari/ekle' : `/rota/talimat-sablonlari/${String(k.id)}/${k.ad}`, k.govde, kimlik(k.ad),
    ),
    onSuccess: (c) => {
      istemci.setQueryData(anahtarlar.sablon(c.sablon.id), c);
      void istemci.invalidateQueries({ queryKey: anahtarlar.sablonlar });
    },
  });
}

/* ---------------- rota adımı: şartnameler ve adımlı talimat ---------------- */

export const useRevizyonSartnameleri = (id: number | null) => useQuery({
  queryKey: anahtarlar.revizyon(id ?? 0),
  enabled: id !== null,
  queryFn: () => api.get<RevizyonSartnameleriCevabi>(`/rota/revizyonlar/${String(id)}/sartnameler`),
});

// Yazım revizyonun sürümünü artırır. Rota düzenleyicisi sonraki kaydında sürümü ekrandaki durumdan okur; durum yeniden okunmayı
// beklemeden burada güncellenir, yoksa rotanın sıradaki kaydı "başka yerde değişti" diye reddedilir.
export function useAdimSartnameleriKaydet(revizyonId: number) {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (g: AdimSartnameleriGovdesi) => api.post<KomutCevabi>(`/rota/revizyonlar/${String(revizyonId)}/adim-sartnameleri`, g),
    onSuccess: (c) => {
      istemci.setQueryData<RrVerisi>(rrAnahtarlari.veri, (v) => (v?.durum.routeRevs ? {
        ...v, durum: { ...v.durum, routeRevs: v.durum.routeRevs.map((r) => (r.id === String(c.id) ? { ...r, surum: c.surum } : r)) },
      } : v));
      void istemci.invalidateQueries({ queryKey: anahtarlar.revizyon(revizyonId) });
      void istemci.invalidateQueries({ queryKey: anahtarlar.sartnameler });
    },
  });
}

export const useTalimatlar = (urunId: number, opNo: number | null) => useQuery({
  queryKey: anahtarlar.talimat(urunId, opNo ?? 0),
  enabled: opNo !== null,
  queryFn: () => api.get<TalimatlarCevabi>(`/rota/urunler/${String(urunId)}/talimatlar/${String(opNo)}`),
});

// Talimat taslağı ve yayını (1194 b): cevap OP'nin talimat listesidir (sürümler ve taslak), önbelleğe yazılır.
export type TalimatKomutu =
  | { ad: 'talimat-taslak-kaydet'; govde: TalimatTaslakKaydetGovdesi }
  | { ad: 'talimat-yayinla' | 'talimat-taslak-sil'; govde: TalimatTaslakKomutGovdesi };

export function useTalimatKomutu(urunId: number) {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (k: TalimatKomutu) => api.post<TalimatlarCevabi>(`/rota/urunler/${String(urunId)}/${k.ad}`, k.govde),
    onSuccess: (c, k) => { istemci.setQueryData(anahtarlar.talimat(urunId, k.govde.opNo), c); },
  });
}

