import { describe, expect, it } from 'vitest';
import { planlamaMotoru, planlamaParcasi } from './planlama-derle.ts';

// Biten iş plana girmez: biten ve iptal emir motorun girdisinden düşer, biten adımın ardılı onu beklemez. Çalışmanın verisi (S.D) değişmez.
// Motor, kayıt çevirisi (zz27) ve TMI uyarlaması (zz31) gerçek; sayfanın geri kalanı küçük taklit. Veriler uydurmadır.

type Nesne = Record<string, unknown>;
interface Op { id: string; pr: unknown[]; matYok: boolean }
interface Motor {
  bitenler: (emirler: unknown, D: unknown) => { siparis: Nesne; adim: Nesne };
  derle: (st: unknown) => { ops: Op[]; jobs: Record<string, unknown> };
  ac: () => void;
  st: () => Nesne & { D: { siparisler: { id: string }[] }; bitti?: Nesne };
  S: () => Nesne & { D: { siparisler: { id: string; termin?: unknown }[] } };
  geri: () => Nesne & { name: string; orders: Nesne[]; routes: Record<string, { steps: Nesne[] }> };
}

function motor(kayit: Nesne, kaynak: { durum: Nesne; ek: Nesne | null } | null): Motor {
  const govde = `
    let S = null; let U = { sayfa: 'tahta', hamle: null }; const geriAl = [];
    const RR = { el: null }; const SAYFA_AD = {}; const VERI = {}; let hsKaynak = null; let rrYerlestir = null; let calisan = null;
    const rrMi = s => typeof s === 'string' && s.startsWith('rr-');
    const sayi = (x, n) => Number(x).toFixed(n); const saat = x => sayi(x, 1) + ' sa'; const esc = x => String(x); const ic = a => '[' + a + ']';
    const dugme = (ad, act) => '<button data-act="' + act + '">' + ad + '</button>'; const yetkili = () => true;
    function bildir() {} function iz() {} function kaydet() {} function render() {} function ozetTazele() {}
    function yukle() { return null; }
    function yeniCalisma() { return { D: null, dataVer: 0, gercek: {}, kapali: [], down: [], ekMesai: [], locks: {}, olaylar: [], w: { famK: 0.3, mat: 'sert', dondurma: 0 }, param: {} }; }
    function stOf(ek = [], gevset = true) { return stTamKur(S, ek, gevset); } function coz() {}
    const cxAl = () => compile(stOf());
    let tekEylem = () => false;
    ${planlamaMotoru()}
    ${planlamaParcasi('zz27-rr-veri')}
    ${planlamaParcasi('zz31-tmi')}
    return {
      bitenler: tmiBitenler, derle: st => compile(st),
      ac: () => { S = yeniCalisma(); S.D = tmiCevir(rrOku(), null, null, '2026-10-19'); render(); },
      st: () => JSON.parse(JSON.stringify(stOf())), S: () => JSON.parse(JSON.stringify(S)),
      geri: () => JSON.parse(JSON.stringify(rrDenemedenKur(S.D, rrOku()))),
    };`;
  const depo = new Map<string, string>([['recete-rota-motoru-v1', JSON.stringify(kayit)]]);
  const localStorage = { getItem: (k: string) => depo.get(k) ?? null, setItem: (k: string, v: string) => { depo.set(k, v); } };
  const window = { tmi: { kaynakOku: () => Promise.resolve(kaynak) }, tmiGorunum: { kaydet: () => undefined, bildir: () => undefined } };
  const belge = { addEventListener: () => undefined, visibilityState: 'visible' };
  return new Function('window', 'localStorage', 'console', 'document', govde)(window, localStorage, { error: () => undefined }, belge) as Motor;
}

