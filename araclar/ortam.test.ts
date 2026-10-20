import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { anaAgacKoku, envYolu, GOC_KIMLIGI, ortamiYukle } from './ortam.ts';

type Ortamlar = Record<string, string | undefined>;

const gecici = mkdtempSync(join(tmpdir(), 'tmiv2-ortam-'));
after(() => rmSync(gecici, { recursive: true, force: true }));

function klasor(ad: string, env?: string): string {
  const yol = join(gecici, ad);
  mkdirSync(yol);
  if (env !== undefined) writeFileSync(join(yol, '.env'), env);
  return yol;
}

const anaYok = (): null => null;
// Çelişki testlerinin değerleri: iletide hiçbiri geçmemeli. Sayı değil, geçici yolun içinde rastlanmayacak metin.
const DEGERLER = ['dosyadaki-port', 'surecteki-port', 'dosyadaki-gizli', 'surecteki-gizli'];
const hata = (islem: () => unknown): Error => {
  try {
    islem();
  } catch (yakalanan) {
    assert.ok(yakalanan instanceof Error);
    return yakalanan;
  }
  return assert.fail('hata bekleniyordu, yükleme geçti');
};

test('yol: önce bulunulan ağaç, o yoksa ana ağaç, ikisi de yoksa null', () => {
  const agac = join('kok', 'agac');
  const ana = join('kok', 'ana');
  const yerel = join(agac, '.env');
  const anadaki = join(ana, '.env');
  const yalniz = (...yollar: string[]) => (yol: string) => yollar.includes(yol);

  assert.equal(envYolu(agac, () => ana, yalniz(yerel, anadaki)), yerel);
  assert.equal(envYolu(agac, () => ana, yalniz(anadaki)), anadaki);
  assert.equal(envYolu(agac, () => ana, yalniz()), null);
  assert.equal(envYolu(agac, () => null, yalniz(anadaki)), null);
});

test('yerel .env varken ana ağaç hiç aranmaz', () => {
  const agac = join('kok', 'agac');
  const yol = envYolu(agac, () => assert.fail('ana ağaç arandı'), () => true);
  assert.equal(yol, join(agac, '.env'));
});

test('yalnız .env: TMIV2_ değişkenleri dosyadan gelir, TMIV2_ dışındaki satır alınmaz', () => {
  const agac = klasor('yalniz-dosya', 'TMIV2_ORTAM=gelistirme\nTMIV2_PORT=4100\nPGDATABASE=baska\n');
  const hedef: Ortamlar = { PATH: 'dokunulmaz' };

  assert.equal(ortamiYukle(agac, hedef, anaYok), join(agac, '.env'));
  assert.deepEqual(hedef, { PATH: 'dokunulmaz', TMIV2_ORTAM: 'gelistirme', TMIV2_PORT: '4100' });
});

test('yalnız süreç ortamı: hiçbir yerde .env yoksa ortam olduğu gibi kalır, değer uydurulmaz', () => {
  const hedef: Ortamlar = { TMIV2_ORTAM: 'test', TMIV2_PORT: '4300' };
  assert.equal(ortamiYukle(klasor('yalniz-surec'), hedef, () => klasor('yalniz-surec-ana')), null);
  assert.deepEqual(hedef, { TMIV2_ORTAM: 'test', TMIV2_PORT: '4300' });
});

test('ikisi birlikte: aynı değerle tanımlı değişken hata değildir, sonuç dosyanın tamamıdır', () => {
  const agac = klasor('ikisi-ayni', 'TMIV2_ORTAM=gelistirme\nTMIV2_PORT=4100\nTMIV2_BOS=\n');
  const hedef: Ortamlar = { TMIV2_PORT: '4100', TMIV2_BOS: '', PGDATABASE: 'baska' };

  ortamiYukle(agac, hedef, anaYok);
  assert.deepEqual(hedef, { TMIV2_ORTAM: 'gelistirme', TMIV2_PORT: '4100', TMIV2_BOS: '', PGDATABASE: 'baska' });
});

