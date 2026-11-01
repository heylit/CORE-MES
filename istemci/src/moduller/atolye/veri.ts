import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  AramaCevabi, FabrikaCevabi, FabrikaKayitCevabi, FabrikaKayitGovdesi, Kroki, KrokiCevabi, KrokiHizalaGovdesi, GozKalemi, GozKalemiGovdesi, GozKalemleriCevabi, GozlerCevabi, Model, ModelGovdesi, ModelParcaCevabi, ModelParcaYazCevabi, KalemGorunumleriCevabi, KalemGorunumuGovdesi, MerkezKrokileriCevabi, MerkezModeli, MerkezModeliBaglaCevabi, MerkezModeliBaglaGovdesi, MerkezModelleriCevabi, MalzemeModelleriCevabi, ModellerCevabi, YerlesmemisIstasyonlarCevabi, RotaCevabi,
  SalonlarCevabi, YerlesimCevabi,
} from '#paylasilan/sozlesme/atolye.ts';
import type { GozStoklariCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { SonOlaylarCevabi as ArkonSonOlaylarCevabi } from '#paylasilan/sozlesme/arkon.ts';
import type { MakineDurumlariCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { Emir, EmirlerCevabi, SonOlaylarCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { api, ApiHatasi, OTURUM_BITTI } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { emirlerIstasyonaGore } from './kurallar.ts';
import type { MakineArizasi } from './kurallar.ts';
import { base64Oku, base64Yaz, parcala, sha256 } from './model-dosyasi.ts';

// Canlı iletim (sunucudan itme) depoda yok: durum bu aralıkla yeniden sorulur.
export const CANLI_ARALIK_MS = 15_000;

export function useSalonlar() {
  return useQuery({ queryKey: anahtarlar.salonlar, queryFn: () => api.get<SalonlarCevabi>('/atolye/salonlar') });
}

export function useYerlesim(salonId: number | null) {
  return useQuery({
    queryKey: anahtarlar.yerlesim(salonId ?? 0),
    queryFn: () => api.get<YerlesimCevabi>(`/atolye/salonlar/${salonId ?? 0}`),
    enabled: salonId !== null,
  });
}

// Bütün bölümler fabrika planındaki yerleriyle (fabrika görünümü ve toplu düzenleme).
export function useFabrika(acik = true) {
  return useQuery({ queryKey: anahtarlar.fabrika, queryFn: () => api.get<FabrikaCevabi>('/atolye/fabrika'), enabled: acik });
}

export function fabrikaKaydet(govde: FabrikaKayitGovdesi): Promise<FabrikaKayitCevabi> {
  return api.post<FabrikaKayitCevabi>('/atolye/fabrika/kaydet', govde);
}

// İstasyonun canlı durumu üretim emirleri modülünün okuma ucundan gelir (başlamış emirler ve canlı sayaçları).
export function useCanliDurum(): { emirler: ReadonlyMap<number, Emir>; liste: readonly Emir[]; hata: boolean; guncellendi: number } {
  const sorgu = useQuery({
    queryKey: anahtarlar.canli,
    queryFn: () => api.get<EmirlerCevabi>('/uretim-emirleri?durum=basladi'),
    refetchInterval: CANLI_ARALIK_MS,
    refetchIntervalInBackground: false,
  });
  const liste = useMemo(() => sorgu.data?.emirler ?? [], [sorgu.data]);
  const emirler = useMemo(() => emirlerIstasyonaGore(liste), [liste]);
  return { emirler, liste, hata: sorgu.isError, guncellendi: sorgu.dataUpdatedAt };
}

// Yetkisiz (403) cevaptan sonra yeniden sorulmaz: yetki oturum boyunca değişmez. Öbür hatalarda yoklama sürer.
const yetkisizMi = (hata: unknown): boolean => hata instanceof ApiHatasi && hata.durum === 403;
const yoklama = (q: { state: { error: unknown } }): number | false => (yetkisizMi(q.state.error) ? false : CANLI_ARALIK_MS);

// Arıza ve bakım istasyonlar modülünün okuma ucundan (makine kimliği -> durum). Uç istasyonlar sayfası ya da yazma yetkisi
// ister; yetkisi olmayan haritayı arızasız görür (`okundu` false).
export function useMakineArizalari(): { arizalar: ReadonlyMap<number, MakineArizasi>; okundu: boolean } {
  const sorgu = useQuery({
    queryKey: anahtarlar.makineArizalari,
    queryFn: () => api.get<MakineDurumlariCevabi>('/makine-durumlari'),
    retry: (sayi, hata) => !yetkisizMi(hata) && sayi < 2,
    refetchInterval: yoklama,
    refetchIntervalInBackground: false,
  });
  const arizalar = useMemo(() => new Map((sorgu.data?.durumlar ?? []).flatMap((d) => (
    d.durum === 'calisir' ? [] : [[d.makineId, { durum: d.durum, aciklama: d.aciklama }] as const]
  ))), [sorgu.data]);
  return { arizalar, okundu: sorgu.isSuccess };
}

// Son terminal olayları üretim emirleri modülünden (yeniden eskiye). Sayım yalnız buradan gelir.
export function useSonOlaylar() {
  return useQuery({
    queryKey: anahtarlar.sonOlaylar,
    queryFn: () => api.get<SonOlaylarCevabi>(`/uretim-emirleri/son-olaylar?sayi=${SON_OLAY_SAYISI}`),
    retry: (sayi, hata) => !yetkisizMi(hata) && sayi < 2,
    refetchInterval: yoklama,
    refetchIntervalInBackground: false,
  });
}

export const SON_OLAY_SAYISI = 50;

// Dijital ikizin zaman makinesi günü bu defterden geri kurar: sunucunun verdiği en çok olay (son olaylar ucunun üst sınırı).
export const IKIZ_OLAY_SAYISI = 200;

export function useIkizOlaylari(acik: boolean) {
  return useQuery({
    queryKey: anahtarlar.ikizOlaylari,
    queryFn: () => api.get<SonOlaylarCevabi>(`/uretim-emirleri/son-olaylar?sayi=${IKIZ_OLAY_SAYISI}`),
    enabled: acik,
    retry: (sayi, hata) => !yetkisizMi(hata) && sayi < 2,
    refetchInterval: yoklama,
    refetchIntervalInBackground: false,
  });
}

// Arkon'un emre yansımayan olayları (ölçüm, çağrı, emirsiz terminal olayı) Arkon'un okuma ucundan; uç kişinin iş merkezlerine göre süzer.
export function useArkonOlaylari() {
  return useQuery({
    queryKey: anahtarlar.arkonOlaylari,
    queryFn: () => api.get<ArkonSonOlaylarCevabi>(`/arkon/son-olaylar?sayi=${SON_OLAY_SAYISI}`),
    retry: (sayi, hata) => !yetkisizMi(hata) && sayi < 2,
    refetchInterval: yoklama,
    refetchIntervalInBackground: false,
  });
}

export function useArama(metin: string, salonId: number | null) {
  const temiz = metin.trim();
  return useQuery({
    queryKey: anahtarlar.arama(temiz, salonId),
    queryFn: () => api.get<AramaCevabi>(`/atolye/arama?metin=${encodeURIComponent(temiz)}${salonId === null ? '' : `&salonId=${salonId}`}`),
    enabled: temiz.length > 0,
    placeholderData: keepPreviousData,
  });
}

// Bölme verilirse yalnız o bölmenin gözleri (en çok 10 kat x 9 göz: tek sayfa).
export function useGozler(rafId: number | null, sayfa: number, bolme: number | null = null) {
  return useQuery({
    queryKey: anahtarlar.gozler(rafId ?? 0, sayfa, bolme),
    queryFn: () => api.get<GozlerCevabi>(`/atolye/raflar/${rafId ?? 0}/gozler?sayfa=${sayfa}${bolme === null ? '' : `&bolme=${bolme}`}`),
    enabled: rafId !== null,
    placeholderData: keepPreviousData,
  });
}

// Gözdeki stok stok modülünün okuma ucundan (sunucuda atölye stoku ithal edemez: stok atölyeye bağlı). Stoksuz göz
// cevapta yoktur: null. Yetki yoksa istek atılmaz.
export function useGozStogu(gozId: number | null, acik: boolean) {
  return useQuery({
    queryKey: anahtarlar.gozStogu(gozId ?? 0),
    queryFn: async () => (await api.get<GozStoklariCevabi>(`/stok/goz-stoklari?gozIdler=${gozId ?? 0}`)).gozler.find((g) => g.gozId === gozId) ?? null,
    enabled: acik && gozId !== null,
  });
}

export interface RotaIstegi {
  bas: { x: number; z: number } | null;
  hedef: { x: number; z: number };
}

export function rotaGetir(salonId: number, istek: RotaIstegi): Promise<RotaCevabi> {
  const p = new URLSearchParams({ hedefX: String(istek.hedef.x), hedefZ: String(istek.hedef.z) });
  if (istek.bas) {
    p.set('basX', String(istek.bas.x));
    p.set('basZ', String(istek.bas.z));
  }
  return api.get<RotaCevabi>(`/atolye/salonlar/${salonId}/rota?${p.toString()}`);
}

// ---------- 3B model ----------

export function useModeller(acik = true) {
  return useQuery({ queryKey: anahtarlar.modeller, queryFn: () => api.get<ModellerCevabi>('/atolye/modeller'), enabled: acik });
}

// Göz kalemleri: hangi kalem hangi gözde ve gözün yüzde kaçını dolduruyor (atölyenin kaydı; adet stok modülünündür).
export function useGozKalemleri(salonId: number | null) {
  return useQuery({
    queryKey: anahtarlar.gozKalemleri(salonId),
    queryFn: () => api.get<GozKalemleriCevabi>(`/atolye/goz-kalemleri${salonId === null ? '' : `?salonId=${salonId}`}`),
  });
}

export function gozKalemiYaz(govde: GozKalemiGovdesi): Promise<GozKalemi> {
  return api.post<GozKalemi>('/atolye/goz-kalemleri/yaz', govde);
}

export function gozKalemiSil(id: number): Promise<void> {
  return api.post<undefined>('/atolye/goz-kalemleri/sil', { id });
}

// Haritanın emirleri: açık emirler ve son BITEN_GUN günde kapananlar (karar 1613 a). Parçanın hangi makinede
// üretildiği, ikizin bugünkü biten sayısı ve geçmiş anları buradan çıkar; daha eskisi haritada yoktur. İkisinden biri
// okunamazsa liste yoktur (eksik listeyle sayı uydurulmaz).
export const BITEN_GUN = 7;

// İki liste ayrıktır (açık / kapalı); iki istek arasında kapanan emir ikisinde de gelirse kapalı hali kalır. En yeni üstte.
export function emirleriBirlestir<T extends { id: number }>(acik: readonly T[], kapanan: readonly T[]): T[] {
  const kapali = new Set(kapanan.map((e) => e.id));
  return [...acik.filter((e) => !kapali.has(e.id)), ...kapanan].sort((a, b) => b.id - a.id);
}

export function useTumEmirler(acik = true) {
  return useQuery({
    queryKey: anahtarlar.tumEmirler,
    queryFn: async (): Promise<EmirlerCevabi> => {
      const [acikEmirler, kapananlar] = await Promise.all([
        api.get<EmirlerCevabi>('/uretim-emirleri'),
        api.get<EmirlerCevabi>(`/uretim-emirleri?bitenGun=${BITEN_GUN}`),
      ]);
      return { emirler: emirleriBirlestir(acikEmirler.emirler, kapananlar.emirler) };
    },
    enabled: acik,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

// Kalem görünümü: kod (parça no, malzeme kodu) -> model, ambalaj ve rafta gösterim. Makinede işlenen parçanın
// önizlemesi ve depoda rafın görünümü buradan.
export function useKalemGorunumleri() {
  return useQuery({ queryKey: anahtarlar.kalemGorunumleri, queryFn: () => api.get<KalemGorunumleriCevabi>('/atolye/kalem-gorunumleri') });
}

export function kalemGorunumuYaz(govde: KalemGorunumuGovdesi): Promise<KalemGorunumleriCevabi> {
  return api.post<KalemGorunumleriCevabi>('/atolye/kalem-gorunumleri/yaz', govde);
}

export function kalemGorunumuSil(kod: string): Promise<KalemGorunumleriCevabi> {
  return api.post<KalemGorunumleriCevabi>('/atolye/kalem-gorunumleri/sil', { kod });
}

// Tamamlanmış dosya (model, kroki) değişmez: bir kez indirilir, sayfa açık kaldıkça bellekte tutulur (cihaza yazılmaz).
const dosyaOnbellegi = new Map<string, Promise<Uint8Array>>();
const AYNI_ANDA = 4;

function parcaliIndir(anahtar: string, yol: (sira: number) => string, parcaSayisi: number, boyutBayt: number): Promise<Uint8Array> {
  const var_ = dosyaOnbellegi.get(anahtar);
  if (var_) return var_;
  const indir = (async () => {
    const parcalar: Uint8Array[] = new Array<Uint8Array>(parcaSayisi);
    let sira = 0;
    const isci = async () => {
      while (sira < parcaSayisi) {
        const i = sira++;
        parcalar[i] = base64Oku((await api.get<ModelParcaCevabi>(yol(i))).veri);
      }
    };
    await Promise.all(Array.from({ length: Math.min(AYNI_ANDA, parcaSayisi) }, isci));
    const dosya = new Uint8Array(boyutBayt);
    let o = 0;
    for (const p of parcalar) { dosya.set(p, o); o += p.length; }
    return dosya;
  })();
  dosyaOnbellegi.set(anahtar, indir);
  // Başarısız indirme önbellekte kalmaz: sonraki açılış yeniden dener.
  indir.catch(() => dosyaOnbellegi.delete(anahtar));
  return indir;
}

export function modelDosyasi(m: { id: number; parcaSayisi: number; boyutBayt: number }): Promise<Uint8Array> {
  return parcaliIndir(`model:${m.id}`, (i) => `/atolye/modeller/${m.id}/parcalar/${i}`, m.parcaSayisi, m.boyutBayt);
}

// Çizim Merkezi'ndeki istasyon modeli (kart #921): atölyenin ucundan tek parça iner, GLB değilse bu cihazda GLB'ye çevrilir
// (çevirici yalnız gerekince iner). Belge ve özetle önbellekte: yeni revizyon yeni anahtardır.
export function merkezModelDosyasi(istasyonId: number, m: MerkezModeli): Promise<Uint8Array> {
  return merkezDosyasi(`/api/atolye/istasyonlar/${istasyonId}/merkez-modeli`, m);
}

function merkezDosyasi(adres: string, m: MerkezModeli): Promise<Uint8Array> {
  const anahtar = `merkez:${m.belgeId}:${m.ozet}`;
  const var_ = dosyaOnbellegi.get(anahtar);
  if (var_) return var_;
  const indir = (async () => {
    const cevap = await fetch(adres, { credentials: 'include' });
    if (!cevap.ok) {
      if (cevap.status === 401) window.dispatchEvent(new CustomEvent(OTURUM_BITTI));
      throw new ApiHatasi(cevap.status, null);
    }
    const veri = new Uint8Array(await cevap.arrayBuffer());
    if (m.dosyaTuru === 'glb') return veri;
    const { dosyaCevir } = await import('./sahne/model-cevir.ts');
    return (await dosyaCevir(new Blob([veri]), m.dosyaTuru)).glb;
  })();
  dosyaOnbellegi.set(anahtar, indir);
  indir.catch(() => dosyaOnbellegi.delete(anahtar));
  return indir;
}

// Makinede işlenen parçanın Çizim Merkezi modeli (kart #1258): emrin malzemesine bağlı yayındaki belge. İndirme ve çevirme
// istasyon modeliyle aynıdır; önbellek anahtarı belge ve özettir.
export function malzemeModelDosyasi(malzemeNo: number, m: MerkezModeli): Promise<Uint8Array> {
  return merkezDosyasi(`/api/atolye/malzemeler/${malzemeNo}/merkez-modeli`, m);
}

// Açık emirlerin malzemelerine bağlı yayındaki 3B modeller (malzeme no -> model). Yetkisizde yeniden sorulmaz.
export function useMalzemeModelleri(): ReadonlyMap<number, MerkezModeli> {
  const sorgu = useQuery({
    queryKey: anahtarlar.malzemeModelleri,
    queryFn: () => api.get<MalzemeModelleriCevabi>('/atolye/malzeme-modelleri'),
    retry: (sayi, hata) => !yetkisizMi(hata) && sayi < 2,
    refetchInterval: (q) => (yetkisizMi(q.state.error) ? false : 60_000),
    refetchIntervalInBackground: false,
  });
  return useMemo(() => new Map((sorgu.data?.malzemeler ?? []).map((m) => [m.malzemeNo, m.merkezModeli] as const)), [sorgu.data]);
}

// ---------- kroki ----------

// Kroki kapsamı: bölüm kimliği ya da null (fabrika krokisi).
export type KrokiKapsami = number | null;
const krokiYolu = (kapsam: KrokiKapsami): string => (kapsam === null ? '/atolye/fabrika/kroki' : `/atolye/salonlar/${kapsam}/kroki`);

export function useKroki(kapsam: KrokiKapsami, acik = true) {
  return useQuery({
    queryKey: anahtarlar.kroki(kapsam),
    queryFn: () => api.get<KrokiCevabi>(krokiYolu(kapsam)),
    enabled: acik,
  });
}

export function krokiDosyasi(k: Pick<Kroki, 'salonId' | 'ozet' | 'parcaSayisi' | 'boyutBayt'>): Promise<Uint8Array> {
  return parcaliIndir(`kroki:${k.salonId ?? 'fabrika'}:${k.ozet}`, (i) => `${krokiYolu(k.salonId)}/parcalar/${i}`, k.parcaSayisi, k.boyutBayt);
}

// Yükleme: başlat (eski kroki yerini bırakır), parçaları yaz, tamamla. Yarıda kalırsa yarım kroki silinir.
export async function krokiGonder(kapsam: KrokiKapsami, ad: string, sayfa: number, pdf: Uint8Array, ilerleme: (oran: number) => void): Promise<Kroki> {
  const yol = krokiYolu(kapsam);
  await api.post<Kroki>(yol, { ad, boyutBayt: pdf.length, ozet: await sha256(pdf), sayfa });
  try {
    const parcalar = parcala(pdf);
    for (const [sira, p] of parcalar.entries()) {
      await api.post<ModelParcaYazCevabi>(`${yol}/parca-yaz`, { sira, veri: base64Yaz(p) });
      ilerleme((sira + 1) / (parcalar.length + 1));
    }
    const tamam = await api.post<Kroki>(`${yol}/tamamla`);
    ilerleme(1);
    return tamam;
  } catch (hata) {
    await api.post(`${yol}/sil`).catch(() => undefined);
    throw hata;
  }
}

export function krokiHizala(kapsam: KrokiKapsami, govde: KrokiHizalaGovdesi): Promise<Kroki> {
  return api.post<Kroki>(`${krokiYolu(kapsam)}/hizala`, govde);
}

export function krokiSil(kapsam: KrokiKapsami): Promise<void> {
  return api.post<undefined>(`${krokiYolu(kapsam)}/sil`);
}

// Bölüm krokisi Çizim Merkezi'nden: seçici yalnız açılınca sorar; seçilen belgenin PDF'i krokiye kopyalanır ve belge bölüme
// bağlanır. Merkezde yeni revizyon yayınlanınca aynı komut krokiyi tazeler.
export function useMerkezKrokileri(acik: boolean) {
  return useQuery({
    queryKey: anahtarlar.merkezKrokileri,
    queryFn: () => api.get<MerkezKrokileriCevabi>('/atolye/cizim-merkezi/krokiler'),
    enabled: acik,
  });
}

// "Yerleşmemiş makineler" süzgeci (kart #1296); `acik` false iken sorulmaz.
export function useYerlesmemisIstasyonlar(acik: boolean, fabrikaSurumu: number) {
  return useQuery({
    queryKey: anahtarlar.yerlesmemisIstasyonlar(fabrikaSurumu),
    queryFn: () => api.get<YerlesmemisIstasyonlarCevabi>('/atolye/yerlesmemis-istasyonlar'),
    enabled: acik,
  });
}

export function useMerkezModelleri() {
  return useQuery({ queryKey: anahtarlar.merkezModelleri, queryFn: () => api.get<MerkezModelleriCevabi>('/atolye/cizim-merkezi/modeller') });
}

export function merkezModeliBagla(istasyonId: number, belgeId: number | null, beklenen: number | null): Promise<MerkezModeliBaglaCevabi> {
  return api.post<MerkezModeliBaglaCevabi>(`/atolye/istasyonlar/${istasyonId}/merkez-modeli-bagla`, { belgeId, beklenen } satisfies MerkezModeliBaglaGovdesi);
}

export function krokiMerkezden(salonId: number, belgeId: number): Promise<Kroki> {
  return api.post<Kroki>(`/atolye/salonlar/${salonId}/kroki/merkezden`, { belgeId });
}

// Yükleme: başlat, parçaları sırayla yaz, tamamla. Yarıda kalırsa yarım kayıt silinir (sonra yeniden yüklenir).
export async function modelGonder(govde: ModelGovdesi, glb: Uint8Array, ilerleme: (oran: number) => void): Promise<Model> {
  const m = await api.post<Model>('/atolye/modeller', govde);
  try {
    const parcalar = parcala(glb);
    for (const [sira, p] of parcalar.entries()) {
      await api.post<ModelParcaYazCevabi>(`/atolye/modeller/${m.id}/parca-yaz`, { sira, veri: base64Yaz(p) });
      ilerleme((sira + 1) / (parcalar.length + 1));
    }
    const tamam = await api.post<Model>(`/atolye/modeller/${m.id}/tamamla`);
    ilerleme(1);
    return tamam;
  } catch (hata) {
    await api.post(`/atolye/modeller/${m.id}/sil`).catch(() => undefined);
    throw hata;
  }
}
