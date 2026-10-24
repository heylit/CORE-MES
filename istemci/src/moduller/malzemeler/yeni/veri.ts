import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FirmaSecenekleriCevabi, KatalogAyarlariCevabi, KatalogKartiKaydetCevabi, KatalogKartiRotasiCevabi, KatalogKartlariCevabi, KatalogSablonlariCevabi,
  KatalogSurumluKayitCevabi,
} from '#paylasilan/sozlesme/malzemeler.ts';
import type { SablonlarCevabi } from '#paylasilan/sozlesme/rota.ts';
import type { MalzemeKgFiyatlariCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import type { MalzemeKartBilgileriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { ApiHatasi, api, hataIletisi } from '../../../ortak/veri/api.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import {
  GENEL_VARSAYILAN, bosMalzemeAyari, kayitTamamla, type Firma, type GenelAyar, type KartKaydi, type KartOzeti, type KatalogKarti, type KatalogOrtami, type MalzemeAyari,
  type Nesne, type RotaSablonu, type Sablon,
} from './tipler.ts';

// Veri yalnız uçlardan gelir; köprü ve çerçeve yoktur. Kural sunucudadır, burada yalnız okuma, sürüm ve sıra tutulur.
export const MALZEMELER_YENI = ['malzemeler', 'yeni'] as const;
export const anahtar = {
  ortam: [...MALZEMELER_YENI, 'ortam'] as const,
  kartlar: (kisiId: number | null) => [...MALZEMELER_YENI, 'kartlar', kisiId] as const,
  kgFiyatlari: (nolar: string) => [...MALZEMELER_YENI, 'kg-fiyatlari', nolar] as const,
  kartRotasi: (kimlik: string) => [...MALZEMELER_YENI, 'kart-rotasi', kimlik] as const,
  sablonlar: [...MALZEMELER_YENI, 'sablonlar'] as const,
  rotaSablonlari: [...MALZEMELER_YENI, 'rota-sablonlari'] as const,
};

// Kimlik yolun tek parçasıdır; ".." bir üst yola çıkardı.
export function yolParcasi(kimlik: string): string {
  if (kimlik === '' || kimlik === '.' || kimlik === '..') throw new Error('Geçersiz kimlik.');
  return encodeURIComponent(kimlik);
}

export function ortamKur(a: KatalogAyarlariCevabi): KatalogOrtami {
  return {
    rol: a.rol,
    ayarYazabilir: a.ayarYazabilir,
    dortGoz: a.dortGoz,
    malzemeAyari: { ...bosMalzemeAyari(), ...((a.malzeme ?? {}) as Partial<MalzemeAyari>) },
    // Dört göz Sistem Ayarları'ndan gelir; ekranda değiştirilemez.
    genel: { ...GENEL_VARSAYILAN, ...((a.genel ?? {}) as Partial<GenelAyar>), dortGoz: a.dortGoz },
    operasyonTipleri: a.operasyonTipleri,
    surumler: a.surumler,
  };
}

export function useKatalogOrtami() {
  return useQuery({ queryKey: anahtar.ortam, queryFn: async () => ortamKur(await api.get<KatalogAyarlariCevabi>('/malzeme-katalogu-ayarlari')) });
}

type StokBilgisi = MalzemeKartBilgileriCevabi['satirlar'][number];

// DEP-60: sipariş noktası ve depo yeri stoktandır. Stok okunamazsa katalog yine açılır; kartlar kendi değerleriyle gelir.
async function stokBilgileri(): Promise<Map<string, StokBilgisi>> {
  const sonuc = new Map<string, StokBilgisi>();
  for (let sayfa = 1; sayfa <= 200; sayfa += 1) {
    const c = await api.get<MalzemeKartBilgileriCevabi>(`/stok/malzeme-kart-bilgileri?sayfa=${sayfa}&sayfaBoyu=500`);
    for (const x of c.satirlar) if (x.kartKimligi !== null) sonuc.set(x.kartKimligi, x);
    if (c.satirlar.length < c.sayfaBoyu || (c.toplam !== null && sayfa * c.sayfaBoyu >= c.toplam)) break;
  }
  return sonuc;
}

const sadeMiktar = (m: string): string => m.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');

// Stokta konum yoksa kartın eski depo yeri metni kalır; sipariş noktası yalnız stoktan gelir.
export function stokluKayit(kayit: KartKaydi, bilgi: StokBilgisi | undefined): KartKaydi {
  const g: Nesne = { ...kayit.g };
  delete g['siparisNoktasi'];
  if (bilgi?.kritikSeviye != null) g['siparisNoktasi'] = sadeMiktar(bilgi.kritikSeviye);
  if (bilgi?.varsayilanKonum != null) g['depoYeri'] = bilgi.varsayilanKonum;
  return { ...kayit, g };
}

export const KART_SAYFA_BOYU = 200;

// Oturum önbelleği (#1323): sayfa yeniden açılınca yalnız son okumadan sonra değişen kartlar istenir. Bellektedir.
let onbellek: { kisiId: number; an: string; kartlar: Map<string, KatalogKarti> } | null = null;
export function kartOnbelleginiBosalt(): void { onbellek = null; }

export async function butunKartlar(kisiId: number): Promise<KatalogKarti[]> {
  const eski = onbellek?.kisiId === kisiId ? onbellek : null;
  const kartlar = new Map(eski?.kartlar ?? []);
  const sonra = eski === null ? '' : `&${new URLSearchParams({ sonra: eski.an }).toString()}`;
  let an: string | null = null;
  for (let sayfa = 1; sayfa <= 10_000; sayfa += 1) {
    const c = await api.get<KatalogKartlariCevabi>(`/malzeme-katalogu-kartlari?sayfa=${sayfa}&sayfaBoyu=${KART_SAYFA_BOYU}${sonra}`);
    // İlk sayfanın anı en eskisidir: sayfalar arasında yazılan kart bir sonraki okumada yine gelir.
    an ??= c.an;
    for (const x of c.satirlar) {
      if (x.kayit === null) kartlar.delete(x.kimlik);
      else kartlar.set(x.kimlik, { kimlik: x.kimlik, no: x.no, surum: x.surum, kayit: kayitTamamla(x.kayit as Nesne) });
    }
    if (c.satirlar.length < c.sayfaBoyu || (c.toplam !== null && c.sayfa * c.sayfaBoyu >= c.toplam)) break;
  }
  if (an !== null) onbellek = { kisiId, an, kartlar };
  return [...kartlar.values()];
}

export async function kartlariOku(kisiId: number): Promise<KatalogKarti[]> {
  const [kartlar, stok] = await Promise.all([butunKartlar(kisiId), stokBilgileri().catch(() => null)]);
  return stok ? kartlar.map((k) => ({ ...k, kayit: stokluKayit(k.kayit, stok.get(k.kimlik)) })) : kartlar;
}

export function useKartlar() {
  const oturum = useOturum();
  const kisiId = oturum.data?.id ?? null;
  return useQuery({ queryKey: anahtar.kartlar(kisiId), enabled: kisiId !== null, queryFn: () => kartlariOku(kisiId ?? 0) });
}

// Kartın birim fiyatı satın almanın kg fiyatındandır; karta yazılmaz. Uç satın alma ya da maliyet okuma ister: yetkisi
// olmayan rolde hiç sorulmaz (195 a). Okunamazsa null; ekran satırı çizmez.
export type KgFiyati = Pick<MalzemeKgFiyatlariCevabi['malzemeler'][number], 'kgFiyati' | 'birimFiyati' | 'paraBirimi' | 'gecerlilik'>;
export const KG_FIYATI_ISLEMLERI = ['satin-alma.oku', 'satin-alma.yaz', 'finans.maliyet-oku'] as const;
const KG_FIYATI_PARCASI = 200;
const hammaddeMi = (k: KatalogKarti): boolean => !k.kayit.tur || k.kayit.tur === 'hammadde';

export async function kgFiyatlari(kartlar: readonly KatalogKarti[]): Promise<Map<string, KgFiyati> | null> {
  const kimlikler = new Map(kartlar.filter(hammaddeMi).map((k) => [k.no, k.kimlik]));
  const nolar = [...kimlikler.keys()];
  if (nolar.length === 0) return null;
  const sonuc = new Map<string, KgFiyati>();
  try {
    for (let i = 0; i < nolar.length; i += KG_FIYATI_PARCASI) {
      const c = await api.get<MalzemeKgFiyatlariCevabi>(`/satin-alma-kg-fiyatlari/malzemeler?nolar=${nolar.slice(i, i + KG_FIYATI_PARCASI).join(',')}`);
      for (const m of c.malzemeler) {
        const kimlik = kimlikler.get(m.malzemeNo);
        if (kimlik !== undefined) sonuc.set(kimlik, { kgFiyati: m.kgFiyati, birimFiyati: m.birimFiyati, paraBirimi: m.paraBirimi, gecerlilik: m.gecerlilik });
      }
    }
  } catch {
    return null;
  }
  return sonuc;
}

export function useKgFiyatlari(kartlar: readonly KatalogKarti[] | undefined, okur: boolean): Map<string, KgFiyati> | null {
  const nolar = (kartlar ?? []).filter(hammaddeMi).map((k) => k.no).sort((a, b) => a - b).join(',');
  const q = useQuery({ queryKey: anahtar.kgFiyatlari(nolar), enabled: okur && nolar !== '', queryFn: () => kgFiyatlari(kartlar ?? []) });
  return okur ? q.data ?? null : null;
}

// 233 a: rotası olan kartın Operasyonlar ve Reçete adımı salt okunur çizilir. Okunamazsa null: ekran düzenlemeyi açık bırakır, sunucu yine reddeder.
export function useKartRotasi(kimlik: string | null): boolean | null {
  const q = useQuery({
    queryKey: anahtar.kartRotasi(kimlik ?? ''),
    enabled: kimlik !== null,
    queryFn: () => api.get<KatalogKartiRotasiCevabi>(`/malzeme-katalogu-kartlari/${yolParcasi(kimlik ?? '')}/rota`).then((c) => c.rotali).catch(() => null),
  });
  return kimlik === null ? null : q.data ?? null;
}

interface SablonVerisi { sablonlar: Sablon[]; kaldirabilir: ReadonlySet<string>; surumler: ReadonlyMap<string, number> }

export function useSablonlar() {
  return useQuery({
    queryKey: anahtar.sablonlar,
    queryFn: async (): Promise<SablonVerisi> => {
      const c = await api.get<KatalogSablonlariCevabi>('/malzeme-katalogu-sablonlari');
      return { sablonlar: c.sablonlar as Sablon[], kaldirabilir: new Set(c.kaldirabilir), surumler: new Map(Object.entries(c.surumler)) };
    },
  });
}

// Rota şablonları Rota modülündedir (kart #688); kart yalnız sıra, kod ve adın kopyasını alır.
export function useRotaSablonlari() {
  return useQuery({
    queryKey: anahtar.rotaSablonlari,
    queryFn: async (): Promise<RotaSablonu[]> => (await api.get<SablonlarCevabi>('/rota/sablonlar')).sablonlar.map((s) => ({
      id: s.id, ad: s.ad, varsayilan: s.varsayilan,
      adimlar: [...s.adimlar].sort((a, b) => a.sira - b.sira).map((a) => ({ kod: a.operasyonTipi.kod, ad: a.ad || a.operasyonTipi.ad })),
    })),
  });
}

// Tedarikçi seçimi (kart #466): yalnız arama metni geçer. Uç en az iki harf ister.
export async function firmaAra(ara: string): Promise<Firma[]> {
  const metin = ara.trim();
  if (metin.length < 2) return [];
  return (await api.get<FirmaSecenekleriCevabi>(`/malzeme-firma-secenekleri?${new URLSearchParams({ ara: metin }).toString()}`)).firmalar;
}

// Yalnız gerçek değer geçer; sunucu ağırlıktan birim fiyatı bulur (208 a).
export function ozetGovdesi(ozet: KartOzeti): KartOzeti {
  const metin = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  return {
    stok_kodu: ozet.stok_kodu ?? null, tur: ozet.tur, onay_durumu: ozet.onay_durumu,
    benzersiz_anahtar: ozet.benzersiz_anahtar ?? null, mukerrer_gerekcesi: ozet.mukerrer_gerekcesi ?? null,
    ...(Array.isArray(ozet.uygulanmayan_zorunlu) ? { uygulanmayan_zorunlu: ozet.uygulanmayan_zorunlu } : {}),
    birim_agirlik_kg: typeof ozet.birim_agirlik_kg === 'number' && ozet.birim_agirlik_kg > 0 ? ozet.birim_agirlik_kg : null,
    kalite_adi: metin(ozet.kalite_adi), form_adi: metin(ozet.form_adi),
    aciklama_1: metin(ozet.aciklama_1), aciklama_2: metin(ozet.aciklama_2), aciklama_3: metin(ozet.aciklama_3),
  };
}

function kartlarSorgusu(istemci: ReturnType<typeof useQueryClient>): KatalogKarti[] {
  return istemci.getQueriesData<KatalogKarti[]>({ queryKey: [...MALZEMELER_YENI, 'kartlar'] }).flatMap(([, v]) => v ?? []);
}

// Kartın son okunan sürümü veri katmanındadır; parça sürüm taşımaz. Başkası arada yazmışsa sunucu 409 verir.
export function useKartKaydet() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: async ({ kayit, ozet }: { kayit: KartKaydi; ozet: KartOzeti }) => {
      const id = String(kayit.id ?? '');
      const surum = kartlarSorgusu(istemci).find((k) => k.kimlik === id)?.surum ?? null;
      const c = await api.post<KatalogKartiKaydetCevabi>(`/malzeme-katalogu-kartlari/${yolParcasi(id)}/kaydet`, { kayit, ozet: ozetGovdesi(ozet), surum });
      return { id: c.id, stok_kodu: c.stok_kodu };
    },
    onSettled: () => istemci.invalidateQueries({ queryKey: [...MALZEMELER_YENI, 'kartlar'] }),
  });
}

