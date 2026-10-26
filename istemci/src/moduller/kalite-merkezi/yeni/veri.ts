import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type {
  KmDegisiklikCevabi, KmDosyaCevabi, KmEmirKaynaklariCevabi, KmGeriYukleCevabi, KmGeriYukleGovdesi, KmKimlikCevabi, KmOlcuAletleriCevabi, KmOnayGeriAlGovdesi,
  KmOnaylaCevabi, KmOnaylaGovdesi, KmOnayReddiAlani, KmSilGovdesi, KmSurumCevabi, KmYazGovdesi,
} from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { api, ApiHatasi } from '../../../ortak/veri/api.ts';
import { emirSatirlari } from './emirler/kaynak.ts';
import { izFarki, izNo } from './kurallar.ts';
import type { Emir, IzDegisikligi, IzKaydi, KmAyarlari, KmKayit, KmKoleksiyonTipleri, KmKoleksiyonu } from './tipler.ts';

// Uygulamanın `S`i: koleksiyon başına kayıtlar (kimlik `_id`'de), ayarlar ve oturumdaki kişinin adı. Kayıt sunucuda yorumlanmaz.
// `emir` sahiplerinden gelen iş emri ve siparişlerdir (592 B1 c); Kalite Merkezi'nin eşleşmeyen eski kendi kayıtları `eskiEmir`dedir.
// Kaynak okunamadıysa `emirKaynagiHatasi` doludur ve `emir` boştur: öteki görünümler çalışmaya devam eder.
export type KmVerisi = { readonly [K in KmKoleksiyonu]: readonly KmKoleksiyonTipleri[K][] } & {
  ayarlar: KmAyarlari; kisi: string; eskiEmir?: readonly Emir[]; emirKaynagiHatasi?: unknown;
};

const KOLEKSIYONLAR: readonly KmKoleksiyonu[] = ['ncr', 'capa', 'insp', 'dev', 'sup', 'frm', 'lot', 'tpl', 'spc', 'cizim', 'parca', 'iz', 'belge', 'emir', 'bayrak'];
// Ölçü aletlerinin kaynağı Kalibrasyondur (329 a): akıştan değil kendi ucundan gelir, ekrandan yazılmaz.
const CIHAZ = 'dev';
const AYAR = 'settings';
const GENEL = 'genel';
export const YOKLAMA_ARALIGI_MS = 15_000;
export const KM_SORGU_ANAHTARI = ['kalite-merkezi', 'yeni', 'veri'] as const;
export const KM_KIMLIK_ANAHTARI = ['kalite-merkezi', 'kimlik'] as const;
export const KM_EMIR_KAYNAGI_ANAHTARI = ['kalite-merkezi', 'emir-kaynaklari'] as const;
// Sahiplerin listesi akıştan seyrek değişir; Kalite Merkezi'nin kendi kayıtlarından daha az yoklanır.
const EMIR_KAYNAGI_ARALIGI_MS = 60_000;

type Govde = Record<string, unknown>;
interface Hal { govde: Govde | null; surum: number }

// Artımlı akışın istemci tarafı: son akış sürümü ve kayıt başına son hâl (yazmada beklenen sürüm). Akış ve yazma cevapları sırasız
// gelebilir; yalnız daha yeni sürüm eskisinin yerine geçer.
export class KmDeposu {
  surum = 0;
  private readonly haller = new Map<string, Map<string, Hal>>();
  private cihazlar: { kimlik: string; govde: Govde }[] = [];

  private kol(k: string): Map<string, Hal> {
    let m = this.haller.get(k);
    if (!m) {
      m = new Map();
      this.haller.set(k, m);
    }
    return m;
  }

  hatirla(kol: string, kimlik: string, hal: Hal): void {
    const m = this.kol(kol);
    const eski = m.get(kimlik);
    if (eski === undefined || eski.surum < hal.surum) m.set(kimlik, hal);
  }

  uygula(c: KmDegisiklikCevabi): void {
    for (const d of c.degisiklikler) if (d.koleksiyon !== CIHAZ) this.hatirla(d.koleksiyon, d.kimlik, { govde: d.govde, surum: d.surum });
    this.surum = Math.max(this.surum, c.surum);
  }

