import type { STOK_ISLEMLERI } from '#paylasilan/islemler/stok.ts';

// Kart listesi stok okumasıdır (stok ST5 a: stok sayfası ya da bir stok işlemi). Stok bu modülün disari.ts'ini okuduğu için stok
// istemcisi ithal edilemez (modül döngüsü); liste burada yazılır, eksik işlem tip denetiminde yakalanır.
const STOK_OKUMA = ['sayfa.stok', 'stok.giris', 'stok.cikis', 'stok.transfer', 'stok.sayim', 'stok.tanim', 'stok.geri-al', 'stok.toplama', 'stok.statu-degistir'] as const;
const stokOkumaTam: [Exclude<(typeof STOK_ISLEMLERI)[number], (typeof STOK_OKUMA)[number]>] extends [never] ? true : never = true;
export const stokOkur = (islemler: readonly string[]): boolean => stokOkumaTam && islemler.some((i) => (STOK_OKUMA as readonly string[]).includes(i));