const adim = (id: string, seq: number): Nesne => ({ id, seq, opNo: seq, opId: '13', stationId: '10', setup: 30, cycle: 6, alts: [], altTimes: {}, ins: [] });
const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek urun', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10' }],
  routes: { 50: { base: null, steps: [adim('50-o20', 20), adim('50-o10', 10), adim('50-o30', 30)] } },
  orders: [
    { id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'uretimde' },
    { id: 'O2', no: 'E-2', itemId: '50', qty: 4, start: '2026-10-19', due: '2026-11-04', priority: 1, status: 'tamam' },
    { id: 'O3', no: 'E-3', itemId: '50', qty: 4, start: '2026-10-19', due: '2026-11-04', priority: 1, status: 'uretimde' },
    { id: 'O4', no: 'E-4', itemId: '50', qty: 4, start: '2026-10-19', due: '2026-11-04', priority: 1, status: 'serbest' },
  ],
  opStatus: { 'O1|root|1': 'tamam', 'O1|root|2': 'calisiyor', 'O3|root|1': 'tamam', 'O3|root|2': 'tamam', 'O3|root|3': 'tamam' },
  cal: { shifts: [{ id: '3', start: '08:00', end: '16:00' }], holidays: [] },
  wcs: [{ id: 'w-atolye', week: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }],
};

describe('biten iş plana girmez', () => {
  it('biten ve iptal emir düşer; biten adım sırasıyla rotadaki adıma (seq sırası) bağlanır; bütün adımı biten emir de düşer', () => {
    const m = motor(KAYIT, null); m.ac();
    const D = m.S().D;
    const b = m.bitenler({ orders: [...KAYIT.orders, { id: 'O5', status: 'iptal' }], opStatus: KAYIT.opStatus }, D);
    expect(b.siparis).toEqual({ O2: 1, O3: 1, O5: 1 });
    expect(b.adim).toEqual({ 'O1.10': 1 });
    expect(m.bitenler(null, D)).toEqual({ siparis: {}, adim: {} });
  });

  it('motor biten adımı kurmaz; ardılı onu beklemez ve malzemeyi ilk adım gibi beklemez', () => {
    const m = motor(KAYIT, null); m.ac();
    const st = m.st();
    expect(st.D.siparisler.map((s) => s.id)).toEqual(['O1', 'O4']);
    expect(st.bitti).toEqual({ 'O1.10': 1 });
    const cx = m.derle(st);
    const o1 = cx.ops.filter((o) => o.id.startsWith('O1.'));
    expect(o1.map((o) => o.id)).toEqual(['O1.20', 'O1.30']);
    expect(o1[0]).toMatchObject({ pr: [], matYok: true });
    expect(o1[1]?.matYok).toBe(false);
    expect(cx.ops.filter((o) => o.id.startsWith('O4.')).every((o) => !o.matYok)).toBe(true);
  });

  it('çalışmanın verisi değişmez: biten emir S.D de kalır, yalnız motorun girdisinden düşer', () => {
    const m = motor(KAYIT, null); m.ac();
    m.st();
    expect(m.S().D.siparisler.map((s) => s.id)).toEqual(['O1', 'O2', 'O3', 'O4']);
  });

  it('sunucunun iş emri durumu varsa kayıttaki kopyanın yerine o okunur', async () => {
    // sunucunun emir listesi tamdır (13.1: emirler kaydın üstüne konur); O2 sunucuda sürüyor, O4 bitmiş
    const durum = { emirler: { orders: KAYIT.orders.map((o) => ({ ...o, status: o.id === 'O4' ? 'tamam' : 'uretimde' })), opStatus: {} } };
    const m = motor(KAYIT, { durum, ek: null }); m.ac();
    await new Promise((coz) => { setTimeout(coz, 0); });
    expect(m.st().D.siparisler.map((s) => s.id)).toEqual(['O1', 'O2', 'O3']);
  });

  it('biten yoksa st olduğu gibi kalır (bitti alanı eklenmez)', () => {
    const m = motor({ ...KAYIT, opStatus: {}, orders: KAYIT.orders.map((o) => ({ ...o, status: 'serbest' })) }, null); m.ac();
    const st = m.st();
    expect(st.bitti).toBeUndefined();
    expect(st.D.siparisler).toHaveLength(4);
  });
});

