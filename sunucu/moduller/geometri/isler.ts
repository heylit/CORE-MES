import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { geometriTuru } from './servis.ts';
import { geometriSureci } from './surec.ts';

// Tur transaction dışındadır: hesap ayrı süreçte saniyeler sürebilir, bağlantı tutulmaz. Yayına giren model en geç bir tur sonra
// kuyruğa girer (cizimler geometri'yi çağırmaz, ADR 0006).
export const isler = [
  isTanimi({ ad: 'geometri-hesap', aralikMs: 30_000, txDisi: async (vt, gunluk) => { await geometriTuru(vt, geometriSureci(), gunluk); } }),
];
