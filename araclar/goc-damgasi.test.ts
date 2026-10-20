import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Geçici depodaki git arka planda bakım başlatıp silme sırasında klasöre yazmasın.
Object.assign(process.env, {
  GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: 'gc.auto', GIT_CONFIG_VALUE_0: '0',
  GIT_CONFIG_KEY_1: 'maintenance.auto', GIT_CONFIG_VALUE_1: 'false',
});

// CI'daki gibi: çekme isteği dalı ana dala birleştirme commit'iyle alınır, değişenler ilk ebeveynden sayılır.
test('göç damgası CI denetimi: ana daldaki son göçten eski damgalı göç kırmızı, yenisi yeşil, ana dal ilerleyince yeniden kırmızı', () => {
  const depo = realpathSync.native(mkdtempSync(join(tmpdir(), 'tmiv2-damga-')));
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=deneme', '-c', 'user.email=deneme@example.invalid', ...a], { cwd: depo, stdio: 'ignore' });
  const isle = (yol: string) => {
    mkdirSync(dirname(join(depo, yol)), { recursive: true });
    writeFileSync(join(depo, yol), `-- ${yol}\n`);
    git('add', '-A');
    git('commit', '-q', '-m', yol);
  };
  const birlestir = (dal: string) => {
    git('switch', '-q', '--detach', 'main');
    git('merge', '-q', '--no-ff', '-m', `pr ${dal}`, dal);
  };
  const kos = () => {
    const s = spawnSync(process.execPath, [join(depo, 'araclar/goc-damgasi.ts'), 'HEAD^1', 'main'], { cwd: depo, encoding: 'utf8' });
    return { kod: s.status, cikti: s.stdout, hata: s.stderr };
  };
  try {
    git('init', '-q', '-b', 'main');
    writeFileSync(join(depo, 'package.json'), '{ "type": "module" }\n');
    mkdirSync(join(depo, 'araclar'));
    for (const ad of ['goc-damgasi.ts', 'sinir-denetimi.ts']) {
      copyFileSync(fileURLToPath(new URL(`./${ad}`, import.meta.url)), join(depo, 'araclar', ad));
    }
    isle('sunucu/gocler/20200120000000_ilk.sql');

    git('switch', '-q', '-c', 'eski', 'main');
    isle('sunucu/gocler/20200110000000_eski.sql');
    birlestir('eski');
    const eski = kos();
    assert.equal(eski.kod, 1, eski.cikti);
    assert.match(eski.hata, /sunucu\/gocler\/20200110000000_eski\.sql \[göç\] damga eski: tabandaki son göçten \(20200120000000_ilk\.sql\)/);
    assert.match(eski.cikti, /Göç damgası denetimi \(taban main\): 1 ihlal\./);

    git('switch', '-q', '-c', 'yeni', 'main');
    isle('sunucu/gocler/20200201000000_yeni.sql');
    birlestir('yeni');
    git('tag', 'pr-yeni');
    const yeni = kos();
    assert.equal(yeni.kod, 0, yeni.hata);
    assert.match(yeni.cikti, /Göç damgası denetimi \(taban main\): 0 ihlal\./);

    // İstek açıldıktan sonra ana dala daha yeni bir göç girer: birleştirme commit'i eski tabanda kalsa da yakalanır.
    git('switch', '-q', 'main');
    isle('sunucu/gocler/20200301000000_sonra.sql');
    git('switch', '-q', '--detach', 'pr-yeni');
    const sonra = kos();
    assert.equal(sonra.kod, 1, sonra.cikti);
    assert.match(sonra.hata, /20200201000000_yeni\.sql \[göç\] damga eski: tabandaki son göçten \(20200301000000_sonra\.sql\)/);
  } finally {
    try {
      rmSync(depo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (hata) {
      console.warn(`geçici klasör silinemedi: ${depo}`, hata);
    }
  }
});

// Kurulu sistemde göç koşucusu uygulanmış dosyanın özetini denetler ve değişende durur (sunucu/cekirdek/goc.ts);
// birleşmeden önce yakalanmalı.
test('göç CI denetimi: ana dalda var olan göç değiştirilir, silinir ya da yeniden adlandırılırsa kırmızı; yalnız yeni göç eklenirse yeşil', () => {
  const depo = realpathSync.native(mkdtempSync(join(tmpdir(), 'tmiv2-degisen-goc-')));
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=deneme', '-c', 'user.email=deneme@example.invalid', ...a], { cwd: depo, stdio: 'ignore' });
  const yaz = (yol: string, icerik: string) => {
    mkdirSync(dirname(join(depo, yol)), { recursive: true });
    writeFileSync(join(depo, yol), icerik);
  };
  const istek = (dal: string, degistir: () => void) => {
    git('switch', '-q', '-c', dal, 'main');
    degistir();
    git('add', '-A');
    git('commit', '-q', '-m', dal);
    git('switch', '-q', '--detach', 'main');
    git('merge', '-q', '--no-ff', '-m', `pr ${dal}`, dal);
    const s = spawnSync(process.execPath, [join(depo, 'araclar/goc-damgasi.ts'), 'HEAD^1', 'main'], { cwd: depo, encoding: 'utf8' });
    return { kod: s.status, cikti: s.stdout, hata: s.stderr };
  };
  try {
    git('init', '-q', '-b', 'main');
    writeFileSync(join(depo, 'package.json'), '{ "type": "module" }\n');
    mkdirSync(join(depo, 'araclar'));
    for (const ad of ['goc-damgasi.ts', 'sinir-denetimi.ts']) {
      copyFileSync(fileURLToPath(new URL(`./${ad}`, import.meta.url)), join(depo, 'araclar', ad));
    }
    yaz('sunucu/gocler/20200120000000_ilk.sql', 'CREATE TABLE a (id int);\n');
    yaz('sunucu/gocler/20200121000000_ikinci.sql', 'CREATE TABLE b (id int);\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'taban');

    const degisen = istek('degisen', () => { yaz('sunucu/gocler/20200120000000_ilk.sql', 'CREATE TABLE a (id bigint);\n'); });
    assert.equal(degisen.kod, 1, degisen.cikti);
    assert.match(degisen.hata, /sunucu\/gocler\/20200120000000_ilk\.sql \[göç\] var olan göç değiştirilmiş ya da silinmiş/);
    assert.match(degisen.cikti, /Var olan göç denetimi \(taban HEAD\^1\): 1 ihlal\./);

    const silinen = istek('silinen', () => { git('rm', '-q', 'sunucu/gocler/20200121000000_ikinci.sql'); });
    assert.equal(silinen.kod, 1, silinen.cikti);
    assert.match(silinen.hata, /20200121000000_ikinci\.sql \[göç\] var olan göç/);

    const adiDegisen = istek('adi-degisen', () => { git('mv', 'sunucu/gocler/20200121000000_ikinci.sql', 'sunucu/gocler/20200201000000_ikinci.sql'); });
    assert.equal(adiDegisen.kod, 1, adiDegisen.cikti);
    assert.match(adiDegisen.hata, /20200121000000_ikinci\.sql \[göç\] var olan göç/);

    const yeni = istek('yeni', () => { yaz('sunucu/gocler/20200301000000_yeni.sql', 'CREATE TABLE c (id int);\n'); });
    assert.equal(yeni.kod, 0, yeni.hata);
    assert.match(yeni.cikti, /Var olan göç denetimi \(taban HEAD\^1\): 0 ihlal\./);
  } finally {
    try {
      rmSync(depo, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (hata) {
      console.warn(`geçici klasör silinemedi: ${depo}`, hata);
    }
  }
});

test('göç damgası CI denetimi: argüman eksikse kullanım hatasıyla durur, denetimsiz yeşil vermez', () => {
  const s = spawnSync(process.execPath, [fileURLToPath(new URL('./goc-damgasi.ts', import.meta.url)), 'HEAD^1'], { encoding: 'utf8' });
  assert.equal(s.status, 1);
  assert.match(s.stderr, /Kullanım/);
});
