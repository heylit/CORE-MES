import { describe, expect, it } from 'vitest';
import {
  ayEkle, devDurumu, dofGecikti, gunKaldi, icinde, izFarki, karakteristikSonucu, karantina, kilitliMi, lottanNcr, parcaDizini, parcaDurumu, tedarikciNotu,
  tedarikciPpm, tedarikciRiski,
} from './kurallar.ts';

const BUGUN = '2026-03-15';

describe('tarih', () => {
  it('ay ekleme ayın son gününe iner; gün farkı ve aralık', () => {
    expect(ayEkle('2026-01-31', 1)).toBe('2026-02-28');
    expect(ayEkle('', 1)).toBe('');
    expect(gunKaldi('2026-03-20', BUGUN)).toBe(5);
    expect(icinde('2026-03-10', 30, BUGUN)).toBe(true);
    expect(icinde('2026-03-20', 30, BUGUN)).toBe(false);
  });
});

describe('cihaz, tedarikçi, DÖF', () => {
  it('cihaz durumu: kayıt yok, süresi doldu, yaklaşıyor, geçerli, kullanım dışı', () => {
    expect(devDurumu({ _id: 'd' }, BUGUN).metin).toBe('Kayıt yok');
    expect(devDurumu({ _id: 'd', sonKal: '2025-01-01', periyot: 12 }, BUGUN)).toMatchObject({ metin: 'Süresi doldu', kullanilir: false });
    expect(devDurumu({ _id: 'd', sonKal: '2025-04-01', periyot: 12 }, BUGUN)).toMatchObject({ metin: 'Yaklaşıyor', kullanilir: true, sonraki: '2026-04-01' });
    expect(devDurumu({ _id: 'd', sonKal: '2026-01-01', periyot: 12 }, BUGUN).metin).toBe('Geçerli');
    expect(devDurumu({ _id: 'd', kullanimDisi: true, sonKal: '2026-01-01' }, BUGUN).kullanilir).toBe(false);
  });

  it('tedarikçi riski ve sınıfı', () => {
    const s = { _id: 's1', sertBitis: '2026-04-01', kategori: 'Distribütör', yetkili: 'Hayır', onay: 'Askıda', kaliteSkor: 60 };
    const ncr = [1, 2, 3].map((i) => ({ _id: `n${i}`, tedarikci: 's1', tarih: '2026-02-01' }));
    expect(tedarikciRiski(s, ncr, BUGUN)).toEqual(['Sertifika 17 gün içinde bitiyor', 'Sahte parça riski: yetkisiz kaynak', 'Onay askıda', 'Son 12 ayda 3 uygunsuzluk', 'Kalite skoru 70 altında']);
    expect(tedarikciNotu({ kaliteSkor: 90, teslimatSkor: 80 }).metin).toBe('A');
    expect(tedarikciNotu({ kaliteSkor: 70, teslimatSkor: 70 }).metin).toBe('B');
    expect(tedarikciNotu({}).metin).toBe('C');
  });

  it('DÖF gecikmesi kapalıda yok', () => {
    expect(dofGecikti({ _id: 'c', durum: 'Açık', termin: '2026-03-01' }, BUGUN)).toBe(true);
    expect(dofGecikti({ _id: 'c', durum: 'Kapalı', termin: '2026-03-01' }, BUGUN)).toBe(false);
  });
});

describe('muayene ve kilit', () => {
  it('karakteristik sonucu tolerans içinde OK, dışında NOK, nitelde seçimle', () => {
    expect(karakteristikSonucu({ nominal: '10', alt: '0,1', ust: '0,1', olcum: '10,1' })).toBe('OK');
    expect(karakteristikSonucu({ nominal: '10', alt: '0,1', ust: '0,1', olcum: '10,2' })).toBe('NOK');
    expect(karakteristikSonucu({ nominal: '10', olcum: '' })).toBe('');
    expect(karakteristikSonucu({ tip: 'Nitel', olcum: 'Uygun değil' })).toBe('NOK');
  });

  it('tamamlanmış kayıt kilitli', () => {
    expect(kilitliMi('insp', { _id: 'i', sonuc: 'Kabul' })).toBe(true);
    expect(kilitliMi('insp', { _id: 'i', sonuc: 'Beklemede' })).toBe(false);
    expect(kilitliMi('ncr', { _id: 'n', durum: 'Kapalı' })).toBe(true);
    expect(kilitliMi('lot', { _id: 'l', karar: 'Ret', tip: 'reset' })).toBe(false);
    expect(kilitliMi('frm', { _id: 'f', durum: 'Onaylandı' })).toBe(true);
    expect(kilitliMi('sup', { _id: 's', durum: 'Kapalı' })).toBe(false);
  });
});

describe('karantina ve parça dizini', () => {
  const ncr = [{ _id: 'n1', no: 'NCR-1', durum: 'Açık', ciddiyet: 'Kritik', parcaNo: 'P1', tarih: '2026-03-01', miktar: 5 }];
  const insp = [{ _id: 'i1', no: 'MUA-1', sonuc: 'Beklemede', tur: 'FAI', parcaNo: 'P2', tarih: '2026-03-10' }];
  const lot = [{ _id: 'l1', no: 'LOT-1', karar: 'Ret', parcaNo: 'P3', lotNo: 'A', N: 100, tarih: '2026-03-12', bKr: 0, bMj: 3, bMn: 1, tedarikci: 's1' }];

  it('karar bekleyenler kötüden iyiye, eski önce; reddedilen lottan NCR ön değeri', () => {
    const q = karantina({ ncr, insp, lot }, BUGUN);
    expect(q.map((x) => x.ref)).toEqual(['NCR-1', 'LOT-1', 'MUA-1']);
    expect(q[1]!.gecis).toMatchObject({ ac: 'yeni', on: { parcaNo: 'P3', lot: 'A', ciddiyet: 'Majör', kaynak: 'Giriş muayene' } });
    expect(lottanNcr(lot[0]!).tanim).toContain('3 / 1');
  });

  it('parça dizini kayıtlardan türer, durum en ağırdan', () => {
    const d = parcaDizini({ cizim: [], insp, ncr, lot, spc: [], capa: [{ _id: 'c1', ncrRef: 'n1' }], parca: [{ _id: 'p', parcaNo: 'p1', ad: 'Mil' }] });
    const p1 = d.find((p) => p.k === 'P1')!;
    expect(p1.ad).toBe('Mil');
    expect(p1.capa).toHaveLength(1);
    expect(parcaDurumu(p1).metin).toBe('Kritik NCR');
    expect(parcaDurumu(d.find((p) => p.k === 'P3')!).metin).toBe('Ret');
  });

  it('tedarikçi ppm; teslim yoksa null', () => {
    expect(tedarikciPpm({ lot, insp: [], ncr: [{ _id: 'n', tedarikci: 's1', tarih: '2026-03-13', miktar: 2 }] }, 30, BUGUN).toplam).toBe(20000);
    expect(tedarikciPpm({ lot: [], insp: [], ncr: [] }, 30, BUGUN).toplam).toBeNull();
  });
});

describe('değişiklik izi', () => {
  it('alan adlarıyla fark; damga sayılmaz, PIN gizli', () => {
    expect(izFarki(null, { a: 1 })).toEqual([]);
    expect(izFarki({ durum: 'Açık', guncelleme: 'x', pin: '1' }, { durum: 'Kapalı', guncelleme: 'y', pin: '2' }))
      .toEqual([{ alan: 'Durum', eski: 'Açık', yeni: 'Kapalı' }, { alan: 'PIN', eski: '***', yeni: '***' }]);
  });
});
