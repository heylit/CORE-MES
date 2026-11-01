import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { geometriSureciKur, hesapOrtami } from './surec.ts';

// Veritabanısız: hesap sürecine ana sürecin TMIV2_* değişkenleri geçmez (ADR 0024 karar 2).
describe('geometri: hesap süreci ortamı', () => {
  const klasor = mkdtempSync(join(tmpdir(), 'geometri-ortam-'));
  after(() => { rmSync(klasor, { recursive: true, force: true }); });

  test('G-O1 hesapOrtami yalnız izinli değişkenleri geçirir; TMIV2_* ve başka değişken geçmez', () => {
    const sonuc = hesapOrtami({ PATH: '/bin', TMP: '/t', TMIV2_PG_PASSWORD: 'x', TMIV2_ORTAM: 'canli', PGPASSWORD: 'y', HOME: '/h' });
    assert.deepEqual(sonuc, { PATH: '/bin', TMP: '/t' });
  });

  test('G-O2 açılan çocuk süreç TMIV2_* değişkenlerini görmez; izinli değişken geçer', async () => {
    const giris = join(klasor, 'ortam-cocugu.mjs');
    writeFileSync(giris, [
      "process.on('message', (m) => {",
      "  const adlar = Object.keys(process.env).filter((a) => a.startsWith('TMIV2_') || a === 'PGPASSWORD');",
      "  process.send({ kimlik: m.kimlik, tamam: false, kalici: true, hata: JSON.stringify({ adlar, yol: process.env.PATH ?? process.env.Path ?? null }) });",
      '});',
      "process.on('disconnect', () => process.exit(0));",
    ].join('\n'));
    const onceki = process.env['TMIV2_GEOMETRI_ORTAM_DENEMESI'];
    process.env['TMIV2_GEOMETRI_ORTAM_DENEMESI'] = 'gorunmemeli';
    const surec = geometriSureciKur({ giris, sureMs: 20_000 });
    try {
      const yanit = await surec.hesapla('step', new Uint8Array([1]));
      assert.equal(yanit.tamam, false);
      if (yanit.tamam) return;
      const gorulen = JSON.parse(yanit.hata) as { adlar: string[]; yol: string | null };
      assert.deepEqual(gorulen.adlar, []);
      assert.equal(gorulen.yol, process.env['PATH'] ?? process.env['Path'] ?? null);
    } finally {
      surec.kapat();
      if (onceki === undefined) delete process.env['TMIV2_GEOMETRI_ORTAM_DENEMESI'];
      else process.env['TMIV2_GEOMETRI_ORTAM_DENEMESI'] = onceki;
    }
  });
});