  cihazlariKoy(c: KmOlcuAletleriCevabi): void {
    this.cihazlar = c.cihazlar;
  }

  // Yazmada beklenen sürüm: kayıt dolu biliniyorsa son sürümü, yoksa (yeni ya da silinmiş) null.
  beklenen(kol: string, kimlik: string): number | null {
    const h = this.haller.get(kol)?.get(kimlik);
    return h?.govde ? h.surum : null;
  }

  govde(kol: string, kimlik: string): Govde | null {
    return this.haller.get(kol)?.get(kimlik)?.govde ?? null;
  }

  goruntu(kisi: string): KmVerisi {
    const liste = (k: string): KmKayit[] => {
      const out: KmKayit[] = [];
      for (const [kimlik, h] of this.haller.get(k) ?? []) if (h.govde) out.push({ ...h.govde, _id: kimlik });
      return out;
    };
    const v: Record<string, unknown> = { kisi, ayarlar: (this.govde(AYAR, GENEL) ?? {}) as KmAyarlari };
    for (const k of KOLEKSIYONLAR) v[k] = k === CIHAZ ? this.cihazlar.map((c) => ({ ...c.govde, _id: c.kimlik })) : liste(k);
    return v as KmVerisi;
  }
}

// Depo istemci önbelleğiyle yaşar: aynı QueryClient'ta ekran kapanıp açılınca akış baştan okunmaz.
const depolar = new WeakMap<QueryClient, KmDeposu>();
function deposu(qc: QueryClient): KmDeposu {
  let d = depolar.get(qc);
  if (!d) {
    d = new KmDeposu();
    depolar.set(qc, d);
  }
  return d;
}

export function useKmKimligi() {
  return useQuery({ queryKey: KM_KIMLIK_ANAHTARI, queryFn: () => api.get<KmKimlikCevabi>('/kalite-merkezi/kimlik'), staleTime: 60_000 });
}

async function cek(d: KmDeposu): Promise<void> {
  // İlk okumada cihaz listesi alınamazsa hata verir: boş liste gerçekmiş gibi görünmesin.
  const [akis, cihazlar] = await Promise.all([
    api.get<KmDegisiklikCevabi>(`/kalite-merkezi/degisiklikler?sonra=${d.surum}`),
    api.get<KmOlcuAletleriCevabi>('/kalite-merkezi/olcu-aletleri'),
  ]);
  d.uygula(akis);
  d.cihazlariKoy(cihazlar);
}

export function useKmVerisi(): { veri: KmVerisi | undefined; hata: unknown; yukleniyor: boolean } {
  const qc = useQueryClient();
  const kimlik = useKmKimligi();
  const kisi = kimlik.data?.kisi.ad ?? '';
  const q = useQuery({
    queryKey: KM_SORGU_ANAHTARI,
    queryFn: async () => {
      const d = deposu(qc);
      await cek(d);
      return d.goruntu('');
    },
    refetchInterval: YOKLAMA_ARALIGI_MS,
  });
  const kaynak = useQuery({
    queryKey: KM_EMIR_KAYNAGI_ANAHTARI,
    queryFn: () => api.get<KmEmirKaynaklariCevabi>('/kalite-merkezi/emir-kaynaklari'),
    refetchInterval: EMIR_KAYNAGI_ARALIGI_MS,
  });
  const veri = useMemo(() => {
    if (!q.data) return undefined;
    if (!kaynak.data) return { ...q.data, kisi, emir: [], eskiEmir: q.data.emir, emirKaynagiHatasi: kaynak.error ?? undefined };
    return { ...q.data, kisi, ...emirSatirlari(kaynak.data.emirler, q.data.emir, q.data.sup) };
  }, [q.data, kisi, kaynak.data, kaynak.error]);
  return { veri, hata: q.error, yukleniyor: q.isPending || kaynak.isPending };
}

export const yeniKimlik = (onek: string): string => `${onek}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
// Dosya kimliği uygulamanın biçimindedir (yalnız harf ve rakam).
export const yeniDosyaKimligi = (): string => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`.replace(/[^a-z0-9]/gi, '');

