import { useQuery } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import type { listeCevabi } from '#paylasilan/sozlesme/kalibrasyon.ts';
import type { z } from 'zod';
import { okutmaSesi } from '../../../ortak/arayuz/okutma-geribildirimi.ts';
import type { OlcumAleti } from '../../../ortak/cizim/cekirdek/olcum-aleti.ts';
import { CizimOrtami, type CizimAyarlari, type CizimOnbellegi, type CizimOrtamiDegeri } from '../../../ortak/cizim/ortam.tsx';
import { api } from '../../../ortak/veri/api.ts';
import { useYetki } from '../../../ortak/veri/yetki.ts';

// 2032 a, adım 1: Kalite Merkezi'nin teknik resmi Üretim Hazırlık'takiyle aynı ortamda çalışır. Sağlayıcısız ortak parçada ölçü aleti
// listesi boş, okuma ayarı varsayılan, ağır hesap her açılışta yeniden yapılıyordu.

type AletListesi = z.infer<typeof listeCevabi>;

// Okuma ayarı ve alet seçimi aynı cihazda Üretim Hazırlık'la ortaktır: ortak parçanın kayıtları 'arkon:' önekli anahtarlardadır
// (ortak/cizim/ortam.tsx). Hazırlık'ta "Ayarları tüm sistemde kullan" denen ayar burada da geçerli olur.
const ONEK = 'arkon:';
export const cihazKaydi: CizimAyarlari = {
  oku<T = unknown>(anahtar: string): T | null {
    try { return JSON.parse(window.localStorage.getItem(ONEK + anahtar) ?? 'null') as T | null; } catch { return null; }
  },
  yaz(anahtar: string, deger: unknown): void {
    try {
      if (deger === null || deger === undefined) window.localStorage.removeItem(ONEK + anahtar);
      else window.localStorage.setItem(ONEK + anahtar, JSON.stringify(deger));
    } catch { /* depolama kapalı: ayar yalnız bu açılışta geçerli */ }
  },
};

// Sayfa okuması (görüntü ve ölçü listesi) cihazda saklanır; tarayıcı IndexedDB vermezse yalnız bu açılışta bellekte kalır.
const VT_ADI = 'kalite-merkezi-cizim';
const DEPO = 'onbellek';
export const ONBELLEK_SINIRI = 300;

function vtAc(): Promise<IDBDatabase | null> {
  return new Promise((coz) => {
    try {
      if (typeof indexedDB === 'undefined') { coz(null); return; }
      const istek = indexedDB.open(VT_ADI, 1);
      istek.onupgradeneeded = () => { istek.result.createObjectStore(DEPO); };
      istek.onsuccess = () => { coz(istek.result); };
      istek.onerror = () => { coz(null); };
      istek.onblocked = () => { coz(null); };
    } catch { coz(null); }
  });
}

interface Kayit { v: unknown; at: number }

export function cihazOnbellegi(ac: () => Promise<IDBDatabase | null> = vtAc, sinir = ONBELLEK_SINIRI): CizimOnbellegi {
  const bellek = new Map<string, unknown>();
  let vt: Promise<IDBDatabase | null> | null = null;
  const baglan = () => (vt ??= ac());
  const islem = <T,>(kip: IDBTransactionMode, f: (d: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> =>
    baglan().then((d) => new Promise<T | undefined>((coz) => {
      if (!d) { coz(undefined); return; }
      try {
        const r = f(d.transaction(DEPO, kip).objectStore(DEPO));
        r.onsuccess = () => { coz(r.result); };
        r.onerror = () => { coz(undefined); };
      } catch { coz(undefined); }
    }));
  // En eski kayıtlar sınır aşılınca silinir (kayıt zamanı yazılışındır).
  const buda = async () => {
    const anahtarlar = await islem('readonly', (s) => s.getAllKeys());
    if (!anahtarlar || anahtarlar.length <= sinir) return;
    const zamanlar = await Promise.all(anahtarlar.map(async (k) => [k, (await islem<Kayit | undefined>('readonly', (s) => s.get(k)))?.at ?? 0] as const));
    for (const [k] of [...zamanlar].sort((a, b) => a[1] - b[1]).slice(0, anahtarlar.length - sinir)) await islem('readwrite', (s) => s.delete(k));
  };
  return {
    async get(k) {
      if (bellek.has(k)) return bellek.get(k);
      const r = await islem<Kayit | undefined>('readonly', (s) => s.get(k));
      return r ? r.v : null;
    },
    async put(k, v) {
      const d = await baglan();
      if (!d) { bellek.set(k, v); return; }
      await islem('readwrite', (s) => s.put({ v, at: Date.now() } satisfies Kayit, k));
      void buda();
    },
  };
}

// Ölçü aletleri Kalibrasyon'un listesidir (yalnız okuma). Tarih tesis gününün öğlesine yerleşir (Arkon'un aynı dönüşümü, vade gün
// hassasiyetindedir). Kimlik Hazırlık'takiyle aynı önekle kurulur ki alet seçimi iki ekranda aynı aleti göstersin.
const OGLE = 'T12:00';
export function kalibrasyonAletleri(c: AletListesi | undefined): OlcumAleti[] {
  return (c?.aletler ?? []).map((a) => {
    const son = a.sonKalibrasyon === null ? NaN : new Date(a.sonKalibrasyon.slice(0, 10) + OGLE).getTime();
    return {
      id: 'tmi-alet-' + String(a.id), no: a.no, type: a.tur, interval: a.periyotGun,
      status: a.kullanimDisi ? 'out' : 'ok',
      ...(Number.isFinite(son) ? { last: son } : {}),
    };
  });
}

const ses = (tur: 'ok' | 'nok') => { okutmaSesi(tur === 'ok' ? 'tamam' : 'hata'); };

// Ölçü aletlerini görme yetkisi olmayan kişide istek gönderilmez (her açılışta 403 birikmesin); alet listesi boş kalır.
export function KaliteMerkeziCizimOrtami({ children }: { children: ReactNode }) {
  const yetki = useYetki();
  const aletOkur = yetki.herhangi('sayfa.kalibrasyon', 'kalibrasyon.oku');
  const liste = useQuery({
    queryKey: ['kalite-merkezi', 'cizim-olcu-aletleri'],
    queryFn: () => api.get<AletListesi>('/olcu-aletleri'),
    enabled: aletOkur,
    staleTime: 300_000,
  });
  const onbellek = useMemo(() => cihazOnbellegi(), []);
  const aletler = useMemo(() => kalibrasyonAletleri(aletOkur ? liste.data : undefined), [aletOkur, liste.data]);
  const deger = useMemo((): CizimOrtamiDegeri => ({ onbellek, aletler, ayarlar: cihazKaydi, ses }), [onbellek, aletler]);
  return <CizimOrtami deger={deger}>{children}</CizimOrtami>;
}
