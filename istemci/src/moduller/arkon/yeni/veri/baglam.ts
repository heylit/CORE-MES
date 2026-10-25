import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CAKISMA_ILETISI, CAKISMA_OLAYI } from '../../../../../../arkon/web/src/data/cakisma.ts';
import type { ArkonAyarlari } from '../cekirdek/ayarlar.ts';
import type { BusMsg, Perm, User } from '../cekirdek/tipler.ts';
import type { ArkonDeposu, ArkonDurumu, Ileti } from './depo.ts';

// Yeni ekranın ortak durumu: veri katmanı, oturumdaki Arkon kişisi, ayarlar, yetki ve gezinme. Kök (ArkonYeni.tsx) kurar;
// parçalar yalnız bu kancalarla okur, modül değişkeni tutmaz (eski ekrandaki PLANT, SHIFTS, POLICY gibi değişkenlerin yerine).

export type TmiHedefi = 'emir-ac' | 'plan' | 'istasyonlar';

export interface ArkonBaglami {
  depo: ArkonDeposu;
  kisi: User | null;
  ayarlar: ArkonAyarlari;
  ayarlariYenile(): void;
  yetkiVar(k: Perm): boolean;
  sayfaGorunur(sayfa: string): boolean;
  // Yeni ekranın sayfaları arasında (adres /arkon/yeni/<sayfa>[/<kimlik>]).
  git(sayfa: string, kimlik?: string): void;
  // TMI'nin öteki sayfaları; yalnız bu listedeki hedef açılır (baglanti.ts TMI_HEDEFLERI).
  tmiyeGit(hedef: TmiHedefi): void;
  // "Operatör gözüyle": paketin operatör ekranı bulunduğu sayfanın üstünde açılan pencerede, salt okunur (eski PreviewOv).
  onizle(paketId: string): void;
  // Önizlemede ("Operatör gözüyle") yazma yoktur; taşıyıcı da yazmayı TMI'ye iletmez.
  saltOkunur: boolean;
}

export const ArkonBaglamiKaynagi = createContext<ArkonBaglami | null>(null);

export function useArkon(): ArkonBaglami {
  const b = useContext(ArkonBaglamiKaynagi);
  if (b === null) throw new Error('useArkon yalnız yeni Arkon ekranının içinde kullanılır.');
  return b;
}

// Bağlantı ve gönderim kuyruğu durumu (giris-ayarlar-spc.ts useSrv).
export function useArkonDurumu(): ArkonDurumu {
  const { depo } = useArkon();
  const [durum, durumYaz] = useState(() => depo.status());
  useEffect(() => depo.onStatus(durumYaz), [depo]);
  return durum;
}

// Anlık iletiler (aynı cihazda öteki sekme ve sunucu); dönen işlev aboneliği bırakır.
export function useIleti(f: (m: Ileti) => void): void {
  const { depo } = useArkon();
  useEffect(() => depo.Bus.on(f), [depo, f]);
}

// Bir deponun bütün belgeleri; başka ekranda ya da cihazda değişince tazelenir (pano-planlama.ts useDocs).
// `hazir` ilk okuma bitince true olur; okunamayan depo boş liste verir.
export function useBelgeler<T>(depoAdi: string, ekDinle?: readonly string[]): { liste: T[]; yenile: () => void; hazir: boolean } {
  const { depo } = useArkon();
  const [liste, listeYaz] = useState<T[] | null>(null);
  const yenile = useCallback(() => { depo.DB.all(depoAdi).then((l) => listeYaz(l as T[]), () => listeYaz([])); }, [depo, depoAdi]);
  const dinlenen = ekDinle?.join('\u0000') ?? '';
  useEffect(() => {
    yenile();
    const ek = dinlenen === '' ? [] : dinlenen.split('\u0000');
    return depo.Bus.on((m) => {
      if (m.type === depoAdi || (m.store === depoAdi && (m.type === '$db' || m.type === '$merged')) || ek.includes(m.type)) setTimeout(yenile, 150);
    });
  }, [depo, depoAdi, dinlenen, yenile]);
  return { liste: liste ?? [], yenile, hazir: liste !== null };
}

// Belge yazılır ve öteki ekranlara duyurulur (putDoc, delDoc).
export async function belgeYaz(depo: ArkonDeposu, depoAdi: string, belge: { id: string }, ileti?: Omit<BusMsg, 'type'>): Promise<void> {
  await depo.DB.put(depoAdi, belge);
  depo.Bus.send({ type: depoAdi, id: belge.id, ...(ileti ?? {}) });
}
export async function belgeSil(depo: ArkonDeposu, depoAdi: string, kimlik: string): Promise<void> {
  await depo.DB.del(depoAdi, kimlik);
  depo.Bus.send({ type: depoAdi, id: kimlik, del: true });
}

// Şimdiki zaman, verilen aralıkla tazelenir (temel.ts useNow).
export function useSimdi(ms = 1000): number {
  const [simdi, simdiYaz] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => simdiYaz(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return simdi;
}

// Aynı belge başka cihazda da değişti ve alanlar birleştirildi: kullanıcıya söylenir (pano-planlama.ts useToast).
export function useCakismaUyarisi(bildir: (ileti: string) => void): void {
  useEffect(() => {
    const f = (e: Event) => { bildir((e as CustomEvent<{ msg?: string }>).detail?.msg || CAKISMA_ILETISI); };
    window.addEventListener(CAKISMA_OLAYI, f);
    return () => window.removeEventListener(CAKISMA_OLAYI, f);
  }, [bildir]);
}
