import { describe, expect, it } from 'vitest';
import { BASLAMAMIS_IS_ILETISI, DURUSTA_SAYIM_ILETISI, HAZIRLIKTA_SAYIM_ILETISI, baslatmaGeriAlma, baslatmaGeriUygula, bitenleriAyir, durumEsitle, durumEsitleme, durumIletisi, logRetleri, gecikmeliRet, sayimGeriAlma, sayimGeriUygula, sayimKapali, sayimKapaliNedeni, tmiBitti } from '../../../../arkon/web/src/data/biten-is.ts';

// Kart #1194: biten işte sağlam, hurda, toplu giriş ve sayaç düzeltmesi kapalıdır.
describe('Arkon biten iş sayaç kilidi', () => {
  it('biten işte sayaç kapalı', () => {
    expect(sayimKapali({ state: 'done' })).toBe(true);
  });

  it('çalışan, duraklamış ve ayardaki işte sayaç açık; boş iş ve iş yoksa kapalı', () => {
    expect(['running', 'paused', 'setup'].map((state) => sayimKapali({ state }))).toEqual([false, false, false]);
    expect(sayimKapali({ state: 'queued', empty: true })).toBe(true);
    expect(sayimKapali(null)).toBe(true);
  });
});

describe('Arkon sayım: TMI\'nin kabul etmediği durumda kapalı, ret gelince geri döner', () => {
  it('başlamamış (kuyruktaki) ve durmuş işte sayaç kapalı, nedeni söylenir', () => {
    expect(sayimKapaliNedeni({ state: 'queued' })).toBe(BASLAMAMIS_IS_ILETISI);
    expect(sayimKapaliNedeni({ state: 'stopped' })).toBe(DURUSTA_SAYIM_ILETISI);
    expect(sayimKapaliNedeni({ state: 'running' })).toBeNull();
  });

  it('reddedilen sağlam ve hurda kaydı kendi işinde ters farkla geri alınır; sayı sıfırın altına inmez', () => {
    const isler = [{ no: 'E1', pkg: { id: 'tmi-ie-5' }, good: 10, scrap: 1 }, { no: 'E2', pkg: { id: 'tmi-ie-6' }, good: 3, scrap: 0 }];
    const iyi = sayimGeriAlma({ kind: 'counts', row: { kind: 'good', delta: 2, orderNo: 'E1', pkgId: 'tmi-ie-5' } });
    expect(iyi).toEqual({ orderNo: 'E1', pkgId: 'tmi-ie-5', alan: 'good', fark: -2 });
    expect(sayimGeriUygula(isler, iyi!).map((x) => [x.good, x.scrap])).toEqual([[8, 1], [3, 0]]);
    const hurdaEksi = sayimGeriAlma({ kind: 'counts', row: { kind: 'scrap', delta: -1, orderNo: 'E1', pkgId: 'tmi-ie-5' } });
    expect(sayimGeriUygula(isler, hurdaEksi!)[0]?.scrap).toBe(2);
    const fazla = sayimGeriAlma({ kind: 'counts', row: { kind: 'scrap', delta: 5, orderNo: 'E2', pkgId: 'tmi-ie-6' } });
    expect(sayimGeriUygula(isler, fazla!)[1]?.scrap).toBe(0);
    const baskaPaket = sayimGeriAlma({ kind: 'counts', row: { kind: 'good', delta: 1, orderNo: 'E1', pkgId: 'tmi-ie-9' } });
    expect(sayimGeriUygula(isler, baskaPaket!)).toEqual(isler);
  });

  it('sayım dışı ya da eksik kayıt geri alınmaz', () => {
    expect(sayimGeriAlma({ kind: 'events', row: { kind: 'good', delta: 1, orderNo: 'E1' } })).toBeNull();
    expect(sayimGeriAlma({ kind: 'counts' })).toBeNull();
    expect(sayimGeriAlma({ kind: 'counts', row: { kind: 'good', delta: 0, orderNo: 'E1' } })).toBeNull();
    expect(sayimGeriAlma({ kind: 'counts', row: { kind: 'good', delta: 1 } })).toBeNull();
    expect(sayimGeriAlma(null)).toBeNull();
  });

  it('kayıt cevabındaki reddedilen satırlar okunur; bozuk satır ve listesiz cevap atlanır', () => {
    expect(logRetleri({ eklenen: 1, reddedilen: [{ cid: 'a', ileti: 'Yalnız başlamış emirde sayım ve duruş işlemi yapılır.' }, { cid: 1 }], uyarilar: [] }))
      .toEqual([{ cid: 'a', ileti: 'Yalnız başlamış emirde sayım ve duruş işlemi yapılır.' }]);
    expect([logRetleri(undefined), logRetleri({ eklenen: 1 })]).toEqual([[], []]);
  });
});

