import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { hatirlatmalariYenile } from './servis.ts';

// 2432: hatırlatmalar 15 dakikada bir yenilenir; iz satin_alma_hatirlatma'dadır (açılış, kapanış) ve bildirim kaydındadır.
export const isler = [
  isTanimi({ ad: 'satin-alma-hatirlatma', aralikMs: 15 * 60_000, calis: async (db) => { await hatirlatmalariYenile(db); } }),
];