// Uygulamadaki numara: önek-yıl-sıra, yılın en büyüğüne bir eklenir. 206 a (sunucu sayacı) UYUM-BORCU'dadır.
export function siradakiNo(liste: readonly { no?: unknown }[], onek: string, yil: number = new Date().getFullYear()): string {
  const on = `${onek}-${yil}-`;
  let enBuyuk = 0;
  for (const r of liste) {
    if (typeof r.no === 'string' && r.no.startsWith(on)) {
      const n = parseInt(r.no.slice(on.length), 10);
      if (n > enBuyuk) enBuyuk = n;
    }
  }
  return on + String(enBuyuk + 1).padStart(4, '0');
}

const ONAY_REDDI: KmOnayReddiAlani = 'onay';
const onayReddiMi = (e: unknown): boolean => e instanceof ApiHatasi && e.durum === 403 && e.govde.alan === ONAY_REDDI;
const parca = (p: string): string => encodeURIComponent(p);

export interface KaydetSecenegi {
  karantinaHedefKonumId?: number;
  serbestMiktarlar?: KmOnaylaGovdesi['serbestMiktarlar'];
  // İz işlemi verilmezse oluşturma ya da değişiklik; kilit açmada gerekçe ize yazılır.
  izIslemi?: string;
  gerekce?: string;
}

export interface IzOlayi { islem: string; col: string; id: string; no?: string; degisen?: IzDegisikligi[]; gerekce?: string }

export interface KmKomutu {
  kaydet: <K extends KmKoleksiyonu>(kol: K, kayit: Partial<KmKoleksiyonTipleri[K]>, secenek?: KaydetSecenegi) => Promise<{ kimlik: string; uyari?: string }>;
  sil: (kol: KmKoleksiyonu, kimlik: string) => Promise<void>;
  onayGeriAl: (kimlik: string) => Promise<void>;
  ayarKaydet: (ayarlar: KmAyarlari) => Promise<void>;
  dosyaYukle: (kimlik: string, veri: Blob) => Promise<void>;
  dosyaAdresi: (kimlik: string) => string;
  dosyaSil: (kimlik: string) => Promise<void>;
  izYaz: (olay: IzOlayi) => Promise<void>;
  geriYukle: (yedek: KmYedek) => Promise<number>;
}

export interface KmYedek { docs?: Record<string, Record<string, Govde>>; files?: Record<string, { b64?: string }> }

// Ortak dosya deposunun parça boyu (paylasilan/sozlesme/dosya.ts DOSYA_PARCASI).
export const DOSYA_PARCASI = 512 * 1024;
// Yedek gövde sınırının (1 MB) altında parça parça gider.
export const GERI_YUKLEME_PARCASI = 700 * 1024;

async function ozetHesapla(veri: Uint8Array<ArrayBuffer>): Promise<string> {
  const ozet = new Uint8Array(await crypto.subtle.digest('SHA-256', veri));
  return Array.from(ozet, (b) => b.toString(16).padStart(2, '0')).join('');
}

function base64Yaz(veri: Uint8Array): string {
  let ikili = '';
  for (let i = 0; i < veri.length; i += 0x8000) ikili += String.fromCharCode(...veri.subarray(i, i + 0x8000));
  return btoa(ikili);
}

function base64Oku(metin: string): Uint8Array<ArrayBuffer> {
  const ikili = atob(metin);
  const veri = new Uint8Array(ikili.length);
  for (let i = 0; i < ikili.length; i++) veri[i] = ikili.charCodeAt(i);
  return veri;
}

type GeriYuklemeBelgesi = KmGeriYukleGovdesi['belgeler'][number];
export function belgeParcalari(belgeler: readonly GeriYuklemeBelgesi[], sinir = GERI_YUKLEME_PARCASI): GeriYuklemeBelgesi[][] {
  const parcalar: GeriYuklemeBelgesi[][] = [[]];
  let boyut = 0;
  for (const b of belgeler) {
    const n = JSON.stringify(b).length;
    if (boyut + n > sinir && parcalar[parcalar.length - 1]!.length > 0) {
      parcalar.push([]);
      boyut = 0;
    }
    parcalar[parcalar.length - 1]!.push(b);
    boyut += n;
  }
  return parcalar;
}