// Uçtan uca deneme Y2: hazırlıkta numune kalitede beklerken İyi +1 sayıyordu; o adet işin sonunda iyi parçaya katıldı.
describe('Arkon sayım: hazırlıkta iyi parça kapalı', () => {
  it('hazırlıkta iyi parça sayımı kapalı ve nedeni söylenir', () => {
    expect(sayimKapaliNedeni({ state: 'setup' }, 'good')).toBe(HAZIRLIKTA_SAYIM_ILETISI);
    expect(sayimKapali({ state: 'setup' }, 'good')).toBe(true);
  });
  it('hazırlık hurdası açık; çalışan işte iyi parça açık', () => {
    expect(sayimKapali({ state: 'setup' }, 'scrap')).toBe(false);
    expect(sayimKapali({ state: 'running' }, 'good')).toBe(false);
  });
});

describe('Arkon biten işler', () => {
  it('TMI\'de biten emrin paketi tmi.bitti taşır; taşımayan ya da paketsiz iş bitmiş sayılmaz', () => {
    expect(tmiBitti({ tmi: { bitti: true } })).toBe(true);
    expect([tmiBitti({ tmi: {} }), tmiBitti({ tmi: null }), tmiBitti(null), tmiBitti({ tmi: { bitti: 'evet' } })]).toEqual([false, false, false, false]);
  });

  it('kuyrukta açık işler önce, biten işler ayrı; her iş listedeki yerini korur', () => {
    const isler = [{ no: 'A', state: 'done' }, { no: 'B', state: 'running' }, { no: 'C', state: 'queued' }, { no: 'D', state: 'done' }];
    const { acik, biten } = bitenleriAyir(isler);
    expect(acik.map(([is, sira]) => `${is.no}${sira}`)).toEqual(['B1', 'C2']);
    expect(biten.map(([is, sira]) => `${is.no}${sira}`)).toEqual(['A0', 'D3']);
  });
});

// Kart #1285: sunucu başlatmayı reddedince (sırası gelmemiş adım, canlı plan, parti kuralı, TMI reddi) terminal işi çalışıyor göstermez.
describe('Arkon başlatma reddi: iş durumu geri döner', () => {
  it('yalnız reddedilen başlatma kaydı geri alınır; sayım ve öteki durumlar alınmaz', () => {
    expect(baslatmaGeriAlma({ kind: 'events', row: { state: 'running', orderNo: 'E1', pkgId: 'tmi-ie-5' } })).toEqual({ orderNo: 'E1', pkgId: 'tmi-ie-5' });
    expect(baslatmaGeriAlma({ kind: 'events', row: { state: 'paused', orderNo: 'E1', pkgId: 'tmi-ie-5' } })).toBeNull();
    expect(baslatmaGeriAlma({ kind: 'counts', row: { state: 'running', orderNo: 'E1' } })).toBeNull();
    expect(baslatmaGeriAlma({ kind: 'events', row: { state: 'running', orderNo: '' } })).toBeNull();
  });

  it('üretimi olmayan iş kuyruğa, üretimi olan iş duraklamaya döner; başka paketin ve çalışmayan işin durumu değişmez', () => {
    const isler = [
      { no: 'E1', pkg: { id: 'tmi-ie-5' }, state: 'running', good: 0, scrap: 0, startedAt: 1 },
      { no: 'E1', pkg: { id: 'tmi-ie-6' }, state: 'running', good: 4, scrap: 1 },
      { no: 'E2', pkg: { id: 'tmi-ie-7' }, state: 'paused', good: 0, scrap: 0 },
    ];
    const ilk = baslatmaGeriUygula(isler, { orderNo: 'E1', pkgId: 'tmi-ie-5' });
    expect(ilk.map((x) => x.state)).toEqual(['queued', 'running', 'paused']);
    expect(ilk[0]?.startedAt).toBeUndefined();
    expect(baslatmaGeriUygula(isler, { orderNo: 'E1', pkgId: 'tmi-ie-6' }).map((x) => x.state)).toEqual(['running', 'paused', 'paused']);
    expect(baslatmaGeriUygula(isler, { orderNo: 'E2', pkgId: 'tmi-ie-7' })).toEqual(isler);
  });
});

