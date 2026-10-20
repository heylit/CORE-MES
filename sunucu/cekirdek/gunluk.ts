import { vtHataIzi } from './db.ts';

// Modülün günlüğü: uç işleyicisi ve zamanlanmış iş, yakalayıp sürdürdüğü hatayı buradan yazar (yutulan hata görünmez kalmasın).
export interface Gunluk {
  uyar(mesaj: string, hata?: unknown): void;
  hata(mesaj: string, hata?: unknown): void;
}

export interface GunlukNesnesi {
  err?: unknown;
  [alan: string]: unknown;
}

// Fastify ve pino günlüğünün kullanılan yüzü; test sahte günlük verir.
export interface HamGunluk {
  warn(nesne: GunlukNesnesi, mesaj: string): void;
  error(nesne: GunlukNesnesi, mesaj: string): void;
}

// Veritabanı hatası istek sınırındaki süzgeçten geçer: ham hata satır ve girdi değerini taşır. Bağlam (uç ya da iş adı) her satıra
// eklenir. Günlüğe yazılamaması işi düşürmez: günlük, yazdığı işin sonucunu değiştirmez.
export function gunlukKur(ham: HamGunluk, baglam: Readonly<Record<string, string>>): Gunluk {
  const yaz = (duzey: 'warn' | 'error', mesaj: string, hata: unknown): void => {
    const nesne: GunlukNesnesi = hata === undefined ? { ...baglam } : { ...baglam, err: vtHataIzi(hata) ?? hata };
    try {
      ham[duzey](nesne, mesaj);
    } catch {
      // Günlüğe yazılamaması işi durdurmaz.
    }
  };
  return {
    uyar: (mesaj, hata) => { yaz('warn', mesaj, hata); },
    hata: (mesaj, hata) => { yaz('error', mesaj, hata); },
  };
}
