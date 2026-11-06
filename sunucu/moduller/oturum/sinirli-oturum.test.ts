import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { kullaniciSemasi } from '#paylasilan/kullanici.ts';
import { ortakCihazKaydetCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from './disari.ts';
import {
  AZAMI_SN, CIHAZ_CEREZI, SINIRLI_AZAMI_SN, SINIRLI_BOSTA_SN, SINIRLI_ORTAK_CIHAZ, oturumCerezSn, sinirliOturumGecerMi,
} from './kurallar.ts';

// Kart 2158 (2158-1 a, 2158-5 a, 2158-6 c): sınırlı hesabın oturumu ve çekirdek kapısı uçtan uca. Kişi adları uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('sınırlı hesap oturumu, saf kurallar', () => {
  test('30 dk boşta ya da 8 saat açık kalan oturum ve kayıtlı cihaz geçmez', () => {
    const gecer = (bostaGecenSn: number, acikGecenSn: number, kayitliCihaz = false) => sinirliOturumGecerMi({ bostaGecenSn, acikGecenSn, kayitliCihaz });
    assert.equal(gecer(SINIRLI_BOSTA_SN - 1, SINIRLI_AZAMI_SN - 1), true);
    assert.equal(gecer(SINIRLI_BOSTA_SN, 10), false);
    assert.equal(gecer(10, SINIRLI_AZAMI_SN), false);
    assert.equal(gecer(10, 10, true), false);
  });

  test('çerez ömrü sınırlı hesapta 8 saat, iç hesapta değişmez', () => {
    assert.equal(oturumCerezSn({ id: 1, ad: 'a', islemler: [] }), AZAMI_SN);
    assert.equal(oturumCerezSn({ id: 1, ad: 'a', islemler: [], sinirli: { bitis: '2099-01-01', taahhut: true } }), SINIRLI_AZAMI_SN);
  });
});

