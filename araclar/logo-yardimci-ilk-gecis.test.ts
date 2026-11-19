import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { betikSec, gorevKlasorleri, ilkGecis, kapiSahibi, kokSec, type IlkGecisDisi } from './logo-yardimci-ilk-gecis.ts';
import { ILK_GECIS_ISARETI, ilkGecisKlasoru, isaretAl } from './logo-yardimci-ilk-gecis-tetik.ts';
import { GOSTERGE_DOSYASI, type YardimciGuncellemeAdimlari, type YardimciSurumOkumasi } from './logo-yardimcisi-guncelle.ts';

const P = 'a'.repeat(64);

describe('ilk geçiş tetiği (3432-2)', () => {
  const env = { TMIV2_ORTAM: 'canli', TMIV2_GUNCELLEME_DIZINI: '/ORN/guncelleme' };
  const temel = { platform: 'win32', env, kok: '/ORN/guncelleme/surumler/abc1234', betik: '/ORN/guncelleme/surumler/abc1234/sunucu/ana.ts' };
  test('canlıda, Windows\'ta, sürüm klasöründen açılan sunucuda güncelleme klasörünü verir', () => {
    assert.equal(ilkGecisKlasoru(temel), '/ORN/guncelleme');
  });
  test('işaret bir kez alınır: ikinci açılış geçiş başlatmaz', () => {
    const d = mkdtempSync(join(tmpdir(), 'tmiv2-isaret-'));
    try {
      assert.equal(isaretAl(d), true);
      assert.equal(isaretAl(d), false);
      assert.match(readFileSync(join(d, ILK_GECIS_ISARETI), 'utf8'), /"basladi"/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
  test('öteki her durumda başlamaz', () => {
    assert.equal(ilkGecisKlasoru({ ...temel, platform: 'linux' }), null);
    assert.equal(ilkGecisKlasoru({ ...temel, env: { ...env, TMIV2_ORTAM: 'test' } }), null);
    assert.equal(ilkGecisKlasoru({ ...temel, env: { ...env, TMIV2_LOGO_YARDIMCI_KURULUM: '/ORN/k' } }), null);
    assert.equal(ilkGecisKlasoru({ ...temel, env: { TMIV2_ORTAM: 'canli' } }), null);
    assert.equal(ilkGecisKlasoru({ ...temel, kok: '/ORN/ilk-kurulum' }), null);
    assert.equal(ilkGecisKlasoru({ ...temel, betik: '/ORN/guncelleme/surumler/abc1234/araclar/yonetici.ts' }), null);
    assert.equal(ilkGecisKlasoru({ ...temel, betik: undefined }), null);
  });
});

describe('ilk geçiş saf parçaları', () => {
  test('kapıyı dinleyen süreç yalnız 127.0.0.1:<port> LISTENING satırından', () => {
    const n = [
      '  TCP    0.0.0.0:4100           0.0.0.0:0              LISTENING       900',
      '  TCP    127.0.0.1:41950        0.0.0.0:0              LISTENING       901',
      '  TCP    127.0.0.1:4195         127.0.0.1:50000        ESTABLISHED     902',
      '  TCP    127.0.0.1:4195         0.0.0.0:0              LISTENING       4321',
    ].join('\r\n');
    assert.equal(kapiSahibi(n, 4195), 4321);
    assert.equal(kapiSahibi(n, 4196), null);
  });
  test('görev XML\'inden klasörler', () => {
    const xml = '<Exec><Command>C:\\ORN\\tmi\\canli-baslat.cmd</Command><Arguments>/c &quot;C:\\ORN\\diger\\a.cmd&quot;</Arguments>'
      + '<WorkingDirectory>C:\\ORN\\tmi</WorkingDirectory></Exec>';
    assert.deepEqual(gorevKlasorleri(xml), ['C:\\ORN\\tmi', 'C:\\ORN\\diger']);
  });
  test('betik: exe yolunu içeren tek dosya', () => {
    const exe = 'C:\\ORN\\k\\logo-yardimcisi-1\\cikti\\logo-yardimcisi.exe';
    assert.equal(betikSec([{ yol: 'a.cmd', metin: 'rem yok' }, { yol: 'b.cmd', metin: `start "" "${exe.toUpperCase()}"` }], exe), 'b.cmd');
    assert.ok(typeof betikSec([{ yol: 'a.cmd', metin: exe }, { yol: 'b.cmd', metin: exe }], exe) !== 'string');
    assert.ok(typeof betikSec([{ yol: 'a.cmd', metin: 'yok' }], exe) !== 'string');
    assert.equal(betikSec([{ yol: 'A.cmd', metin: exe }, { yol: 'a.cmd', metin: exe }], exe), 'a.cmd');
  });
  test('ilk kurulum: içeriği sürüm .env\'iyle aynı, baslat.ts taşıyan, sürüm klasörü olmayan aday', () => {
    const dosyalar: Record<string, string> = {
      [join('/ORN/eski', '.env')]: 'A=1', [join('/ORN/eski', 'araclar', 'baslat.ts')]: '',
      [join('/ORN/kok', '.env')]: 'A=2', [join('/ORN/kok', 'araclar', 'baslat.ts')]: '',
      [join('/ORN/g/surumler/x', '.env')]: 'A=2', [join('/ORN/g/surumler/x', 'araclar', 'baslat.ts')]: '',
    };
    const oku = (y: string): string | null => dosyalar[y] ?? null;
    const varMi = (y: string): boolean => y in dosyalar;
    assert.equal(kokSec(['/ORN/g/surumler/x', '/ORN/eski', '/ORN/kok'], 'A=2', oku, varMi), '/ORN/kok');
    assert.equal(kokSec(['/ORN/eski', ''], 'A=2', oku, varMi), null);
  });
});

// Sahte canlı: dosyalar geçici klasörde gerçek, yardımcı süreci bellekte. Eski yardımcı /api/kapat bilmez; yalnız durdurulunca kapanır.
let kok = '';
let dizin = '';
let surumKlasoru = '';
let ilkKurulum = '';
let kurulum = '';
let eskiExe = '';
let yeniExe = '';
let betik = '';
const SURUM_ENV = 'TMIV2_ORTAM=canli\r\nTMIV2_LOGO_KOPRU_ADRESI=http://127.0.0.1:4195\r\nTMIV2_LOGO_KOPRU_ANAHTARI=ORN-anahtar\r\n';

beforeEach(() => {
  kok = mkdtempSync(join(tmpdir(), 'tmiv2-ilkgecis-'));
  dizin = join(kok, 'ORN-guncelleme');
  surumKlasoru = join(dizin, 'surumler', 'abc1234');
  mkdirSync(join(surumKlasoru, 'araclar', 'logo-yardimcisi'), { recursive: true });
  writeFileSync(join(surumKlasoru, '.env'), SURUM_ENV);
  ilkKurulum = join(kok, 'ORN-ilk');
  mkdirSync(join(ilkKurulum, 'araclar'), { recursive: true });
  writeFileSync(join(ilkKurulum, 'araclar', 'baslat.ts'), '');
  writeFileSync(join(ilkKurulum, '.env'), SURUM_ENV);
  kurulum = join(kok, 'ORN-kurulum');
  mkdirSync(join(kurulum, 'logo-yardimcisi-1.0', 'cikti'), { recursive: true });
  eskiExe = join(kurulum, 'logo-yardimcisi-1.0', 'cikti', 'logo-yardimcisi.exe');
  writeFileSync(eskiExe, 'ORN');
  yeniExe = join(kurulum, 'logo-yardimcisi-abc1234-aaaaaaaa', 'cikti', 'logo-yardimcisi.exe');
  betik = join(kurulum, 'logo-yardimcisi-baslat.cmd');
  writeFileSync(betik, ['@echo off', 'netstat -ano | findstr /r /c:"127.0.0.1:4195 .*LISTENING" >nul && exit /b 0',
    `start "" /b "${eskiExe}" --ayar "${kurulum}\\gizli\\logo-yardimcisi.ayar"`, ''].join('\r\n'));
  writeFileSync(join(kurulum, 'baska.cmd'), 'rem ORN baska betik\r\n');
});
afterEach(() => { rmSync(kok, { recursive: true, force: true }); });

type Calisan = 'eski' | 'yeni' | 'yanlis' | null;
function sahte(o: {
  durdurulamaz?: boolean; yeniYanlis?: boolean; env?: Record<string, string>; adaylar?: string[]; kendiKapanir?: boolean;
  kapidaBaskasi?: boolean; eskiAcilmaz?: boolean;
} = {}) {
  const olaylar: string[] = [];
  let calisan: Calisan = 'eski';
  let sorgu = 0;
  const oku = (y: string): string | null => { try { return readFileSync(y, 'utf8'); } catch { return null; } };
  const gosterge = join(kurulum, GOSTERGE_DOSYASI);
  const d: IlkGecisDisi = {
    env: o.env ?? { ...Object.fromEntries(SURUM_ENV.trim().split('\r\n').map((s) => s.split('='))), npm_package_json: join(ilkKurulum, 'package.json') },
    surumKlasoru,
    calisanYardimci: async () => {
      sorgu += 1;
      if (o.kapidaBaskasi === true && sorgu > 1 && calisan !== null) return { pid: 333, exe: join(kurulum, 'baska.exe') };
      return calisan === null ? null : { pid: calisan === 'eski' ? 111 : 222, exe: calisan === 'eski' ? eskiExe : yeniExe };
    },
    gorevXml: async () => null,
    betikler: (k) => (o.adaylar ?? readdirSync(k).filter((a) => a.endsWith('.cmd'))).map((a) => join(k, a)),
    oku,
    varMi: (y) => existsSync(y) && statSync(y).isFile(),
    klasorMu: (y) => existsSync(y) && statSync(y).isDirectory(),
    ozet: async () => P,
    adimlar: (ayar) => {
      assert.equal(ayar.kurulum, kurulum);
      assert.equal(ayar.baslat, betik);
      const a: YardimciGuncellemeAdimlari = {
        surumOku: async (): Promise<YardimciSurumOkumasi> => (calisan === null ? { tur: 'ulasilamadi' }
          : { tur: 'ozet', ozet: calisan === 'eski' ? null : calisan === 'yeni' ? P : 'b'.repeat(64) }),
        hazirla: async () => { olaylar.push('hazirla'); return yeniExe; },
        gostergeOku: async () => oku(gosterge)?.trim() ?? null,
        gostergeYaz: async (exe) => { olaylar.push(`gosterge ${exe === yeniExe ? 'yeni' : 'eski'}`); writeFileSync(gosterge, `${exe}\r\n`); },
        kapat: async () => { olaylar.push('kapat'); if (calisan === 'yeni' || calisan === 'yanlis' || (calisan === 'eski' && o.kendiKapanir === true)) calisan = null; },
        kapiBosMu: async () => calisan === null,
        baslat: () => {
          olaylar.push('baslat');
          if (calisan !== null) olaylar.push('IKI-YARDIMCI');
          const g = oku(gosterge)?.trim();
          const metin = oku(betik) ?? '';
          const exe = metin.includes(GOSTERGE_DOSYASI) && g !== undefined ? g : eskiExe;
          calisan = exe === yeniExe ? (o.yeniYanlis ? 'yanlis' : 'yeni') : (o.eskiAcilmaz === true ? null : 'eski');
        },
        bekle: async () => undefined,
      };
      return a;
    },
    durdur: async (pid) => {
      olaylar.push(`durdur ${String(pid)}`);
      if (o.durdurulamaz) return false;
      calisan = null;
      return true;
    },
    bekle: async () => { olaylar.push('bekle'); },
    simdi: () => new Date('2026-11-19T06:00:00Z'),
  };
  return { d, olaylar, calisan: () => calisan };
}

const okunan = (y: string): string => readFileSync(y, 'utf8');

describe('ilk geçiş akışı (3432-2)', () => {
  test('eski yardımcı kendi kapanmaz: ayar yapılır, yalnız onun süreci durdurulur, yenisi açılır ve doğrulanır', async () => {
    const s = sahte();
    const r = await ilkGecis(s.d, 'abc1234');
    assert.equal(r.sonuc, 'guncellendi', r.satirlar.join('\n'));
    assert.equal(s.calisan(), 'yeni');
    assert.deepEqual(s.olaylar.filter((x) => x !== 'bekle'), ['hazirla', 'gosterge yeni', 'kapat', 'durdur 111', 'baslat']);
    assert.match(okunan(betik), /%LOGO_YARDIMCI_EXE%/);
    assert.match(okunan(join(ilkKurulum, '.env')), /TMIV2_LOGO_YARDIMCI_BASLAT=.*logo-yardimcisi-baslat\.cmd/);
    assert.equal(okunan(join(kurulum, GOSTERGE_DOSYASI)).trim(), yeniExe);
    assert.equal(okunan(join(surumKlasoru, '.env')), SURUM_ENV, 'sürüm klasöründeki kopya değişmez');
  });

  test('yenisi doğrulanmazsa eskisine döner; betik ve .env yedekten geri konur', async () => {
    const once = { b: okunan(betik), e: okunan(join(ilkKurulum, '.env')) };
    const s = sahte({ yeniYanlis: true });
    const r = await ilkGecis(s.d, 'abc1234');
    assert.equal(r.sonuc, 'geri-alindi', r.satirlar.join('\n'));
    assert.equal(s.calisan(), 'eski');
    assert.ok(!s.olaylar.includes('IKI-YARDIMCI'));
    assert.equal(okunan(betik), once.b);
    assert.equal(okunan(join(ilkKurulum, '.env')), once.e);
  });

  test('eski yardımcı durdurulamazsa yenisi açılmaz (iki yardımcı olmaz), ayar geri alınır', async () => {
    const once = okunan(betik);
    const s = sahte({ durdurulamaz: true });
    const r = await ilkGecis(s.d, 'abc1234');
    assert.equal(r.sonuc, 'geri-alindi', r.satirlar.join('\n'));
    assert.equal(s.calisan(), 'eski');
    assert.ok(!s.olaylar.includes('baslat'));
    assert.match(r.satirlar.join('\n'), /durdurulamadı \(yetki\)/);
    assert.equal(okunan(betik), once);
  });

  test('betik birden çoksa hiçbir şeye dokunmadan atlar', async () => {
    writeFileSync(join(kurulum, 'kopya.cmd'), okunan(betik));
    const once = okunan(betik);
    const s = sahte();
    const r = await ilkGecis(s.d, 'abc1234');
    assert.equal(r.sonuc, 'atlandi');
    assert.match(r.satirlar.at(-1) ?? '', /2 betik var/);
    assert.deepEqual(s.olaylar, []);
    assert.equal(okunan(betik), once);
    assert.equal(existsSync(join(kurulum, GOSTERGE_DOSYASI)), false);
  });

  test('köprü adresi yoksa ya da 3314 ayarı zaten varsa atlar', async () => {
    assert.equal((await ilkGecis(sahte({ env: { TMIV2_ORTAM: 'canli' } }).d, 'abc1234')).sonuc, 'atlandi');
    const env = { TMIV2_LOGO_KOPRU_ADRESI: 'http://127.0.0.1:4195', TMIV2_LOGO_KOPRU_ANAHTARI: 'ORN', TMIV2_LOGO_YARDIMCI_KURULUM: kurulum };
    const r = await ilkGecis(sahte({ env }).d, 'abc1234');
    assert.equal(r.sonuc, 'atlandi');
    assert.match(r.satirlar.at(-1) ?? '', /3314 ayarı zaten var/);
  });

  test('ilk kurulum bulunamazsa .env\'e dokunmaz, uyarır, yardımcıyı yine yeniler', async () => {
    writeFileSync(join(ilkKurulum, '.env'), 'ORN farkli\n');
    const s = sahte();
    const r = await ilkGecis(s.d, 'abc1234');
    assert.equal(r.sonuc, 'guncellendi', r.satirlar.join('\n'));
    assert.equal(okunan(join(ilkKurulum, '.env')), 'ORN farkli\n');
    assert.match(r.satirlar.join('\n'), /Uyarı: İlk kurulumun \.env dosyası bulunamadı/);
  });
  test('eski yardımcı bekleme içinde kendi kapanırsa hiçbir süreç durdurulmaz', async () => {
    const s = sahte({ kendiKapanir: true });
    const r = await ilkGecis(s.d, 'abc1234');
    assert.equal(r.sonuc, 'guncellendi', r.satirlar.join('\n'));
    assert.ok(!s.olaylar.some((x) => x.startsWith('durdur')));
    assert.ok(!s.olaylar.includes('bekle'), 'kapı boşalınca beklemeden sürer');
  });

  test('kapıyı dinleyen süreç logo-yardimcisi.exe değilse durdurulmaz, yenisi açılmaz', async () => {
    const s = sahte({ kapidaBaskasi: true });
    const r = await ilkGecis(s.d, 'abc1234');
    assert.equal(r.sonuc, 'geri-alindi', r.satirlar.join('\n'));
    assert.ok(!s.olaylar.some((x) => x.startsWith('durdur')));
    assert.ok(!s.olaylar.includes('baslat'));
  });

  test('geri almadan sonra kapı boşsa eski betik bir kez çalışır', async () => {
    const s = sahte({ yeniYanlis: true, eskiAcilmaz: true });
    const r = await ilkGecis(s.d, 'abc1234');
    assert.equal(r.sonuc, 'geri-alindi', r.satirlar.join('\n'));
    assert.match(r.satirlar.join('\n'), /Kapı boştu; eski betik bir kez çalıştırıldı/);
    assert.equal(s.olaylar.filter((x) => x === 'baslat').length, 3);
  });

  test('geri almadan sonra kapı doluysa (eskisi açıldı) eski betik ayrıca çalışmaz', async () => {
    const s = sahte({ yeniYanlis: true });
    const r = await ilkGecis(s.d, 'abc1234');
    assert.doesNotMatch(r.satirlar.join('\n'), /Kapı boştu/);
    assert.equal(s.olaylar.filter((x) => x === 'baslat').length, 2);
  });

  test('ayar önceden yapılmış ve yenileme olmazsa geri alma çağrılmaz, sonuç hata', async () => {
    const s0 = sahte();
    await ilkGecis(s0.d, 'abc1234');
    const ayarli = okunan(betik);
    rmSync(join(kurulum, 'logo-yardimci-ayar.json'));
    writeFileSync(join(ilkKurulum, '.env'), 'ORN farkli\n');
    writeFileSync(join(kurulum, GOSTERGE_DOSYASI), `${eskiExe}\r\n`);
    const s = sahte({ yeniYanlis: true });
    const r = await ilkGecis(s.d, 'abc1234');
    assert.equal(r.sonuc, 'hata', r.satirlar.join('\n'));
    assert.doesNotMatch(r.satirlar.join('\n'), /geri kondu/);
    assert.equal(okunan(betik), ayarli);
  });

  test('köprü adresi 127.0.0.1 değilse atlar', async () => {
    const env = { TMIV2_LOGO_KOPRU_ADRESI: 'http://10.0.0.5:4195', TMIV2_LOGO_KOPRU_ANAHTARI: 'ORN' };
    const s = sahte({ env });
    const r = await ilkGecis(s.d, 'abc1234');
    assert.equal(r.sonuc, 'atlandi');
    assert.deepEqual(s.olaylar, []);
  });
});
