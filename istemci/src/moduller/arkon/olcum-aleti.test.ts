import { describe, expect, it } from 'vitest';
import { aletGecerliMi, olcumAletDamgasi, secilebilirAletler, seciliAlet } from '../../ortak/cizim/cekirdek/olcum-aleti.ts';

// 150 a: ölçüm ölçü aletiyle girilir; kalibrasyonu geçmiş, kayıtsız ya da kullanım dışı alet seçilemez.
describe('ölçü aleti seçimi', () => {
  const GUN = 864e5, simdi = 1000 * GUN;
  const kumpas = { id: 'tmi-alet-1', no: 'K-2', type: 'Kumpas', last: simdi - 10 * GUN, interval: 365 };
  const kumpasEski = { id: 'tmi-alet-2', no: 'K-1', type: 'Kumpas', last: simdi - 400 * GUN, interval: 365 };
  const kumpasDisi = { id: 'tmi-alet-3', no: 'K-3', type: 'Kumpas', last: simdi - 10 * GUN, interval: 365, status: 'out' };
  const kayitsiz = { id: 'tmi-alet-4', no: 'K-4', type: 'Kumpas', interval: 365 };
  const mikrometre = { id: 'tmi-alet-5', no: 'M-1', type: 'Mikrometre', last: simdi - 10 * GUN, interval: 365 };
  const aletler = [kumpas, kumpasEski, kumpasDisi, kayitsiz, mikrometre];

  it('geçerlilik: vadesi geçmiş, kayıtsız ve kullanım dışı alet geçersiz', () => {
    expect([kumpas, kumpasEski, kumpasDisi, kayitsiz].map((g) => aletGecerliMi(g, simdi))).toEqual([true, false, false, false]);
  });

  it('kontrol planındaki alet türüne uyan geçerli aletler; uyan yoksa bütün geçerli aletler', () => {
    expect(secilebilirAletler(aletler, 'kumpas', simdi).map((g) => g.no)).toEqual(['K-2']);
    expect(secilebilirAletler(aletler, 'Dijital mikrometre', simdi).map((g) => g.no)).toEqual(['M-1']);
    expect(secilebilirAletler(aletler, 'Pim mastar', simdi).map((g) => g.no)).toEqual(['K-2', 'M-1']);
  });

  it('seçili alet geçerliliğini yitirince seçim düşer; damga kimlik ve no taşır', () => {
    expect(seciliAlet(aletler, 'Kumpas', 'tmi-alet-1', simdi)).toBe(kumpas);
    expect(seciliAlet(aletler, 'Kumpas', 'tmi-alet-2', simdi)).toBeNull();
    expect(seciliAlet(aletler, 'Kumpas', 'tmi-alet-1', simdi + 400 * GUN)).toBeNull();
    expect(olcumAletDamgasi(kumpas)).toEqual({ gid: 'tmi-alet-1', gno: 'K-2' });
  });
});
