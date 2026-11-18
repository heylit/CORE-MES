import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { LogoRozetCevabi } from '#paylasilan/sozlesme/logo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { BEKLEYEN_ESKIME_MS, belgeRozetDurumu, bekleyenTaze, rozetNedeni } from './kurallar.ts';

// 3344: Logo'ya gidiş rozeti. Giden kutusu satırları testte doğrudan yazılır; Logo'ya istek yoktur. Veri uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('belge rozeti kuralı (3344)', () => {
  const g = (ek: Partial<Parameters<typeof belgeRozetDurumu>[0] & object> = {}) =>
    ({ sonSonuc: null, sonrakiDeneme: null, sonHata: null, logoKayitNo: null, ...ek });
  test('RZ-1 sıra: Logo kaydı, bağlı kart, bekleme, giden kutusu; iz yoksa rozet yok', () => {
    assert.deepEqual(belgeRozetDurumu(g({ sonSonuc: 'gonderildi', logoKayitNo: '41' }), { durum: 'kart-bekliyor', ileti: 'x' }, null),
      { durum: 'logoda', kayitNo: '41', neden: null });
    assert.deepEqual(belgeRozetDurumu(null, null, '77'), { durum: 'logoda', kayitNo: '77', neden: null });
    assert.deepEqual(belgeRozetDurumu(g(), { durum: 'proje-bekliyor', ileti: 'ORN.PRJ bekliyor' }, null),
      { durum: 'proje-bekliyor', kayitNo: null, neden: 'ORN.PRJ bekliyor' });
    assert.deepEqual(belgeRozetDurumu(g(), null, null), { durum: 'sirada', kayitNo: null, neden: null });
    assert.deepEqual(belgeRozetDurumu(g({ sonSonuc: 'reddedildi', sonHata: 'Logo reddetti.' }), null, null),
      { durum: 'durdu', kayitNo: null, neden: 'Logo reddetti.' });
    assert.deepEqual(belgeRozetDurumu(g({ sonSonuc: 'ulasilamadi', sonHata: 'Ulaşılamadı.', sonrakiDeneme: new Date() }), null, null),
      { durum: 'yeniden-denenecek', kayitNo: null, neden: 'Ulaşılamadı.' });
    assert.equal(belgeRozetDurumu(null, null, null), null);
    // Ham hata iletisi kısaltılır: ilk dolu satır, en çok 160 karakter.
    const uzun = belgeRozetDurumu(g({ sonSonuc: 'reddedildi', sonHata: `\n  Satır hatası ${'x'.repeat(300)}\nyığın izi` }), null, null);
    assert.equal(uzun?.neden?.length, 160);
    assert.ok(uzun?.neden?.startsWith('Satır hatası') && uzun.neden.endsWith('…') && !uzun.neden.includes('yığın'));
  });

  test('RZ-4 neden: sırada boş; kısa ikinci satır ve uzun bekleme iletisi kesilir; eskimiş bekleme taze değildir', () => {
    assert.equal(belgeRozetDurumu(g({ sonHata: 'eski deneme hatası' }), null, null)?.neden, null);
    assert.equal(rozetNedeni('a\nyığın'), 'a');
    assert.equal(rozetNedeni('   \n  '), null);
    const bekleme = belgeRozetDurumu(null, { durum: 'kart-bekliyor', ileti: `Kart ${'y'.repeat(400)}` }, null);
    assert.equal(bekleme?.neden?.length, 160);
    const simdi = new Date('2026-11-16T12:00:00Z');
    assert.equal(bekleyenTaze(new Date(simdi.getTime() - BEKLEYEN_ESKIME_MS), simdi), true);
    assert.equal(bekleyenTaze(new Date(simdi.getTime() - BEKLEYEN_ESKIME_MS - 1), simdi), false);
  });
});

