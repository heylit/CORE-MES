import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { kisiSemasi } from '#paylasilan/sozlesme/kisiler.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from './disari.ts';
import { ILETILER, SINIRLI_EN_UZUN_GUN, gunEkle } from './kurallar.ts';

// Kart 2158 (2158-1 a, 2158-5 a): sınırlı hesabı yalnız rol yöneten açar ve uzatır; bitiş en çok 90 gün, sorumlu aktif iç hesap,
// bayraklı rol sınırlı hesaba verilmez. Kişi adları uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('sınırlı hesap: açma, uzatma, iç hesaba alma (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const oturumlar = new Map<string, string>();
  const kimlikler = new Map<string, number>();
  let ipSayaci = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const bugun = (): string => tesisGunu(new Date());
  const id = (ad: string): number => {
    const k = kimlikler.get(ad);
    if (k === undefined) throw new Error(`kişi yok: ${ad}`);
    return k;
  };

  async function iste(kisi: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown) {
    ipSayaci += 1;
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: oturumlar.get(kisi) ?? '' }, remoteAddress: `10.9.0.${ipSayaci & 255}`,
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as Record<string, unknown> };
  }
  async function giris(kullaniciAdi: string): Promise<void> {
    ipSayaci += 1;
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA }, remoteAddress: `10.9.1.${ipSayaci & 255}` });
    assert.equal(c.statusCode, 200, c.body);
    oturumlar.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }
  const surum = async (kisiId: number): Promise<number> =>
    (await o().vt.tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [kisiId]))?.surum ?? 0;
  const sinirliYap = async (aktor: string, kisi: string, govde: { bitis: string; sorumluId: number }) =>
    iste(aktor, 'POST', `/kisiler/${id(kisi)}/sinirli-hesap`, { ...govde, surum: await surum(id(kisi)) });

  before(async () => {
    ortam = await testVeritabaniKur('kisiler_sinirli_hesap');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const roller = await ortam.vt.sorgu<{ id: number; kod: string }>("SELECT id, kod FROM rol WHERE kod IN ('yonetici', 'planlama_proje')");
    const rol = (kod: string): number => roller.find((r) => r.kod === kod)?.id ?? 0;
    await ortam.vt.tx(async (db) => {
      const yonetici = await yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA });
      kimlikler.set('yonetici', yonetici);
      for (const ad of ['denetci', 'misafir', 'pasif', 'planlamaci']) {
        const yeni = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
        await rolAta(db, yonetici, yeni, rol('planlama_proje'));
        await rolAl(db, yonetici, yeni, rol('yonetici'));
        kimlikler.set(ad, yeni);
      }
      await db.sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [kimlikler.get('pasif')]);
    });
    kimlikler.set('rol:yonetici', rol('yonetici'));
    await giris('yonetici');
    await giris('planlamaci');
  });
  after(async () => { await ortam?.kaldir(); });

  test('rol yöneten sınırlı hesap açar; cevapta bitiş, sorumlu ve onaylanmamış taahhüt döner', async () => {
    const bitis = gunEkle(bugun(), 30);
    const c = await sinirliYap('yonetici', 'denetci', { bitis, sorumluId: id('yonetici') });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(kisiSemasi.parse(c.govde).sinirli, { bitis, sorumluId: id('yonetici'), taahhut: false });
    const liste = await iste('yonetici', 'GET', '/kisiler');
    const satirlar = (liste.govde['kisiler'] as { id: number; sinirli: unknown }[]);
    assert.equal(satirlar.find((k) => k.id === id('yonetici'))?.sinirli, null, 'iç hesap null döner');
  });

  test('rol yönetmeyen 403 alır, kişi kendini değiştiremez; durum değişmez', async () => {
    const bitis = gunEkle(bugun(), 10);
    assert.equal((await sinirliYap('planlamaci', 'misafir', { bitis, sorumluId: id('yonetici') })).durum, 403);
    const kendi = await sinirliYap('yonetici', 'yonetici', { bitis, sorumluId: id('planlamaci') });
    assert.equal(kendi.durum, 403);
    assert.equal(kendi.govde['mesaj'], ILETILER.sinirliKendi);
    const satir = await o().vt.tek<{ hesap_turu: string }>('SELECT hesap_turu FROM kisi WHERE id = $1', [id('misafir')]);
    assert.equal(satir?.hesap_turu, 'ic');
  });

  test('bitiş bugünden önce ya da 90 günden sonra olamaz; bugün ve tam 90 gün geçer', async () => {
    const red = async (bitis: string, ileti: string) => {
      const c = await sinirliYap('yonetici', 'misafir', { bitis, sorumluId: id('yonetici') });
      assert.equal(c.durum, 422, JSON.stringify(c.govde));
      assert.equal(c.govde['mesaj'], ileti);
    };
    await red(gunEkle(bugun(), -1), ILETILER.sinirliBitisGecmis);
    await red(gunEkle(bugun(), SINIRLI_EN_UZUN_GUN + 1), ILETILER.sinirliBitisUzun);
    assert.equal((await sinirliYap('yonetici', 'misafir', { bitis: bugun(), sorumluId: id('yonetici') })).durum, 200);
    assert.equal((await sinirliYap('yonetici', 'misafir', { bitis: gunEkle(bugun(), SINIRLI_EN_UZUN_GUN), sorumluId: id('yonetici') })).durum, 200);
  });

  test('sorumlu kişinin kendisi, pasif kişi ya da sınırlı hesap olamaz', async () => {
    const bitis = gunEkle(bugun(), 5);
    for (const sorumlu of ['planlamaci', 'pasif', 'denetci']) {
      const hedef = sorumlu === 'planlamaci' ? 'planlamaci' : 'misafir';
      const c = await sinirliYap('yonetici', hedef, { bitis, sorumluId: id(sorumlu) });
      assert.equal(c.durum, 422, `${sorumlu} ${JSON.stringify(c.govde)}`);
      assert.equal(c.govde['mesaj'], ILETILER.sinirliSorumlu);
    }
  });

  test('bayraklı rolü olan kişi sınırlı olamaz; sınırlı hesaba bayraklı rol atanamaz', async () => {
    const bitis = gunEkle(bugun(), 5);
    const yeniYonetici = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Ikinci', kullaniciAdi: 'ikinci', parola: PAROLA }));
    kimlikler.set('ikinci', yeniYonetici);
    const c = await sinirliYap('yonetici', 'ikinci', { bitis, sorumluId: id('yonetici') });
    assert.equal(c.durum, 422);
    assert.equal(c.govde['mesaj'], ILETILER.sinirliBayrakli);
    const ata = await iste('yonetici', 'POST', `/kisiler/${id('denetci')}/rol-ata`, { rolId: id('rol:yonetici'), surum: await surum(id('denetci')) });
    assert.equal(ata.durum, 422, JSON.stringify(ata.govde));
    assert.equal(ata.govde['mesaj'], ILETILER.sinirliBayrakli);
  });

  test('eski sürüm 409 alır; aynı komut bitişi uzatır ve onaylanmış taahhüdü korur', async () => {
    const eski = await iste('yonetici', 'POST', `/kisiler/${id('denetci')}/sinirli-hesap`, {
      bitis: gunEkle(bugun(), 40), sorumluId: id('yonetici'), surum: (await surum(id('denetci'))) - 1,
    });
    assert.equal(eski.durum, 409);
    await o().vt.sorgu('UPDATE kisi SET gizlilik_taahhudu = now() WHERE id = $1', [id('denetci')]);
    const uzat = await sinirliYap('yonetici', 'denetci', { bitis: gunEkle(bugun(), 60), sorumluId: id('planlamaci') });
    assert.equal(uzat.durum, 200);
    assert.deepEqual(kisiSemasi.parse(uzat.govde).sinirli, { bitis: gunEkle(bugun(), 60), sorumluId: id('planlamaci'), taahhut: true });
  });

  test('iç hesaba alma bitişi, sorumluyu ve taahhüdü siler; iç hesapta reddedilir', async () => {
    const c = await iste('yonetici', 'POST', `/kisiler/${id('misafir')}/ic-hesap`, { surum: await surum(id('misafir')) });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(kisiSemasi.parse(c.govde).sinirli, null);
    const tekrar = await iste('yonetici', 'POST', `/kisiler/${id('misafir')}/ic-hesap`, { surum: await surum(id('misafir')) });
    assert.equal(tekrar.durum, 422);
    assert.equal(tekrar.govde['mesaj'], ILETILER.sinirliDegil);
  });

  test('veritabanı kısıtı: sınırlı hesap bitişsiz ya da sorumlusuz, iç hesap bitişli yazılamaz', async () => {
    const yaz = (sql: string) => o().vt.sorgu(sql, [id('misafir')]);
    await assert.rejects(yaz("UPDATE kisi SET hesap_turu = 'sinirli' WHERE id = $1"), /kisi_sinirli_butun/);
    await assert.rejects(yaz("UPDATE kisi SET sinirli_bitis = CURRENT_DATE WHERE id = $1"), /kisi_sinirli_butun/);
    await assert.rejects(yaz("UPDATE kisi SET hesap_turu = 'misafir' WHERE id = $1"), /kisi_hesap_turu_secenek/);
  });
});