// Yazma komutları. Kural sunucudadır: onay ve kapanış alanını değiştiren yazma genel uçtan 403 (`alan: onay`) alır ve aynı gövde onay
// ucuna gider; onay işlemi olmayan kişi oradan da reddedilir. Değişiklik izi uygulamadaki gibi istemciden eklenir (sunucuda yalnız eklenir).
export function useKmKomutu(rol = ''): KmKomutu {
  const qc = useQueryClient();
  const kimlik = useKmKimligi();
  const kim = kimlik.data?.kisi.ad ?? 'Tanımsız';
  return useMemo(() => {
    const d = deposu(qc);
    const yenile = () => qc.invalidateQueries({ queryKey: KM_SORGU_ANAHTARI });

    async function govdeYaz(kol: string, id: string, govde: Govde, secenek: KaydetSecenegi = {}): Promise<KmOnaylaCevabi> {
      const yol = `/kalite-merkezi/kayitlar/${parca(kol)}/${parca(id)}`;
      const istek: KmYazGovdesi = { govde, surum: d.beklenen(kol, id) };
      let cevap: KmOnaylaCevabi;
      try {
        cevap = await api.post<KmSurumCevabi>(`${yol}/yaz`, istek);
      } catch (e) {
        if (!onayReddiMi(e)) throw e;
        const onay: KmOnaylaGovdesi = {
          ...istek,
          ...(secenek.karantinaHedefKonumId === undefined ? {} : { karantinaHedefKonumId: secenek.karantinaHedefKonumId }),
          ...(secenek.serbestMiktarlar === undefined ? {} : { serbestMiktarlar: secenek.serbestMiktarlar }),
        };
        cevap = await api.post<KmOnaylaCevabi>(`${yol}/onayla`, onay);
      }
      d.hatirla(kol, id, { govde, surum: cevap.surum });
      return cevap;
    }

    async function izYaz(o: IzOlayi): Promise<void> {
      const kayit: Omit<IzKaydi, '_id'> = { t: new Date().toISOString(), kim, rol, ...o };
      // İz yazılamazsa asıl kayıt geri alınmaz (uygulamada da sessizdir).
      try {
        await govdeYaz('iz', yeniKimlik('iz'), kayit as Govde);
      } catch {
        /* iz kaybı kaydı bozmaz */
      }
    }

    return {
      async kaydet(kol, kayit, secenek = {}) {
        const id = typeof kayit._id === 'string' && kayit._id !== '' ? kayit._id : yeniKimlik(kol);
        const once = d.govde(kol, id);
        const govde: Govde = { ...kayit, guncelleme: new Date().toISOString() };
        delete govde._id;
        const { uyari } = await govdeYaz(kol, id, govde, secenek);
        if (kol !== 'iz') {
          const degisen = izFarki(once, govde);
          if (!once || degisen.length || secenek.izIslemi) {
            await izYaz({
              islem: secenek.izIslemi ?? (once ? 'değişiklik' : 'oluşturma'), col: kol, id, no: izNo(govde), degisen,
              ...(secenek.gerekce ? { gerekce: secenek.gerekce } : {}),
            });
          }
        }
        void yenile();
        return { kimlik: id, ...(uyari === undefined ? {} : { uyari }) };
      },
      async sil(kol, id) {
        const once = d.govde(kol, id);
        const istek: KmSilGovdesi = { surum: d.beklenen(kol, id) };
        const { surum } = await api.post<KmSurumCevabi>(`/kalite-merkezi/kayitlar/${parca(kol)}/${parca(id)}/sil`, istek);
        d.hatirla(kol, id, { govde: null, surum });
        await izYaz({ islem: 'silme', col: kol, id, no: izNo(once), degisen: [{ alan: 'Kayıt', eski: izNo(once) || id, yeni: 'silindi' }] });
        void yenile();
      },
      async onayGeriAl(id) {
        const surum = d.beklenen('frm', id);
        if (surum === null) throw new Error('Form bulunamadı.');
        const istek: KmOnayGeriAlGovdesi = { surum };
        const cevap = await api.post<KmSurumCevabi>(`/kalite-merkezi/formlar/${parca(id)}/onay-geri-al`, istek);
        const govde = d.govde('frm', id);
        if (govde) d.hatirla('frm', id, { govde, surum: cevap.surum });
        void yenile();
      },
      async ayarKaydet(ayarlar) {
        await govdeYaz(AYAR, GENEL, { ...(d.govde(AYAR, GENEL) ?? {}), ...ayarlar });
        void yenile();
      },
      async dosyaYukle(id, blob) {
        const veri = new Uint8Array(await blob.arrayBuffer());
        const ozet = await ozetHesapla(veri);
        const toplam = Math.max(1, Math.ceil(veri.length / DOSYA_PARCASI));
        for (let sira = 0; sira < toplam; sira++) {
          const p = veri.subarray(sira * DOSYA_PARCASI, (sira + 1) * DOSYA_PARCASI);
          const { tamam } = await api.post<{ tamam: boolean }>(`/dosyalar/${ozet}/parca`, { sira, toplam, veri: base64Yaz(p) });
          if (tamam) break;
        }
        await api.post<KmDosyaCevabi>(`/kalite-merkezi/dosyalar/${parca(id)}/bagla`, { ozet, ad: id });
      },
      dosyaAdresi: (id) => `/api/kalite-merkezi/dosyalar/${parca(id)}`,
      async dosyaSil(id) {
        await api.post(`/kalite-merkezi/dosyalar/${parca(id)}/sil`);
      },
      izYaz,
      async geriYukle(yedek) {
        for (const [id, f] of Object.entries(yedek.files ?? {})) {
          if (typeof f?.b64 === 'string' && f.b64 !== '') await this.dosyaYukle(id, new Blob([base64Oku(f.b64)]));
        }
        const belgeler: GeriYuklemeBelgesi[] = [];
        for (const [koleksiyon, kayitlar] of Object.entries(yedek.docs ?? {})) {
          for (const [kimlik, g] of Object.entries(kayitlar ?? {})) belgeler.push({ koleksiyon, kimlik, govde: g } as GeriYuklemeBelgesi);
        }
        let surum = 0;
        let baslangic: number | null = null;
        const parcalar = belgeParcalari(belgeler);
        for (const [sira, p] of parcalar.entries()) {
          const govde: KmGeriYukleGovdesi = { baslangic, son: sira === parcalar.length - 1, belgeler: p };
          ({ surum, baslangic } = await api.post<KmGeriYukleCevabi>('/kalite-merkezi/geri-yukle', govde));
        }
        void yenile();
        return surum;
      },
    };
  }, [qc, kim, rol]);
}

