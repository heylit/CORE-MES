import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AcilisTuru, GecisHizi, GorunumCevabi, HareketSeviyesi } from '#paylasilan/sozlesme/ayarlar.ts';
import { api } from './api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Hareket dili ve açılış kurumun ayarıdır (Sistem Ayarları); kabuk her oturumda bir kez okur.
export function useGorunum(acik: boolean) {
  return useQuery({
    queryKey: anahtarlar.gorunum,
    queryFn: async () => {
      const g = await api.get<GorunumCevabi>('/gorunum').catch((hata: unknown) => {
        // Ayar okunamazsa bekleyen giriş gösterisi oynamaz; karşılama onu sonsuza dek beklemesin.
        bekleyenGirisiBirak();
        throw hata;
      });
      gorunumuSakla(g);
      bekleyenGirisiOynat(g);
      return g;
    },
    enabled: acik,
    staleTime: Infinity,
  });
}

// Performans modu cihaza aittir (zayıf tablet, eski bilgisayar): açıkken hareket sade, açılış ve süren animasyonlar kapalıdır.
// Hiç seçilmemişse cihazdan tahmin edilir. Arkon aynı tercihi kendi anahtarından okur; ikisi tek düğmeden yazılır.
export const PERFORMANS_ANAHTARI = 'tmi-performans';
const ARKON_ANAHTARI = 'arkon:lite';

export function performansTahmini(): boolean {
  const n = navigator.hardwareConcurrency || 8;
  const bellek = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return n <= 4 || bellek <= 3;
}

let gecerli: boolean | null = null;
const dinleyenler = new Set<() => void>();

function okunan(): boolean {
  try {
    const kayit = localStorage.getItem(PERFORMANS_ANAHTARI);
    if (kayit === 'acik') return true;
    if (kayit === 'kapali') return false;
  } catch { /* depolama kapalı: tahmin */ }
  return performansTahmini();
}

export function performansOku(): boolean {
  if (gecerli === null) gecerli = okunan();
  return gecerli;
}

export function performansYaz(acik: boolean): void {
  gecerli = acik;
  try {
    localStorage.setItem(PERFORMANS_ANAHTARI, acik ? 'acik' : 'kapali');
    localStorage.setItem(ARKON_ANAHTARI, JSON.stringify(acik));
  } catch { /* depolama kapalı: bu sekmede bellekte kalır */ }
  for (const d of dinleyenler) d();
}

const abone = (d: () => void): (() => void) => { dinleyenler.add(d); return () => { dinleyenler.delete(d); }; };

export function usePerformans(): [boolean, () => void] {
  const acik = useSyncExternalStore(abone, performansOku);
  const degistir = useCallback(() => { performansYaz(!performansOku()); }, []);
  return [acik, degistir];
}

// Kök öğe seviyeyi taşır; CSS tasarım değişkenleri buna göre süre ve eğri verir. Performans modunda seviye en çok sadedir; kapalı kapalı kalır.
export function etkinHareket(hareket: HareketSeviyesi, performans: boolean): HareketSeviyesi {
  return performans && hareket !== 'kapali' ? 'sade' : hareket;
}

export function useHareketUygula(hareket: HareketSeviyesi | undefined, gecisHizi: GecisHizi | undefined): void {
  const [performans] = usePerformans();
  useEffect(() => {
    const kok = document.documentElement;
    kok.setAttribute('data-hareket', etkinHareket(hareket ?? 'orta', performans));
    kok.setAttribute('data-gecis-hizi', gecisHizi ?? 'normal');
    if (performans) kok.setAttribute('data-performans', ''); else kok.removeAttribute('data-performans');
  }, [hareket, gecisHizi, performans]);
}

export type OynanacakAcilis = Exclude<AcilisTuru, 'yok' | 'rastgele'>;
export const OYNANACAK_ACILISLAR: readonly OynanacakAcilis[] = ['tezgah', 'talas', 'lazer', 'cmm', 'dokum', '3b'];

// Rastgele her oturumda listeden birini seçer; kapalı ya da performans modunda açılış yoktur.
export function acilisSec(tur: AcilisTuru, performans: boolean, zar: () => number = Math.random): OynanacakAcilis | null {
  if (performans || tur === 'yok') return null;
  if (tur === 'rastgele') return OYNANACAK_ACILISLAR[Math.min(OYNANACAK_ACILISLAR.length - 1, Math.floor(zar() * OYNANACAK_ACILISLAR.length))] ?? null;
  return tur;
}

// Yalnız testler için.
export function performansiSifirla(): void { gecerli = null; }

