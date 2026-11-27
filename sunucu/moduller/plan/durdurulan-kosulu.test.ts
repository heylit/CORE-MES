import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import vm from 'node:vm';
import { motorKodu } from './plan-motoru.ts';

// 3803 N4: "durdur, kalanı taşı" işareti (w.durdurulan) sahada süren adımda etkisizdir. Sahada süren: sunucu kaydı, başlamış (S) ve bitişsiz;
// motor girdisi (stKur) Kokpit taşıması (tasima.ts) ve taslak kuralıyla (taslak-kurallar.ts) aynı koşulu kullanır. Veriler uydurmadır.
type Kayit = Record<string, unknown>;
function stKur(S: unknown): { gercek: Record<string, Kayit>; D: { opAdet?: Record<string, number> } } {
  const b = vm.createContext({}); b['self'] = b;
  vm.runInContext(motorKodu(), b);
  return (vm.runInContext('stKur', b) as (S: unknown) => { gercek: Record<string, Kayit>; D: { opAdet?: Record<string, number> } })(S);
}
const calisma = (gercek: Record<string, Kayit>) => ({
  w: { famK: 0.3, mat: 'uyari', dondurma: 4, durdurulan: { 'S1.10': 1 } }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
  down: [], ekMesai: [], locks: {}, gercek, kapali: [],
  D: { meta: { baslangic: '2026-01-05' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], ayarlar: {}, siparisler: [{ id: 'S1', urun: 'U', adet: 10 }] },
});

describe('3803 N4: durdurulan işaretinin sahada süren koşulu', () => {
  test('sunucu kaydı başlamış ve bitişsizse işaret etkisiz, gerçekleşen yerinde kalır', () => {
    const st = stKur(calisma({ 'S1.10': { m: 'T1', S: 9, kalan: 2, A: 10, n: 4, sunucu: 1 } }));
    assert.ok(st.gercek['S1.10']);
    assert.equal(st.D.opAdet?.['S1.10'], undefined);
  });
  test('sunucu kaydının başlangıcı yoksa sahada süren sayılmaz: işaret uygulanır, kalan adet dizilir', () => {
    const st = stKur(calisma({ 'S1.10': { m: 'T1', S: null, kalan: 2, A: 10, n: 4, sunucu: 1 } }));
    assert.equal(st.gercek['S1.10'], undefined);
    assert.equal(st.D.opAdet?.['S1.10'], 6);
  });
  test('sunucusuz (elle girilmiş) bitişsiz kayıtta işaret uygulanır; bitmiş kayıtta etkisiz', () => {
    assert.equal(stKur(calisma({ 'S1.10': { m: 'T1', S: 9, A: 10, n: 4 } })).D.opAdet?.['S1.10'], 6);
    assert.ok(stKur(calisma({ 'S1.10': { m: 'T1', S: 9, C: 12, A: 10, n: 4 } })).gercek['S1.10']);
  });
});
