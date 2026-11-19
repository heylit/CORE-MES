import { inspect } from 'node:util';
import { vtHataIzi } from './db.ts';

export interface HataGunlugu {
  error(nesne: { err: unknown }, mesaj: string): void;
}

export interface RetKaynagi {
  on(olay: 'unhandledRejection', dinleyici: (sebep: unknown) => void): unknown;
}

export function yakalanmamisRetYaz(gunluk: HataGunlugu, sebep: unknown): void {
  // Veritabanı hatası istek sınırındaki süzgeçten geçer: ham hata satır ve girdi değerini taşır.
  const err = vtHataIzi(sebep) ?? sebep;
  try {
    gunluk.error({ err }, 'Yakalanmamış söz reddi');
  } catch (hata) {
    // Dinleyiciden çıkan hata yakalanmamış istisna olur ve süreci düşürür.
    // Günlükleyicinin kendisi düşmüştür; son çare olarak standart hataya düz satır yazılır.
    process.stderr.write(`Yakalanmamış söz reddi günlüğe yazılamadı: ${inspect(hata)} | ${inspect(err)}\n`);
  }
}

// Dinleyici yokken Node yakalanmamış rette süreci düşürür: tek bir işleyicinin unutulmuş söz zinciri
// bütün sunucuyu indirir. Yakalanmamış istisna bilerek dinlenmez; ondan sonra süreç durumu güvenilmezdir.
export function yakalanmamisRetiDinle(kaynak: RetKaynagi, gunluk: HataGunlugu): void {
  kaynak.on('unhandledRejection', (sebep) => { yakalanmamisRetYaz(gunluk, sebep); });
}

// Sunucunun kendi isteğiyle kapanması (ekrandan yeniden başlatma): ana.ts kapanış işini kaydeder, modül yalnız ister. Süreci yeniden
// açan bekçidir (araclar/bekci.ts); kayıt yoksa (testler, ana.ts dışı açılış) istek kabul edilmez.
type KapanisIsi = (neden: string) => void;
let kapanisIsi: KapanisIsi | null = null;

export function kapanisIsiKur(is: KapanisIsi | null): void {
  kapanisIsi = is;
}

export function kapanisKurulu(): boolean {
  return kapanisIsi !== null;
}

export function kapanisIste(neden: string): boolean {
  if (kapanisIsi === null) return false;
  kapanisIsi(neden);
  return true;
}
