import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BelgeCevabi, BenCevabi, EkCevabi, EkIcerikCevabi, KisilerCevabi, SorguCevabi,
} from '#paylasilan/sozlesme/portal.ts';
import { useBildirim } from '../../../ortak/arayuz/index.ts';
import { api, ApiHatasi, hataIletisi } from '../../../ortak/veri/api.ts';
import type { PortalIzinleri } from './izinler.ts';
import type { Onaylayan } from './kurallar.ts';
import { bosDepo, type Depo, type DepoKaydi, type KoleksiyonAdi, type Koleksiyonlar, type PortalKullanicisi } from './tipler.ts';

// Yeni ekran bugünkü belge deposunu aynı uçlarla okur ve yazar (soru 204 a: veri yerinde kalır, şema değişmez). Köprü ve
// window.claude yoktur. Kural ve yetki sunucudadır; bu katman yalnız taşır.

// Sunucu sınırıyla aynı (paylasilan/sozlesme/portal.ts AZAMI_SINIR); istemci sözleşmeyi değer olarak ithal etmez.
export const AZAMI_SINIR = 1000;
// Çerçevedeki köprüyle aynı yoklama aralığı: değişiklik damgası değişince okunan koleksiyonlar yenilenir.
export const YOKLAMA_MS = 10_000;
export const CATISMA_ILETISI = 'Bu kayıt başka bir kişi tarafından değiştirildi; sayfayı yenileyin.';

const KOK = ['portal', 'yeni'] as const;
export const portalAnahtarlari = {
  hepsi: KOK,
  acilis: [...KOK, 'acilis'] as const,
  damga: [...KOK, 'damga'] as const,
  koleksiyonlar: [...KOK, 'koleksiyon'] as const,
  koleksiyon: (ad: KoleksiyonAdi) => [...KOK, 'koleksiyon', ad] as const,
  kisiler: [...KOK, 'kisiler'] as const,
  ek: (id: string) => [...KOK, 'ek', id] as const,
};

// Kimlik, gerekirse boş depoda başlangıç kurulumu (yönetici) ve kişinin portal kullanıcısı: çerçevenin açılışıyla aynı sıra.
export async function acilisYap(): Promise<BenCevabi> {
  let ben = await api.get<BenCevabi>('/portal/ben');
  if (ben.kurulumGerekli && ben.yonetici) {
    await api.post('/portal/kurulum');
    ben = await api.get<BenCevabi>('/portal/ben');
  }
  // Her açılışta: kullanıcı yoksa kurulur, varsa rolü TMI rolüne göre güncellenir.
  await api.post('/portal/ben/hazirla');
  return ben;
}

export function usePortalAcilis(etkin: boolean) {
  return useQuery({ queryKey: portalAnahtarlari.acilis, queryFn: acilisYap, enabled: etkin, staleTime: Number.POSITIVE_INFINITY, retry: false });
}

// Belge gövdesi prototipin biçimidir; kimlik ve sürüm depo alanlarından eklenir.
export function kayit<T extends DepoKaydi>(b: SorguCevabi['belgeler'][number]): T {
  return { ...b.veri, id: b.kimlik, surum: b.surum } as T;
}

export async function koleksiyonOku<K extends KoleksiyonAdi>(ad: K): Promise<Record<string, Koleksiyonlar[K]>> {
  const p = new URLSearchParams({ koleksiyon: ad, sinir: String(AZAMI_SINIR) });
  const c = await api.get<SorguCevabi>(`/portal/sorgu?${p.toString()}`);
  return Object.fromEntries(c.belgeler.map((b) => [b.kimlik, kayit<Koleksiyonlar[K]>(b)]));
}

export interface PortalDeposu {
  depo: Depo;
  yukleniyor: boolean;
  hata: unknown;
  yenile: () => void;
}

