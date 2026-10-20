import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import type { Db, Veritabani } from './db.ts';
import { CANLI_RED, modulOrnekVerileriniKesfet, ornekVeriSirala, ornekVeriTanimi, ornekVeriYukle } from './ornek-veri.ts';
import type { OrnekVeriBaglami } from './ornek-veri.ts';
import { testSemasiAc } from './test-vt.ts';

const hayir = async (): Promise<boolean> => false;
const bos = async (): Promise<void> => undefined;
const tanim = (modul: string, gerekir: string[] = []) => ornekVeriTanimi({ modul, gerekir, yukluMu: hayir, yukle: bos });
const adlar = (liste: readonly { modul: string }[]): string[] => liste.map((t) => t.modul);

test('tanım: geçerli tanım donar; biçimsiz ad, kendini gerektirme ve eksik işlev anında hata', () => {
  const t = tanim('malzemeler', ['kisiler']);
  assert.equal(Object.isFrozen(t), true);
  assert.equal(Object.isFrozen(t.gerekir), true);
  for (const modul of ['', 'Buyuk', 'bosluk var', '-bas', 'ç']) assert.throws(() => tanim(modul), /modül adı/, modul);
  assert.throws(() => tanim('rota', ['rota']), /kendini gerektiremez/);
  assert.throws(() => ornekVeriTanimi({ modul: 'a', gerekir: [], yukluMu: hayir } as never), /işlevleri olmalı/);
});

test('sıra: gerekenler önce, aynı anda hazır olanlar ad sırasıyla; eksik modül, döngü, yineleme ve elle nesne hata', () => {
  const sirali = ornekVeriSirala([
    tanim('rota', ['malzemeler', 'istasyonlar']), tanim('malzemeler', ['kisiler']), tanim('kisiler'), tanim('istasyonlar', ['kisiler']),
  ]);
  assert.deepEqual(adlar(sirali), ['kisiler', 'istasyonlar', 'malzemeler', 'rota']);
  assert.throws(() => ornekVeriSirala([tanim('rota', ['malzemeler'])]), /örnek verisi olmayan modülü gerektiriyor: malzemeler/);
  assert.throws(() => ornekVeriSirala([tanim('a', ['b']), tanim('b', ['a']), tanim('c')]), /döngü: a, b/);
  assert.throws(() => ornekVeriSirala([tanim('a'), tanim('a')]), /yineleniyor: a/);
  assert.throws(() => ornekVeriSirala([{ modul: 'a', gerekir: [], yukluMu: hayir, yukle: bos }]), /ornekVeriTanimi/);
});

describe('keşif', () => {
  let klasor = '';
  const cekirdekYolu = pathToFileURL(join(import.meta.dirname, 'ornek-veri.ts')).href;
  const yaz = async (kok: string, ad: string, icerik: string | null): Promise<void> => {
    await mkdir(join(kok, ad), { recursive: true });
    if (icerik !== null) await writeFile(join(kok, ad, 'ornek-veri.ts'), icerik);
  };
  const tekTanim = (modul: string): string =>
    `import { ornekVeriTanimi } from '${cekirdekYolu}';\n` +
    `export const ornekVeri = ornekVeriTanimi({ modul: '${modul}', gerekir: [], yukluMu: async () => false, yukle: async () => undefined });\n`;

  before(async () => { klasor = await mkdtemp(join(tmpdir(), 'tmiv2-ornek-veri-')); });
  after(async () => { await rm(klasor, { recursive: true, force: true }); });

  test('ornek-veri.ts olan modül bulunur, olmayan atlanır', async () => {
    const kok = join(klasor, 'iyi');
    await yaz(kok, 'kisiler', tekTanim('kisiler'));
    await yaz(kok, 'dosya', null);
    assert.deepEqual(adlar(await modulOrnekVerileriniKesfet(kok)), ['kisiler']);
  });

  test('tanım vermeyen dosya ve klasörle uyuşmayan ad hata', async () => {
    const bozuk = join(klasor, 'bozuk');
    await yaz(bozuk, 'tek', 'export const ornekVeri = { modul: "tek" };\n');
    await assert.rejects(modulOrnekVerileriniKesfet(bozuk), /örnek veri vermiyor.*moduller\/tek\/ornek-veri\.ts/);
    const yanlis = join(klasor, 'yanlis');
    await yaz(yanlis, 'stok', tekTanim('kisiler'));
    await assert.rejects(modulOrnekVerileriniKesfet(yanlis), /klasörle aynı olmalı: moduller\/stok/);
  });
});

