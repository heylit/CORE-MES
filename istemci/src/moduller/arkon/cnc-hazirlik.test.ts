import { describe, expect, it } from 'vitest';
import { CNC_HAZIRLIK_BAGI_ACIK, hazirlikUyarisi } from '../../../../arkon/web/src/data/cnc-hazirlik.ts';

// Kullanıcı kararı 16.10: terminal CNC hazırlığı tamamlanmamış işte uyarır, işi kilitlemez. Kart 747: bağ şimdilik pasif.
describe('CNC hazırlık uyarısı', () => {
  it('bağ pasifken sunucu hazırlık eksiği yazsa da uyarı yok', () => {
    expect(CNC_HAZIRLIK_BAGI_ACIK).toBe(false);
    for (const h of ['yok', 'suruyor', 'tamam']) expect(hazirlikUyarisi({ tmi: { hazirlik: h } })).toBeNull();
  });

  it('bağ açıkken sunucunun yazdığı hazırlık eksiğine göre metin; eksik yoksa ya da paket TMI dışıysa uyarı yok', () => {
    expect(hazirlikUyarisi({ tmi: { hazirlik: 'yok' } }, true)).toBe('CNC hazırlığı tamamlanmadı · kurulumda onay yok');
    expect(hazirlikUyarisi({ tmi: { hazirlik: 'suruyor' } }, true)).toBe('CNC hazırlığı tamamlanmadı · kurulum sürüyor');
    for (const p of [{ tmi: {} }, { tmi: { hazirlik: 'tamam' } }, { tmi: null }, {}, null, undefined]) expect(hazirlikUyarisi(p, true)).toBeNull();
  });
});
