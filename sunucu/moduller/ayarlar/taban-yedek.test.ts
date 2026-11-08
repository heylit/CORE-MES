import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, test } from 'node:test';
import {
  arsivDiskiUyarisi, budamaPlani, silinecekWallar, tabanAdi, tabanBaslangicDosyasi, tabanGerekliMi, tabanKopyalanabilirMi, tabanUyarisi, tabanZamani, type TabanKaydi,
} from './kurallar.ts';
import type { PgSurumu } from '#paylasilan/sozlesme/ayarlar.ts';
import { tabanOrtamiOku, tabanTuru, type AltSurec, type TabanOrtami } from './taban-yedek.ts';

// Sürüm denetimi ayrı sınanır (yedek.test.ts); burada araç ve sunucu aynı sürümdür.
const uyumlu = async (): Promise<PgSurumu> => ({ sunucu: 18, sunucuMetni: 'PostgreSQL 18.1', pgDump: 18, pgDumpYolu: 'pg_basebackup', uyumlu: true, ileti: null });
const W = (n: number): string => `00000001000000000000${n.toString(16).toUpperCase().padStart(4, '0')}`;
const GUN = 24 * 60 * 60 * 1000;
const t0 = new Date('2026-11-08T03:00:00Z');
const kayit = (gunOnce: number, dogrulandi = true, baslangic: string | null = W(10 - gunOnce)): TabanKaydi => {
  const zaman = new Date(t0.getTime() - gunOnce * GUN);
  return { ad: tabanAdi(zaman), zaman, dogrulandi, baslangic };
};

describe('taban yedek kuralları (2284-1 c)', () => {
  test('ad zamandan üretilir ve geri okunur; başka adlı (elle alınmış) klasör tanınmaz', () => {
    assert.equal(tabanAdi(t0), 'taban-20261108T030000Z');
    assert.equal(tabanZamani('taban-20261108T030000Z')?.toISOString(), t0.toISOString());
    assert.equal(tabanZamani('20261108'), null);
    assert.equal(tabanZamani('taban-20261108T030000Z.yarim'), null);
  });

  test('dış kopya yarım ve doğrulanmamış iş tabanını almaz; elle alınmış başka adlı taban alınır', () => {
    assert.equal(tabanKopyalanabilirMi('taban-20261108T030000Z', true), true);
    assert.equal(tabanKopyalanabilirMi('taban-20261108T030000Z', false), false);
    assert.equal(tabanKopyalanabilirMi('taban-20261108T030000Z.yarim', true), false);
    assert.equal(tabanKopyalanabilirMi('20261101', false), true);
  });

  test('backup_label başlangıç dosyasını verir', () => {
    assert.equal(tabanBaslangicDosyasi(`START WAL LOCATION: 0/2000028 (file ${W(2)})\nCHECKPOINT LOCATION: 0/2000060\n`), W(2));
    assert.equal(tabanBaslangicDosyasi('bozuk'), null);
  });

  test('taban yoksa ya da doğrulanmış son taban 7 günlükse yenisi alınır; doğrulanmamış sayılmaz', () => {
    assert.equal(tabanGerekliMi([], t0), true);
    assert.equal(tabanGerekliMi([kayit(6)], t0), false);
    assert.equal(tabanGerekliMi([kayit(7)], t0), true);
    assert.equal(tabanGerekliMi([kayit(1, false), kayit(8)], t0), true);
  });

  test('budama: doğrulanmış son iki kalır, WAL sınırı eskisinin başlangıcıdır; doğrulanmamış hemen silinir', () => {
    const plan = budamaPlani([kayit(0), kayit(7), kayit(14), kayit(3, false)]);
    assert.deepEqual(plan.silinecekTabanlar, [kayit(14).ad, kayit(3, false).ad].sort());
    assert.equal(plan.walSiniri, W(3));
  });

  test('budama: ikiden az doğrulanmış taban varken WAL budanmaz, doğrulanmış taban silinmez', () => {
    const plan = budamaPlani([kayit(0), kayit(2, false)]);
    assert.deepEqual(plan.silinecekTabanlar, [kayit(2, false).ad]);
    assert.equal(plan.walSiniri, null);
    assert.deepEqual(budamaPlani([]), { silinecekTabanlar: [], walSiniri: null });
  });

  test('silinecek WAL sınırdan öncekilerdir; .history ve tanınmayan dosya kalır', () => {
    const adlar = [W(1), `${W(1)}.00000028.backup`, W(3), W(4), '00000002.history', 'notlar.txt', `${W(1)}.partial`];
    assert.deepEqual(silinecekWallar(adlar, W(3)), [W(1), `${W(1)}.00000028.backup`]);
  });

  test('uyarılar: doğrulanmış taban yok ya da 8 günden eski; arşiv diski yüzde 80 ve üstü', () => {
    assert.match(tabanUyarisi([], t0) ?? '', /Doğrulanmış taban yedek yok/);
    assert.equal(tabanUyarisi([kayit(8)], t0), null);
    assert.match(tabanUyarisi([kayit(9)], t0) ?? '', /9 gün önce/);
    assert.equal(arsivDiskiUyarisi(21, 100), null);
    assert.match(arsivDiskiUyarisi(20, 100) ?? '', /yüzde 80 dolu/);
    assert.equal(arsivDiskiUyarisi(0, 0), null);
  });
});

