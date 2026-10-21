import { describe, expect, it } from 'vitest';
import { planlamaMotoru, planlamaParcasi } from './planlama-derle.ts';

// 31 a: sayfanın "şimdi"si yalnız yeniden planlamada gerçek saate geçer; açılışta ve çizimde değişmez. Motor, zz27, zz34 ve zz31 gerçek;
// sayfanın geri kalanı küçük taklit. Veriler uydurmadır.

interface Duzenek { st: () => { now: number }; coz: (kip: string) => void; S: () => Record<string, unknown>; cozumler: string[]; bildirimler: string[] }

function duzenek(baslangic: string, simdi: number, yetki = true): Duzenek {
  const govde = `
    let S = null; let U = { sayfa: 'tahta', hamle: null }; const bildirimler = []; const cozumler = [];
    const RR = { el: null }; const SAYFA_AD = {}; const VERI = {}; let hsKaynak = null; let rrYerlestir = null; let calisan = null;
    const rrMi = s => typeof s === 'string' && s.startsWith('rr-');
    const GUNLER = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
    const sayi = (x, n) => Number(x).toFixed(n); const saat = x => sayi(x, 1) + ' sa'; const esc = x => String(x); const ic = a => '[' + a + ']';
    const dugme = () => ''; const yetkili = () => ${String(yetki)};
    function bildir(m) { bildirimler.push(m); }
    function kaydet() {} function render() {} function ozetTazele() {}
    function yukle() { return null; }
    function yeniCalisma() { return { D: { meta: { baslangic: '${baslangic}' } }, dataVer: 1, plan: null, gercek: {} }; }
    function stOf() { return { now: 7 }; }
    function coz(kip) { cozumler.push(kip + '@' + stOf().now); }
    let tekEylem = () => false;
    const cxAl = () => null;
    ${planlamaMotoru()}
    ${planlamaParcasi('zz27-rr-veri')}
    ${planlamaParcasi('zz34-adet-sayim')}
    ${planlamaParcasi('zz31-tmi')}
    S = yeniCalisma();
    return { st: () => stOf(), coz: k => coz(k), S: () => S, cozumler, bildirimler };`;
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

  it('başlangıç eskiyip ufkun sonu yaklaşınca uyarır', () => {
    const d = duzenek('2026-08-24', an('2026-10-21', 10));
    d.coz('sifir');
    expect(d.bildirimler[0]).toContain('ufkun sonuna 4 gün kaldı');
  });
});
