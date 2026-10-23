import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BelgeCevabi, BenCevabi, EkCevabi, EkIcerikCevabi, Filtre, KilitCevabi, KisilerCevabi, OdaCevabi, SorguCevabi,
} from '#paylasilan/sozlesme/mesaj.ts';
import { api } from '../../../ortak/veri/api.ts';
import type { Ben, EkBilgisi, Es, Kayit, Kisi } from './tipler.ts';

// Yeni ekran eski çerçevenin belge deposunu aynı uçlarla okur ve yazar (204 a); köprü ve çerçeve yoktur. Kural ve yetki
// sunucudadır (KURAL-TEST BD-1..14, 225 a); burası yalnız taşır.

export const MESAJ_ANAHTARI = ['mesaj'] as const;
const SORGU_ANAHTARI = ['mesaj', 'sorgu'] as const;
// Sunucu sınırıyla aynı (sozlesme AZAMI_EK_BAYT); istemci sözleşmeyi değer olarak ithal etmez.
export const AZAMI_EK_BAYT = 700 * 1024;
export const EK_SINIRI_ILETISI = 'Dosya 700 KB sınırını aşıyor.';
// Açık her sekme sürekli istek atar; değişiklik damgası 10 sn gecikmeyle de yeter (eski ekranla aynı).
export const YOKLAMA_MS = 10_000;
const GIZLI_YOKLAMA_MS = 15_000;
const ODA_MS = 5000;

const q = encodeURIComponent;

export type Sira = readonly [alan: string, yon: 'asc' | 'desc'];
export interface SorguSecenegi { sira?: Sira; sinir?: number; filtreler?: readonly Filtre[]; acik?: boolean }

const kayit = <T>(b: { kimlik: string; veri: Record<string, unknown>; surum: number }): Kayit<T> =>
  ({ ...(b.veri as T), id: b.kimlik, surum: b.surum });

export async function sorgula<T>(koleksiyon: string, s: SorguSecenegi = {}): Promise<Kayit<T>[]> {
  const p = new URLSearchParams({ koleksiyon });
  if (s.filtreler && s.filtreler.length > 0) p.set('filtreler', JSON.stringify(s.filtreler));
  if (s.sira) p.set('sira', JSON.stringify({ alan: s.sira[0], yon: s.sira[1] }));
  if (s.sinir !== undefined) p.set('sinir', String(s.sinir));
  const c = await api.get<SorguCevabi>(`/mesaj/sorgu?${p.toString()}`);
  return c.belgeler.map((b) => kayit<T>(b));
}

export async function getir<T>(yol: string): Promise<Kayit<T> | null> {
  const c = await api.get<BelgeCevabi>(`/mesaj/belge?yol=${q(yol)}`);
  return c.belge === null ? null : kayit<T>(c.belge);
}

// Kimlik eski köprüyle aynı biçimde üretilir (20 harf/rakam).
export function rastgeleKimlik(n = 20): string {
  const harfler = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const sayilar = new Uint32Array(n);
  crypto.getRandomValues(sayilar);
  return Array.from(sayilar, (s) => harfler[s % harfler.length] ?? 'x').join('');
}

export interface MesajYazici {
  // Yeni belge açar, kimliği döner.
  ekle: (koleksiyon: string, veri: object) => Promise<string>;
  // Belgenin tamamını yazar (yoksa açar).
  yaz: (yol: string, veri: object) => Promise<void>;
  // Var olan belgeye iç içe birleştirir (sunucuda; belge yoksa 404).
  guncelle: (yol: string, yama: object) => Promise<void>;
  sil: (yol: string) => Promise<void>;
  // Zamanlayıcı ve kural tetiği için kısa süreli kilit; alındıysa true.
  kilitle: (yol: string, sureMs?: number) => Promise<boolean>;
  getir: <T>(yol: string) => Promise<Kayit<T> | null>;
}

// Sekme başına kilit sahibi (eski ekranın TAB'ı).
const SEKME = rastgeleKimlik(12);

export function yaziciKur(yazildi: () => void): MesajYazici {
  // Aynı belgeye yazmalar sırayla gider (eski ekranın `serial`'i): ardışık birleştirmeler birbirini ezmez.
  const kuyruk = new Map<string, Promise<unknown>>();
  const sirala = <T>(yol: string, is: () => Promise<T>): Promise<T> => {
    const onceki = kuyruk.get(yol) ?? Promise.resolve();
    const p = onceki.catch(() => undefined).then(is);
    kuyruk.set(yol, p);
    void p.finally(() => { if (kuyruk.get(yol) === p) kuyruk.delete(yol); }).catch(() => undefined);
    return p.then((s) => { yazildi(); return s; });
  };
  const belgeYaz = (yol: string, veri: object, kip: 'tam' | 'birlestir') =>
    sirala(yol, () => api.post<BelgeCevabi>('/mesaj/belge/yaz', { yol, veri, kip })).then(() => undefined);
  return {
    ekle: async (koleksiyon, veri) => {
      const id = rastgeleKimlik();
      await belgeYaz(`${koleksiyon}/${id}`, veri, 'tam');
      return id;
    },
    yaz: (yol, veri) => belgeYaz(yol, veri, 'tam'),
    guncelle: (yol, yama) => belgeYaz(yol, yama, 'birlestir'),
    sil: (yol) => sirala(yol, () => api.post('/mesaj/belge/sil', { yol })).then(() => undefined),
    kilitle: async (yol, sureMs = 30_000) => {
      try {
        const c = await api.post<KilitCevabi>('/mesaj/belge/kilitle', { yol, sahip: SEKME, sureMs });
        return c.alindi;
      } catch {
        return false;
      }
    },
    getir,
  };
}

