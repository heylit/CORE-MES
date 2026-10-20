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
    console.error('Yakalanmamış söz reddi günlüğe yazılamadı:', hata, err);
  }
}

// Dinleyici yokken Node yakalanmamış rette süreci düşürür: tek bir işleyicinin unutulmuş söz zinciri
// bütün sunucuyu indirir. Yakalanmamış istisna bilerek dinlenmez; ondan sonra süreç durumu güvenilmezdir.
export function yakalanmamisRetiDinle(kaynak: RetKaynagi, gunluk: HataGunlugu): void {
  kaynak.on('unhandledRejection', (sebep) => { yakalanmamisRetYaz(gunluk, sebep); });
}
