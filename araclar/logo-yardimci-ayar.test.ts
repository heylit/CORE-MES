import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { DURUM_DOSYASI, EXE_DEGISKENI, ayarPlani, kos } from './logo-yardimci-ayar.ts';
import { GOSTERGE_DOSYASI } from './logo-yardimcisi-guncelle.ts';

const ZAMAN = new Date('2026-11-19T05:00:00Z');
let kok = '';
let kurulum = '';
let exe = '';
let betik = '';
let env = '';

// Canlıdaki gibi: gizli pencere sarmalayıcısı ve günlük yönlendirmesi olan, exe yolunu sabit yazan betik (ORN- örnek).
function betikMetni(exeYolu: string, kapiDenetimi = true): string {
  return [
    '@echo off',
    'setlocal',
    ...(kapiDenetimi ? ['netstat -ano | findstr /r /c:"127.0.0.1:4195 .*LISTENING" >nul && exit /b 0'] : []),
    `start "" /b "${exeYolu}" --ayar "${kurulum}\\gizli\\logo-yardimcisi.ayar" >> "${kurulum}\\gunluk\\logo-yardimcisi.log" 2>&1`,
    '',
  ].join('\r\n');
}

beforeEach(() => {
  kok = mkdtempSync(join(tmpdir(), 'tmiv2-ayar-'));
  kurulum = join(kok, 'ORN-kurulum');
  const cikti = join(kurulum, 'logo-yardimcisi-1.0', 'cikti');
  mkdirSync(cikti, { recursive: true });
  exe = join(cikti, 'logo-yardimcisi.exe');
  writeFileSync(exe, 'ORN');
  betik = join(kurulum, 'logo-yardimcisi-baslat.cmd');
  writeFileSync(betik, betikMetni(exe));
  env = join(kurulum, '.env');
  writeFileSync(env, 'TMIV2_LOGO_KOPRU_ADRESI=http://127.0.0.1:4195\r\nTMIV2_LOGO_KOPRU_ANAHTARI=ORN-anahtar\r\n');
});
afterEach(() => { rmSync(kok, { recursive: true, force: true }); });

const okunan = (y: string): string => readFileSync(y, 'utf8');
const temel = (): string[] => ['--betik', betik, '--env', env];

