import { describe, expect, it } from 'vitest';
import { planlamaParcasi } from './planlama-derle.ts';

// Planlama çerçevesinin tezgâh, personel ve takvimi sahibi modüllerden (kaynak okuması) gelir; kayıtta yoktur (sunucu ayıklar).
// Parçalar (zz27 kayıt çevirisi, zz31 TMI uyarlaması) sayfanın geri kalanı yerine küçük taklitlerle koşar. Veriler uydurmadır.

interface Kaynak { durum: Record<string, unknown> | null; ek: Record<string, unknown> | null }
type Nesne = Record<string, unknown>;
interface Duzenek {
  ac: () => Nesne;
  S: () => (Nesne & { D: Nesne; dataVer: number }) | null;
  cizim: () => number;
  bildirimler: string[];
  cevir: (st: Nesne) => Nesne;
}

// kayit: Reçete ve Rota ana kaydı (çerçevenin yerel deposundaki metin). kaynak: kaynakOku cevabı; null ise okuma reddedilir.
function duzenek(kayit: Nesne | null, kaynak: Promise<Kaynak>): Duzenek {
  const govde = `
    let S = null; let U = { sayfa: 'tahta', hamle: null }; let cizim = 0; const bildirimler = [];
    const RR = { el: null }; const SAYFA_AD = {}; const VERI = {}; let hsKaynak = null; let rrYerlestir = null;
    const rrMi = s => typeof s === 'string' && s.startsWith('rr-');
    function bildir(m) { bildirimler.push(m); }
    function kaydet() {}
    function render() { cizim++; }
    function yukle() { return null; }
    function yeniCalisma(k) { return { D: VERI[k].veri, dataVer: 1, plan: null }; }
    ${planlamaParcasi('zz27-rr-veri')}
    ${planlamaParcasi('zz31-tmi')}
    return { ac: () => { S = yeniCalisma(); render(); return S; }, S: () => S, cizim: () => cizim, bildirimler, cevir: rrDenemeyeCevir };`;
  const depo = new Map<string, string>(kayit === null ? [] : [['recete-rota-motoru-v1', JSON.stringify(kayit)]]);
  const localStorage = { getItem: (k: string) => depo.get(k) ?? null, setItem: (k: string, v: string) => { depo.set(k, v); } };
  const window = { tmi: { kaynakOku: () => kaynak }, tmiGorunum: { kaydet: () => undefined, bildir: () => undefined } };
  return new Function('window', 'localStorage', 'console', govde)(window, localStorage, { error: () => undefined }) as Duzenek;
}

const DURUM = {
  wcs: [{ id: '1', code: 'IM-1', name: 'Talaşlı', week: null, aktif: true }, { id: '2', code: 'IM-2', name: 'Eski', week: null, aktif: false }],
  stations: [
    { id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 90, opPer: 1, count: 2, cost: null, aktif: true },
    { id: '11', code: 'ESK', name: 'Pasif istasyon', wcId: '1', eff: 100, opPer: 1, count: 1, cost: null, aktif: false },
  ],
  machines: [
    { id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true },
    { id: '101', code: 'T2', name: 'Torna 2', stationId: '10', status: 'aktif', aktif: true },
    { id: '102', code: 'T3', name: 'Pasif makine', stationId: '10', status: 'aktif', aktif: false },
    { id: '103', code: 'E1', name: 'Pasif istasyonda', stationId: '11', status: 'aktif', aktif: true },
  ],
  people: [
    { id: '7', name: 'Ornek Operator', code: 'S7', role: null, stationId: '10', stationAtama: true, wcId: '1', shiftId: null, skills: ['10'], cost: null, active: true },
    { id: '8', name: 'Ornek Ayarci', code: null, role: null, stationId: '10', stationAtama: false, wcId: '1', shiftId: null, skills: ['10'], cost: null, active: true },
  ],
  cal: { shifts: [{ id: '3', name: 'Gündüz', start: '08:00', end: '16:00', breaks: [{ start: '12:00', end: '12:30' }], netDakika: 450 }], holidays: ['2026-10-29'] },
  maliyet: { yazabilir: false, malzeme: {}, istasyon: { 10: { birimMaliyet: '750.0000', paraBirimi: 'TRY', surum: 1 } }, kisi: {} },
};
const EK = {
  takvim: { hafta: { 1: { 1: ['3'], 2: ['3'] }, 2: { 6: ['3'] } }, kisiVardiyasi: { 7: '3' } },
  kisiGorevi: { 8: 'Ayarcı' }, makineNotu: null, istasyonTipi: null, kapasiteKaynagi: null, kapasite: null,
};
// Kayıtta sipariş ve rota var, tezgâh ve personel yok (sunucunun yazdığı ana kayıt gibi).
const KAYIT = { version: 7, items: [], routes: {}, orders: [], opdefs: [], savedAt: 5 };

