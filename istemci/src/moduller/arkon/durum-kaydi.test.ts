import { describe, expect, it } from 'vitest';
import { durumKaydiGerekir } from '../../../../arkon/web/src/data/durum-kaydi.ts';

// Y3 (ikinci tarayıcı turu): her sayfa açılışı etkin işin eski durumunu yeniden gönderiyor, TMI'ye yazılamayanlar listesine ret bırakıyordu.
describe('Arkon durum kaydı', () => {
  it('aynı işin durumu değişince gönderilir', () => {
    expect(durumKaydiGerekir({ no: 'E1', state: 'queued' }, { no: 'E1', state: 'setup' })).toBe(true);
    expect(durumKaydiGerekir({ no: 'E1', state: 'running' }, { no: 'E1', state: 'stopped' })).toBe(true);
  });
  it('yenileme ya da iş değiştirme gönderilmez: başka iş, aynı durum, ilk görüş', () => {
    expect(durumKaydiGerekir({ no: 'E1', state: 'running' }, { no: 'E2', state: 'stopped' })).toBe(false);
    expect(durumKaydiGerekir({ no: 'E2', state: 'paused' }, { no: 'E2', state: 'paused' })).toBe(false);
    expect(durumKaydiGerekir(null, { no: 'E1', state: 'stopped' })).toBe(false);
    expect(durumKaydiGerekir(undefined, { no: 'E1', state: 'paused' })).toBe(false);
  });
});
