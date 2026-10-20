import { describe, expect, it } from 'vitest';
import { depoOkunur } from '../../../../arkon/web/src/data/depo-okuma.ts';

// B-005 (kart #199): sunucu ölçü aleti, bakım ve çizim depolarını rol başına okutur. Okuyamayan rolün tableti isteği hiç atmamalı
// (operatör her açılışta ölçü aletleri için 403 alıyordu). Sunucu kuralıyla eşitliği: sunucu/moduller/arkon/kurallar.test.ts.
describe('Arkon depo okuma', () => {
  it('operatör ölçü aletlerini, bakımı ve çizimleri istemez', () => {
    expect(depoOkunur('gauges', 'operator')).toBe(false);
    expect(depoOkunur('maint', 'operator')).toBe(false);
    expect(depoOkunur('draws', 'operator')).toBe(false);
    expect(depoOkunur('pkgs', 'operator')).toBe(true);
  });
  it('girişsiz cihaz ve rolsüz kullanıcı süzülmez (sunucu yine karar verir)', () => {
    expect(depoOkunur('gauges', undefined)).toBe(true);
  });
});
