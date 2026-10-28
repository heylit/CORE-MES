import { describe, expect, it } from 'vitest';
import { planlamaMotoru } from './planlama-derle.ts';

// Sayfanın stOf'u ve sunucu aynı st'yi motor/durum.betik stTamKur ile kurar. Burada açık çalışma (global S) yokken, sunucudaki gibi,
// ayarların st'ye girdiği sınanır. Veriler uydurmadır.

type Nesne = Record<string, unknown>;
interface Siparis extends Nesne { id: string; oncelik: unknown; cezaGun: number; pay: number }
interface St extends Nesne {
  D: { siparisler: Siparis[]; tezgahlar: Array<Nesne & { ucret: number | null }> };
  w: Nesne; tlAmac: Nesne & { kT: number }; wipP: Nesne & { erken: Record<string, number> }; ayariOneAl: boolean;
}
interface Motor {
  girdiKur: (calisma: Nesne, kayit: Nesne, kaynak: Nesne, bugun: string) => { S: Nesne & { D: Nesne }; st: St } | null;
  stTamKur: (S: Nesne) => St;
  karar1650Goc: (S: Nesne) => boolean;
  agHazirla: (D: Nesne) => void;
  PW: Record<string, number>;
  AG_BIRIM: number;
}
const motorKur = (): Motor => new Function(`${planlamaMotoru()}
return { girdiKur, stTamKur, karar1650Goc, agHazirla, PW, AG_BIRIM };`)() as Motor;
const kopya = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const KAYIT = {
  version: 7, savedAt: 9,
  items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: { id: '100', ad: '100', grup: '10', ucret: 750, verim: 1, vardiyalar: ['3'], opOran: 1 } }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] }] } },
  orders: [
    { id: 'O1', no: 'E-1', itemId: '50', qty: 4, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'serbest' },
    { id: 'O2', no: 'E-2', itemId: '50', qty: 8, start: '2026-10-19', due: '2026-10-21', priority: 1, status: 'serbest' },
  ],
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
  D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'uyari', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], kisitSurum: 2, olaylar: [], plan: null,
};

function kur(): { m: Motor; S: Nesne & { D: Nesne }; st: St } {
  const m = motorKur();
  const g = m.girdiKur(kopya(CALISMA), kopya(KAYIT), kopya(KAYNAK), '2026-10-19');
  if (!g) throw new Error('çalışma kurulamadı');
  return { m, S: g.S, st: g.st };
}

describe('tam st (stTamKur)', () => {
  it('sunucunun döndürdüğü st, çalışmadan yeniden kurulanla aynı; 1650 göçü bir kez yapılır', () => {
    const { m, S, st } = kur();
    expect(S['karar1650']).toBe(1);
    expect((S['w'] as Nesne)['mat']).toBe('karma');
    expect(S.D['planDenge']).toBe(25);
    expect(m.karar1650Goc(S)).toBe(false);
    // yıllık ayar ilk kurulumda çalışmaya yazılır; ilk st'nin verisi ondan önce kopyalanmıştır (sayfada da böyle)
    const yeni = kopya(m.stTamKur(kopya(S))) as St & { D: Nesne };
    expect(yeni.D['yillik']).toEqual(S.D['yillik']); delete yeni.D['yillik'];
    expect(yeni).toEqual(kopya(st));
  });

  it('815: ağırlık emrin önceliğinden gelir, kayıttaki bedel kipi de; TL amacı kapalı; denge, karma malzeme, erken sevk ve ayar önde st\'ye girer', () => {
    const { m, S } = kur();
    S.D['planTL'] = { operatorUcret: 100, amac: 'tl', risk: 0.5 }; S.D['planDenge'] = 0; S.D['planAgirlik'] = { kip: 'bedel' };
    (S.D['siparisler'] as Nesne[])[0]!['erkenSevk'] = 1;
    S['param'] = { ...(S['param'] as Nesne), ayariOneAl: 'acik' };
    const st = m.stTamKur(S);
    expect(st.D.siparisler.length).toBeGreaterThan(0);
    for (const s of st.D.siparisler) {
      expect([1, 2, 3]).toContain(s.oncelik);
      expect(m.PW[String(s.oncelik)]).toBeGreaterThan(0);
    }
    expect(st.D.tezgahlar[0]!.ucret).toBe(850);
    // 590: personel kısıtı kapalıyken oran kapasiteden düşer, operatör ücreti TL amacında kalır
    expect(m.stTamKur({ ...S, kapali: ['personel'] }).D.tezgahlar[0]!.ucret).toBe(850);
    expect(st.tlAmac).toMatchObject({ ac: false, birim: m.AG_BIRIM, risk: 0.5, kT: 100, chgTL: 0 });
    expect(st.w).toMatchObject({ mat: 'sert', matKarma: true });
    expect(st.wipP.erken).toEqual({ [st.D.siparisler[0]!.id]: 1 });
    expect(st.ayariOneAl).toBe(true);
  });

  it('72 a: sunucuda uydurma müşteri atanmaz; kayıttan kalan uydurma müşteri silinir, gerçeği kalır', () => {
    const { m, S } = kur();
    expect(S.D['musteriler']).toEqual([]);
    expect((S.D['siparisler'] as Nesne[]).every((s) => s['musteri'] === undefined)).toBe(true);
    const D: Nesne = {
      musteriler: [{ id: 'MU-1', ad: 'Müşteri 1', sinif: 'A', cezaOran: 0.3, cezaTavan: 10 }, { id: 'MU-2', ad: 'Ornek firma', sinif: 'B', cezaOran: null, cezaTavan: null }],
      siparisler: [{ id: 'O1', musteri: 'MU-1', oncelik: 2 }, { id: 'O2', musteri: 'MU-2', oncelik: 2 }],
    };
    m.agHazirla(D);
    expect(D['musteriler']).toEqual([{ id: 'MU-2', ad: 'Ornek firma', sinif: 'B', cezaOran: null, cezaTavan: null }]);
    expect((D['siparisler'] as Nesne[]).map((s) => s['musteri'])).toEqual([undefined, 'MU-2']);
  });
});
