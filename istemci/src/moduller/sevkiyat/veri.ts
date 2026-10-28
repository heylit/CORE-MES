// Modülün sunucu çağrıları. Yazma komutu dönen gün planını önbelleğe koyar; ekran yeniden sormaz.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AracCevabi, AracGovdesi, ElleKalemGovdesi, AracGuncelleGovdesi, AraclarCevabi, AramaCevabi, BekleyenBolCevabi, BekleyenBolGovdesi, BekleyenlerCevabi, DagitGovdesi, FirmaAramaCevabi, GunPlaniCevabi, HaritaCevabi, IsCevabi, IsDurumuGovdesi, IsGovdesi, IsGuncelleGovdesi,
  KaydetGovdesi, KalemCevabi, NoktaCevabi, NoktaGovdesi, NoktaGuncelleGovdesi, NoktalarCevabi, SerbestBirakCevabi, SerbestBirakGovdesi, Tasima, TekRotaCevabi,
  TrafikCevabi, TumIslerCevabi,
} from '#paylasilan/sozlesme/sevkiyat.ts';
import type { DepoCikisCevabi } from '#paylasilan/sozlesme/stok.ts';
import { api } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';

// Sunucuda tekrar korumalı komut (kayıt açan ve durum değiştiren uçlar): cevabı yitirilen gönderim aynı kimlikle yeniden
// denenir. Sonucu bilinmeden tükenen komutu kullanıcı elle yeniden gönderirse de aynı kimlik gider, yoksa ağ dönünce ikinci
// iş açılırdı. Kimlik başarıda ya da sunucunun kararıyla (4xx) bırakılır.
const sonucuBilinmeyenler = new Map<string, string>();
async function korumaliPost<T>(yol: string, govde?: unknown): Promise<T> {
  const anahtar = `${yol}\n${JSON.stringify(govde ?? null)}`;
  const istekKimligi = sonucuBilinmeyenler.get(anahtar) ?? yeniIstekKimligi();
  sonucuBilinmeyenler.set(anahtar, istekKimligi);
  try {
    const cevap = await tekrarKorumaliGonder((deneme) => api.post<T>(yol, govde, deneme), { istekKimligi });
    sonucuBilinmeyenler.delete(anahtar);
    return cevap;
  } catch (hata) {
    if (!yenidenDenenebilirMi(hata)) sonucuBilinmeyenler.delete(anahtar);
    throw hata;
  }
}

export const useGunPlani = (tarih: string) =>
  useQuery({ queryKey: anahtarlar.gunPlani(tarih), queryFn: () => api.get<GunPlaniCevabi>(`/sevkiyat/planlar/${tarih}`) });
const noktalariGetir = () => api.get<NoktalarCevabi>('/sevkiyat/noktalar');
export const useNoktalar = () =>
  useQuery({ queryKey: anahtarlar.noktalar, queryFn: noktalariGetir, select: (c) => c.noktalar });
// Fabrikanın konumu Sistem Ayarları'ndan mı geliyor (aynı istek, ayrı seçim).
export const useFabrikaAyardan = () =>
  useQuery({ queryKey: anahtarlar.noktalar, queryFn: noktalariGetir, select: (c) => c.fabrikaAyardan }).data ?? false;
export const useAraclar = () =>
  useQuery({ queryKey: anahtarlar.araclar, queryFn: () => api.get<AraclarCevabi>('/sevkiyat/araclar') });
// Harita verisi büyüktür ve oturum boyunca değişmez.
export const useHarita = () =>
  useQuery({ queryKey: anahtarlar.harita, queryFn: async () => (await api.get<HaritaCevabi>('/sevkiyat/harita')).harita, staleTime: Infinity, gcTime: Infinity });
export const useTrafik = (tarih: string, dakika: number, etkin: boolean) =>
  useQuery({
    queryKey: anahtarlar.trafik(tarih, dakika), enabled: etkin, staleTime: Infinity,
    queryFn: () => api.get<TrafikCevabi>(`/sevkiyat/trafik?tarih=${tarih}&dakika=${dakika}`),
  });
export const useTekRota = (sorgu: string | null) =>
  useQuery({
    queryKey: anahtarlar.tekRota(sorgu ?? ''), enabled: sorgu !== null, placeholderData: (onceki) => onceki,
    queryFn: () => api.get<TekRotaCevabi>(`/sevkiyat/tek-rota?${sorgu}`),
  });
export const useAdresArama = (metin: string) =>
  useQuery({
    queryKey: anahtarlar.arama(metin), enabled: metin.trim().length > 0, staleTime: 60_000,
    queryFn: () => api.get<AramaCevabi>(`/sevkiyat/arama?metin=${encodeURIComponent(metin.trim())}`),
  });