export function useKartIptal() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (kimlik: string) => api.post(`/malzeme-katalogu-kartlari/${yolParcasi(kimlik)}/iptal`),
    onSettled: () => istemci.invalidateQueries({ queryKey: [...MALZEMELER_YENI, 'kartlar'] }),
  });
}

export function useSablonKaydet() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (sablon: Sablon) => {
      const surum = istemci.getQueryData<SablonVerisi>(anahtar.sablonlar)?.surumler.get(sablon.id) ?? null;
      return api.post<KatalogSurumluKayitCevabi>(`/malzeme-katalogu-sablonlari/${yolParcasi(sablon.id)}/kaydet`, { sablon, surum });
    },
    onSettled: () => istemci.invalidateQueries({ queryKey: anahtar.sablonlar }),
  });
}

export function useSablonKaldir() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (kimlik: string) => api.post(`/malzeme-katalogu-sablonlari/${yolParcasi(kimlik)}/kaldir`),
    onSettled: () => istemci.invalidateQueries({ queryKey: anahtar.sablonlar }),
  });
}

export type AyarAnahtari = 'malzeme' | 'genel';

// Ekran aynı ayarı art arda, beklemeden gönderebilir; aynı anahtarın iki kaydı birbirini eski sürüm saymasın diye sırayla gider
// ve her biri bir öncekinin döndürdüğü sürümle yazılır.
const ayarSirasi = new Map<AyarAnahtari, Promise<unknown>>();
const yazilanSurum = new Map<AyarAnahtari, number>();