test('ikisi birlikte: farklı değerde .env ezilmez, süreç değeri de geçmez; hata değişkenin adını verir, değerini vermez', () => {
  const agac = klasor('ikisi-farkli', 'TMIV2_ORTAM=gelistirme\nTMIV2_PORT=dosyadaki-port\nTMIV2_PG_PASSWORD=dosyadaki-gizli\nTMIV2_PG_HOST=127.0.0.1\n');
  const surecteki = { TMIV2_PORT: 'surecteki-port', TMIV2_PG_PASSWORD: 'surecteki-gizli', TMIV2_PG_HOST: '127.0.0.1' };
  const hedef: Ortamlar = { ...surecteki };

  const ileti = hata(() => ortamiYukle(agac, hedef, anaYok)).message;
  assert.match(ileti, /Ortam çelişkisi/);
  assert.match(ileti, /farklı değerle tanımlı: TMIV2_PORT, TMIV2_PG_PASSWORD\./);
  assert.doesNotMatch(ileti, /TMIV2_PG_HOST|TMIV2_ORTAM/);
  for (const deger of DEGERLER) assert.equal(ileti.includes(deger), false, deger);
  // Yarım yükleme yok: hata veren koşu ortama hiçbir şey yazmaz.
  assert.deepEqual(hedef, surecteki);
});

test('ikisi birlikte: .env dosyasında olmayan süreç değişkeni de okunmaz, adıyla durulur', () => {
  const agac = klasor('ikisi-fazla', 'TMIV2_ORTAM=gelistirme\n');
  const ileti = hata(() => ortamiYukle(agac, { TMIV2_COMMIT: 'surecteki-gizli', BASKA: 'x' }, anaYok)).message;
  assert.match(ileti, /\.env dosyasında yok: TMIV2_COMMIT\./);
  assert.equal(ileti.includes('surecteki-gizli'), false);
  assert.doesNotMatch(ileti, /BASKA|farklı değerle/);
});

test('worktree: ağaçta .env yoksa ana ağacınki ".env var" sayılır; çelişki ona karşı da hatadır', () => {
  const ana = klasor('ana', 'TMIV2_PORT=4100\nTMIV2_ORTAM=gelistirme\n');
  const hedef: Ortamlar = {};
  assert.equal(ortamiYukle(klasor('agac'), hedef, () => ana), join(ana, '.env'));
  assert.deepEqual(hedef, { TMIV2_ORTAM: 'gelistirme', TMIV2_PORT: '4100' });

  const ileti = hata(() => ortamiYukle(klasor('agac-celiski'), { TMIV2_ORTAM: 'test' }, () => ana)).message;
  assert.match(ileti, /farklı değerle tanımlı: TMIV2_ORTAM\./);
  assert.equal(ileti.includes(join(ana, '.env')), true);
});

test('yükleme: ağacın kendi .env dosyası ana ağacınkinin önüne geçer', () => {
  const ana = klasor('ana2', 'TMIV2_ORTAM=gelistirme\nTMIV2_PORT=4100\n');
  const agac = klasor('agac2', 'TMIV2_ORTAM=gelistirme\nTMIV2_PORT=4200\n');
  const hedef: Ortamlar = {};

  assert.equal(ortamiYukle(agac, hedef, () => ana), join(agac, '.env'));
  assert.deepEqual(hedef, { TMIV2_ORTAM: 'gelistirme', TMIV2_PORT: '4200' });
});

test('TMIV2_ORTAM her kaynakta zorunlu: dosyada yoksa, ortamda yoksa ya da boşsa adıyla durulur', () => {
  const eksik = /Ortam değişkeni eksik: TMIV2_ORTAM/;
  assert.match(hata(() => ortamiYukle(klasor('ortamsiz'), { TMIV2_PORT: '4100' }, anaYok)).message, eksik);
  assert.match(hata(() => ortamiYukle(klasor('ortam-bos'), { TMIV2_ORTAM: '  ' }, anaYok)).message, eksik);
  const dosyali = klasor('ortamsiz-dosya', 'TMIV2_PORT=4100\n');
  const ileti = hata(() => ortamiYukle(dosyali, {}, anaYok)).message;
  assert.match(ileti, eksik);
  assert.equal(ileti.includes(join(dosyali, '.env')), true);
});

