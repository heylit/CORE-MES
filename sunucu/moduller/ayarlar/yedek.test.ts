import assert from 'node:assert/strict';
import { mkdtemp, open, readdir, rm, truncate, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { PgSurumu, YedeklerCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { DOSYA_SINIRI } from '../dosya/disari.ts';
import {
  DOSYA_DEPOSU_UYARI_ORANI, YEDEK_EN_AZ_BOS_BAYT, YEDEK_EN_AZ_KALAN, YEDEK_SAKLAMA_GUN, YEDEK_SAKLANAN_ADET, dosyaDeposuHesapla, yedekAlaniHesapla,
  geceYedegiGerekliMi, silinecekYedekler, yedekAdi, yedekAdiniCoz, yedekAnahtariCoz,
  yedekYeriEksigi, aracAnaSurumu, pgSurumuDenetle, sunucuAnaSurumu, type YedekDosyasi,
} from './kurallar.ts';
import {
  PG_DUMP_YOK, baglanarakOku, geceYedegiTuru, pgSurumunuDenetle, surenYedek, windowsPgDump, yedekAl, yedekEkrani, yedekleriListele, yedekOrtamiOku,
  yedekSifreliMi, yedekSifresiniCoz, type PgDumpArama, type YedekOrtami, type YedekSurumDenetimi,
} from './yedek.ts';
import { ayarOku } from '#cekirdek/ayar.ts';

const PAROLA = 'dogru-parola-1';
// Yalnız test anahtarı; gerçek anahtar bilgi işlemdedir ve depoya girmez.
const ANAHTAR = Buffer.alloc(32, 7);
const ANAHTAR_METNI = ANAHTAR.toString('base64');
const GUN = 24 * 60 * 60 * 1000;
// Sahte pg_dump'lı testlerde sürüm denetimi geçer; denetimin kendisi aşağıda ayrı sınanır.
const UYUMLU: PgSurumu = { sunucu: 18, sunucuMetni: 'PostgreSQL 18.1', pgDump: 18, pgDumpYolu: 'pg_dump', uyumlu: true, ileti: null };
const uyumlu: YedekSurumDenetimi = async () => UYUMLU;
const VT = 'tmiv2';

// Sahte pg_dump'ın yazdığı çıktı ya da şifreli yedek (kaynak dosya değil).
async function baytOku(yol: string): Promise<Buffer> {
  const dosya = await open(yol, 'r');
  try {
    const tampon = Buffer.alloc((await dosya.stat()).size);
    await dosya.read(tampon, 0, tampon.length, 0);
    return tampon;
  } finally {
    await dosya.close();
  }
}

const ciktiOku = async (yol: string): Promise<string> => (await baytOku(yol)).toString('utf8');

const sessiz: Gunluk = { uyar: () => undefined, hata: () => undefined };

const dosya = (tur: YedekDosyasi['tur'], zaman: string, veritabani = VT): YedekDosyasi => {
  const an = new Date(zaman);
  return { ad: yedekAdi(veritabani, tur, an), veritabani, tur, zaman: an };
};

describe('ayarlar yedek kuralları (saf)', () => {
  test('yedek için boş yer son yedeğin iki katı, en az 1 GB olmalı; boş yer bilinmiyorsa denetlenmez', () => {
    const GB = 1024 ** 3;
    assert.equal(YEDEK_EN_AZ_BOS_BAYT, GB);
    assert.equal(yedekYeriEksigi(null, 5 * GB), null);
    assert.equal(yedekYeriEksigi(GB, null), null);
    assert.equal(yedekYeriEksigi(GB - 1, null),
      'Yedek klasöründe yer yetmiyor: boş 1,0 GB, gereken en az 1,0 GB (son yedeğin iki katı, en az 1 GB). Yer açın; eski yedekler silinmedi.');
    assert.equal(yedekYeriEksigi(4 * GB, 2 * GB), null);
    assert.match(yedekYeriEksigi(4 * GB - 1, 2 * GB) ?? '', /boş 4,0 GB, gereken en az 4,0 GB/);
  });

  test('yedek adı UTC zamanı saniyesiyle taşır ve geri çözülür; takvimde olmayan ya da yabancı ad çözülmez', () => {
    const an = new Date('2026-10-13T23:00:05.123Z');
    const ad = yedekAdi('tmiv2_test', 'gece', an);
    assert.equal(ad, 'tmiv2_test-20261013T230005Z-gece.dump');
    assert.deepEqual(yedekAdiniCoz(ad), { ad, veritabani: 'tmiv2_test', tur: 'gece', zaman: new Date('2026-10-13T23:00:05Z') });
    for (const yabanci of [
      'tmiv2-20261399T230005Z-gece.dump', 'tmiv2-20261013T230005Z-baska.dump', 'tmiv2-20261013T230005Z-gece.dump.yarim',
      'tmi-20261013T230005Z-gece.dump', '../tmiv2-20261013T230005Z-gece.dump', 'tmiv2-20261013T230005Z-gece.sql',
    ]) {
      assert.equal(yedekAdiniCoz(yabanci), null, yabanci);
    }
  });

  test('gece yedeği tesis saati 02:00 gelince, günde bir kez gerekir; elle alınan yedek yerini tutmaz', () => {
    // Tesis saati UTC+3: 2026-10-14 01:59 tesis = 2026-10-13T22:59Z.
    assert.equal(geceYedegiGerekliMi([], new Date('2026-10-13T22:59:00Z')), false, 'saat gelmedi');
    assert.equal(geceYedegiGerekliMi([], new Date('2026-10-13T23:00:00Z')), true, 'saat geldi, yedek yok');
    const dunku = dosya('gece', '2026-10-12T23:00:00Z');
    const bugunku = dosya('gece', '2026-10-13T23:00:00Z');
    const elle = dosya('elle', '2026-10-14T06:00:00Z');
    const simdi = new Date('2026-10-14T09:00:00Z');
    assert.equal(geceYedegiGerekliMi([dunku], simdi), true, 'dünkü yedek bugünü karşılamaz');
    assert.equal(geceYedegiGerekliMi([dunku, elle], simdi), true, 'elle yedek gece yedeği sayılmaz');
    assert.equal(geceYedegiGerekliMi([dunku, bugunku], simdi), false, 'bugünün yedeği var');
  });

  test(`${String(YEDEK_SAKLAMA_GUN)} günden eski yedek silinir; en yeni ${String(YEDEK_EN_AZ_KALAN)} yedek yaşına bakılmadan kalır`, () => {
    const simdi = new Date('2026-10-30T00:00:00Z');
    const yeni = dosya('gece', new Date(simdi.getTime() - 1 * GUN).toISOString());
    const sinirda = dosya('elle', new Date(simdi.getTime() - YEDEK_SAKLAMA_GUN * GUN).toISOString());
    const eski = dosya('gece', new Date(simdi.getTime() - YEDEK_SAKLAMA_GUN * GUN - 1000).toISOString());
    const dahaEski = dosya('gece', new Date(simdi.getTime() - 40 * GUN).toISOString());
    const enEski = dosya('gece', new Date(simdi.getTime() - 50 * GUN).toISOString());
    assert.deepEqual(silinecekYedekler([enEski, yeni, eski, dahaEski, sinirda], simdi).map((y) => y.ad), [dahaEski.ad, enEski.ad]);
    // Yedek alınamayan uzun dönemde en yeni üçü kalır, hepsi eski olsa da.
    assert.deepEqual(silinecekYedekler([enEski, eski, dahaEski], simdi), []);
    assert.deepEqual(silinecekYedekler([enEski, eski, dahaEski, dosya('gece', '2026-08-01T00:00:00Z')], simdi).map((y) => y.ad), [
      dosya('gece', '2026-08-01T00:00:00Z').ad,
    ]);
  });
});

describe('ayarlar yedek alanı ve dosya deposu (saf, kart 1763)', () => {
  const GB = 1024 ** 3;

  test('saklamada aynı anda 14 + 1 gece yedeği durur; gereken yer son yedeğin o kadar katı', () => {
    assert.equal(YEDEK_SAKLANAN_ADET, YEDEK_SAKLAMA_GUN + 1);
    assert.deepEqual(yedekAlaniHesapla({ sonBoyut: 2 * GB, mevcut: 10 * GB, bosYer: 20 * GB }), {
      sonBoyut: 2 * GB, adet: YEDEK_SAKLANAN_ADET, gereken: 30 * GB, mevcut: 10 * GB, bosYer: 20 * GB, yetmiyor: false,
    });
  });

  test('boş yer artı mevcut yedekler gerekenden azsa yetmiyor; tam eşitse yeter', () => {
    assert.equal(yedekAlaniHesapla({ sonBoyut: 2 * GB, mevcut: 10 * GB, bosYer: 20 * GB - 1 }).yetmiyor, true);
    assert.equal(yedekAlaniHesapla({ sonBoyut: 2 * GB, mevcut: 0, bosYer: 30 * GB }).yetmiyor, false);
  });

  test('son yedek yoksa gereken bilinmez, boş yer okunamadıysa karşılaştırılmaz: ikisinde de uyarı uydurulmaz', () => {
    assert.deepEqual(yedekAlaniHesapla({ sonBoyut: null, mevcut: 0, bosYer: 0 }), {
      sonBoyut: null, adet: YEDEK_SAKLANAN_ADET, gereken: null, mevcut: 0, bosYer: 0, yetmiyor: false,
    });
    assert.equal(yedekAlaniHesapla({ sonBoyut: 100 * GB, mevcut: 0, bosYer: null }).yetmiyor, false);
  });

  test(`dosya deposu sınırın yüzde ${String(DOSYA_DEPOSU_UYARI_ORANI * 100)}'ine gelince uyarır, altında uyarmaz`, () => {
    const sinir = DOSYA_SINIRI.depoBayt;
    assert.equal(sinir, 50 * GB);
    assert.deepEqual(dosyaDeposuHesapla(40 * GB, sinir), { bayt: 40 * GB, sinir, uyari: true });
    assert.equal(dosyaDeposuHesapla(40 * GB - 1, sinir).uyari, false);
    assert.equal(dosyaDeposuHesapla(0, sinir).uyari, false);
  });
});

describe('ayarlar pg_dump yolu (Windows kurulumu, PATH dışı)', () => {
  const kurulu = (klasorler: Record<string, string[]>, dosyalar: readonly string[], platform: NodeJS.Platform = 'win32'): PgDumpArama => ({
    platform,
    klasorOku: (yol) => {
      const icerik = klasorler[yol];
      if (icerik === undefined) throw new Error('yok');
      return icerik;
    },
    varMi: (yol) => dosyalar.includes(yol),
  });
  const pg17 = 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe';
  const windows = kurulu({ 'C:\\Program Files\\PostgreSQL': ['9.6', '16', '18', 'pgAdmin 4', '17'] }, [
    'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe', pg17,
  ]);
  // Sunucunun kendi ortamı (PostgreSQL bağlantısı) korunur; aranan klasörler ve TMIV2_PG_DUMP testte verilir.
  const ortam = (ek: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
    const temel = { ...process.env };
    for (const ad of ['TMIV2_PG_DUMP', 'ProgramFiles', 'ProgramW6432', 'ProgramFiles(x86)']) delete temel[ad];
    return { ...temel, ...ek };
  };

  test('en yeni PostgreSQL sürümünün pg_dump\'ı seçilir; sürüm olmayan klasör ve eksik dosya atlanır', () => {
    assert.equal(windowsPgDump(['D:\\Yok', 'C:\\Program Files'], windows.klasorOku, windows.varMi), pg17);
    assert.equal(windowsPgDump(['D:\\Yok'], windows.klasorOku, () => true), null);
  });

  test('TMIV2_PG_DUMP boşsa sunucunun yedek ortamı da Program Files altındaki pg_dump\'ı bulur (gece yedeği npm run yedek ile aynı yolu kullanır)', () => {
    assert.equal(yedekOrtamiOku(ortam({ ProgramFiles: 'C:\\Program Files' }), windows).pgDump.dosya, pg17);
    assert.equal(yedekOrtamiOku(ortam({ ProgramW6432: 'C:\\Program Files' }), windows).pgDump.dosya, pg17, '32 bit süreçte 64 bit klasör');
  });

  test('verilen TMIV2_PG_DUMP aramadan önce gelir; Windows\'ta kurulum bulunamazsa PATH\'e düşülmez, Linux\'ta PATH\'teki pg_dump denenir', () => {
    assert.deepEqual(yedekOrtamiOku(ortam({ ProgramFiles: 'C:\\Program Files', TMIV2_PG_DUMP: ' D:\\pg\\pg_dump.exe ' }), windows).pgDump, { dosya: 'D:\\pg\\pg_dump.exe', onEk: [] });
    assert.equal(yedekOrtamiOku(ortam({ ProgramFiles: 'D:\\Yok' }), windows).pgDump.hata, PG_DUMP_YOK);
    assert.equal(yedekOrtamiOku(ortam({ ProgramFiles: 'C:\\Program Files' }), windows).pgDump.hata, undefined);
    assert.deepEqual(yedekOrtamiOku(ortam({ ProgramFiles: 'C:\\Program Files' }), { ...windows, platform: 'linux' }).pgDump, { dosya: 'pg_dump', onEk: [] });
  });

  test('Windows\'ta pg_dump bulunamadıysa yedek PATH\'teki pg_dump\'ı denemeden ve sunucuya bağlanmadan durur, nedeni yazar', async () => {
    const dizin = await mkdtemp(path.join(tmpdir(), 'tmiv2-pgdump-'));
    try {
      const yedekOrtami: YedekOrtami = {
        dizin, kaynak: 'ortam', pgDump: { dosya: 'pg_dump', onEk: [], hata: PG_DUMP_YOK }, anahtar: { durum: 'tamam', anahtar: ANAHTAR },
        pg: { host: '127.0.0.1', port: 1, kullanici: 'tmiv2_uygulama', parola: 'gizli-parola', veritabani: VT },
      };
      await assert.rejects(yedekAl(yedekOrtami, dizin, 'elle', new Date('2026-10-14T06:00:02Z')), (hata: Error) => hata.message === PG_DUMP_YOK);
      assert.deepEqual(await readdir(dizin), []);
    } finally {
      await rm(dizin, { recursive: true, force: true });
    }
  });

  test('pg_dump hiçbir yerde yoksa yedek açık hatayla düşer: aranan yerler ve TMIV2_PG_DUMP söylenir, yarım dosya kalmaz', async () => {
    const dizin = await mkdtemp(path.join(tmpdir(), 'tmiv2-pgdump-'));
    try {
      const yedekOrtami = (dosya: string): YedekOrtami => ({
        dizin, kaynak: 'ortam', pgDump: { dosya, onEk: [] }, anahtar: { durum: 'tamam', anahtar: ANAHTAR },
        pg: { host: '127.0.0.1', port: 5432, kullanici: 'tmiv2_uygulama', parola: 'gizli-parola', veritabani: VT },
      });
      await assert.rejects(yedekAl(yedekOrtami('tmiv2-olmayan-pg-dump'), dizin, 'elle', new Date('2026-10-14T06:00:00Z')),
        /pg_dump bulunamadı \(tmiv2-olmayan-pg-dump\): PATH'te yok, Windows'ta PostgreSQL kurulum klasöründe de yok; tam yolu TMIV2_PG_DUMP ile verin/);
      const yanlis = path.join(dizin, 'pg-dump-yok');
      await assert.rejects(yedekAl(yedekOrtami(yanlis), dizin, 'elle', new Date('2026-10-14T06:00:01Z')),
        (hata: Error) => hata.message === `pg_dump bulunamadı (${yanlis}); TMIV2_PG_DUMP'taki tam yolu denetleyin.`);
      assert.deepEqual(await readdir(dizin), []);
    } finally {
      await rm(dizin, { recursive: true, force: true });
    }
  });
});

describe('ayarlar PostgreSQL sürüm denetimi (2306)', () => {
  test('araç çıktısından ana sürüm okunur; dağıtım eki ve küçük sürüm etkilemez, tanınmayan çıktı null', () => {
    assert.equal(aracAnaSurumu('pg_dump (PostgreSQL) 18.1\n'), 18);
    assert.equal(aracAnaSurumu('pg_dump (PostgreSQL) 16.4 (Ubuntu 16.4-1.pgdg24.04+1)\n'), 16);
    assert.equal(aracAnaSurumu('pg_basebackup (PostgreSQL) 17beta2'), 17);
    assert.equal(aracAnaSurumu('pg_dump (PostgreSQL) 9.6.24'), null);
    assert.equal(aracAnaSurumu('v24.22.2'), null);
  });

  test('server_version_num ana sürüme çevrilir; 10 öncesi ve okunamayan null', () => {
    assert.equal(sunucuAnaSurumu(180001), 18);
    assert.equal(sunucuAnaSurumu(160004), 16);
    assert.equal(sunucuAnaSurumu(90624), null);
    assert.equal(sunucuAnaSurumu(null), null);
  });

  test('ana sürümler eşitse uyumlu; farklıysa, biri okunamadıysa ya da araç yoksa uyumsuz ve nedeni yazılır', () => {
    const temel = { sunucu: 18, sunucuMetni: 'PostgreSQL 18.1', sunucuHatasi: null, arac: 'pg_dump' as const, aracSurumu: 18, aracYolu: 'pg_dump', aracHatasi: null };
    assert.deepEqual(pgSurumuDenetle(temel), { sunucu: 18, sunucuMetni: 'PostgreSQL 18.1', pgDump: 18, pgDumpYolu: 'pg_dump', uyumlu: true, ileti: null });
    const farkli = pgSurumuDenetle({ ...temel, aracSurumu: 16 });
    assert.equal(farkli.uyumlu, false);
    assert.match(farkli.ileti ?? '', /^pg_dump ana sürümü 16, veritabanı sunucusu 18: uyuşmuyor, yedek alınmadı\. .*TMIV2_PG_DUMP/);
    assert.match(pgSurumuDenetle({ ...temel, aracSurumu: null }).ileti ?? '', /pg_dump sürümü okunamadı \(pg_dump\)/);
    assert.match(pgSurumuDenetle({ ...temel, sunucu: null, sunucuHatasi: 'bağlanılamadı' }).ileti ?? '', /sunucusunun sürümü okunamadı \(bağlanılamadı\)/);
    assert.equal(pgSurumuDenetle({ ...temel, aracHatasi: PG_DUMP_YOK, aracSurumu: null, aracYolu: null }).ileti, PG_DUMP_YOK);
  });

  test('araç bulunamazsa sunucuya hiç gidilmez; sunucu okunamazsa uyumsuz sayılır, araç yolu gösterilir', async () => {
    let soruldu = 0;
    const sunucu = async () => { soruldu += 1; return { surumNo: 180001, metin: 'PostgreSQL 18.1' }; };
    const yok = await pgSurumunuDenetle('pg_dump', 'C:\\pg\\pg_dump.exe', undefined, sunucu, async () => ({ hata: 'pg_dump bulunamadı (C:\\pg\\pg_dump.exe)' }));
    assert.equal(yok.uyumlu, false);
    assert.equal(soruldu, 0);
    const esit = await pgSurumunuDenetle('pg_dump', 'C:\\pg\\pg_dump.exe', undefined, sunucu, async () => ({ cikti: 'pg_dump (PostgreSQL) 18.0' }));
    assert.deepEqual(esit, { sunucu: 18, sunucuMetni: 'PostgreSQL 18.1', pgDump: 18, pgDumpYolu: 'C:\\pg\\pg_dump.exe', uyumlu: true, ileti: null });
    const dusen = await pgSurumunuDenetle('pg_dump', 'pg_dump', undefined, async () => { throw new Error('ECONNREFUSED'); }, async () => ({ cikti: 'pg_dump (PostgreSQL) 18.0' }));
    assert.equal(dusen.uyumlu, false);
    assert.match(dusen.ileti ?? '', /ECONNREFUSED/);
  });
});

describe('ayarlar yedek anahtarı (saf)', () => {
  test('anahtar 32 baytlık base64 olmalı: boş ya da tanımsız "yok", biçimi ya da boyu tutmayan "gecersiz"', () => {
    assert.deepEqual(yedekAnahtariCoz(` ${ANAHTAR_METNI} `), { durum: 'tamam', anahtar: ANAHTAR });
    assert.equal(yedekAnahtariCoz(undefined).durum, 'yok');
    assert.equal(yedekAnahtariCoz('  ').durum, 'yok');
    for (const bozuk of [Buffer.alloc(16, 1).toString('base64'), Buffer.alloc(33, 1).toString('base64'), 'parola123', `${ANAHTAR_METNI.slice(0, -2)}!=`]) {
      assert.equal(yedekAnahtariCoz(bozuk).durum, 'gecersiz', bozuk);
    }
    const yok = yedekAnahtariCoz(undefined);
    assert.match(yok.durum === 'tamam' ? '' : yok.ileti, /TMIV2_YEDEK_ANAHTARI/);
  });
});

// Sahte pg_dump: aldığı argümanları ve ortamın parolayla ilgili kısmını standart çıktıya yazar (dosyaya şifreli girer). Davranışı test ortamından
// okur (alt sürece TMIV2_ dışındaki değişkenler geçer).
const SAHTE_PG_DUMP = `
const kip = process.env.YEDEK_SAHTE_KIP ?? 'tamam';
const bekle = Number(process.env.YEDEK_SAHTE_BEKLE_MS ?? '0');
setTimeout(() => {
  if (kip === 'hata') {
    process.stdout.write('yarim');
    process.stderr.write('pg_dump: error: connection to server failed\\nikinci satir\\n');
    process.exit(1);
  }
  const tmiv2 = Object.keys(process.env).filter((a) => a.toUpperCase().startsWith('TMIV2_'));
  process.stdout.write(JSON.stringify({ argv: process.argv.slice(2), pgpassword: process.env.PGPASSWORD, tmiv2 }));
}, bekle);
`;

describe('ayarlar veritabanı yedeği (gerçek PostgreSQL, geçici dizin, sahte pg_dump)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let dizin = '';
  let betik = '';
  let yonetici = '';
  let yoneticiId = 0;
  const bayraksizlar: { rol: { id: number; ad: string }; cerez: string }[] = [];

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    return ortam.vt;
  };

  // Ortam sahte pg_dump'ı node ile koşar: Windows'ta da çalışır, PATH'teki gerçek pg_dump'a hiç gidilmez.
  const yedekOrtami = (d: string | null = dizin): YedekOrtami => ({
    dizin: d,
    kaynak: d === null ? null : 'ortam',
    pg: { host: '127.0.0.1', port: 5432, kullanici: 'tmiv2_uygulama', parola: 'gizli-parola', veritabani: VT },
    pgDump: { dosya: process.execPath, onEk: [betik] },
    anahtar: { durum: 'tamam', anahtar: ANAHTAR },
  });

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const istek = (cerez: string | null, yontem: 'GET' | 'POST', url: string) =>
    app.inject({ method: yontem, url: `/api${url}`, headers: cerez === null ? {} : { cookie: cerez }, payload: yontem === 'POST' ? {} : undefined });

  // İndirme iki adımdır (145 a): izin komutu denetim kaydına düşer, indirme o izinle bir kez yapılır.
  async function indir(cerez: string, ad: string) {
    const izin = await istek(cerez, 'POST', `/yedekler/${ad}/indirme-izni`);
    assert.equal(izin.statusCode, 200, izin.body);
    return istek(cerez, 'GET', `/yedekler/${ad}/indir?izin=${(izin.json() as { izin: string }).izin}`);
  }

  // Elle yedek HTTP'de veritabanı adını sunucunun ortamından okur; testte ona uyan adla dosya yerleştirilir.
  const sunucuVt = (): string => String(process.env['TMIV2_PG_DATABASE']);

  before(async () => {
    ortam = await testVeritabaniKur('ayarlar_yedek');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await girisCerezi('yonetici');
    const roller = ((await istek(yonetici, 'GET', '/roller')).json() as { roller: { id: number; ad: string; yonetici: boolean | null }[] }).roller;
    for (const rol of roller.filter((r) => r.yonetici !== true)) {
      const kullaniciAdi = `rol-${String(rol.id)}`;
      await ortam.vt.tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi, parola: PAROLA });
        const kisi = await rolAta(db, yoneticiId, id, rol.id);
        for (const r of kisi.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
      });
      bayraksizlar.push({ rol, cerez: await girisCerezi(kullaniciAdi) });
    }
  });

  after(async () => {
    await ortam?.kaldir();
    if (dizin !== '') await rm(dizin, { recursive: true, force: true });
    delete process.env['TMIV2_YEDEK_DIZINI'];
    delete process.env['TMIV2_PG_DUMP'];
    delete process.env['TMIV2_YEDEK_ANAHTARI'];
  });

  beforeEach(async () => {
    if (dizin !== '') await rm(dizin, { recursive: true, force: true });
    dizin = await mkdtemp(path.join(tmpdir(), 'tmiv2-yedek-'));
    betik = path.join(dizin, 'sahte-pg-dump.cjs');
    await writeFile(betik, SAHTE_PG_DUMP);
    process.env['TMIV2_YEDEK_DIZINI'] = dizin;
    // HTTP'den başlayan yedek gerçek pg_dump'a gitmesin: var olmayan yol.
    process.env['TMIV2_PG_DUMP'] = path.join(dizin, 'pg-dump-yok');
    process.env['TMIV2_YEDEK_ANAHTARI'] = ANAHTAR_METNI;
    delete process.env['YEDEK_SAHTE_KIP'];
    delete process.env['YEDEK_SAHTE_BEKLE_MS'];
  });

  const yedekDosyalari = async (): Promise<string[]> => (await readdir(dizin)).filter((a) => a !== 'sahte-pg-dump.cjs').sort();

  test('yalnız yönetici listeler, yedek alır ve indirir; bayraksız hiçbir rol yapamaz; oturumsuz istek 401 alır', async () => {
    assert.equal(bayraksizlar.length > 0, true, 'bütün işlemleri vermeyen rol yok');
    const ad = yedekAdi(sunucuVt(), 'gece', new Date('2026-10-13T23:00:00Z'));
    await writeFile(path.join(dizin, ad), 'yedek');
    for (const { rol, cerez } of bayraksizlar) {
      assert.equal((await istek(cerez, 'GET', '/yedekler')).statusCode, 403, `${rol.ad}: liste`);
      assert.equal((await istek(cerez, 'POST', '/yedekler/al')).statusCode, 403, `${rol.ad}: al`);
      assert.equal((await istek(cerez, 'POST', `/yedekler/${ad}/indirme-izni`)).statusCode, 403, `${rol.ad}: indirme izni`);
      assert.equal((await istek(cerez, 'GET', `/yedekler/${ad}/indir?izin=x`)).statusCode, 403, `${rol.ad}: indir`);
      const islemler = ((await istek(cerez, 'GET', '/oturum')).json() as { kullanici: { islemler: string[] } }).kullanici.islemler;
      assert.equal(islemler.includes('ayarlar.yedek-indir'), false, rol.ad);
    }
    assert.equal((await istek(null, 'GET', '/yedekler')).statusCode, 401);
    assert.equal((await istek(null, 'POST', '/yedekler/al')).statusCode, 401);
    assert.equal((await istek(null, 'GET', `/yedekler/${ad}/indir?izin=x`)).statusCode, 401);
    assert.deepEqual(await yedekDosyalari(), [ad], 'reddedilen istek yedek başlatmadı');
    assert.equal((await istek(yonetici, 'GET', '/yedekler')).statusCode, 200);
    assert.equal((await indir(yonetici, ad)).statusCode, 200);
  });

  test('liste yalnız bu veritabanının tamamlanmış yedeklerini yeniden eskiye boyutuyla verir', async () => {
    const vtAdi = sunucuVt();
    const eski = yedekAdi(vtAdi, 'gece', new Date('2026-10-12T23:00:00Z'));
    const yeni = yedekAdi(vtAdi, 'elle', new Date('2026-10-13T08:30:00Z'));
    await writeFile(path.join(dizin, eski), 'abc');
    await writeFile(path.join(dizin, yeni), 'abcdef');
    await writeFile(path.join(dizin, `${yedekAdi(vtAdi, 'gece', new Date('2026-10-13T23:00:00Z'))}.yarim`), 'yarim');
    await writeFile(path.join(dizin, yedekAdi(`${vtAdi}_baska`, 'gece', new Date('2026-10-13T23:00:00Z'))), 'baska');
    await writeFile(path.join(dizin, 'notlar.txt'), 'ilgisiz');
    const cevap = (await istek(yonetici, 'GET', '/yedekler')).json() as YedeklerCevabi;
    assert.equal(cevap.durum, 'acik');
    assert.deepEqual(cevap.yedekler, [
      { ad: yeni, tur: 'elle', zaman: '2026-10-13T08:30:00.000Z', boyut: 6 },
      { ad: eski, tur: 'gece', zaman: '2026-10-12T23:00:00.000Z', boyut: 3 },
    ]);
    assert.equal(cevap.suruyor, null);
    // Kart 1763: gereken yer en yeni yedeğin boyundan, mevcut bütün yedeklerin toplamından; depo boş test veritabanından.
    assert.equal(cevap.alan?.sonBoyut, 6);
    assert.equal(cevap.alan.gereken, 6 * YEDEK_SAKLANAN_ADET);
    assert.equal(cevap.alan.mevcut, 9);
    assert.equal(typeof cevap.alan.bosYer, 'number');
    assert.deepEqual(cevap.dosyaDeposu, { bayt: 0, sinir: DOSYA_SINIRI.depoBayt, uyari: false });
  });

  test('yedek alanı boş yer yetmezse uyarır; klasör yoksa yer tahmini yoktur, dosya deposu yine verilir', async () => {
    await writeFile(path.join(dizin, yedekAdi(VT, 'gece', new Date('2026-10-13T23:00:00Z'))), 'x'.repeat(100));
    const yetmeyen = await vt().tx((db) => yedekEkrani(db, yedekOrtami(), () => Promise.resolve(100 * YEDEK_SAKLANAN_ADET - 101)));
    assert.equal(yetmeyen.alan?.yetmiyor, true);
    const yeten = await vt().tx((db) => yedekEkrani(db, yedekOrtami(), () => Promise.resolve(100 * YEDEK_SAKLANAN_ADET - 100)));
    assert.equal(yeten.alan?.yetmiyor, false);
    const kapali = await vt().tx((db) => yedekEkrani(db, yedekOrtami(path.join(dizin, 'yok'))));
    assert.equal(kapali.durum, 'dizin-yok');
    assert.equal(kapali.alan, null);
    assert.equal(kapali.dosyaDeposu.sinir, DOSYA_SINIRI.depoBayt);
  });

  test('indirme dosyanın kendisini ek olarak verir; bozuk ad 400, başka veritabanının ya da olmayan yedek 404', async () => {
    const ad = yedekAdi(sunucuVt(), 'gece', new Date('2026-10-13T23:00:00Z'));
    const icerik = Buffer.from(Array.from({ length: 70_000 }, (_, i) => i % 251));
    await writeFile(path.join(dizin, ad), icerik);
    const baska = yedekAdi(`${sunucuVt()}_baska`, 'gece', new Date('2026-10-13T23:00:00Z'));
    await writeFile(path.join(dizin, baska), 'baska');
    const cevap = await indir(yonetici, ad);
    assert.equal(cevap.statusCode, 200);
    assert.deepEqual(cevap.rawPayload, icerik);
    assert.equal(cevap.headers['content-type'], 'application/octet-stream');
    assert.match(String(cevap.headers['content-disposition']), new RegExp(`^attachment; filename="${ad}"`));
    assert.equal((await istek(yonetici, 'POST', `/yedekler/${encodeURIComponent('../etc-passwd')}/indirme-izni`)).statusCode, 400);
    assert.equal((await istek(yonetici, 'POST', '/yedekler/notlar.txt/indirme-izni')).statusCode, 400);
    assert.equal((await istek(yonetici, 'POST', `/yedekler/${baska}/indirme-izni`)).statusCode, 404);
    assert.equal((await istek(yonetici, 'POST', `/yedekler/${yedekAdi(sunucuVt(), 'elle', new Date())}/indirme-izni`)).statusCode, 404);
  });

  test('her indirme kişisi ve yedek adıyla denetim kaydına düşer; izin tek kullanımlık, kişiye ve yedeğe bağlı, izinsiz indirme 403', async () => {
    const ad = yedekAdi(sunucuVt(), 'gece', new Date('2026-10-13T23:00:00Z'));
    const obur = yedekAdi(sunucuVt(), 'elle', new Date('2026-10-14T08:00:00Z'));
    await writeFile(path.join(dizin, ad), 'yedek');
    await writeFile(path.join(dizin, obur), 'obur');
    // Defter yalnız eklemeye açıktır: ölçülen bu testten sonraki satırlardır.
    const once = (await vt().tek<{ id: number }>('SELECT coalesce(max(id), 0)::int AS id FROM denetim_kaydi'))?.id ?? 0;
    assert.equal((await indir(yonetici, ad)).statusCode, 200);
    const kayit = await vt().sorgu<{ kisi_id: number; parametre: { ad: string } }>(
      "SELECT kisi_id, parametre FROM denetim_kaydi WHERE id > $1 AND yol = '/yedekler/:ad/indirme-izni'", [once]);
    assert.deepEqual(kayit.map((k) => [k.kisi_id, k.parametre.ad]), [[yoneticiId, ad]]);

    assert.equal((await istek(yonetici, 'GET', `/yedekler/${ad}/indir`)).statusCode, 400, 'izinsiz');
    assert.equal((await istek(yonetici, 'GET', `/yedekler/${ad}/indir?izin=uydurma-izin-degeri`)).statusCode, 403, 'uydurma izin');
    const izin = ((await istek(yonetici, 'POST', `/yedekler/${ad}/indirme-izni`)).json() as { izin: string }).izin;
    assert.equal((await istek(yonetici, 'GET', `/yedekler/${obur}/indir?izin=${izin}`)).statusCode, 403, 'başka yedeğin izni');
    assert.equal((await istek(yonetici, 'GET', `/yedekler/${ad}/indir?izin=${izin}`)).statusCode, 403, 'reddedilen denemede izin harcandı');
    const ikinci = ((await istek(yonetici, 'POST', `/yedekler/${ad}/indirme-izni`)).json() as { izin: string }).izin;
    assert.equal((await istek(yonetici, 'GET', `/yedekler/${ad}/indir?izin=${ikinci}`)).statusCode, 200);
    assert.equal((await istek(yonetici, 'GET', `/yedekler/${ad}/indir?izin=${ikinci}`)).statusCode, 403, 'ikinci kullanım');
  });

  test('385 a: verilen dosya kişi, uç, kayıt ve dosya bilgisiyle GET satırı olarak denetime düşer; reddedilen indirme düşmez; izin değeri deftere girmez', async () => {
    const ad = yedekAdi(sunucuVt(), 'gece', new Date('2026-10-15T23:00:00Z'));
    await writeFile(path.join(dizin, ad), 'yedek-icerik');
    const once = (await vt().tek<{ id: number }>('SELECT coalesce(max(id), 0)::int AS id FROM denetim_kaydi'))?.id ?? 0;
    assert.equal((await istek(yonetici, 'GET', `/yedekler/${ad}/indir?izin=uydurma-izin-degeri`)).statusCode, 403);
    const cevap = await indir(yonetici, ad);
    assert.equal(cevap.statusCode, 200);
    const satirlar = await vt().sorgu<{ kisi_id: number; yol: string; parametre: unknown; govde: unknown; modul: string; yetki: string }>(
      "SELECT kisi_id, yol, parametre, govde, modul, yetki FROM denetim_kaydi WHERE id > $1 AND yontem = 'GET'", [once]);
    assert.deepEqual(satirlar, [{
      kisi_id: yoneticiId, yol: '/yedekler/:ad/indir', parametre: { ad }, modul: 'ayarlar', yetki: 'ayarlar.yedek-indir',
      govde: { _ek: [{ ad, tur: 'application/octet-stream', boyut: Number(cevap.headers['content-length']) }] },
    }]);
    const butunSatirlar = await vt().sorgu<{ metin: string }>('SELECT row_to_json(d)::text AS metin FROM denetim_kaydi d WHERE id > $1', [once]);
    assert.equal(butunSatirlar.some((r) => r.metin.includes('uydurma-izin-degeri')), false);
  });

  test('klasör yoksa yedek kapalıdır: liste boş ve nedeniyle döner, yedek alınmaz ve indirilmez; gece işi bekler', async () => {
    for (const [ad, deger] of [['tanımsız', undefined], ['göreli', 'yedekler'], ['olmayan', path.join(dizin, 'yok')]] as const) {
      if (deger === undefined) delete process.env['TMIV2_YEDEK_DIZINI'];
      else process.env['TMIV2_YEDEK_DIZINI'] = deger;
      const liste = (await istek(yonetici, 'GET', '/yedekler')).json() as YedeklerCevabi;
      assert.equal(liste.durum, 'dizin-yok', ad);
      assert.deepEqual(liste.yedekler, [], ad);
      assert.equal((await istek(yonetici, 'POST', '/yedekler/al')).statusCode, 422, ad);
      assert.equal((await istek(yonetici, 'POST', `/yedekler/${yedekAdi(sunucuVt(), 'gece', new Date())}/indirme-izni`)).statusCode, 422, ad);
      const sonuc = await vt().tx((db) => geceYedegiTuru(db, sessiz, yedekOrtami(deger ?? null), new Date('2026-10-14T09:00:00Z'), uyumlu));
      assert.equal(sonuc?.durum, 'bekliyor', ad);
    }
  });

  test('elle yedek komutu denetime düşer ve cevabı beklemez; pg_dump bulunamazsa hata listede görünür, yarım dosya kalmaz', async () => {
    const cevap = await istek(yonetici, 'POST', '/yedekler/al');
    assert.equal(cevap.statusCode, 200, cevap.body);
    await surenYedek();
    const liste = (await istek(yonetici, 'GET', '/yedekler')).json() as YedeklerCevabi;
    assert.match(liste.sonHata?.ileti ?? '', /pg_dump bulunamadı .*TMIV2_PG_DUMP/);
    assert.deepEqual(liste.yedekler, []);
    assert.deepEqual(await yedekDosyalari(), []);
    const kayit = await vt().sorgu<{ kisi_id: number }>("SELECT kisi_id FROM denetim_kaydi WHERE yol = '/yedekler/al'");
    assert.deepEqual(kayit.map((k) => k.kisi_id), [yoneticiId]);
  });

  test('pg_dump parolayı komut satırında değil ortamda alır, sunucunun TMIV2_ değişkenlerini almaz; yedek bitince adına taşınır', async () => {
    const simdi = new Date('2026-10-14T06:15:30Z');
    const yedek = await yedekAl(yedekOrtami(), dizin, 'elle', simdi, undefined, uyumlu);
    assert.equal(yedek.ad, 'tmiv2-20261014T061530Z-elle.dump');
    assert.deepEqual(await yedekDosyalari(), [yedek.ad]);
    const acik = path.join(dizin, 'acik.json');
    await yedekSifresiniCoz(ANAHTAR, path.join(dizin, yedek.ad), acik);
    const yazilan = JSON.parse(await ciktiOku(acik)) as { argv: string[]; pgpassword: string; tmiv2: string[] };
    await rm(acik);
    // Çıktı dosyaya değil standart çıktıya: düz yedek diske hiç yazılmaz.
    assert.deepEqual(yazilan.argv, [
      '--format=custom', '--no-password', '--host=127.0.0.1', '--port=5432', '--username=tmiv2_uygulama', '--dbname=tmiv2',
    ]);
    assert.equal(yazilan.argv.some((a) => a.includes('gizli-parola')), false);
    assert.equal(yazilan.pgpassword, 'gizli-parola');
    assert.deepEqual(yazilan.tmiv2, [], 'TMIV2_ değişkeni alt sürece geçti');
    assert.equal((await yedekleriListele(yedekOrtami())).sonHata, null);
  });

  // Disk dolarsa pg_dump yarıda kalır ve gece temizliği yer açmak için eski yedeği silebilirdi (denetim #47): yedek hiç başlamaz.
  test('boş yer son yedeğin iki katından azsa yedek başlamaz: pg_dump koşmaz, eski yedek yerinde kalır, hata listede görünür', async () => {
    const eski = 'tmiv2-20261013T230000Z-gece.dump';
    await writeFile(path.join(dizin, eski), '');
    await truncate(path.join(dizin, eski), 600 * 1024 ** 2);
    await assert.rejects(yedekAl(yedekOrtami(), dizin, 'elle', new Date('2026-10-14T06:00:00Z'), () => Promise.resolve(1024 ** 3), uyumlu),
      (hata: Error) => hata.message.startsWith('Yedek klasöründe yer yetmiyor: boş 1,0 GB, gereken en az 1,2 GB'));
    assert.deepEqual(await yedekDosyalari(), [eski]);
    assert.match((await yedekleriListele(yedekOrtami())).sonHata?.ileti ?? '', /yer yetmiyor/);
    const yedek = await yedekAl(yedekOrtami(), dizin, 'elle', new Date('2026-10-14T06:00:01Z'), () => Promise.resolve(2 * 1024 ** 3), uyumlu);
    assert.deepEqual(await yedekDosyalari(), [eski, yedek.ad]);
  });

  test('pg_dump hata verirse yarım dosya silinir, ilk hata satırı listede görünür; sonraki başarılı yedek hatayı kaldırır', async () => {
    process.env['YEDEK_SAHTE_KIP'] = 'hata';
    await assert.rejects(yedekAl(yedekOrtami(), dizin, 'elle', new Date(), undefined, uyumlu), /çıkış 1\): pg_dump: error: connection to server failed$/);
    assert.deepEqual(await yedekDosyalari(), []);
    assert.match((await yedekleriListele(yedekOrtami())).sonHata?.ileti ?? '', /connection to server failed$/);
    delete process.env['YEDEK_SAHTE_KIP'];
    await yedekAl(yedekOrtami(), dizin, 'elle', new Date(), undefined, uyumlu);
    assert.equal((await yedekleriListele(yedekOrtami())).sonHata, null);
  });

  test('reddedilen: pg_dump ana sürümü sunucununkinden farklıysa yedek alınmaz, pg_dump koşmaz, neden listede görünür', async () => {
    const uyusmaz: YedekSurumDenetimi = async () => ({
      ...UYUMLU, pgDump: 16, uyumlu: false, ileti: 'pg_dump ana sürümü 16, veritabanı sunucusu 18: uyuşmuyor, yedek alınmadı.',
    });
    await assert.rejects(yedekAl(yedekOrtami(), dizin, 'elle', new Date('2026-10-14T06:00:00Z'), undefined, uyusmaz), /uyuşmuyor, yedek alınmadı/);
    assert.deepEqual(await yedekDosyalari(), []);
    assert.match((await yedekleriListele(yedekOrtami())).sonHata?.ileti ?? '', /pg_dump ana sürümü 16, veritabanı sunucusu 18/);
    await vt().tx((db) => geceYedegiTuru(db, sessiz, yedekOrtami(), new Date('2026-10-14T23:30:00Z'), uyusmaz)).then(
      () => assert.fail('gece yedeği sürüm uyuşmazlığında hata vermeli'),
      (hata: Error) => { assert.match(hata.message, /uyuşmuyor/); },
    );
    assert.deepEqual(await yedekDosyalari(), []);
  });

  test('sunucu sürümü uygulama kullanıcısıyla okunur; ekran ana sürümü ve version() metnini verir, sürümü okunamayan araçla uyumsuz der', async () => {
    const beklenen = Math.floor(Number((await vt().tek<{ v: string }>("SELECT current_setting('server_version_num') AS v"))?.v) / 10000);
    const cevap = await vt().tx((db) => yedekEkrani(db, yedekOrtami()));
    const surum = cevap.pgSurumu;
    assert.ok(surum);
    assert.equal(surum.sunucu, beklenen);
    assert.match(surum.sunucuMetni ?? '', /^PostgreSQL \d+/);
    // Sahte pg_dump node'dur: `--version` PostgreSQL sürümü yazmaz.
    assert.equal(surum.pgDump, null);
    assert.equal(surum.uyumlu, false);
    assert.equal((await yedekleriListele(yedekOrtami())).pgSurumu, null, 'bağlantısız liste denetlemez');
    const ayri = await baglanarakOku(ayarOku(process.env).pg)();
    assert.equal(sunucuAnaSurumu(ayri.surumNo), beklenen);
  });

  test('yedek AES-256-GCM ile şifreli yazılır: düz içerik dosyada yok; yanlış anahtar ya da bozulmuş dosya açılmaz, yarım çıktı kalmaz', async () => {
    const yedek = await yedekAl(yedekOrtami(), dizin, 'gece', new Date('2026-10-14T23:00:00Z'), undefined, uyumlu);
    const yol = path.join(dizin, yedek.ad);
    const ham = await ciktiOku(yol);
    assert.equal(ham.includes('gizli-parola'), false);
    assert.equal(ham.includes('--format=custom'), false);
    assert.equal(await yedekSifreliMi(yol), true);
    const acik = path.join(dizin, 'acik.json');
    await assert.rejects(yedekSifresiniCoz(Buffer.alloc(32, 8), yol, acik), /anahtar uymuyor ya da dosya bozuk/);
    assert.equal((await readdir(dizin)).includes('acik.json'), false, 'yanlış anahtarla yarım çıktı kaldı');
    const bayt = await baytOku(yol);
    bayt[bayt.length - 20] = (bayt[bayt.length - 20] ?? 0) ^ 1;
    const bozuk = path.join(dizin, 'bozuk.dump');
    await writeFile(bozuk, bayt);
    await assert.rejects(yedekSifresiniCoz(ANAHTAR, bozuk, acik), /anahtar uymuyor ya da dosya bozuk/);
    await yedekSifresiniCoz(ANAHTAR, yol, acik);
    assert.match(await ciktiOku(acik), /"--format=custom"/);
    // Şifreleme öncesi alınmış düz yedek geri yüklenebilsin diye tanınır.
    await writeFile(bozuk, 'PGDMP düz yedek');
    assert.equal(await yedekSifreliMi(bozuk), false);
  });

  test('anahtar yoksa ya da geçersizse yedek alınmaz: komut 422, gece işi bekler, liste nedenini söyler, dosya yazılmaz', async () => {
    for (const deger of [undefined, 'kisa']) {
      if (deger === undefined) delete process.env['TMIV2_YEDEK_ANAHTARI'];
      else process.env['TMIV2_YEDEK_ANAHTARI'] = deger;
      const liste = (await istek(yonetici, 'GET', '/yedekler')).json() as YedeklerCevabi;
      assert.equal(liste.durum, 'anahtar-yok', String(deger));
      assert.equal((await istek(yonetici, 'POST', '/yedekler/al')).statusCode, 422, String(deger));
      const anahtarsiz: YedekOrtami = { ...yedekOrtami(), anahtar: yedekAnahtariCoz(deger) };
      await assert.rejects(yedekAl(anahtarsiz, dizin, 'elle', new Date(), undefined, uyumlu), /TMIV2_YEDEK_ANAHTARI/);
      const sonuc = await vt().tx((db) => geceYedegiTuru(db, sessiz, anahtarsiz, new Date('2026-10-14T09:00:00Z'), uyumlu));
      assert.equal(sonuc?.durum, 'bekliyor', String(deger));
      assert.deepEqual(await yedekDosyalari(), [], String(deger));
    }
  });

  test('aynı anda ikinci yedek başlamaz (409); süren yedek listede görünür', async () => {
    process.env['YEDEK_SAHTE_BEKLE_MS'] = '500';
    const ilk = yedekAl(yedekOrtami(), dizin, 'elle', new Date('2026-10-14T06:00:00Z'), undefined, uyumlu);
    await assert.rejects(yedekAl(yedekOrtami(), dizin, 'elle', new Date('2026-10-14T06:00:01Z'), undefined, uyumlu), { kod: 'CAKISMA' });
    const sirada = await yedekleriListele(yedekOrtami());
    assert.deepEqual(sirada.suruyor, { tur: 'elle', baslangic: '2026-10-14T06:00:00.000Z' });
    await ilk;
    assert.equal((await yedekleriListele(yedekOrtami())).suruyor, null);
  });

  test('yedek sürerken elle yedek komutu 409 döner; başladı demez', async () => {
    process.env['YEDEK_SAHTE_BEKLE_MS'] = '500';
    const ilk = yedekAl(yedekOrtami(), dizin, 'elle', new Date('2026-10-14T06:00:00Z'), undefined, uyumlu);
    const ikinci = await istek(yonetici, 'POST', '/yedekler/al');
    assert.equal(ikinci.statusCode, 409, ikinci.body);
    assert.match(ikinci.body, /zaten alınıyor/);
    await ilk;
    assert.deepEqual(await yedekDosyalari(), [yedekAdi(VT, 'elle', new Date('2026-10-14T06:00:00Z'))]);
  });

  test('gece işi günün yedeğini bir kez alır, sonra eskileri ve bir günden eski yarım dosyaları siler; başka dosyaya dokunmaz', async () => {
    const simdi = new Date('2026-10-30T00:00:00Z');
    const eskiler = [40, 41, 42, 43].map((g) => dosya('gece', new Date(simdi.getTime() - g * GUN).toISOString()));
    for (const y of eskiler) await writeFile(path.join(dizin, y.ad), 'eski');
    const eskiYarim = path.join(dizin, `${dosya('gece', '2026-10-01T00:00:00Z').ad}.yarim`);
    const gencYarim = path.join(dizin, `${dosya('elle', '2026-10-29T23:30:00Z').ad}.yarim`);
    await writeFile(eskiYarim, 'yarim');
    await utimes(eskiYarim, new Date(simdi.getTime() - 2 * GUN), new Date(simdi.getTime() - 2 * GUN));
    await writeFile(gencYarim, 'yarim');
    await utimes(gencYarim, new Date(simdi.getTime() - 60_000), new Date(simdi.getTime() - 60_000));
    await writeFile(path.join(dizin, 'notlar.txt'), 'ilgisiz');
    await vt().tx((db) => geceYedegiTuru(db, sessiz, yedekOrtami(), simdi, uyumlu));
    const bugunku = yedekAdi(VT, 'gece', simdi);
    // Bugünkü ve en yeni iki eski yedek kalır (en az üç); 42 ve 43 günlükler ile eski yarım dosya silinir.
    assert.deepEqual(await yedekDosyalari(), [
      eskiler[1]?.ad, eskiler[0]?.ad, bugunku, path.basename(gencYarim), 'notlar.txt',
    ].sort());
    await vt().tx((db) => geceYedegiTuru(db, sessiz, yedekOrtami(), new Date(simdi.getTime() + 3 * 60 * 60 * 1000), uyumlu));
    assert.deepEqual((await yedekDosyalari()).filter((a) => a.endsWith('-gece.dump') && a.includes('-20261030T')), [bugunku], 'ikinci yedek alınmadı');
  });

  test('gece işi yarım kalmış geri yüklemenin şifresiz dosyalarını hemen siler ve günlüğe yazar; başka veritabanınınkine dokunmaz', async () => {
    const simdi = new Date('2026-10-30T00:00:00Z');
    const yedek = dosya('gece', '2026-10-29T23:00:00Z').ad;
    const baska = dosya('gece', '2026-10-29T23:00:00Z', 'baska').ad;
    const artiklar = ['.cozulmus', '.geri.sql', '.bosalt.sql'].map((ek) => `${yedek}${ek}`);
    for (const a of [...artiklar, `${baska}.cozulmus`, 'notlar.geri.sql']) await writeFile(path.join(dizin, a), 'duz');
    const uyarilar: string[] = [];
    const gunluk: Gunluk = { uyar: (m) => { uyarilar.push(m); }, hata: () => undefined };
    await vt().tx((db) => geceYedegiTuru(db, gunluk, yedekOrtami(), simdi, uyumlu));
    const kalan = await yedekDosyalari();
    for (const a of artiklar) assert.ok(!kalan.includes(a), `${a} silinmedi`);
    assert.ok(kalan.includes(`${baska}.cozulmus`) && kalan.includes('notlar.geri.sql'));
    assert.equal(uyarilar.filter((u) => u.startsWith('Yarım kalmış geri yüklemenin şifresiz dosyası silindi')).length, 3);
  });

  test('gece işi pg_dump sürerken transaction boşta kalmaz: veritabanının boş transaction süresi işi kesmez', async () => {
    process.env['YEDEK_SAHTE_BEKLE_MS'] = '3000';
    const simdi = new Date('2026-10-14T09:00:00Z');
    await vt().tx(async (db) => {
      await db.sorgu("SET LOCAL idle_in_transaction_session_timeout = '1500ms'");
      await geceYedegiTuru(db, sessiz, yedekOrtami(), simdi, uyumlu);
      // Nabız gitmeseydi oturum kesilir, bu sorgu ve commit hata verirdi.
      await db.tek('SELECT 1');
    });
    assert.deepEqual(await yedekDosyalari(), [yedekAdi(VT, 'gece', simdi)]);
  });
});