describe('Logo rozet ucu (3344, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerez = new Map<string, string>();
  let yoneticiId = 0;
  let malzemeNo = 0;
  let mamulNo = 0;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function girisliKisi(kullaniciAdi: string, islemler: string[]): Promise<void> {
    const kod = `gecici_rz_${kullaniciAdi.replace(/-/g, '_')}`;
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]);
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
  const oku = async (kim: string, sorgu: string) => {
    const c = await app.inject({ method: 'GET', url: `/api/logo/belge-durumlari?${sorgu}`, headers: { cookie: cerez.get(kim) ?? '' } });
    return { durum: c.statusCode, govde: c.json<LogoRozetCevabi>() };
  };

  before(async () => {
    ortam = await testVeritabaniKur('logorozet');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'rz-yonetici', parola: PAROLA }));
    await girisliKisi('rz-satis', ['siparisler.oku']);
    await girisliKisi('rz-satinalma', ['satin-alma.oku']);
    await girisliKisi('rz-malzeme', ['sayfa.malzemeler']);
    const ekle = (tur: string, no: number, kolon: string, deger: string) =>
      vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no${kolon}) VALUES ($1, $2${deger})`, [tur, no]);
    // Malzeme: aynı karta malzeme (reddedildi) ve hizmet (gönderildi) satırı; yalnız hizmet satırı olan kart; giden satırı olmayan bağlı kart.
    await ekle('malzeme', 10, ", son_deneme, son_sonuc, son_hata", ", now(), 'reddedildi', 'Deneme birim'");
    await ekle('hizmet', 10, ", son_deneme, son_sonuc, logo_kayit_no", ", now(), 'gonderildi', '7010'");
    await ekle('hizmet', 11, ', niyet_zamani', ', now()');
    const { sahip } = ortam;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('RZ-', 0) ON CONFLICT DO NOTHING");
    malzemeNo = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, logo_kayit_no, logo_gonderim_durumu, logo_gonderim_zamani)
       VALUES ('rz-1', 'hammadde', 'RZ-', 1, 'aktif', $1, $2, $2, 8123, 'gonderildi', now()) RETURNING no`, [JSON.stringify({ id: 'rz-1', com: { ad: 'ORN deneme' } }), yoneticiId]))!.no;
    mamulNo = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('rz-2', 'mamul', 'RZ-', 2, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'rz-2', com: { ad: 'ORN mamul', birim: 'adet' } }), yoneticiId]))!.no;
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'rz-yonetici', parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    cerez.set('rz-yonetici', String(c.headers['set-cookie']).split(';')[0] ?? '');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  // 3374: satış teklifi ve siparişinin giden satırı Siparişler'in Logo sırası kimliğiyle tutulur. Sıra kimlikleri belge kimliklerinden
  // uzaklaştırılır (500'den başlar); belge kimliğiyle yazılmış eski biçim satır okunmamalıdır.
  test('RZ-2 teklif ve satış siparişi rozeti Logo sırasından okunur; en yeni sürümün izi geçerlidir; izi olmayan belge listede yok', async () => {
    const yonetici = cerez.get('rz-yonetici') ?? '';
    const yaz = async <T>(yol: string, govde: unknown): Promise<T> => {
      const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: yonetici, 'istek-kimligi': randomUUID() }, payload: govde as object });
      assert.equal(c.statusCode, 200, `${yol}: ${c.body}`);
      return c.json() as T;
    };
    const { sahip } = ortam!;
    await sahip.sorgu("SELECT setval(pg_get_serial_sequence('siparisler_logo_gonderim', 'id'), 500)");
    const firmaId = (await yaz<{ firma: { id: number } }>('/musteri-tedarikci/firmalar/ekle', { ad: 'ORN rozet firma', tur: 'musteri', logoCariKodu: 'ORN-C-1' })).firma.id;
    const teklif = async (): Promise<number> => {
      const t = await yaz<{ id: number; surum: number; satirlar: { id: number }[] }>('/siparisler/teklifler/ekle', {
        firmaId, baslik: 'ORN rozet', istenenTarih: null, aciklama: null, satirlar: [{ malzemeNo: mamulNo, tanim: 'ORN parça', miktar: '3' }],
      });
      await yaz(`/siparisler/teklifler/${String(t.id)}/surum-ver`, { surum: t.surum, fiyatlar: [{ satirId: t.satirlar[0]!.id, birimFiyat: '50' }], iskontoOrani: '0' });
      return t.id;
    };
    const sira = async (tur: string, teklifId: number, surum = 1): Promise<number> =>
      (await sahip.tek<{ id: number }>('SELECT id FROM siparisler_logo_gonderim WHERE tur = $1 AND teklif_id = $2 AND surum_no = $3', [tur, teklifId, surum]))!.id;
    const a = await teklif();
    const b = await teklif();
    const bos = await teklif();
    // C'nin ikinci sürümünün sırasında henüz iz yok (giden satırı ve kart beklemesi yok): rozet ilk sürümün "Logo'da" izini gösterir.
    const c = await teklif();
    // A'nın ikinci sürümü: ilk sürüm Logo'da, ikinci sırada; rozet "Sırada" der.
    await sahip.sorgu(`INSERT INTO siparisler_teklif_surumu (teklif_id, surum_no, olusturan_id) SELECT teklif_id, 2, olusturan_id FROM siparisler_teklif_surumu
      WHERE teklif_id = $1 AND surum_no = 1`, [a]);
    await sahip.sorgu("INSERT INTO siparisler_logo_gonderim (tur, teklif_id, surum_no) VALUES ('teklif', $1, 2)", [a]);
    await sahip.sorgu(`INSERT INTO siparisler_teklif_surumu (teklif_id, surum_no, olusturan_id) SELECT teklif_id, 2, olusturan_id FROM siparisler_teklif_surumu
      WHERE teklif_id = $1 AND surum_no = 1`, [c]);
    await sahip.sorgu("INSERT INTO siparisler_logo_gonderim (tur, teklif_id, surum_no) VALUES ('teklif', $1, 2)", [c]);
    const sip = (await yaz<{ id: number }>('/siparisler/ekle', {
      firmaId, musteriSiparisNo: null, siparisTarihi: '2026-11-17', termin: '2026-12-17', kdvOrani: '20', odemeKosulu: null, aciklama: null,
      satirlar: [{ malzemeNo: mamulNo, miktar: '3', birimFiyat: '50', termin: null, aciklama: null }],
    })).id;
    await sahip.sorgu("INSERT INTO siparisler_logo_gonderim (tur, teklif_id, surum_no, siparis_id) VALUES ('siparis', $1, 1, $2)", [b, sip]);
    const ekle = (tur: string, no: number, kolon: string, deger: string) =>
      vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no${kolon}) VALUES ($1, $2${deger})`, [tur, no]);
    await ekle('siparisler-teklifi', await sira('teklif', a), ", son_deneme, son_sonuc, logo_kayit_no", ", now(), 'gonderildi', '9001'");
    await ekle('siparisler-teklifi', await sira('teklif', a, 2), ', niyet_zamani', ', now()');
    await ekle('siparisler-teklifi', await sira('teklif', c), ", son_deneme, son_sonuc, logo_kayit_no", ", now(), 'gonderildi', '9003'");
    await ekle('siparisler-teklifi', await sira('teklif', b), ', son_deneme, son_sonuc, son_hata', ", now(), 'reddedildi', 'Deneme ret'");
    await ekle('siparisler-siparisi', await sira('siparis', b), ", son_deneme, son_sonuc, logo_kayit_no", ", now(), 'gonderildi', '9004'");
    // Belge kimliğiyle yazılmış satır (eski okuma bunu bulurdu): rozet bunu görmez.
    await ekle('siparisler-teklifi', bos, ", son_deneme, son_sonuc, logo_kayit_no", ", now(), 'gonderildi', '7777'");
    await ekle('siparisler-siparisi', sip, ', son_deneme, son_sonuc, son_hata', ", now(), 'reddedildi', 'Eski biçim'");

    const t = await oku('rz-satis', `tur=teklif&id=${String(a)},${String(b)},${String(bos)},${String(c)}`);
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    assert.deepEqual(t.govde.durumlar, [
      { id: a, durum: 'sirada', kayitNo: null, neden: null, elle: false },
      { id: b, durum: 'durdu', kayitNo: null, neden: 'Deneme ret', elle: false },
      { id: c, durum: 'logoda', kayitNo: '9003', neden: null, elle: false },
    ]);
    const s = await oku('rz-satis', `tur=satis-siparisi&id=${String(sip)},${String(b)}`);
    assert.deepEqual(s.govde.durumlar, [{ id: sip, durum: 'logoda', kayitNo: '9004', neden: null, elle: false }]);
  });

  test('RZ-5 malzeme: hizmet satırı da sayılır, kayıt no\'lu satır seçilir; giden satırı olmayan bağlı kart Logo\'da', async () => {
    const m = await oku('rz-malzeme', `tur=malzeme&id=10,11,${String(malzemeNo)}`);
    assert.equal(m.durum, 200, JSON.stringify(m.govde));
    assert.deepEqual(m.govde.durumlar, [
      { id: 10, durum: 'logoda', kayitNo: '7010', neden: null, elle: false },
      { id: 11, durum: 'sirada', kayitNo: null, neden: null, elle: false },
      { id: malzemeNo, durum: 'logoda', kayitNo: '8123', neden: null, elle: false },
    ]);
  });

  test('RZ-3 yetki türe göre; oturumsuz 401; sınırı aşan ve bozuk kimlik 400', async () => {
    assert.equal((await oku('rz-satinalma', 'tur=teklif&id=1')).durum, 403);
    assert.equal((await oku('rz-satis', 'tur=satin-alma-siparisi&id=1')).durum, 403);
    assert.equal((await oku('rz-satinalma', 'tur=satin-alma-siparisi&id=1')).durum, 200);
    assert.equal((await oku('yok', 'tur=teklif&id=1')).durum, 401);
    assert.equal((await oku('rz-satis', `tur=teklif&id=${Array.from({ length: 201 }, (_, i) => i + 1).join(',')}`)).durum, 400);
    assert.equal((await oku('rz-satis', 'tur=teklif&id=1,x')).durum, 400);
  });
});
