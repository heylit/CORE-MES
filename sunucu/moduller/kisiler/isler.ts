import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { cikisiGelenleriPasifeAl } from './servis.ts';

// İK'daki çıkış tarihi gelen kişi saatte bir pasife alınır (1302 a, 1315); gün dönümü en geç bir saat sonra işler.
// Son yönetici pasife alınmaz: günlüğe yazılır, iş sonraki turda yeniden dener.
export const isler = [
  isTanimi({
    ad: 'kisiler-cikis-pasif',
    aralikMs: 3_600_000,
    calis: async (db, gunluk) => {
      const { sonYonetici } = await cikisiGelenleriPasifeAl(db);
      if (sonYonetici.length > 0) {
        gunluk.uyar(`Çıkış tarihi geçen ${String(sonYonetici.length)} kişi son yönetici olduğu için pasife alınmadı (kişi no: ${sonYonetici.join(', ')}).`);
      }
    },
  }),
];
