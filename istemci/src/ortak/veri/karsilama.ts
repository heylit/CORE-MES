import { useQuery } from '@tanstack/react-query';
import type { KarsilamaCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { api } from './api.ts';
import { anahtarlar } from './anahtarlar.ts';

// Sekmeler arası ortak depo: karşılama oturumun ilk açılışında bir kez çıkar; yenilemede ve yeni sekmede yeniden çıkmaz.
// Oturum kalkınca `karsilamaSifirla` işareti siler. Kişiyle birlikte tesis günü de saklanır; gün değişince ilk açılışta yeniden karşılar.
const DEPO_ANAHTARI = 'tmi.karsilama';
const depoDegeri = (kisiId: number, gun: string): string => `${String(kisiId)}|${gun}`;

// Depo kapalıysa (gizli pencere, engelli site verisi) "görülmedi" sayılır: karşılama yenilemede tekrar çıkabilir, hiç kaybolmaz.
export function karsilamaGorulduMu(kisiId: number, gun: string): boolean {
  try { return window.localStorage.getItem(DEPO_ANAHTARI) === depoDegeri(kisiId, gun); } catch { return false; }
}

export function karsilamaGoruldu(kisiId: number, gun: string): void {
  try { window.localStorage.setItem(DEPO_ANAHTARI, depoDegeri(kisiId, gun)); } catch { /* depo kapalı; bileşen kendi durumunda kapalı kalır */ }
}

// Oturum kalkınca (çıkış ya da oturumsuz cevap) çağrılır, girişte değil: giriş ekranı oturumu kendi yazar, ortak `useGiris` uygulamada
// kullanılmıyor. Böylece çıkıp yeniden giren kişi de karşılanır.
export function karsilamaSifirla(): void {
  try { window.localStorage.removeItem(DEPO_ANAHTARI); } catch { /* depo kapalı */ }
}

export type KarsilamaDonemi = 'gunduz' | 'gece';

// Saat tesis saatidir (çağıran verir). İki saat aynıysa gece yoktur;
// gündüz başlangıcı geceninkinden büyükse gündüz gece yarısını aşar.
export function karsilamaDonemi(saat: number, gunduzBaslangic: number, geceBaslangic: number): KarsilamaDonemi {
  if (gunduzBaslangic === geceBaslangic) return 'gunduz';
  if (gunduzBaslangic < geceBaslangic) return saat >= gunduzBaslangic && saat < geceBaslangic ? 'gunduz' : 'gece';
  return saat >= geceBaslangic && saat < gunduzBaslangic ? 'gece' : 'gunduz';
}

// Görülmüş karşılamanın ayarı hiç sorulmaz: her sayfa yenilemesi istek atmasın.
export function useKarsilama(acik: boolean) {
  return useQuery({
    queryKey: anahtarlar.karsilama,
    queryFn: () => api.get<KarsilamaCevabi>('/karsilama'),
    enabled: acik,
    staleTime: Infinity,
  });
}
