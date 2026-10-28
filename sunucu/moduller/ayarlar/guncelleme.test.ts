import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto';
import { mkdir, mkdtemp, open, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { GUNCELLEME_PARCASI, type GuncellemePaketi, type GuncellemePaketleriCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import {
  AZAMI_DEGISIKLIK, CALISAN_SURUM_DOSYASI, GUNCELLEYICI_DOSYASI, PAKET_IMLECI, SILME_REDDI_ILETISI, SURUMLER_KLASORU, UYGULAMA_GECMISI_DOSYASI,
  UYGULAMA_ISTEGI_DOSYASI, UYGULAMA_REDDI_ILETISI, UYGULAMA_SONUCU_DOSYASI, UYGULANIYOR_DOSYASI,
} from './kurallar.ts';
import { YEDEK_DIZINI_DOSYASI } from './yedek-dizini.ts';

const PAROLA = 'dogru-parola-1';
const COMMIT = 'a'.repeat(40);
// Uygulanabilir paket çalışan kodun bütün göçlerini taşır.
const GERCEK_GOCLER = (await readdir(new URL('../../gocler/', import.meta.url))).filter((ad) => ad.endsWith('.sql'));

interface Rol { id: number; ad: string; yonetici: boolean | null }

const ortakAnahtarMetni = (anahtar: KeyObject): string =>
  Buffer.from(String(anahtar.export({ format: 'jwk' }).x), 'base64url').toString('base64');

function paketKur(imzalayan: KeyObject, yuk: Buffer, degis: Record<string, unknown> = {}): Buffer {
  const bildirim = JSON.stringify({
    bicim: 1, surum: '0.1.0', commit: COMMIT, tarih: '2026-10-12T10:00:00.000Z', gocler: ['20261012100000_ornek.sql'],
    not: 'Deneme sürümü', yukBoyut: yuk.length, yukSha256: createHash('sha256').update(yuk).digest('hex'), ...degis,
  });
  const imza = sign(null, Buffer.from(bildirim, 'utf8'), imzalayan).toString('base64');
  return Buffer.concat([Buffer.from(PAKET_IMLECI, 'utf8'), Buffer.from(`${JSON.stringify({ bildirim, imza })}\n`, 'utf8'), yuk]);
}

// Yük iki parçadan uzun olsun ki parça sırası ve son kısa parça sınansın.
const YUK = Buffer.from(Array.from({ length: GUNCELLEME_PARCASI * 2 + 1000 }, (_, i) => i % 251));

describe('ayarlar güncelleme kanalı (gerçek PostgreSQL, geçici dizin)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let dizin = '';
  let yonetici = '';
  let ikinciYonetici = '';
  let yoneticiId = 0;
  const bayraksizlar: { rol: Rol; cerez: string }[] = [];
  const { privateKey: anahtar, publicKey: ortak } = generateKeyPairSync('ed25519');
  const { privateKey: yabanciAnahtar } = generateKeyPairSync('ed25519');

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const istek = (cerez: string | null, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method: yontem, url: `/api${url}`, headers: cerez === null ? {} : { cookie: cerez }, payload: payload as object | undefined });

  const liste = (cerez: string | null = yonetici) => istek(cerez, 'GET', '/guncelleme/paketler');
  const parca = (kimlik: string, paket: Buffer, sira: number, cerez: string | null = yonetici) =>
    istek(cerez, 'POST', `/guncelleme/yuklemeler/${kimlik}/parca`, {
      boyut: paket.length, sira, veri: paket.subarray(sira * GUNCELLEME_PARCASI, (sira + 1) * GUNCELLEME_PARCASI).toString('base64'),
    });
  const bitir = (kimlik: string, cerez: string | null = yonetici) => istek(cerez, 'POST', `/guncelleme/yuklemeler/${kimlik}/bitir`, {});

  async function hepsiniGonder(paket: Buffer, kimlik = randomUUID()): Promise<string> {
    const toplam = Math.ceil(paket.length / GUNCELLEME_PARCASI);
    for (let sira = 0; sira < toplam; sira++) {
      const cevap = await parca(kimlik, paket, sira);
      assert.equal(cevap.statusCode, 200, cevap.body);
      assert.deepEqual(cevap.json(), { alinan: sira + 1, toplam });
    }
    return kimlik;
  }

  // Saklanan paket kaynak dosya değildir; baytları sunucunun yazdığı çıktıdır.
  const saklananPaket = (commit: string): Promise<Buffer> => saklananBaytlar(path.join(dizin, 'paketler', `${commit}.tmip`));
  async function saklananBaytlar(yol: string): Promise<Buffer> {
    const dosya = await open(yol, 'r');
    try {
      const tampon = Buffer.alloc((await dosya.stat()).size);
      await dosya.read(tampon, 0, tampon.length, 0);
      return tampon;
    } finally {
      await dosya.close();
    }
  }

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    return ortam.vt;
  };

  const yuklemeler = async (): Promise<string[]> => readdir(path.join(dizin, 'yuklemeler')).catch(() => []);

  before(async () => {
    ortam = await testVeritabaniKur('ayarlar_guncelleme');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = await girisCerezi('yonetici');
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme İkinci Yönetici', kullaniciAdi: 'yonetici2', parola: PAROLA }));
    ikinciYonetici = await girisCerezi('yonetici2');
    const roller = ((await istek(yonetici, 'GET', '/roller')).json() as { roller: Rol[] }).roller;
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
    delete process.env['TMIV2_YEDEK_DIZINI'];
    await ortam?.kaldir();
    if (dizin !== '') await rm(dizin, { recursive: true, force: true });
  });

  beforeEach(async () => {
    if (dizin !== '') await rm(dizin, { recursive: true, force: true });
    dizin = await mkdtemp(path.join(tmpdir(), 'tmiv2-guncelleme-'));
    process.env['TMIV2_GUNCELLEME_DIZINI'] = dizin;
    process.env['TMIV2_GUNCELLEME_ANAHTARI'] = ortakAnahtarMetni(ortak);
    delete process.env['TMIV2_COMMIT'];
    // Güncelleyici yedeksiz kurmaz; istek de ancak yedek klasörü varken yazılır.
    await mkdir(path.join(dizin, 'yedek'));
    process.env['TMIV2_YEDEK_DIZINI'] = path.join(dizin, 'yedek');
  });

  test('yalnız yönetici okur ve yükler; bayraksız hiçbir rol okuyamaz, yükleyemez; oturumsuz istek 401 alır', async () => {
    assert.equal(bayraksizlar.length > 0, true, 'bütün işlemleri vermeyen rol yok');
    const paket = paketKur(anahtar, YUK);
    const kimlik = randomUUID();
    for (const { rol, cerez } of bayraksizlar) {
      assert.equal((await liste(cerez)).statusCode, 403, `${rol.ad}: liste`);
      assert.equal((await parca(kimlik, paket, 0, cerez)).statusCode, 403, `${rol.ad}: parça`);
      assert.equal((await bitir(kimlik, cerez)).statusCode, 403, `${rol.ad}: bitir`);
      const islemler = ((await istek(cerez, 'GET', '/oturum')).json() as { kullanici: { islemler: string[] } }).kullanici.islemler;
      assert.equal(islemler.includes('ayarlar.guncelleme-yukle'), false, rol.ad);
    }
    assert.equal((await liste(null)).statusCode, 401);
    assert.equal((await parca(kimlik, paket, 0, null)).statusCode, 401);
    assert.deepEqual(await yuklemeler(), [], 'reddedilen parça diske yazılmadı');
    assert.equal((await liste()).statusCode, 200);
    assert.equal((await parca(kimlik, paket, 0)).statusCode, 200);
  });

  test('imzalı paket parça parça yüklenir, doğrulanır, listede görünür; dosya baytı baytına saklanır', async () => {
    const paket = paketKur(anahtar, YUK);
    const kimlik = await hepsiniGonder(paket);
    const cevap = await bitir(kimlik);
    assert.equal(cevap.statusCode, 200, cevap.body);
    const sonuc = cevap.json() as GuncellemePaketi;
    assert.equal(sonuc.commit, COMMIT);
    assert.equal(sonuc.surum, '0.1.0');
    assert.deepEqual(sonuc.gocler, ['20261012100000_ornek.sql']);
    assert.deepEqual(sonuc.degisiklikler, [], 'değişiklik listesi olmayan eski bildirim de kabul edilir');
    assert.equal(sonuc.boyut, paket.length);
    assert.equal(sonuc.yukleyenId, yoneticiId);
    assert.equal(Math.abs(new Date(sonuc.yuklenme).getTime() - Date.now()) < 60_000, true, 'yüklenme zamanı sunucudan');
    const okunan = (await liste()).json() as GuncellemePaketleriCevabi;
    assert.deepEqual(okunan, {
      kanal: 'acik', paketler: [{ ...sonuc, uygulanamaz: okunan.paketler[0]?.uygulanamaz ?? null, silinemez: null, atlama: null }],
      guncelleyici: false, calisan: { commit: null, surum: null, tarih: null }, bekleyen: null, uygulaniyor: null, surumler: [],
      sonUygulama: null, gecmis: [],
      yedek: { dizin: path.join(dizin, 'yedek'), hazir: true },
    });
    assert.equal((await saklananPaket(COMMIT)).equals(paket), true);
    assert.deepEqual(await yuklemeler(), [], 'biten yükleme yükleme dizininde kalmaz');
  });

  test('paketin değişiklik listesi saklanır ve listede döner', async () => {
    const degisiklikler = ['#12: Deneme degisikligi', '#13: Ikinci degisiklik'];
    const cevap = await bitir(await hepsiniGonder(paketKur(anahtar, YUK, { degisiklikler })));
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.deepEqual((cevap.json() as GuncellemePaketi).degisiklikler, degisiklikler);
    assert.deepEqual(((await liste()).json() as GuncellemePaketleriCevabi).paketler.map((p) => p.degisiklikler), [degisiklikler]);
  });

  test('başka anahtarla imzalı, değiştirilmiş ya da paket olmayan dosya reddedilir ve saklanmaz', async () => {
    const bozukYuk = paketKur(anahtar, YUK);
    bozukYuk[bozukYuk.length - 1] = (bozukYuk[bozukYuk.length - 1] ?? 0) ^ 1;
    const durumlar: [string, Buffer, RegExp][] = [
      ['yabancı imza', paketKur(yabanciAnahtar, YUK), /imzası doğrulanamadı/],
      ['değişmiş yük', bozukYuk, /bildirimle uyuşmuyor/],
      ['eksik bildirim alanı', paketKur(anahtar, YUK, { commit: 'kisa' }), /bildirimi okunamıyor/],
      ['sınırı aşan değişiklik listesi', paketKur(anahtar, YUK, { degisiklikler: Array.from({ length: AZAMI_DEGISIKLIK + 1 }, () => 'x') }), /bildirimi okunamıyor/],
      ['paket olmayan dosya', Buffer.from('%PDF-1.7 deneme'), /güncelleme paketi değil/],
    ];
    for (const [ad, paket, ileti] of durumlar) {
      const cevap = await bitir(await hepsiniGonder(paket));
      assert.equal(cevap.statusCode, 422, `${ad}: ${cevap.body}`);
      assert.match((cevap.json() as { mesaj: string }).mesaj, ileti, ad);
      assert.deepEqual(await yuklemeler(), [], `${ad}: reddedilen yükleme silindi`);
    }
    assert.deepEqual(((await liste()).json() as GuncellemePaketleriCevabi).paketler, []);
  });

  test('parça içeriği denetim kaydına girmez; kişi, yol ve gövdenin özeti girer', async () => {
    const paket = paketKur(anahtar, YUK);
    const kimlik = await hepsiniGonder(paket);
    const kayitlar = await vt().sorgu<{ kisi_id: number; parametre: unknown; govde: Record<string, unknown> }>(
      "SELECT kisi_id, parametre, govde FROM denetim_kaydi WHERE yol = '/guncelleme/yuklemeler/:kimlik/parca' AND parametre->>'kimlik' = $1 ORDER BY id",
      [kimlik],
    );
    assert.equal(kayitlar.length, Math.ceil(paket.length / GUNCELLEME_PARCASI));
    for (const k of kayitlar) {
      assert.equal(k.kisi_id, yoneticiId);
      assert.deepEqual(k.parametre, { kimlik });
      assert.deepEqual(Object.keys(k.govde), ['_ozet']);
    }
  });

  test('eksik parçayla bitirilemez; başkasının yüklemesine parça eklenemez ve o yükleme bitirilemez', async () => {
    const paket = paketKur(anahtar, YUK);
    const kimlik = randomUUID();
    assert.equal((await parca(kimlik, paket, 0)).statusCode, 200);
    const eksik = await bitir(kimlik);
    assert.equal(eksik.statusCode, 422, eksik.body);
    assert.equal((await parca(kimlik, paket, 1, ikinciYonetici)).statusCode, 404);
    assert.equal((await bitir(kimlik, ikinciYonetici)).statusCode, 404);
    assert.equal((await parca(kimlik, paket, 1)).statusCode, 200);
    assert.equal((await parca(kimlik, paket, 2)).statusCode, 200);
    assert.equal((await bitir(kimlik)).statusCode, 200);
  });

  test('aynı sürüm ikinci kez yüklenemez; boyu sırasına uymayan parça ve bozuk kimlik reddedilir', async () => {
    const paket = paketKur(anahtar, YUK);
    assert.equal((await bitir(await hepsiniGonder(paket))).statusCode, 200);
    const ikinci = await bitir(await hepsiniGonder(paket));
    assert.equal(ikinci.statusCode, 409, ikinci.body);
    const kisa = await istek(yonetici, 'POST', `/guncelleme/yuklemeler/${randomUUID()}/parca`, { boyut: paket.length, sira: 0, veri: 'AAAA' });
    assert.equal(kisa.statusCode, 400, kisa.body);
    const bozukKimlik = await istek(yonetici, 'POST', '/guncelleme/yuklemeler/..%2Fdisari/parca', { boyut: 3, sira: 0, veri: 'AAAA' });
    assert.equal(bozukKimlik.statusCode, 400, bozukKimlik.body);
  });

  test('aynı anda en çok üç açık yükleme vardır; dördüncü reddedilir', async () => {
    const paket = paketKur(anahtar, YUK);
    for (let i = 0; i < 3; i++) assert.equal((await parca(randomUUID(), paket, 0)).statusCode, 200);
    const dorduncu = await parca(randomUUID(), paket, 0);
    assert.equal(dorduncu.statusCode, 429, dorduncu.body);
  });

  test('dizin ya da anahtar yoksa kanal kapalıdır: liste boş döner, yükleme reddedilir', async () => {
    const paket = paketKur(anahtar, YUK);
    const durumlar: [string, () => void, string][] = [
      ['dizin yok', () => { delete process.env['TMIV2_GUNCELLEME_DIZINI']; }, 'dizin-yok'],
      ['göreli dizin', () => { process.env['TMIV2_GUNCELLEME_DIZINI'] = 'guncelleme'; }, 'dizin-yok'],
      ['anahtar yok', () => { delete process.env['TMIV2_GUNCELLEME_ANAHTARI']; }, 'anahtar-yok'],
      ['bozuk anahtar', () => { process.env['TMIV2_GUNCELLEME_ANAHTARI'] = 'AAAA'; }, 'anahtar-gecersiz'],
    ];
    for (const [ad, kur, kanal] of durumlar) {
      process.env['TMIV2_GUNCELLEME_DIZINI'] = dizin;
      process.env['TMIV2_GUNCELLEME_ANAHTARI'] = ortakAnahtarMetni(ortak);
      kur();
      assert.deepEqual((await liste()).json(), {
        kanal, paketler: [], guncelleyici: false, calisan: { commit: null, surum: null, tarih: null }, bekleyen: null, uygulaniyor: null,
        surumler: [], sonUygulama: null, gecmis: [], yedek: { dizin: null, hazir: false },
      }, ad);
      assert.equal((await parca(randomUUID(), paket, 0)).statusCode, 422, ad);
    }
    assert.deepEqual(await yuklemeler(), []);
  });

  // Kart #1210: Uygula sunucuda yalnız isteği yazar; kurulumu güncelleyici yapar.
  const uygula = (commit: string, cerez: string | null = yonetici) => istek(cerez, 'POST', `/guncelleme/paketler/${commit}/uygula`, {});
  const yeniCommit = (harf: string) => harf.repeat(40);
  async function paketYukleTamam(degis: Record<string, unknown>): Promise<void> {
    const cevap = await bitir(await hepsiniGonder(paketKur(anahtar, YUK, { gocler: GERCEK_GOCLER, ...degis })));
    assert.equal(cevap.statusCode, 200, cevap.body);
  }
  // Sunucunun yazdığı istek dosyası; kaynak dosya değildir.
  const istekDosyasi = async (): Promise<Record<string, unknown>> =>
    JSON.parse((await saklananBaytlar(path.join(dizin, UYGULAMA_ISTEGI_DOSYASI))).toString('utf8')) as Record<string, unknown>;
  // pid: güncelleyici süreci; testte yaşayan süreç bu testin kendisidir.
  const guncelleyiciKur = (pid: number) => writeFile(path.join(dizin, GUNCELLEYICI_DOSYASI), JSON.stringify({ pid }));
  const listePaketi = async (commit: string) =>
    ((await liste()).json() as GuncellemePaketleriCevabi).paketler.find((p) => p.commit === commit);

  test('uygulama isteği yalnız güncelleyiciyle açılan sunucuda ve yalnız yöneticiden yazılır; ikinci istek bekleyen varken reddedilir', async () => {
    const commit = yeniCommit('b');
    await paketYukleTamam({ commit });
    for (const { rol, cerez } of bayraksizlar) assert.equal((await uygula(commit, cerez)).statusCode, 403, rol.ad);
    assert.equal((await uygula(commit, null)).statusCode, 401);
    const yoksa = await uygula(commit);
    assert.equal(yoksa.statusCode, 422, yoksa.body);
    assert.match(yoksa.body, /güncelleyiciyle açılmadı/);
    // Süreç numarası yaşayan bir sürece ait değil (artık dosya): güncelleyici yok sayılır.
    await guncelleyiciKur(2 ** 30);
    assert.equal((await uygula(commit)).statusCode, 422);
    assert.equal(((await liste()).json() as GuncellemePaketleriCevabi).guncelleyici, false);
    assert.equal((await readdir(dizin)).includes(UYGULAMA_ISTEGI_DOSYASI), false, 'güncelleyicisiz istek yazılmaz');

    await guncelleyiciKur(process.pid);
    const cevap = await uygula(commit);
    assert.equal(cevap.statusCode, 200, cevap.body);
    const yazilan = await istekDosyasi();
    assert.deepEqual(yazilan, cevap.json());
    assert.equal(yazilan['commit'], commit);
    assert.equal(yazilan['isteyenId'], yoneticiId, 'isteyen oturumdan');
    assert.equal(Math.abs(new Date(String(yazilan['istenme'])).getTime() - Date.now()) < 60_000, true, 'zaman sunucudan');
    const okunan = (await liste()).json() as GuncellemePaketleriCevabi;
    assert.equal(okunan.guncelleyici, true);
    assert.deepEqual(okunan.bekleyen, yazilan);

    const ikinci = await uygula(commit, ikinciYonetici);
    assert.equal(ikinci.statusCode, 409, ikinci.body);
    assert.equal((await istekDosyasi())['isteyenId'], yoneticiId, 'ilk istek ezilmez');
  });

  test('güncelleme uygulanırken yeni istek 409 alır ve yazılmaz; uygulama bitince aynı istek kabul edilir', async () => {
    await guncelleyiciKur(process.pid);
    const suren = yeniCommit('7');
    const yeni = yeniCommit('8');
    await paketYukleTamam({ commit: yeni });
    // Güncelleyici isteği almış: istek dosyası silinmiş, "uygulanıyor" işareti duruyor.
    await writeFile(path.join(dizin, UYGULANIYOR_DOSYASI), JSON.stringify({ commit: suren, isteyenId: yoneticiId, istenme: '2026-10-14T09:00:00.000Z' }));
    for (const cerez of [yonetici, ikinciYonetici]) {
      const cevap = await uygula(yeni, cerez);
      assert.equal(cevap.statusCode, 409, cevap.body);
      assert.match((cevap.json() as { mesaj: string }).mesaj, /uygulanıyor/);
    }
    assert.equal((await readdir(dizin)).includes(UYGULAMA_ISTEGI_DOSYASI), false, 'süren uygulamada istek yazılmaz');
    assert.equal(((await liste()).json() as GuncellemePaketleriCevabi).bekleyen, null);

    await rm(path.join(dizin, UYGULANIYOR_DOSYASI));
    const cevap = await uygula(yeni);
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.equal((await istekDosyasi())['commit'], yeni);
  });

  test('yedek klasörü yoksa ya da sunucuda bulunmuyorsa uygulama isteği 422 alır ve yazılmaz; listede yedek durumu görünür', async () => {
    await guncelleyiciKur(process.pid);
    const commit = yeniCommit('9');
    await paketYukleTamam({ commit });
    assert.deepEqual(((await liste()).json() as GuncellemePaketleriCevabi).yedek, { dizin: path.join(dizin, 'yedek'), hazir: true });
    delete process.env['TMIV2_YEDEK_DIZINI'];
    const yoksa = await uygula(commit);
    assert.equal(yoksa.statusCode, 422, yoksa.body);
    assert.match((yoksa.json() as { mesaj: string }).mesaj, /Yedek klasörü yok.*Sistem Ayarları > Yedekler/);
    assert.deepEqual(((await liste()).json() as GuncellemePaketleriCevabi).yedek, { dizin: null, hazir: false });
    // Ekrandan seçilen klasör ortamdan önce gelir; sunucuda yoksa yine reddedilir.
    const secilen = path.join(dizin, 'secilen');
    await writeFile(path.join(dizin, YEDEK_DIZINI_DOSYASI), JSON.stringify({ dizin: secilen }));
    assert.equal((await uygula(commit)).statusCode, 422);
    assert.deepEqual(((await liste()).json() as GuncellemePaketleriCevabi).yedek, { dizin: secilen, hazir: false });
    assert.equal((await readdir(dizin)).includes(UYGULAMA_ISTEGI_DOSYASI), false, 'yedeksiz istek yazılmaz');
    await mkdir(secilen);
    const cevap = await uygula(commit);
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.equal((await istekDosyasi())['commit'], commit);
  });

  test('çalışan sürüm, uygulanmış göçü taşımayan ve çalışandan eski paket uygulanamaz; yüklenmemiş paket 404', async () => {
    await guncelleyiciKur(process.pid);
    const calisan = yeniCommit('c');
    await writeFile(path.join(dizin, CALISAN_SURUM_DOSYASI), JSON.stringify({ commit: calisan, surum: '2026.10.14-1', tarih: '2026-10-14T08:00:00.000Z' }));
    const yeni = yeniCommit('d');
    const eksik = yeniCommit('e');
    const eski = yeniCommit('f');
    await paketYukleTamam({ commit: calisan, tarih: '2026-10-14T08:00:00.000Z' });
    await paketYukleTamam({ commit: yeni, tarih: '2026-10-15T08:00:00.000Z' });
    await paketYukleTamam({ commit: eksik, tarih: '2026-10-15T08:00:00.000Z', gocler: GERCEK_GOCLER.slice(1) });
    await paketYukleTamam({ commit: eski, tarih: '2026-10-13T08:00:00.000Z' });

    const beklenen: [string, string | null][] = [
      [calisan, UYGULAMA_REDDI_ILETISI.calisanSurum], [eksik, UYGULAMA_REDDI_ILETISI.eksikGoc], [eski, UYGULAMA_REDDI_ILETISI.eskiSurum],
      [yeni, null],
    ];
    for (const [commit, ileti] of beklenen) {
      assert.equal((await listePaketi(commit))?.uygulanamaz, ileti, commit);
      if (ileti === null) continue;
      const cevap = await uygula(commit);
      assert.equal(cevap.statusCode, 422, cevap.body);
      assert.equal((cevap.json() as { mesaj: string }).mesaj, ileti);
    }
    assert.equal((await readdir(dizin)).includes(UYGULAMA_ISTEGI_DOSYASI), false, 'reddedilen istek yazılmaz');
    assert.equal((await uygula(yeniCommit('0'))).statusCode, 404);
    assert.equal((await uygula('..%2Fdisari')).statusCode, 400);
    assert.equal((await uygula(yeni)).statusCode, 200);
    assert.deepEqual(((await liste()).json() as GuncellemePaketleriCevabi).calisan, { commit: calisan, surum: '2026.10.14-1', tarih: '2026-10-14T08:00:00.000Z' });
  });

  test('güncelleyici dosyası yoksa çalışan commit ortamdandır; son uygulamanın sonucu listede döner, bozuk dosya yok sayılır', async () => {
    process.env['TMIV2_COMMIT'] = COMMIT;
    await paketYukleTamam({ commit: COMMIT });
    assert.equal((await listePaketi(COMMIT))?.uygulanamaz, UYGULAMA_REDDI_ILETISI.calisanSurum);
    const sonuc = {
      commit: COMMIT, surum: '0.1.0', sonuc: 'geri-alindi', adim: 'goc', hata: 'göç hata verdi',
      baslangic: '2026-10-14T08:00:00.000Z', bitis: '2026-10-14T08:05:00.000Z',
    };
    await writeFile(path.join(dizin, UYGULAMA_SONUCU_DOSYASI), JSON.stringify(sonuc));
    assert.deepEqual(((await liste()).json() as GuncellemePaketleriCevabi).sonUygulama, sonuc);
    await writeFile(path.join(dizin, UYGULAMA_SONUCU_DOSYASI), '{bozuk');
    await writeFile(path.join(dizin, CALISAN_SURUM_DOSYASI), '{"commit": 1}');
    const okunan = (await liste()).json() as GuncellemePaketleriCevabi;
    assert.equal(okunan.sonUygulama, null);
    assert.deepEqual(okunan.calisan, { commit: COMMIT, surum: null, tarih: null });
  });

  test('değişiklik listesi çalışan sürümden başlamıyorsa atlanan yayın söylenir; uygulanamayan pakette söylenmez', async () => {
    await writeFile(path.join(dizin, CALISAN_SURUM_DOSYASI), JSON.stringify({ commit: yeniCommit('c'), surum: '2026.10.28-3', tarih: '2026-10-28T08:00:00.000Z' }));
    const tam = yeniCommit('d');
    const atlayan = yeniCommit('e');
    const eskiBicim = yeniCommit('f');
    const eski = yeniCommit('0');
    await paketYukleTamam({ commit: tam, tarih: '2026-10-29T08:00:00.000Z', oncekiYayin: '2026.10.28-3' });
    await paketYukleTamam({ commit: atlayan, tarih: '2026-10-30T08:00:00.000Z', oncekiYayin: '2026.10.29-1' });
    await paketYukleTamam({ commit: eskiBicim, tarih: '2026-10-30T09:00:00.000Z' });
    await paketYukleTamam({ commit: eski, tarih: '2026-10-27T08:00:00.000Z', oncekiYayin: '2026.10.26-1' });
    assert.equal((await listePaketi(tam))?.atlama, null);
    assert.equal((await listePaketi(atlayan))?.oncekiYayin, '2026.10.29-1');
    assert.equal(
      (await listePaketi(atlayan))?.atlama,
      'Değişiklikler 2026.10.29-1 sonrasını gösterir; çalışan 2026.10.28-3. Aradaki yayınların değişiklikleri listede yok.',
    );
    assert.equal((await listePaketi(eskiBicim))?.atlama, null, 'önceki yayını taşımayan eski paket');
    assert.equal((await listePaketi(eski))?.uygulanamaz, UYGULAMA_REDDI_ILETISI.eskiSurum);
    assert.equal((await listePaketi(eski))?.atlama, null);

    await writeFile(path.join(dizin, CALISAN_SURUM_DOSYASI), JSON.stringify({ commit: yeniCommit('c'), surum: null, tarih: '2026-10-28T08:00:00.000Z' }));
    assert.match((await listePaketi(tam))?.atlama ?? '', /çalışan sürümün yayın adı bilinmiyor/);
  });

  test('uygulama geçmişi yeniden eskiye döner; bozuk satır atlanır, dosya yoksa boş', async () => {
    assert.deepEqual(((await liste()).json() as GuncellemePaketleriCevabi).gecmis, []);
    const kayit = (surum: string, onceki: string | null, sonuc: 'kuruldu' | 'geri-alindi') => ({
      commit: COMMIT, surum, sonuc, adim: sonuc === 'kuruldu' ? null : 'goc', hata: sonuc === 'kuruldu' ? null : 'göç hata verdi',
      baslangic: '2026-10-28T08:00:00.000Z', bitis: '2026-10-28T08:05:00.000Z', onceki,
    });
    const ilk = kayit('2026.10.28-1', null, 'kuruldu');
    const ikinci = kayit('2026.10.28-3', '2026.10.28-1', 'geri-alindi');
    const ucuncu = kayit('2026.10.28-3', '2026.10.28-1', 'kuruldu');
    await writeFile(path.join(dizin, UYGULAMA_GECMISI_DOSYASI),
      [ilk, ikinci].map((k) => JSON.stringify(k)).join('\n') + '\n{yarim\n' + JSON.stringify({ surum: 1 }) + '\n' + JSON.stringify(ucuncu) + '\n');
    assert.deepEqual(((await liste()).json() as GuncellemePaketleriCevabi).gecmis, [ucuncu, ikinci, ilk]);
  });

  test('kurulu sürümler listelenir; eski paket ve sürüm silinir, çalışan, bekleyen ve kurulan silinmez; yalnız yönetici siler', async () => {
    await guncelleyiciKur(process.pid);
    const calisan = yeniCommit('1');
    const eski = yeniCommit('2');
    const kurulan = yeniCommit('3');
    const bekleyen = yeniCommit('4');
    await writeFile(path.join(dizin, CALISAN_SURUM_DOSYASI), JSON.stringify({ commit: calisan, surum: '2026.10.14-1', tarih: '2026-10-14T08:00:00.000Z' }));
    await paketYukleTamam({ commit: calisan, tarih: '2026-10-14T08:00:00.000Z' });
    await paketYukleTamam({ commit: kurulan, tarih: '2026-10-15T08:00:00.000Z' });
    await paketYukleTamam({ commit: bekleyen, tarih: '2026-10-16T08:00:00.000Z' });
    for (const c of [calisan, eski, kurulan, bekleyen]) await mkdir(path.join(dizin, SURUMLER_KLASORU, c, 'sunucu'), { recursive: true });
    // Güncelleyicinin yarım klasörü ve başka adlar sürüm sayılmaz.
    await mkdir(path.join(dizin, SURUMLER_KLASORU, `${kurulan}.yarim`));
    await writeFile(path.join(dizin, UYGULANIYOR_DOSYASI), JSON.stringify({ commit: kurulan, isteyenId: yoneticiId, istenme: '2026-10-14T09:00:00.000Z' }));
    await writeFile(path.join(dizin, UYGULAMA_ISTEGI_DOSYASI), JSON.stringify({ commit: bekleyen, isteyenId: yoneticiId, istenme: '2026-10-14T09:01:00.000Z' }));

    const okunan = (await liste()).json() as GuncellemePaketleriCevabi;
    assert.equal(okunan.uygulaniyor?.commit, kurulan);
    assert.deepEqual(okunan.surumler.map((x) => [x.commit, x.surum, x.calisan, x.silinemez]), [
      [calisan, '0.1.0', true, SILME_REDDI_ILETISI.calisan],
      [bekleyen, '0.1.0', false, SILME_REDDI_ILETISI.bekleyen],
      [kurulan, '0.1.0', false, SILME_REDDI_ILETISI.uygulaniyor],
      [eski, null, false, null],
    ]);
    assert.deepEqual(new Map(okunan.paketler.map((p) => [p.commit, p.silinemez])), new Map([
      [bekleyen, SILME_REDDI_ILETISI.bekleyen], [kurulan, SILME_REDDI_ILETISI.uygulaniyor], [calisan, null],
    ]));

    const sil = (tur: 'paketler' | 'surumler', commit: string, cerez: string | null = yonetici) =>
      istek(cerez, 'POST', `/guncelleme/${tur}/${commit}/sil`, {});
    for (const { rol, cerez } of bayraksizlar) assert.equal((await sil('surumler', eski, cerez)).statusCode, 403, rol.ad);
    assert.equal((await sil('surumler', eski, null)).statusCode, 401);
    for (const [tur, commit, ileti] of [
      ['surumler', calisan, SILME_REDDI_ILETISI.calisan], ['surumler', kurulan, SILME_REDDI_ILETISI.uygulaniyor],
      ['surumler', bekleyen, SILME_REDDI_ILETISI.bekleyen], ['paketler', kurulan, SILME_REDDI_ILETISI.uygulaniyor],
      ['paketler', bekleyen, SILME_REDDI_ILETISI.bekleyen],
    ] as const) {
      const cevap = await sil(tur, commit);
      assert.equal(cevap.statusCode, 422, `${tur} ${commit}`);
      assert.equal((cevap.json() as { mesaj: string }).mesaj, ileti);
    }
    assert.equal((await sil('surumler', yeniCommit('5'))).statusCode, 404);
    assert.equal((await sil('paketler', eski)).statusCode, 404, 'paketi hiç yüklenmemiş');
    assert.equal((await sil('surumler', '..%2F..%2Fdisari')).statusCode, 400);

    assert.equal((await sil('surumler', eski)).statusCode, 200);
    assert.equal((await sil('paketler', calisan)).statusCode, 200, 'çalışan sürümün paketi kurulumda kullanılmaz');
    const kalan = (await liste()).json() as GuncellemePaketleriCevabi;
    assert.deepEqual(kalan.surumler.map((x) => x.commit).sort(), [bekleyen, calisan, kurulan].sort());
    assert.equal(kalan.surumler.find((x) => x.calisan)?.surum, null, 'paketi silinen sürümün adı bilinmez');
    assert.equal(kalan.paketler.some((p) => p.commit === calisan), false);
    assert.equal((await readdir(path.join(dizin, 'paketler'))).some((ad) => ad.startsWith(calisan)), false, 'iki dosya da silinir');
    assert.equal((await readdir(path.join(dizin, SURUMLER_KLASORU))).includes(`${kurulan}.yarim`), true, 'yarım klasöre dokunulmaz');
  });
});
