import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { diskYolu, diskeYazilabilir, disktenOku } from './disk-deposu.ts';
import { diskKunyeOzetleri, medyaTutamagi } from './disari.ts';
import { turBul } from './kurallar.ts';
import { dosyaParcasi, temizle } from './servis.ts';

// Sentetik içerik: imza türü belirler, gövde rastgele.
const png = (): Buffer => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(2000)]);
const mp4 = (): Buffer => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), randomBytes(2000)]);
const ozetOf = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
const SINIR = { turler: ['png', 'jpeg', 'webp', 'mp4'] as const, azamiBayt: 200 * 1024 * 1024 };

describe('MP4 türü', () => {
  test('ftyp kutusu ve MP4 markası tanınır; MOV (qt) ve imzasız içerik tanınmaz', () => {
    assert.equal(turBul(mp4(), 2012), 'mp4');
    assert.equal(turBul(Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  ')]), 12), null);
    assert.equal(turBul(Buffer.from('ftypisom'), 8), null);
  });
  test('disk deposu klasör mutlak yol ise açık; canlıda ayna gelene kadar kapalı', () => {
    assert.equal(diskeYazilabilir({ TMIV2_MEDYA_DIZINI: '/var/medya', TMIV2_ORTAM: 'gelistirme' }), '/var/medya');
    assert.equal(diskeYazilabilir({ TMIV2_MEDYA_DIZINI: '/var/medya', TMIV2_ORTAM: 'canli' }), null);
    assert.equal(diskeYazilabilir({ TMIV2_MEDYA_DIZINI: 'medya', TMIV2_ORTAM: 'gelistirme' }), null);
    assert.equal(diskeYazilabilir({ TMIV2_ORTAM: 'gelistirme' }), null);
  });
});

describe('talimat medyası disk deposu (gerçek PostgreSQL, geçici klasör)', () => {
  let ortam: TestVeritabani | undefined;
  let dizin = '';
  let kisi: Kullanici;
  const eski = { dizin: process.env['TMIV2_MEDYA_DIZINI'], ortam: process.env['TMIV2_ORTAM'] };
  const medya = medyaTutamagi('kisiler');
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const yukleBagla = (icerik: Buffer, kayit: string) => vt().tx(async (db) => {
    const ozet = ozetOf(icerik);
    assert.equal(await dosyaParcasi(db, kisi, ozet, { sira: 0, toplam: 1, veri: icerik.toString('base64') }), true);
    return medya.dosyaBagla(db, kisi, { ozet, kayit, ad: 'deneme', belgeTuru: null }, SINIR);
  });
  const depo = async (ozet: string) => (await vt().tek<{ depo: string }>('SELECT depo FROM dosya WHERE ozet = $1', [ozet]))?.depo ?? null;
  const parcaSayisi = async (ozet: string) => (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM dosya_icerigi WHERE ozet = $1', [ozet]))?.n ?? -1;
  const diskIcerigi = async (ozet: string): Promise<Buffer> => {
    const parcalar: Buffer[] = [];
    for await (const p of disktenOku(dizin, ozet)) parcalar.push(p);
    return Buffer.concat(parcalar);
  };
  const dosyaVar = (ozet: string) => stat(diskYolu(dizin, ozet)).then(() => true, () => false);

  before(async () => {
    ortam = await testVeritabaniKur('dosyadisk');
    dizin = await mkdtemp(join(tmpdir(), 'tmiv2-medya-'));
    process.env['TMIV2_MEDYA_DIZINI'] = dizin;
    process.env['TMIV2_ORTAM'] = 'gelistirme';
    const id = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme yükleyen', kullaniciAdi: 'medya', parola: 'dogru-parola-1' }));
    kisi = { id, ad: 'deneme', islemler: [] };
  });
  after(async () => {
    for (const [k, v] of [['TMIV2_MEDYA_DIZINI', eski.dizin], ['TMIV2_ORTAM', eski.ortam]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    await rm(dizin, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('bağlanan resim ve video diske özet adıyla yazılır, veritabanı parçaları silinir, akış diskten okunur', async () => {
    for (const icerik of [png(), mp4()]) {
      const bag = await yukleBagla(icerik, `k-${randomBytes(4).toString('hex')}`);
      assert.equal(await depo(bag.ozet), 'disk');
      assert.equal(await parcaSayisi(bag.ozet), 0);
      assert.deepEqual(await diskIcerigi(bag.ozet), icerik);
      const akis = await vt().tx((db) => medya.dosyaAkisi(db, 'yok', bag.ozet));
      assert.equal(akis, null, 'başka kaydın dosyası akmaz');
    }
    const ozetler = await vt().tx((db) => diskKunyeOzetleri(db));
    assert.equal(ozetler.length, 2);
  });

  test('canlıda disk kapalı: resim veritabanında kalır, video bağlanamaz', async () => {
    process.env['TMIV2_ORTAM'] = 'canli';
    try {
      assert.equal(medya.diskAcik(), false);
      const r = await yukleBagla(png(), 'canli-resim');
      assert.equal(await depo(r.ozet), 'vt');
      assert.equal(await dosyaVar(r.ozet), false);
      await assert.rejects(yukleBagla(mp4(), 'canli-video'), /türde/);
    } finally {
      process.env['TMIV2_ORTAM'] = 'gelistirme';
    }
  });

  test('bağı kalkan diskteki dosya künyesi silinince 30 gün bekler, sonra diskten silinir; arada yeniden bağlanırsa kalır', async () => {
    const a = await yukleBagla(png(), 'sil-a');
    const b = await yukleBagla(png(), 'sil-b');
    await vt().tx(async (db) => { await medya.bagKaldir(db, 'sil-a', null); await medya.bagKaldir(db, 'sil-b', null); });
    await ortam!.sahip.sorgu("UPDATE dosya SET bagsiz_zaman = now() - interval '8 days' WHERE ozet = ANY($1)", [[a.ozet, b.ozet]]);
    await vt().tx((db) => temizle(db));
    assert.equal(await depo(a.ozet), null);
    assert.equal(await dosyaVar(a.ozet), true, 'künye gitti, dosya bekliyor');
    await ortam!.sahip.sorgu("UPDATE dosya_disk_silinecek SET zaman = now() - interval '31 days'");
    // b aynı içerikle yeniden yüklenip bağlanır: dosya kalır, bekleme satırı kalkar.
    const bIcerik = await diskIcerigi(b.ozet);
    await yukleBagla(bIcerik, 'sil-b2');
    await vt().tx((db) => temizle(db));
    assert.equal(await dosyaVar(a.ozet), false);
    assert.equal(await dosyaVar(b.ozet), true);
    assert.equal(await depo(b.ozet), 'disk');
    const kalan = await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM dosya_disk_silinecek');
    assert.equal(kalan?.n, 0);
  });
});
