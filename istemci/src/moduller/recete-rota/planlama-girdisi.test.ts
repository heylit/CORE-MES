import { describe, expect, it } from 'vitest';
import { planlamaMotoru, planlamaParcasi } from './planlama-derle.ts';

// Planın girdisi (st) motor/girdi.betik'te tek yerdedir; sunucu (plan-girdisi.ts) açılışı girdiKur ile aynı sırayla kurar. Burada çerçevenin
// kendi akışı (kayıttan yükleme, rrCek, kaynak okuması, başlamış adımlar, stOf) ile girdiKur aynı çalışmayı ve aynı st'yi vermeli.
// Motor, kayıt çevirisi (zz27), sapma (zz34) ve TMI uyarlaması (zz31) gerçek; sayfanın geri kalanı küçük taklit. Veriler uydurmadır.

type Nesne = Record<string, unknown>;
interface Sonuc { S: Nesne; st: Nesne }
interface Duzenek { ac: () => void; cerceve: () => Sonuc; sunucu: () => Sonuc | null }

function duzenek(kayit: Nesne, calisma: Nesne, kaynak: { durum: Nesne; ek: Nesne | null }): Duzenek {
  const govde = `
    let S = null; let U = { sayfa: 'tahta', hamle: null }; const geriAl = [];
    const RR = { el: null }; const SAYFA_AD = {}; const VERI = {}; let hsKaynak = null; let rrYerlestir = null; let calisan = null;
    const rrMi = s => typeof s === 'string' && s.startsWith('rr-');
    const sayi = (x, n) => Number(x).toFixed(n); const saat = x => sayi(x, 1) + ' sa'; const esc = x => String(x); const ic = a => '[' + a + ']';
    const dugme = (ad, act) => '<button data-act="' + act + '">' + ad + '</button>'; const yetkili = () => true;
    function bildir() {} function iz() {} function kaydet() {} function render() {} function ozetTazele() {}
    const CALISMA = ${JSON.stringify(calisma)};
    function yukle() { return JSON.parse(JSON.stringify(CALISMA)); }
    function yeniCalisma() { throw new Error('çalışma kayıttan açılmalı'); }
    function stOf(ek = [], gevset = true) { return stKur(S, ek, gevset); } function coz() {}
    let cxOn = null; const cxAl = () => { const k = JSON.stringify([S.D, S.gercek, S.simdi]); if (!cxOn || cxOn.k !== k) cxOn = { k, cx: compile(stOf()) }; return cxOn.cx; };
    let tekEylem = () => false;
    ${planlamaMotoru()}
    ${planlamaParcasi('zz27-rr-veri')}
    ${planlamaParcasi('zz34-adet-sayim')}
    ${planlamaParcasi('zz31-tmi')}
    const KAYNAK = ${JSON.stringify(kaynak)};
    return {
      ac: () => { S = yukle(); render(); },
      cerceve: () => ({ S: JSON.parse(JSON.stringify(S)), st: JSON.parse(JSON.stringify(stOf())) }),
      sunucu: () => { const r = girdiKur(CALISMA, JSON.parse(localStorage.getItem('recete-rota-motoru-v1')), KAYNAK, '2026-10-19'); return r && JSON.parse(JSON.stringify(r)); },
    };`;
  const depo = new Map<string, string>([['recete-rota-motoru-v1', JSON.stringify(kayit)]]);
  const localStorage = { getItem: (k: string) => depo.get(k) ?? null, setItem: (k: string, v: string) => { depo.set(k, v); } };
  const window = { tmi: { kaynakOku: () => Promise.resolve(kaynak) }, tmiGorunum: { kaydet: () => undefined, bildir: () => undefined } };
  const belge = { addEventListener: () => undefined, visibilityState: 'visible' };
  return new Function('window', 'localStorage', 'console', 'document', govde)(window, localStorage, { error: () => undefined }, belge) as Duzenek;
}