export function useMesajYazici(): MesajYazici {
  const istemci = useQueryClient();
  return useMemo(() => yaziciKur(() => { void istemci.invalidateQueries({ queryKey: SORGU_ANAHTARI }); }), [istemci]);
}

// Değişiklik damgası: değişince bütün sorgular yeniden okunur. Parçalar kendi yoklamasını kurmaz.
export function useDamgaYoklamasi(acik: boolean): void {
  const istemci = useQueryClient();
  const son = useRef<number | null>(null);
  const sonYoklama = useRef(0);
  useEffect(() => {
    if (!acik) return undefined;
    const yokla = async () => {
      if (document.hidden && Date.now() - sonYoklama.current < GIZLI_YOKLAMA_MS) return;
      sonYoklama.current = Date.now();
      try {
        const { damga } = await api.get<{ damga: number }>('/mesaj/damga');
        if (son.current !== null && damga !== son.current) void istemci.invalidateQueries({ queryKey: SORGU_ANAHTARI });
        son.current = damga;
      } catch { /* bağlantı dönünce sonraki yoklama yeniler */ }
    };
    void yokla();
    const z = window.setInterval(() => { void yokla(); }, YOKLAMA_MS);
    return () => { window.clearInterval(z); };
  }, [acik, istemci]);
}

export function useKoleksiyon<T>(koleksiyon: string | null, s: SorguSecenegi = {}): Kayit<T>[] | undefined {
  const sorgu = useQuery({
    queryKey: [...SORGU_ANAHTARI, koleksiyon, s.sira ?? null, s.sinir ?? null, s.filtreler ?? null],
    queryFn: () => sorgula<T>(koleksiyon ?? '', s),
    enabled: koleksiyon !== null && s.acik !== false,
    // Tazelik damgadan gelir.
    staleTime: Infinity,
  });
  return sorgu.data;
}

export function useBelge<T>(yol: string | null): Kayit<T> | null | undefined {
  const sorgu = useQuery({
    queryKey: [...SORGU_ANAHTARI, 'belge', yol],
    queryFn: () => getir<T>(yol ?? ''),
    enabled: yol !== null,
    staleTime: Infinity,
  });
  return sorgu.data;
}

// Kimlik; boş depoda yönetici bir kez başlangıç kurulumunu yapar (eski ekranla aynı).
export async function benOku(): Promise<Ben> {
  let ben = await api.get<BenCevabi>('/mesaj/ben');
  if (ben.kurulumGerekli && ben.yonetici) {
    await api.post('/mesaj/kurulum');
    ben = await api.get<BenCevabi>('/mesaj/ben');
  }
  return { id: String(ben.kisi.id), ad: ben.kisi.ad, yazabilir: ben.yazabilir, yonetici: ben.yonetici };
}

export function useBen(acik = true) {
  return useQuery({ queryKey: [...MESAJ_ANAHTARI, 'ben'], queryFn: benOku, enabled: acik, staleTime: Infinity });
}

export const kisiAdi = (kisiler: ReadonlyMap<string, string>, id: string | null | undefined, ben?: string): string => {
  if (!id) return 'Mesaj';
  if (id === '__bot') return 'Otomatik uyarı';
  return kisiler.get(id) ?? (id === ben ? 'Sen' : 'Ekip arkadaşı');
};

export function useKisiler(acik = true): { kisiler: Kisi[]; harita: ReadonlyMap<string, string> } {
  const sorgu = useQuery({
    queryKey: [...MESAJ_ANAHTARI, 'kisiler'],
    queryFn: async () => (await api.get<KisilerCevabi>('/mesaj/kisiler')).kisiler.map((k) => ({ id: String(k.id), ad: k.ad })),
    enabled: acik,
    staleTime: 60_000,
  });
  return useMemo(() => {
    const kisiler = sorgu.data ?? [];
    return { kisiler, harita: new Map(kisiler.map((k) => [k.id, k.ad])) };
  }, [sorgu.data]);
}

