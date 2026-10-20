import type { AnaSayfaKarti } from '../../ortak/rota/ana-sayfa.ts';

// Sistem durumu ve zamanlanmış işler hiçbir rolün ana sayfasında durmaz (kullanıcı kararı 15.10.2026): pano iş içindir.
// Arkadaki işler ve sağlık ucu çalışmaya devam eder; ekran (SistemDurumu) yeni yerini bekler.
export const anaSayfaKartlari: AnaSayfaKarti[] = [];