describe('yükleme (gerçek PostgreSQL)', { timeout: 40_000 }, () => {
  let vt: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;
  const acik = (): Veritabani => {
    if (!vt) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return vt;
  };
  const izler = async (): Promise<string[]> => (await acik().sorgu<{ ad: string }>('SELECT ad FROM iz ORDER BY id')).map((s) => s.ad);
  const yazan = (modul: string, gerekir: string[] = [], ek?: (db: Db, b: OrnekVeriBaglami) => Promise<void>) => ornekVeriTanimi({
    modul,
    gerekir,
    yukluMu: async (db) => (await db.tek('SELECT 1 FROM iz WHERE ad = $1', [modul])) !== null,
    yukle: async (db, b) => {
      await db.sorgu('INSERT INTO iz (ad) VALUES ($1)', [modul]);
      await ek?.(db, b);
    },
  });

  before(async () => {
    const ortam = await testSemasiAc('ornek_veri');
    kaldir = ortam.kaldir;
    await ortam.sahip.sorgu('CREATE TABLE iz (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ad text NOT NULL)');
    vt = ortam.vt;
  });
  after(async () => { await kaldir?.(); });

  test('canlı ortamda hiçbir modül çağrılmadan reddedilir', async () => {
    let cagri = 0;
    const t = ornekVeriTanimi({ modul: 'a', gerekir: [], yukluMu: async () => { cagri += 1; return false; }, yukle: bos });
    await assert.rejects(ornekVeriYukle(acik(), [t], { ortam: 'canli', bildir: () => undefined }), new RegExp(CANLI_RED.slice(0, 20)));
    assert.equal(cagri, 0);
    assert.deepEqual(await izler(), []);
  });

  test('bir modül hata verirse hiçbir yazı kalmaz ve satır basılmaz', async () => {
    const basilan: string[] = [];
    const bozuk = ornekVeriTanimi({ modul: 'rota', gerekir: ['kisiler'], yukluMu: hayir, yukle: async () => { throw new Error('dur'); } });
    const kisiler = yazan('kisiler', [], async (_db, b) => { b.bildir('hesap: ornek.yonetici'); });
    await assert.rejects(ornekVeriYukle(acik(), [bozuk, kisiler], { ortam: 'gelistirme', bildir: (s) => basilan.push(s) }), /dur/);
    assert.deepEqual(await izler(), []);
    assert.deepEqual(basilan, []);
  });

  test('sırayla yüklenir, bağlam günü tesis saatiyle verir, satırlar kalıcı olunca basılır; ikinci koşu hiçbir şey yazmaz', async () => {
    await acik().sorgu('DELETE FROM iz');
    const basilan: string[] = [];
    const gunler: string[] = [];
    const an = new Date('2026-10-12T22:30:00Z');
    const liste = [
      yazan('malzemeler', ['kisiler'], async (_db, b) => { gunler.push(b.gun); }),
      yazan('kisiler', [], async (_db, b) => { b.bildir(`ornek.yonetici ${b.parolaUret()}`); }),
    ];
    const secenek = { ortam: 'gelistirme' as const, an, parolaUret: () => 'uretilen', bildir: (s: string) => basilan.push(s) };
    assert.deepEqual(await ornekVeriYukle(acik(), liste, secenek), { durum: 'yuklendi', moduller: ['kisiler', 'malzemeler'] });
    assert.deepEqual(await izler(), ['kisiler', 'malzemeler']);
    assert.deepEqual(gunler, ['2026-10-13']);
    assert.deepEqual(basilan, ['ornek.yonetici uretilen']);

    assert.deepEqual(await ornekVeriYukle(acik(), liste, secenek), { durum: 'yuklu', moduller: ['kisiler', 'malzemeler'] });
    assert.deepEqual(await izler(), ['kisiler', 'malzemeler']);
    assert.equal(basilan.length, 1);
  });

  test('yüklü modül atlanır, sonradan gelen modül gerekir sırasıyla yüklenir', async () => {
    await acik().sorgu('DELETE FROM iz');
    await acik().sorgu("INSERT INTO iz (ad) VALUES ('kisiler')");
    const sira: string[] = [];
    const liste = [
      yazan('stok', ['malzemeler'], async () => { sira.push('stok'); }),
      yazan('kisiler', [], async () => { sira.push('kisiler'); }),
      yazan('malzemeler', ['kisiler'], async () => { sira.push('malzemeler'); }),
    ];
    const secenek = { ortam: 'gelistirme' as const, bildir: () => undefined };
    assert.deepEqual(await ornekVeriYukle(acik(), liste, secenek), { durum: 'yuklendi', moduller: ['malzemeler', 'stok'], yuklu: ['kisiler'] });
    assert.deepEqual(sira, ['malzemeler', 'stok']);
    assert.deepEqual(await izler(), ['kisiler', 'malzemeler', 'stok']);
  });

  test('varsayılan parola her çağrıda farklı ve en az 16 karakter', async () => {
    const parolalar: string[] = [];
    const t = ornekVeriTanimi({ modul: 'p', gerekir: [], yukluMu: hayir, yukle: async (_db, b) => { parolalar.push(b.parolaUret(), b.parolaUret()); } });
    await ornekVeriYukle(acik(), [t], { ortam: 'test', bildir: () => undefined });
    assert.equal(parolalar.length, 2);
    assert.notEqual(parolalar[0], parolalar[1]);
    for (const p of parolalar) assert.ok(p.length >= 16, p);
  });
});
