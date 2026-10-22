import { describe, expect, it } from 'vitest';
import { planlamaMotoru, planlamaParcasi } from './planlama-derle.ts';

// Ek mesai planı sayfası (zu-yan-sayfalar sMesaiPlani), motorun mesai bedeli (engine evaluate) ve Maliyetler sayfasının mesai payı. Kayıttan kurulan çalışmada plan ayarları (D.ayarlar) hiç yazılmamış olabilir;
// sayfa o zaman açılır ve mesai ücreti bilinmediği için maliyeti uydurmaz, "—" gösterir; motor ve sipariş maliyeti de sıfır saymaz. Maliyeti yalnız fiyat gören rol görür.
// Parçalar sayfanın geri kalanı yerine küçük taklitlerle koşar. Veriler uydurmadır.

type Nesne = Record<string, unknown>;
interface Maliyet { mesaiTL: number | null; tl: number; maliyet: { mes: number | null; eksik: string[] }; plan: { mes: number; mesTop: number | null } }
interface Sayfa {
  ac: (ayarlar: Nesne | undefined, rol: string) => string;
  mesaiTL: (ayarlar: Nesne | undefined) => number | null;
  maliyet: (ayarlar: Nesne | undefined, ekMesai: Nesne) => Maliyet;
}

const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: { id: '100', ad: '100', grup: '10', ucret: 750, verim: 1, vardiyalar: ['3'], opOran: 0 } }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] }] } },
  orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 4, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' }],
};
const KAYNAK = {
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
    people: [],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  },
  ek: { takvim: { hafta: { 1: { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] } }, kisiVardiyasi: {} }, makineNotu: null, kisiGorevi: null },
};
const CALISMA = {
  D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [] },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
};

// 2026-10-24 cumartesidir: takvimde vardiya yok, mesai hafta sonu çarpanıyla sayılır
const EK_MESAI = { m: '100', gun: 5, vardiya: '3' };

function sayfaKur(): Sayfa {
  const govde = `
    let S = null; let U = { sayfa: 'mesaiplan' }; let ROL = 'mudur'; const calisan = null;
    function sayfaHtml() { return ''; } function sdCubuk() { return ''; } function render() {} function degistir() {} function tekEylem() { return false; }
    const SAYFA_AD = {}; const EKRAN_OF = {}; const EKRANLAR = []; const TANIM = {}; const self = {};
    const document = { addEventListener() {} };
    function bildir() {} const sayi = (x, k = 1) => x == null || !isFinite(x) ? '—' : Number(x).toFixed(k);
    const esc = s => String(s ?? ''); const saat = x => x == null || !isFinite(x) ? '—' : sayi(x, 1) + ' sa';
    const agTL = x => x == null || !isFinite(x) ? '—' : sayi(Math.round(x), 0) + ' TL'; const agTLs = agTL;
    const kart = (b, i, d = '') => '<section>' + b + i + d + '</section>'; const td = (a, i) => '<td>' + i + '</td>';
    const ic = s => '[' + s + ']'; const kip = () => ''; const rozet = a => '<i>' + a + '</i>'; const dugme = a => '<button>' + a + '</button>';
    const pdKatYaz = () => '×1';
    const agGecTL = () => 0; let bgKararlar = () => []; let mpSatinalmaPlani = () => '';
    const kim = () => ({ ad: 'Ornek', rol: ROL }); const agFiyatGorur = () => ['mudur', 'yonetici'].includes(ROL);
    ${planlamaMotoru()}
    ${planlamaParcasi('zu-yan-sayfalar')}
    ${planlamaParcasi('zv-termin')}
    const stOf = () => stTamKur(S); const cxAl = () => compile(stKur(S));
    const kur = ayarlar => {
      const g = girdiKur(${JSON.stringify(CALISMA)}, ${JSON.stringify(KAYIT)}, ${JSON.stringify(KAYNAK)}, '2026-10-19');
      S = g.S; if (ayarlar === undefined) delete S.D.ayarlar; else S.D.ayarlar = ayarlar; S.ekMesai = [${JSON.stringify(EK_MESAI)}];
    };
    return {
      ac: (ayarlar, rol) => { kur(ayarlar); ROL = rol; return sMesaiPlani(); },
      mesaiTL: ayarlar => { kur(ayarlar); return ymMesaiTL(S.D, cxAl(), S.ekMesai[0]); },
      maliyet: (ayarlar, ek) => {
        kur(ayarlar); S.ekMesai = [ek]; const st = stKur(S); const p = schedule(st, 'dagit', null); const e = evaluate(p, st, null, true);
        p.J = e.J; S.plan = p; const cx = compile(st); const s = S.D.siparisler[0];
        return { mesaiTL: e.mesaiTL, tl: e.tl, maliyet: ymSipMaliyet(s, p, cx, null, ymMesaiPay(p, cx)), plan: tmPlanMaliyet() };
      },
    };`;
  return new Function(govde)() as Sayfa;
}

