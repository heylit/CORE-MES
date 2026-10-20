import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KmDegisiklikCevabi, KmKimlikCevabi, KmSurumCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// Kalite Merkezi'nde ayrı PIN girişi yoktur, giriş TMI oturumudur (kullanıcının yazılı onayı, 2026-10-16 06:37 UTC): "kullanici"
// kaydı PIN özeti taşımaz, "kullanici" ve "settings" kayıtlarını yalnız yönetici yazar.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const PAROLA = 'dogru-parola-1';
const PIN_OZETI = 'uydurma-pin-ozeti-0000';
type Yontem = 'GET' | 'POST';

const ROL_ISLEMLERI: [string, string[]][] = [
  ['kalite', ['kalite-merkezi.oku', 'kalite-merkezi.yaz']],
  ['mudur', ['kalite-merkezi.oku']],
];

describe('Kalite Merkezi PIN yok, TMI oturumu (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const c: Record<'yon' | 'kal' | 'mud' | 'opr', string> = { yon: '', kal: '', mud: '', opr: '' };
  const kimlikler: Record<'yon' | 'kal' | 'mud' | 'opr', number> = { yon: 0, kal: 0, mud: 0, opr: 0 };
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (cerezi: string, yontem: Yontem, url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerezi }, ...(govde === undefined ? {} : { payload: govde as object }) });
  async function tamam<T>(cerezi: string, yontem: Yontem, url: string, govde?: unknown): Promise<T> {
    const r = await istek(cerezi, yontem, url, govde);
    assert.equal(r.statusCode, 200, `${yontem} ${url}: ${r.body}`);
    return r.json() as T;
  }
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function girisYap(kullaniciAdi: string, rolKodu: string, aktor?: number): Promise<{ id: number; cerez: string }> {
    const yoneticiRolu = await rolId('yonetici');
    const hedef = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (hedef !== yoneticiRolu && aktor !== undefined) {
        await rolAta(db, aktor, yeni, hedef);
        await rolAl(db, aktor, yeni, yoneticiRolu);
      }
      return yeni;
    });
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return { id, cerez: String(r.headers['set-cookie']).split(';')[0] ?? '' };
  }
  const yaz = (cerezi: string, koleksiyon: string, kimlik: string, govde: Record<string, unknown>, surum: number | null = null) =>
    tamam<KmSurumCevabi>(cerezi, 'POST', `/kalite-merkezi/kayitlar/${koleksiyon}/${kimlik}/yaz`, { govde, surum });
  const akis = (cerezi: string, sonra = 0) => tamam<KmDegisiklikCevabi>(cerezi, 'GET', `/kalite-merkezi/degisiklikler?sonra=${sonra}`);
  const govdesi = (a: KmDegisiklikCevabi, koleksiyon: string, kimlik: string) =>
    a.degisiklikler.filter((d) => d.koleksiyon === koleksiyon && d.kimlik === kimlik).map((d) => d.govde);

  before(async () => {
    ortam = await testVeritabaniKur('km_pin');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    for (const [rol, islemler] of ROL_ISLEMLERI) {
      for (const islem of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ((SELECT id FROM rol WHERE kod = $1), $2) ON CONFLICT DO NOTHING', [rol, islem]);
    }
    const yon = await girisYap('pin-yon', 'yonetici');
    c.yon = yon.cerez;
    kimlikler.yon = yon.id;
    for (const [k, ad, rol] of [['kal', 'pin-kal', 'kalite'], ['mud', 'pin-mud', 'mudur'], ['opr', 'pin-opr', 'operator']] as const) {
      ({ cerez: c[k], id: kimlikler[k] } = await girisYap(ad, rol, yon.id));
    }
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('PIN yok: "kullanici" kaydının "pin" alanı saklanmaz; akış onu kimseye vermez', async () => {
    await yaz(c.yon, 'kullanici', 'u_okuma', { ad: 'Deneme Kullanıcı', rol: 'Muayeneci', pin: PIN_OZETI });
    for (const cerez of [c.yon, c.kal, c.mud]) {
      assert.deepEqual(govdesi(await akis(cerez), 'kullanici', 'u_okuma'), [{ ad: 'Deneme Kullanıcı', rol: 'Muayeneci' }]);
    }
    const satir = await vt().tek<{ govde: Record<string, unknown> }>("SELECT govde FROM kalite_merkezi_belge WHERE koleksiyon = 'kullanici' AND kimlik = 'u_okuma'");
    assert.equal(satir?.govde.pin, undefined);
    assert.equal((await istek(c.opr, 'GET', '/kalite-merkezi/degisiklikler')).statusCode, 403);
  });

  test('Yalnız yönetici: yazma yetkilisi "kullanici" ve "settings" kayıtlarını yazamaz ve silemez (403); öteki koleksiyonlara yazar', async () => {
    for (const koleksiyon of ['kullanici', 'settings'] as const) {
      const kimlik = `yetki_${koleksiyon}`;
      assert.equal((await istek(c.kal, 'POST', `/kalite-merkezi/kayitlar/${koleksiyon}/${kimlik}/yaz`, { govde: { a: 1 }, surum: null })).statusCode, 403);
      const ilk = await yaz(c.yon, koleksiyon, kimlik, { a: 1 });
      assert.equal((await istek(c.kal, 'POST', `/kalite-merkezi/kayitlar/${koleksiyon}/${kimlik}/yaz`, { govde: { a: 2 }, surum: ilk.surum })).statusCode, 403);
      assert.equal((await istek(c.kal, 'POST', `/kalite-merkezi/kayitlar/${koleksiyon}/${kimlik}/sil`, { surum: ilk.surum })).statusCode, 403);
      assert.deepEqual(govdesi(await akis(c.mud), koleksiyon, kimlik), [{ a: 1 }]);
      const ikinci = await yaz(c.yon, koleksiyon, kimlik, { a: 2 }, ilk.surum);
      const silinen = await tamam<KmSurumCevabi>(c.yon, 'POST', `/kalite-merkezi/kayitlar/${koleksiyon}/${kimlik}/sil`, { surum: ikinci.surum });
      assert.ok(silinen.surum > ikinci.surum);
      assert.deepEqual(govdesi(await akis(c.mud, ikinci.surum), koleksiyon, kimlik), [null]);
    }
    await yaz(c.kal, 'ncr', 'n_yetki', { no: 'NCR-Y1' });
    assert.deepEqual(govdesi(await akis(c.mud), 'ncr', 'n_yetki'), [{ no: 'NCR-Y1' }]);
  });

  test('PIN yok: geri yükleme "kullanici" kaydını yedekteki "pin" alanı olmadan yazar; geri yükleme işlemi yalnız yöneticide', async () => {
    const yedek = {
      baslangic: null, son: false,
      belgeler: [
        { koleksiyon: 'kullanici', kimlik: 'u_gy', govde: { ad: 'Yedek Kullanıcı', pin: PIN_OZETI } },
        { koleksiyon: 'settings', kimlik: 'ayar_gy', govde: { firma: 'Deneme' } },
      ],
    };
    assert.equal((await istek(c.kal, 'POST', '/kalite-merkezi/geri-yukle', yedek)).statusCode, 403);
    await tamam(c.yon, 'POST', '/kalite-merkezi/geri-yukle', yedek);
    const a = await akis(c.mud);
    assert.deepEqual(govdesi(a, 'kullanici', 'u_gy'), [{ ad: 'Yedek Kullanıcı' }]);
    assert.deepEqual(govdesi(a, 'settings', 'ayar_gy'), [{ firma: 'Deneme' }]);
  });

  test('Geri yüklemenin son parçası yedekte olmayan "kullanici" ve "settings" kayıtlarını siler (yalnız "iz" korunur)', async () => {
    await yaz(c.yon, 'kullanici', 'u_eski', { ad: 'Eski Kullanıcı' });
    await yaz(c.yon, 'settings', 'ayar_eski', { firma: 'Eski' });
    await yaz(c.kal, 'iz', 'iz_pin', { islem: 'kayıt' });
    await tamam(c.yon, 'POST', '/kalite-merkezi/geri-yukle', { baslangic: null, son: true, belgeler: [{ koleksiyon: 'ncr', kimlik: 'n_pin', govde: { no: 'NCR-P1' } }] });
    const a = await akis(c.mud);
    assert.deepEqual(govdesi(a, 'ncr', 'n_pin'), [{ no: 'NCR-P1' }]);
    assert.deepEqual(govdesi(a, 'kullanici', 'u_eski'), [null]);
    assert.deepEqual(govdesi(a, 'settings', 'ayar_eski'), [null]);
    assert.deepEqual(govdesi(a, 'iz', 'iz_pin'), [{ islem: 'kayıt' }]);
  });

  test('Kimlik: uygulama girişi TMI oturumundandır; yönetici bayrağı ve kişi listesi yalnız yöneticiye', async () => {
    const yon = await tamam<KmKimlikCevabi>(c.yon, 'GET', '/kalite-merkezi/kimlik');
    assert.equal(yon.kisi.id, kimlikler.yon);
    assert.equal(yon.kisi.ad, 'Deneme pin-yon');
    assert.equal(yon.yonetici, true);
    assert.equal(yon.onaylayabilir, true);
    assert.ok(yon.kisiler.some((k) => k.id === kimlikler.kal && k.ad === 'Deneme pin-kal'));
    const kal = await tamam<KmKimlikCevabi>(c.kal, 'GET', '/kalite-merkezi/kimlik');
    assert.deepEqual(kal, { kisi: { id: kimlikler.kal, ad: 'Deneme pin-kal' }, yonetici: false, kisiler: [], onaylayabilir: true });
    // Onay düğmesi onay işlemine bağlıdır: kalite onaylar (kullanıcı kararı 160 a), operatör onaylamaz.
    assert.equal((await istek(c.opr, 'GET', '/kalite-merkezi/kimlik')).statusCode, 403);
  });
});

describe('Kalite Merkezi PIN özetleri göçü var olan veritabanında (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let oncesi = '';
  let dahil = '';

  before(async () => {
    ortam = await testSemasiAc('km_pin_goc');
    oncesi = await mkdtemp(join(tmpdir(), 'tmiv2-km-pin-'));
    dahil = await mkdtemp(join(tmpdir(), 'tmiv2-km-pind-'));
  });
  after(async () => {
    for (const klasor of [oncesi, dahil]) if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('göç yalnız "kullanici" kayıtlarından "pin" alanını siler ve onlara yeni sürüm verir; öteki alanlar ve kayıtlar aynı kalır', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.findIndex((ad) => ad.endsWith('_kalite_merkezi_pin_ozetleri_sil.sql'));
    assert.equal(sira > 0, true, 'PIN özetleri göçü bulunamadı');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GOC_KLASORU, ad), join(oncesi, ad));
    // Sonraki göçler bu kayıtlara dokunabilir; ölçülen yalnız bu göçtür.
    for (const ad of hepsi.slice(0, sira + 1)) await copyFile(join(GOC_KLASORU, ad), join(dahil, ad));
    await gocleriUygula(ayar, oncesi, { sema });

    const kisi = (await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Eski Kişi') RETURNING id"))!.id;
    await vt.sorgu(
      `INSERT INTO kalite_merkezi_belge (koleksiyon, kimlik, govde, degistiren_id) VALUES
         ('kullanici', 'u_pinli', $2::jsonb, $1), ('kullanici', 'u_pinsiz', '{"ad":"B"}', $1),
         ('ncr', 'n_pin', '{"pin":"ncr-alani"}', $1), ('kullanici', 'u_silinmis', NULL, $1)`,
      [kisi, JSON.stringify({ ad: 'A', rol: 'Muayeneci', pin: PIN_OZETI })],
    );
    const satirlar = () => vt.sorgu<{ kimlik: string; govde: Record<string, unknown> | null; surum: number }>(
      'SELECT kimlik, govde, surum FROM kalite_merkezi_belge ORDER BY kimlik');
    const once = new Map((await satirlar()).map((s) => [s.kimlik, s]));

    await gocleriUygula(ayar, dahil, { sema });
    const sonra = new Map((await satirlar()).map((s) => [s.kimlik, s]));
    assert.deepEqual(sonra.get('u_pinli')?.govde, { ad: 'A', rol: 'Muayeneci' });
    assert.ok(Number(sonra.get('u_pinli')?.surum) > Number(once.get('u_pinli')?.surum));
    for (const kimlik of ['u_pinsiz', 'n_pin', 'u_silinmis']) assert.deepEqual(sonra.get(kimlik), once.get(kimlik), kimlik);
  });
});
