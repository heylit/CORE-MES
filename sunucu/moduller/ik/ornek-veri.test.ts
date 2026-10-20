import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kisiNoKullaniciAdindan, kullaniciYukle } from '../kisiler/disari.ts';
import { ornekTckn } from './ornek-veri.ts';
import { veriGetir } from './servis.ts';

test('örnek T.C. kimlik açıkça uydurma ve denetim haneleri doğru', () => {
  for (let i = 1; i <= 10; i++) {
    const t = ornekTckn(i);
    assert.match(t, /^1000000\d{4}$/);
    const d = t.split('').map(Number);
    assert.equal(((((d[0]! + d[2]! + d[4]! + d[6]! + d[8]!) * 7 - (d[1]! + d[3]! + d[5]! + d[7]!)) % 10) + 10) % 10, d[9]);
    assert.equal(d.slice(0, 10).reduce((a, b) => a + b, 0) % 10, d[10]);
  }
  assert.equal(new Set(Array.from({ length: 10 }, (_, i) => ornekTckn(i + 1))).size, 10);
});

describe('İK örnek verisi (göçlü test şeması, gerekir zinciriyle)', () => {
  let ortam: TestVeritabani | undefined;
  before(async () => { ortam = await testVeritabaniKur('ik_ornek'); });
  after(async () => { await ortam?.kaldir(); });

  test('kisiler ve istasyonlardan sonra yüklenir; ikinci koşu yüklü döner', async () => {
    const vt = ortam!.vt;
    const hepsi = await modulOrnekVerileriniKesfet();
    const liste = hepsi.filter((t) => ['kisiler', 'istasyonlar', 'ik'].includes(t.modul));
    const secenek = { ortam: 'test' as const, bildir: () => undefined };
    assert.equal((await ornekVeriYukle(vt, liste, secenek)).durum, 'yuklendi');

    const veri = await vt.tx(async (db) => {
      const yon = await kullaniciYukle(db, (await kisiNoKullaniciAdindan(db, 'ornek.yonetici'))!);
      return veriGetir(db, yon!);
    });
    const tur = (t: string) => veri.kayitlar.filter((k) => k.tur === t);
    assert.equal(tur('emp').length, 12);
    assert.ok(tur('emp').every((k) => String(k.govde['sicilNo']).startsWith('ORN-') && k.govde['kisiId'] !== undefined));
    assert.equal(tur('dept').length, 6);
    assert.deepEqual(tur('leave').map((k) => k.govde['durum']).sort(), ['Beklemede', 'Onaylandı']);
    assert.equal(tur('att').length, 3);
    assert.equal(tur('train').length, 1);

    assert.equal((await ornekVeriYukle(vt, liste, secenek)).durum, 'yuklu');
    assert.equal((await vt.tx(async (db) => veriGetir(db, (await kullaniciYukle(db, (await kisiNoKullaniciAdindan(db, 'ornek.yonetici'))!))!))).kayitlar.length, veri.kayitlar.length);
  });
});