// Bağlanacak firma: müşteri ve tedarikçiler finanstan gelir; boş metin ilk firmaları getirir.
export const useFirmaArama = (metin: string, etkin: boolean) =>
  useQuery({
    queryKey: anahtarlar.firmalar(metin.trim()), enabled: etkin, staleTime: 30_000, placeholderData: (onceki) => onceki,
    queryFn: () => api.get<FirmaAramaCevabi>(`/sevkiyat/firmalar?metin=${encodeURIComponent(metin.trim())}`),
  });

export type PlanKomutu =
  | { tur: 'dagit' | 'yerlestir'; govde: DagitGovdesi }
  | { tur: 'kaydet'; govde: KaydetGovdesi }
  | { tur: 'onayla' | 'onayi-kaldir'; govde: { surum: number } };

export function usePlanKomutu(tarih: string) {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (komut: PlanKomutu) => (komut.tur === 'onayla' || komut.tur === 'onayi-kaldir' ? korumaliPost<GunPlaniCevabi> : api.post<GunPlaniCevabi>)(`/sevkiyat/planlar/${tarih}/${komut.tur}`, komut.govde),
    onSuccess: (plan) => istemci.setQueryData(anahtarlar.gunPlani(tarih), plan),
  });
}

export type IsKomutu =
  | { tur: 'ekle'; govde: IsGovdesi } | { tur: 'guncelle'; id: number; govde: IsGuncelleGovdesi } | { tur: 'iptal-et'; id: number }
  | { tur: 'durum'; id: number; govde: IsDurumuGovdesi }
  // Bekleme listesindeki kayıt işe çevrilir (kart #1310).
  | { tur: 'ise-cevir'; bekleyenId: number; govde: IsGovdesi };

// İş günler arasında yer değiştirebilir (havuz, yapılamayıp dönen iş): bütün gün planları yenilenir.
export function useIsKomutu() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (komut: IsKomutu) =>
      komut.tur === 'ekle' ? korumaliPost<IsCevabi>('/sevkiyat/isler/ekle', komut.govde)
        : komut.tur === 'ise-cevir' ? korumaliPost<IsCevabi>(`/sevkiyat/bekleyenler/${komut.bekleyenId}/ise-cevir`, komut.govde)
          : komut.tur === 'iptal-et' ? korumaliPost<IsCevabi>(`/sevkiyat/isler/${komut.id}/iptal-et`)
            : komut.tur === 'durum' ? korumaliPost<IsCevabi>(`/sevkiyat/isler/${komut.id}/durum`, komut.govde)
              : api.post<IsCevabi>(`/sevkiyat/isler/${komut.id}/guncelle`, komut.govde),
    onSuccess: (_c, komut) => {
      void istemci.invalidateQueries({ queryKey: ['sevkiyat', 'plan'] });
      if (komut.tur === 'durum') void istemci.invalidateQueries({ queryKey: ['sevkiyat', 'urun-sevkleri'] });
      if (komut.tur === 'ise-cevir') void istemci.invalidateQueries({ queryKey: anahtarlar.bekleyenler });
    },
  });
}

// Bekleme listesi (kart #1310): biten ürün, noktası olmayan fason gönderimi ve alınacak malzeme; işe çevrilene kadar burada durur.
export const useBekleyenler = () =>
  useQuery({ queryKey: anahtarlar.bekleyenler, queryFn: () => api.get<BekleyenlerCevabi>('/sevkiyat/bekleyenler'), select: (c) => c.bekleyenler });
export function useBekleyenKaldir() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => korumaliPost<{ id: number }>(`/sevkiyat/bekleyenler/${id}/kaldir`),
    onSuccess: () => { void istemci.invalidateQueries({ queryKey: anahtarlar.bekleyenler }); },
  });
}

// Kısmi sevk (261 a): ürün kaydından verilen adet ayrı kayda bölünür.
export function useBekleyenBol() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: ({ id, govde }: { id: number; govde: BekleyenBolGovdesi }) => korumaliPost<BekleyenBolCevabi>(`/sevkiyat/bekleyenler/${id}/bol`, govde),
    onSuccess: () => { void istemci.invalidateQueries({ queryKey: anahtarlar.bekleyenler }); },
  });
}

// Tüm işler (960): aday ve kalemler; açık kalem aralıktan bağımsız gelir, aralık bitenleri ve adayları süzer.
export const useTumIsler = (baslangic: string, bitis: string) =>
  useQuery({
    queryKey: anahtarlar.tumIsler(baslangic, bitis), placeholderData: (onceki) => onceki,
    queryFn: () => api.get<TumIslerCevabi>(`/sevkiyat/tum-isler?baslangic=${baslangic}&bitis=${bitis}`), select: (c) => c.satirlar,
  });

