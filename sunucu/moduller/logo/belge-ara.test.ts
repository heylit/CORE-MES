import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { LogoBelgeAramaCevabi } from '#paylasilan/sozlesme/logo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { belgeBulgulariniAyikla } from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { logoBelgeAra } from './servis.ts';

// 3360 a: beş listede "Logo'da ara". Köprü sahte, Logo'ya yazma yok; giden kutusu satırları testte doğrudan yazılır. Veri uydurmadır (ORN-).
const PAROLA = 'dogru-parola-1';

describe('belge araması cevabı ayıklama (3360)', () => {
  test('BA-1 kayıt numarası olmayan atlanır; tarih, döviz ve satır sayısı denetlenir; tutar metne döner', () => {
    const r = belgeBulgulariniAyikla([
      { logicalRef: 0, number: 'YOK' },
      'bozuk',
      {
        logicalRef: 41, number: 'ORN-SS-1', docNumber: null, date: '2026-11-12', arpCode: 'ORN-C-1', arpName: 'Ornek Musteri',
        projectCode: null, projectName: null, description: 'ORNEK numune', netTotal: 12400.5, currency: 0, cancelled: false,
        matchedLines: [{ logicalRef: 7, code: 'ORN-MLZ-1', name: 'Ornek mil', amount: 40, unit: 'ADET', description: null }], matchedLineCount: 3,
      },
      { logicalRef: 42, number: 'ORN-SS-2', date: '12.11.2026', currency: 1, cancelled: true, matchedLineCount: -1 },
    ]);
    assert.deepEqual(r?.map((b) => [b.logoKayitNo, b.tarih, b.tutar, b.dovizTuru, b.iptal, b.satirSayisi]), [
      [41, '2026-11-12', '12400.5', null, false, 3],
      [42, null, null, 1, true, 0],
    ]);
    assert.deepEqual(r?.[0]?.satirlar, [{ kod: 'ORN-MLZ-1', ad: 'Ornek mil', miktar: '40', birim: 'ADET', aciklama: null }]);
    assert.equal(belgeBulgulariniAyikla({ data: [] }), null, 'dizi olmayan cevap okunamadı sayılır');
  });
});

