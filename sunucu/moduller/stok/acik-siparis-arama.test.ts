import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { acikSiparisSatirlariCevabi, type AcikSiparisSatiri } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirNolari } from '../uretim-emirleri/disari.ts';

// Mal kabuldeki tek arama kutusu açık sipariş satırını malzeme, tedarikçi, üretim emri ve emrin projesiyle bulur. Satırın emri
// talebin emridir; birleşmiş talepte kalemin kaynak talebinin emri önce gelir; fason satırında iş emrinin emridir. Proje emrin
// projesidir. Yeni alanlar yalnız ucun var olan okuma yetkisiyle gider. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('stok açık sipariş satırlarında emir ve proje (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  let kisi = 0, ist = 0, tip = 0, firma = 0, talepSira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const iste = async (kim: string | null): Promise<{ durum: number; govde: unknown }> => {
    const c = await app.inject({ method: 'GET', url: '/api/stok/acik-siparis-satirlari', headers: kim === null ? {} : { cookie: cerezler.get(kim) ?? '' } });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  const satirlar = async (): Promise<AcikSiparisSatiri[]> => {
    const c = await iste('depo');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return acikSiparisSatirlariCevabi.parse(c.govde).satirlar;
  };

  async function emir(projeId: number | null): Promise<number> {
    return (await o().sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, proje_id) VALUES ('ASA-P', 'Deneme', 5, $1, $2, $3) RETURNING id", [ist, kisi, projeId]))!.id;
  }
  async function proje(kod: string, ad: string): Promise<number> {
    return (await o().sahip.tek<{ id: number }>('INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ($1, $2, $3) RETURNING id', [kod, ad, kisi]))!.id;
  }
  async function fasonIsi(emirId: number): Promise<number> {
    return (await o().sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, fason_firma_id) VALUES ($1, 1, 10, $2, 'Deneme fason', $3) RETURNING id",
      [emirId, tip, firma]))!.id;
  }
  async function talep(emirId: number | null): Promise<string> {
    talepSira += 1;
    const t = randomUUID();
    await o().sahip.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum, uretim_emri_id) VALUES ($1, 2099, $2, $3, $4, $4, 'siparis_verildi', $5)",
      [t, 93000 + talepSira, `Deneme talep ${talepSira}`, kisi, emirId]);
    return t;
  }
  // Açık sipariş satırı: talebin emri, birleşmiş talepte kalemin kaynak talebinin emri ve sipariş satırının iş emri (fason) ayrı verilir.
  async function siparisSatiri(x: { kalem: string; tedarikci: string; talepEmri?: number; kaynakEmri?: number; isEmri?: number }): Promise<number> {
    const [t, kl, tk] = [await talep(x.talepEmri ?? null), randomUUID(), randomUUID()];
    const kaynak = x.kaynakEmri === undefined ? null : await talep(x.kaynakEmri);
    const s = o().sahip;
    await s.sorgu('INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, kaynak_talep_id, kaynak_sira) VALUES ($1, $2, 1, $3, $4, $5)',
      [t, kl, x.kalem, kaynak, kaynak === null ? null : 1]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi, tedarikci_adi) VALUES ($1, $2, 'TRY', current_date, $3)", [t, tk, x.tedarikci]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
    return (await s.tek<{ id: number }>("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim, is_emri_id) VALUES ($1, $2, $3, 4, 'adet', $4) RETURNING id",
      [t, tk, kl, x.isEmri ?? null]))!.id;
  }

  before(async () => {
    ortam = await testVeritabaniKur('stok_acik_siparis_arama');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const yon = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    for (const rol of ['depo', 'kalite', 'operator']) {
      const r = (await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!.id;
      await ortam.vt.tx(async (db) => {
        const k = await yoneticiOlustur(db, { ad: `Deneme ${rol}`, kullaniciAdi: rol, parola: PAROLA });
        await rolAta(db, kisi, k, r);
        await rolAl(db, kisi, k, yon);
      });
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: rol, parola: PAROLA } });
      assert.equal(g.statusCode, 200);
      cerezler.set(rol, String(g.headers['set-cookie']).split(';')[0] ?? '');
    }
    const s = ortam.sahip;
    const im = (await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('ASAM', 'Deneme merkezi') RETURNING id"))!.id;
    ist = (await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('ASAI', 'Deneme', $1, true) RETURNING id", [im]))!.id;
    tip = (await s.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
    firma = (await s.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Fasoncu', 'tedarikci', $1) RETURNING id", [kisi]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: girişsiz 401; ucun okuma işlemi olmayan rol 403 alır ve emir, proje ya da tedarikçi görmez; depo 200', async () => {
    const p = await proje('ASA.Y', 'Gizli Deneme Projesi');
    await siparisSatiri({ kalem: 'Deneme yetki kalemi', tedarikci: 'Deneme Yetki Tedarik', talepEmri: await emir(p) });
    assert.equal((await iste(null)).durum, 401);
    for (const kim of ['kalite', 'operator']) {
      const c = await iste(kim);
      assert.equal(c.durum, 403, kim);
      const metin = JSON.stringify(c.govde);
      for (const yasak of ['Gizli Deneme Projesi', 'Deneme Yetki Tedarik', 'emirNo', 'projeAdi']) assert.ok(!metin.includes(yasak), `${kim}: ${yasak}`);
    }
    assert.equal((await iste('depo')).durum, 200);
  });

  test('emir talepten, birleşmiş talepte kaynak talepten ya da fason iş emrinden gelir; proje emrin projesidir; emirsiz ve projesiz satırda alanlar null', async () => {
    const p = await proje('ASA.1', 'Deneme Projesi Bir');
    const [talepEmri, kaynakEmri, fasonEmri, projesiz] = [await emir(p), await emir(p), await emir(p), await emir(null)];
    const id = {
      talep: await siparisSatiri({ kalem: 'Deneme mil', tedarikci: 'Deneme Celik', talepEmri }),
      kalem: await siparisSatiri({ kalem: 'Deneme pul', tedarikci: 'Deneme Baglanti', talepEmri: projesiz, kaynakEmri }),
      fason: await siparisSatiri({ kalem: 'Deneme kaplama hizmeti', tedarikci: 'Deneme Fasoncu', isEmri: await fasonIsi(fasonEmri) }),
      projesiz: await siparisSatiri({ kalem: 'Deneme vida', tedarikci: 'Deneme Baglanti', talepEmri: projesiz }),
      bos: await siparisSatiri({ kalem: 'Deneme eldiven', tedarikci: 'Deneme Sarf' }),
    };
    const nolar = await o().vt.tx((db) => emirNolari(db, [talepEmri, kaynakEmri, fasonEmri, projesiz]));
    const l = await satirlar();
    const al = (x: number) => {
      const r = l.find((y) => y.id === x);
      assert.ok(r, String(x));
      return [r.tedarikciAdi, r.uretimEmriId, r.emirNo, r.projeId, r.projeAdi];
    };
    assert.deepEqual(al(id.talep), ['Deneme Celik', talepEmri, nolar.get(talepEmri), p, 'Deneme Projesi Bir']);
    assert.deepEqual(al(id.kalem), ['Deneme Baglanti', kaynakEmri, nolar.get(kaynakEmri), p, 'Deneme Projesi Bir'], 'kaynak talebin emri birleşen talebinkinden önce gelir');
    assert.deepEqual(al(id.fason), ['Deneme Fasoncu', fasonEmri, nolar.get(fasonEmri), p, 'Deneme Projesi Bir'], 'fason satırında iş emrinin emri');
    assert.deepEqual(al(id.projesiz), ['Deneme Baglanti', projesiz, nolar.get(projesiz), null, null]);
    assert.deepEqual(al(id.bos), ['Deneme Sarf', null, null, null, null]);
    for (const x of l) assert.equal(Object.keys(x).some((k) => /fiyat|tutar|maliyet/i.test(k)), false, 'satırda fiyat alanı yok');
  });
});