export type KalemKomutu =
  | { tur: 'serbest-birak'; govde: SerbestBirakGovdesi }
  | { tur: 'elle'; govde: ElleKalemGovdesi }
  | { tur: 'tasima'; kalemId: number; tasima: Tasima }
  | { tur: 'tetikle' | 'tetigi-geri-al'; isId: number };

// Kalem bekleme listesine, işe ve depoya dokunur: tüm işler, bekleme listesi ve gün planları yenilenir.
export function useKalemKomutu() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (komut: KalemKomutu): Promise<SerbestBirakCevabi | KalemCevabi | TumIslerCevabi> =>
      komut.tur === 'serbest-birak' ? korumaliPost<SerbestBirakCevabi>('/sevkiyat/tum-isler/serbest-birak', komut.govde)
        : komut.tur === 'elle' ? korumaliPost<SerbestBirakCevabi>('/sevkiyat/tum-isler/elle', komut.govde)
        : komut.tur === 'tasima' ? api.post<KalemCevabi>(`/sevkiyat/kalemler/${komut.kalemId}/tasima`, { tasima: komut.tasima })
          : korumaliPost<TumIslerCevabi>(`/sevkiyat/isler/${komut.isId}/${komut.tur}`),
    onSuccess: () => {
      for (const anahtar of [['sevkiyat', 'tum-isler'], anahtarlar.bekleyenler, ['sevkiyat', 'plan']]) void istemci.invalidateQueries({ queryKey: anahtar });
    },
  });
}

// Depo son çıkışı stok ucudur (960, 965 a); stok modülü sevkiyatı ithal ettiği için çağrı burada, döngü olmasın diye.
// Kabul stoktaki mal kabul ekranında kalemle açılır.
export const kabulYolu = (kalemId: number): string => `/stok/mal-kabul?sevkKalemi=${kalemId}`;
export function useDepoCikisi() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (kalemId: number) => korumaliPost<DepoCikisCevabi>(`/stok/depo-sevk/${kalemId}/cikis`, {}),
    onSuccess: () => {
      for (const anahtar of [['sevkiyat', 'tum-isler'], ['stok']]) void istemci.invalidateQueries({ queryKey: anahtar });
    },
  });
}

export function useNoktaKomutu() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (komut: { tur: 'ekle'; govde: NoktaGovdesi } | { tur: 'guncelle'; id: number; govde: NoktaGuncelleGovdesi } | { tur: 'pasiflestir'; id: number }) =>
      komut.tur === 'ekle' ? korumaliPost<NoktaCevabi>('/sevkiyat/noktalar/ekle', komut.govde)
        : komut.tur === 'guncelle' ? api.post<NoktaCevabi>(`/sevkiyat/noktalar/${komut.id}/guncelle`, komut.govde)
          : api.post<NoktaCevabi>(`/sevkiyat/noktalar/${komut.id}/pasiflestir`),
    onSuccess: () => { tanimDegisti(istemci); },
  });
}

export function useAracKomutu() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (komut: { tur: 'ekle'; govde: AracGovdesi } | { tur: 'guncelle'; id: number; govde: AracGuncelleGovdesi } | { tur: 'pasiflestir'; id: number }) =>
      komut.tur === 'ekle' ? korumaliPost<AracCevabi>('/sevkiyat/araclar/ekle', komut.govde)
        : komut.tur === 'guncelle' ? api.post<AracCevabi>(`/sevkiyat/araclar/${komut.id}/guncelle`, komut.govde)
          : api.post<AracCevabi>(`/sevkiyat/araclar/${komut.id}/pasiflestir`),
    onSuccess: () => { tanimDegisti(istemci); },
  });
}

// Nokta ya da araç değişince bunlara dayanan sorgular yenilenir; harita verisi (büyük, değişmez) yenilenmez.
function tanimDegisti(istemci: ReturnType<typeof useQueryClient>) {
  for (const anahtar of [anahtarlar.noktalar, anahtarlar.araclar, ['sevkiyat', 'plan'], ['sevkiyat', 'tek-rota'], ['sevkiyat', 'arama'], ['sevkiyat', 'firmalar']]) {
    void istemci.invalidateQueries({ queryKey: anahtar });
  }
}

// Kullanıcının bu modüldeki işlemleri: düğme yetkisi yoksa gösterilmez (denetim sunucudadır).
export function useYetki() {
  const islemler: readonly string[] = useOturum().data?.islemler ?? [];
  const sahip = (islem: string) => islemler.includes(islem);
  return { tanimYaz: sahip('sevkiyat.tanim-yaz'), isYaz: sahip('sevkiyat.is-yaz'), planYaz: sahip('sevkiyat.plan-yaz'), onayla: sahip('sevkiyat.onayla'), sahip };
}
