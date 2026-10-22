import { describe, expect, it } from 'vitest';
import { planlamaMotoru, planlamaParcasi } from './planlama-derle.ts';

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
  kur: (D: Nesne, onceki: Nesne | null) => Nesne;
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
    function stOf() { return { now: 7 }; } function coz() {}
    ${planlamaMotoru()}
    ${planlamaParcasi('zz27-rr-veri')}
    ${planlamaParcasi('zz31-tmi')}
    return { ac: () => { S = yeniCalisma(); render(); return S; }, S: () => S, cizim: () => cizim, bildirimler, cevir: rrDenemeyeCevir, kur: rrDenemedenKur };`;
  const depo = new Map<string, string>(kayit === null ? [] : [['recete-rota-motoru-v1', JSON.stringify(kayit)]]);
  const localStorage = { getItem: (k: string) => depo.get(k) ?? null, setItem: (k: string, v: string) => { depo.set(k, v); } };
  const window = { tmi: { kaynakOku: () => kaynak }, tmiGorunum: { kaydet: () => undefined, bildir: () => undefined } };
  const document = { addEventListener: () => undefined, visibilityState: 'visible' };
  return new Function('window', 'localStorage', 'console', 'document', govde)(window, localStorage, { error: () => undefined }, document) as Duzenek;
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
const KAYIT = {
  version: 7, savedAt: 5, orders: [],
  items: [{ id: '50', code: 'MM-1', name: 'Ornek urun', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opId: '13', stationId: '10', setup: 30, cycle: 4, alts: [], altTimes: {}, ins: [] }] } },
};

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
    // Rota adımının tezgâhları makineler gelince kurulur (adım istasyonunun aktif makineleri).
    const urun = (d.S()?.D as { urunler: Array<{ rota: Array<{ tezgahlar: Array<{ id: string }> }> }> }).urunler[0];
    expect(urun?.rota[0]?.tezgahlar.map((t) => t.id)).toEqual(['100', '101']);
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

  it('yetkisiz dilim (null) kayıttaki gibi kalır; maliyet satırı yoksa ücret uydurulmaz (69 a: boş, sıfır değil)', async () => {
    const d = duzenek(KAYIT, Promise.resolve({ durum: { ...DURUM, people: null, maliyet: null }, ek: EK }));
    d.ac();
    await bekle();
    const D = d.S()?.D as { tezgahlar: Nesne[]; personel: unknown[] };
    expect(D.personel).toEqual([]);
    expect(D.tezgahlar[0]?.['ucret']).toBeNull();
  });

  // Saklanmış çalışma açılırken kayıt başka çerçevede değişmişse çalışma yeniden çevrilir (rrCek). Kayıtta plan dilimi yoksa
  // başlangıç da yoktur; başlangıçsız çalışmada motor çeviremiyor ve sayfa çizilmiyordu.
  it('plan dilimi olmayan kayıt çevrilirken açık çalışmanın başlangıcı korunur, çalışma yoksa taban kurulur', () => {
    const d = duzenek(KAYIT, new Promise<Kaynak>(() => undefined));
    expect(d.cevir(KAYIT)['meta']).toMatchObject({ baslangic: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as unknown });
    const S = d.ac() as { D: Nesne };
    S.D['meta'] = { ad: 'Kayit', baslangic: '2026-10-21' };
    const D = d.cevir(KAYIT);
    expect(D['meta']).toEqual({ ad: 'Kayit', baslangic: '2026-10-21' });
    expect(D['meta']).not.toBe(S.D['meta']);
    expect(D).toMatchObject({ vardiyalar: [], calismaGunleri: {}, tatiller: [] });
  });

  describe('fason firmalar (23 a)', () => {
    const FASON_KAYIT = {
      ...KAYIT,
      items: [...KAYIT.items, { id: '51', code: 'MM-2', name: 'Ornek urun iki', type: 'mamul' }],
      routes: {
        50: { base: null, steps: [
          { id: '50-o10', seq: 10, opId: '13', stationId: '10', setup: 30, cycle: 4, alts: [], altTimes: {}, ins: [] },
          { id: '50-o20', seq: 20, opId: '14', stationId: null, fasonId: '900', terminGun: 3, setup: 0, cycle: 0, alts: [], altTimes: {}, ins: [] },
        ] },
        51: { base: null, steps: [{ id: '51-o10', seq: 10, opId: '14', stationId: null, fasonId: '900', terminGun: 5, setup: 0, cycle: 0, alts: [], altTimes: {}, ins: [] }] },
      },
    };
    const FIRMALAR = [{ id: '900', code: 'F1', name: 'Ornek Fason' }, { id: '901', code: null, name: 'Ornek Fason Iki' }];

    it('aktif fason firmalar fasoncu olur: süre adımların en büyük termin günü, çıkış çalışma günleri, aynı anda iş sınırı yok', async () => {
      const d = duzenek(FASON_KAYIT, Promise.resolve({ durum: { ...DURUM, fasonFirms: FIRMALAR }, ek: EK }));
      d.ac();
      await bekle();
      const D = d.S()?.D as { fasoncular: Nesne[]; urunler: Array<{ id: string; rota: Nesne[] }> };
      expect(D.fasoncular).toEqual([
        { id: '900', ad: 'Ornek Fason', kapasite: 999, sureGun: 5, cikisGunleri: ['pzt', 'sal'], cikisSaat: 16 },
        { id: '901', ad: 'Ornek Fason Iki', kapasite: 999, sureGun: 1, cikisGunleri: ['pzt', 'sal'], cikisSaat: 16 },
      ]);
      expect(D.urunler.find((u) => u.id === '50')?.rota[1]).toMatchObject({ fason: '900' });
    });

    it('sayfadaki fasoncu ayarı aynı kimlikte korunur, ad sahibinden gelir', async () => {
      const d = duzenek(FASON_KAYIT, Promise.resolve({ durum: { ...DURUM, fasonFirms: FIRMALAR }, ek: EK }));
      const S = d.ac() as { D: Nesne };
      S.D['fasoncular'] = [{ id: '900', ad: 'Eski ad', kapasite: 2, sureGun: 7, cikisGunleri: ['cum'], cikisSaat: 12 }];
      await bekle();
      expect((d.S()?.D as { fasoncular: Nesne[] }).fasoncular[0]).toEqual({ id: '900', ad: 'Ornek Fason', kapasite: 2, sureGun: 7, cikisGunleri: ['cum'], cikisSaat: 12 });
    });

    it('fason okuması yoksa (eski durum, yetki yok) kayıttaki fasoncular kalır', async () => {
      const d = duzenek(FASON_KAYIT, Promise.resolve({ durum: { ...DURUM, fasonFirms: null }, ek: EK }));
      d.ac();
      await bekle();
      expect((d.S()?.D as { fasoncular?: unknown }).fasoncular).toBeUndefined();
    });

    it('kayda yazarken fason adımın kendi termin günü korunur, firma süresiyle ezilmez', async () => {
      const d = duzenek(FASON_KAYIT, Promise.resolve({ durum: { ...DURUM, fasonFirms: FIRMALAR }, ek: EK }));
      d.ac();
      await bekle();
      const st = d.kur(d.S()?.D as Nesne, FASON_KAYIT) as { routes: Record<string, { steps: Array<{ terminGun: number | null }> }> };
      expect(st.routes['50']?.steps[1]?.terminGun).toBe(3);
      expect(st.routes['51']?.steps[0]?.terminGun).toBe(5);
    });
  });

  it('tezgâhın motor ayarları aynı kimlikte korunur; ad ve istasyon sahibinden gelir', async () => {
    const d = duzenek(KAYIT, Promise.resolve({ durum: DURUM, ek: EK }));
    const S = d.ac() as { D: Nesne };
    S.D['tezgahlar'] = [{ id: '100', ad: 'Eski ad', grup: '99', ucret: 1, verim: 0.5, vardiyalar: [], opOran: 0, aile: 'x' }];
    await bekle();
    const t = (d.S()?.D as { tezgahlar: Nesne[] }).tezgahlar[0];
    expect(t).toMatchObject({ id: '100', ad: 'Torna 1', grup: '10', verim: 0.5, aile: 'x' });
  });

  // 71 b
  const istasyonMaliyeti = (birimMaliyet: string | null): Nesne => ({
    ...DURUM, maliyet: { ...DURUM.maliyet, istasyon: birimMaliyet === null ? {} : { 10: { birimMaliyet, paraBirimi: 'TRY', surum: 2 } } },
  });
  const tezgahUcreti = async (tezgah: Nesne, birimMaliyet: string | null): Promise<Nesne | undefined> => {
    const d = duzenek(KAYIT, Promise.resolve({ durum: istasyonMaliyeti(birimMaliyet), ek: EK }));
    const S = d.ac() as { D: Nesne };
    S.D['tezgahlar'] = [{ id: '100', ad: 'Torna 1', grup: '10', verim: 1, vardiyalar: ['3'], opOran: 0, ...tezgah }];
    await bekle();
    return (d.S()?.D as { tezgahlar: Nesne[] }).tezgahlar.find((x) => x['id'] === '100');
  };

  it('elle değiştirilmemiş tezgâhın saat ücreti istasyon maliyetini izler; elle girilen korunur', async () => {
    expect(await tezgahUcreti({ ucret: 750, ucretIst: 750 }, '800.0000')).toMatchObject({ ucret: 800, ucretIst: 800 });
    expect(await tezgahUcreti({ ucret: 900, ucretIst: 750 }, '800.0000')).toMatchObject({ ucret: 900, ucretIst: 750 });
    // maliyeti önce okunamamış tezgâh maliyet gelince ücretini alır
    expect(await tezgahUcreti({ ucret: null, ucretIst: null }, '800.0000')).toMatchObject({ ucret: 800, ucretIst: 800 });
  });

  it('işareti olmayan eski tezgâh ücreti maliyete eşitse izlemeye girer, değilse elle sayılır; okunamayan maliyet ücreti silmez', async () => {
    expect(await tezgahUcreti({ ucret: 750 }, '750.0000')).toMatchObject({ ucret: 750, ucretIst: 750 });
    const elle = await tezgahUcreti({ ucret: 1 }, '750.0000');
    expect(elle).toMatchObject({ ucret: 1 }); expect(elle).not.toHaveProperty('ucretIst');
    expect(await tezgahUcreti({ ucret: 750, ucretIst: 750 }, null)).toMatchObject({ ucret: 750, ucretIst: 750 });
  });

  it('yeni tezgâh ücretini istasyondan alır ve izler', async () => {
    const d = duzenek(KAYIT, Promise.resolve({ durum: DURUM, ek: EK }));
    d.ac();
    await bekle();
    expect((d.S()?.D as { tezgahlar: Nesne[] }).tezgahlar[0]).toMatchObject({ ucret: 750, ucretIst: 750 });
  });
});

describe('adımın adedi (24 a): tek kaynak uretim-emirleri', () => {
  const ADET_KAYIT = {
    ...KAYIT,
    orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: null, due: null, priority: 2, status: 'uretimde' }],
    routes: { 50: { base: null, steps: [
      { id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 30, cycle: 4, alts: [], altTimes: {}, ins: [] },
      { id: '50-o20', seq: 20, opNo: 20, opId: '13', stationId: '10', setup: 30, cycle: 4, alts: [], altTimes: {}, ins: [] },
    ] } },
  };

  it('sunucunun adım adedi plan işine eşlenir, çalışmaya girer ve planı eskitir; eşlenemeyen anahtar yok sayılır', async () => {
    const d = duzenek(ADET_KAYIT, Promise.resolve({ durum: { ...DURUM, adimAdetleri: { 'E-1|20': 7, 'E-9|20': 3 } }, ek: EK }));
    const S0 = d.ac() as { dataVer: number };
    const v0 = S0.dataVer;
    await bekle();
    const D = d.S()?.D as { opAdet: Record<string, number>; urunler: Array<{ id: string; rota: Array<{ k: number }> }> };
    const k = D.urunler.find((u) => u.id === '50')?.rota[1]?.k;
    expect(D.opAdet).toEqual({ [`O1.${String(k)}`]: 7 });
    expect(d.S()?.dataVer).toBeGreaterThan(v0);
  });

  it('alan gelmezse (eski durum, emir yetkisi yok) adım adedine dokunulmaz', async () => {
    const d = duzenek(ADET_KAYIT, Promise.resolve({ durum: { ...DURUM, adimAdetleri: null }, ek: EK }));
    d.ac();
    await bekle();
    expect((d.S()?.D as { opAdet?: unknown }).opAdet).toBeUndefined();
  });
});
