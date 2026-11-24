import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { teslimCevabi } from '#paylasilan/sozlesme/stok.ts';
import { kablola } from '../../kablolama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { cncTakimCikisi } from '../stok/disari.ts';
import { canliPlanOkuyucusu } from './disari.ts';

const PAROLA = 'dogru-parola-1';

// 3613 Takımhane (Dilim 1-2): bakiye Stok'ta tek defterdir; takım kartı TKM koduyla katalogda, çıkış kişi konumuna ya da istasyona gider.
// Risk koşulları: K1 kişideki takım stok önerisine girmez (kurallar.test.ts), K2 CNC değişimi önce tezgâhtan düşer, K3 kişi teslimini yalnız o kişi alır.
describe('takimhane (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerez = new Map<string, string>();
  const kisiler = new Map<string, number>();
  let rafKonumu = 0; let araAlan = 0; let hurdaKonumu = 0; let istasyonId = 0; let sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const istek = async <T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> => {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: cerez.get(kim) ?? '', 'istek-kimligi': randomUUID() },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: (c.body === '' ? undefined : c.json()) as T };
  };
  async function kart(): Promise<number> {
    sira += 1;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('TKM-', 0) ON CONFLICT (onek) DO NOTHING");
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'sarf', 'TKM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`tkm-${sira}`, sira, JSON.stringify({ id: `tkm-${sira}`, com: { ad: `Deneme takım ${sira}`, birim: 'adet' } }), kisiler.get('depo')],
    );
    return r!.no;
  }
  // Giriş mal kabulle, raf konumuna taşıma Stok'un taşıma ucuyla: bakiye defteri Stok'un kendi yolundan yazılır.
  async function rafaKoy(malzemeId: number, miktar: string): Promise<void> {
    const kabul = (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE tur = 'kabul' AND aktif ORDER BY id LIMIT 1"))!.id;
    const g = await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId, miktar }] });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    const t = await istek('depo', 'POST', '/stok/tasima', { malzemeId, kaynakKonumId: kabul, hedefKonumId: rafKonumu, miktar });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
  }
  const bakiye = async (malzemeId: number, konumId: number): Promise<number> =>
    Number((await o().vt.tek<{ m: string | null }>('SELECT sum(miktar)::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2', [malzemeId, konumId]))?.m ?? 0);
  const kisiKonumu = async (kisi: string): Promise<number> =>
    (await o().vt.tek<{ id: number }>('SELECT id FROM stok_konum WHERE kisi_id = $1', [kisiler.get(kisi)]))!.id;
  const istasyonKonumu = async (): Promise<number> => (await o().vt.tek<{ id: number }>('SELECT id FROM stok_konum WHERE istasyon_id = $1', [istasyonId]))!.id;
  async function cikis(kartKimlik: number, adet: number, alan: { kisiId: number | null; istasyonId: number | null }) {
    const c = await istek('depo', 'POST', '/takimhane/cikis', { kartKimlik, adet, uretimEmriId: null, istekKimligi: randomUUID(), ...alan });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return teslimCevabi.parse(c.govde).teslim;
  }
  async function teslimAl(kim: string, t: { id: number; surum: number }, alinan: string) {
    return istek(kim, 'POST', `/stok/teslimler/${t.id}/teslim-al`, { surum: t.surum, alinan });
  }

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('takimhane');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    for (const ad of ['depo', 'kisi-a', 'kisi-b']) {
      kisiler.set(ad, await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA })));
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
      assert.equal(g.statusCode, 200);
      cerez.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
    }
    // Takımhane operatörü: yönetici rolünü bırakıp yalnız kendi rolünü taşır (rol x işlem satırlarını sınar).
    const operatorId = await ortam.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme operatör', kullaniciAdi: 'takimci', parola: PAROLA });
      const rolId = (await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'takimhane_operatoru'"))!.id;
      const kisi = await rolAta(db, kisiler.get('depo')!, id, rolId);
      for (const rol of kisi.roller) if (rol.id !== rolId) await rolAl(db, kisiler.get('depo')!, id, rol.id);
      return id;
    });
    kisiler.set('takimci', operatorId);
    const gt = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'takimci', parola: PAROLA } });
    assert.equal(gt.statusCode, 200);
    cerez.set('takimci', String(gt.headers['set-cookie']).split(';')[0] ?? '');
    const depo = (await ortam.vt.tek<{ id: number }>("SELECT id FROM stok_depo WHERE kod = 'ANA'"))!.id;
    const konumAc = async (kod: string, tur: string) =>
      (await ortam!.sahip.tek<{ id: number }>(
        `INSERT INTO stok_konum (depo_id, kod, tur, ad, bolme_no, kat_no) VALUES ($1, $2, $3, $2, ${tur === 'raf_gozu' ? '1, 1' : 'NULL, NULL'}) RETURNING id`, [depo, kod, tur]))!.id;
    rafKonumu = await konumAc('TKR-1', 'raf_gozu');
    araAlan = await konumAc('TKA-1', 'ara_alan');
    hurdaKonumu = await konumAc('TKH-1', 'hurda');
    const im = (await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('TKM-IM', 'Deneme merkezi') RETURNING id"))!.id;
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('TKM-IST', 'Deneme tezgâhı', $1, true) RETURNING id", [im]))!.id;
    await ortam.sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur, ad, istasyon_id) VALUES ($1, 'IST-TKM', 'istasyon', 'Deneme tezgâhı', $2)", [depo, istasyonId]);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('takım listesi konuma göre dağılır; özelliği ve sipariş noktası yoksa null kalır, eşiksiz ayrı sayılır', async () => {
    const k = await kart();
    await rafaKoy(k, '5');
    const l = await istek<{ takimlar: { kartKimlik: number; konumlar: Record<string, number | null>; toplam: number; kritikSeviye: number | null; sinif: string; capMm: string | null }[] }>('depo', 'GET', '/takimhane/takimlar');
    assert.equal(l.durum, 200);
    const s = l.govde.takimlar.find((t) => t.kartKimlik === k)!;
    assert.deepEqual(s.konumlar, { raf: 5, tezgah: null, kisi: null, bileme: null, ara: null });
    assert.equal(s.toplam, 5);
    assert.equal(s.kritikSeviye, null);
    assert.equal(s.capMm, null);
    const oz = await istek<{ esiksiz: number; kalem: number }>('depo', 'GET', '/takimhane/ozet');
    assert.equal(oz.durum, 200);
    assert.ok(oz.govde.esiksiz >= 1);
    // Takım kartı olmayan kalem listede çıkmaz.
    sira += 1;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('DGR-', 0) ON CONFLICT (onek) DO NOTHING");
    const d = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('dgr-1', 'sarf', 'DGR-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'dgr-1', com: { ad: 'Takım değil' } }), kisiler.get('depo')]))!.no;
    assert.ok(!(await istek<{ takimlar: { kartKimlik: number }[] }>('depo', 'GET', '/takimhane/takimlar')).govde.takimlar.some((t) => t.kartKimlik === d));
  });

  test('özellik yazılır ve tekrar yazılınca güncellenir; olmayan takım kartı bulunamaz', async () => {
    const k = await kart();
    const govde = { sinif: 'freze', capMm: 12, kesiciSayisi: 4, isoKodu: 'ISO-1', malzemeGruplari: ['P', 'M'], yenidenBilenir: true, izleme: 'adet' };
    assert.equal((await istek('depo', 'POST', `/takimhane/takimlar/${k}/ozellik`, govde)).durum, 200);
    assert.equal((await istek('depo', 'POST', `/takimhane/takimlar/${k}/ozellik`, { ...govde, capMm: 16 })).durum, 200);
    const s = (await istek<{ takimlar: { kartKimlik: number; capMm: string; sinif: string; malzemeGruplari: string[] }[] }>('depo', 'GET', '/takimhane/takimlar')).govde.takimlar.find((t) => t.kartKimlik === k)!;
    assert.deepEqual([s.sinif, Number(s.capMm), s.malzemeGruplari], ['freze', 16, ['P', 'M']]);
    assert.equal((await istek('depo', 'POST', '/takimhane/takimlar/2147483000/ozellik', govde)).durum, 404);
  });

  test('K3: kişiye çıkış yolda açılır; yalnız o kişi alır, gönderen ve başka kişi alamaz; alınca kişide görünür', async () => {
    const k = await kart();
    await rafaKoy(k, '5');
    const t = await cikis(k, 3, { kisiId: kisiler.get('kisi-a')!, istasyonId: null });
    assert.equal(t.durum, 'yolda');
    assert.equal(await bakiye(k, rafKonumu), 5, 'gönderim stok yazmaz');
    assert.equal((await teslimAl('depo', t, '3')).durum, 403, 'gönderen alamaz');
    assert.equal((await teslimAl('kisi-b', t, '3')).durum, 403, 'başka kişi alamaz');
    const al = await teslimAl('kisi-a', t, '3');
    assert.equal(al.durum, 200, JSON.stringify(al.govde));
    assert.equal(await bakiye(k, rafKonumu), 2);
    assert.equal(await bakiye(k, await kisiKonumu('kisi-a')), 3);
    const d = (await istek<{ teslimler: { kartKimlik: number; adet: number; alanTuru: string; alan: string }[] }>('depo', 'GET', '/takimhane/teslimdekiler')).govde.teslimler.filter((x) => x.kartKimlik === k);
    assert.deepEqual(d.map((x) => [x.adet, x.alanTuru]), [[3, 'kisi']]);
  });

  test('iade: durum hedefi belirler (sağlam raf, aşınmış ara alan, kırık hurda); kırık nedensiz olmaz; konumdan fazlası iade edilmez', async () => {
    const k = await kart();
    await rafaKoy(k, '6');
    const t = await cikis(k, 6, { kisiId: kisiler.get('kisi-a')!, istasyonId: null });
    assert.equal((await teslimAl('kisi-a', t, '6')).durum, 200);
    const konum = await kisiKonumu('kisi-a');
    const iade = (govde: Record<string, unknown>) => istek('depo', 'POST', '/takimhane/iade', { kartKimlik: k, konumKimligi: konum, istekKimligi: randomUUID(), neden: null, ...govde });
    assert.equal((await iade({ adet: 1, durum: 'kirik' })).durum, 400, 'kırık iade nedensiz olmaz');
    assert.equal((await iade({ adet: 7, durum: 'saglam' })).durum, 400, 'konumdakinden fazlası iade edilmez');
    { const r = await iade({ adet: 3, durum: 'saglam' }); assert.equal(r.durum, 200, JSON.stringify(r.govde)); }
    assert.equal((await iade({ adet: 2, durum: 'asinmis' })).durum, 200);
    assert.equal((await iade({ adet: 1, durum: 'kirik', neden: 'Mandren çarpması' })).durum, 200);
    assert.equal(await bakiye(k, rafKonumu), 3);
    assert.equal(await bakiye(k, araAlan), 2);
    assert.equal(await bakiye(k, hurdaKonumu), 1);
    assert.equal(await bakiye(k, konum), 0);
    const kayit = await o().vt.sorgu<{ iade_durumu: string; iade_nedeni: string | null }>(
      'SELECT iade_durumu, iade_nedeni FROM stok_teslim WHERE malzeme_id = $1 AND iade_durumu IS NOT NULL ORDER BY id', [k]);
    assert.deepEqual(kayit.map((r) => [r.iade_durumu, r.iade_nedeni]), [['saglam', null], ['asinmis', null], ['kirik', 'Mandren çarpması']]);
  });

  test('K2: CNC takım değişimi önce istasyondaki bakiyeden düşer (raf 5, istasyona 1, değişim 1 -> raf 4, istasyon 0)', async () => {
    const k = await kart();
    await rafaKoy(k, '5');
    const t = await cikis(k, 1, { kisiId: null, istasyonId });
    assert.equal((await teslimAl('kisi-a', t, '1')).durum, 200);
    const ist = await istasyonKonumu();
    assert.equal(await bakiye(k, ist), 1);
    const r = await o().vt.tx((db) => cncTakimCikisi(db, kisiler.get('depo')!, { malzemeId: k, miktar: '1', aciklama: 'CNC kurulum: T3 değişti', istasyonId }));
    assert.equal(r.yeterli, true);
    assert.equal(await bakiye(k, ist), 0);
    assert.equal(await bakiye(k, rafKonumu), 4);
    // İstasyonda yoksa raftan düşer; ikisi toplamda yetmezse hiç düşmez.
    const r2 = await o().vt.tx((db) => cncTakimCikisi(db, kisiler.get('depo')!, { malzemeId: k, miktar: '1', aciklama: 'CNC', istasyonId }));
    assert.equal(r2.yeterli, true);
    assert.equal(await bakiye(k, rafKonumu), 3);
    assert.deepEqual(await o().vt.tx((db) => cncTakimCikisi(db, kisiler.get('depo')!, { malzemeId: k, miktar: '9', aciklama: 'CNC', istasyonId })), { yeterli: false, mevcut: '3' });
  });

  test('N1: istasyon bilinmeyen CNC değişimi başka tezgâhın bakiyesine dokunmaz, yalnız raftan düşer', async () => {
    const k = await kart();
    await rafaKoy(k, '3');
    const t = await cikis(k, 1, { kisiId: null, istasyonId });
    assert.equal((await teslimAl('kisi-a', t, '1')).durum, 200);
    const ist = await istasyonKonumu();
    const r = await o().vt.tx((db) => cncTakimCikisi(db, kisiler.get('depo')!, { malzemeId: k, miktar: '1', aciklama: 'CNC' }));
    assert.equal(r.yeterli, true);
    assert.equal(await bakiye(k, ist), 1, 'tezgâh bakiyesi yerinde');
    assert.equal(await bakiye(k, rafKonumu), 1);
  });

  test('çıkış yalnız takım kartıyla, iade yalnız kişi ya da istasyondaki takımla yapılır', async () => {
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('MLZ-', 0) ON CONFLICT (onek) DO NOTHING");
    const diger = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('mlz-s2', 'sarf', 'MLZ-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'mlz-s2', com: { ad: 'Takım olmayan kart', birim: 'adet' } }), kisiler.get('depo')],
    ))!.no;
    await rafaKoy(diger, '3');
    const c = await istek('depo', 'POST', '/takimhane/cikis', { kartKimlik: diger, adet: 1, kisiId: kisiler.get('kisi-a')!, istasyonId: null, uretimEmriId: null, istekKimligi: randomUUID() });
    assert.equal(c.durum, 404, 'takım olmayan kart takımhane çıkışına girmez');
    assert.equal(await bakiye(diger, rafKonumu), 3);
    // Raf konumunda duran takım "iade" ile oradan alınmaz: iade yalnız kişi ya da istasyon konumundan başlar.
    const k = await kart();
    await rafaKoy(k, '2');
    const i = await istek('depo', 'POST', '/takimhane/iade', { kartKimlik: k, konumKimligi: rafKonumu, adet: 1, durum: 'saglam', neden: null, istekKimligi: randomUUID() });
    assert.equal(i.durum, 400, JSON.stringify(i.govde));
    assert.equal(await bakiye(k, rafKonumu), 2);
  });

  test('takımhane operatörü: görür, takım verir ve iade alır; özellik, başlangıç stoğu ve tanım yazamaz', async () => {
    const k = await kart();
    await rafaKoy(k, '4');
    assert.equal((await istek('takimci', 'GET', '/takimhane/ozet')).durum, 200);
    const c = await istek('takimci', 'POST', '/takimhane/cikis', { kartKimlik: k, adet: 1, kisiId: kisiler.get('kisi-a')!, istasyonId: null, uretimEmriId: null, istekKimligi: randomUUID() });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    // S2: operatör takım verir ve geri alır, ama genel stok.transfer taşımaz: işlem listesi yalnız takıma özgü işlemi içerir.
    const t = teslimCevabi.parse(c.govde).teslim;
    assert.equal((await teslimAl('kisi-a', t, '1')).durum, 200);
    const iade = await istek('takimci', 'POST', '/takimhane/iade', { kartKimlik: k, konumKimligi: await kisiKonumu('kisi-a'), adet: 1, durum: 'saglam', neden: null, istekKimligi: randomUUID() });
    assert.equal(iade.durum, 200, JSON.stringify(iade.govde));
    assert.equal(await bakiye(k, rafKonumu), 4, 'iade rafa döndü (mal kabul alanına düşmedi)');
    const rol = await o().sahip.tek<{ var: boolean; yok: boolean }>(
      "SELECT bool_or(ri.islem = 'takimhane.cikis-iade') AS var, NOT bool_or(ri.islem = 'stok.transfer') AS yok FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE r.kod = 'takimhane_operatoru'");
    assert.deepEqual(rol, { var: true, yok: true });
    assert.equal((await istek('takimci', 'POST', '/stok/sepet/teslim-et', {})).durum, 403);
    assert.equal((await istek('takimci', 'POST', '/stok/tasima', {})).durum, 403);
    assert.equal((await istek('takimci', 'POST', '/stok/teslimler/gonder', {})).durum, 403);
    assert.equal((await istek('takimci', 'POST', `/takimhane/takimlar/${k}/ozellik`, { sinif: 'freze', capMm: 1, kesiciSayisi: 1, isoKodu: null, malzemeGruplari: [], yenidenBilenir: false, izleme: 'adet' })).durum, 403);
    assert.equal((await istek('takimci', 'POST', '/takimhane/baslangic/onizleme', { satirlar: [] })).durum, 403);
  });

  test('emir takım listesi: yetmeyen takım eksik görünür, liste hazır olmaz; aynı cepte aynı takım iki kez yazılmaz', async () => {
    const k = await kart();
    await rafaKoy(k, '2');
    const emir = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ('P-TKM', 'Deneme parça', 5, $1, $2) RETURNING id", [istasyonId, kisiler.get('depo')]))!.id;
    const yaz = (satirlar: unknown[]) => istek<{ hazir: boolean; satirlar: { cep: string; adet: number; durum: string; eksik: number }[] }>('depo', 'POST', `/takimhane/emirler/${emir}/takimlar`, { satirlar });
    assert.equal((await yaz([{ cep: 'T01', kartKimlik: k, adet: 1 }, { cep: 'T01', kartKimlik: k, adet: 2 }])).durum, 400);
    const y = await yaz([{ cep: 'T01', kartKimlik: k, adet: 3 }]);
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    assert.equal(y.govde.hazir, false);
    assert.deepEqual(y.govde.satirlar.map((s) => [s.cep, s.durum, s.eksik]), [['T01', 'eksik', 1]]);
    const y2 = await yaz([{ cep: 'T01', kartKimlik: k, adet: 2 }]);
    assert.equal(y2.govde.hazir, true);
    assert.equal((await istek('depo', 'GET', `/takimhane/emirler/${emir}/takimlar`)).durum, 200);
  });

  test('başlangıç stoğu ön izlemesi: aynı kod toplanmaz, kategorisiz satır yazmayı engeller, boşluk temizlenir', async () => {
    const c = await istek<{ uygun: boolean; satirlar: { bulgu: string | null }[] }>('depo', 'POST', '/takimhane/baslangic/onizleme', {
      satirlar: [
        { kod: 'TKM-A1', ad: 'Freze', kategori: 'Freze', adet: 3, rafKodu: null },
        { kod: ' tkm-a1 ', ad: 'Freze', kategori: 'Freze', adet: 2, rafKodu: null },
        { kod: 'TKM-B1', ad: 'Matkap', kategori: null, adet: 1, rafKodu: null },
        { kod: 'TKM-C1', ad: ' Rayba  uç ', kategori: 'Rayba', adet: 1, rafKodu: null },
      ],
    });
    assert.equal(c.durum, 200);
    assert.equal(c.govde.uygun, false);
    assert.deepEqual(c.govde.satirlar.map((s) => s.bulgu), ['yinelenen-kod', 'yinelenen-kod', 'bos-kategori', 'bosluk']);
  });

  // ---- 3651 aparat: ayırma yazılmaz, canlı plan penceresi ile rotadaki istekten türetilir ------------------------------------------
  describe('aparat ayırma (3651)', () => {
    const pencere = new Map<number, { baslangic: string; bitis: string }>();
    interface EmirAp { emirId: number; isEmriId: number }
    let operasyonTipi = 0;
    async function aparatKarti(): Promise<number> {
      sira += 1;
      await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('APR-', 0) ON CONFLICT (onek) DO NOTHING");
      return (await o().sahip.tek<{ no: number }>(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, 'demirbas', 'APR-', $2, 'aktif', $3, $4, $4) RETURNING no`,
        [`apr-${sira}`, sira, JSON.stringify({ id: `apr-${sira}`, com: { ad: `ORN-Aparat ${sira}`, birim: 'adet' } }), kisiler.get('depo')]))!.no;
    }
    async function emirAc(kart: number, adet: number, bas: string, bit: string): Promise<EmirAp> {
      operasyonTipi ||= (await o().sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
      sira += 1;
      const emirId = (await o().sahip.tek<{ id: number }>(
        "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum) VALUES ($1, 'ORN-Parça', 5, $2, $3, 'planli') RETURNING id", [`P-APR-${sira}`, istasyonId, kisiler.get('depo')]))!.id;
      const isEmriId = (await o().sahip.tek<{ id: number }>(
        "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, istasyon_id) VALUES ($1, 1, 10, $2, 'OP10', $3) RETURNING id", [emirId, operasyonTipi, istasyonId]))!.id;
      await o().sahip.sorgu("INSERT INTO rota_is_emri_ekipmani (is_emri_id, sira, tur, malzeme_id, adet, asama) VALUES ($1, 1, 'aparat', $2, $3, 'isleme')", [isEmriId, kart, adet]);
      if (bas !== '') pencere.set(isEmriId, { baslangic: bas, bitis: bit });
      return { emirId, isEmriId };
    }
    type Cevap = { satirlar: { kartKimlik: number; konumlar: Record<string, number | null>; ayrilan: number; serbest: number; bekleyenIade: number }[]; karsilastirma: { kartKimlik: number; durum: string; kartPlanToplami: number; stokta: number }[] };
    type EmirCevap = { hazir: boolean; satirlar: { durum: string; eksik: number; disarida: number; konum: string | null }[] };
    const apr = async (): Promise<Cevap> => { const r = await istek<Cevap>('depo', 'GET', '/takimhane/aparat'); assert.equal(r.durum, 200, JSON.stringify(r.govde)); return r.govde; };
    const emirApr = async (id: number): Promise<EmirCevap> => { const r = await istek<EmirCevap>('depo', 'GET', `/takimhane/emirler/${id}/aparat`); assert.equal(r.durum, 200, JSON.stringify(r.govde)); return r.govde; };

    test('örtüşen iki emir rafı paylaşır, sonraki eksik görünür; plan işi kaldırınca ayırma kalkar; ayrık pencere eksik göstermez', async () => {
      canliPlanOkuyucusu(async (_db, idler) => idler.flatMap((i) => { const p = pencere.get(i); return p === undefined ? [] : [{ isEmriId: i, ...p }]; }));
      const k = await aparatKarti();
      await rafaKoy(k, '3');
      await o().sahip.sorgu("INSERT INTO istasyonlar_aparat_kapasitesi (aparat_karti_id, istasyon_id, adet, degistiren_kisi_id) VALUES ($1, $2, 2, $3)", [k, istasyonId, kisiler.get('depo')]);
      const a = await emirAc(k, 2, '2026-11-26T08:00:00Z', '2026-11-26T14:00:00Z');
      const b = await emirAc(k, 2, '2026-11-26T10:00:00Z', '2026-11-26T16:00:00Z');
      const c1 = await apr();
      const s = c1.satirlar.find((x) => x.kartKimlik === k)!;
      assert.deepEqual([s.konumlar.raf, s.ayrilan, s.serbest], [3, 3, 0]);
      assert.deepEqual(c1.karsilastirma.filter((x) => x.kartKimlik === k).map((x) => [x.durum, x.kartPlanToplami, x.stokta]), [['uyumlu', 2, 3]]);
      assert.deepEqual((await emirApr(a.emirId)).satirlar.map((x) => [x.durum, x.eksik]), [['ayrildi', 0]]);
      const eb = await emirApr(b.emirId);
      assert.deepEqual(eb.satirlar.map((x) => [x.durum, x.eksik]), [['eksik', 1]]);
      assert.equal(eb.hazir, false);
      // Plan B'yi kaldırır: ayırma kalkar, emir plan bekler.
      pencere.delete(b.isEmriId);
      assert.deepEqual((await emirApr(b.emirId)).satirlar.map((x) => x.durum), ['plan-bekliyor']);
      assert.equal((await apr()).satirlar.find((x) => x.kartKimlik === k)!.ayrilan, 2);
      // Plan B'yi A'dan sonraya kaydırır: pencereler ayrık, aynı adetler yeniden kullanılır.
      pencere.set(b.isEmriId, { baslangic: '2026-11-26T14:00:00Z', bitis: '2026-11-26T18:00:00Z' });
      assert.deepEqual((await emirApr(b.emirId)).satirlar.map((x) => x.durum), ['ayrildi']);
    });
    test('aparat çıkışı emre bağlıdır: tezgâhta görünür, rafı düşer; iade emre yazılır ve emrin dışarıdaki adedini düşürür; kırık iade neden ister', async () => {
      canliPlanOkuyucusu(async (_db, idler) => idler.flatMap((i) => { const p = pencere.get(i); return p === undefined ? [] : [{ isEmriId: i, ...p }]; }));
      const k = await aparatKarti();
      await rafaKoy(k, '3');
      const a = await emirAc(k, 2, '2026-11-27T08:00:00Z', '2026-11-27T14:00:00Z');
      const r = await istek('depo', 'POST', '/takimhane/cikis', { kartKimlik: k, adet: 2, kisiId: null, istasyonId, uretimEmriId: a.emirId, istekKimligi: randomUUID() });
      assert.equal(r.durum, 200, JSON.stringify(r.govde));
      assert.deepEqual((await emirApr(a.emirId)).satirlar.map((x) => [x.durum, x.disarida]), [['yolda', 0]]);
      assert.equal((await teslimAl('kisi-a', teslimCevabi.parse(r.govde).teslim, '2')).durum, 200);
      const e = await emirApr(a.emirId);
      assert.deepEqual(e.satirlar.map((x) => [x.durum, x.disarida]), [['tezgahta', 2]]);
      assert.equal(e.hazir, true);
      const s1 = (await apr()).satirlar.find((x) => x.kartKimlik === k)!;
      assert.deepEqual([s1.konumlar.raf, s1.konumlar.tezgah, s1.ayrilan], [1, 2, 0]);
      const ist = await istasyonKonumu();
      const iade = (govde: Record<string, unknown>) => istek('depo', 'POST', '/takimhane/iade', { kartKimlik: k, konumKimligi: ist, istekKimligi: randomUUID(), neden: null, ...govde });
      assert.equal((await iade({ adet: 1, durum: 'kirik' })).durum, 400, 'kırık iade nedensiz olmaz');
      assert.equal((await iade({ adet: 1, durum: 'kirik', neden: 'ORN-neden' })).durum, 200);
      assert.equal(await bakiye(k, hurdaKonumu), 1);
      assert.deepEqual((await emirApr(a.emirId)).satirlar.map((x) => [x.durum, x.disarida, x.eksik]), [['ayrildi', 1, 0]], 'iade emre yazıldı: dışarıdaki adet düştü, kalan yeniden ayrıldı');
      assert.equal((await iade({ adet: 1, durum: 'saglam' })).durum, 200);
      assert.deepEqual((await emirApr(a.emirId)).satirlar.map((x) => [x.durum, x.disarida]), [['ayrildi', 0]], 'saglam iade rafa döndü: raf 2, emir 2 ister');
      assert.equal((await apr()).satirlar.find((x) => x.kartKimlik === k)!.bekleyenIade, 0);
    });

    test('plan ertelendi: aparat plan saatinden bir günden fazla önce çıktıysa işaretlenir, yakın pencerede işaretlenmez', async () => {
      canliPlanOkuyucusu(async (_db, idler) => idler.flatMap((i) => { const p = pencere.get(i); return p === undefined ? [] : [{ isEmriId: i, ...p }]; }));
      const sonra = (saat: number) => new Date(Date.now() + saat * 3_600_000).toISOString();
      const k = await aparatKarti();
      await rafaKoy(k, '2');
      const yakin = await emirAc(k, 1, sonra(2), sonra(6));
      const uzak = await emirAc(k, 1, sonra(72), sonra(76));
      for (const e of [yakin, uzak]) {
        const r = await istek('depo', 'POST', '/takimhane/cikis', { kartKimlik: k, adet: 1, kisiId: null, istasyonId, uretimEmriId: e.emirId, istekKimligi: randomUUID() });
        assert.equal(r.durum, 200, JSON.stringify(r.govde));
        assert.equal((await teslimAl('kisi-a', teslimCevabi.parse(r.govde).teslim, '1')).durum, 200);
      }
      const planKaydi = async (id: number) => ((await istek<{ satirlar: { planKaydi: boolean }[] }>('depo', 'GET', `/takimhane/emirler/${id}/aparat`)).govde.satirlar.map((x) => x.planKaydi));
      assert.deepEqual(await planKaydi(yakin.emirId), [false]);
      assert.deepEqual(await planKaydi(uzak.emirId), [true]);
    });

    test('ölçü aleti kartı: emrin istediği tür ve geçerli alet durumu; stok konusu değildir', async () => {
      canliPlanOkuyucusu(async () => []);
      const kk = await aparatKarti();
      const a = await emirAc(kk, 1, '', '');
      const tur = (await o().sahip.tek<{ id: number }>("INSERT INTO olcu_aleti_turu (ad) VALUES ('ORN-Mastar') RETURNING id"))!.id;
      await o().sahip.sorgu("INSERT INTO rota_is_emri_ekipmani (is_emri_id, sira, tur, alet_turu_id) VALUES ($1, 2, 'olcu_aleti', $2)", [a.isEmriId, tur]);
      const oku = async () => (await istek<{ olcuAletleri: { turKimlik: number; ad: string; gecerli: boolean | null }[] }>('depo', 'GET', `/takimhane/emirler/${a.emirId}/aparat`)).govde.olcuAletleri;
      assert.deepEqual(await oku(), [{ turKimlik: tur, ad: 'ORN-Mastar', gecerli: null }], 'türde alet kaydı yok');
      await o().sahip.sorgu("INSERT INTO olcu_aleti (no, tur_id, ad) VALUES ('ORN-MST-1', $1, 'ORN-Mastar 1')", [tur]);
      assert.deepEqual((await oku()).map((x) => x.gecerli), [false], 'alet var, kalibrasyon kaydı yok');
    });

    test('teslimdekiler aparatı da taşır; aparat olmayan kart çıkış ve iadede bulunamaz', async () => {
      const k = await aparatKarti();
      await rafaKoy(k, '1');
      const t = await istek('depo', 'POST', '/takimhane/cikis', { kartKimlik: k, adet: 1, kisiId: null, istasyonId, uretimEmriId: null, istekKimligi: randomUUID() });
      assert.equal(t.durum, 404, 'rotada ve kapasitede yok, kişide de durmuyor: aparat kümesinde değil');
      await o().sahip.sorgu("INSERT INTO istasyonlar_aparat_kapasitesi (aparat_karti_id, istasyon_id, adet, degistiren_kisi_id) VALUES ($1, $2, 1, $3)", [k, istasyonId, kisiler.get('depo')]);
      const t2 = await istek('depo', 'POST', '/takimhane/cikis', { kartKimlik: k, adet: 1, kisiId: null, istasyonId, uretimEmriId: null, istekKimligi: randomUUID() });
      assert.equal(t2.durum, 200, JSON.stringify(t2.govde));
      assert.equal((await teslimAl('kisi-a', teslimCevabi.parse(t2.govde).teslim, '1')).durum, 200);
      const d = (await istek<{ teslimler: { kartKimlik: number; adet: number }[] }>('depo', 'GET', '/takimhane/teslimdekiler')).govde.teslimler.filter((x) => x.kartKimlik === k);
      assert.deepEqual(d.map((x) => x.adet), [1]);
      // Kapasite satırı silinse de kişide/tezgâhta duran aparatın iadesi alınır.
      await o().sahip.sorgu('DELETE FROM istasyonlar_aparat_kapasitesi WHERE aparat_karti_id = $1', [k]);
      const ist = await istasyonKonumu();
      assert.equal((await istek('depo', 'POST', '/takimhane/iade', { kartKimlik: k, konumKimligi: ist, adet: 1, durum: 'saglam', neden: null, istekKimligi: randomUUID() })).durum, 200);
    });

    test('yazma ucu yoktur: ayırma plandan türetilir', async () => {
      assert.equal((await istek('depo', 'POST', '/takimhane/aparat', {})).durum, 404);
    });
  });
});