test('worktree içinden sorulunca worktree değil ana ağaç kökü döner', () => {
  const ana = klasor('depo');
  const agac = join(gecici, 'depo-agac');
  const git = (...argumanlar: string[]) => execFileSync('git', argumanlar, { cwd: ana, stdio: 'ignore' });
  git('init', '-q');
  git('-c', 'user.name=deneme', '-c', 'user.email=deneme@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'ilk');
  git('worktree', 'add', '-q', '--detach', agac);

  // Geçici klasör kısa adla gelebilir (Windows); karşılaştırma gerçek yol üzerinden yapılır.
  const gercek = (yol: string | null) => (yol === null ? null : realpathSync.native(yol));
  assert.equal(gercek(anaAgacKoku(agac)), gercek(ana));
  assert.notEqual(gercek(anaAgacKoku(agac)), gercek(agac));
  assert.equal(gercek(anaAgacKoku(ana)), gercek(ana));
});

test('ana ağaç kökü git ile bulunur; depo olmayan klasörde null', () => {
  const kok = anaAgacKoku(fileURLToPath(new URL('../', import.meta.url)));
  assert.ok(kok !== null);
  assert.equal(existsSync(join(kok, 'package.json')), true);
  assert.equal(existsSync(join(kok, '.git')), true);
  assert.equal(anaAgacKoku(klasor('depo-degil')), null);
});

test('ortamdaki git yönlendirmesi depo dışı klasörü ana ağaca bağlamaz', () => {
  const depoGit = join(fileURLToPath(new URL('../', import.meta.url)), '.git');
  const disari = klasor('git-yonlendirme');
  for (const ad of ['GIT_DIR', 'git_dir', 'GIT_COMMON_DIR']) {
    assert.equal(anaAgacKoku(disari, { ...process.env, [ad]: depoGit }), null, ad);
  }
  assert.equal(anaAgacKoku(disari, { ...process.env, GIT_DIR: depoGit, GIT_WORK_TREE: disari }), null);
});

test('farklı harfle yazılmış ad süreç ortamındaki tanım sayılır: iki platformda aynı sonuç', () => {
  const dosya = 'TMIV2_ORTAM=gelistirme\nTMIV2_PORT=dosyadaki-port\n';
  const farkli = hata(() => ortamiYukle(klasor('harf-farkli', dosya), { tmiv2_port: 'surecteki-port' }, anaYok)).message;
  assert.match(farkli, /\.env dosyasında yok: tmiv2_port\./);
  for (const deger of DEGERLER) assert.doesNotMatch(farkli, new RegExp(deger));

  // Hariç tutulan ad farklı harfle de hariçtir: çelişki sayılmaz.
  assert.doesNotThrow(() => ortamiYukle(klasor('harf-haric', dosya), { tmiv2_pg_goc_user: 'baska' }, anaYok, GOC_KIMLIGI));
});

test('hariç tutulan değişken dosyadan alınmaz, ortamda tanımlıysa silinir ve çelişki sayılmaz; hariç tutulmayınca çelişkidir', () => {
  const dosya = 'TMIV2_ORTAM=gelistirme\nTMIV2_PG_GOC_USER=sahip\nTMIV2_PG_GOC_PASSWORD=dosyadan\n';
  const dosyadan: Ortamlar = {};
  ortamiYukle(klasor('haric-dosya', dosya), dosyadan, anaYok, GOC_KIMLIGI);
  assert.deepEqual(dosyadan, { TMIV2_ORTAM: 'gelistirme' });

  const ortamdan: Ortamlar = { TMIV2_ORTAM: 'test', TMIV2_PG_GOC_PASSWORD: 'ortamdan', TMIV2_PG_USER: 'uygulama' };
  ortamiYukle(klasor('haric-ortam'), ortamdan, anaYok, GOC_KIMLIGI);
  assert.deepEqual(ortamdan, { TMIV2_ORTAM: 'test', TMIV2_PG_USER: 'uygulama' });

  const ikisinden: Ortamlar = { TMIV2_PG_GOC_PASSWORD: 'ortamdan', TMIV2_PG_GOC_USER: 'baska' };
  ortamiYukle(klasor('haric-ikisi', dosya), ikisinden, anaYok, GOC_KIMLIGI);
  assert.deepEqual(ikisinden, { TMIV2_ORTAM: 'gelistirme' });

  const hepsi: Ortamlar = {};
  ortamiYukle(klasor('haric-yok', dosya), hepsi, anaYok);
  assert.deepEqual(hepsi, { TMIV2_ORTAM: 'gelistirme', TMIV2_PG_GOC_USER: 'sahip', TMIV2_PG_GOC_PASSWORD: 'dosyadan' });

  const ileti = hata(() => ortamiYukle(klasor('haric-yok-celiski', dosya), { TMIV2_PG_GOC_PASSWORD: 'ortamdan' }, anaYok)).message;
  assert.match(ileti, /farklı değerle tanımlı: TMIV2_PG_GOC_PASSWORD\./);
});

// Ön yükleme dosyaları gerçek süreçte ölçülür. Kök dosyanın yerinden bulunduğu için dosyalar depo dışındaki
// geçici bir köke kopyalanır: orada .env yalnız test koyarsa vardır, ana ağaca da düşülmez.
const ON_YUKLEMELER = ['ortam.ts', 'ortam-yukle.ts', 'ortam-yukle-goc.ts'];
const IZLENENLER = ['TMIV2_ORTAM', 'TMIV2_PORT', 'TMIV2_PG_GOC_USER', 'TMIV2_PG_GOC_PASSWORD', 'TMIV2_DENEME_IZI'];
const TMIV2SIZ = Object.fromEntries(Object.entries(process.env).filter(([ad]) => !ad.toUpperCase().startsWith('TMIV2_')));

function onYuklemeKoku(ad: string, env?: string): string {
  const kok = klasor(ad, env);
  mkdirSync(join(kok, 'araclar'));
  for (const dosya of ON_YUKLEMELER) copyFileSync(new URL(`./${dosya}`, import.meta.url), join(kok, 'araclar', dosya));
  assert.equal(anaAgacKoku(kok), null, 'geçici klasör bir git deposunun içinde; ön yükleme testi başka .env dosyasına düşer');
  return kok;
}

interface SurecSonucu {
  kod: number | null;
  gorunen: Record<string, string>;
  hata: string;
}

function onYuklemeyleKos(kok: string, onYukleme: string, ortam: Record<string, string>): SurecSonucu {
  const yazdir = `console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(IZLENENLER)}.flatMap((ad) => process.env[ad] === undefined ? [] : [[ad, process.env[ad]]]))))`;
  const s = spawnSync(process.execPath, ['--import', `./araclar/${onYukleme}`, '-e', yazdir], { cwd: kok, encoding: 'utf8', env: { ...TMIV2SIZ, ...ortam } });
  return { kod: s.status, gorunen: s.stdout.trim() === '' ? {} : JSON.parse(s.stdout) as Record<string, string>, hata: s.stderr };
}

test('ön yükleme, .env yok: ortam-yukle.ts göç kimliğini süreçten düşürür, ortam-yukle-goc.ts bırakır', () => {
  const kok = onYuklemeKoku('surec-dosyasiz');
  const ortam = { TMIV2_ORTAM: 'test', TMIV2_PG_GOC_USER: 'sahip', TMIV2_PG_GOC_PASSWORD: 'deneme', TMIV2_DENEME_IZI: '1' };

  const uygulama = onYuklemeyleKos(kok, 'ortam-yukle.ts', ortam);
  assert.deepEqual(uygulama, { kod: 0, gorunen: { TMIV2_ORTAM: 'test', TMIV2_DENEME_IZI: '1' }, hata: '' });
  assert.deepEqual(onYuklemeyleKos(kok, 'ortam-yukle-goc.ts', ortam), { kod: 0, gorunen: ortam, hata: '' });
});

test('ön yükleme, .env var: değerler dosyadan gelir; uygulama ön yüklemesi göç kimliğini iki kaynaktan da düşürür', () => {
  const dosyadaki = { TMIV2_ORTAM: 'gelistirme', TMIV2_PORT: '4100', TMIV2_PG_GOC_USER: 'sahip', TMIV2_PG_GOC_PASSWORD: 'dosyadaki-gizli' };
  const kok = onYuklemeKoku('surec-dosyali', Object.entries(dosyadaki).map(([ad, deger]) => `${ad}=${deger}\n`).join(''));

  assert.deepEqual(onYuklemeyleKos(kok, 'ortam-yukle-goc.ts', {}), { kod: 0, gorunen: dosyadaki, hata: '' });
  assert.deepEqual(onYuklemeyleKos(kok, 'ortam-yukle-goc.ts', { TMIV2_PORT: '4100' }), { kod: 0, gorunen: dosyadaki, hata: '' });

  const uygulama = onYuklemeyleKos(kok, 'ortam-yukle.ts', { TMIV2_PG_GOC_USER: 'baska', TMIV2_PG_GOC_PASSWORD: 'surecteki-gizli' });
  assert.deepEqual(uygulama, { kod: 0, gorunen: { TMIV2_ORTAM: 'gelistirme', TMIV2_PORT: '4100' }, hata: '' });
});

test('ön yükleme, .env var ve süreç ortamı çelişiyor: süreç 1 ile biter; tek satır, değişkenin adı var, değeri yok', () => {
  const kok = onYuklemeKoku('surec-celiski', 'TMIV2_ORTAM=gelistirme\nTMIV2_PORT=dosyadaki-port\nTMIV2_PG_GOC_USER=sahip\nTMIV2_PG_GOC_PASSWORD=dosyadaki-gizli\n');

  for (const [onYukleme, ortam, ad] of [
    ['ortam-yukle.ts', { TMIV2_PORT: 'surecteki-port' }, 'TMIV2_PORT'],
    ['ortam-yukle-goc.ts', { TMIV2_PORT: 'surecteki-port' }, 'TMIV2_PORT'],
    ['ortam-yukle-goc.ts', { TMIV2_PG_GOC_PASSWORD: 'surecteki-gizli' }, 'TMIV2_PG_GOC_PASSWORD'],
  ] as const) {
    const s = onYuklemeyleKos(kok, onYukleme, ortam);
    assert.equal(s.kod, 1, onYukleme);
    assert.deepEqual(s.gorunen, {}, 'çelişkide asıl komut hiç koşmaz');
    assert.match(s.hata, new RegExp(`^Ortam çelişkisi: .*farklı değerle tanımlı: ${ad}\\..*\\r?\\n$`));
    for (const deger of DEGERLER) assert.equal(s.hata.includes(deger), false, deger);
  }
});

test('ön yükleme: TMIV2_ORTAM hiçbir kaynakta yoksa iki ön yükleme de adıyla durur', () => {
  const kok = onYuklemeKoku('surec-ortamsiz');
  for (const onYukleme of ['ortam-yukle.ts', 'ortam-yukle-goc.ts']) {
    const s = onYuklemeyleKos(kok, onYukleme, { TMIV2_PORT: '4100' });
    assert.equal(s.kod, 1, onYukleme);
    assert.deepEqual(s.gorunen, {});
    assert.match(s.hata, /^Ortam değişkeni eksik: TMIV2_ORTAM \(kaynak: süreç ortamı; \.env dosyası bulunamadı\)\r?\n$/);
  }
});