describe('sınırlı hesap oturumu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let ipSayaci = 0;
  let yoneticiId = 0;
  let denetciId = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const yeniIp = (): string => { ipSayaci += 1; return `10.7.${ipSayaci >> 8}.${ipSayaci & 255}`; };

  async function iste(cerez: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown) {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: cerez }, remoteAddress: yeniIp(), ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as Record<string, unknown>, basliklar: c.headers };
  }
  async function giris(kullaniciAdi: string, cihaz: string | null = null) {
    const c = await app.inject({
      method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA }, remoteAddress: yeniIp(),
      headers: cihaz ? { cookie: `${CIHAZ_CEREZI}=${cihaz}` } : {},
    });
    const setCookie = String(c.headers['set-cookie'] ?? '');
    return { durum: c.statusCode, govde: c.json() as Record<string, unknown>, cerez: setCookie.split(';')[0] ?? '', setCookie };
  }
  const ben = async (cerez: string) => {
    const c = await iste(cerez, 'GET', '/oturum');
    assert.equal(c.durum, 200);
    const k = c.govde['kullanici'];
    return k === null ? null : kullaniciSemasi.parse(k);
  };
  const sonOturum = (kisiId: number) => o().vt.tek<{ id: number }>('SELECT id FROM oturum WHERE kisi_id = $1 ORDER BY id DESC LIMIT 1', [kisiId]);

  before(async () => {
    ortam = await testVeritabaniKur('oturum_sinirli');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const roller = await ortam.vt.sorgu<{ id: number; kod: string }>("SELECT id, kod FROM rol WHERE kod IN ('yonetici', 'planlama_proje')");
    const rol = (kod: string): number => roller.find((r) => r.kod === kod)?.id ?? 0;
    await ortam.vt.tx(async (db) => {
      yoneticiId = await yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA });
      denetciId = await yoneticiOlustur(db, { ad: 'Deneme Denetci', kullaniciAdi: 'denetci', parola: PAROLA });
      await rolAta(db, yoneticiId, denetciId, rol('planlama_proje'));
      await rolAl(db, yoneticiId, denetciId, rol('yonetici'));
      // Rol dağıtımında yapılmış bir hata: sınırlı hesaba yazma işlemi de verilmiş. Çekirdek kapısı bunu da kapatmalı.
      await db.sorgu(
        "INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, 'kisiler.yaz', $2), ($1, 'belge-merkezi.oku', $2)", [denetciId, yoneticiId],
      );
      await db.sorgu(
        "UPDATE kisi SET hesap_turu = 'sinirli', sinirli_bitis = CURRENT_DATE + 30, sinirli_sorumlu_id = $2 WHERE id = $1",
        [denetciId, yoneticiId],
      );
    });
  });
  after(async () => { await ortam?.kaldir(); });

  test('girişte çerez 8 saatliktir; taahhüt onaylanmadan iç modül okunamaz, onaydan sonra okunur ama yazılamaz', async () => {
    const g = await giris('denetci');
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.match(g.setCookie, new RegExp(`Max-Age=${SINIRLI_AZAMI_SN}\\b`));
    const kullanici = kullaniciSemasi.parse(g.govde['kullanici']);
    const bitis = await o().vt.tek<{ t: string }>('SELECT sinirli_bitis::text AS t FROM kisi WHERE id = $1', [denetciId]);
    assert.deepEqual(kullanici.sinirli, { bitis: bitis?.t, taahhut: false });

    assert.equal((await iste(g.cerez, 'GET', '/kisiler')).durum, 403);
    const onay = await iste(g.cerez, 'POST', '/hesabim/gizlilik-taahhudu', { kabul: true });
    assert.equal(onay.durum, 200, JSON.stringify(onay.govde));
    assert.equal(kullaniciSemasi.parse(onay.govde['kullanici']).sinirli?.taahhut, true);

    assert.equal((await iste(g.cerez, 'GET', '/kisiler')).durum, 200);
    const yaz = await iste(g.cerez, 'POST', '/kisiler', { ad: 'Deneme Yeni' });
    assert.equal(yaz.durum, 403, JSON.stringify(yaz.govde));
    const sayi = await o().vt.tek<{ n: number }>("SELECT count(*)::int AS n FROM kisi WHERE ad = 'Deneme Yeni'");
    assert.equal(sayi?.n, 0);
  });

  test('taahhüt yalnız açık onayla ve yalnız sınırlı hesapta; iç hesap 422 alır', async () => {
    const d = await giris('denetci');
    assert.equal((await iste(d.cerez, 'POST', '/hesabim/gizlilik-taahhudu', { kabul: false })).durum, 400);
    const y = await giris('yonetici');
    assert.equal((await iste(y.cerez, 'POST', '/hesabim/gizlilik-taahhudu', { kabul: true })).durum, 422);
  });

  test('30 dk boşta kalan ya da 8 saati dolan oturum geçersizdir; iç hesabın aynı süredeki oturumu sürer', async () => {
    const d = await giris('denetci');
    const y = await giris('yonetici');
    const geriAl = (kisiId: number, alan: 'son_gorulme' | 'acildi', sn: number) =>
      o().vt.sorgu(`UPDATE oturum SET ${alan} = now() - make_interval(secs => $2) WHERE kisi_id = $1 AND kapandi IS NULL`, [kisiId, sn]);
    await geriAl(denetciId, 'son_gorulme', SINIRLI_BOSTA_SN + 5);
    await geriAl(yoneticiId, 'son_gorulme', SINIRLI_BOSTA_SN + 5);
    assert.equal(await ben(d.cerez), null);
    assert.notEqual(await ben(y.cerez), null);

    const d2 = await giris('denetci');
    await geriAl(denetciId, 'acildi', SINIRLI_AZAMI_SN + 5);
    assert.equal(await ben(d2.cerez), null);
  });

  test('kayıtlı ortak cihazda sınırlı hesap giremez ve oturum yazılmaz; açık oturum o cihazdan geçmez', async () => {
    const y = await giris('yonetici');
    const kayit = await iste(y.cerez, 'POST', '/oturum/ortak-cihazlar', { ad: 'Deneme ofis', profil: 'tam' });
    assert.equal(kayit.durum, 200, JSON.stringify(kayit.govde));
    ortakCihazKaydetCevabi.parse(kayit.govde);
    const set = ([] as string[]).concat((kayit.basliklar['set-cookie'] as string | string[] | undefined) ?? []);
    const cihaz = set.find((s) => s.startsWith(`${CIHAZ_CEREZI}=`))?.split(';')[0]?.slice(CIHAZ_CEREZI.length + 1) ?? '';
    assert.notEqual(cihaz, '');

    const once = await sonOturum(denetciId);
    const g = await giris('denetci', cihaz);
    assert.equal(g.durum, 403, JSON.stringify(g.govde));
    assert.equal(g.govde['mesaj'], SINIRLI_ORTAK_CIHAZ);
    assert.deepEqual(await sonOturum(denetciId), once);

    const kendi = await giris('denetci');
    assert.equal((await iste(`${kendi.cerez}; ${CIHAZ_CEREZI}=${cihaz}`, 'GET', '/oturum')).govde['kullanici'], null);
  });

  test('2158-6 c: okuma yetkisi olsa da sınırlı hesaba dosya verilmez; aynı uçta iç hesap kapıyı geçer (dosya yok: 404)', async () => {
    const yol = '/cizimler/1/revizyonlar/1/dosya';
    const d = await giris('denetci');
    const ret = await iste(d.cerez, 'GET', yol);
    assert.equal(ret.durum, 403, JSON.stringify(ret.govde));
    const y = await giris('yonetici');
    assert.equal((await iste(y.cerez, 'GET', yol)).durum, 404);
  });

  test('bitiş günü geçince giriş reddedilir ve açık oturum düşer', async () => {
    const acik = await giris('denetci');
    await o().vt.sorgu('UPDATE kisi SET sinirli_bitis = CURRENT_DATE - 1 WHERE id = $1', [denetciId]);
    assert.equal(await ben(acik.cerez), null);
    assert.equal((await giris('denetci')).durum, 401);
  });
});
