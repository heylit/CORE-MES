import { describe, expect, it } from 'vitest';
import { hazirlikUyarisi } from '../../../../arkon/web/src/data/cnc-hazirlik.ts';

// Kullanıcı kararı 16.10: terminal CNC hazırlığı tamamlanmamış işte uyarır, işi kilitlemez.
describe('CNC hazırlık uyarısı', () => {
  it('sunucunun yazdığı hazırlık eksiğine göre metin; eksik yoksa ya da paket TMI dışıysa uyarı yok', () => {
    expect(hazirlikUyarisi({ tmi: { hazirlik: 'yok' } })).toBe('CNC hazırlığı tamamlanmadı · kurulumda onay yok');
    expect(hazirlikUyarisi({ tmi: { hazirlik: 'suruyor' } })).toBe('CNC hazırlığı tamamlanmadı · kurulum sürüyor');
    for (const p of [{ tmi: {} }, { tmi: { hazirlik: 'tamam' } }, { tmi: null }, {}, null, undefined]) expect(hazirlikUyarisi(p)).toBeNull();
  });
});