describe('taban yedek işi (sahte pg_basebackup, PostgreSQL gerekmez)', () => {
  let kok = '';
  let ortam: TabanOrtami;
  const cagrilar: Array<{ dosya: string; argumanlar: string[]; parola: string | null }> = [];
  const disk = async (): Promise<{ bos: number; toplam: number }> => ({ bos: 50, toplam: 100 });

  // pg_basebackup gibi hedef klasörü ve backup_label'ı yazar; verifybackup hiçbir şey yazmaz.
  const sahte = (baslangic: string, dogrulamaDussun = false): AltSurec => async (dosya, argumanlar, parola) => {
    cagrilar.push({ dosya, argumanlar, parola });
    if (dosya.endsWith('pg_basebackup')) {
      const hedef = argumanlar[argumanlar.indexOf('-D') + 1] ?? '';
      await mkdir(hedef, { recursive: true });
      await writeFile(path.join(hedef, 'backup_label'), `START WAL LOCATION: 0/1 (file ${baslangic})\n`);
      return;
    }
    if (dogrulamaDussun) throw new Error('pg_verifybackup hata verdi (çıkış 1): checksum mismatch');
  };

  beforeEach(async () => {
    if (kok !== '') await rm(kok, { recursive: true, force: true });
    kok = await mkdtemp(path.join(tmpdir(), 'tmiv2-taban-'));
    await mkdir(path.join(kok, 'taban'));
    await mkdir(path.join(kok, 'wal'));
    ortam = {
      dizin: path.join(kok, 'taban'), wal: path.join(kok, 'wal'), pg: { host: '127.0.0.1', port: 5432, kullanici: 'tmiv2_yedek', parola: 'gizli' },
      basebackup: 'pg_basebackup', verifybackup: 'pg_verifybackup',
    };
    cagrilar.length = 0;
  });
  after(async () => { if (kok !== '') await rm(kok, { recursive: true, force: true }); });

  const elleTaban = async (zaman: Date, baslangic: string): Promise<string> => {
    const ad = tabanAdi(zaman);
    await mkdir(path.join(ortam.dizin, ad));
    await writeFile(path.join(ortam.dizin, ad, 'backup_label'), `START WAL LOCATION: 0/1 (file ${baslangic})\n`);
    await writeFile(path.join(ortam.dizin, ad, '.dogrulandi'), '');
    return ad;
  };

  test('ayar boşsa iş bekler, canlıda hata verir; hiçbir şey çalıştırmaz', async () => {
    const sonuc = await tabanTuru(null, t0, { surumDenetle: uyumlu, calistir: sahte(W(1)), bosYer: disk });
    assert.equal((sonuc as { durum: string }).durum, 'bekliyor');
    assert.equal(cagrilar.length, 0);
    await assert.rejects(tabanTuru(null, t0, { canli: true, calistir: sahte(W(1)), bosYer: disk }), /Canlı ortamda taban yedek kurulmamış/);
    assert.equal(cagrilar.length, 0);
    assert.equal(tabanOrtamiOku({ TMIV2_TABAN_DIZINI: 'E:\\T', TMIV2_WAL_ARSIV_DIZINI: 'E:\\W', TMIV2_PG_YEDEK_USER: 'tmiv2_yedek' }), null);
  });

  test('taban yedek rolüyle alınır, doğrulanır, adına taşınır; parola yalnız pg_basebackup alt sürecine gider', async () => {
    await tabanTuru(ortam, t0, { surumDenetle: uyumlu, calistir: sahte(W(5)), bosYer: disk });
    const adlar = await readdir(ortam.dizin);
    assert.deepEqual(adlar, [tabanAdi(t0)]);
    assert.ok(existsSync(path.join(ortam.dizin, tabanAdi(t0), '.dogrulandi')));
    assert.equal(cagrilar[0]?.dosya, 'pg_basebackup');
    assert.deepEqual(cagrilar[0]?.argumanlar.slice(-2), ['-U', 'tmiv2_yedek']);
    assert.equal(cagrilar[0]?.parola, 'gizli');
    assert.equal(cagrilar[1]?.dosya, 'pg_verifybackup');
    assert.equal(cagrilar[1]?.parola, null);
  });

  test('yeni taban gerekmiyorsa alınmaz; üçüncü doğrulanmış tabandan sonra en eski ve onun WAL\'ı budanır, elle alınan klasöre dokunulmaz', async () => {
    await elleTaban(new Date(t0.getTime() - 14 * GUN), W(1));
    const orta = await elleTaban(new Date(t0.getTime() - 7 * GUN), W(3));
    await mkdir(path.join(ortam.dizin, '20261101'));
    for (const n of [1, 2, 3, 4, 5, 6]) await writeFile(path.join(ortam.wal, W(n)), '');
    await writeFile(path.join(ortam.wal, '00000002.history'), '');
    await tabanTuru(ortam, t0, { surumDenetle: uyumlu, calistir: sahte(W(5)), bosYer: disk });
    assert.deepEqual((await readdir(ortam.dizin)).sort(), ['20261101', orta, tabanAdi(t0)].sort());
    assert.deepEqual((await readdir(ortam.wal)).sort(), ['00000002.history', W(3), W(4), W(5), W(6)].sort());
    cagrilar.length = 0;
    await tabanTuru(ortam, new Date(t0.getTime() + GUN), { surumDenetle: uyumlu, calistir: sahte(W(6)), bosYer: disk });
    assert.equal(cagrilar.length, 0);
  });

  test('reddedilen: doğrulama düşerse taban silinir, WAL budanmaz, iş nedeniyle hata verir', async () => {
    await elleTaban(new Date(t0.getTime() - 16 * GUN), W(1));
    await elleTaban(new Date(t0.getTime() - 9 * GUN), W(3));
    for (const n of [1, 2, 3, 4]) await writeFile(path.join(ortam.wal, W(n)), '');
    await assert.rejects(tabanTuru(ortam, t0, { surumDenetle: uyumlu, calistir: sahte(W(4), true), bosYer: disk }), /Taban yedek alınamadı: .*checksum mismatch.*9 gün önce/);
    assert.equal((await readdir(ortam.dizin)).length, 2);
    assert.ok(!(await readdir(ortam.dizin)).some((a) => a.endsWith('.yarim')));
    assert.deepEqual((await readdir(ortam.wal)).sort(), [W(1), W(2), W(3), W(4)].sort());
  });

  test('reddedilen: arşiv diski yüzde 80 doluysa ve klasör yoksa iş hata verir; yarım taban sonraki turda silinir', async () => {
    await mkdir(path.join(ortam.dizin, `${tabanAdi(new Date(t0.getTime() - GUN))}.yarim`));
    await assert.rejects(tabanTuru(ortam, t0, { surumDenetle: uyumlu, calistir: sahte(W(2)), bosYer: async () => ({ bos: 10, toplam: 100 }) }), /yüzde 90 dolu/);
    assert.deepEqual(await readdir(ortam.dizin), [tabanAdi(t0)]);
    await assert.rejects(tabanTuru({ ...ortam, wal: path.join(kok, 'yok') }, t0, { surumDenetle: uyumlu, calistir: sahte(W(2)), bosYer: disk }), /WAL arşivi klasörü yok/);
  });

  test('reddedilen: pg_basebackup sunucuyla aynı ana sürümden değilse taban alınmaz, iş nedeniyle hata verir', async () => {
    const uyusmaz = async (): Promise<PgSurumu> => ({
      sunucu: 18, sunucuMetni: 'PostgreSQL 18.1', pgDump: 16, pgDumpYolu: 'pg_basebackup', uyumlu: false,
      ileti: 'pg_basebackup ana sürümü 16, veritabanı sunucusu 18: uyuşmuyor, yedek alınmadı.',
    });
    await assert.rejects(tabanTuru(ortam, t0, { surumDenetle: uyusmaz, calistir: sahte(W(2)), bosYer: disk }),
      /Taban yedek alınamadı: pg_basebackup ana sürümü 16, veritabanı sunucusu 18: uyuşmuyor/);
    assert.equal(cagrilar.length, 0, 'pg_basebackup çalıştırılmadı');
    assert.deepEqual(await readdir(ortam.dizin), []);
  });
});
