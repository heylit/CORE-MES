import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { UYGULAMA_ISTEGI_DOSYASI, UYGULANIYOR_DOSYASI } from '../sunucu/moduller/ayarlar/disari.ts';
import {
  Guncelleyici, altSurecOrtami, derlemeOrtami, gecmisSatiri, npmKurulumArgumanlari, paketiUygula, SUNUCU_ARGUMANLARI, pgAraci, type UygulamaAdimlari,
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
