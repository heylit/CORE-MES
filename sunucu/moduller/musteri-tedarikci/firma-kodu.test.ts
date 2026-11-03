import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { FirmaCevabi, FirmaEkleGovdesi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// Kart 1936: kodu boş gelen yeni firmaya kod ayardaki kalıptan verilir. Örnek firmalar uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('firma kodu kendiliğinden verilir (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  let sayac = 0;
  const yeniFirma = (ek: Partial<FirmaEkleGovdesi> = {}): FirmaEkleGovdesi => ({ ad: `Kod Deneme ${(sayac += 1)}`, tur: 'musteri', ...ek });
  async function ekle(kim: string, govde: FirmaEkleGovdesi): Promise<Cevap<FirmaCevabi>> {
    const c = await app.inject({
      method: 'POST', url: '/api/musteri-tedarikci/firmalar/ekle', payload: govde,
      headers: { cookie: cerez.get(kim) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
    });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as FirmaCevabi };
  }
  async function kodla(govde: FirmaEkleGovdesi): Promise<string | null> {
    const c = await ekle('yazan', govde);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.firma.kod;
  }
  const firmaSayisi = async (): Promise<number> => (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM musteri_tedarikci_firma'))?.n ?? -1;
  const kalipYaz = (anahtar: string, kalip: string) =>
    vt().sorgu(
      `INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger`,
      [anahtar, JSON.stringify(kalip), yoneticiId],
    );

  async function girisliKisi(kullaniciAdi: string, rolKodu: string, islemler: string[]): Promise<void> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [rolKodu]);
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol kurulamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, islem]);
    await vt().tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, kisi, rol.id);
      await rolAl(db, yoneticiId, kisi, yoneticiRolu.id);
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  before(async () => {
    ortam = await testVeritabaniKur('mtkod');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await girisliKisi('okuyan', 'gecici_kod_oku', ['sayfa.finans', 'musteri-tedarikci.oku']);
    await girisliKisi('yazan', 'gecici_kod_yaz', ['sayfa.finans', 'musteri-tedarikci.oku', 'musteri-tedarikci.yaz']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('boş kodlu müşteri ve tedarikçi kendi sayacından sıra alır; ikisi türü müşteri, fason tedarikçi sayacındadır', async () => {
    assert.equal(await kodla(yeniFirma({ kod: null })), 'MUS-0001');
    assert.equal(await kodla(yeniFirma({ kod: '' })), 'MUS-0002');
    assert.equal(await kodla(yeniFirma({ tur: 'tedarikci' })), 'TED-0001');
    assert.equal(await kodla(yeniFirma({ tur: 'ikisi' })), 'MUS-0003');
    assert.equal(await kodla(yeniFirma({ tur: 'tedarikci', fason: true })), 'TED-0002');
  });

  test('elle yazılan kod olduğu gibi kalır ve sayacı ilerletmez', async () => {
    assert.equal(await kodla(yeniFirma({ tur: 'tedarikci', kod: 'ELLE-1' })), 'ELLE-1');
    assert.equal(await kodla(yeniFirma({ tur: 'tedarikci' })), 'TED-0003');
  });

  test('elle verilmiş kodla çakışan sıra atlanır; büyük/küçük harf farkı da çakışmadır', async () => {
    assert.equal(await kodla(yeniFirma({ tur: 'tedarikci', kod: 'ted-0004' })), 'ted-0004');
    assert.equal(await kodla(yeniFirma({ tur: 'tedarikci' })), 'TED-0005');
  });

  test('güncellemede boş bırakılan kod yeniden verilmez', async () => {
    const c = await ekle('yazan', yeniFirma({ tur: 'tedarikci', kod: 'GUN-1' }));
    const f = c.govde.firma;
    const g = await app.inject({
      method: 'POST', url: `/api/musteri-tedarikci/firmalar/${f.id}/guncelle`,
      payload: { ad: f.ad, tur: f.tur, kod: null, surum: f.surum }, headers: { cookie: cerez.get('yazan') ?? '' },
    });
    assert.equal(g.statusCode, 200, g.body);
    assert.equal((g.json() as FirmaCevabi).firma.kod, null);
  });

  test('yazma yetkisi olmayan kod alamaz; reddedilen istek sayacı ilerletmez', async () => {
    const once = await firmaSayisi();
    assert.equal((await ekle('okuyan', yeniFirma({ tur: 'tedarikci' }))).durum, 403);
    assert.equal(await firmaSayisi(), once);
    assert.equal(await kodla(yeniFirma({ tur: 'tedarikci' })), 'TED-0006');
  });

  test('kalıp Ayarlar\'dan değişince yeni kod yeni kalıpla verilir; kodu 40 karakteri aşan kalıp kayıt açtırmaz', async () => {
    await kalipYaz('musteri-tedarikci.musteri-kodu', 'C{SAYAC:3}');
    assert.match((await kodla(yeniFirma())) ?? '', /^C\d{3}$/);
    await kalipYaz('musteri-tedarikci.musteri-kodu', `${'X'.repeat(40)}-{SAYAC:3}`);
    const once = await firmaSayisi();
    const c = await ekle('yazan', yeniFirma());
    assert.equal(c.durum, 422, JSON.stringify(c.govde));
    assert.equal(await firmaSayisi(), once);
    assert.equal(await kodla(yeniFirma({ kod: 'ELLE-UZUN-KALIP' })), 'ELLE-UZUN-KALIP');
  });
});