describe('Logo belge araması, sahte köprüyle (3360; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kopru: SahteKopru;
  let yoneticiId = 0;
  let teklifId = 0;
  let siparisId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const ayar = async (anahtar: string, deger: boolean): Promise<void> => {
    const c = await app.inject({
      method: 'POST', url: `/api/ayarlar/${anahtar}/degistir`, headers: { cookie: cerez.get('ba-yonetici') ?? '', 'istek-kimligi': randomUUID() }, payload: { deger },
    });
    assert.equal(c.statusCode, 200, `${anahtar}: ${c.body}`);
  };
  async function yaz<T>(yol: string, govde: unknown): Promise<T> {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: cerez.get('ba-yonetici') ?? '', 'istek-kimligi': randomUUID() }, payload: govde as object });
    assert.equal(c.statusCode, 200, `${yol}: ${c.body}`);
    return c.json() as T;
  }
  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }
  async function girisliKisi(kullaniciAdi: string, islemler: string[]): Promise<void> {
    const kod = `gecici_ba_${kullaniciAdi.replace(/-/g, '_')}`;
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]);
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol kurulamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, islem]);
    await vt().tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, kisi, rol.id);
      await rolAl(db, yoneticiId, kisi, yoneticiRolu.id);
    });
    await giris(kullaniciAdi);
  }
  const ara = async (kim: string, sorgu: string) => {
    const c = await app.inject({ method: 'GET', url: `/api/logo/belge-ara?${sorgu}`, headers: { cookie: cerez.get(kim) ?? '' } });
    return { durum: c.statusCode, govde: c.json<LogoBelgeAramaCevabi>() };
  };

  before(async () => {
    ortam = await testVeritabaniKur('logobelgeara');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'ba-yonetici', parola: PAROLA }));
    await giris('ba-yonetici');
    await girisliKisi('ba-satis', ['siparisler.oku']);
    await girisliKisi('ba-satis-fiyat', ['siparisler.oku', 'siparisler.fiyat-oku']);
    await girisliKisi('ba-malzeme', ['sayfa.malzemeler']);
    await girisliKisi('ba-alis', ['satin-alma.oku']);
    // 3374: satış belgelerinin giden satırı Siparişler'in Logo sırasıdır; sıra kimlikleri belge kimliklerinden uzaklaştırılır.
    const { sahip } = ortam;
    await sahip.sorgu("SELECT setval(pg_get_serial_sequence('siparisler_logo_gonderim', 'id'), 500)");
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('BA-', 0) ON CONFLICT DO NOTHING");
    const mamul = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ba-1', 'mamul', 'BA-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'ba-1', com: { ad: 'ORN mamul', birim: 'adet' } }), yoneticiId]))!.no;
    const firmaId = (await yaz<{ firma: { id: number } }>('/musteri-tedarikci/firmalar/ekle', { ad: 'ORN arama firma', tur: 'musteri', logoCariKodu: 'ORN-C-1001' })).firma.id;
    const t = await yaz<{ id: number; surum: number; satirlar: { id: number }[] }>('/siparisler/teklifler/ekle', {
      firmaId, baslik: 'ORN arama', istenenTarih: null, aciklama: null, satirlar: [{ malzemeNo: mamul, tanim: 'ORN parça', miktar: '3' }],
    });
    await yaz(`/siparisler/teklifler/${String(t.id)}/surum-ver`, { surum: t.surum, fiyatlar: [{ satirId: t.satirlar[0]!.id, birimFiyat: '50' }], iskontoOrani: '0' });
    teklifId = t.id;
    siparisId = (await yaz<{ id: number }>('/siparisler/ekle', {
      firmaId, musteriSiparisNo: null, siparisTarihi: '2026-11-17', termin: '2026-12-17', kdvOrani: '20', odemeKosulu: null, aciklama: null,
      satirlar: [{ malzemeNo: mamul, miktar: '3', birimFiyat: '50', termin: null, aciklama: null }],
    })).id;
    await sahip.sorgu("INSERT INTO siparisler_logo_gonderim (tur, teklif_id, surum_no, siparis_id) VALUES ('siparis', $1, 1, $2)", [teklifId, siparisId]);
    const sira = async (tur: string): Promise<number> =>
      (await sahip.tek<{ id: number }>('SELECT id FROM siparisler_logo_gonderim WHERE tur = $1 AND teklif_id = $2', [tur, teklifId]))!.id;
    const giden = (tur: string, no: number, kayit: string) =>
      vt().sorgu("INSERT INTO logo_giden (belge_turu, belge_no, son_deneme, son_sonuc, logo_kayit_no) VALUES ($1, $2, now(), 'gonderildi', $3)", [tur, no, kayit]);
    await giden('siparisler-siparisi', await sira('siparis'), '41');
    await giden('siparisler-teklifi', await sira('teklif'), '44');
    // Belge kimliğiyle yazılmış satır CORE karşılığı sayılmaz.
    await giden('siparisler-siparisi', siparisId, '42');
    kopru = await sahteKopruAc();
    kopru.logoBelgeleri.push(
      {
        type: 'salesOrder', logicalRef: 41, number: 'ORN-SS-141', date: '2026-11-12', arpCode: 'ORN-C-1001', arpName: 'ORN Deneme Makina',
        description: null, netTotal: 48000, currency: 0, cancelled: false,
        lines: [{ logicalRef: 1, code: 'ORN-MLZ-0042', name: 'ORNEK Mil', amount: 120, unit: 'ADET' }],
      },
      {
        type: 'salesOrder', logicalRef: 42, number: 'ORN-SS-142', date: '2026-11-13', arpCode: 'ORN-C-1001', arpName: 'ORN Deneme Makina',
        description: null, netTotal: 12400, currency: 0, cancelled: false,
        lines: [{ logicalRef: 2, code: 'ORN-MLZ-0042', name: 'ORNEK Mil', amount: 40, unit: 'ADET' }, { logicalRef: 3, code: 'ORN-MLZ-9', name: 'Baska', amount: 1 }],
      },
      { type: 'salesOrder', logicalRef: 43, number: 'ORN-SS-139', arpCode: 'ORN-C-1002', description: 'ORN-MLZ-0042 numune', netTotal: 7250, lines: [] },
      { type: 'salesOffer', logicalRef: 44, number: 'ORN-TK-1', arpCode: 'ORN-C-1001', lines: [{ logicalRef: 4, code: 'ORN-MLZ-0042' }] },
      { type: 'salesOrder', logicalRef: 45, number: 'ORN-SS-150', arpCode: 'ORN-C-1001', netTotal: 900, currency: 20, lines: [] },
    );
  });
  after(async () => { await kopru?.kapat(); await app?.close(); await ortam?.kaldir(); });

  const k = () => kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: 5000 });

  test('BA-2 kapalıyken ve köprü yokken istek atılmaz; açıkken türünde başlık ve satırda arar, CORE karşılığı yalnız aynı türden gelir', async () => {
    const r0 = await logoBelgeAra(vt(), k(), 'satis-siparisi', 'ORN-MLZ-0042', true);
    assert.equal(r0.durum, 'kapali');
    assert.match(r0.ileti ?? '', /Logo: belge araması/);
    assert.equal(kopru.istekler.length, 0);
    await ayar('logo.baglanti', true);
    await ayar('logo.belge-aramasi', true);
    assert.equal((await logoBelgeAra(vt(), null, 'satis-siparisi', 'ORN-MLZ-0042', true)).durum, 'ortam-degiskeni-yok');
    const r = await logoBelgeAra(vt(), k(), 'satis-siparisi', 'ORN-MLZ-0042', true);
    assert.equal(r.durum, 'tamam');
    assert.deepEqual(r.belgeler.map((b) => [b.no, b.satirSayisi, b.core?.id ?? null, b.tutar]), [
      ['ORN-SS-141', 1, siparisId, '48000'],
      ['ORN-SS-142', 1, null, '12400'],
      ['ORN-SS-139', 0, null, '7250'],
    ], 'karşılık Siparişler sırasından; belge kimliğiyle yazılmış satır sayılmaz');
    assert.deepEqual(r.belgeler[1]?.satirlar.map((x) => x.kod), ['ORN-MLZ-0042'], 'yalnız eşleşen satır döner');
    const t = await logoBelgeAra(vt(), k(), 'teklif', 'ORN-MLZ-0042', true);
    assert.deepEqual(t.belgeler.map((b) => [b.no, b.core]), [['ORN-TK-1', { id: teklifId }]]);
    const yok = await logoBelgeAra(vt(), k(), 'talep', 'ORN-MLZ-0042', true);
    assert.deepEqual([yok.durum, yok.belgeler.length], ['tamam', 0]);
    assert.match(yok.ileti ?? '', /belge yok/);
    assert.deepEqual([...new Set(kopru.istekler.map((i) => i.yol))], ['/api/Document/search']);
    assert.deepEqual(kopru.istekler.filter((i) => i.yontem !== 'GET'), [], 'Logo\'ya yazma isteği yok');
    const gizli = await logoBelgeAra(vt(), k(), 'satis-siparisi', 'ORN-SS-141', false);
    assert.deepEqual(gizli.belgeler.map((b) => [b.tutar, b.dovizTuru]), [[null, null]], 'fiyat yetkisi yoksa tutar gelmez');
    assert.equal(gizli.fiyatGorunur, false);
    // Dövizli kayıtta da para birimi fiyat yetkisiyle gelir.
    assert.deepEqual((await logoBelgeAra(vt(), k(), 'satis-siparisi', 'ORN-SS-150', true)).belgeler.map((b) => [b.tutar, b.dovizTuru]), [['900', 20]]);
    assert.deepEqual((await logoBelgeAra(vt(), k(), 'satis-siparisi', 'ORN-SS-150', false)).belgeler.map((b) => [b.tutar, b.dovizTuru]), [[null, null]]);
    // "Logo bağlantısı" kapalıyken belge araması açık olsa da istek atılmaz.
    await ayar('logo.baglanti', false);
    const istekOnce = kopru.istekler.length;
    assert.equal((await logoBelgeAra(vt(), k(), 'satis-siparisi', 'ORN-MLZ-0042', true)).durum, 'kapali');
    assert.equal(kopru.istekler.length, istekOnce, 'bağlantı kapalıyken köprüye istek yok');
    await ayar('logo.baglanti', true);
    // CORE karşılığı yalnız Logo kayıt numarası olan giden satırından gelir: kısıt numarayı yalnız "gönderildi" ve "zaten vardı" sonucuna verir.
    await assert.rejects(
      vt().sorgu("INSERT INTO logo_giden (belge_turu, belge_no, son_deneme, son_sonuc, logo_kayit_no) VALUES ('siparisler-teklifi', 9999, now(), 'reddedildi', '45')"),
      /logo_giden_butun/,
    );
    kopru.senaryo = 'yetkisiz';
    assert.equal((await logoBelgeAra(vt(), k(), 'satis-siparisi', 'ORN-MLZ-0042', true)).durum, 'hata');
    kopru.senaryo = 'basari';
  });

  test('BA-3 uç: tür başına okuma yetkisi; fiyat yetkisi ayrı; kısa metin 400', async () => {
    assert.equal((await ara('ba-malzeme', 'tur=satis-siparisi&q=ORN-MLZ')).durum, 403);
    assert.equal((await ara('ba-satis', 'tur=talep&q=ORN-MLZ')).durum, 403, 'satış okuyan satın alma talebinde arayamaz');
    assert.equal((await ara('ba-satis', 'tur=satis-siparisi&q=ab')).durum, 400);
    // Testte ortam köprüsü yoktur: cevap "ortam-degiskeni-yok" döner, fiyat görünürlüğü yine yetkiden gelir.
    const s = await ara('ba-satis', 'tur=satis-siparisi&q=ORN-MLZ');
    assert.equal(s.durum, 200, JSON.stringify(s.govde));
    assert.deepEqual([s.govde.durum, s.govde.fiyatGorunur, s.govde.belgeler], ['ortam-degiskeni-yok', false, []]);
    const f = await ara('ba-satis-fiyat', 'tur=teklif&q=ORN-MLZ');
    assert.deepEqual([f.durum, f.govde.fiyatGorunur], [200, true]);
    // Satın alma siparişinde tutar satın alma okumasıyla görünür; satış fiyatını gören satın almada arayamaz.
    const a = await ara('ba-alis', 'tur=satin-alma-siparisi&q=ORN-MLZ');
    assert.deepEqual([a.durum, a.govde.fiyatGorunur], [200, true]);
    assert.equal((await ara('ba-satis-fiyat', 'tur=satin-alma-siparisi&q=ORN-MLZ')).durum, 403);
    // Düğme durumu: ayar açık ama ortam köprüsü yok, düğme çizilmez; listeyi görmeyen soramaz.
    const d = await app.inject({ method: 'GET', url: '/api/logo/belge-arama-durumu', headers: { cookie: cerez.get('ba-satis') ?? '' } });
    assert.deepEqual([d.statusCode, d.json()], [200, { acik: false, neden: null }]);
    const y = await app.inject({ method: 'GET', url: '/api/logo/belge-arama-durumu', headers: { cookie: cerez.get('ba-malzeme') ?? '' } });
    assert.equal(y.statusCode, 403);
  });
});
