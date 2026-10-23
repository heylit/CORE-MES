import { describe, expect, it } from 'vitest';
import { CAGRI_GERIYE_MS, acikCagri, cagriyiKur } from '../../../../arkon/web/src/data/acik-cagri.ts';

// 15.4: istasyon değiştirip dönünce açık ayarcı çağrısı terminalde yeniden görünür; kapanan, başka makinenin ve eski çağrı gelmez.
describe('açık çağrı kayıttan yeniden kurulur', () => {
  const simdi = 1_800_000_000_000;
  const t0 = simdi - 60_000;
  const ac = { callId: String(t0), team: 'ayarci', phase: 'open', at: t0, machine: 'IS-1', userName: 'Op', note: 'Program' };

  it('açık çağrı döner; üstlenilmişse üstlenen ve zamanıyla', () => {
    expect(acikCagri([ac], 'IS-1', simdi)).toEqual({ t0, ekip: 'ayarci', ack: null, ustlenen: null, esc: false, not: 'Program' });
    const ack = { callId: String(t0), team: 'ayarci', phase: 'ack', at: t0 + 5000, machine: 'IS-1', userName: 'Ayarcı A' };
    expect(acikCagri([ac, ack], 'IS-1', simdi)).toMatchObject({ ack: t0 + 5000, ustlenen: 'Ayarcı A' });
  });

  it('kapanan, başka makinenin, ekibi bilinmeyen ve vardiyadan eski çağrı gelmez; birden çok açıksa en yenisi', () => {
    expect(acikCagri([ac, { ...ac, phase: 'done', at: t0 + 1 }], 'IS-1', simdi)).toBeNull();
    expect(acikCagri([ac], 'IS-2', simdi)).toBeNull();
    expect(acikCagri([{ ...ac, team: '' }], 'IS-1', simdi)).toBeNull();
    const eski = simdi - CAGRI_GERIYE_MS - 1;
    expect(acikCagri([{ ...ac, callId: String(eski), at: eski }], 'IS-1', simdi)).toBeNull();
    const yeni = { ...ac, callId: String(t0 + 10), team: 'bakim' };
    expect(acikCagri([ac, yeni], 'IS-1', simdi)?.ekip).toBe('bakim');
  });

  it('üst çubuk biçimi: üstlenilmemiş aşama 0, üstlenilmiş aşama 1', () => {
    const ekip = { k: 'ayarci', l: 'Ayarcı' };
    const bekleyen = cagriyiKur(ekip, { t0, ekip: 'ayarci', ack: null, ustlenen: null, esc: true, not: null });
    expect(bekleyen).toMatchObject({ k: 'ayarci', t0, stage: 0, who: null, esc: true, times: [t0] });
    expect(bekleyen.msgs).toEqual([{ from: 'sys', text: 'Ayarcı ekibine iletildi', at: t0 }]);
    const alinan = cagriyiKur(ekip, { t0, ekip: 'ayarci', ack: t0 + 5, ustlenen: 'A', esc: false, not: 'x' });
    expect(alinan).toMatchObject({ stage: 1, who: 'A', times: [t0, t0 + 5] });
    expect(alinan.msgs[1]).toEqual({ from: 'them', text: 'A çağrıyı aldı · geliyor', at: t0 + 5 });
  });
});
