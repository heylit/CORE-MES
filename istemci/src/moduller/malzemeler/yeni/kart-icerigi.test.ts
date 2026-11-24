import { describe, expect, test } from 'vitest';
import { kartIcerigiDegistiMi } from './kart-icerigi.ts';
import { ornekKayit } from './ornek-veri.ts';
import { kayitTamamla, type KartKaydi } from './tipler.ts';

// Her tür için kartın bütün alanları dolu bir taban; testte her yaprak tek tek değiştirilir.
const taban = (tur: KartKaydi['tur']): KartKaydi => kayitTamamla({
  ...ornekKayit('ORN-1', 'ORN-00001', 'ORN kart', tur),
  g: {
    kat: 'ORN-kat', yerlilik: 62.5, tedarik: 'Üretim', marka: 'ORN-marka', urunKodu: 'ORN-uk', gtin: '0000000000000', gtip: '8412.21', mensei: 'Türkiye',
    depoYeri: 'ORN-A1', siparisNoktasi: 5, net: 3, aletNo: 'ORN-9', aciklama: 'ORN',
  },
  bom: [{ id: 'b1', miktar: 1, birim: 'adet', fire: 2 }],
  ops: [{ kod: 'ORN-OP1', ad: 'Tornalama', sure: 10 }],
  tol: 'ISO 2768-m', dims: { d: 20, l: 100 }, opts: { isil: 'ORN' }, ov: { x: 1 }, extra: [{ ad: 'ORN-ozellik', v: 1 }], stds: ['ORN-std'],
  com: {
    kod: 'ORN-00001', ad: 'ORN kart', std: 'ORN', ted: 'ORN-ted', tedId: 3, birim: 'adet', sertifika: ['CE'], not: 'ORN-not', eskiKod: 'ORN-e', firmaKodu: 'ORN',
    gkk: true, skt: true, alisBirimi: 'kutu', alisKatsayisi: '50', grup: 'ORN-g',
  },
});

const klon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

describe('kartIcerigiDegistiMi', () => {
  test('aynı kart değişiklik değildir', () => {
    expect(kartIcerigiDegistiMi(taban('mamul'), klon(taban('mamul')))).toBe(false);
  });

  test.each(['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas', 'hizmet', 'ticari_mal'] as const)('%s: g ve com altındaki her alan değişiklik sayılır', (tur) => {
    const t = taban(tur);
    for (const k of Object.keys(t.g)) {
      const y = klon(t);
      y.g[k] = typeof t.g[k] === 'number' ? 100 : 'ORN-degisti';
      expect(kartIcerigiDegistiMi(t, y), `g.${k}`).toBe(true);
    }
    for (const k of Object.keys(t.com).filter((x) => !['kod', 'ad'].includes(x))) {
      const y = klon(t);
      y.com[k] = typeof t.com[k] === 'boolean' ? !t.com[k] : Array.isArray(t.com[k]) ? ['CE', 'ORN-yeni'] : typeof t.com[k] === 'number' ? 99 : 'ORN-degisti';
      expect(kartIcerigiDegistiMi(t, y), `com.${k}`).toBe(true);
    }
  });

  test('kartın öteki bölümleri de değişiklik sayılır: reçete, rota, ölçü, tolerans, seçenek, ek özellik, standart', () => {
    const t = taban('mamul');
    const degisiklikler: ((y: KartKaydi) => void)[] = [
      (y) => { y.bom[0]!.miktar = 2; }, (y) => { y.bom.push({ id: 'b2' }); }, (y) => { y.ops[0]!['sure'] = 11; }, (y) => { y.ops = []; },
      (y) => { y.dims['d'] = 21; }, (y) => { y.tol = 'ISO 2768-f'; }, (y) => { y.opts['isil'] = 'ORN2'; }, (y) => { y.extra[0]!['v'] = 2; },
      (y) => { y.stds = ['ORN-std2']; }, (y) => { y.fam = 'ORN-aile'; }, (y) => { y.grade = 'ORN-kalite'; }, (y) => { y.form = 'ORN-form'; },
    ];
    for (const [i, d] of degisiklikler.entries()) {
      const y = klon(t);
      d(y);
      expect(kartIcerigiDegistiMi(t, y), `değişiklik ${String(i)}`).toBe(true);
    }
  });

  test('geçmiş, damga, talep ve stok kodu ve ekranın türettiği alanlar içerik değildir (reddedilen)', () => {
    const t = taban('mamul');
    const y = klon(t);
    y.rev = [{ t: 1, by: 1 }];
    y.updatedAt = 5;
    y.onay = { durum: 'aktif', onay: { by: 1, t: 2 } };
    y.talep = { id: 'x', durum: 'beklemede', yeni: klon(t), farklar: [], by: 1, t: 3 };
    y.com.kod = 'ORN-00002';
    y.com['tkod'] = 'ORN-T';
    y.com['ac1'] = 'ORN-ac';
    y['acManual'] = [true, false, false];
    y.kodManual = true;
    expect(kartIcerigiDegistiMi(t, y)).toBe(false);
  });

  test('anahtar sırası ve tanımsız değer fark değildir', () => {
    const t = taban('mamul');
    const y = { ...klon(t), g: { ...Object.fromEntries(Object.entries(t.g).reverse()), yok: undefined } };
    expect(kartIcerigiDegistiMi(t, y)).toBe(false);
  });
});