// Soru 159 b: vardiyası olan ayarcı yoksa ayarcı sınırı uygulanmaz ve motor bunu uyarıyla söyler.
function girdi(personel: Nesne[], kapali: string[] = []): { st: Nesne & { ayarciYok?: boolean; D: { personel: Nesne[] } }; uyari: string[] } {
  const govde = `${planlamaMotoru()}
    return (S) => { const st = stKur(S); const cx = compile(st); return { st: JSON.parse(JSON.stringify(st)), uyari: evaluate({ ops: {}, fail: [], cx }, st, null, false).warn.map(w => w.t) }; };`;
  const kur = new Function(govde)() as (S: Nesne) => ReturnType<typeof girdi>;
  return kur({
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [{ id: '1', bas: '08:00', bit: '16:00' }], calismaGunleri: { pzt: ['1'] }, tatiller: [],
      urunler: [], malzemeler: [], tezgahlar: [], personel, siparisler: [], ayarlar: {} },
    down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: {}, kapali, olaylar: [],
  });
}

describe('ayarcı sınırı (Soru 159 b)', () => {
  it('vardiyası olan ayarcı yoksa sınır uygulanmaz ve uyarı verilir', () => {
    const r = girdi([{ id: 'A1', ad: 'Ornek ayarci', vardiya: '', gruplar: [], ayar: true }, { id: 'O1', ad: 'Ornek operator', vardiya: '1', gruplar: [], ayar: false }]);
    expect(r.st.ayarciYok).toBe(true);
    expect(r.st.D.personel.filter((p) => p['ayar']).length).toBeGreaterThan(1);
    expect(r.uyari).toContain('Ayarcı');
  });

  it('vardiyası olan ayarcı varsa sınır uygulanır, uyarı yok', () => {
    const r = girdi([{ id: 'A1', ad: 'Ornek ayarci', vardiya: '1', gruplar: [], ayar: true }]);
    expect(r.st.ayarciYok).toBeUndefined();
    expect(r.st.D.personel).toHaveLength(1);
    expect(r.uyari).not.toContain('Ayarcı');
  });

  it('kısıt elle kapalıysa uyarı verilmez (kapalı kısıt zaten bildirilir)', () => {
    const r = girdi([], ['ayarci']);
    expect(r.st.ayarciYok).toBeUndefined();
    expect(r.uyari).not.toContain('Ayarcı');
  });
});

// Kayıttaki boş değer gidiş dönüşte uydurulmaz: teslimi boş emir termin almaz, geri çevirmede teslim boş kalır; fason adımın boş
// süreleri 0 olmaz; kaydın adı çalışmanın adıyla ezilmez.
describe('kayıt gidiş dönüşü veriyi değiştirmez', () => {
  const fason = { id: '50-o20', seq: 20, opNo: 20, opId: '14', stationId: null, machineId: null, fasonId: '7', terminGun: 3, setup: null, proc: null, cycle: null, alts: [], altTimes: {}, ins: [] };
  const kayit = {
    ...KAYIT, name: 'Ornek atolye', opdefs: [...KAYIT.opdefs, { id: '14', name: 'Kaplama' }], opStatus: {},
    routes: { 50: { base: null, steps: [adim('50-o10', 10), fason] } },
    orders: [{ id: 'O9', no: 'E-9', itemId: '50', qty: 5, start: '2026-10-19', due: null, priority: 0, status: 'serbest' }],
  };

  it('teslimi boş emrin termini boş kalır ("null 17:00" yazılmaz)', () => {
    const m = motor(kayit, null); m.ac();
    expect(m.S().D.siparisler[0]?.termin).toBeNull();
  });

  it('geri çevirmede teslim, fason süreleri ve kayıt adı olduğu gibi kalır', () => {
    const m = motor(kayit, null); m.ac();
    const g = m.geri();
    expect(g.name).toBe('Ornek atolye');
    expect(g.orders[0]?.['due']).toBeNull();
    expect(g.routes['50']?.steps[1]).toMatchObject({ setup: null, proc: null, cycle: null });
  });
});
