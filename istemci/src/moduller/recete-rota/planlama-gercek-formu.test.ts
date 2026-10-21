import { describe, expect, it } from 'vitest';
import { planlamaParcasi } from './planlama-derle.ts';

// Gerçekleşen formu (t-tekyer) sayfanın geri kalanı yerine küçük taklitlerle koşar. Veriler uydurmadır.
function gercekFormu(gercek: Record<string, unknown> | null): string {
  const govde = `
    const S = { D: {}, gercek: ${JSON.stringify(gercek)}, olaylar: [], plan: { ops: {} }, w: {} };
    const yetkili = () => true; const ic = (a) => '[' + a + ']'; const esc = (x) => String(x);
    const isoT = () => '2026-10-21 08:00'; const fmtDT = () => '21.10 08:00'; const sayi = (x) => String(x);
    const dugme = (ad) => '<button>' + ad + '</button>';
    const ilerlemeCubugu = () => ''; const sapmaKutu = () => '';
    const tezgahAd = (cx, m) => m + ' · ' + cx.M[m].ad;
    const cxAl = () => ({ st: { now: 10 }, M: { T1: { ad: 'Torna 1' } }, byId: { 'j1.10': { c: [{ m: 'T1', run: 2 }] } } });
    ${planlamaParcasi('t-tekyer')}
    return gercekFormu;`;
  const yok = (): void => undefined;
  const fn = new Function('document', 'addEventListener', govde)({ addEventListener: yok }, yok) as (r: Record<string, unknown>) => string;
  return fn({ id: 'j1.10', m: 'T1', S: 8, C: 12 });
}

describe('gerçekleşen formu', () => {
  it('tezgâhı planın atadığı tezgâh olarak kilit simgesiyle gösterir (393 d)', () => {
    const h = gercekFormu(null);
    expect(h).toContain('data-yer="gercek-tezgah"');
    expect(h).toContain('[lock] Tezgâh: <b>T1 · Torna 1</b>; gerçekleşen planın atadığı bu tezgâha yazılır.');
  });

  it('gerçekleşen girilmişken de tezgâh satırı vardır', () => {
    expect(gercekFormu({ 'j1.10': { m: 'T1', S: 8 } })).toContain('Tezgâh: <b>T1 · Torna 1</b>');
  });
});