// Görünüm yalnız kullandığı koleksiyonları ister; aynı koleksiyonu isteyen görünümler önbelleği paylaşır.
export function usePortalDeposu(adlar: readonly KoleksiyonAdi[], etkin = true): PortalDeposu {
  const istemci = useQueryClient();
  const sorgular = useQueries({
    queries: adlar.map((ad) => ({ queryKey: portalAnahtarlari.koleksiyon(ad), queryFn: () => koleksiyonOku(ad), enabled: etkin })),
  });
  const veriler = sorgular.map((s) => s.data);
  const depo = useMemo(() => {
    const d = bosDepo() as Record<KoleksiyonAdi, unknown>;
    adlar.forEach((ad, i) => { if (veriler[i] !== undefined) d[ad] = veriler[i]; });
    return d as Depo;
  }, [adlar.join(','), ...veriler]);
  return {
    depo,
    yukleniyor: sorgular.some((s) => s.isPending),
    hata: sorgular.find((s) => s.error)?.error ?? null,
    yenile: () => { void istemci.invalidateQueries({ queryKey: portalAnahtarlari.koleksiyonlar }); },
  };
}

// Değişiklik damgası yoklanır; başka kişi yazınca okunan koleksiyonlar yenilenir (çerçevedeki köprünün davranışı).
export function useDegisiklikIzle(etkin: boolean): void {
  const istemci = useQueryClient();
  const son = useRef<number | null>(null);
  const damga = useQuery({
    queryKey: portalAnahtarlari.damga,
    queryFn: () => api.get<{ damga: number }>('/portal/damga'),
    enabled: etkin,
    refetchInterval: YOKLAMA_MS,
    refetchIntervalInBackground: false,
  });
  const deger = damga.data?.damga;
  useEffect(() => {
    if (deger === undefined) return;
    if (son.current !== null && son.current !== deger) void istemci.invalidateQueries({ queryKey: portalAnahtarlari.koleksiyonlar });
    son.current = deger;
  }, [deger, istemci]);
}

export function usePortalKisileri(etkin = true) {
  return useQuery({ queryKey: portalAnahtarlari.kisiler, queryFn: () => api.get<KisilerCevabi>('/portal/kisiler'), enabled: etkin });
}

/* ---------- yazma ---------- */

export type YazmaKipi = 'tam' | 'birlestir';

export interface YazmaSecenegi {
  kip?: YazmaKipi;
  // Verilirse yazma yalnız belge bu sürümdeyse olur (null: belge hiç yoksa). Verilmezse son yazan kazanır.
  beklenenSurum?: number | null;
}

export function belgeYaz(yol: string, veri: Record<string, unknown>, s: YazmaSecenegi = {}): Promise<BelgeCevabi> {
  return api.post<BelgeCevabi>('/portal/belge/yaz', {
    yol, veri, kip: s.kip ?? 'tam', ...(s.beklenenSurum === undefined ? {} : { beklenenSurum: s.beklenenSurum }),
  });
}

// Kaydın tamamını yazar. Var olan kayıt okunduğu sürümle, yeni kayıt "yoksa" koşuluyla yazılır: araya giren değişiklik
// sessizce ezilmez (sunucu 409 döner). Kimlik ve sürüm gövdeye girmez (prototipin biçimi).
export function kaydet<K extends KoleksiyonAdi>(koleksiyon: K, k: Omit<Koleksiyonlar[K], 'surum'> & { surum?: number }): Promise<BelgeCevabi> {
  const { id, surum, ...govde } = k as unknown as { id: string; surum?: number } & Record<string, unknown>;
  return belgeYaz(`${koleksiyon}/${id}`, govde, { kip: 'tam', beklenenSurum: surum ?? null });
}

export function belgeSil(yol: string): Promise<{ silindi: boolean; damga: number }> {
  return api.post('/portal/belge/sil', { yol });
}

// Onay kararı yalnız bu uçtan: kişi, zaman ve adım rolü sunucuda yazılır (kart #1583).
export function onayKarari(kimlik: string, onay: boolean, not = ''): Promise<BelgeCevabi> {
  return api.post<BelgeCevabi>(`/portal/onaylar/${encodeURIComponent(kimlik)}/karar`, { onay, not });
}

