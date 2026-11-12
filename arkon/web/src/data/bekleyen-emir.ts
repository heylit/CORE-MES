/* 3131: CORE'da bekletilen emrin (3050 a) paketi okumada `tmi.bekletme` taşır (nedenin adı; sunucu/moduller/arkon/kurallar.ts
   bekletmeAlaniniEkle). Yayın durumu değişmez: operatör listesi başlamamış işi göstermez, Hazırlık işaretler. Devamda alan düşer. */
import { tmiBitti } from './biten-is';

type BekletmeliPaket = { tmi?: object | null } | null | undefined;

// Biten emrin paketinde kayıtlı eski işaret sayılmaz.
export function tmiBekletme(paket: BekletmeliPaket): string | null {
  const tmi = (paket?.tmi ?? null) as { bekletme?: unknown; bitti?: unknown } | null;
  const b = tmi?.bekletme;
  return typeof b === 'string' && b !== '' && !tmiBitti({ tmi }) ? b : null;
}

// Başlamış iş (ayar, çalışıyor, duraklatıldı, durduruldu) operatörde kalır; başlatılamadığını ekran zaten söyler (3050 a).
export const operatordeGizli = (is: { state?: string; pkg?: BekletmeliPaket }): boolean =>
  tmiBekletme(is.pkg) !== null && (is.state ?? 'queued') === 'queued';