describe('Arkon durum eşitleme: ret gelince terminal işin TMI hâlini gösterir', () => {
  const row = { orderNo: 'E-1', pkgId: 'tmi-ue-1', state: 'paused' };
  it('yalnız durum kaydında ve bilinen hâlde eşitler', () => {
    expect(durumEsitleme({ kind: 'events', row, tmiDurum: 'running' })).toEqual({ orderNo: 'E-1', pkgId: 'tmi-ue-1', state: 'running' });
    expect(durumEsitleme({ kind: 'events', row })).toBeNull();
    expect(durumEsitleme({ kind: 'events', row, tmiDurum: 'setup' })).toBeNull();
    expect(durumEsitleme({ kind: 'counts', row, tmiDurum: 'running' })).toBeNull();
  });
  it('duraklatma yazılmadıysa iş çalışıyor görünür; kuyruğa dönüşte başlama anı silinir; başka iş değişmez', () => {
    const isler = [
      { no: 'E-1', pkg: { id: 'tmi-ue-1' }, state: 'paused', good: 3, scrap: 0, startedAt: 5 },
      { no: 'E-2', pkg: { id: 'tmi-ue-2' }, state: 'paused', good: 0, scrap: 0, startedAt: 5 },
    ];
    const es = durumEsitleme({ kind: 'events', row, tmiDurum: 'running' })!;
    expect(durumEsitle(isler, es).map((i) => i.state)).toEqual(['running', 'paused']);
    const kuyruk = durumEsitle(isler, { ...es, state: 'queued' })[0]!;
    expect([kuyruk.state, kuyruk.startedAt]).toEqual(['queued', undefined]);
  });
  it('kayıt cevabındaki TMI hâli korunur', () => {
    expect(logRetleri({ reddedilen: [{ cid: 'a', ileti: 'x', tmiDurum: 'running' }] })).toEqual([{ cid: 'a', ileti: 'x', tmiDurum: 'running' }]);
  });
});

describe('durumIletisi: devralma sonrası TMI hâli', () => {
  const ileti = { type: '$durum', machine: 'DN-TORNA-1', orderNo: 'UE-1', state: 'paused' };
  it('yalnız bu istasyonun geçerli $durum iletisini alır', () => {
    expect(durumIletisi(ileti, 'DN-TORNA-1')).toEqual({ orderNo: 'UE-1', pkgId: undefined, state: 'paused' });
    expect(durumIletisi(ileti, 'DN-FREZE-1')).toBeNull();
    expect(durumIletisi({ ...ileti, type: 'pkg' }, 'DN-TORNA-1')).toBeNull();
    expect(durumIletisi({ ...ileti, state: 'x' }, 'DN-TORNA-1')).toBeNull();
    expect(durumIletisi({ ...ileti, orderNo: '' }, 'DN-TORNA-1')).toBeNull();
  });
  it('emrin bu istasyondaki bütün işlerini eşitler, ötekilere dokunmaz', () => {
    const isler = [
      { no: 'UE-1', pkg: { id: 'p1' }, state: 'running', good: 3, scrap: 0 },
      { no: 'UE-1', pkg: null, state: 'running', good: 0, scrap: 0 },
      { no: 'UE-2', pkg: { id: 'p2' }, state: 'running', good: 1, scrap: 0 },
    ];
    const e = durumIletisi(ileti, 'DN-TORNA-1')!;
    expect(durumEsitle(isler, e).map((x) => x.state)).toEqual(['paused', 'paused', 'running']);
  });
});

// Denetim #24: sonradan TMI'ye yazılamayan sayım `$tmiRet` iletisiyle gelir; yalnız sayımı yapan kişinin tableti geri çevirir.
describe('Arkon gecikmeli sayım reddi', () => {
  const row = { cid: 'c1', kind: 'scrap', delta: 2, orderNo: 'UE-1', pkgId: 'tmi-ue-1', userId: '7' };
  const m = { type: '$tmiRet', kind: 'counts', cid: 'c1', row, ileti: 'Hurda nedeni yok' };

  it('sayımı yapan kişide cevaptaki retle aynı ayrıntıyı verir; sayı geri çevrilir', () => {
    const d = gecikmeliRet(m, '7');
    expect(d).toEqual({ store: 'log_counts', kind: 'counts', id: 'c1', cid: 'c1', row, msg: 'Hurda nedeni yok' });
    expect(sayimGeriAlma(d)).toEqual({ orderNo: 'UE-1', pkgId: 'tmi-ue-1', alan: 'scrap', fark: -2 });
  });

  it('başka kişide, oturumsuzda ve başka iletide yok', () => {
    expect([gecikmeliRet(m, '8'), gecikmeliRet(m, undefined), gecikmeliRet({ ...m, type: '$log' }, '7'), gecikmeliRet({ ...m, row: null }, '7'), gecikmeliRet(null, '7')])
      .toEqual([null, null, null, null, null]);
  });
});
