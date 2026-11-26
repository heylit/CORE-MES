import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { izniCoz, imzaGecerliMi, parmakIzi } from '../sunucu/moduller/ayarlar/sifirlama-izni.ts';

// 3728: kullanıcının bilgisayarında koşan imza aracı. Parola yalnız klavyeden girildiği için uretme ve imzalama burada
// yalnız reddetme yoluyla denenir; izin biçimi ve parmak izi sunucunun okuduğuyla aynı olmalı.
const ARAC = fileURLToPath(new URL('./sifirlama-imza.mjs', import.meta.url));
const kos = (...a: string[]) => spawnSync(process.execPath, [ARAC, ...a], { encoding: 'utf8', input: 'parola-girdisi\n' });

test('parola klavye dışından girilmez; komutsuz çağrı yardım verir', () => {
  const d = mkdtempSync(join(tmpdir(), 'sifirlama-imza-'));
  try {
    const r = kos('uret', d);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /yalniz klavyeden/);
    assert.equal(kos().status, 1);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('aracın izin biçimi sunucuda çözülür; doğrulama ve parmak izi aynı', () => {
  const d = mkdtempSync(join(tmpdir(), 'sifirlama-imza-'));
  try {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const acik = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    writeFileSync(join(d, 'acik.pem'), acik);
    const metin = '{"tur":"coremes-sifirlama","surum":1,"kurulum":"k","ortam":"test","sayi":"00000000-0000-4000-8000-000000000001","son":"2026-11-26T07:00:00.000Z"}';
    const izin = { surum: 1, istek: Buffer.from(metin).toString('base64'), imza: sign(null, Buffer.from(metin), privateKey).toString('base64'), parmak_izi: parmakIzi(acik) };
    writeFileSync(join(d, 'istek.txt.izin'), JSON.stringify(izin));
    assert.equal(kos('dogrula', join(d, 'acik.pem'), join(d, 'istek.txt.izin')).status, 0);
    assert.equal(kos('parmak-izi', join(d, 'acik.pem')).stdout.trim(), parmakIzi(acik));
    const c = izniCoz(izin);
    assert.ok(c && imzaGecerliMi(c.metin, c.imza, acik));
    writeFileSync(join(d, 'bozuk.izin'), JSON.stringify({ ...izin, istek: Buffer.from(metin.replace('test', 'canli')).toString('base64') }));
    assert.equal(kos('dogrula', join(d, 'acik.pem'), join(d, 'bozuk.izin')).status, 2);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
