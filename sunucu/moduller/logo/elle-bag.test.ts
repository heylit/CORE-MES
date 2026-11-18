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
import {
  logoyaGidecekSatisSiparisleri, logoyaGidecekSatisTeklifleri, satisSiparisiLogoSonucu, satisTeklifiLogoSonucu,
} from '../siparisler/disari.ts';
import { belgeBagla } from './elle-bag.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { ELLE_BAGLI_TEKLIF_SIPARISI, ELLE_BAGLI_TEKLIF_SURUMU, baglamaUyumu, baglanacakEngeli } from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { logoBelgeAra, satisTuru, yeniSurecBellegi } from './servis.ts';
import type { SatisKaynagi } from './servis.ts';

// 3360-2 a: Logo'ya elle girilmiş belgeyi CORE belgesine bağlama. Köprü sahte, Logo'ya yazma yok. Veri uydurmadır (ORN-).
const PAROLA = 'dogru-parola-1';

describe('elle bağlama kuralı (3360-2)', () => {
  test('EB-1 satışta aynı cari, projede aynı kod; iptal ve başka belgeye bağlı kayıt bağlanmaz; CORE belgesi Logo\'daysa ya da giderken bağlanmaz', () => {
    const logo = (ek: object = {}) => ({ iptal: false, cariKodu: 'orn-c-1', projeKodu: null, baskaBagli: false, ...ek });
    const core = { cariKodu: 'ORN-C-1 ', projeKodu: null };
    assert.equal(baglamaUyumu('teklif', core, logo()), null, 'büyük-küçük harf ve boşluk fark etmez');
    assert.match(baglamaUyumu('satis-siparisi', core, logo({ cariKodu: 'ORN-C-2' })) ?? '', /Cari farklı/);
    assert.match(baglamaUyumu('teklif', { cariKodu: null, projeKodu: null }, logo()) ?? '', /cari kodu yok/);
    assert.match(baglamaUyumu('teklif', core, logo({ iptal: true })) ?? '', /iptal/);
    assert.match(baglamaUyumu('teklif', core, logo({ baskaBagli: true })) ?? '', /Başka bir CORE belgesine/);
    assert.equal(baglamaUyumu('proje', { cariKodu: null, projeKodu: 'ORN.P1' }, logo({ cariKodu: null, projeKodu: 'orn.p1' })), null);
    assert.match(baglamaUyumu('proje', { cariKodu: null, projeKodu: 'ORN.P1' }, logo({ cariKodu: 'ORN-C-1', projeKodu: 'ORN.P2' })) ?? '', /Proje kodu farklı/);

    assert.equal(baglanacakEngeli(null, undefined), null);
    assert.match(baglanacakEngeli(null, null) ?? '', /gidecek durumda değil/);
    assert.match(baglanacakEngeli({ sonSonuc: 'gonderildi', niyetZamani: null, logoKayitNo: '9' }, undefined) ?? '', /zaten Logo'da \(kayıt 9\)/);
    assert.match(baglanacakEngeli(null, { durum: 'gonderildi', logoKayitNo: null }) ?? '', /zaten Logo'da/);
    assert.match(baglanacakEngeli({ sonSonuc: null, niyetZamani: new Date(), logoKayitNo: null }, { durum: 'bekliyor', logoKayitNo: null }) ?? '', /gönderiliyor/);
    assert.equal(baglanacakEngeli({ sonSonuc: 'reddedildi', niyetZamani: null, logoKayitNo: null }, { durum: 'hata', logoKayitNo: null }), null, 'duran belge bağlanır');
  });
});

describe('elle bağlama, sahte köprüyle (3360-2; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kopru: SahteKopru;
  let yoneticiId = 0;
  let teklifId = 0;
  let teklifNo = '';
  let siparisId = 0;
  let projeId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function istek(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: unknown }> {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: cerez.get(kim) ?? '', 'istek-kimligi': randomUUID() }, ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: c.json() };
  }
  async function yaz<T>(yol: string, govde: unknown): Promise<T> {
    const c = await istek('eb-yonetici', 'POST', yol, govde);
    assert.equal(c.durum, 200, `${yol}: ${JSON.stringify(c.govde)}`);
    return c.govde as T;
  }
  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }
  async function girisliKisi(kullaniciAdi: string, islemler: string[]): Promise<void> {
    const kod = `gecici_eb_${kullaniciAdi.replace(/-/g, '_')}`;
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
  const ayar = (anahtar: string, deger: boolean) => yaz(`/ayarlar/${anahtar}/degistir`, { deger });
  const k = () => kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: 5000 });
  const ara = (tur: 'proje' | 'satis-siparisi' | 'teklif' | 'talep', q: string, belge?: number) =>
    logoBelgeAra(vt(), k(), tur, q, true, { kisiId: yoneticiId, ...(belge === undefined ? {} : { belge }) });
  const bagliyaz = (tur: 'proje' | 'satis-siparisi' | 'teklif', belgeId: number, logoKayitNo: number) =>
    vt().tx((db) => belgeBagla(db, yoneticiId, { tur, belgeId, logoKayitNo }, new Date()));
  // Kişi önce arar, sonra bağlar (sunucu son aramayı hatırlar).
  const bagla = async (tur: 'proje' | 'satis-siparisi' | 'teklif', belgeId: number, logoKayitNo: number, q: string) => {
    await ara(tur, q, belgeId);
    return bagliyaz(tur, belgeId, logoKayitNo);
  };
  const sira = async (tur: 'teklif' | 'siparis', surum = 1) =>
    (await ortam!.sahip.tek<{ id: number; durum: string; logo_kayit_no: string | null }>(
      'SELECT id, durum, logo_kayit_no FROM siparisler_logo_gonderim WHERE tur = $1 AND teklif_id = $2 AND surum_no = $3', [tur, teklifId, surum]))!;
  const giden = (tur: string, no: number) => ortam!.sahip.tek<{ son_sonuc: string | null; logo_kayit_no: string | null; elle: boolean }>(
    'SELECT son_sonuc, logo_kayit_no, elle_baglandi IS NOT NULL AS elle FROM logo_giden WHERE belge_turu = $1 AND belge_no = $2', [tur, no]);
  const yazmalar = (): string[] => kopru.istekler.filter((i) => i.yontem !== 'GET').map((i) => i.yol);

  before(async () => {
    ortam = await testVeritabaniKur('logoellebag');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'eb-yonetici', parola: PAROLA }));
    await giris('eb-yonetici');
    await girisliKisi('eb-satis-oku', ['siparisler.oku']);
    await girisliKisi('eb-satis-yaz', ['siparisler.oku', 'siparisler.yaz']);
    const { sahip } = ortam;
    await sahip.sorgu("SELECT setval(pg_get_serial_sequence('siparisler_logo_gonderim', 'id'), 700)");
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('EB-', 0) ON CONFLICT DO NOTHING");
    const mamul = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('eb-1', 'mamul', 'EB-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'eb-1', com: { ad: 'ORN mamul', birim: 'adet' } }), yoneticiId]))!.no;
    const firmaId = (await yaz<{ firma: { id: number } }>('/musteri-tedarikci/firmalar/ekle', { ad: 'ORN bag firma', tur: 'musteri', logoCariKodu: 'ORN-C-2001' })).firma.id;
    const t = await yaz<{ id: number; no: string; surum: number; satirlar: { id: number }[] }>('/siparisler/teklifler/ekle', {
      firmaId, baslik: 'ORN bag', istenenTarih: null, aciklama: null, satirlar: [{ malzemeNo: mamul, tanim: 'ORN parça', miktar: '3' }],
    });
    await yaz(`/siparisler/teklifler/${String(t.id)}/surum-ver`, { surum: t.surum, fiyatlar: [{ satirId: t.satirlar[0]!.id, birimFiyat: '50' }], iskontoOrani: '0' });
    teklifId = t.id;
    teklifNo = t.no;
    siparisId = (await yaz<{ id: number }>('/siparisler/ekle', {
      firmaId, musteriSiparisNo: null, siparisTarihi: '2026-11-17', termin: '2026-12-17', kdvOrani: '20', odemeKosulu: null, aciklama: null,
      satirlar: [{ malzemeNo: mamul, miktar: '3', birimFiyat: '50', termin: null, aciklama: null }],
    })).id;
    projeId = (await sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ORN.EB1', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    kopru = await sahteKopruAc();
    kopru.logoBelgeleri.push(
      { type: 'salesOffer', logicalRef: 61, number: 'ORN-TK-61', date: '2026-11-15', arpCode: 'orn-c-2001', arpName: 'ORN bag firma', description: 'ORN-BAG elle', netTotal: 150, cancelled: false, lines: [] },
      { type: 'salesOffer', logicalRef: 62, number: 'ORN-TK-62', arpCode: 'ORN-C-9999', description: 'ORN-BAG baska cari', lines: [] },
      { type: 'salesOffer', logicalRef: 63, number: 'ORN-TK-63', arpCode: 'ORN-C-2001', description: 'ORN-BAG iptal', cancelled: true, lines: [] },
      // Aynı kayıt numarası satış siparişi aramasında da çıkar: başka türdeki arama teklife bağlatmaz.
      { type: 'salesOrder', logicalRef: 61, number: 'ORN-SS-61', arpCode: 'ORN-C-2001', description: 'ORN-TUR elle', lines: [] },
      { type: 'salesOrder', logicalRef: 71, number: 'ORN-SS-71', arpCode: 'ORN-C-2001', description: 'ORN-BAG siparis', lines: [] },
      { type: 'project', logicalRef: 81, number: 'ORN.EB1', projectCode: 'ORN.EB1', projectName: 'Deneme proje', lines: [] },
      { type: 'project', logicalRef: 82, number: 'ORN.EB2', projectCode: 'ORN.EB2', projectName: 'ORN.EB1 benzeri', lines: [] },
    );
    await ayar('logo.baglanti', true);
    await ayar('logo.belge-aramasi', true);
  });
  after(async () => { await kopru?.kapat(); await app?.close(); await ortam?.kaldir(); });

  test('EB-2 aramada bağlanacak belge verilince her kayda uygunluk ve neden gelir; bağlama sırayı ve giden kutusunu "Logo\'da, elle" yazar, Logo\'ya yazmaz', async () => {
    const r = await ara('teklif', 'ORN-BAG', teklifId);
    assert.deepEqual(r.baglanacak, { no: teklifNo, tarih: r.baglanacak?.tarih ?? null, engel: null, tutar: { kdvHaric: '150.00', kdvDahil: null, paraBirimi: 'TRY' } });
    const fiyatsiz = await logoBelgeAra(vt(), k(), 'teklif', 'ORN-BAG', false, { kisiId: yoneticiId, belge: teklifId });
    assert.equal(fiyatsiz.baglanacak?.tutar, null, 'fiyatı görmeyene tutar gitmez');
    assert.deepEqual(r.belgeler.map((b) => [b.logoKayitNo, b.bagla?.uygun, b.bagla?.neden ?? null]), [
      [61, true, null],
      [62, false, 'Cari farklı; bağlanamaz.'],
      [63, false, "Logo'da iptal ya da pasif; bağlanamaz."],
    ]);
    assert.equal((await ara('teklif', 'ORN-BAG')).belgeler[0]?.bagla, null, 'belge verilmezse uygunluk yok');
    await assert.rejects(ara('talep', 'ORN-BAG', teklifId), /bağlama yok/);
    await assert.rejects(bagla('teklif', teklifId, 62, 'ORN-BAG'), /Cari farklı/);
    await assert.rejects(bagla('teklif', teklifId, 61, 'ORN-TK-62'), /son aramanızda yok/, 'kişinin son aramasında olmayan kayıt bağlanmaz');
    assert.deepEqual((await ara('satis-siparisi', 'ORN-TUR')).belgeler.map((b) => b.logoKayitNo), [61]);
    await assert.rejects(bagliyaz('teklif', teklifId, 61), /son aramanızda yok/, 'başka türdeki arama sayılmaz');
    await ara('teklif', 'ORN-BAG', teklifId);
    await assert.rejects(
      vt().tx((db) => belgeBagla(db, yoneticiId, { tur: 'teklif', belgeId: teklifId, logoKayitNo: 61 }, new Date(Date.now() + 31 * 60_000))),
      /son aramanızda yok/, '30 dakikadan eski arama sayılmaz',
    );
    // Elle bağ yalnız "zaten vardı" sonucuyla yazılabilir (göç kısıtı).
    await assert.rejects(
      vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no, son_deneme, son_sonuc, logo_kayit_no, elle_baglandi, elle_baglayan)
        VALUES ('siparisler-teklifi', 99999, now(), 'gonderildi', '99', now(), $1)`, [yoneticiId]),
      /logo_giden_elle_bag/,
    );
    assert.equal((await sira('teklif')).durum, 'bekliyor', 'reddedilen bağlama yazmaz');

    assert.deepEqual(await bagla('teklif', teklifId, 61, 'ORN-BAG'), { kayitNo: '61' });
    assert.deepEqual([(await sira('teklif')).durum, (await sira('teklif')).logo_kayit_no], ['gonderildi', '61']);
    assert.deepEqual(await giden('siparisler-teklifi', (await sira('teklif')).id), { son_sonuc: 'zaten-vardi', logo_kayit_no: '61', elle: true });
    const rozet = await istek('eb-satis-oku', 'GET', `/logo/belge-durumlari?tur=teklif&id=${String(teklifId)}`);
    assert.equal(rozet.durum, 200, JSON.stringify(rozet.govde));
    assert.deepEqual((rozet.govde as LogoRozetCevabi).durumlar, [{ id: teklifId, durum: 'logoda', kayitNo: '61', neden: null, elle: true }]);
    await assert.rejects(bagla('teklif', teklifId, 61, 'ORN-BAG'), /zaten Logo'da \(kayıt 61\)/);
    const tekrar = await ara('teklif', 'ORN-BAG', teklifId);
    assert.match(tekrar.baglanacak?.engel ?? '', /zaten Logo'da/);
    assert.deepEqual(tekrar.belgeler[0]?.core, { id: teklifId }, 'bağlanan kayıt CORE karşılığıyla görünür');
    assert.deepEqual(yazmalar(), [], "Logo'ya yazma isteği yok");
  });

  test('EB-3 elle bağlı teklifin yeni sürümü ve tekliften sipariş gönderilmez; neden yazılır, köprüye istek gitmez', async () => {
    const { sahip } = ortam!;
    await sahip.sorgu(`INSERT INTO siparisler_teklif_surumu (teklif_id, surum_no, olusturan_id) SELECT teklif_id, 2, olusturan_id FROM siparisler_teklif_surumu
      WHERE teklif_id = $1 AND surum_no = 1`, [teklifId]);
    await sahip.sorgu("INSERT INTO siparisler_logo_gonderim (tur, teklif_id, surum_no) VALUES ('teklif', $1, 2)", [teklifId]);
    await sahip.sorgu("UPDATE siparisler_siparis SET durum = 'onayli', onay_zamani = now(), onaylayan_id = $2 WHERE id = $1", [siparisId, yoneticiId]);
    await sahip.sorgu("INSERT INTO siparisler_logo_gonderim (tur, teklif_id, surum_no, siparis_id) VALUES ('siparis', $1, 1, $2)", [teklifId, siparisId]);
    await ayar('logo.satis-gonderimi', true);
    const kaynak: SatisKaynagi = {
      teklifGidecekler: logoyaGidecekSatisTeklifleri, teklifSonucu: satisTeklifiLogoSonucu,
      siparisGidecekler: logoyaGidecekSatisSiparisleri, siparisSonucu: satisSiparisiLogoSonucu,
    };
    const o = { kopru: k(), bellek: yeniSurecBellegi(), saat: () => new Date(), kaynak };
    const once = kopru.istekler.length;
    const ikinci = await sira('teklif', 2);
    assert.deepEqual(await satisTuru(vt(), o), { tur: 'siparisler-teklifi', no: ikinci.id, sonuc: 'reddedildi' });
    const sip = await sira('siparis');
    assert.deepEqual(await satisTuru(vt(), o), { tur: 'siparisler-siparisi', no: sip.id, sonuc: 'reddedildi' });
    assert.deepEqual(await satisTuru(vt(), o), { tur: 'bos' }, 'duran iş kendiliğinden yeniden denenmez');
    assert.equal(kopru.istekler.length, once, 'köprüye istek yok');
    const hata = (id: number) => sahip.tek<{ durum: string; hata: string }>('SELECT durum, hata FROM siparisler_logo_gonderim WHERE id = $1', [id]);
    assert.deepEqual(await hata(ikinci.id), { durum: 'hata', hata: ELLE_BAGLI_TEKLIF_SURUMU });
    assert.deepEqual(await hata(sip.id), { durum: 'hata', hata: ELLE_BAGLI_TEKLIF_SIPARISI });
    // Siparişin kendisi Logo'da elle açıldıysa o da bağlanır; teklif kuralı engel olmaz.
    assert.deepEqual((await ara('satis-siparisi', 'ORN-BAG', siparisId)).baglanacak?.tutar, { kdvHaric: '150.00', kdvDahil: '180.00', paraBirimi: 'TRY' });
    assert.deepEqual(await bagla('satis-siparisi', siparisId, 71, 'ORN-BAG'), { kayitNo: '71' });
    assert.deepEqual(await giden('siparisler-siparisi', sip.id), { son_sonuc: 'zaten-vardi', logo_kayit_no: '71', elle: true });
    // Teklifin yeni sürümü, ilk sürümün bağlı olduğu Logo kaydına ikinci kez bağlanmaz.
    await assert.rejects(bagla('teklif', teklifId, 61, 'ORN-BAG'), /Başka bir CORE belgesine bağlı/);
  });

  test('EB-4 proje aynı kodla bağlanır; uçta bağlama yazma yetkisi, bağı kaldırma yönetici ister; kaldırılınca belge yeniden sıraya döner', async () => {
    const r = await ara('proje', 'ORN.EB', projeId);
    assert.equal(r.baglanacak?.tutar, null, 'projede tutar yok');
    assert.deepEqual(r.belgeler.map((b) => [b.logoKayitNo, b.bagla?.neden ?? null]), [[81, null], [82, 'Proje kodu farklı; bağlanamaz.']]);
    assert.deepEqual(await bagla('proje', projeId, 81, 'ORN.EB'), { kayitNo: '81' });
    assert.deepEqual(await giden('proje', projeId), { son_sonuc: 'zaten-vardi', logo_kayit_no: '81', elle: true });

    const govde = { tur: 'teklif', belgeId: teklifId, logoKayitNo: 61 };
    assert.equal((await istek('eb-satis-oku', 'POST', '/logo/belge-bagla', govde)).durum, 403, 'okuyan bağlayamaz');
    assert.equal((await istek('eb-satis-yaz', 'POST', '/logo/belge-bagla', { ...govde, tur: 'proje' })).durum, 403, 'satış yazan proje bağlayamaz');
    const yok = await istek('eb-satis-yaz', 'POST', '/logo/belge-bagla', govde);
    assert.equal(yok.durum, 422, 'bu kişi aramadı (testte ortam köprüsü yok)');
    assert.match(JSON.stringify(yok.govde), /son aramanızda yok/);
    const kaldir = { tur: 'teklif', belgeId: teklifId };
    assert.equal((await istek('eb-satis-yaz', 'POST', '/logo/belge-bag-kaldir', kaldir)).durum, 403, 'bağı yalnız yönetici kaldırır');
    // En yeni sıra (sürüm 2) elle bağlı değil: kaldırılacak bağ yok.
    assert.equal((await istek('eb-yonetici', 'POST', '/logo/belge-bag-kaldir', kaldir)).durum, 409);
    const p = await istek('eb-yonetici', 'POST', '/logo/belge-bag-kaldir', { tur: 'proje', belgeId: projeId });
    assert.deepEqual(p, { durum: 200, govde: { kayitNo: null } });
    assert.deepEqual(await giden('proje', projeId), { son_sonuc: null, logo_kayit_no: null, elle: false });
    const s = await istek('eb-yonetici', 'POST', '/logo/belge-bag-kaldir', { tur: 'satis-siparisi', belgeId: siparisId });
    assert.equal(s.durum, 200, JSON.stringify(s.govde));
    assert.deepEqual([(await sira('siparis')).durum, (await sira('siparis')).logo_kayit_no], ['bekliyor', null]);
    assert.equal((await istek('eb-yonetici', 'POST', '/logo/belge-bag-kaldir', { tur: 'proje', belgeId: projeId })).durum, 409, 'ikinci kez kaldırılamaz');
  });
});