describe('ek mesai planı: mesai ücreti', () => {
  const sayfa = sayfaKur();

  it('plan ayarları hiç yazılmamış kayıtta sayfa açılır; maliyet bilinmez, sıfır uydurulmaz', () => {
    const h = sayfa.ac(undefined, 'mudur');
    expect(h).toContain('Ek mesai planı');
    expect(h).toContain('— TL/sa');
    expect(h).not.toContain('0 TL');
    expect(sayfa.mesaiTL(undefined)).toBeNull();
  });

  it('ayar var ama mesai ücreti boşsa maliyet yine bilinmez', () => {
    expect(sayfa.mesaiTL({ ayarciUcret: 650 })).toBeNull();
    expect(sayfa.mesaiTL({ mesaiUcret: null })).toBeNull();
  });

  it('mesai ücreti girilmişse maliyet vardiya saati, ücret ve hafta sonu çarpanıyla sayılır (izinli: müdür görür)', () => {
    // 8 saatlik vardiya × 1000 TL/sa × 1,5 (hafta sonu, varsayılan mesai çarpanı)
    expect(sayfa.mesaiTL({ mesaiUcret: 1000 })).toBe(12000);
    const h = sayfa.ac({ mesaiUcret: 1000 }, 'mudur');
    expect(h).toContain('12000 TL');
    expect(h).toContain('Maliyet');
  });

  it('fiyat görmeyen rol maliyeti görmez (reddedilen: planlamacı)', () => {
    const h = sayfa.ac({ mesaiUcret: 1000 }, 'planlamaci');
    expect(h).toContain('müdürde');
    expect(h).not.toContain('Maliyet</th>');
    expect(h).not.toContain(' TL<');
  });

  // pazartesi gündüz vardiyası: siparişin işlemleri bu pencerede çalışır
  const PZT = { m: '100', gun: 0, vardiya: '3' };

  it('mesai ücreti yoksa motor ek mesai bedelini sıfır değil bilinmez sayar; amaçtaki TL yalnız bilinen maliyettir', () => {
    const yok = sayfa.maliyet(undefined, PZT);
    expect(yok.mesaiTL).toBeNull();
    const var_ = sayfa.maliyet({ mesaiUcret: 1000 }, PZT);
    expect(var_.mesaiTL).toBe(8000);
    expect(var_.tl - yok.tl).toBe(8000);
  });

  it('mesai ücreti yoksa sipariş maliyetinde mesai payı eksik yazılır, plan toplamında ek mesai bilinmez', () => {
    const yok = sayfa.maliyet(undefined, PZT);
    expect(yok.maliyet.mes).toBeNull();
    expect(yok.maliyet.eksik).toContain('mesai ücreti');
    expect(yok.plan.mesTop).toBeNull();
    const var_ = sayfa.maliyet({ mesaiUcret: 1000 }, PZT);
    expect(var_.maliyet.eksik).not.toContain('mesai ücreti');
    expect(var_.maliyet.mes).toBeGreaterThan(0);
    expect(var_.plan.mesTop).toBe(8000);
  });
});
