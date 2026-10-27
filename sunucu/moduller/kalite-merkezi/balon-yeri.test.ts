import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { KmBalon, KmResim, KmStudyoParcaCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { STUDYO_ILETILER, balonPlaniReddi, balonYeriReddi } from './kurallar.ts';
import { resimKaldir, resimMerkezdenEkle } from './studyo.ts';

// Balon yeri (894 a, 913 a): elle konan yer ve tek balon yerleşimi planı yeniden yazmadan kaydedilir; plan yazımı da yeri taşır.
const PAROLA = 'dogru-parola-1';

async function zincir(modul: string): Promise<OrnekVeriTanimi[]> {
  const hepsi = new Map((await modulOrnekVerileriniKesfet()).map((t) => [t.modul, t]));
  const secilen = new Map<string, OrnekVeriTanimi>();
  const ekle = (ad: string): void => {
    const t = hepsi.get(ad);
    if (!t || secilen.has(ad)) return;
    secilen.set(ad, t);
    t.gerekir.forEach(ekle);
  };
  ekle(modul);
  return [...secilen.values()];
}

describe('Balon yeri kuralı (saf)', () => {
  test('KM-S30 elle konan yer ile istenen yerleşim birlikte verilmez; plan da aynı kuralı uygular', () => {
    assert.equal(balonYeriReddi({ yer: [10, 20], yerKipi: null }), null);
    assert.equal(balonYeriReddi({ yer: null, yerKipi: 'serit' }), null);
    assert.equal(balonYeriReddi({ yer: null, yerKipi: null }), null);
    assert.equal(balonYeriReddi({ yer: [10, 20], yerKipi: 'yakin' }), 'balonYerIkisi');
    assert.equal(balonPlaniReddi({ girdiler: [{ no: 1, yer: [1, 2], yerKipi: 'serit' }], etkinler: [], acikNumunedekiler: new Set() }), 'balonYerIkisi');
  });
});

describe('Balon yeri (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonId = 0;
  let yonetici = '';
  let kalite = '';
  let yazar = '';
  let operator = '';
  let flans = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const oku = (cerez: string, url: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });
  const yaz = (cerez: string | null, url: string, govde: unknown, kimlik: string | null = randomUUID()): Promise<LightMyRequestResponse> => app.inject({
    method: 'POST', url: `/api${url}`, payload: govde as object,
    headers: { ...(cerez === null ? {} : { cookie: cerez }), ...(kimlik === null ? {} : { [ISTEK_KIMLIGI_BASLIGI]: kimlik }) },
  });
  const ileti = (r: LightMyRequestResponse): unknown => (r.json() as { mesaj?: unknown }).mesaj;

  async function girisYap(kullaniciAdi: string, rolKodu: string | null): Promise<string> {
    const rol = async (kod: string) => (await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
    if (rolKodu !== null) {
      await o().vt.tx(async (db) => {
        const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
        await rolAta(db, yonId, yeni, await rol(rolKodu));
        await rolAl(db, yonId, yeni, await rol('yonetici'));
      });
    }
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function merkez<T>(yol: string, govde: unknown): Promise<T> {
    const c = await yaz(yonetici, yol, govde);
    assert.equal(c.statusCode, 200, c.body);
    return c.json() as T;
  }
  async function belgeAc(ad: string): Promise<number> {
    const icerik = Buffer.from(`%PDF-1.4\n% ${ad}\n%%EOF\n`), ozet = createHash('sha256').update(icerik).digest('hex');
    await merkez(`/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') });
    const b = await merkez<{ id: number; surum: number; revizyonlar: { id: number }[] }>('/cizimler', { ad, tur: 'teknik-resim', ozet, dosyaAdi: `${ad}.pdf` });
    await merkez(`/cizimler/${b.id}/revizyonlar/${b.revizyonlar[0]?.id}/yayinla`, { surum: b.surum });
    return b.id;
  }
  async function resimAc(ad: string): Promise<KmResim> {
    const id = (await o().vt.tx(async (db) => resimMerkezdenEkle(db, yonId, { malzemeNo: flans, merkezBelgeId: await belgeAc(ad) }))).id;
    for (const no of [1, 2]) {
      await o().sahip.sorgu('INSERT INTO kalite_merkezi_balon (resim_id, no, nominal, alt, ust, guncelleyen_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, no, `Ø${String(no)}0`, '9.9', '10.1', yonId]);
    }
    return resimOku(id);
  }
  async function resimOku(id: number): Promise<KmResim> {
    const r = await oku(kalite, `/kalite-merkezi/studyo/parcalar/${String(flans)}`);
    assert.equal(r.statusCode, 200, r.body);
    return (r.json() as KmStudyoParcaCevabi).resimler.find((x) => x.id === id)!;
  }

  before(async () => {
    ortam = await testVeritabaniKur('km_balon_yeri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'kby-yon', parola: PAROLA }));
    const yukle = await ornekVeriYukle(ortam.vt, await zincir('uretim-emirleri'), { ortam: 'test', bildir: () => undefined });
    assert.equal(yukle.durum, 'yuklendi');
    yonetici = await girisYap('kby-yon', null);
    kalite = await girisYap('kby-kalite', 'kalite');
    operator = await girisYap('kby-operator', 'operator');
    // Yazar kalite kaydı girer ama planı ve balonu değiştirmez (603 a).
    const yazarRolu = (await o().vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('kby_yazar', 'Deneme yazar') RETURNING id"))!.id;
    for (const islem of ['sayfa.kalite-merkezi', 'kalite-merkezi.oku', 'kalite-merkezi.yaz']) {
      await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [yazarRolu, islem]);
    }
    yazar = await girisYap('kby-yazar', 'kby_yazar');
    flans = (await o().vt.tx((db) => ornekMalzemeNo(db, 'flans')))!;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('KM-S31 balon yeri kalite onayıyla yazılır; plan sürümü değişmez; yazar ve operatör 403, oturumsuz 401', async () => {
    const r0 = await resimAc('Yer resmi');
    const b = r0.balonlar[0]!;
    assert.deepEqual([b.yer, b.yerKipi], [null, null]);
    const yol = `/kalite-merkezi/studyo/balonlar/${String(b.id)}/yer`;
    const govde = { surum: b.surum, yer: [120.5, 80], yerKipi: null };
    assert.equal((await yaz(yazar, yol, govde)).statusCode, 403);
    assert.equal((await yaz(operator, yol, govde)).statusCode, 403);
    assert.equal((await yaz(null, yol, govde)).statusCode, 401);
    const c = await yaz(kalite, yol, govde);
    assert.equal(c.statusCode, 200, c.body);
    const yeni = (c.json() as { balon: KmBalon }).balon;
    assert.deepEqual([yeni.yer, yeni.yerKipi, yeni.surum, yeni.no, yeni.alt], [[120.5, 80], null, b.surum + 1, b.no, b.alt]);
    const r1 = await resimOku(r0.id);
    assert.equal(r1.surum, r0.surum, 'plan sürümü artmaz');
    assert.deepEqual(r1.balonlar.map((x) => x.yer), [[120.5, 80], null]);
    const kayit = await o().vt.tek<{ guncelleyen_id: number }>('SELECT guncelleyen_id FROM kalite_merkezi_balon WHERE id = $1', [b.id]);
    assert.notEqual(kayit?.guncelleyen_id, yonId, 'yazan kişi sunucudan');

    // Sabiti bırakıp şeride istemek, sonra otomatiğe bırakmak.
    const s = await yaz(kalite, yol, { surum: yeni.surum, yer: null, yerKipi: 'serit' });
    assert.equal(s.statusCode, 200, s.body);
    assert.deepEqual([(s.json() as { balon: KmBalon }).balon.yer, (s.json() as { balon: KmBalon }).balon.yerKipi], [null, 'serit']);
  });

  test('KM-S32 eski sürüm 409; yer ve yerleşim birlikte 400; sayfa dışı ve sayı olmayan yer 400; kaldırılan resmin balonu 404', async () => {
    const r0 = await resimAc('Ret resmi');
    const b = r0.balonlar[1]!;
    const yol = `/kalite-merkezi/studyo/balonlar/${String(b.id)}/yer`;
    assert.equal((await yaz(kalite, yol, { surum: b.surum, yer: [1, 2], yerKipi: null })).statusCode, 200);
    const eski = await yaz(kalite, yol, { surum: b.surum, yer: [3, 4], yerKipi: null });
    assert.deepEqual([eski.statusCode, ileti(eski)], [409, STUDYO_ILETILER.surumDegisti]);
    const ikisi = await yaz(kalite, yol, { surum: b.surum + 1, yer: [3, 4], yerKipi: 'yakin' });
    assert.deepEqual([ikisi.statusCode, ileti(ikisi)], [400, STUDYO_ILETILER.balonYerIkisi]);
    for (const yer of [[-1, 4], [3, 2_000_000], ['a', 1], [1]]) assert.equal((await yaz(kalite, yol, { surum: b.surum + 1, yer, yerKipi: null })).statusCode, 400);
    assert.equal((await yaz(kalite, yol, { surum: b.surum + 1, yer: null, yerKipi: 'orta' })).statusCode, 400);
    assert.equal((await yaz(kalite, `/kalite-merkezi/studyo/balonlar/999999/yer`, { surum: 1, yer: null, yerKipi: null })).statusCode, 404);
    await o().vt.tx((db) => resimKaldir(db, yonId, r0.id, r0.surum));
    const kaldirilan = await yaz(kalite, yol, { surum: b.surum + 1, yer: null, yerKipi: null });
    assert.equal(kaldirilan.statusCode, 404, kaldirilan.body);
    // Veritabanı kısıtı da yarım ya da sayfa dışı yeri tutmaz.
    await assert.rejects(o().sahip.sorgu('UPDATE kalite_merkezi_balon SET yer_x = 5, yer_y = NULL WHERE id = $1', [b.id]));
    await assert.rejects(o().sahip.sorgu("UPDATE kalite_merkezi_balon SET yer_x = 'NaN', yer_y = 1 WHERE id = $1", [b.id]));
    await assert.rejects(o().sahip.sorgu("UPDATE kalite_merkezi_balon SET yer_kipi = 'orta' WHERE id = $1", [b.id]));
  });

  test('KM-S33 kontrol planı yazımı balon yerini taşır; yer verilmezse boşalır', async () => {
    const r0 = await resimAc('Plan yer resmi');
    const [a, b] = r0.balonlar as [KmBalon, KmBalon];
    const satir = (x: KmBalon, ek: object) => ({ id: x.id, no: x.no, nominal: x.nominal, alt: x.alt, ust: x.ust, kritik: false, olcuAletiGerekir: false, ...ek });
    const yol = `/kalite-merkezi/studyo/resimler/${String(r0.id)}/balonlar`;
    const c = await yaz(kalite, yol, { surum: r0.surum, balonlar: [satir(a, { yer: [40, 50] }), satir(b, { yerKipi: 'serit' })] });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual((c.json() as { resim: KmResim }).resim.balonlar.map((x) => [x.yer, x.yerKipi]), [[[40, 50], null], [null, 'serit']]);
    const yeni = (c.json() as { resim: KmResim }).resim;
    const d = await yaz(kalite, yol, { surum: yeni.surum, balonlar: [satir(a, {}), satir(b, {})] });
    assert.equal(d.statusCode, 200, d.body);
    assert.deepEqual((d.json() as { resim: KmResim }).resim.balonlar.map((x) => [x.yer, x.yerKipi]), [[null, null], [null, null]]);
  });
});