// Oda: o an sayfası açık olanlar ve durumları (yazıyor). Kalıcı değildir.
export function useOda(acik: boolean): { esler: Es[]; durumYaz: (yama: Record<string, unknown>) => void } {
  const [esler, setEsler] = useState<Es[]>([]);
  const oku = useRef<(yama?: Record<string, unknown>) => Promise<void>>(async () => undefined);
  useEffect(() => {
    if (!acik) return undefined;
    let bitti = false;
    oku.current = async (yama = {}) => {
      try {
        const yol = Object.keys(yama).length > 0 ? `/mesaj/oda?durum=${q(JSON.stringify(yama))}` : '/mesaj/oda';
        const c = await api.get<OdaCevabi>(yol);
        if (!bitti) setEsler(c.esler.map((e) => ({ kisi: String(e.kisiId), durum: e.durum, guncellendi: e.guncellendi })));
      } catch { /* sonraki yoklama */ }
    };
    void oku.current();
    const z = window.setInterval(() => { void oku.current(); }, ODA_MS);
    return () => { bitti = true; window.clearInterval(z); };
  }, [acik]);
  return useMemo(() => ({ esler, durumYaz: (yama) => { void oku.current(yama); } }), [esler]);
}

const base64 = (dosya: Blob): Promise<string> => new Promise((coz, reddet) => {
  const okuyucu = new FileReader();
  okuyucu.onload = () => { coz(String(okuyucu.result).replace(/^data:[^,]*,/, '')); };
  okuyucu.onerror = () => { reddet(okuyucu.error ?? new Error('Dosya okunamadı.')); };
  okuyucu.readAsDataURL(dosya);
});

export async function ekYukle(dosya: File): Promise<EkBilgisi> {
  if (dosya.size > AZAMI_EK_BAYT) throw new Error(EK_SINIRI_ILETISI);
  const tur = (dosya.type || '').split(';')[0]?.trim().toLowerCase() || 'application/octet-stream';
  const ad = String(dosya.name || 'dosya').slice(0, 200) || 'dosya';
  const c = await api.post<EkCevabi>('/mesaj/ekler/yukle', { ad, tur, veri: await base64(dosya) });
  return { name: ad.slice(0, 120), type: tur, size: dosya.size, id: c.id };
}

const EK_KIMLIGI = /^[0-9a-f]{32}$/;
const ekAdresleri = new Map<string, Promise<string>>();
export function ekAdresiAl(id: string): Promise<string> {
  let adres = ekAdresleri.get(id);
  if (adres === undefined) {
    adres = api.get<EkIcerikCevabi>(`/mesaj/ekler/${id}`).then((c) => {
      const ikili = atob(c.veri);
      const baytlar = new Uint8Array(ikili.length);
      for (let i = 0; i < ikili.length; i += 1) baytlar[i] = ikili.charCodeAt(i);
      return URL.createObjectURL(new Blob([baytlar], { type: c.tur }));
    });
    adres.catch(() => { ekAdresleri.delete(id); });
    ekAdresleri.set(id, adres);
  }
  return adres;
}

// Ekin gösterilecek adresi (yüklenene kadar null).
export function useEkAdresi(ek: EkBilgisi | null | undefined): string | null {
  const id = ek?.id && EK_KIMLIGI.test(ek.id) ? ek.id : null;
  const [adres, setAdres] = useState<string | null>(null);
  useEffect(() => {
    if (id === null) { setAdres(null); return undefined; }
    let bitti = false;
    ekAdresiAl(id).then((a) => { if (!bitti) setAdres(a); }, () => { if (!bitti) setAdres(null); });
    return () => { bitti = true; };
  }, [id]);
  return adres;
}

// Eski ekranın `mesai:` önekli yerel depo anahtarları kişiye özel belgede durur; iki ekran aynı değeri görür.
export const kisiselKok = (ben: string): string => `data/users/${ben}/yerel/anahtarlar`;
export const anahtarParcasi = (anahtar: string): string =>
  encodeURIComponent(anahtar).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export function useKisiselDeger<T>(ben: string | null, anahtar: string, varsayilan: T): [T, (deger: T) => void] {
  const yol = ben === null ? null : `${kisiselKok(ben)}/${anahtarParcasi(`mesai:${anahtar}`)}`;
  const belge = useBelge<{ deger?: unknown }>(yol);
  const yazici = useMesajYazici();
  const [yerel, setYerel] = useState<{ deger: T } | null>(null);
  let deger = varsayilan;
  if (yerel !== null) deger = yerel.deger;
  else if (belge && typeof belge.deger === 'string') {
    try { deger = JSON.parse(belge.deger) as T; } catch { /* bozuk kayıt varsayılana düşer */ }
  }
  const yaz = (yeni: T) => {
    setYerel({ deger: yeni });
    if (yol !== null) void yazici.yaz(yol, { deger: JSON.stringify(yeni) }).catch(() => undefined);
  };
  return [deger, yaz];
}
