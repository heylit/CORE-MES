import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { cihazDurumuCevabi, ortakCihazKaydetCevabi, ortakCihazlarCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from './disari.ts';
import { CIHAZ_CEREZI, CIHAZ_CEREZ_SN } from './kurallar.ts';

// Kart #739, karar 738 a: ortak cihaz kaydı. Kişi ve cihaz adları uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('ortak cihaz (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let ipSayaci = 0;
  const oturumlar = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const yeniIp = (): string => { ipSayaci += 1; return `10.9.${ipSayaci >> 8}.${ipSayaci & 255}`; };
  const cihazCerezi = (basliklar: Record<string, unknown>): string | null => {
    const l = ([] as string[]).concat((basliklar['set-cookie'] as string | string[] | undefined) ?? []);
    return l.find((c) => c.startsWith(`${CIHAZ_CEREZI}=`)) ?? null;
  };

  // cihaz: tarayıcının taşıdığı cihaz çerezi değeri (yoksa kişisel cihaz).
  async function iste(kisi: string | null, yontem: 'GET' | 'POST', yol: string, cihaz: string | null = null, govde?: unknown) {
    const cerez = [kisi ? oturumlar.get(kisi) : null, cihaz ? `${CIHAZ_CEREZI}=${cihaz}` : null].filter(Boolean).join('; ');
    const basliklar: Record<string, string> = { cookie: cerez };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, remoteAddress: yeniIp(), ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as unknown, cihazCerezi: cihazCerezi(c.headers) };
  }
  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA }, remoteAddress: yeniIp() });
    assert.equal(c.statusCode, 200, c.body);
    oturumlar.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }
  async function kaydet(ad: string, cihaz: string | null = null) {
    const c = await iste('yonetici', 'POST', '/oturum/ortak-cihazlar', cihaz, { ad });
    const deger = c.cihazCerezi?.split(';')[0]?.slice(CIHAZ_CEREZI.length + 1) ?? null;
    return { ...c, belirtec: deger };
  }
  const durum = async (cihaz: string | null, kisi = 'yonetici') => {
    const c = await iste(kisi, 'GET', '/oturum/cihaz', cihaz);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return { ...cihazDurumuCevabi.parse(c.govde), cihazCerezi: c.cihazCerezi };
  };

  before(async () => {
    ortam = await testVeritabaniKur('ortak_cihaz');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    const rol = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'mudur'");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Mudur', kullaniciAdi: 'mudur', parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
    });
    await giris('mudur');
  });
  after(async () => { await ortam?.kaldir(); });

  test('kayıtsız cihaz kişiseldir; oturumsuz soru 401', async () => {
    assert.deepEqual(await durum(null), { ortak: false, id: null, ad: null, profil: 'tam', cihazCerezi: null });
    assert.equal((await iste(null, 'GET', '/oturum/cihaz')).durum, 401);
  });

  test('yönetici bu cihazı kaydeder: belirteç HttpOnly çerezde, veritabanında yalnız özeti; cihaz ortak sayılır', async () => {
    const k = await kaydet('Deneme tezgah tableti');
    assert.equal(k.durum, 200, JSON.stringify(k.govde));
    const { cihaz } = ortakCihazKaydetCevabi.parse(k.govde);
    assert.equal(cihaz.ad, 'Deneme tezgah tableti');
    assert.equal(cihaz.buCihaz, true);
    assert.ok(k.belirtec && k.belirtec.length >= 40);
    assert.match(k.cihazCerezi ?? '', new RegExp(`Max-Age=${CIHAZ_CEREZ_SN}; HttpOnly; SameSite=Strict`));
    const satirlar = await o().sahip.sorgu<{ belirtec_ozeti: string }>('SELECT belirtec_ozeti FROM oturum_ortak_cihaz');
    assert.ok(satirlar.every((s) => s.belirtec_ozeti !== k.belirtec));
    const d = await durum(k.belirtec);
    assert.deepEqual({ ortak: d.ortak, id: d.id, ad: d.ad }, { ortak: true, id: cihaz.id, ad: 'Deneme tezgah tableti' });
    assert.ok(d.cihazCerezi?.includes(`Max-Age=${CIHAZ_CEREZ_SN}`), 'kullanılan cihazın çerezi tazelenir');
    // cihaz kişiden bağımsızdır: başka kişi aynı cihazda girince de ortaktır
    assert.equal((await durum(k.belirtec, 'mudur')).ortak, true);
  });

  test('aynı cihaz ikinci kez, aynı adla başka cihaz ve boş ad kaydedilmez', async () => {
    const ilk = await kaydet('Deneme kalite bilgisayari');
    assert.equal(ilk.durum, 200);
    assert.equal((await kaydet('Baska ad', ilk.belirtec)).durum, 409);
    assert.equal((await kaydet('deneme KALITE bilgisayari')).durum, 409);
    assert.equal((await kaydet('   ')).durum, 400);
    assert.equal((await kaydet('x'.repeat(81))).durum, 400);
  });

  test('yalnız yönetici listeler, kaydeder ve iptal eder (müdür 403); durum sorusu herkese açık', async () => {
    assert.equal((await iste('mudur', 'GET', '/oturum/ortak-cihazlar')).durum, 403);
    assert.equal((await iste('mudur', 'POST', '/oturum/ortak-cihazlar', null, { ad: 'Deneme izinsiz' })).durum, 403);
    assert.equal((await iste('mudur', 'POST', '/oturum/ortak-cihazlar/1/kapat')).durum, 403);
    assert.equal((await durum(null, 'mudur')).ortak, false);
  });

  test('iptal: cihaz sonraki soruda kişisel sayılır ve bayat çerez silinir; iptal edilen yeniden iptal edilemez', async () => {
    const k = await kaydet('Deneme montaj tableti');
    const { cihaz } = ortakCihazKaydetCevabi.parse(k.govde);
    const liste = ortakCihazlarCevabi.parse((await iste('yonetici', 'GET', '/oturum/ortak-cihazlar')).govde);
    assert.ok(liste.cihazlar.some((c) => c.id === cihaz.id && !c.buCihaz));
    const kapat = await iste('yonetici', 'POST', `/oturum/ortak-cihazlar/${cihaz.id}/kapat`);
    assert.equal(kapat.durum, 200);
    assert.equal(kapat.cihazCerezi, null, 'başka cihazdan iptal bu cihazın çerezine dokunmaz');
    const d = await durum(k.belirtec);
    assert.equal(d.ortak, false);
    assert.match(d.cihazCerezi ?? '', /Max-Age=0/);
    assert.equal((await iste('yonetici', 'POST', `/oturum/ortak-cihazlar/${cihaz.id}/kapat`)).durum, 404);
    const sonra = ortakCihazlarCevabi.parse((await iste('yonetici', 'GET', '/oturum/ortak-cihazlar')).govde);
    assert.ok(!sonra.cihazlar.some((c) => c.id === cihaz.id));
    const satir = await o().sahip.tek<{ kapatan: number }>('SELECT kapatan_kisi_id AS kapatan FROM oturum_ortak_cihaz WHERE id = $1', [cihaz.id]);
    assert.equal(satir?.kapatan, yoneticiId);
    // iptal edilen adla yeni cihaz kaydedilebilir
    assert.equal((await kaydet('Deneme montaj tableti')).durum, 200);
  });

  test('cihaz kendini iptal edince çerezi silinir; çıkış cihaz çerezine dokunmaz', async () => {
    const k = await kaydet('Deneme depo tableti');
    const { cihaz } = ortakCihazKaydetCevabi.parse(k.govde);
    const cikis = await iste('mudur', 'POST', '/oturum/cikis', k.belirtec);
    assert.equal(cikis.cihazCerezi, null);
    await giris('mudur');
    assert.equal((await durum(k.belirtec, 'mudur')).ortak, true);
    const kapat = await iste('yonetici', 'POST', `/oturum/ortak-cihazlar/${cihaz.id}/kapat`, k.belirtec);
    assert.match(kapat.cihazCerezi ?? '', /Max-Age=0/);
  });
});