describe('logo-yardimci-ayar (3432)', () => {
  test('önizleme hiçbir dosyayı değiştirmez ve ne yapacağını söyler', async () => {
    const once = { b: okunan(betik), e: okunan(env) };
    const s = await kos(temel(), ZAMAN);
    assert.equal(s.kod, 0);
    assert.match(s.cikti.join('\n'), /Önizleme/);
    assert.match(s.cikti.join('\n'), /TMIV2_LOGO_YARDIMCI_KURULUM ve TMIV2_LOGO_YARDIMCI_BASLAT eklenir/);
    assert.equal(okunan(betik), once.b);
    assert.equal(okunan(env), once.e);
    assert.equal(existsSync(join(kurulum, GOSTERGE_DOSYASI)), false);
    assert.equal(existsSync(join(kurulum, DURUM_DOSYASI)), false);
  });

  test('uygula: yalnız exe satırı değişir, sarmalayıcı kalır, gösterge bugünkü exe, .env iki satır, yedekler alınır', async () => {
    const eskiBetik = okunan(betik);
    const s = await kos([...temel(), '--uygula'], ZAMAN);
    assert.equal(s.kod, 0, s.cikti.join('\n'));
    const yeni = okunan(betik).split('\r\n');
    const eski = eskiBetik.split('\r\n');
    assert.equal(yeni[0], '@echo off');
    // Değişken betiğin başında atanır, exe okunamazsa önceki sabit yol kalır.
    assert.equal(yeni[2], `set "${EXE_DEGISKENI}=${exe}"`);
    assert.equal(yeni[3], `if exist "${join(kurulum, GOSTERGE_DOSYASI)}" set /p ${EXE_DEGISKENI}=<"${join(kurulum, GOSTERGE_DOSYASI)}"`);
    assert.equal(yeni[4], `if not exist "%${EXE_DEGISKENI}%" set "${EXE_DEGISKENI}=${exe}"`);
    const kalan = yeni.slice(5);
    assert.equal(kalan.length, eski.length - 1);
    assert.deepEqual(kalan.filter((x) => !x.includes(EXE_DEGISKENI)), eski.slice(1).filter((x) => !x.includes('logo-yardimcisi.exe')));
    const exeSatiri = kalan.find((x) => x.includes(EXE_DEGISKENI)) ?? '';
    assert.equal(exeSatiri, (eski.find((x) => x.includes('logo-yardimcisi.exe')) ?? '').replace(`"${exe}"`, `"%${EXE_DEGISKENI}%"`));
    assert.match(exeSatiri, /--ayar .*>> .*2>&1$/);

    assert.equal(okunan(join(kurulum, GOSTERGE_DOSYASI)), `${exe}\r\n`);
    const e = okunan(env);
    assert.match(e, /\r\nTMIV2_LOGO_YARDIMCI_KURULUM=.*ORN-kurulum\r\n/);
    assert.ok(e.includes(`TMIV2_LOGO_YARDIMCI_BASLAT=${betik}\r\n`));
    assert.ok(e.startsWith('TMIV2_LOGO_KOPRU_ADRESI=http://127.0.0.1:4195\r\n'));

    const yedekler = readdirSync(kurulum).filter((a) => a.includes('.yedek-'));
    assert.equal(yedekler.length, 2);
    assert.equal(okunan(join(kurulum, yedekler.find((a) => a.startsWith('logo-yardimcisi-baslat.cmd')) ?? '')), eskiBetik);
  });

  test('ikinci çalıştırma hiçbir şey yazmaz', async () => {
    await kos([...temel(), '--uygula'], ZAMAN);
    const once = { b: okunan(betik), e: okunan(env), g: okunan(join(kurulum, GOSTERGE_DOSYASI)) };
    const s = await kos([...temel(), '--uygula', '--kurulum', kurulum], new Date('2026-11-19T05:01:00Z'));
    assert.equal(s.kod, 0, s.cikti.join('\n'));
    assert.match(s.cikti[0] ?? '', /Zaten ayarlı/);
    assert.deepEqual({ b: okunan(betik), e: okunan(env), g: okunan(join(kurulum, GOSTERGE_DOSYASI)) }, once);
    assert.equal(readdirSync(kurulum).filter((a) => a.includes('.yedek-')).length, 2);
  });

  test('geri al: betik ve .env yedekten döner, çalışan hali ayrıca saklanır', async () => {
    const once = { b: okunan(betik), e: okunan(env) };
    await kos([...temel(), '--uygula'], ZAMAN);
    const s = await kos(['--geri-al', '--kurulum', kurulum], new Date('2026-11-19T05:02:00Z'));
    assert.equal(s.kod, 0, s.cikti.join('\n'));
    assert.equal(okunan(betik), once.b);
    assert.equal(okunan(env), once.e);
    assert.equal(existsSync(join(kurulum, DURUM_DOSYASI)), false);
    assert.equal(readdirSync(kurulum).filter((a) => a.includes('.geri-al-oncesi-')).length, 2);
    assert.equal((await kos(['--geri-al', '--kurulum', kurulum])).kod, 1);
  });

  test('exe iki satırda geçerse durur ve hiçbir dosya değişmez', async () => {
    writeFileSync(betik, `${betikMetni(exe)}rem yedek: "${exe}"\r\n`);
    const once = okunan(betik);
    const s = await kos([...temel(), '--uygula'], ZAMAN);
    assert.equal(s.kod, 1);
    assert.match(s.cikti[0] ?? '', /2 satır.*Hiçbir dosya değişmedi/);
    assert.equal(okunan(betik), once);
    assert.equal(existsSync(join(kurulum, GOSTERGE_DOSYASI)), false);
  });

  test('yolda İngilizce dışı harf varsa durur (cmd yolu yanlış okur, yardımcı açılmaz)', async () => {
    const tr = join(kok, 'ORN-kurulumı', 'logo-yardimcisi-1.0', 'cikti');
    mkdirSync(tr, { recursive: true });
    writeFileSync(join(tr, 'logo-yardimcisi.exe'), 'ORN');
    writeFileSync(betik, betikMetni(join(tr, 'logo-yardimcisi.exe')));
    const s = await kos([...temel(), '--uygula'], ZAMAN);
    assert.equal(s.kod, 1);
    assert.match(s.cikti[0] ?? '', /Exe yolu mutlak olmalı/);
  });

  test('betikteki exe yoksa durur', async () => {
    rmSync(exe);
    const s = await kos([...temel(), '--uygula'], ZAMAN);
    assert.equal(s.kod, 1);
    assert.match(s.cikti[0] ?? '', /exe bulunamadı/);
  });

  test('.env değeri farklıysa durur', async () => {
    writeFileSync(env, `${okunan(env)}TMIV2_LOGO_YARDIMCI_BASLAT=${join(kok, 'baska.cmd')}\r\n`);
    const s = await kos([...temel(), '--uygula'], ZAMAN);
    assert.equal(s.kod, 1);
    assert.match(s.cikti[0] ?? '', /başka bir değerle/);
    assert.equal(okunan(betik), betikMetni(exe));
  });

  test('sürüm klasöründeki .env kopyası reddedilir', async () => {
    const kopya = join(kok, 'surumler', 'ORN');
    mkdirSync(kopya, { recursive: true });
    writeFileSync(join(kopya, '.env'), okunan(env));
    const s = await kos(['--betik', betik, '--env', join(kopya, '.env')], ZAMAN);
    assert.equal(s.kod, 1);
    assert.match(s.cikti[0] ?? '', /sürüm klasöründe/);
  });

  test('gösterge zaten varsa üzerine yazılmaz', async () => {
    const diger = join(kurulum, 'logo-yardimcisi-2.0', 'cikti', 'logo-yardimcisi.exe');
    mkdirSync(join(kurulum, 'logo-yardimcisi-2.0', 'cikti'), { recursive: true });
    writeFileSync(diger, 'ORN');
    writeFileSync(join(kurulum, GOSTERGE_DOSYASI), `${diger}\r\n`);
    const s = await kos([...temel(), '--uygula'], ZAMAN);
    assert.equal(s.kod, 0, s.cikti.join('\n'));
    assert.equal(okunan(join(kurulum, GOSTERGE_DOSYASI)), `${diger}\r\n`);
  });

  test('kapı denetimi olmayan betikte uyarır', async () => {
    writeFileSync(betik, betikMetni(exe, false));
    const s = await kos(temel(), ZAMAN);
    assert.equal(s.kod, 0);
    assert.match(s.cikti.join('\n'), /Uyarı: Betikte yardımcının zaten çalışıp çalışmadığına/);
  });

  test('köprü adresi ya da anahtarı yoksa güncelleyicinin dokunmayacağını söyler', async () => {
    writeFileSync(env, 'TMIV2_PORT=4100\n');
    const s = await kos(temel(), ZAMAN);
    assert.equal(s.kod, 0);
    assert.match(s.cikti.join('\n'), /Uyarı: Güncelleyici yardımcıya yine dokunmaz/);
  });
  test('ortada hata olursa alınan yedeği yazar, betik değişmez', async () => {
    const once = okunan(betik);
    // Aynı saniyenin .env yedeği zaten var: betik yedeği alınır, .env yedeği reddedilir.
    writeFileSync(`${env}.yedek-20261119-050000`, 'ORN');
    const s = await kos([...temel(), '--uygula'], ZAMAN);
    assert.equal(s.kod, 1);
    assert.match(s.cikti.join('\n'), /Uygulama yarıda kaldı/);
    assert.match(s.cikti.join('\n'), /Alınan yedek: .*logo-yardimcisi-baslat\.cmd\.yedek-20261119-050000/);
    assert.equal(okunan(betik), once);
  });
  test('göreli betik ya da .env yolu reddedilir', () => {
    const temelGirdi = {
      betik: betikMetni(exe), env: '', kurulum: null, gostergeOku: () => null, dosyaVarMi: () => true, klasorVarMi: () => true,
    };
    const p1 = ayarPlani({ ...temelGirdi, betikYolu: 'ORN\\baslat.cmd', envYolu: env });
    assert.equal(p1.tur, 'red');
    assert.match(p1.tur === 'red' ? p1.ileti : '', /Betik yolu mutlak olmalı/);
    const p2 = ayarPlani({ ...temelGirdi, betikYolu: betik, envYolu: 'ORN.env' });
    assert.match(p2.tur === 'red' ? p2.ileti : '', /\.env yolu mutlak olmalı/);
  });

  test('olmayan kurulum klasörü reddedilir, hiçbir dosya değişmez', async () => {
    const once = okunan(betik);
    const s = await kos([...temel(), '--kurulum', join(kok, 'ORN-yok'), '--uygula'], ZAMAN);
    assert.equal(s.kod, 1);
    assert.match(s.cikti[0] ?? '', /Kurulum klasörü yok/);
    assert.equal(okunan(betik), once);
  });

  test('geri al: yedeklerden biri yoksa hiçbir şey geri konmaz', async () => {
    await kos([...temel(), '--uygula'], ZAMAN);
    const ayarli = { b: okunan(betik), e: okunan(env) };
    rmSync(`${env}.yedek-20261119-050000`);
    const s = await kos(['--geri-al', '--kurulum', kurulum], new Date('2026-11-19T05:03:00Z'));
    assert.equal(s.kod, 1);
    assert.match(s.cikti[0] ?? '', /Yedek yok/);
    assert.deepEqual({ b: okunan(betik), e: okunan(env) }, ayarli);
    assert.equal(existsSync(join(kurulum, DURUM_DOSYASI)), true);
    assert.equal(readdirSync(kurulum).filter((a) => a.includes('.geri-al-oncesi-')).length, 0);
  });
});
