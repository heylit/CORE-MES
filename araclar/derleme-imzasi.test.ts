import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { derlemeGuncelMi, derlemeImzasi, imzayiYaz } from './derleme-imzasi.ts';

const kok = mkdtempSync(path.join(tmpdir(), 'derleme-imzasi-'));
after(() => { rmSync(kok, { recursive: true, force: true }); });

const yaz = (yol: string, icerik: string): void => {
  mkdirSync(path.dirname(path.join(kok, yol)), { recursive: true });
  writeFileSync(path.join(kok, yol), icerik);
};

test('kaynak değişmedikçe derleme güncel sayılır; değişen, eklenen dosya ya da ortam commit iletisi yeniden derletir', () => {
  yaz('istemci/src/a.ts', 'a');
  yaz('paylasilan/b.ts', 'b');
  yaz('package-lock.json', '{}');
  const girdiler = ['istemci', 'paylasilan', 'package-lock.json'];
  const cikti = path.join(kok, 'istemci', 'dist');

  // Çıktı yokken derlenir.
  assert.equal(derlemeGuncelMi(kok, girdiler, cikti, {}), false);
  yaz('istemci/dist/index.html', '<html>');
  imzayiYaz(cikti, derlemeImzasi(kok, girdiler, {}));
  assert.equal(derlemeGuncelMi(kok, girdiler, cikti, {}), true);

  // Çıktının ve node_modules'un kendisi imzaya girmez.
  yaz('istemci/dist/assets/x.js', 'x');
  yaz('istemci/node_modules/p/i.js', 'p');
  assert.equal(derlemeGuncelMi(kok, girdiler, cikti, {}), true);

  // git pull dosyanın zamanını değiştirir: aynı boyda içerik de yeniden derletir.
  utimesSync(path.join(kok, 'istemci/src/a.ts'), new Date(), new Date(Date.now() + 5000));
  assert.equal(derlemeGuncelMi(kok, girdiler, cikti, {}), false);
  imzayiYaz(cikti, derlemeImzasi(kok, girdiler, {}));
  yaz('paylasilan/yeni.ts', 'y');
  assert.equal(derlemeGuncelMi(kok, girdiler, cikti, {}), false);
  imzayiYaz(cikti, derlemeImzasi(kok, girdiler, {}));
  assert.equal(derlemeGuncelMi(kok, girdiler, cikti, { TMIV2_COMMIT: 'abc' }), false);
  assert.equal(derlemeGuncelMi(kok, girdiler, cikti, { TMIV2_SURUM: '2026.10.28-3' }), false);

  // index.html silinmişse imza tutsa da derlenir.
  rmSync(path.join(cikti, 'index.html'));
  assert.equal(derlemeGuncelMi(kok, girdiler, cikti, {}), false);
});