// Açılış gösterisi girişte ve çıkışta tam o anda oynar: giriş düğmesi oturumu aldığında ve çıkış düğmesine basıldığında.
// Sayfa yenileme ya da oturumu süren yeni sekme giriş değildir, gösteri oynamaz. Tek gösteri vardır; yenisi eskisinin yerine geçer.
export type Gosteri = { sira: number; tur: AcilisTuru; sure: number | null; logo: string | null; kabukGirer: boolean };
let gosteri: Gosteri | null = null;
let gosteriSirasi = 0;
const gosteriDinleyenleri = new Set<() => void>();
const gosteriDuyur = (): void => { for (const d of gosteriDinleyenleri) d(); };

export function gosteriKur(tur: AcilisTuru, sure: number | null, logo: string | null, kabukGirer: boolean): void {
  if (tur === 'yok') return;
  gosteriSirasi += 1;
  gosteri = { sira: gosteriSirasi, tur, sure, logo, kabukGirer };
  gosteriDuyur();
}

export const gosteriBitir = (): void => { if (gosteri !== null) { gosteri = null; gosteriDuyur(); } };
const gosteriAbone = (d: () => void): (() => void) => { gosteriDinleyenleri.add(d); return () => { gosteriDinleyenleri.delete(d); }; };

export function useGosteri(): [Gosteri | null, () => void] {
  return [useSyncExternalStore(gosteriAbone, () => gosteri), gosteriBitir];
}

// Gösteri oynarken ya da giriş gösterisi ayarı beklerken doğrudur. Karşılama mesajı bunu bekler: önce açılış, sonra
// "hoş geldin" (kullanıcı isteği, 2026-10-15). Açılış kapalı, performans modu ya da hareket azaltılmışsa gösteri hiç
// kurulmaz ya da hemen biter; karşılama beklemeden gelir.
export const gosteriSuruyor = (): boolean => gosteri !== null || bekleyenGiris !== null;
export function useGosteriSuruyor(): boolean {
  return useSyncExternalStore(gosteriAbone, gosteriSuruyor);
}

// /gorunum yalnız oturumla okunur; giriş anında beklemeden oynamak için son okunan açılış ayarı cihazda tutulur.
// Yalnız gösterinin türü ve süresidir, kişiye ya da kuruma ait bilgi taşımaz. Cihaz ilk kez giriyorsa ayar gelince oynar.
const GORUNUM_DEPOSU = 'tmi.gorunum';
type AcilisAyari = Pick<GorunumCevabi, 'acilis' | 'acilisSuresi'>;

export function gorunumuSakla(g: GorunumCevabi): void {
  try { localStorage.setItem(GORUNUM_DEPOSU, JSON.stringify({ acilis: g.acilis, acilisSuresi: g.acilisSuresi })); } catch { /* depo kapalı */ }
}

function saklananAcilis(): AcilisAyari | null {
  try {
    const ham: unknown = JSON.parse(localStorage.getItem(GORUNUM_DEPOSU) ?? 'null');
    if (typeof ham !== 'object' || ham === null) return null;
    const { acilis, acilisSuresi } = ham as Record<string, unknown>;
    if (typeof acilis !== 'string' || !['yok', 'rastgele', ...OYNANACAK_ACILISLAR].includes(acilis)) return null;
    return { acilis: acilis as AcilisTuru, acilisSuresi: typeof acilisSuresi === 'number' ? acilisSuresi : null };
  } catch { return null; }
}

let bekleyenGiris: string | null = null;

// Giriş ekranı oturumu yazmadan hemen önce çağırır; kabuk gösterinin arkasında kurulur.
export function girisGosterisiBaslat(logo: string): void {
  bekleyenGiris = null;
  const ayar = saklananAcilis();
  if (ayar === null) { bekleyenGiris = logo; gosteriDuyur(); return; }
  gosteriKur(ayar.acilis, ayar.acilisSuresi, logo, true);
}

function bekleyenGirisiBirak(): void {
  if (bekleyenGiris === null) return;
  bekleyenGiris = null;
  gosteriDuyur();
}

// Cihazda saklı ayar yoksa giriş gösterisi ayar ilk gelince oynar.
export function bekleyenGirisiOynat(g: GorunumCevabi): void {
  if (bekleyenGiris === null) return;
  const logo = bekleyenGiris;
  bekleyenGiris = null;
  gosteriKur(g.acilis, g.acilisSuresi, logo, true);
  // Açılış kapalıysa gösteri kurulmaz; bekleme bittiğini dinleyenler yine duymalı.
  if (gosteri === null) gosteriDuyur();
}
