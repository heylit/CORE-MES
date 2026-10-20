import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import type { Db } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { konumKimlikleri } from './kurallar.ts';
import { sonOlaylar } from './disari.ts';
import { kayitEkle } from './servis.ts';

const PAROLA = 'dogru-parola-1';

interface KayitKimligi { makine: string | null; is_merkezi: string | null; istasyon_id: number | null; is_merkezi_id: number | null }

describe('arkon kayıt kimlikleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let operator = '';
  let haritaci = '';
  let haritaciId = 0;
  let yetkisiz = '';
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const sahip = (): TestVeritabani['sahip'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    return ortam.sahip;
  };

  async function istek(cerez: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown) {
    const cevap = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: cerez }, ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as { id: number; kod: string; eklenen: number } };
  }

  async function giris(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function tesisKur(): Promise<{ merkez: { id: number; kod: string }; istasyon: { id: number; kod: string } }> {
    sayac += 1;
    const merkez = await istek(yonetici, 'POST', '/is-merkezleri', { kod: `KM-${sayac}`, ad: 'Kimlik Merkezi' });
    const istasyon = await istek(yonetici, 'POST', '/istasyonlar', { kod: `KI-${sayac}`, ad: 'Kimlik İstasyonu', isMerkeziId: merkez.govde.id, tip: 'kalite' });
    assert.equal(istasyon.durum, 200);
    return { merkez: merkez.govde, istasyon: istasyon.govde };
  }

  const sayimYaz = (cid: string, machine: string | null, wc: string | null) =>
    istek(operator, 'POST', '/arkon/kayitlar/counts/ekle', {
      satirlar: [{ cid, at: Date.now(), kind: 'good', delta: 1, ...(machine === null ? {} : { machine }), ...(wc === null ? {} : { wc }) }], kaynak: 'k1',
    });

  const kayitOku = (cid: string) =>
    vt().tek<KayitKimligi>('SELECT makine, is_merkezi, istasyon_id, is_merkezi_id FROM arkon_kayit WHERE tur = $1 AND cid = $2', ['counts', cid]);

  before(async () => {
    ortam = await testVeritabaniKur('arkonkimlik');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const gecici = await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_arkon', 'Geçici Arkon') RETURNING id");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!gecici || !yoneticiRolu) throw new Error('rol kurulamadı');
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'arkon.operator'), ($1, 'sayfa.arkon')", [gecici.id]);
    const harita = await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_harita', 'Geçici Harita') RETURNING id");
    const bos = await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_bos', 'Geçici Boş') RETURNING id");
    if (!harita || !bos) throw new Error('rol kurulamadı');
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'sayfa.atolye')", [harita.id]);
    const kisiKur = async (ad: string, kullaniciAdi: string, rolId: number): Promise<number> => ortam!.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, id, rolId);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
      return id;
    });
    await kisiKur('Deneme Operatör', 'operator1', gecici.id);
    haritaciId = await kisiKur('Deneme Haritacı', 'haritaci1', harita.id);
    await kisiKur('Deneme Yetkisiz', 'yetkisiz1', bos.id);
    yonetici = await giris('yonetici');
    operator = await giris('operator1');
    haritaci = await giris('haritaci1');
    yetkisiz = await giris('yetkisiz1');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('bilinen kodla yazılan kayıtta iki kimlik dolu; bilinmeyen kodla kayıt yazılır, kimlik boş kalır', async () => {
    const t = await tesisKur();
    const bilinen = await sayimYaz('kb1', t.istasyon.kod, t.merkez.kod);
    assert.equal(bilinen.durum, 200);
    assert.equal(bilinen.govde.eklenen, 1);
    assert.deepEqual(await kayitOku('kb1'), { makine: t.istasyon.kod, is_merkezi: t.merkez.kod, istasyon_id: t.istasyon.id, is_merkezi_id: t.merkez.id });

    const bilinmeyen = await sayimYaz('kb2', 'YOK-ISTASYON', 'YOK-MERKEZ');
    assert.equal(bilinmeyen.durum, 200);
    assert.equal(bilinmeyen.govde.eklenen, 1);
    assert.deepEqual(await kayitOku('kb2'), { makine: 'YOK-ISTASYON', is_merkezi: 'YOK-MERKEZ', istasyon_id: null, is_merkezi_id: null });

    const kodsuz = await sayimYaz('kb3', null, null);
    assert.equal(kodsuz.govde.eklenen, 1);
    assert.deepEqual(await kayitOku('kb3'), { makine: null, is_merkezi: null, istasyon_id: null, is_merkezi_id: null });
  });

  test('toplu eklemede her satır kendi kimliğini alır', async () => {
    const t = await tesisKur();
    const cevap = await istek(operator, 'POST', '/arkon/kayitlar/counts/ekle', {
      satirlar: [
        { cid: 'top1', at: Date.now(), kind: 'good', delta: 1, machine: t.istasyon.kod, wc: t.merkez.kod },
        { cid: 'top2', at: Date.now(), kind: 'good', delta: 1, machine: 'YOK-ISTASYON' },
      ],
      kaynak: 'k1',
    });
    assert.equal(cevap.govde.eklenen, 2);
    assert.equal((await kayitOku('top1'))?.istasyon_id, t.istasyon.id);
    assert.equal((await kayitOku('top2'))?.istasyon_id, null);
  });

  test('son olaylar: en yeni önce, istasyon kodu ve kimliğiyle; sonraId yalnız sonra eklenenleri verir; günlük olay değildir', async () => {
    const t = await tesisKur();
    const once = await sonOlaylar(vt());
    const sonId = once[0]?.id ?? 0;
    await sayimYaz('so1', t.istasyon.kod, t.merkez.kod);
    await sayimYaz('so2', 'YOK-ISTASYON', null);
    const yeni = await sonOlaylar(vt(), { sonraId: sonId });
    assert.deepEqual(yeni.map((o) => [o.tur, o.istasyonKodu, o.istasyonId]), [['counts', 'YOK-ISTASYON', null], ['counts', t.istasyon.kod, t.istasyon.id]]);
    assert.ok((yeni[0]?.id ?? 0) > (yeni[1]?.id ?? 0));
    assert.deepEqual(await sonOlaylar(vt(), { sonraId: yeni[0]?.id ?? 0 }), []);
    assert.equal((await sonOlaylar(vt(), { sinir: 1 })).length, 1);
    assert.ok((await sonOlaylar(vt(), { sinir: 500 })).every((o) => (o.tur as string) !== 'audit'));
  });

  test('son olaylar ucu (#1122): Arkon sayfası ve harita sayfası okur, ikisi de yoksa 403; kişi adı gelir; kapsam dışı iş merkezinin olayı dönmez', async () => {
    const a = await tesisKur();
    const b = await tesisKur();
    const oku = async (cerez: string, sorgu = '') => {
      const c = await app.inject({ method: 'GET', url: `/api/arkon/son-olaylar${sorgu}`, headers: { cookie: cerez } });
      return { durum: c.statusCode, olaylar: (c.json() as { olaylar?: { id: number; tur: string; istasyonId: number | null; kisi: { ad: string | null } }[] }).olaylar ?? [] };
    };
    const sonId = (await oku(operator)).olaylar[0]?.id ?? 0;
    await sayimYaz('su1', a.istasyon.kod, a.merkez.kod);
    await sayimYaz('su2', b.istasyon.kod, b.merkez.kod);

    const arkon = await oku(operator, `?sonraId=${sonId}`);
    assert.equal(arkon.durum, 200);
    assert.deepEqual(arkon.olaylar.map((o) => [o.tur, o.istasyonId, o.kisi.ad]), [['counts', b.istasyon.id, 'Deneme Operatör'], ['counts', a.istasyon.id, 'Deneme Operatör']]);
    assert.equal((await oku(haritaci, `?sonraId=${sonId}`)).olaylar.length, 2);
    assert.equal((await oku(operator, `?sonraId=${sonId}&sayi=1`)).olaylar.length, 1);
    assert.equal((await oku(operator, '?sayi=201')).durum, 400);

    const red = await oku(yetkisiz);
    assert.equal(red.durum, 403);
    assert.deepEqual(red.olaylar, []);

    await vt().sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [haritaciId, a.merkez.id]);
    assert.deepEqual((await oku(haritaci, `?sonraId=${sonId}`)).olaylar.map((o) => o.istasyonId), [a.istasyon.id]);
  });

  const sayimZamanla = (cid: string, at: number, machine: string, wc: string) =>
    istek(operator, 'POST', '/arkon/kayitlar/counts/ekle', { satirlar: [{ cid, at, kind: 'good', delta: 1, machine, wc }], kaynak: 'k1' });

  test('istasyon kodu TMI\'de değişince: yeni kod aynı kimliği alır; değişiklikten önceki zamanla gelen eski kodlu kayıt (çevrimdışı kuyruk) eski koddan çözülür; sonraki zamanlı eski kod çözülmez; eski kayıt değişmez', async () => {
    const t = await tesisKur();
    await sayimYaz('kd1', t.istasyon.kod, t.merkez.kod);
    const once = Date.now() - 60_000;
    const yeniKod = `${t.istasyon.kod}-YENI`;
    const guncel = await istek(yonetici, 'POST', `/istasyonlar/${t.istasyon.id}/guncelle`, {
      kod: yeniKod, ad: 'Kimlik İstasyonu', isMerkeziId: t.merkez.id, tip: 'kalite', surum: 1,
    });
    assert.equal(guncel.durum, 200, JSON.stringify(guncel.govde));
    await sayimYaz('kd2', yeniKod, t.merkez.kod);
    await sayimYaz('kd3', t.istasyon.kod, t.merkez.kod);
    await sayimZamanla('kd4', once, t.istasyon.kod, t.merkez.kod);
    // Tablet kodu kendi yazdığı gibi gönderir; kırpma ve büyük harf istasyonlar çözücüsündedir.
    await sayimZamanla('kd5', once, ` ${t.istasyon.kod.toLowerCase()} `, t.merkez.kod);
    assert.deepEqual(await kayitOku('kd1'), { makine: t.istasyon.kod, is_merkezi: t.merkez.kod, istasyon_id: t.istasyon.id, is_merkezi_id: t.merkez.id });
    assert.deepEqual(await kayitOku('kd2'), { makine: yeniKod, is_merkezi: t.merkez.kod, istasyon_id: t.istasyon.id, is_merkezi_id: t.merkez.id });
    assert.deepEqual(await kayitOku('kd3'), { makine: t.istasyon.kod, is_merkezi: t.merkez.kod, istasyon_id: null, is_merkezi_id: t.merkez.id });
    assert.deepEqual(await kayitOku('kd4'), { makine: t.istasyon.kod, is_merkezi: t.merkez.kod, istasyon_id: t.istasyon.id, is_merkezi_id: t.merkez.id });
    assert.equal((await kayitOku('kd5'))?.istasyon_id, t.istasyon.id);
  });

  test('kodsuz satır tesis okuması yapmaz; kodlu satır yalnız çözücüyü kod listesiyle çağırır', async () => {
    const opId = (await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'operator1'"))?.id ?? 0;
    const kisi = { id: opId, ad: 'Deneme Operatör', islemler: ['arkon.operator'] as never };
    const gunluk: Gunluk = { uyar: () => undefined, hata: () => undefined };
    const tesisOkumasi = /FROM\s+(istasyon|is_merkezi|istasyonlar_kod_gecmisi)\b/;
    const sayarak = async (satir: Record<string, unknown>): Promise<string[]> => {
      const sayilan: string[] = [];
      await vt().tx((db) => kayitEkle({
        sorgu: (sql, p) => { sayilan.push(sql); return db.sorgu(sql, p); },
        tek: (sql, p) => { sayilan.push(sql); return db.tek(sql, p); },
      } as Db, kisi, 'calls', [satir], 'k1', gunluk));
      return sayilan.filter((q) => tesisOkumasi.test(q));
    };
    assert.deepEqual(await sayarak({ cid: 'kt1', at: Date.now(), callId: 'kt', team: 'bakim', phase: 'open' }), []);
    const t = await tesisKur();
    const kodlu = await sayarak({ cid: 'kt2', at: Date.now(), callId: 'kt', team: 'bakim', phase: 'open', machine: t.istasyon.kod });
    assert.ok(kodlu.length > 0, 'kodlu satır çözülmeli (yokluk testi önce okumanın görüldüğünü doğrular)');
    assert.ok(kodlu.every((q) => /ANY\(\$1::text\[\]\)/.test(q)), kodlu.join(' | '));
    assert.equal((await vt().tek<{ istasyon_id: number | null }>("SELECT istasyon_id FROM arkon_kayit WHERE tur = 'calls' AND cid = 'kt2'"))?.istasyon_id, t.istasyon.id);
    // Reddedilen satır çözümden önce düşer: kodlu ama geçersiz ilk satır tesis okuması yaptırmaz.
    const reddedilen: string[] = [];
    await assert.rejects(vt().tx((db) => kayitEkle({
      sorgu: (sql, p) => { reddedilen.push(sql); return db.sorgu(sql, p); },
      tek: (sql, p) => { reddedilen.push(sql); return db.tek(sql, p); },
    } as Db, kisi, 'calls', [{ cid: 'kt3', at: Date.now(), src: 'auto', machine: t.istasyon.kod }, { cid: 'kt4', at: Date.now() - 1, machine: t.istasyon.kod }], 'k1', gunluk)));
    assert.deepEqual(reddedilen.filter((q) => tesisOkumasi.test(q)), []);
  });

  test('kural: kod haritada yoksa ya da satırda kod yoksa kimlik null', () => {
    const ist = new Map([['A', 1]]);
    const mer = new Map([['M', 2]]);
    assert.deepEqual(konumKimlikleri({ makine: 'A', isMerkezi: 'M' }, ist, mer), { istasyonId: 1, isMerkeziId: 2 });
    assert.deepEqual(konumKimlikleri({ makine: 'B', isMerkezi: null }, ist, mer), { istasyonId: null, isMerkeziId: null });
  });
});
