import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import type { KopruIstemcisi } from './kopru.ts';
import { pakettekiOzet, surumuYorumla, yardimciKaynakOzeti, yardimciSurumu, yardimciSurumunuSor } from './yardimci-surumu.ts';

const Z = new Date('2026-11-16T09:00:00Z');

describe('3314 Logo yardımcısı sürümü', () => {
  test('özet: ad sırası, satır sonu ve BOM farkı özeti değiştirmez; test ve üretilen dosyalar sayılmaz; içerik değişince değişir', () => {
    const a = yardimciKaynakOzeti([{ ad: 'B.cs', icerik: 'b\r\n' }, { ad: 'A.cs', icerik: '﻿a\n' }]);
    assert.equal(a, yardimciKaynakOzeti([{ ad: 'A.cs', icerik: 'a\n' }, { ad: 'B.cs', icerik: 'b\n' }]));
    assert.equal(a, yardimciKaynakOzeti([{ ad: 'A.cs', icerik: 'a\n' }, { ad: 'B.cs', icerik: 'b\n' }, { ad: 'Testler.cs', icerik: 'x' }, { ad: 'Surum.g.cs', icerik: 'y' },
      { ad: 'SahteLogo.cs', icerik: 'z' }, { ad: 'SurumUret.cs', icerik: 'w' }, { ad: 'derle.cmd', icerik: 'q' }]));
    assert.notEqual(a, yardimciKaynakOzeti([{ ad: 'A.cs', icerik: 'a2\n' }, { ad: 'B.cs', icerik: 'b\n' }]));
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  test('paketteki özet depodaki kaynaktan okunur; klasör yoksa null', async () => {
    assert.match((await pakettekiOzet()) ?? '', /^[0-9a-f]{64}$/);
    assert.equal(await pakettekiOzet('/yok/boyle/bir/klasor/'), null);
  });

  test('yorum: aynı, farklı, eski (uç yok, 404) ve ulaşılamadı; ileti ne yapılacağını söyler', () => {
    const p = 'a'.repeat(64);
    assert.equal(surumuYorumla(p, { durum: 200, govde: { kaynakOzeti: p, derlemeZamani: '2026-11-16T08:00:00Z' } }, Z).durum, 'ayni');
    const f = surumuYorumla(p, { durum: 200, govde: { kaynakOzeti: 'b'.repeat(64), derlemeZamani: '2026-11-13T08:00:00Z' } }, Z);
    assert.equal(f.durum, 'farkli');
    assert.match(f.ileti, /güncelleyin/);
    assert.equal(f.derlemeZamani, '2026-11-13T08:00:00Z');
    const e = surumuYorumla(p, { durum: 404, govde: { error: 'Not found' } }, Z);
    assert.equal(e.durum, 'eski');
    assert.equal(e.calisanOzet, null);
    assert.equal(surumuYorumla(p, { tur: 'ulasilamadi', ileti: 'bağlantı reddedildi' }, Z).durum, 'bilinmiyor', 'ulaşılamamak sürüm uyarısı değildir');
    assert.equal(surumuYorumla(null, { durum: 200, govde: { kaynakOzeti: p } }, Z).durum, 'bilinmiyor', 'paket kaynağı yoksa karşılaştırılmaz');
    assert.equal(surumuYorumla(p, { durum: 200, govde: {} }, Z).durum, 'bilinmiyor');
  });

  test('soru yalnız GET /api/version ile gider, sonuç süreç belleğinde kalır', async () => {
    const klasor = mkdtempSync(join(tmpdir(), 'ly-surum-'));
    try {
      writeFileSync(join(klasor, 'Program.cs'), 'class P {}\n');
      const beklenen = yardimciKaynakOzeti([{ ad: 'Program.cs', icerik: 'class P {}\n' }]);
      const yollar: string[] = [];
      const kopru = { kontrolOku: async (yol: string) => { yollar.push(yol); return { durum: 200, govde: { kaynakOzeti: beklenen, derlemeZamani: null } }; } } as unknown as KopruIstemcisi;
      const r = await yardimciSurumunuSor(kopru, () => Z, `${klasor}/`);
      assert.deepEqual(yollar, ['/api/version']);
      assert.equal(r.durum, 'ayni');
      assert.deepEqual(yardimciSurumu(), r);
    } finally {
      rmSync(klasor, { recursive: true, force: true });
    }
  });
});
