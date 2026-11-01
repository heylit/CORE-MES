import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CALISAN_SURUM_DOSYASI, UYGULAMA_GECMISI_DOSYASI, UYGULAMA_ISTEGI_DOSYASI, UYGULAMA_SONUCU_DOSYASI, UYGULANIYOR_DOSYASI,
} from '../sunucu/moduller/ayarlar/disari.ts';
import {
  Guncelleyici, UYGULAMA_DURUMU_DOSYASI, altSurecOrtami, derlemeOrtami, gecmisSatiri, npmKurulumArgumanlari, yarimKalaniKapat,
  type UygulamaDurumu, paketiUygula, SUNUCU_ARGUMANLARI, pgAraci, type UygulamaAdimlari, geriYuklemeKilidi, kilitHatasiMi, kilitYetersizligi,
} from './guncelleyici.ts';
import { NPM_ONBELLEGI } from './paket.ts';

const ISTEK = { commit: 'a'.repeat(40), isteyenId: 1, istenme: '2026-10-14T08:00:00.000Z' };
const saat = () => new Date('2026-10-14T08:00:00.000Z');

// Her adım çağrılınca adını yazar; bozulacak adım hata verir.
function sahte(bozuk: readonly string[] = []): { adimlar: UygulamaAdimlari; iz: string[] } {
  const iz: string[] = [];
  const adim = (ad: string) => async (): Promise<void> => {
    iz.push(ad);
    if (bozuk.includes(ad)) throw new Error(`${ad} bozuldu\nikinci satır`);
  };
  return {
    iz,
    adimlar: {
      dogrula: async () => { await adim('dogrula')(); return '2026.10.14-1'; },
      hazirla: adim('hazirla'), durdur: adim('durdur'), yedekle: adim('yedekle'), gocle: adim('gocle'),
      yeniyiAc: adim('yeniyiAc'), geriYukle: adim('geriYukle'), eskiyiAc: adim('eskiyiAc'),
    },
  };
}

test('sıra: doğrula, eski çalışırken hazırla, durdur, yedek, göç, yeniyi aç; geri yükleme yok', async () => {
  const { adimlar, iz } = sahte();
  const sonuc = await paketiUygula(ISTEK, adimlar, saat);
  assert.deepEqual(iz, ['dogrula', 'hazirla', 'durdur', 'yedekle', 'gocle', 'yeniyiAc']);
  assert.deepEqual(sonuc, {
    commit: ISTEK.commit, surum: '2026.10.14-1', sonuc: 'kuruldu', adim: null, hata: null,
    baslangic: '2026-10-14T08:00:00.000Z', bitis: '2026-10-14T08:00:00.000Z',
  });
});

test('doğrulama ya da hazırlık bozulursa eski sürüm hiç durmaz; sonuç başarısız', async () => {
  for (const [bozuk, beklenen] of [['dogrula', ['dogrula']], ['hazirla', ['dogrula', 'hazirla']]] as const) {
    const { adimlar, iz } = sahte([bozuk]);
    const sonuc = await paketiUygula(ISTEK, adimlar, saat);
    assert.deepEqual(iz, beklenen, bozuk);
    assert.equal(sonuc.sonuc, 'basarisiz');
    assert.equal(sonuc.adim, bozuk);
    assert.equal(sonuc.hata, `${bozuk} bozuldu`, 'yalnız ilk satır');
  }
});

test('yedek alınamazsa göç koşmaz; veritabanı değişmediği için geri yüklenmez, eski sürüm açılır', async () => {
  const { adimlar, iz } = sahte(['yedekle']);
  const sonuc = await paketiUygula(ISTEK, adimlar, saat);
  assert.deepEqual(iz, ['dogrula', 'hazirla', 'durdur', 'yedekle', 'eskiyiAc']);
  assert.deepEqual([sonuc.sonuc, sonuc.adim], ['basarisiz', 'yedek']);
});

test('göç ya da açılış bozulursa yedek geri yüklenir ve eski sürüm açılır; sonuç geri alındı', async () => {
  for (const [bozuk, adim] of [['gocle', 'goc'], ['yeniyiAc', 'acilis']] as const) {
    const { adimlar, iz } = sahte([bozuk]);
    const sonuc = await paketiUygula(ISTEK, adimlar, saat);
    assert.deepEqual(iz.slice(-2), ['geriYukle', 'eskiyiAc'], bozuk);
    assert.deepEqual([sonuc.sonuc, sonuc.adim, sonuc.hata], ['geri-alindi', adim, `${bozuk} bozuldu`]);
  }
});

