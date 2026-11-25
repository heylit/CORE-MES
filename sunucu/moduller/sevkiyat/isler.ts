import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { soforKimlikleriniTemizle } from './servis.ts';

// 3694-4 A1: şoför kimlik no'su sevk tarihinden KIMLIK_SAKLAMA_GUN gün sonra silinir; süre dolan satır saatte bir temizlenir (sunucu her gün yeniden başlasa da ilk tur kaçmasın) (anahtar gerekmez, şifreli veri silinir).
// "Bugün" sunucu saatinin UTC tarihidir; sınır gün farkı saklama süresi yanında önemsizdir.
export const isler = [
  isTanimi({
    ad: 'sevkiyat-sofor-kimligi-saklama',
    aralikMs: 3_600_000,
    calis: async (db) => { await soforKimlikleriniTemizle(db, new Date().toISOString().slice(0, 10)); },
  }),
];