export function useAyarKaydet() {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: ({ anahtar: a, deger }: { anahtar: AyarAnahtari; deger: Nesne }) => {
      const yaz = async () => {
        const okunan = istemci.getQueryData<KatalogOrtami>(anahtar.ortam)?.surumler[a] ?? null;
        const surum = yazilanSurum.get(a) ?? okunan;
        const c = await api.post<KatalogSurumluKayitCevabi>(`/malzeme-katalogu-ayarlari/${yolParcasi(a)}/kaydet`, { deger, surum });
        yazilanSurum.set(a, c.surum);
        return c;
      };
      const sira = (ayarSirasi.get(a) ?? Promise.resolve()).catch(() => undefined).then(yaz);
      ayarSirasi.set(a, sira);
      return sira;
    },
    onSettled: async () => {
      await istemci.invalidateQueries({ queryKey: anahtar.ortam });
      yazilanSurum.clear();
    },
  });
}

export type KayitHataKodu = 'cakisma' | 'kategori-yok' | 'gerekce-kisa';

// Ekran sunucunun kendi iletisini olduğu gibi gösterir (#234 madde 18); alan eşlemesi sihirbazın odaklayacağı adımı seçer.
export function kayitHatasi(e: unknown): { kod: KayitHataKodu | null; ileti: string } {
  const ileti = hataIletisi(e, 'Kayıt yapılamadı, birazdan tekrar dene.');
  if (!(e instanceof ApiHatasi)) return { kod: null, ileti };
  if (e.durum === 409) return { kod: 'cakisma', ileti };
  if (e.durum !== 400) return { kod: null, ileti };
  if (e.govde.alan === 'kayit.g.kat') return { kod: 'kategori-yok', ileti };
  return { kod: e.govde.alan === 'ozet.mukerrer_gerekcesi' ? 'gerekce-kisa' : null, ileti };
}