test('geri yükleme de bozulursa eski sürüm açılmaz: eski kod yeni şemayla çalışmaz', async () => {
  const { adimlar, iz } = sahte(['gocle', 'geriYukle']);
  const sonuc = await paketiUygula(ISTEK, adimlar, saat);
  assert.equal(iz.includes('eskiyiAc'), false);
  assert.equal(sonuc.sonuc, 'basarisiz');
  assert.match(sonuc.hata ?? '', /gocle bozuldu; yedek geri yüklenemedi, sunucu kapalı bırakıldı: geriYukle bozuldu/);
});

test('alt süreç .env varken güncelleyicinin TMIV2_ değişkenlerini almaz; dosya yoksa alır', () => {
  const ortam = { PATH: '/bin', TMIV2_PG_PASSWORD: 'p', tmiv2_port: '1' };
  assert.deepEqual(altSurecOrtami(ortam, true, { TMIV2_COMMIT: 'c' }), { PATH: '/bin', TMIV2_COMMIT: 'c' });
  assert.deepEqual(altSurecOrtami(ortam, false), ortam);
});

test('sunucu .env\'i ön yükleyiciyle okur ve arayüzü de açar: TMIV2_ değişkenleri silinmiş ortamda HTTPS ve dinleme adresi dosyadan gelir', () => {
  assert.equal(altSurecOrtami({ TMIV2_ONIZLEME_ADRESI: '0.0.0.0', TMIV2_HTTPS_SERTIFIKA: '/s' }, true)['TMIV2_ONIZLEME_ADRESI'], undefined);
  assert.deepEqual(SUNUCU_ARGUMANLARI, ['--import', './araclar/ortam-yukle.ts', 'sunucu/ana.ts', '--arayuz']);
});

test('pg_restore ve psql pg_dump\'ın yanında aranır; yol yoksa PATH\'ten', () => {
  assert.equal(pgAraci('pg_dump', 'psql'), 'psql');
  assert.equal(pgAraci('/usr/lib/postgresql/16/bin/pg_dump', 'pg_restore'), '/usr/lib/postgresql/16/bin/pg_restore');
  assert.equal(pgAraci('C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe', 'psql'), 'C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe');
});

test('alınan istek "uygulanıyor" işaretine taşınır; işaret istek silinmeden yazılır, istek bir kez alınır', async () => {
  const dizin = await mkdtemp(join(tmpdir(), 'tmiv2-guncelleyici-'));
  try {
    const g = new Guncelleyici({ kok: dizin, dizin, anahtar: '', port: 0 }, null);
    assert.equal(await g.istegiAl(), null);
    await writeFile(join(dizin, UYGULAMA_ISTEGI_DOSYASI), JSON.stringify(ISTEK));
    assert.deepEqual(await g.istegiAl(), ISTEK);
    assert.deepEqual(await readdir(dizin), [UYGULANIYOR_DOSYASI]);
    assert.deepEqual(JSON.parse(await readFile(join(dizin, UYGULANIYOR_DOSYASI), 'utf8')), ISTEK);
    assert.equal(await g.istegiAl(), null);
  } finally {
    await rm(dizin, { recursive: true, force: true });
  }
});

test('bağımlılıklar paketteki önbellekten, internete çıkmadan kurulur', () => {
  const klasor = join('surumler', 'abc.yarim');
  const arg = npmKurulumArgumanlari('/npm-cli.js', klasor, () => true);
  assert.deepEqual(arg, ['/npm-cli.js', 'ci', '--offline', '--cache', join(klasor, NPM_ONBELLEGI), '--no-audit', '--no-fund']);
  assert.ok(!arg.includes('--prefer-offline'));
});

test('önbellek taşımayan paket kurulmaz (internetsiz kurulamaz)', () => {
  assert.throws(() => npmKurulumArgumanlari('/npm-cli.js', 'x', () => false), /npm önbelleği yok/);
});

test('derlemeye commit ve yayın adı verilir; bilinmeyen değer geçmez', () => {
  assert.deepEqual(derlemeOrtami({ commit: 'a'.repeat(40), surum: '2026.10.28-3', tarih: null }), {
    TMIV2_COMMIT: 'a'.repeat(40), TMIV2_SURUM: '2026.10.28-3',
  });
  assert.deepEqual(derlemeOrtami({ commit: null, surum: null, tarih: null }), {});
});