const yerel = (gun: number, saat: number, dk = 0): string => new Date(2026, 9, gun, saat, dk).toISOString();
const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek urun', type: 'mamul' }, { id: 'H1', code: 'H1', name: 'Ornek cubuk', type: 'ham', unit: 'kg', cost: 0, stock: 3 }],
  opdefs: [{ id: '13', name: 'Tornalama' }, { id: '14', name: 'Kaplama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10' }],
  routes: { 50: { base: null, steps: [
    { id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 30, cycle: 6, alts: [], altTimes: {}, ins: [{ id: 'n1', itemId: 'H1', qty: 2 }] },
    { id: '50-o20', seq: 20, opNo: 20, opId: '14', stationId: null, fasonId: '7', terminGun: 3, setup: 0, cycle: 0, alts: [], altTimes: {}, ins: [] },
  ] } },
  orders: [
    { id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'uretimde' },
    { id: 'O2', no: 'E-2', itemId: '50', qty: 4, start: '2026-10-19', due: '2026-11-04', priority: 1, status: 'serbest' },
  ],
  cal: { shifts: [{ id: '3', start: '08:00', end: '16:00' }], holidays: [] },
  wcs: [{ id: 'w-atolye', week: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }],
};
// Çalışma kayıttan önce saklanmış (rrSavedAt 5 < savedAt 9): açılışta kayıttan yeniden çevrilir, plan ayarları çalışmada kalır.
const CALISMA = {
  D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [{ id: '3', bas: '08:00', bit: '16:00' }], calismaGunleri: { pzt: ['3'] }, tatiller: [],
    urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {}, planDenge: 25 },
  rrSavedAt: 5, dataVer: 3, simdi: 30.25,
  down: [{ m: '100', s: 40, e: 44 }], ekMesai: [], locks: { 'O2.10': { m: '100', S: 60 } }, gercek: {},
  w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: ['tatil'], olaylar: [],
  plan: { ops: { 'O1.10': { id: 'O1.10', job: 'O1', m: '100', S: 20, Su: 20.5, C: 30, lot1: 21 } } },
};
const KAYNAK = {
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 90, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
    people: [{ id: '7', name: 'Ornek Operator', code: 'S7', stationId: '10', wcId: '1', skills: ['10'], active: true }],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [{ start: '12:00', end: '12:30' }] }], holidays: ['2026-10-29'] },
    maliyet: { istasyon: { 10: { birimMaliyet: '750.0000', paraBirimi: 'TRY' } }, kisi: {} },
    fasonFirms: [{ id: '7', code: 'F7', name: 'Ornek kaplamaci' }],
    adimAdetleri: { 'E-1|20': 8 },
    calisanAdimlar: [{ anahtar: 'E-1|10', makineId: '100', baslangic: yerel(20, 9), sayimAni: yerel(20, 10), kalanVerimliDk: 90, saglam: 4, adet: 10 }],
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: { 7: '3' } }, makineNotu: null, kisiGorevi: null },
};
const bekle = (): Promise<void> => new Promise((coz) => { setTimeout(coz, 0); });

describe('plan girdisi: çerçeve ve sunucu aynı kodla kurar', () => {
  it('kayıt, çalışma ve kaynak okuması aynıysa çerçevenin açılışı ile girdiKur aynı çalışmayı ve aynı st yi verir', async () => {
    const d = duzenek(KAYIT, CALISMA, KAYNAK);
    d.ac();
    await bekle();
    const c = d.cerceve(); const s = d.sunucu();
    expect(s).not.toBeNull();
    expect(s?.st).toEqual(c.st);
    for (const alan of ['D', 'gercek', 'plan', 'simdi', 'locks']) expect(s?.S[alan]).toEqual(c.S[alan]);
    // sınama boş geçmesin: kaynak, adım adedi, başlamış adım ve "şimdi" st ye girmiş olmalı
    const st = c.st as { now: number; D: Nesne & { tezgahlar: Nesne[]; opAdet: Nesne; fasoncular: Nesne[]; siparisler: unknown[]; tatiller: unknown[] }; gercek: Nesne; locks: Nesne };
    expect(st.now).toBe(30.25);
    expect(st.D.tezgahlar.map((m) => m['id'])).toEqual(['100']);
    expect(st.D.opAdet).toEqual({ 'O1.20': 8 });
    expect(st.D.fasoncular.map((f) => f['id'])).toEqual(['7']);
    expect(st.D.siparisler).toHaveLength(2);
    expect(st.D.tatiller).toEqual([]);
    expect(st.gercek['O1.10']).toMatchObject({ m: '100', kalan: 1.5, sunucu: 1, planC: 30 });
    expect(st.locks).toEqual({ 'O2.10': { m: '100', S: 60 } });
  });

  it('çalışma yoksa girdi kurulmaz (varsayılan çalışma sayfanın kendisindedir)', () => {
    const d = duzenek(KAYIT, { D: null }, KAYNAK);
    expect(d.sunucu()).toBeNull();
  });
});