const bekle = (): Promise<void> => new Promise((coz) => { setTimeout(coz, 0); });

describe('planlama çerçevesi tezgâh, personel ve takvimi kaynak okumasından alır', () => {
  it('kaynak okuması gelince açık çalışmaya aktif tezgâhlar, personel, vardiya ve çalışma günleri girer; plan eskir', async () => {
    const d = duzenek(KAYIT, Promise.resolve({ durum: DURUM, ek: EK }));
    const S = d.ac() as { D: Nesne; dataVer: number };
    expect(S.D['tezgahlar']).toEqual([]);
    await bekle();
    const D = d.S()?.D as { tezgahlar: Nesne[]; personel: Nesne[]; vardiyalar: Nesne[]; calismaGunleri: Record<string, string[]>; tatiller: string[] };
    expect(D.tezgahlar.map((t) => t['id'])).toEqual(['100', '101']);
    expect(D.tezgahlar[0]).toMatchObject({ ad: 'Torna 1', grup: '10', ucret: 750, verim: 0.9, vardiyalar: ['3'] });
    expect(D.personel).toEqual([
      expect.objectContaining({ id: '7', vardiya: '3', gruplar: ['10'], ayar: false }),
      expect.objectContaining({ id: '8', vardiya: '', gruplar: ['10'], ayar: true }),
    ]);
    expect(D.vardiyalar).toEqual([expect.objectContaining({ id: '3', bas: '08:00', bit: '16:00' })]);
    // Pasif iş merkezinin cumartesisi takvime girmez.
    expect(D.calismaGunleri).toMatchObject({ pzt: ['3'], sal: ['3'], car: [], cmt: [], paz: [] });
    expect(D.tatiller).toEqual(['2026-10-29']);
    expect(d.S()?.dataVer).toBe(2);
    expect(d.cizim()).toBe(2);
  });

  it('okuma çalışma kurulmadan gelirse çalışma kaynakla kurulur', async () => {
    const d = duzenek(KAYIT, Promise.resolve({ durum: DURUM, ek: EK }));
    await bekle();
    const S = d.ac() as { D: { tezgahlar: unknown[]; personel: unknown[] }; dataVer: number };
    expect(S.D.tezgahlar).toHaveLength(2);
    expect(S.D.personel).toHaveLength(2);
    expect(S.dataVer).toBe(1);
  });

  it('kaynak değişmediyse çalışmaya dokunulmaz', async () => {
    const d = duzenek(KAYIT, Promise.resolve({ durum: { ...DURUM, wcs: [], stations: [], machines: [], people: [], cal: { shifts: [], holidays: [] } }, ek: null }));
    d.ac();
    await bekle();
    expect(d.S()?.dataVer).toBe(1);
    expect(d.cizim()).toBe(1);
  });

  it('okuma reddedilirse kayıttaki gibi kalır ve kullanıcıya söylenir', async () => {
    const d = duzenek(KAYIT, Promise.reject(new Error('403')));
    d.ac();
    await bekle();
    expect((d.S()?.D as { tezgahlar: unknown[] }).tezgahlar).toEqual([]);
    expect(d.bildirimler).toEqual(['Tezgâh, personel ve takvim sunucudan okunamadı; plan kapasitesiz kalabilir.']);
  });

  it('yetkisiz dilim (null) kayıttaki gibi kalır; maliyet satırı yoksa ücret uydurulmaz', async () => {
    const d = duzenek(KAYIT, Promise.resolve({ durum: { ...DURUM, people: null, maliyet: null }, ek: EK }));
    d.ac();
    await bekle();
    const D = d.S()?.D as { tezgahlar: Nesne[]; personel: unknown[] };
    expect(D.personel).toEqual([]);
    expect(D.tezgahlar[0]?.['ucret']).toBe(0);
  });

  it('tezgâhın motor ayarları aynı kimlikte korunur; ad ve istasyon sahibinden gelir', async () => {
    const d = duzenek(KAYIT, Promise.resolve({ durum: DURUM, ek: EK }));
    const S = d.ac() as { D: Nesne };
    S.D['tezgahlar'] = [{ id: '100', ad: 'Eski ad', grup: '99', ucret: 1, verim: 0.5, vardiyalar: [], opOran: 0, aile: 'x' }];
    await bekle();
    const t = (d.S()?.D as { tezgahlar: Nesne[] }).tezgahlar[0];
    expect(t).toMatchObject({ id: '100', ad: 'Torna 1', grup: '10', verim: 0.5, aile: 'x' });
  });
});
