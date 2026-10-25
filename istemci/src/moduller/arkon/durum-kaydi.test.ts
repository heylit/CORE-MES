import { describe, expect, it } from 'vitest';
import { durumBaslangici, durumKaydiGerekir } from '../../../../arkon/web/src/data/durum-kaydi.ts';

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

  it('T3: süre işin son durum kaydının anından; son kayıt başka durumdaysa (gitmemiş) ya da kayıt yoksa bilinmez', () => {
    const kayitlar = [{ state: 'running', at: 1000 }, { state: 'paused', at: 2000 }, { state: 'running', at: 3000 }];
    expect(durumBaslangici(kayitlar, 'running')).toBe(3000);
    expect(durumBaslangici([...kayitlar].reverse(), 'running')).toBe(3000);
    expect(durumBaslangici(kayitlar, 'paused')).toBeNull();
    expect(durumBaslangici([], 'running')).toBeNull();
    expect(durumBaslangici([{ state: 'running', at: 'dun' }], 'running')).toBeNull();
  });
});
