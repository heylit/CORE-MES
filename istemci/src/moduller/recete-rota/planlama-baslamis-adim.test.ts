import { describe, expect, it } from 'vitest';
import { planlamaMotoru, planlamaParcasi } from './planlama-derle.ts';

// Başlamış adım (391 a, 3b madde 9): kalan sunucudan gelir, yalnız o adımın çubuğu güncellenir, sapma uyarılır, plan kendiliğinden değişmez.
// Motor, kayıt çevirisi (zz27), sapma ve ilerleme (zz34) ve TMI uyarlaması (zz31) gerçek; sayfanın geri kalanı küçük taklit. Veriler uydurmadır.

type Nesne = Record<string, unknown>;
interface Is { m: string; S: number; C: number; Su?: number; act?: number; adetN?: number }
interface Duzenek {
  ac: () => void;
  S: () => { D: Nesne; plan: { ops: Record<string, Is> }; gercek: Record<string, Nesne> };
  yazma: () => number;
  bildirimler: string[];
  ilerleme: (id: string) => string;
  kutu: (id: string) => string;
  eylem: (act: string, v: string) => boolean;
}

function duzenek(kayit: Nesne, okumalar: Array<{ durum: Nesne; ek: null }>): Duzenek {
  const govde = `
    let S = null; let U = { sayfa: 'tahta', hamle: null }; const bildirimler = [];
    const RR = { el: null }; const SAYFA_AD = {}; const VERI = {}; let hsKaynak = null; let rrYerlestir = null; let calisan = null;
    const rrMi = s => typeof s === 'string' && s.startsWith('rr-');
    const GUNLER = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
    const sayi = (x, n) => Number(x).toFixed(n); const saat = x => sayi(x, 1) + ' sa'; const esc = x => String(x); const ic = a => '[' + a + ']';
    const dugme = (ad, act) => '<button data-act="' + act + '">' + ad + '</button>'; const yetkili = () => true;
    function bildir(m) { bildirimler.push(m); }
    let yazma = 0; function kaydet() { yazma++; } function render() {} function ozetTazele() {}
    function yukle() { return null; }
    function yeniCalisma(k) { return { D: VERI[k].veri, dataVer: 1, plan: null, gercek: {} }; }
    let tekEylem = () => false;
    const ZAMAN = { M: { 100: { sw: [[0, 1500]], rw: [[0, 1500]] } } };
    const cxAl = () => ({ st: { now: 7 }, M: ZAMAN.M, byId: { 'O1.10': { c: [{ m: '100', su: 0.5 }] } } });
    ${planlamaMotoru()}
    ${planlamaParcasi('zz27-rr-veri')}
    ${planlamaParcasi('zz34-adet-sayim')}
    ${planlamaParcasi('zz31-tmi')}
    return { ac: () => { S = yeniCalisma(); S.plan = { ops: { 'O1.10': { id: 'O1.10', job: 'O1', m: '100', S: 20, Su: 20.5, C: 30, lot1: 21 } } }; },
      S: () => S, yazma: () => yazma, bildirimler, ilerleme: ilerlemeCubugu, kutu: sapmaKutu, eylem: (a, v) => tekEylem(a, v) };`;
  const depo = new Map<string, string>([['recete-rota-motoru-v1', JSON.stringify(kayit)]]);
  const localStorage = { getItem: (k: string) => depo.get(k) ?? null, setItem: (k: string, v: string) => { depo.set(k, v); } };
  let n = 0;
  const window = {
    tmi: { kaynakOku: () => Promise.resolve(okumalar[Math.min(n++, okumalar.length - 1)]) },
    tmiGorunum: { kaydet: () => undefined, bildir: () => undefined },
  };
  const belge = { addEventListener: (_: string, f: () => void) => { gorunurOldu = f; }, visibilityState: 'visible' };
  let gorunurOldu = (): void => undefined;
  const d = new Function('window', 'localStorage', 'console', 'document', govde)(window, localStorage, { error: () => undefined }, belge) as Duzenek;
  return { ...d, eylem: (a, v) => (a === '_gorun' ? (gorunurOldu(), true) : d.eylem(a, v)) };
}