export function ekYukle(ad: string, tur: string, veri: string): Promise<EkCevabi> {
  return api.post<EkCevabi>('/portal/ekler/yukle', { ad, tur, veri });
}

export function useEk(id: string | null) {
  return useQuery({
    queryKey: portalAnahtarlari.ek(id ?? ''),
    queryFn: () => api.get<EkIcerikCevabi>(`/portal/ekler/${id ?? ''}`),
    enabled: id !== null && /^[0-9a-f]{32}$/.test(id),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

// Belge numarası: önek-yıl-sıra. Okunan koleksiyonun en büyük sırasına bir eklenir (bugünkü prototip davranışı). Soru 206 a ile
// numara sunucuda üretilecek; görünümler yalnız bu işlevi çağırır, değişiklik burada kalır.
export function sonrakiNo(kayitlar: readonly { no?: string }[], onek: string, hane: number, simdi: number): string {
  const yil = new Date(simdi).getFullYear();
  let enBuyuk = 0;
  for (const x of kayitlar) {
    const no = String(x.no ?? '');
    if (!no.startsWith(onek)) continue;
    const m = /(\d+)$/.exec(no);
    if (m?.[1]) enBuyuk = Math.max(enBuyuk, Number(m[1]));
  }
  return `${onek}-${String(yil)}-${String(enBuyuk + 1).padStart(hane, '0')}`;
}

export async function belgeNoAl(koleksiyon: KoleksiyonAdi, onek: string, hane: number, simdi = Date.now()): Promise<string> {
  const guncel = await koleksiyonOku(koleksiyon);
  return sonrakiNo(Object.values(guncel) as { no?: string }[], onek, hane, simdi);
}

// Prototipin kimlik biçimi: önek + zaman + rastgele ek.
export function yeniKimlik(onek: string, simdi = Date.now()): string {
  return onek + simdi.toString(36) + Math.random().toString(36).slice(2, 6);
}

export function hataMetni(hata: unknown, ekranIletisi: string): string {
  if (hata instanceof ApiHatasi && hata.durum === 409) return CATISMA_ILETISI;
  return hataIletisi(hata, ekranIletisi);
}

// Görünümün komutu: iş bitince okunan koleksiyonlar yenilenir; hata bildirimle gösterilir.
export function usePortalKomutu<G>(is: (girdi: G) => Promise<unknown>, basari?: string) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  return useMutation({
    mutationFn: is,
    onSuccess: () => { if (basari) bildir('tamam', basari); },
    onError: (e) => { bildir('hata', hataMetni(e, 'Kaydedilemedi.')); },
    onSettled: () => { void istemci.invalidateQueries({ queryKey: portalAnahtarlari.koleksiyonlar }); },
  });
}

/* ---------- ekran bağlamı ---------- */

// Kabuğun her görünüme verdiği ortak bilgi: kişi, izinler, an ve gezinme. Görünüm parçaları yalnız bunu ve veri işlevlerini kullanır.
export interface PortalBaglami {
  ben: BenCevabi;
  // Kişinin portal kullanıcısı (`users/tmi-<kişi no>`); hazırlıktan sonra da okunamadıysa null.
  kullanici: PortalKullanicisi | null;
  kisiKimligi: string;
  izin: PortalIzinleri;
  onaylayan: Onaylayan;
  kurumAdi: string;
  simdi: number;
  // Görünüm adresi ve gezinme. ek: sorgu parametreleri (örn. sipariş türü `tur`).
  yol: (gorunum: string, id?: string | null, ek?: Readonly<Record<string, string>>) => string;
  git: (gorunum: string, id?: string | null, ek?: Readonly<Record<string, string>>) => void;
}

export const PortalBaglamiIcerigi = createContext<PortalBaglami | null>(null);

export function usePortal(): PortalBaglami {
  const b = useContext(PortalBaglamiIcerigi);
  if (b === null) throw new Error('usePortal yalnız PortalYeni içinde kullanılır.');
  return b;
}

export const kisiKimligi = (kisiId: number): string => `tmi-${String(kisiId)}`;
