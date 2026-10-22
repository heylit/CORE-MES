import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { SiparisAyrintisi, SiparisListesiCevabi, SiparisOzetiCevabi, TeklifAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { siparisinSatirOzetleri, siparisSatiriOzetleri } from './disari.ts';

const PAROLA = 'dogru-parola-1';

describe('siparisler (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let operator = '';
  let sayac = 0;
  let musteriId = 0;
  let tedarikciId = 0;
  let mamulNo = 0;
  let sarfNo = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function girisYap(rolKodu: string | null): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `siparis-${(sayac += 1)}`;
    const id = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null) {
        const rol = await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
        const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
        await rolAl(db, yoneticiId, yeni, yon?.id ?? 0);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }

  const gonder = (cerez: string, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const oku = (cerez: string, yol: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });

  const govde = (degisen: Record<string, unknown> = {}): Record<string, unknown> => ({
    firmaId: musteriId, musteriSiparisNo: null, siparisTarihi: '2026-10-19', termin: '2026-11-15', kdvOrani: '20',
    odemeKosulu: '60 gün vadeli', aciklama: null,
    satirlar: [{ malzemeNo: mamulNo, miktar: '100', birimFiyat: '12.5', termin: null, aciklama: null }],
    ...degisen,
  });
  async function siparisAc(degisen: Record<string, unknown> = {}): Promise<SiparisAyrintisi> {
    const c = await gonder(yonetici, '/siparisler/ekle', govde(degisen));
    assert.equal(c.statusCode, 200, c.body);
    return c.json<SiparisAyrintisi>();
  }
  const guncelle = (s: SiparisAyrintisi, degisen: Record<string, unknown>): Promise<LightMyRequestResponse> =>
    gonder(yonetici, `/siparisler/${s.id}/guncelle`, { ...govde(), surum: s.surum, ...degisen });

  async function kartAc(tur: string): Promise<number> {
    sayac += 1;
    const kimlik = `sip-dnm-${sayac}`;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'SIP-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [kimlik, tur, sayac, JSON.stringify({ id: kimlik, com: { ad: `Deneme ${tur}` } }), yoneticiId],
    ))!.no;
  }
  async function firmaAc(tur: string): Promise<number> {
    const c = await gonder(yonetici, '/musteri-tedarikci/firmalar/ekle', { ad: `Deneme Firma ${(sayac += 1)}`, tur });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<{ firma: { id: number } }>().firma.id;
  }

  before(async () => {
    ortam = await testVeritabaniKur('siparisler');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const y = await girisYap(null);
    yonetici = y.cerez;
    yoneticiId = y.id;
    operator = (await girisYap('operator')).cerez;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SIP-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    mamulNo = await kartAc('mamul');
    sarfNo = await kartAc('sarf');
    musteriId = await firmaAc('musteri');
    tedarikciId = await firmaAc('tedarikci');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('yetki: yönetici açar ve okur; işlemi olmayan rol okuyamaz ve yazamaz (403), kayıt açılmaz; girişsiz 401', async () => {
    const s = await siparisAc();
    assert.match(s.no, /^SS-2026-\d{3,}$/);
    assert.equal(s.durum, 'taslak');
    assert.equal((await oku(yonetici, `/siparisler/${s.id}`)).statusCode, 200);
    const once = (await oku(yonetici, '/siparisler')).json<SiparisListesiCevabi>().toplam;
    assert.equal((await oku(operator, '/siparisler')).statusCode, 403);
    assert.equal((await gonder(operator, '/siparisler/ekle', govde())).statusCode, 403);
    assert.equal((await gonder(operator, `/siparisler/${s.id}/onayla`, { surum: s.surum })).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/siparisler' })).statusCode, 401);
    assert.equal((await oku(yonetici, '/siparisler')).json<SiparisListesiCevabi>().toplam, once);
  });

  test('tutarlar sunucuda: satır tutarı, ara toplam, KDV ve genel toplam; birim ve ad malzemeden', async () => {
    const s = await siparisAc({
      kdvOrani: '20',
      satirlar: [
        { malzemeNo: mamulNo, miktar: '3', birimFiyat: '10.005', termin: null, aciklama: null },
        { malzemeNo: mamulNo, miktar: '2.5', birimFiyat: '4', termin: '2026-11-01', aciklama: 'ikinci' },
      ],
    });
    assert.deepEqual(s.satirlar.map((r) => [r.sira, r.tutar, r.termin]), [[1, '30.02', null], [2, '10.00', '2026-11-01']]);
    assert.equal(s.araToplam, '40.02');
    assert.equal(s.kdvTutari, '8.00');
    assert.equal(s.genelToplam, '48.02');
    assert.equal(s.satirlar[0]?.malzemeAdi, 'Deneme mamul');
    assert.equal(s.firmaAd !== null, true);
  });

  test('SIP-10 (180): fiyatı yalnız siparisler.fiyat-oku olan görür; planlama siparişi fiyatsız okur, müdür ve yönetici fiyatlı', async () => {
    const s = await siparisAc();
    const planlama = (await girisYap('planlama_proje')).cerez;
    const mudur = (await girisYap('mudur')).cerez;
    const gizli = (await oku(planlama, `/siparisler/${s.id}`)).json<SiparisAyrintisi>();
    assert.equal(gizli.no, s.no);
    assert.deepEqual([gizli.araToplam, gizli.kdvTutari, gizli.genelToplam], [null, null, null]);
    assert.deepEqual(gizli.satirlar.map((m) => [m.miktar, m.birimFiyat, m.tutar]), [['100.000', null, null]]);
    const liste = (await oku(planlama, `/siparisler?ara=${encodeURIComponent(s.no)}`)).json<SiparisListesiCevabi>();
    assert.deepEqual(liste.satirlar.map((m) => [m.no, m.genelToplam]), [[s.no, null]]);
    for (const gorur of [yonetici, mudur]) {
      const acik = (await oku(gorur, `/siparisler/${s.id}`)).json<SiparisAyrintisi>();
      assert.deepEqual([acik.genelToplam, acik.satirlar[0]?.birimFiyat], [s.genelToplam, s.satirlar[0]?.birimFiyat]);
    }
    assert.equal(s.genelToplam, '1500.00');
  });

  test('SIP-14 sipariş açılınca onaylayanlara "onay bekliyor" bildirimi gider; açan kendi siparişi için almaz (bildirim merkezi)', async () => {
    const acan = await girisYap('mudur');
    const onaylayan = await girisYap('mudur');
    const c = await gonder(acan.cerez, '/siparisler/ekle', govde());
    assert.equal(c.statusCode, 200, c.body);
    const s = c.json<SiparisAyrintisi>();
    const bildirimler = (kisiId: number) => o().sahip.sorgu<{ baslik: string; yol: string }>(
      "SELECT baslik, yol FROM bildirim_kaydi WHERE kisi_id = $1 AND tur = 'siparisler.onay-bekliyor' AND yol = $2", [kisiId, `/siparisler/${s.id}`]);
    assert.deepEqual(await bildirimler(onaylayan.id), [{ baslik: `Onay bekleyen sipariş: ${s.no}`, yol: `/siparisler/${s.id}` }]);
    assert.deepEqual(await bildirimler(acan.id), []);
  });

  test('SIP-11 (201 a): planlama kalemi fiyatsız açar, fiyat gönderirse 403; fiyatsız sipariş onaylanmaz (409); müdür fiyatı girer, planlamanın düzenlemesi fiyatı silmez', async () => {
    const planlama = (await girisYap('planlama_proje')).cerez;
    const mudur = (await girisYap('mudur')).cerez;
    const fiyatsiz = { malzemeNo: mamulNo, miktar: '10', birimFiyat: null, termin: null, aciklama: null };
    assert.equal((await gonder(planlama, '/siparisler/ekle', govde())).statusCode, 403);
    const c = await gonder(planlama, '/siparisler/ekle', govde({ satirlar: [fiyatsiz] }));
    assert.equal(c.statusCode, 200, c.body);
    let s = (await oku(mudur, `/siparisler/${c.json<SiparisAyrintisi>().id}`)).json<SiparisAyrintisi>();
    assert.deepEqual([s.satirlar[0]?.birimFiyat, s.satirlar[0]?.tutar, s.araToplam, s.genelToplam], [null, null, null, null]);
    const red = await gonder(mudur, `/siparisler/${s.id}/onayla`, { surum: s.surum });
    assert.equal(red.statusCode, 409, red.body);
    assert.match(red.json<{ mesaj: string }>().mesaj, /fiyat/i);
    const fiyatli = await gonder(mudur, `/siparisler/${s.id}/guncelle`, { ...govde({ satirlar: [{ ...fiyatsiz, birimFiyat: '7.5' }] }), surum: s.surum });
    assert.equal(fiyatli.statusCode, 200, fiyatli.body);
    s = fiyatli.json<SiparisAyrintisi>();
    const p = await gonder(planlama, `/siparisler/${s.id}/guncelle`, { ...govde({ satirlar: [{ ...fiyatsiz, miktar: '12' }] }), surum: s.surum });
    assert.equal(p.statusCode, 200, p.body);
    s = (await oku(mudur, `/siparisler/${s.id}`)).json<SiparisAyrintisi>();
    assert.deepEqual([s.satirlar[0]?.miktar, s.satirlar[0]?.birimFiyat, s.araToplam], ['12.000', '7.5000', '90.00']);
    assert.equal((await gonder(mudur, `/siparisler/${s.id}/onayla`, { surum: s.surum })).statusCode, 200);
  });

  test('SIP-01 tedarikçi firmaya ve olmayan firmaya sipariş açılmaz; müşteriye açılır', async () => {
    const t = await gonder(yonetici, '/siparisler/ekle', govde({ firmaId: tedarikciId }));
    assert.equal(t.statusCode, 400, t.body);
    assert.match(t.body, /müşteri değil/);
    assert.equal((await gonder(yonetici, '/siparisler/ekle', govde({ firmaId: 999999 }))).statusCode, 400);
    assert.equal((await gonder(yonetici, '/siparisler/ekle', govde())).statusCode, 200);
  });

  test('SIP-02 sarf kartı ve olmayan kart satıra girmez; mamul girer', async () => {
    const h = await gonder(yonetici, '/siparisler/ekle', govde({ satirlar: [{ malzemeNo: sarfNo, miktar: '1', birimFiyat: '1' }] }));
    assert.equal(h.statusCode, 400, h.body);
    assert.match(h.body, /satılmaz/);
    assert.equal((await gonder(yonetici, '/siparisler/ekle', govde({ satirlar: [{ malzemeNo: 999999, miktar: '1', birimFiyat: '1' }] }))).statusCode, 400);
  });

  test('SIP-03 ve sürüm: taslak güncellenir ve sürüm artar; eski sürüm 409; onaylı sipariş değiştirilemez', async () => {
    const s = await siparisAc();
    const g = await guncelle(s, { satirlar: [{ malzemeNo: mamulNo, miktar: '5', birimFiyat: '2', termin: null, aciklama: null }] });
    assert.equal(g.statusCode, 200, g.body);
    const yeni = g.json<SiparisAyrintisi>();
    assert.equal(yeni.surum, s.surum + 1);
    assert.equal(yeni.araToplam, '10.00');
    assert.equal((await guncelle(s, {})).statusCode, 409);
    const onay = await gonder(yonetici, `/siparisler/${s.id}/onayla`, { surum: yeni.surum });
    assert.equal(onay.statusCode, 200, onay.body);
    const onayli = onay.json<SiparisAyrintisi>();
    assert.equal(onayli.durum, 'onayli');
    assert.notEqual(onayli.onayZamani, null);
    const red = await guncelle(onayli, {});
    assert.equal(red.statusCode, 422, red.body);
    assert.match(red.body, /Yalnız taslak/);
    assert.equal((await oku(yonetici, `/siparisler/${s.id}`)).json<SiparisAyrintisi>().araToplam, '10.00');
  });

  test('SIP-04 geçişler: onaylı kapanır, kapanmış iptal edilemez; iptal nedenle olur, nedensiz reddedilir', async () => {
    const a = await siparisAc();
    assert.equal((await gonder(yonetici, `/siparisler/${a.id}/kapat`, { surum: a.surum })).statusCode, 422);
    const onayli = (await gonder(yonetici, `/siparisler/${a.id}/onayla`, { surum: a.surum })).json<SiparisAyrintisi>();
    const kapandi = await gonder(yonetici, `/siparisler/${a.id}/kapat`, { surum: onayli.surum });
    assert.equal(kapandi.statusCode, 200, kapandi.body);
    const k = kapandi.json<SiparisAyrintisi>();
    assert.equal(k.durum, 'kapandi');
    assert.equal((await gonder(yonetici, `/siparisler/${a.id}/iptal`, { surum: k.surum, neden: 'vazgeçildi' })).statusCode, 422);

    const b = await siparisAc();
    assert.equal((await gonder(yonetici, `/siparisler/${b.id}/iptal`, { surum: b.surum })).statusCode, 400);
    const iptal = await gonder(yonetici, `/siparisler/${b.id}/iptal`, { surum: b.surum, neden: 'müşteri vazgeçti' });
    assert.equal(iptal.statusCode, 200, iptal.body);
    assert.deepEqual([iptal.json<SiparisAyrintisi>().durum, iptal.json<SiparisAyrintisi>().iptalNedeni], ['iptal', 'müşteri vazgeçti']);
  });

  test('SIP-07 termin sipariş tarihinden önce olamaz (başlık ve satır); eşit olabilir', async () => {
    assert.equal((await gonder(yonetici, '/siparisler/ekle', govde({ termin: '2026-10-18' }))).statusCode, 400);
    const satir = [{ malzemeNo: mamulNo, miktar: '1', birimFiyat: '1', termin: '2026-10-01' }];
    assert.equal((await gonder(yonetici, '/siparisler/ekle', govde({ satirlar: satir }))).statusCode, 400);
    assert.equal((await gonder(yonetici, '/siparisler/ekle', govde({ termin: '2026-10-19' }))).statusCode, 200);
  });

  test('SIP-08 müşteri sipariş no aynı firmada tekil; iptal edilen siparişin numarası yeniden kullanılabilir', async () => {
    const no = `MSN-${randomUUID().slice(0, 8)}`;
    const ilk = await siparisAc({ musteriSiparisNo: no });
    const ikinci = await gonder(yonetici, '/siparisler/ekle', govde({ musteriSiparisNo: no }));
    assert.equal(ikinci.statusCode, 409, ikinci.body);
    await gonder(yonetici, `/siparisler/${ilk.id}/iptal`, { surum: ilk.surum, neden: 'yeniden açılacak' });
    assert.equal((await gonder(yonetici, '/siparisler/ekle', govde({ musteriSiparisNo: no }))).statusCode, 200);
  });

  test('numara yıl başına artar ve tekildir; liste durum ve aramayla süzülür', async () => {
    const a = await siparisAc();
    const b = await siparisAc();
    const sira = (no: string) => Number(no.split('-')[2]);
    assert.equal(sira(b.no), sira(a.no) + 1);
    const eski = await siparisAc({ siparisTarihi: '2025-12-30', termin: '2026-01-10' });
    assert.match(eski.no, /^SS-2025-/);
    const liste = (await oku(yonetici, `/siparisler?ara=${encodeURIComponent(b.no)}`)).json<SiparisListesiCevabi>();
    assert.deepEqual(liste.satirlar.map((s) => s.id), [b.id]);
    const iptaller = (await oku(yonetici, '/siparisler?durum=iptal&sayfaBoyu=200')).json<SiparisListesiCevabi>();
    assert.ok(iptaller.satirlar.length > 0);
    assert.ok(iptaller.satirlar.every((s) => s.durum === 'iptal'));
  });

  test('SIP-02 seçim: kart seçenekleri yalnız aktif satılan türleri verir, aramayla süzülür; işlemi olmayan rol 403', async () => {
    const c = await oku(yonetici, '/siparisler/malzeme-secenekleri?ara=SIP-DNM');
    assert.equal(c.statusCode, 200, c.body);
    const nolar = c.json<{ satirlar: { no: number; tur: string }[] }>().satirlar.map((m) => m.no);
    assert.ok(nolar.includes(mamulNo));
    assert.ok(!nolar.includes(sarfNo));
    assert.equal((await oku(operator, '/siparisler/malzeme-secenekleri')).statusCode, 403);
  });

  test('disari: sipariş satırı özeti; olmayan kimlik haritada yok, boş dizi boş harita', async () => {
    const s = await siparisAc({ termin: '2026-12-01' });
    const satirId = s.satirlar[0]!.id;
    const harita = await o().vt.tx((db) => siparisSatiriOzetleri(db, [satirId, satirId, 999999]));
    assert.deepEqual([...harita.keys()], [satirId]);
    assert.deepEqual(harita.get(satirId), {
      id: satirId, siparisId: s.id, siparisNo: s.no, siparisDurumu: 'taslak', firmaId: musteriId, sira: 1, malzemeNo: mamulNo,
      miktar: '100.000', termin: '2026-12-01', birimFiyat: '12.5000', tutar: '1250.00', paraBirimi: 'TRY', cezaOraniGun: null, cezaTavaniOrani: null, odemeVadesiGun: null,
    });
    assert.equal((await o().vt.tx((db) => siparisSatiriOzetleri(db, []))).size, 0);
  });

  test('SIP-13 disari: siparişin satırları sıra ile özetlenir; birim fiyat emir adedi oranı için verilir, fiyatsız satırda null (224, 225)', async () => {
    const s = await siparisAc({
      satirlar: [
        { malzemeNo: mamulNo, miktar: '40', birimFiyat: '10', termin: '2026-12-01', aciklama: null },
        { malzemeNo: mamulNo, miktar: '60', birimFiyat: null, termin: null, aciklama: null },
      ],
    });
    const satirlar = await o().vt.tx((db) => siparisinSatirOzetleri(db, s.id));
    assert.deepEqual(satirlar.map((x) => [x.sira, x.miktar, x.birimFiyat, x.tutar, x.termin]), [
      [1, '40.000', '10.0000', '400.00', '2026-12-01'],
      [2, '60.000', null, null, s.termin],
    ]);
    assert.deepEqual(satirlar.map((x) => x.id), s.satirlar.map((x) => x.id));
    assert.deepEqual(await o().vt.tx((db) => siparisinSatirOzetleri(db, 999999)), []);
  });

  test('SIP-09 öncelik alanları: gecikme cezası (%/gün) ve tavanı boş olabilir; verilirse saklanır, plan disari ile satır tutarıyla okur; 0-100 dışı reddedilir', async () => {
    const bos = await siparisAc();
    assert.deepEqual([bos.cezaOraniGun, bos.cezaTavaniOrani], [null, null]);
    let s = await siparisAc({ cezaOraniGun: '0.5', cezaTavaniOrani: '10', paraBirimi: 'EUR' });
    assert.deepEqual([s.cezaOraniGun, s.cezaTavaniOrani], ['0.500', '10.00']);
    const g = await gonder(yonetici, `/siparisler/${s.id}/guncelle`, { ...govde({ cezaOraniGun: '1.25', cezaTavaniOrani: null, paraBirimi: 'EUR' }), surum: s.surum });
    assert.equal(g.statusCode, 200, g.body);
    s = g.json<SiparisAyrintisi>();
    assert.deepEqual([s.cezaOraniGun, s.cezaTavaniOrani], ['1.250', null]);
    const ozet = (await o().vt.tx((db) => siparisSatiriOzetleri(db, [s.satirlar[0]!.id]))).get(s.satirlar[0]!.id);
    assert.deepEqual([ozet?.tutar, ozet?.paraBirimi, ozet?.cezaOraniGun, ozet?.cezaTavaniOrani], ['1250.00', 'EUR', '1.250', null]);
    for (const hatali of [{ cezaOraniGun: '100.5' }, { cezaTavaniOrani: '101' }, { cezaOraniGun: '-1' }]) {
      assert.equal((await gonder(yonetici, '/siparisler/ekle', govde(hatali))).statusCode, 400, JSON.stringify(hatali));
    }
  });

  test('SIP-12 (205 a): ödeme vadesi (gün) boş olabilir; verilirse saklanır, plan disari ile okur; 0-365 dışı ve kesirli reddedilir', async () => {
    const bos = await siparisAc();
    assert.equal(bos.odemeVadesiGun, null);
    let s = await siparisAc({ odemeVadesiGun: 60 });
    assert.equal(s.odemeVadesiGun, 60);
    const g = await gonder(yonetici, `/siparisler/${s.id}/guncelle`, { ...govde({ odemeVadesiGun: null }), surum: s.surum });
    assert.equal(g.statusCode, 200, g.body);
    s = g.json<SiparisAyrintisi>();
    assert.equal(s.odemeVadesiGun, null);
    const vadeli = await siparisAc({ odemeVadesiGun: 90 });
    const ozet = (await o().vt.tx((db) => siparisSatiriOzetleri(db, [vadeli.satirlar[0]!.id]))).get(vadeli.satirlar[0]!.id);
    assert.equal(ozet?.odemeVadesiGun, 90);
    for (const hatali of [{ odemeVadesiGun: -1 }, { odemeVadesiGun: 366 }, { odemeVadesiGun: 30.5 }]) {
      assert.equal((await gonder(yonetici, '/siparisler/ekle', govde(hatali))).statusCode, 400, JSON.stringify(hatali));
    }
  });

  test('SIP-15 (E-24) ret: işlemi olmayana her uç 403, salt okuyana yazma 403, planlamaya onay geçişleri 403; olmayan siparişe 404; kayıt değişmez', async () => {
    const s = await siparisAc();
    const kalite = (await girisYap('kalite')).cerez;
    const planlama = (await girisYap('planlama_proje')).cerez;
    const yazma = (id: number, surum: number): [string, Record<string, unknown>][] => [
      ['/siparisler/ekle', govde()],
      [`/siparisler/${id}/guncelle`, { ...govde(), surum }],
      [`/siparisler/${id}/onayla`, { surum }],
      [`/siparisler/${id}/kapat`, { surum }],
      [`/siparisler/${id}/iptal`, { surum, neden: 'Deneme' }],
    ];
    const once = (await oku(yonetici, '/siparisler')).json<SiparisListesiCevabi>().toplam;
    for (const yol of ['/siparisler', '/siparisler/malzeme-secenekleri', `/siparisler/${s.id}`]) {
      assert.equal((await oku(operator, yol)).statusCode, 403, yol);
    }
    for (const [yol, g] of yazma(s.id, s.surum)) assert.equal((await gonder(operator, yol, g)).statusCode, 403, yol);
    assert.equal((await oku(kalite, '/siparisler')).statusCode, 200);
    assert.equal((await oku(kalite, `/siparisler/${s.id}`)).statusCode, 200);
    assert.equal((await oku(kalite, '/siparisler/malzeme-secenekleri')).statusCode, 403);
    for (const [yol, g] of yazma(s.id, s.surum)) assert.equal((await gonder(kalite, yol, g)).statusCode, 403, yol);
    for (const [yol, g] of yazma(s.id, s.surum).slice(2)) assert.equal((await gonder(planlama, yol, g)).statusCode, 403, yol);

    assert.equal((await oku(yonetici, '/siparisler/999999')).statusCode, 404);
    for (const [yol, g] of yazma(999999, 1).slice(1)) {
      const c = await gonder(yonetici, yol, g);
      assert.equal(c.statusCode, 404, `${yol} ${c.body}`);
      assert.match(c.body, /Sipariş bulunamadı/);
    }
    const sonra = (await oku(yonetici, `/siparisler/${s.id}`)).json<SiparisAyrintisi>();
    assert.deepEqual([sonra.durum, sonra.surum], ['taslak', s.surum]);
    assert.equal((await oku(yonetici, '/siparisler')).json<SiparisListesiCevabi>().toplam, once);
  });

  // Testler aynı veritabanını paylaşır: özet sayıları önce ve sonra okunur, fark ölçülür.
  test('SIP-16 (76 a) ana sayfa özeti: açık teklif, 7 gün içinde termin, geciken onaylı sipariş ve aylık seri sunucuda sayılır; fiyat taşımaz', async () => {
    const ozet = async (): Promise<SiparisOzetiCevabi> => {
      const c = await oku(yonetici, '/siparisler/ozet');
      assert.equal(c.statusCode, 200, c.body);
      return c.json<SiparisOzetiCevabi>();
    };
    const once = await ozet();
    const gun = (fark: number): string => tesisGunu(Date.now() + fark * 86_400_000);
    const onayla = async (fark: number): Promise<number> => {
      const s = await siparisAc();
      const c = await gonder(yonetici, `/siparisler/${s.id}/onayla`, { surum: s.surum });
      assert.equal(c.statusCode, 200, c.body);
      // Termin geçmişe ancak doğrudan yazılır (SIP-07: termin sipariş tarihinden önce olamaz); sayım yalnız terminle ilgilidir.
      await o().sahip.sorgu('UPDATE siparisler_siparis SET siparis_tarihi = LEAST(siparis_tarihi, $2::date), termin = $2::date WHERE id = $1', [s.id, gun(fark)]);
      return s.id;
    };
    await onayla(-1);
    await onayla(0);
    await onayla(6);
    await onayla(7);
    // Taslak sipariş termine bakılmadan sayılmaz.
    const taslak = await siparisAc();
    await o().sahip.sorgu('UPDATE siparisler_siparis SET siparis_tarihi = $2::date, termin = $2::date WHERE id = $1', [taslak.id, gun(-3)]);
    const t = await gonder(yonetici, '/siparisler/teklifler/ekle', {
      firmaId: musteriId, baslik: 'Deneme talebi', istenenTarih: null, aciklama: null, satirlar: [{ malzemeNo: mamulNo, tanim: 'Deneme parça', miktar: '5' }],
    });
    assert.equal(t.statusCode, 200, t.body);
    const red = await gonder(yonetici, '/siparisler/teklifler/ekle', {
      firmaId: musteriId, baslik: 'Deneme talebi', istenenTarih: null, aciklama: null, satirlar: [{ malzemeNo: mamulNo, tanim: 'Deneme parça', miktar: '5' }],
    });
    await o().sahip.sorgu("UPDATE siparisler_teklif SET durum = 'red', not_metni = 'Deneme reddi' WHERE id = $1", [red.json<TeklifAyrintisi>().id]);

    const sonra = await ozet();
    assert.deepEqual(
      [sonra.acikTeklif - once.acikTeklif, sonra.yaklasanTermin - once.yaklasanTermin, sonra.gecikenSiparis - once.gecikenSiparis],
      [1, 2, 1],
    );
    assert.equal(sonra.aylik.length, 6);
    assert.equal(sonra.aylik.at(-1)?.ay, gun(0).slice(0, 7));
    assert.equal(sonra.aylik.reduce((t2, a) => t2 + a.sayi, 0) >= once.aylik.reduce((t2, a) => t2 + a.sayi, 0) + 3, true);
    assert.equal(JSON.stringify(sonra).includes('Fiyat'), false);
  });

  test('SIP-16 ret: özet listeyi okuyana açıktır; satış okur, işlemi olmayan rol 403, girişsiz 401', async () => {
    const satis = (await girisYap('satis')).cerez;
    assert.equal((await oku(satis, '/siparisler/ozet')).statusCode, 200);
    assert.equal((await oku(operator, '/siparisler/ozet')).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/siparisler/ozet' })).statusCode, 401);
  });
});