test('geçmiş satırı tek satırdır ve önceki sürümü yayın adıyla, yoksa kısa commit\'le yazar', () => {
  const sonuc = {
    commit: 'b'.repeat(40), surum: '2026.10.29-1', sonuc: 'kuruldu' as const, adim: null, hata: null,
    baslangic: '2026-10-29T08:00:00.000Z', bitis: '2026-10-29T08:05:00.000Z',
  };
  const satir = gecmisSatiri(sonuc, { commit: 'a'.repeat(40), surum: '2026.10.28-3', tarih: null });
  assert.equal(satir.endsWith('\n'), true);
  assert.equal(satir.trimEnd().includes('\n'), false);
  assert.deepEqual(JSON.parse(satir), { ...sonuc, onceki: '2026.10.28-3' });
  assert.equal(JSON.parse(gecmisSatiri(sonuc, { commit: 'a'.repeat(40), surum: null, tarih: null })).onceki, 'aaaaaaa');
  assert.equal(JSON.parse(gecmisSatiri(sonuc, { commit: null, surum: null, tarih: null })).onceki, null);
});

test('her adımdan önce adım ve sürüm adı kaydedilir; sürüm adı doğrulamadan sonra paketinkidir', async () => {
  const { adimlar } = sahte(['gocle']);
  const kayit: string[] = [];
  await paketiUygula(ISTEK, adimlar, saat, async (adim, surum) => { kayit.push(`${adim}:${surum}`); });
  assert.deepEqual(kayit, ['dogrula:aaaaaaa', 'hazirla:2026.10.14-1', 'durdur:2026.10.14-1', 'yedek:2026.10.14-1', 'goc:2026.10.14-1']);
});

const ESKI = { klasor: '/kurulum/surumler/eski', surum: { commit: 'e'.repeat(40), surum: '2026.10.13-1', tarih: '2026-10-13T08:00:00.000Z' } };
const durumu = (adim: UygulamaDurumu['adim'], yedek: string | null, elle = false): UygulamaDurumu => ({
  istek: ISTEK, surum: '2026.10.14-1', adim, eski: ESKI, yedek, baslangic: '2026-10-14T08:00:00.000Z', elle,
});

test('yarım kalan uygulama: göçten önce kaldıysa geri yükleme yok, eski sürüm açılır', async () => {
  for (const adim of ['dogrula', 'hazirla', 'durdur', 'yedek'] as const) {
    let yuklenen = 0;
    const s = await yarimKalaniKapat(durumu(adim, '/y/a.dump'), async () => { yuklenen++; }, saat);
    assert.equal(yuklenen, 0, adim);
    assert.equal(s.eskiAcilsin, true, adim);
    assert.equal(s.sonuc.sonuc, 'basarisiz', adim);
    assert.equal(s.sonuc.adim, adim);
    assert.match(s.sonuc.hata ?? '', /veritabanı değişmedi/);
  }
});

test('yarım kalan uygulama: göçte ya da açılışta kaldıysa yedek geri yüklenir; yüklenemezse ya da yedek yoksa sunucu kapalı kalır', async () => {
  for (const adim of ['goc', 'acilis'] as const) {
    const yuklenen: string[] = [];
    const tamam = await yarimKalaniKapat(durumu(adim, '/y/a.dump'), async (y) => { yuklenen.push(y); }, saat);
    assert.deepEqual(yuklenen, ['/y/a.dump']);
    assert.deepEqual([tamam.sonuc.sonuc, tamam.eskiAcilsin], ['geri-alindi', true], adim);
    const bozuk = await yarimKalaniKapat(durumu(adim, '/y/a.dump'), async () => { throw new Error('psql hata verdi'); }, saat);
    assert.deepEqual([bozuk.sonuc.sonuc, bozuk.eskiAcilsin], ['basarisiz', false], adim);
    assert.match(bozuk.sonuc.hata ?? '', /geri yüklenemedi.*psql hata verdi/);
    const yedeksiz = await yarimKalaniKapat(durumu(adim, null), async () => { assert.fail('yedek yokken geri yükleme denenmez'); }, saat);
    assert.deepEqual([yedeksiz.sonuc.sonuc, yedeksiz.eskiAcilsin], ['basarisiz', false], adim);
  }
});

