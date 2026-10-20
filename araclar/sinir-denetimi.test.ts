import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  argumanlariDogrula, damgaIhlaliMesaji, degisenleriTopla, depoyuDenetle, donguIhlali, donguleriBul, eskiDamgaliGocler, gocDamgasi,
  ihlalleriBul, ihlalSatiri, modulKenarlari, modulSec, modulunDonguleri,
  tabandakiGocleriTopla, tabanSec, tarafSec, yolDenetimiBasligi, yolIhlaliMesaji, yolIhlalleri,
} from './sinir-denetimi.ts';
import type { KaynakDosya } from './sinir-denetimi.ts';

// Geçici depodaki git, arka planda gc ya da bakım başlatıp silme sırasında klasöre yazabiliyor (ENOTEMPTY).
// Ortamdan verilen ayar, testin ve denetimin açtığı her git sürecine geçer.
Object.assign(process.env, {
  GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: 'gc.auto', GIT_CONFIG_VALUE_0: '0',
  GIT_CONFIG_KEY_1: 'maintenance.auto', GIT_CONFIG_VALUE_1: 'false',
});

// finally içinde çağrılır: silinemeyen geçici klasör, testin asıl doğrulama hatasını gizlemez.
function geciciSil(klasor: string): void {
  try {
    rmSync(klasor, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (hata) {
    console.warn(`geçici klasör silinemedi: ${klasor}`, hata);
  }
}

test('taban: verilmezse main, --taban ile seçilir; değeri eksikse hata', () => {
  assert.equal(tabanSec(['--modul', 'stok']), 'main');
  assert.equal(tabanSec(['--modul', 'stok', '--taban', 'p']), 'p');
  assert.throws(() => tabanSec(['--modul', 'stok', '--taban']), /Kullanım/);
  assert.throws(() => tabanSec(['--taban', '--modul', 'stok']), /Kullanım/);
});

test('taban --modul olmadan verilirse hata: yok sayılıp denetimsiz yeşil vermez', () => {
  assert.throws(() => tabanSec(['--taban', 'p']), /Kullanım.*--modul/);
  assert.equal(tabanSec([]), 'main');
});

test('ASCII dışı adlı dosya denetimden düşmez: taban göçü son göç olarak tanınır, dalın dosyası yoluyla görünür', () => {
  const depo = mkdtempSync(join(tmpdir(), 'tmiv2-ad-'));
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=deneme', '-c', 'user.email=deneme@example.invalid', ...a], { cwd: depo, stdio: 'ignore' });
  const isle = (...yollar: string[]) => {
    for (const yol of yollar) {
      mkdirSync(dirname(join(depo, yol)), { recursive: true });
      writeFileSync(join(depo, yol), `-- ${yol}\n`);
    }
    git('add', '-A');
    git('commit', '-q', '-m', 'x');
  };
  try {
    git('init', '-q', '-b', 'main');
    isle('sunucu/gocler/20200101000000_ilk.sql', 'sunucu/gocler/20200120000000_ü.sql');
    git('switch', '-q', '-c', 'b');
    isle('sunucu/gocler/20200110000000_b_tablo.sql', 'paylasilan/ölçü.ts');

    const tabandaki = tabandakiGocleriTopla(depo, 'main');
    assert.deepEqual([...tabandaki].sort(), ['20200101000000_ilk.sql', '20200120000000_ü.sql']);
    const degisenler = degisenleriTopla(depo, 'main');
    assert.deepEqual(eskiDamgaliGocler(degisenler, tabandaki, new Date(2027, 0, 2, 3, 4, 5)).map((i) => [i.dosya, i.sonGoc]), [
      ['20200110000000_b_tablo.sql', '20200120000000_ü.sql'],
    ]);
    assert.deepEqual(yolIhlalleri('b', degisenler), ['paylasilan/ölçü.ts']);
  } finally {
    geciciSil(depo);
  }
});

test('değişenler tabandan ayrılma noktasına göre toplanır: başka dalın üstüne kurulan dal yalnız kendi dosyalarını sayar', () => {
  const depo = mkdtempSync(join(tmpdir(), 'tmiv2-taban-'));
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=deneme', '-c', 'user.email=deneme@example.invalid', ...a], { cwd: depo, stdio: 'ignore' });
  const yaz = (yol: string) => {
    mkdirSync(dirname(join(depo, yol)), { recursive: true });
    writeFileSync(join(depo, yol), 'x\n');
  };
  const isle = (yol: string) => { yaz(yol); git('add', '-A'); git('commit', '-q', '-m', yol); };
  const modulB = (taban: string) => yolIhlalleri('b', degisenleriTopla(depo, taban));
  try {
    git('init', '-q', '-b', 'main');
    yaz('sunucu/gocler/001_eski.sql');
    isle('kok.txt');
    git('switch', '-q', '-c', 'p');
    isle('sunucu/moduller/a/uclar.ts');
    git('switch', '-q', '-c', 'b');
    isle('sunucu/moduller/b/uclar.ts');

    assert.deepEqual(modulB('p'), []);
    assert.deepEqual(modulB('main'), ['sunucu/moduller/a/uclar.ts']);

    // Taban ilerlese de ayrılma noktası değişmez: tabanın yeni dosyası bu dala yazılmaz.
    git('switch', '-q', 'p');
    isle('paylasilan/yeni.ts');
    git('switch', '-q', 'b');
    assert.deepEqual(modulB('p'), []);

    yaz('paylasilan/disarida.ts');
    assert.deepEqual(modulB('p'), ['paylasilan/disarida.ts']);
    rmSync(join(depo, 'paylasilan/disarida.ts'));

    // Göç: commit'li ya da izlenmeyen YENİ dosya serbest; var olanın değişmesi commit'siz de olsa ihlal.
    isle('sunucu/gocler/002_b_yeni.sql');
    yaz('sunucu/gocler/003_b_izlenmeyen.sql');
    assert.deepEqual(modulB('p'), []);
    writeFileSync(join(depo, 'sunucu/gocler/001_eski.sql'), 'degisti\n');
    assert.deepEqual(modulB('p'), ['sunucu/gocler/001_eski.sql']);
    git('add', '-A');
    git('commit', '-q', '-m', 'eski goc degisti');
    assert.deepEqual(modulB('p'), ['sunucu/gocler/001_eski.sql']);

    assert.throws(() => degisenleriTopla(depo, 'yok-boyle-dal'), /Taban dal bulunamadı.*yok-boyle-dal/);
  } finally {
    geciciSil(depo);
  }
});

test('yol denetimi: modül dalı yalnız kendi klasörlerine, kendi sözleşme dosyasına ve yeni göç dosyasına yazabilir', () => {
  const serbest = [
    { yol: 'sunucu/moduller/stok/servis.ts', yeni: false },
    { yol: 'istemci/src/moduller/stok/Stok.tsx', yeni: true },
    { yol: 'sunucu/gocler/20270101120000_stok_hareket.sql', yeni: true },
    { yol: 'paylasilan/sozlesme/stok.ts', yeni: true },
    { yol: 'paylasilan/sozlesme/stok.ts', yeni: false },
    { yol: 'paylasilan/islemler/stok.ts', yeni: true },
    { yol: 'paylasilan/islemler/stok.ts', yeni: false },
    { yol: 'paylasilan/sayfalar/stok.ts', yeni: true },
    { yol: 'paylasilan/sayfalar/stok.ts', yeni: false },
    { yol: 'paylasilan/ayarlar/stok.ts', yeni: true },
    { yol: 'paylasilan/ayarlar/stok.ts', yeni: false },
  ];
  assert.deepEqual(yolIhlalleri('stok', serbest), []);

  const disarida = [
    { yol: 'sunucu/moduller/stokcu/servis.ts', yeni: true },
    { yol: 'sunucu/moduller/rota/disari.ts', yeni: false },
    { yol: 'sunucu/cekirdek/uc.ts', yeni: false },
    { yol: 'sunucu/gocler/20261005120000_kisiler.sql', yeni: false },
    { yol: 'paylasilan/sayfalar.ts', yeni: false },
    { yol: 'paylasilan/kullanici.ts', yeni: false },
    { yol: 'paylasilan/sozlesme/rota.ts', yeni: true },
    { yol: 'paylasilan/sozlesme/stokcu.ts', yeni: true },
    { yol: 'paylasilan/sozlesme/stok/ek.ts', yeni: true },
    { yol: 'paylasilan/sozlesme/index.ts', yeni: true },
    { yol: 'paylasilan/islemler.ts', yeni: false },
    { yol: 'paylasilan/islemler/rota.ts', yeni: true },
    { yol: 'paylasilan/islemler/stokcu.ts', yeni: false },
    { yol: 'paylasilan/islemler/stok/ek.ts', yeni: true },
    { yol: 'paylasilan/ayarlar.ts', yeni: false },
    { yol: 'paylasilan/sayfa-tanimi.ts', yeni: false },
    { yol: 'paylasilan/sayfalar/rota.ts', yeni: true },
    { yol: 'paylasilan/sayfalar/stokcu.ts', yeni: false },
    { yol: 'paylasilan/ayarlar/rota.ts', yeni: true },
    { yol: 'paylasilan/ayarlar/stok/ek.ts', yeni: true },
  ];
  assert.deepEqual(yolIhlalleri('stok', [...serbest, ...disarida]), disarida.map((d) => d.yol).sort());
});

test('taraf: sunucu tarafı yalnız kendi klasörüne ve yeni göçe yazar; istemci dosyası ihlal', () => {
  const kendi = [
    { yol: 'sunucu/moduller/stok/servis.ts', yeni: false },
    { yol: 'sunucu/moduller/stok/alt/yeni.ts', yeni: true },
    { yol: 'sunucu/gocler/20270101120000_stok_hareket.sql', yeni: true },
  ];
  assert.deepEqual(yolIhlalleri('stok', kendi, 'sunucu'), []);

  const disarida = [
    { yol: 'istemci/src/moduller/stok/Stok.tsx', yeni: true },
    { yol: 'istemci/src/moduller/stok/anahtarlar.ts', yeni: false },
    { yol: 'sunucu/moduller/rota/disari.ts', yeni: false },
    { yol: 'sunucu/gocler/20261005120000_kisiler.sql', yeni: false },
  ];
  assert.deepEqual(yolIhlalleri('stok', [...kendi, ...disarida], 'sunucu'), disarida.map((d) => d.yol).sort());
  assert.deepEqual(yolIhlalleri('stok', [...kendi, ...disarida.slice(0, 2)]), []);
});

test('taraf: istemci tarafı yalnız kendi klasörüne yazar; sunucu dosyası ve göç ihlal', () => {
  const kendi = [
    { yol: 'istemci/src/moduller/stok/Stok.tsx', yeni: true },
    { yol: 'istemci/src/moduller/stok/rotalar.tsx', yeni: false },
  ];
  assert.deepEqual(yolIhlalleri('stok', kendi, 'istemci'), []);

  const disarida = [
    { yol: 'sunucu/moduller/stok/servis.ts', yeni: false },
    { yol: 'sunucu/gocler/20270101120000_stok_hareket.sql', yeni: true },
    { yol: 'istemci/src/moduller/rota/Rota.tsx', yeni: true },
    { yol: 'istemci/src/ortak/arayuz/index.ts', yeni: false },
  ];
  assert.deepEqual(yolIhlalleri('stok', [...kendi, ...disarida], 'istemci'), disarida.map((d) => d.yol).sort());
  assert.deepEqual(yolIhlalleri('stok', [...kendi, ...disarida.slice(0, 2)]), []);
});

test('taraf: sözleşme dosyası iki tarafa da kapalı, tarafsız dalda açık', () => {
  for (const yeni of [true, false]) {
    const sozlesme = [{ yol: 'paylasilan/sozlesme/stok.ts', yeni }];
    assert.deepEqual(yolIhlalleri('stok', sozlesme, 'sunucu'), ['paylasilan/sozlesme/stok.ts']);
    assert.deepEqual(yolIhlalleri('stok', sozlesme, 'istemci'), ['paylasilan/sozlesme/stok.ts']);
    assert.deepEqual(yolIhlalleri('stok', sozlesme), []);
    assert.deepEqual(yolIhlalleri('stok', sozlesme, null), []);
    const islemler = [{ yol: 'paylasilan/islemler/stok.ts', yeni }];
    assert.deepEqual(yolIhlalleri('stok', islemler, 'sunucu'), ['paylasilan/islemler/stok.ts']);
    assert.deepEqual(yolIhlalleri('stok', islemler, 'istemci'), ['paylasilan/islemler/stok.ts']);
    assert.deepEqual(yolIhlalleri('stok', islemler), []);
    for (const yol of ['paylasilan/sayfalar/stok.ts', 'paylasilan/ayarlar/stok.ts']) {
      assert.deepEqual(yolIhlalleri('stok', [{ yol, yeni }], 'sunucu'), [yol]);
      assert.deepEqual(yolIhlalleri('stok', [{ yol, yeni }], 'istemci'), [yol]);
      assert.deepEqual(yolIhlalleri('stok', [{ yol, yeni }]), []);
    }
  }
});

test('taraf seçimi: verilmezse iki taraf; değer eksik, geçersiz ya da --modul yoksa hata', () => {
  assert.equal(tarafSec(['--modul', 'stok']), null);
  assert.equal(tarafSec([]), null);
  assert.equal(tarafSec(['--modul', 'stok', '--taraf', 'sunucu']), 'sunucu');
  assert.equal(tarafSec(['--taraf', 'istemci', '--modul', 'stok']), 'istemci');

  assert.throws(() => tarafSec(['--modul', 'stok', '--taraf']), /Kullanım.*--taraf sunucu\|istemci/);
  assert.throws(() => tarafSec(['--modul', 'stok', '--taraf', 'ikisi']), /Kullanım/);
  assert.throws(() => tarafSec(['--modul', 'stok', '--taraf', 'Sunucu']), /Kullanım/);
  assert.throws(() => tarafSec(['--modul', 'stok', '--taraf', '--taban', 'p']), /Kullanım/);
  assert.throws(() => tarafSec(['--taraf', 'sunucu']), /Kullanım/);
});

test('taraf iki kez verilirse hata: hangisinin geçerli olduğu tahmin edilmez', () => {
  assert.throws(() => tarafSec(['--modul', 'stok', '--taraf', 'sunucu', '--taraf', 'istemci']), /Kullanım/);
  assert.throws(() => tarafSec(['--modul', 'stok', '--taraf', 'sunucu', '--taraf', 'sunucu']), /Kullanım/);
});

test('eşittirli bayrak yok sayılmaz: --taraf=, --modul= ve --taban= kullanım hatası', () => {
  assert.throws(() => tarafSec(['--modul', 'stok', '--taraf=sunucu']), /Kullanım.*--taraf/);
  assert.throws(() => tarafSec(['--modul', 'stok', '--taraf', 'sunucu', '--taraf=istemci']), /Kullanım/);
  assert.throws(() => modulSec(['--modul=stok']), /Kullanım.*--modul/);
  assert.throws(() => modulSec(['--modul=stok', '--taraf', 'sunucu']), /Kullanım/);
  assert.throws(() => tabanSec(['--modul', 'stok', '--taban=p']), /Kullanım.*--taban/);
});

test('argümanlar: yalnız bilinen bayraklar ve değerleri kabul edilir; tanınmayan ya da yinelenen bayrak hata', () => {
  assert.doesNotThrow(() => argumanlariDogrula([]));
  assert.doesNotThrow(() => argumanlariDogrula(['--modul', 'stok']));
  assert.doesNotThrow(() => argumanlariDogrula(['--taban', 'p', '--taraf', 'sunucu', '--modul', 'stok']));

  assert.throws(() => argumanlariDogrula(['--modul', 'stok', '--tarf', 'sunucu']), /--tarf.*Kullanım/);
  assert.throws(() => argumanlariDogrula(['--modul', 'stok', '-taraf', 'sunucu']), /-taraf.*Kullanım/);
  assert.throws(() => argumanlariDogrula(['--modul', 'stok', '--taraf=sunucu']), /Kullanım/);
  assert.throws(() => argumanlariDogrula(['--modul', 'stok', 'sunucu']), /Kullanım/);
  assert.throws(() => argumanlariDogrula(['stok']), /Kullanım/);
  assert.throws(() => argumanlariDogrula(['--modul', 'stok', '--taraf', 'sunucu', 'fazla']), /fazla.*Kullanım/);

  assert.throws(() => argumanlariDogrula(['--modul', 'stok', '--modul', 'rota']), /--modul iki kez.*Kullanım/);
  assert.throws(() => argumanlariDogrula(['--modul', 'stok', '--taban', 'p', '--taban', 'main']), /--taban iki kez.*Kullanım/);
  assert.throws(() => argumanlariDogrula(['--modul', 'stok', '--taraf', 'sunucu', '--taraf', 'sunucu']), /--taraf iki kez/);
});

test('modül seçimi: verilmezse null; değer eksik ya da ad biçimi dışındaysa hata', () => {
  assert.equal(modulSec([]), null);
  assert.equal(modulSec(['--taban', 'p']), null);
  assert.equal(modulSec(['--modul', 'uretim-emirleri', '--taraf', 'sunucu']), 'uretim-emirleri');
  assert.throws(() => modulSec(['--modul']), /Kullanım/);
  assert.throws(() => modulSec(['--modul', '--taraf', 'sunucu']), /Kullanım/);
  assert.throws(() => modulSec(['--modul', '../stok']), /Kullanım/);
});

test('araç alt süreç olarak: taraf yol denetimine ulaşır, çıkış kodu ihlali ve kullanım hatasını söyler', () => {
  // Araç kendi dosyasının yoluyla çağrıldığını karşılaştırır; kısa (8.3) geçici yol eşleşmez.
  const depo = realpathSync.native(mkdtempSync(join(tmpdir(), 'tmiv2-arac-')));
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=deneme', '-c', 'user.email=deneme@example.invalid', ...a], { cwd: depo, stdio: 'ignore' });
  const yaz = (yol: string) => {
    mkdirSync(dirname(join(depo, yol)), { recursive: true });
    writeFileSync(join(depo, yol), `export const yol = '${yol}';\n`);
  };
  const isle = (yol: string) => { yaz(yol); git('add', '-A'); git('commit', '-q', '-m', yol); };
  const kos = (...a: string[]) => {
    const s = spawnSync(process.execPath, [join(depo, 'araclar/sinir-denetimi.ts'), ...a], { cwd: depo, encoding: 'utf8' });
    return { kod: s.status, cikti: s.stdout, hata: s.stderr };
  };
  try {
    git('init', '-q', '-b', 'main');
    writeFileSync(join(depo, 'package.json'), '{ "type": "module" }\n');
    mkdirSync(join(depo, 'araclar'));
    copyFileSync(fileURLToPath(new URL('./sinir-denetimi.ts', import.meta.url)), join(depo, 'araclar/sinir-denetimi.ts'));
    isle('istemci/src/moduller/b/Eski.tsx');
    git('switch', '-q', '-c', 'b-sunucu');
    isle('sunucu/moduller/b/uclar.ts');

    const temiz = kos('--modul', 'b', '--taraf', 'sunucu');
    assert.match(temiz.cikti, /Yol denetimi \(b, sunucu, taban main\): 0 ihlal\./);
    assert.equal(temiz.kod, 0, temiz.hata);

    yaz('istemci/src/moduller/b/Ekran.tsx');
    const kirli = kos('--modul', 'b', '--taraf', 'sunucu');
    assert.equal(kirli.kod, 1);
    assert.match(kirli.hata, /istemci\/src\/moduller\/b\/Ekran\.tsx \[yol\] b modülünün sunucu tarafı dışında/);
    assert.match(kirli.cikti, /Yol denetimi \(b, sunucu, taban main\): 1 ihlal\./);
    assert.equal(kos('--modul', 'b', '--taraf', 'istemci').kod, 1);
    assert.equal(kos('--modul', 'b').kod, 0);

    for (const gecersiz of [['--modul', 'b', '--taraf', 'yan'], ['--modul', 'b', '--taraf=sunucu'], ['--taraf', 'sunucu'],
      ['--modul', 'b', '--taraf', 'sunucu', '--taraf', 'istemci'], ['--modul=b'], ['--modul', 'b', '--tarf', 'sunucu'],
      ['--modul', 'b', '-taraf', 'sunucu'], ['--taban', 'main'],['--modul', 'b', '--modul', 'b'], ['--modul', 'b', '--taban', 'main', '--taban', 'main']]) {
      const s = kos(...gecersiz);
      assert.equal(s.kod, 1, gecersiz.join(' '));
      assert.match(s.hata, /Kullanım/, gecersiz.join(' '));
      assert.doesNotMatch(s.cikti, /Yol denetimi/, gecersiz.join(' '));
    }
  } finally {
    geciciSil(depo);
  }
});

test('commit\'siz taşıma: başka taraftan sahnelenmiş yeniden adlandırmanın eski yolu ihlal sayılır', () => {
  const depo = mkdtempSync(join(tmpdir(), 'tmiv2-tasima-'));
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=deneme', '-c', 'user.email=deneme@example.invalid', ...a], { cwd: depo, stdio: 'ignore' });
  try {
    git('init', '-q', '-b', 'main');
    mkdirSync(join(depo, 'istemci/src/moduller/b'), { recursive: true });
    mkdirSync(join(depo, 'sunucu/moduller/b'), { recursive: true });
    writeFileSync(join(depo, 'istemci/src/moduller/b/Eski.tsx'), 'tasinacak icerik\n'.repeat(5));
    git('add', '-A');
    git('commit', '-q', '-m', 'ilk');
    git('switch', '-q', '-c', 'b-sunucu');
    assert.deepEqual(yolIhlalleri('b', degisenleriTopla(depo, 'main'), 'sunucu'), []);

    git('mv', 'istemci/src/moduller/b/Eski.tsx', 'sunucu/moduller/b/Eski.tsx');
    assert.deepEqual(yolIhlalleri('b', degisenleriTopla(depo, 'main'), 'sunucu'), ['istemci/src/moduller/b/Eski.tsx']);
    assert.deepEqual(yolIhlalleri('b', degisenleriTopla(depo, 'main')), []);

    // Taşımanın yeni yolu da sayılır: hedef dışarıdaysa o da ihlal.
    mkdirSync(join(depo, 'paylasilan'));
    git('mv', 'sunucu/moduller/b/Eski.tsx', 'paylasilan/Eski.tsx');
    assert.deepEqual(yolIhlalleri('b', degisenleriTopla(depo, 'main'), 'sunucu'), ['istemci/src/moduller/b/Eski.tsx', 'paylasilan/Eski.tsx']);
  } finally {
    geciciSil(depo);
  }
});

test('taraf çıktıda görünür: başlık ve ihlal satırı hangi tarafın dışında olduğunu söyler', () => {
  assert.equal(yolDenetimiBasligi('kisiler', 'sunucu', 'main'), 'Yol denetimi (kisiler, sunucu, taban main)');
  assert.equal(yolDenetimiBasligi('kisiler', 'istemci', 'p'), 'Yol denetimi (kisiler, istemci, taban p)');
  assert.equal(yolDenetimiBasligi('kisiler', null, 'main'), 'Yol denetimi (kisiler, taban main)');

  assert.match(yolIhlaliMesaji('kisiler', 'sunucu'), /kisiler.*sunucu tarafı dışında/);
  assert.match(yolIhlaliMesaji('kisiler', 'istemci'), /kisiler.*istemci tarafı dışında/);
  assert.doesNotMatch(yolIhlaliMesaji('kisiler', null), /sunucu|istemci/);
});

test('taraf uçtan uca: gerçek depoda sunucu dalının istemci ve sözleşme dosyası ihlal, kendi klasörü temiz', () => {
  const depo = mkdtempSync(join(tmpdir(), 'tmiv2-taraf-'));
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=deneme', '-c', 'user.email=deneme@example.invalid', ...a], { cwd: depo, stdio: 'ignore' });
  const yaz = (yol: string) => {
    mkdirSync(dirname(join(depo, yol)), { recursive: true });
    writeFileSync(join(depo, yol), `${yol}\n`);
  };
  const isle = (yol: string) => { yaz(yol); git('add', '-A'); git('commit', '-q', '-m', yol); };
  const denetle = (taraf: 'sunucu' | 'istemci' | null) => yolIhlalleri('b', degisenleriTopla(depo, 'main'), taraf);
  try {
    git('init', '-q', '-b', 'main');
    yaz('paylasilan/sozlesme/b.ts');
    isle('kok.txt');
    git('switch', '-q', '-c', 'b-sunucu');
    isle('sunucu/moduller/b/uclar.ts');
    isle('sunucu/gocler/002_b.sql');

    assert.deepEqual(denetle('sunucu'), []);
    assert.deepEqual(denetle('istemci'), ['sunucu/gocler/002_b.sql', 'sunucu/moduller/b/uclar.ts']);

    yaz('istemci/src/moduller/b/Ekran.tsx');
    assert.deepEqual(denetle('sunucu'), ['istemci/src/moduller/b/Ekran.tsx']);
    isle('istemci/src/moduller/b/Ekran.tsx');
    assert.deepEqual(denetle('sunucu'), ['istemci/src/moduller/b/Ekran.tsx']);

    writeFileSync(join(depo, 'paylasilan/sozlesme/b.ts'), 'degisti\n');
    assert.deepEqual(denetle('sunucu'), ['istemci/src/moduller/b/Ekran.tsx', 'paylasilan/sozlesme/b.ts']);
    assert.deepEqual(denetle(null), []);
  } finally {
    geciciSil(depo);
  }
});

const TABANDAKI = ['20261005120100_oturum.sql', '20261005120000_kisiler.sql'];
const yeniGoc = (ad: string) => ({ yol: `sunucu/gocler/${ad}`, yeni: true });
const SABIT_AN = new Date(2027, 0, 2, 3, 4, 5);

test('göç damgası: yerel saatten on dört hane, tek haneler sıfırla dolar', () => {
  assert.equal(gocDamgasi(SABIT_AN), '20270102030405');
  assert.equal(gocDamgasi(new Date(2026, 11, 31, 23, 59, 59)), '20261231235959');
});

test('göç damgası denetimi: tabandaki son göçten önce sıralanan yeni göç ihlal, öneri şimdiki damga ve eski adın kalanı', () => {
  const ihlaller = eskiDamgaliGocler([yeniGoc('20261005120050_stok_hareket.sql')], TABANDAKI, SABIT_AN);
  assert.deepEqual(ihlaller, [{
    dosya: '20261005120050_stok_hareket.sql',
    sonGoc: '20261005120100_oturum.sql',
    eski: true,
    onerilen: '20270102030405_stok_hareket.sql',
  }]);
  const [ihlal] = ihlaller;
  assert.ok(ihlal);
  assert.match(damgaIhlaliMesaji(ihlal), /20261005120100_oturum\.sql.*önce.*20270102030405_stok_hareket\.sql/);

  // Kıyas koşucudaki gibi adın tamamıyla: damga aynı, ad önce sıralanıyor.
  assert.equal(eskiDamgaliGocler([yeniGoc('20261005120100_denetim.sql')], TABANDAKI, SABIT_AN).length, 1);
});

test('göç damgası denetimi: yeni damga, göçsüz taban, var olan dosya ve göç olmayan yol temiz', () => {
  assert.deepEqual(eskiDamgaliGocler([yeniGoc('20261005120101_stok.sql')], TABANDAKI, SABIT_AN), []);
  assert.deepEqual(eskiDamgaliGocler([yeniGoc('20261005120100_stok.sql')], TABANDAKI, SABIT_AN), []);
  assert.deepEqual(eskiDamgaliGocler([yeniGoc('20200101000000_stok.sql')], [], SABIT_AN), []);
  assert.deepEqual(eskiDamgaliGocler([], TABANDAKI, SABIT_AN), []);

  const sayilmayan = [
    { yol: 'sunucu/gocler/20200101000000_eski.sql', yeni: false },
    { yol: 'sunucu/gocler/20261005120000_kisiler.sql', yeni: true },
    { yol: 'sunucu/gocler/alt/20200101000000_stok.sql', yeni: true },
    { yol: 'sunucu/moduller/stok/20200101000000_stok.sql', yeni: true },
    { yol: 'sunucu/gocler/20200101000000_not.md', yeni: true },
  ];
  assert.deepEqual(eskiDamgaliGocler(sayilmayan, TABANDAKI, SABIT_AN), []);
});

test('göç damgası denetimi: dalın birden çok yeni göçü birlikte, sırası korunarak yeniden damgalanır', () => {
  const dal = [yeniGoc('20261005120300_stok_dizin.sql'), yeniGoc('20261005120010_stok_tablo.sql'), yeniGoc('20261005120020_stok_ek.sql')];
  const ihlaller = eskiDamgaliGocler(dal, TABANDAKI, SABIT_AN);
  assert.deepEqual(ihlaller.map((i) => [i.dosya, i.eski, i.onerilen]), [
    ['20261005120010_stok_tablo.sql', true, '20270102030405_stok_tablo.sql'],
    ['20261005120020_stok_ek.sql', true, '20270102030406_stok_ek.sql'],
    ['20261005120300_stok_dizin.sql', false, '20270102030407_stok_dizin.sql'],
  ]);
  assert.doesNotMatch(damgaIhlaliMesaji(ihlaller[2]!), /damga eski/);
  assert.match(damgaIhlaliMesaji(ihlaller[2]!), /sonra koşmalı.*20270102030407_stok_dizin\.sql/);

  const yenilenmis = ihlaller.map((i) => yeniGoc(i.onerilen));
  assert.deepEqual(eskiDamgaliGocler(yenilenmis, TABANDAKI, SABIT_AN), []);

  // Dakika sınırında saniye taşar, damga geçerli kalır.
  const sinirda = eskiDamgaliGocler(dal, TABANDAKI, new Date(2027, 0, 2, 3, 4, 59));
  assert.deepEqual(sinirda.map((i) => i.onerilen.slice(0, 14)), ['20270102030459', '20270102030500', '20270102030501']);
});

test('göç damgası denetimi: saat tabandaki son göçün gerisindeyse öneri o göçün hemen sonrasından başlar', () => {
  const [ihlal] = eskiDamgaliGocler([yeniGoc('20261005120050_stok.sql')], TABANDAKI, new Date(2020, 0, 1));
  assert.equal(ihlal?.onerilen, '20261005120101_stok.sql');
});

test('göç damgası uçtan uca: iki dal aynı anda göç ekler; geç birleşen ihlal ve öneri alır, damga yenilenince temiz', () => {
  const depo = realpathSync.native(mkdtempSync(join(tmpdir(), 'tmiv2-damga-')));
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=deneme', '-c', 'user.email=deneme@example.invalid', ...a], { cwd: depo, stdio: 'ignore' });
  const yaz = (yol: string) => {
    mkdirSync(dirname(join(depo, yol)), { recursive: true });
    writeFileSync(join(depo, yol), `-- ${yol}\n`);
  };
  const isle = (...yollar: string[]) => { yollar.forEach(yaz); git('add', '-A'); git('commit', '-q', '-m', yollar.join(' ')); };
  const kos = (...a: string[]) => {
    const s = spawnSync(process.execPath, [join(depo, 'araclar/sinir-denetimi.ts'), ...a], { cwd: depo, encoding: 'utf8' });
    return { kod: s.status, cikti: s.stdout, hata: s.stderr };
  };
  try {
    git('init', '-q', '-b', 'main');
    writeFileSync(join(depo, 'package.json'), '{ "type": "module" }\n');
    mkdirSync(join(depo, 'araclar'));
    copyFileSync(fileURLToPath(new URL('./sinir-denetimi.ts', import.meta.url)), join(depo, 'araclar/sinir-denetimi.ts'));
    isle('sunucu/gocler/20200101000000_ilk.sql');
    git('switch', '-q', '-c', 'a');
    isle('sunucu/gocler/20200301000000_a_tablo.sql');
    git('switch', '-q', 'main');
    git('switch', '-q', '-c', 'b');
    isle('sunucu/gocler/20200201000000_b_tablo.sql', 'sunucu/moduller/b/sorgular.sql');

    const once = kos('--modul', 'b');
    assert.match(once.cikti, /Göç damgası denetimi \(b, taban main\): 0 ihlal\./);
    assert.equal(once.kod, 0, once.hata);

    git('switch', '-q', 'main');
    git('merge', '-q', '--ff-only', 'a');
    git('switch', '-q', 'b');
    assert.deepEqual(tabandakiGocleriTopla(depo, 'main').sort(), ['20200101000000_ilk.sql', '20200301000000_a_tablo.sql']);

    for (const bayraklar of [['--modul', 'b'], ['--modul', 'b', '--taraf', 'sunucu']]) {
      const gec = kos(...bayraklar);
      assert.equal(gec.kod, 1, bayraklar.join(' '));
      assert.match(gec.hata, /sunucu\/gocler\/20200201000000_b_tablo\.sql \[göç\].*20200301000000_a_tablo\.sql.*önce/);
      assert.match(gec.cikti, /Yol denetimi \(b,.*taban main\): 0 ihlal\./);
      assert.match(gec.cikti, /Göç damgası denetimi \(b, taban main\): 1 ihlal\./);
    }

    const onerilen = /yeni ad: (\d{14}_b_tablo\.sql)/.exec(kos('--modul', 'b').hata)?.[1];
    assert.ok(onerilen, 'ihlal satırı yeni adı önerir');
    git('mv', 'sunucu/gocler/20200201000000_b_tablo.sql', `sunucu/gocler/${onerilen}`);
    const sahnede = kos('--modul', 'b');
    assert.equal(sahnede.kod, 0, sahnede.hata);
    git('commit', '-q', '-m', 'damga yenilendi');
    const sonra = kos('--modul', 'b');
    assert.match(sonra.cikti, /Göç damgası denetimi \(b, taban main\): 0 ihlal\./);
    assert.equal(sonra.kod, 0, sonra.hata);

    const istemci = kos('--modul', 'b', '--taraf', 'istemci');
    assert.equal(istemci.kod, 1);
    assert.doesNotMatch(istemci.cikti, /Göç damgası denetimi/);
  } finally {
    geciciSil(depo);
  }
});

const kurallar = (dosya: string, icerik: string): string[] => ihlalleriBul(dosya, icerik).map((i) => i.kural);

test('kural a: modül başka modülün yalnız disari.ts dosyasını ithal eder', () => {
  const dosya = 'sunucu/moduller/stok/servis.ts';
  assert.deepEqual(kurallar(dosya, "import { x } from '../rota/servis.ts';"), ['a']);
  assert.deepEqual(kurallar(dosya, "const m = await import('../rota/sorgular.ts');"), ['a']);
  assert.deepEqual(kurallar(dosya, "export { x } from '../rota/kurallar.ts';"), ['a']);

  assert.deepEqual(kurallar(dosya, "import { x } from '../rota/disari.ts';"), []);
  assert.deepEqual(kurallar(dosya, "import { y } from './kurallar.ts';"), []);
  assert.deepEqual(kurallar(dosya, "import { z } from 'zod';\nimport { uc } from '#cekirdek/uc.ts';"), []);
});

test('kural a: çok satırlı ithalde ihlal from satırında raporlanır', () => {
  const icerik = ['import {', '  bir,', '  iki,', "} from '../rota/servis.ts';"].join('\n');
  const ihlaller = ihlalleriBul('sunucu/moduller/stok/servis.ts', icerik);
  assert.equal(ihlaller.length, 1);
  assert.equal(ihlaller[0]?.satir, 4);
  assert.equal(ihlaller[0]?.dosya, 'sunucu/moduller/stok/servis.ts');
});

test('kural b: cekirdek modülleri ithal edemez', () => {
  assert.deepEqual(kurallar('sunucu/cekirdek/uygulama.ts', "import { uclar } from '../moduller/saglik/uclar.ts';"), ['b']);
  assert.deepEqual(kurallar('sunucu/cekirdek/uygulama.ts', "import { uc } from './uc.ts';\nimport type { HataKodu } from '#paylasilan/hata.ts';"), []);
});

test('kural c: paylasilan sunucu ya da istemciyi ithal edemez', () => {
  assert.deepEqual(kurallar('paylasilan/sayfalar.ts', "import { x } from '../sunucu/cekirdek/yetki.ts';"), ['c']);
  assert.deepEqual(kurallar('paylasilan/sayfalar.ts', "import { x } from '#cekirdek/yetki.ts';"), ['c']);
  assert.deepEqual(kurallar('paylasilan/sayfalar.ts', "import { y } from '../istemci/ortak/veri/istek.ts';"), ['c']);
  assert.deepEqual(kurallar('paylasilan/sayfalar.ts', "import type { HataKodu } from './hata.ts';"), []);
});

test('kural d: istemci sunucuyu ithal edemez', () => {
  assert.deepEqual(kurallar('istemci/moduller/stok/Liste.tsx', "import { x } from '../../../sunucu/moduller/stok/disari.ts';"), ['d']);
  assert.deepEqual(kurallar('istemci/ortak/veri/istek.ts', "import { x } from '#cekirdek/hata.ts';"), ['d']);
  assert.deepEqual(kurallar('istemci/ortak/veri/istek.ts', "import type { HataGovdesi } from '#paylasilan/hata.ts';\nimport React from 'react';"), []);
});

test('kural e: modülde veritabanı çağrısı yalnız sorgular.ts ve test dosyalarında olur', () => {
  const cagri = "const satirlar = await db.sorgu('SELECT 1');";
  assert.deepEqual(kurallar('sunucu/moduller/stok/servis.ts', cagri), ['e']);
  assert.deepEqual(kurallar('sunucu/moduller/stok/uclar.ts', 'const s = await db.tek<{ id: number }>(sql);'), ['e']);
  assert.deepEqual(kurallar('sunucu/moduller/stok/altklasor/yardimci.ts', 'await db.sorgu<Satir>(sql);'), ['e']);

  assert.deepEqual(kurallar('sunucu/moduller/stok/sorgular.ts', cagri), []);
  assert.deepEqual(kurallar('sunucu/moduller/stok/servis.test.ts', cagri), []);
  assert.deepEqual(kurallar('sunucu/cekirdek/goc.ts', cagri), []);
  assert.deepEqual(kurallar('sunucu/moduller/stok/servis.ts', 'const s = await stokSorgula(db);\n// db.sorgu( burada yasak'), []);
});

const satirlar = (dosya: string, icerik: string): Array<[string, number]> =>
  ihlalleriBul(dosya, icerik).map((i) => [i.kural, i.satir]);

test('ihlaller kural türünden bağımsız satır sırasıyla döner', () => {
  const icerik = "await db.tek('x');\nimport { x } from '../rota/servis.ts';\nconst m = readFileSync('a.ts');\nawait db.sorgu('y');";
  assert.deepEqual(satirlar('sunucu/moduller/stok/servis.ts', icerik), [['e', 1], ['a', 2], ['e', 4]]);
  assert.deepEqual(satirlar('sunucu/moduller/stok/servis.test.ts', icerik), [['a', 2], ['h', 3]]);
});

test('kural h: test dosyası kaynak dosyasını metin olarak okumaz', () => {
  const okumalar = [
    "const metin = readFileSync('istemci/src/App.tsx', 'utf8');",
    "const metin = await readFile(new URL('./servis.ts', import.meta.url), 'utf8');",
    "import kaynak from './Liste.tsx?raw';",
    "const TSX = import.meta.glob('../**/*.tsx', { query: '?raw', import: 'default', eager: true });",
    "const akis = createReadStream('sunucu/ana.ts');",
    "/* not */ const m = readFileSync('a.ts');",
    "import stil from './liste.css?inline';",
    "import kaynak from './Liste.tsx?raw&v=1';",
    "const TSX = import.meta.glob('../**/*.tsx', { as: 'raw', eager: true });",
    "const TSX = import.meta.glob('../**/*.tsx', { query: { raw: '' }, eager: true });",
  ];
  for (const okuma of okumalar) {
    assert.deepEqual(kurallar('istemci/src/moduller/stok/Liste.test.tsx', okuma), ['h'], okuma);
    assert.deepEqual(kurallar('sunucu/moduller/stok/servis.test.ts', okuma), ['h'], okuma);
    assert.deepEqual(kurallar('paylasilan/sayfalar.test.ts', okuma), ['h'], okuma);

    assert.deepEqual(kurallar('sunucu/cekirdek/goc.ts', okuma), [], okuma);
    assert.deepEqual(kurallar('araclar/ornek.test.ts', okuma), [], okuma);
  }

  const davranis = "await writeFile(join(klasor, '1_a.sql'), 'SELECT 1');\nconst cevap = await app.inject({ url: '/saglik?raw=1x' });";
  assert.deepEqual(kurallar('sunucu/cekirdek/goc.test.ts', davranis), []);
  assert.deepEqual(kurallar('istemci/src/ortak/arayuz/Simge.test.tsx', "import adres from './simge.svg?url';"), []);
});

test('depo taraması: ts ve tsx dosyaları toplanır; css, node_modules ve dist atlanır', async () => {
  const kok = mkdtempSync(join(tmpdir(), 'sinir-'));
  const yaz = (yol: string, icerik: string): void => {
    mkdirSync(dirname(join(kok, yol)), { recursive: true });
    writeFileSync(join(kok, yol), icerik);
  };
  try {
    const sunucuIthali = "import { x } from '#cekirdek/hata.ts';\n";
    yaz('istemci/src/moduller/stok/Liste.tsx', sunucuIthali);
    yaz('istemci/src/moduller/stok/temiz.ts', "import { y } from './yardimci.ts';\n");
    yaz('sunucu/moduller/stok/servis.ts', "await db.sorgu('x');\n");
    yaz('istemci/src/moduller/stok/liste.css', "@import '#cekirdek/stil.css';\n");
    yaz('istemci/node_modules/paket/a.ts', sunucuIthali);
    yaz('istemci/dist/assets/Sayfa.tsx', sunucuIthali);

    const { dosyaSayisi, ihlaller } = await depoyuDenetle(kok);
    assert.equal(dosyaSayisi, 3);
    assert.deepEqual(
      ihlaller.map((i) => [i.dosya, i.kural]),
      [
        ['sunucu/moduller/stok/servis.ts', 'e'],
        ['istemci/src/moduller/stok/Liste.tsx', 'd'],
      ],
    );
  } finally {
    geciciSil(kok);
  }
});

test('ihlal dosya ve satır numarasıyla raporlanır', () => {
  const ihlaller = ihlalleriBul('sunucu/moduller/stok/servis.ts', "const a = 1;\n\nawait db.sorgu('x');\r\nawait db.tek('y');");
  assert.deepEqual(ihlaller.map((i) => [i.kural, i.satir]), [['e', 3], ['e', 4]]);
});

test('kural a istemcide: istemci modülü başka istemci modülünün yalnız disari.ts dosyasını ithal eder', () => {
  const dosya = 'istemci/src/moduller/emir/EmirAc.tsx';
  assert.deepEqual(kurallar(dosya, "import { Secim } from '../istasyon/Secim.tsx';"), ['a']);
  assert.deepEqual(kurallar(dosya, "import { anahtarlar } from '../istasyon/anahtarlar.ts';"), ['a']);
  assert.deepEqual(kurallar(dosya, "const m = await import('../istasyon/alt/Liste.tsx');"), ['a']);
  assert.deepEqual(kurallar(dosya, "import { Secim } from '../istasyon/disari.tsx';"), ['a']);
  assert.deepEqual(kurallar(dosya, "import { Secim } from '../istasyon/alt/disari.ts';"), ['a']);

  assert.deepEqual(kurallar(dosya, "import { Secim } from '../istasyon/disari.ts';"), []);
  assert.deepEqual(kurallar(dosya, "import { Secim } from '../istasyon/disari';"), []);
  assert.deepEqual(kurallar('sunucu/moduller/emir/servis.ts', "import { x } from '../istasyon/disari';"), []);
  assert.deepEqual(kurallar('sunucu/moduller/emir/servis.ts', "import { x } from '../istasyon/alt/disari.ts';"), ['a']);
  assert.deepEqual(kurallar(dosya, "import { Satir } from './Satir.tsx';\nimport { Kart } from '../../ortak/arayuz/index.ts';"), []);
  // Modüller klasörünün kendi dosyası modül değildir.
  assert.deepEqual(kurallar(dosya, "import { YapimAsamasinda } from '../YapimAsamasinda.tsx';"), []);
  assert.deepEqual(kurallar('istemci/src/moduller/YapimAsamasinda.tsx', "import { Secim } from './istasyon/Secim.tsx';"), []);
  // Aynı adlı sunucu ve istemci klasörü aynı modülün iki tarafıdır; taraflar arası ithal d kuralının işidir.
  assert.deepEqual(kurallar(dosya, "import { x } from '../../../../sunucu/moduller/emir/servis.ts';"), ['d']);
  assert.deepEqual(kurallar(dosya, "import { x } from '../../../../sunucu/moduller/istasyon/servis.ts';"), ['d']);
});

test('kural a test dosyasında da geçerlidir: iki tarafta da test başka modülün içine uzanmaz', () => {
  const ic = "import { x } from '../istasyon/servis.ts';";
  const disari = "import { x } from '../istasyon/disari.ts';";
  assert.deepEqual(kurallar('sunucu/moduller/emir/emir.test.ts', ic), ['a']);
  assert.deepEqual(kurallar('istemci/src/moduller/emir/EmirAc.test.tsx', ic), ['a']);
  assert.deepEqual(kurallar('istemci/src/moduller/emir/test-ortak.tsx', ic), ['a']);
  assert.deepEqual(kurallar('sunucu/moduller/emir/emir.test.ts', disari), []);
  assert.deepEqual(kurallar('istemci/src/moduller/emir/EmirAc.test.tsx', disari), []);
});

const ithal = (hedef: string, tip = false): string => `import ${tip ? 'type ' : ''}{ x } from '${hedef}';\n`;
const sunucuDosyasi = (modul: string, ad: string, ...hedefler: string[]): KaynakDosya =>
  ({ dosya: `sunucu/moduller/${modul}/${ad}`, icerik: hedefler.map((h) => ithal(`../${h}/disari.ts`)).join('') });
const istemciDosyasi = (modul: string, ad: string, ...hedefler: string[]): KaynakDosya =>
  ({ dosya: `istemci/src/moduller/${modul}/${ad}`, icerik: hedefler.map((h) => ithal(`../${h}/disari.ts`)).join('') });
const donguSatirlari = (dosyalar: readonly KaynakDosya[]): string[] =>
  donguleriBul(modulKenarlari(dosyalar)).map((d) => ihlalSatiri(donguIhlali(d)));

test('klasör ithali modülün kendisidir: uzantısız ad, sondaki eğik çizgi ve index dosyası kural a ihlali ve kenardır', () => {
  for (const [taraf, dosya] of [['istemci', 'istemci/src/moduller/a/Ekran.tsx'], ['sunucu', 'sunucu/moduller/a/servis.ts']] as const) {
    for (const hedef of ['../b', '../b/', '../b/index.ts']) {
      assert.deepEqual(kurallar(dosya, ithal(hedef)), ['a'], `${taraf} ${hedef}`);
      assert.deepEqual(
        modulKenarlari([{ dosya, icerik: ithal(hedef) }]).map((k) => [k.taraf, k.kaynak, k.hedef]), [[taraf, 'a', 'b']], `${taraf} ${hedef}`,
      );
    }
  }
  // Modüller klasörünün uzantılı dosyası modül değildir: ne ihlal ne kenar.
  const ortak = [
    { dosya: 'istemci/src/moduller/a/Ekran.tsx', icerik: ithal('../YapimAsamasinda.tsx') },
    { dosya: 'sunucu/moduller/a/servis.ts', icerik: ithal('../ortak.ts') },
  ];
  assert.deepEqual(modulKenarlari(ortak), []);
  for (const { dosya, icerik } of ortak) assert.deepEqual(kurallar(dosya, icerik), []);
});

test('kenarlar: modülden modüle, kenar başına ilk dosya ve satır; test kenarı ayrı, modül içi ve modül dışı ithal kenar değil', () => {
  const kenarlar = modulKenarlari([
    { dosya: 'sunucu/moduller/alfa/servis.ts', icerik: `// not\n${ithal('./kurallar.ts')}${ithal('../beta/disari.ts')}${ithal('#cekirdek/db.ts')}` },
    sunucuDosyasi('alfa', 'kurallar.ts', 'beta'),
    sunucuDosyasi('alfa', 'alfa.test.ts', 'beta', 'gama'),
    { dosya: 'sunucu/ana.ts', icerik: ithal('./moduller/gama/disari.ts') },
  ]);
  assert.deepEqual(kenarlar, [
    { taraf: 'sunucu', kaynak: 'alfa', hedef: 'beta', test: true, dosya: 'sunucu/moduller/alfa/alfa.test.ts', satir: 1 },
    { taraf: 'sunucu', kaynak: 'alfa', hedef: 'gama', test: true, dosya: 'sunucu/moduller/alfa/alfa.test.ts', satir: 2 },
    { taraf: 'sunucu', kaynak: 'alfa', hedef: 'beta', test: false, dosya: 'sunucu/moduller/alfa/kurallar.ts', satir: 1 },
  ]);
});

test('kenarlar: taraflar arası ithal kenar değildir; testlerin ortak kurulum dosyası test kenarıdır', () => {
  assert.deepEqual(modulKenarlari([
    { dosya: 'istemci/src/moduller/emir/Ekran.tsx', icerik: ithal('../../../../sunucu/moduller/stok/disari.ts') },
    { dosya: 'sunucu/moduller/stok/servis.ts', icerik: ithal('../../../istemci/src/moduller/emir/disari.ts') },
  ]), []);

  const kurulum = [istemciDosyasi('emir', 'test-ortak.tsx', 'stok'), sunucuDosyasi('emir', 'test-ortak.ts', 'rota'), istemciDosyasi('emir', 'ortak.tsx', 'plan')];
  assert.deepEqual(modulKenarlari(kurulum).map((k) => [k.hedef, k.test]), [['plan', false], ['stok', true], ['rota', true]]);
  assert.deepEqual(donguSatirlari([istemciDosyasi('emir', 'test-ortak.tsx', 'stok'), istemciDosyasi('stok', 'Ekran.tsx', 'emir')]), []);
});

test('kenarlar: modülün örnek verisi döngüye girmez; yalnız sunucu modül kökündeki ornek-veri.ts', () => {
  const ters = sunucuDosyasi('rota', 'servis.ts', 'uretim-emirleri');
  assert.deepEqual(donguSatirlari([sunucuDosyasi('uretim-emirleri', 'ornek-veri.ts', 'rota'), ters]), []);
  assert.deepEqual(modulKenarlari([sunucuDosyasi('uretim-emirleri', 'ornek-veri.ts', 'rota')]).map((k) => k.test), [true]);

  assert.notDeepEqual(donguSatirlari([sunucuDosyasi('uretim-emirleri', 'servis.ts', 'rota'), ters]), []);
  assert.notDeepEqual(donguSatirlari([{ dosya: 'sunucu/moduller/uretim-emirleri/alt/ornek-veri.ts', icerik: ithal('../../rota/disari.ts') }, ters]), []);
  assert.notDeepEqual(donguSatirlari([istemciDosyasi('uretim-emirleri', 'ornek-veri.ts', 'rota'), istemciDosyasi('rota', 'Ekran.tsx', 'uretim-emirleri')]), []);
});

test('kural f: doğrudan döngü ilk kenarın yeriyle, yoluyla ve bileşeniyle raporlanır', () => {
  assert.deepEqual(donguSatirlari([sunucuDosyasi('stok', 'servis.ts', 'rota'), sunucuDosyasi('rota', 'servis.ts', 'stok')]),
    ['sunucu/moduller/rota/servis.ts:1 [kural f] döngü: rota -> stok -> rota (bileşen: rota, stok)']);
  assert.deepEqual(donguSatirlari([sunucuDosyasi('stok', 'servis.ts', 'rota'), sunucuDosyasi('rota', 'servis.ts', 'plan')]), []);
});

test('kural f: dolaylı döngü bulunur; yol en küçük adlı modülden başlar, yer o modülün çıkış kenarıdır', () => {
  const dosyalar = [
    sunucuDosyasi('stok', 'servis.ts', 'rota'),
    sunucuDosyasi('rota', 'servis.ts', 'plan'),
    { dosya: 'sunucu/moduller/plan/servis.ts', icerik: `const a = 1;\n\n${ithal('../stok/disari.ts')}` },
    sunucuDosyasi('plan', 'kurallar.ts', 'kisi'),
  ];
  assert.deepEqual(donguSatirlari(dosyalar),
    ['sunucu/moduller/plan/servis.ts:3 [kural f] döngü: plan -> stok -> rota -> plan (bileşen: plan, rota, stok)']);
});

test('kural f: test dosyasından geçen kenar döngü kurmaz', () => {
  assert.deepEqual(donguSatirlari([sunucuDosyasi('giris', 'servis.ts', 'kisi'), sunucuDosyasi('kisi', 'kisi.test.ts', 'giris')]), []);
  assert.deepEqual(donguSatirlari([istemciDosyasi('giris', 'Ekran.tsx', 'kisi'), istemciDosyasi('kisi', 'Ekran.test.tsx', 'giris')]), []);
  assert.equal(donguSatirlari([sunucuDosyasi('giris', 'servis.ts', 'kisi'), sunucuDosyasi('kisi', 'servis.ts', 'giris')]).length, 1);
});

test('kural f: import type de kenardır', () => {
  const dosyalar = [
    { dosya: 'sunucu/moduller/stok/servis.ts', icerik: ithal('../rota/disari.ts', true) },
    { dosya: 'sunucu/moduller/rota/servis.ts', icerik: "import {\n  type Stok,\n} from '../stok/disari.ts';\n" },
  ];
  assert.deepEqual(donguSatirlari(dosyalar), ['sunucu/moduller/rota/servis.ts:3 [kural f] döngü: rota -> stok -> rota (bileşen: rota, stok)']);
});

test('kural f: sunucu ve istemci ayrı grafiktir; bir yönü sunucuda öbür yönü istemcide olan çift döngü değildir', () => {
  assert.deepEqual(donguSatirlari([sunucuDosyasi('stok', 'servis.ts', 'rota'), istemciDosyasi('rota', 'Ekran.tsx', 'stok')]), []);
  const ikisi = [
    istemciDosyasi('stok', 'Ekran.tsx', 'rota'), istemciDosyasi('rota', 'Ekran.tsx', 'stok'),
    sunucuDosyasi('plan', 'servis.ts', 'emir'), sunucuDosyasi('emir', 'servis.ts', 'plan'),
  ];
  assert.deepEqual(donguSatirlari(ikisi), [
    'sunucu/moduller/emir/servis.ts:1 [kural f] döngü: emir -> plan -> emir (bileşen: emir, plan)',
    'istemci/src/moduller/rota/Ekran.tsx:1 [kural f] döngü: rota -> stok -> rota (bileşen: rota, stok)',
  ]);
});

test('kural f: bileşen başına tek rapor, en kısa döngüyle; sekiz tek bileşendir, kuyruk raporlanmaz, sıra dosya sırasından bağımsızdır', () => {
  // Sekiz: b -> c -> d -> b ile d -> e -> d ortak d üzerinden; a kuyruğu sekize girer, z ondan çıkar. m ile n ayrı bileşen; sekiz ona bağlı.
  const dosyalar = [
    sunucuDosyasi('a', 'servis.ts', 'b'),
    sunucuDosyasi('b', 'servis.ts', 'c', 'm'),
    sunucuDosyasi('c', 'servis.ts', 'd'),
    sunucuDosyasi('d', 'kurallar.ts', 'b', 'e', 'z'),
    sunucuDosyasi('e', 'servis.ts', 'd'),
    sunucuDosyasi('n', 'servis.ts', 'm'),
    sunucuDosyasi('m', 'servis.ts', 'n'),
  ];
  const beklenen = [
    'sunucu/moduller/d/kurallar.ts:2 [kural f] döngü: d -> e -> d (bileşen: b, c, d, e)',
    'sunucu/moduller/m/servis.ts:1 [kural f] döngü: m -> n -> m (bileşen: m, n)',
  ];
  assert.deepEqual(donguSatirlari(dosyalar), beklenen);
  assert.deepEqual(donguSatirlari([...dosyalar].reverse()), beklenen);

  const donguler = donguleriBul(modulKenarlari(dosyalar));
  // Modül kipi bileşene bakar: c raporlanan yolda yok ama döngünün içinde.
  assert.deepEqual(modulunDonguleri(donguler, 'c').map((d) => d.bilesen.join(' ')), ['b c d e']);
  assert.deepEqual(modulunDonguleri(donguler, 'a'), []);
  assert.deepEqual(modulunDonguleri(donguler, 'z'), []);
});

const modulAdlari = (adet: number): string[] => Array.from({ length: adet }, (_, sira) => `m${String(sira).padStart(3, '0')}`);

test('kural f: yoğun grafikte de tek rapor ve kısa süre; uzun halka çağrı yığınını taşırmaz', () => {
  // Her modül sonraki üçe bağlı, sondan başa tek geri kenar: yalın döngü sayısı üstel, bileşen tek.
  const yogun = modulAdlari(40);
  const yogunDosyalar = yogun.map((ad, sira) =>
    sunucuDosyasi(ad, 'servis.ts', ...(sira === yogun.length - 1 ? [yogun[0] ?? ''] : yogun.slice(sira + 1, sira + 4))));
  const basla = performance.now();
  const yogunDonguler = donguleriBul(modulKenarlari(yogunDosyalar));
  const sure = performance.now() - basla;
  assert.equal(yogunDonguler.length, 1);
  assert.deepEqual(yogunDonguler[0]?.bilesen, yogun);
  // 0'dan 39'a en az 13 adım (üçer üçer), bir de geri kenar.
  assert.equal(yogunDonguler[0]?.yol.length, 15);
  assert.equal(sure < 1000, true, `süre ${sure} ms`);

  const halka = modulAdlari(200);
  const halkaDonguler = donguleriBul(modulKenarlari(halka.map((ad, sira) => sunucuDosyasi(ad, 'servis.ts', halka[(sira + 1) % halka.length] ?? ''))));
  assert.equal(halkaDonguler.length, 1);
  assert.deepEqual(halkaDonguler[0]?.yol, [...halka, halka[0]]);
  assert.equal(halkaDonguler[0]?.dosya, 'sunucu/moduller/m000/servis.ts');

  // Halka değil zincir: derinlik aynı, döngü yok.
  const zincir = modulAdlari(5000);
  assert.deepEqual(donguleriBul(modulKenarlari(zincir.slice(1).map((ad, sira) => sunucuDosyasi(zincir[sira] ?? '', 'servis.ts', ad)))), []);
});

test('araç alt süreç olarak: döngü kural f ile çıkış kodunu bozar; modül kipi o modülün döngülerini taban farkına bakmadan sayar', () => {
  const depo = realpathSync.native(mkdtempSync(join(tmpdir(), 'tmiv2-dongu-')));
  const yaz = (yol: string, icerik: string): void => {
    mkdirSync(dirname(join(depo, yol)), { recursive: true });
    writeFileSync(join(depo, yol), icerik);
  };
  const git = (...a: string[]) =>
    execFileSync('git', ['-c', 'user.name=deneme', '-c', 'user.email=deneme@example.invalid', ...a], { cwd: depo, stdio: 'ignore' });
  const kos = (...a: string[]) => {
    const s = spawnSync(process.execPath, [join(depo, 'araclar/sinir-denetimi.ts'), ...a], { cwd: depo, encoding: 'utf8' });
    return { kod: s.status, cikti: s.stdout, hata: s.stderr };
  };
  try {
    writeFileSync(join(depo, 'package.json'), '{ "type": "module" }\n');
    mkdirSync(join(depo, 'araclar'));
    copyFileSync(fileURLToPath(new URL('./sinir-denetimi.ts', import.meta.url)), join(depo, 'araclar/sinir-denetimi.ts'));
    yaz('sunucu/moduller/stok/servis.ts', ithal('../rota/disari.ts'));
    yaz('sunucu/moduller/rota/servis.ts', ithal('../stok/disari.ts'));
    yaz('sunucu/moduller/plan/servis.ts', ithal('../stok/disari.ts'));
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'ilk');

    const tam = kos();
    assert.equal(tam.kod, 1);
    assert.equal(tam.hata.trim(), 'sunucu/moduller/rota/servis.ts:1 [kural f] döngü: rota -> stok -> rota (bileşen: rota, stok)');
    assert.match(tam.cikti, /Sınır denetimi: 3 dosya, 1 ihlal\./);
    assert.doesNotMatch(tam.cikti, /Döngü denetimi/);

    // Tabana göre değişen dosya yok: döngü dalın farkından değil deponun bugünkü halinden okunur.
    const icinde = kos('--modul', 'stok');
    assert.equal(icinde.kod, 1);
    assert.match(icinde.cikti, /Döngü denetimi \(stok\): 1 döngü\./);
    assert.match(icinde.cikti, /Yol denetimi \(stok, taban main\): 0 ihlal\./);
    const disinda = kos('--modul', 'plan');
    assert.equal(disinda.kod, 1);
    assert.match(disinda.cikti, /Döngü denetimi \(plan\): 0 döngü\./);
  } finally {
    geciciSil(depo);
  }
});

test('gerçek depoda modüller arası döngü yok', async () => {
  const { donguler } = await depoyuDenetle(fileURLToPath(new URL('../', import.meta.url)));
  assert.deepEqual(donguler.map((d) => `${d.taraf}: ${d.yol.join(' -> ')}`), []);
});

test('modülün üst düzey ek klasörü yalnız o modüle ve iki tarafa açıktır; benzer adlı klasör ve başka modül ihlal', () => {
  const ek = [
    { yol: 'arkon/web/src/data/store.ts', yeni: false },
    { yol: 'arkon/shared/model.ts', yeni: true },
  ];
  assert.deepEqual(yolIhlalleri('arkon', ek), []);
  assert.deepEqual(yolIhlalleri('arkon', ek, 'sunucu'), []);
  assert.deepEqual(yolIhlalleri('arkon', ek, 'istemci'), []);
  const disarida = [{ yol: 'arkon-eski/web.ts', yeni: true }, { yol: 'araclar/harita.ts', yeni: false }];
  assert.deepEqual(yolIhlalleri('arkon', [...ek, ...disarida]), disarida.map((d) => d.yol).sort());
  assert.deepEqual(yolIhlalleri('stok', ek), ek.map((d) => d.yol).sort());
  // Nesnenin kendi alanı olmayan ad (miras alınan) ek klasör vermez.
  assert.deepEqual(yolIhlalleri('constructor', [{ yol: 'constructor/x.ts', yeni: true }]), ['constructor/x.ts']);
});