// Uygulamanın `kym-me` tercihi (dolduran, muayeneci, bölüm, atölye modu): kişiye özel kolaylık, tarayıcıda kalır; okunamazsa boş.
export interface KmTercihi { dolduran?: string; muayeneci?: string; bolum?: string; shop?: boolean; [alan: string]: unknown }
const TERCIH_ANAHTARI = 'kym-me';

export function kmTercihi(): KmTercihi {
  try {
    const o: unknown = JSON.parse(localStorage.getItem(TERCIH_ANAHTARI) ?? '{}');
    return o !== null && typeof o === 'object' ? (o as KmTercihi) : {};
  } catch {
    return {};
  }
}

export function tercihYaz(degisen: Partial<KmTercihi>): void {
  try {
    localStorage.setItem(TERCIH_ANAHTARI, JSON.stringify({ ...kmTercihi(), ...degisen }));
  } catch {
    /* tarayıcı depolaması kapalıysa tercih yalnız bu oturumda kalır */
  }
}

// Kaydedilen formdaki kişi alanları sonraki formun ön değeri olur (uygulamadaki remember).
export function kisileriHatirla(o: Record<string, unknown>): void {
  const degisen: Partial<KmTercihi> = {};
  for (const k of ['dolduran', 'muayeneci', 'bolum'] as const) if (typeof o[k] === 'string' && o[k] !== '') degisen[k] = o[k];
  if (Object.keys(degisen).length) tercihYaz(degisen);
}