const yerel = (saat: number, dk = 0): string => { const t = new Date(); t.setHours(saat, dk, 0, 0); return t.toISOString(); };
const KAYIT = {
  version: 7, savedAt: 5,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek urun', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10' }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 30, cycle: 60, alts: [], altTimes: {}, ins: [] }] } },
  orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: null, due: null, priority: 2, status: 'uretimde' }],
};
const calisan = (ek: Nesne = {}) => ({
  durum: { calisanAdimlar: [{ anahtar: 'E-1|10', makineId: '100', baslangic: yerel(6), sayimAni: yerel(6, 40), kalanVerimliDk: 120, saglam: 4, adet: 10, ...ek }] },
  ek: null,
});
const bekle = (): Promise<void> => new Promise((coz) => { setTimeout(coz, 0); });

describe('başlamış adım: kalan sunucudan (391 a, madde 9)', () => {
  it('terminalde çalışan adım plan işine eşlenir; kalan gerçek sayım anından yürür, yalnız o iş güncellenir, sapma bildirilir', async () => {
    const d = duzenek(KAYIT, [calisan()]);
    d.ac();
    await bekle();
    expect(d.S().gercek['O1.10']).toMatchObject({ m: '100', S: 6, kalan: 2, n: 4, A: 10, sunucu: 1, planC: 30 });
    expect(d.S().gercek['O1.10']?.['sayim']).toBeCloseTo(6 + 40 / 60, 6);
    expect(d.S().plan.ops['O1.10']).toMatchObject({ S: 6, act: 1, adetN: 4 });
    expect(d.S().plan.ops['O1.10']?.C).toBeCloseTo(8 + 40 / 60, 6);
    expect(d.bildirimler).toEqual(['O1.10 plandan 21.3 sa erken bitecek. Plan kendiliğinden değişmez.']);
    expect(d.ilerleme('O1.10')).toContain('4/10 adet');
    expect(d.ilerleme('O1.10')).toContain('--ilerleme:40%');
    expect(d.kutu('O1.10')).toContain('data-act="sapma-onar"');
    expect(d.yazma()).toBe(0);
  });

  it('sayfanın sabit şimdisinden sonra başlayan adım gerçek saatinde kalır; eşik altındaki fark uyarı vermez', async () => {
    const d = duzenek({ ...KAYIT }, [calisan({ baslangic: yerel(9), sayimAni: null, kalanVerimliDk: 1260 })]);
    d.ac();
    d.S().plan.ops['O1.10'] = { m: '100', S: 9, Su: 9.5, C: 30.2 };
    await bekle();
    expect(d.S().gercek['O1.10']).toMatchObject({ S: 9, sayim: 9, kalan: 21 });
    expect(d.S().plan.ops['O1.10']?.C).toBe(30);
    expect(d.bildirimler).toEqual([]);
    expect(d.kutu('O1.10')).toBe('');
  });

  it('sayfaya dönülünce yeniden okunur; sunucu artık başlamış demiyorsa sunucu kaydı silinir, elle girilen kalır', async () => {
    const d = duzenek(KAYIT, [calisan(), { durum: { calisanAdimlar: [] }, ek: null }]);
    d.ac();
    d.S().gercek['X.10'] = { m: '100', S: 3 };
    await bekle();
    expect(Object.keys(d.S().gercek).sort()).toEqual(['O1.10', 'X.10']);
    d.eylem('_gorun', '');
    await bekle();
    expect(Object.keys(d.S().gercek)).toEqual(['X.10']);
  });

  it('eşlenemeyen anahtar (başka emir, rotada olmayan OP) yok sayılır; okuma yoksa gerçekleşene dokunulmaz', async () => {
    const d = duzenek(KAYIT, [calisan({ anahtar: 'E-9|10' })]);
    d.ac();
    await bekle();
    expect(d.S().gercek).toEqual({});
    const y = duzenek(KAYIT, [{ durum: {}, ek: null }]);
    y.ac();
    y.S().gercek['O1.10'] = { m: '100', S: 3, sunucu: 1 };
    await bekle();
    expect(y.S().gercek['O1.10']).toEqual({ m: '100', S: 3, sunucu: 1 });
  });
});