test('açılışta durum dosyası: yoksa çalışan sürüm açılır; göçten önce kalmışsa eski sürüm açılır, sonuç ve geçmiş yazılır', async () => {
  const dizin = await mkdtemp(join(tmpdir(), 'tmiv2-guncelleyici-'));
  try {
    const g = new Guncelleyici({ kok: dizin, dizin, anahtar: '', port: 0 }, null);
    assert.equal((await g.yarimKalaniBitir())?.klasor, dizin);
    await writeFile(join(dizin, CALISAN_SURUM_DOSYASI), JSON.stringify({ commit: ISTEK.commit, surum: '2026.10.14-1', tarih: null }));
    await writeFile(join(dizin, UYGULAMA_DURUMU_DOSYASI), JSON.stringify(durumu('hazirla', null)));
    assert.deepEqual(await g.yarimKalaniBitir(), ESKI);
    assert.equal((await readdir(dizin)).includes(UYGULAMA_DURUMU_DOSYASI), false);
    assert.deepEqual(JSON.parse(await readFile(join(dizin, CALISAN_SURUM_DOSYASI), 'utf8')), ESKI.surum, 'çalışan sürüm eskiye döner');
    assert.equal(JSON.parse(await readFile(join(dizin, UYGULAMA_SONUCU_DOSYASI), 'utf8')).sonuc, 'basarisiz');
    const gecmis = (await readFile(join(dizin, UYGULAMA_GECMISI_DOSYASI), 'utf8')).trim().split('\n');
    assert.equal(gecmis.length, 1);
    assert.equal(JSON.parse(gecmis[0] ?? '').onceki, '2026.10.13-1');
  } finally {
    await rm(dizin, { recursive: true, force: true });
  }
});

test('açılışta durum dosyası: geri yüklenemeyen, elle bekleyen ya da okunamayan durumda sunucu açılmaz', async () => {
  const dizin = await mkdtemp(join(tmpdir(), 'tmiv2-guncelleyici-'));
  const hata = console.error;
  console.error = () => {};
  try {
    const g = new Guncelleyici({ kok: dizin, dizin, anahtar: '', port: 0 }, null);
    await writeFile(join(dizin, UYGULAMA_DURUMU_DOSYASI), JSON.stringify(durumu('goc', null)));
    assert.equal(await g.yarimKalaniBitir(), null);
    assert.equal(JSON.parse(await readFile(join(dizin, UYGULAMA_DURUMU_DOSYASI), 'utf8')).elle, true, 'sonraki açılış da durur');
    assert.equal(await g.yarimKalaniBitir(), null);
    assert.equal((await readFile(join(dizin, UYGULAMA_GECMISI_DOSYASI), 'utf8')).trim().split('\n').length, 1, 'elle bekleyen ikinci kez yazılmaz');
    await writeFile(join(dizin, UYGULAMA_DURUMU_DOSYASI), '{bozuk');
    assert.equal(await g.yarimKalaniBitir(), null);
  } finally {
    console.error = hata;
    await rm(dizin, { recursive: true, force: true });
  }
});

test('geri yükleme kilit ihtiyacı ölçülen 499 göçlü şemanın üstünde tahmin edilir; şemadan ya da dökümden büyüğü alınır', () => {
  // Ölçüm: 1783 pg_class satırı, 4529 döküm girdisi, tek transaction'da 19891 kilit (PostgreSQL 16).
  assert.ok(geriYuklemeKilidi(1783, 0) >= 19891);
  assert.ok(geriYuklemeKilidi(0, 4529) >= 19891);
  assert.equal(geriYuklemeKilidi(10, 1000), 5000);
  assert.equal(geriYuklemeKilidi(0, 0), 0);
});

test('kilit tablosu yetmezse veritabanına dokunmadan ayar önerilir; yetiyorsa engel yok', () => {
  const varsayilan = { maxLocks: 64, baglanti: 100, hazirlanan: 0, kullanilan: 6 };
  const ileti = kilitYetersizligi(22645, varsayilan) ?? '';
  assert.match(ileti, /tahmini 22645 kilit gerekli, boş 6394/);
  assert.match(ileti, /max_locks_per_transaction = 512 /);
  assert.match(ileti, /Veritabanına dokunulmadı/);
  assert.equal(kilitYetersizligi(22645, { ...varsayilan, maxLocks: 256 }), null);
  assert.equal(kilitYetersizligi(6394, varsayilan), null, 'sınırda yeter');
  assert.notEqual(kilitYetersizligi(6395, varsayilan), null);
  // Öneri payla ve kullanılan kilitle birlikte sığmalı; hazırlanmış transaction yuvaları da sayılır.
  assert.match(kilitYetersizligi(1000, { maxLocks: 1, baglanti: 5, hazirlanan: 5, kullanilan: 0 }) ?? '', /= 128 /);
  assert.match(kilitYetersizligi(100000, { maxLocks: 64, baglanti: 100, hazirlanan: 0, kullanilan: 0 }) ?? '', /= 2048 /);
});

test('psql kilit tablosu hatası tanınır; başka hata tanınmaz', () => {
  assert.equal(kilitHatasiMi('psql y.sql hata verdi (çıkış 3): HINT:  You might need to increase max_locks_per_transaction.'), true);
  assert.equal(kilitHatasiMi('psql: ERROR:  out of shared memory'), true);
  assert.equal(kilitHatasiMi('psql y.sql hata verdi (çıkış 3): ERROR:  relation "x" already exists'), false);
});
