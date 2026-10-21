import { describe, expect, it } from 'vitest';
import { planlamaMotoru, planlamaParcasi } from './planlama-derle.ts';

// 31 a: sayfanın "şimdi"si yalnız yeniden planlamada gerçek saate geçer; açılışta ve çizimde değişmez. 36 a: başlangıç günü yeniden
// planlamada bugüne kayar. Motor, zz27, zz34 ve zz31 gerçek; sayfanın geri kalanı küçük taklit. Veriler uydurmadır.

interface Duzenek { st: () => { now: number }; coz: (kip: string) => void; S: () => Record<string, unknown>; cozumler: string[]; bildirimler: string[]; izler: string[]; geri: () => number[] }

function duzenek(baslangic: string, simdi: number, yetki = true): Duzenek {
  const govde = `
    let S = null; let U = { sayfa: 'tahta', hamle: 'h' }; const bildirimler = []; const cozumler = []; const izler = [];
    const geriAl = ['g']; const planGeri = ['p']; const planGuncel = () => !!(S.plan && S.plan.dataVer === S.dataVer);
    const RR = { el: null }; const SAYFA_AD = {}; const VERI = {}; let hsKaynak = null; let rrYerlestir = null; let calisan = null;
    const rrMi = s => typeof s === 'string' && s.startsWith('rr-');
    const sayi = (x, n) => Number(x).toFixed(n); const saat = x => sayi(x, 1) + ' sa'; const esc = x => String(x); const ic = a => '[' + a + ']';
    const dugme = () => ''; const yetkili = () => ${String(yetki)};
    function bildir(m) { bildirimler.push(m); } function iz(ne, a) { izler.push(ne + ': ' + a); }
    function kaydet() {} function render() {} function ozetTazele() {}
    function yukle() { return null; }
    function yeniCalisma() { return { D: { meta: { baslangic: '${baslangic}' } }, dataVer: 1, plan: { dataVer: 1, ops: { 'O1.10': { S: 1400, C: 1410 } } }, gercek: {} }; }
    function stOf() { return { now: 7 }; }
    function coz(kip) { cozumler.push(kip + '@' + stOf().now); }
    let tekEylem = () => false;
    const cxAl = () => null;
    ${planlamaMotoru()}
    ${planlamaParcasi('zz27-rr-veri')}
    ${planlamaParcasi('zz34-adet-sayim')}
    ${planlamaParcasi('zz31-tmi')}
    S = yeniCalisma();
    return { st: () => stOf(), coz: k => coz(k), S: () => S, cozumler, bildirimler, izler, geri: () => [geriAl.length, planGeri.length, U.hamle === null ? 0 : 1] };`;
  const localStorage = { getItem: () => null, setItem: () => undefined };
  const window = { tmi: { kaynakOku: () => new Promise(() => undefined) }, tmiGorunum: { kaydet: () => undefined, bildir: () => undefined } };
  const belge = { addEventListener: () => undefined, visibilityState: 'visible' };
  const Tarih = class extends Date { static override now(): number { return simdi; } };
  return new Function('window', 'localStorage', 'console', 'document', 'Date', govde)(window, localStorage, { error: () => undefined }, belge, Tarih) as Duzenek;
}

const an = (gun: string, saat: number, dk = 0): number => { const [y, a, g] = gun.split('-').map(Number); return new Date(y ?? 0, (a ?? 1) - 1, g ?? 1, saat, dk).getTime(); };

describe('sayfanın şimdisi (31 a)', () => {
  it('açılışta ve çizimde başlangıç günü 07:00 kalır; yeniden planlamada gerçek saate (çeyrek saate) geçer ve sonra çizimde de o kalır', () => {
    const d = duzenek('2026-10-19', an('2026-10-21', 10, 40));
    expect(d.st().now).toBe(7);
    expect(d.S()['simdi']).toBeUndefined();
    d.coz('sifir');
    expect(d.cozumler).toEqual(['sifir@58.5']);
    expect(d.S()['simdi']).toBe(58.5);
    expect(d.st().now).toBe(58.5);
    expect(d.bildirimler).toEqual([]);
  });

  it('gerçek saat 07:00 öncesiyse ya da yetki yoksa şimdi değişmez', () => {
    const e = duzenek('2026-10-21', an('2026-10-21', 6));
    e.coz('sifir');
    expect(e.st().now).toBe(7);
    const y = duzenek('2026-10-19', an('2026-10-21', 10), false);
    y.coz('sifir');
    expect(y.st().now).toBe(7);
  });

  it('başlangıç yedi gün eskiyse yeniden planlamada bugüne kayar: saatler birlikte kayar, plan güncel kalır, geri alma boşalır', () => {
    const d = duzenek('2026-08-24', an('2026-10-21', 10));
    d.coz('sifir');
    const S = d.S() as { D: { meta: { baslangic: string } }; dataVer: number; plan: { dataVer: number; ops: Record<string, { S: number; C: number }> }; simdi: number };
    expect(S.D.meta.baslangic).toBe('2026-10-21');
    expect(S.plan.ops['O1.10']).toEqual({ S: 1400 - 58 * 24, C: 1410 - 58 * 24 });
    expect(S.dataVer).toBe(2);
    expect(S.plan.dataVer).toBe(2);
    expect(S.simdi).toBe(10);
    expect(d.cozumler).toEqual(['sifir@10']);
    expect(d.geri()).toEqual([0, 0, 0]);
    expect(d.izler).toEqual(['Planın başlangıç günü kaydı: 2026-08-24 -> 2026-10-21 (58 gün)']);
    expect(d.bildirimler).toEqual([]);
  });

  it('başlangıç yedi günden yeniyse kaymaz', () => {
    const d = duzenek('2026-10-15', an('2026-10-21', 10));
    d.coz('sifir');
    expect((d.S()['D'] as { meta: { baslangic: string } }).meta.baslangic).toBe('2026-10-15');
    expect(d.cozumler).toEqual(['sifir@154']);
    expect(d.geri()).toEqual([1, 1, 1]);
    expect(d.izler).toEqual([]);
  });
});
