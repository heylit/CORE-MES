import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { karttanTaslaklar } from './servis.ts';

// Onaylanan kartın ilk rota taslağı kendiliğinden açılır (#688); tarama dakikada bir, rotası olan kart atlanır.
export const isler = [
  isTanimi({ ad: 'rota-karttan-taslak', aralikMs: 60_000, calis: async (db, gunluk) => { await karttanTaslaklar(db, gunluk); } }),
];
