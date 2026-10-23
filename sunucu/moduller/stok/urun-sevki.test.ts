import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { bekleyenlerCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { partiIziCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { PartiIziCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import type { SevkIsDurumu, UrunSevkSatiri } from '../sevkiyat/disari.ts';
import { kararliSayimiSonuclandir, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import { urunSevkiYansit } from './disari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// 235 a: ürün sevki yola çıkınca müşterinin Yolda konumuna geçer, teslimde stoktan düşer; geri dönüşler geri alır. 147 b: karar
// bekleyen ve karantinadaki parça sevk edilmez, red parça açıklamasıyla çıkar.
describe('stok ürün sevki (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let sayac = 0;
  let isNo = 900000;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  // Emrin kaynak rotası gerçek bir revizyon olmalı; iptal durumunda açılır ki testin kendi rotasıyla tekil dizinlere çarpmasın.
  const revizyonlar = new Map<number, Promise<number>>();
  const revizyon = (malzemeNo: number): Promise<number> => {
    let id = revizyonlar.get(malzemeNo);
    if (!id) {
      id = o().sahip.tek<{ id: number }>(
        `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
         SELECT k.no, CASE WHEN k.tur = 'mamul' THEN 'mamul' ELSE 'yarimamul' END, 'ZZ', 'iptal', p.id, p.id, now()
           FROM malzeme_katalog_karti k, (SELECT min(id) AS id FROM kisi) p WHERE k.no = $1 RETURNING id`, [malzemeNo]).then((r) => r!.id);
      revizyonlar.set(malzemeNo, id);
    }
    return id;
  };
  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '' };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const k = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    kullanicilar.set(kullaniciAdi, k);
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
  }
  async function makineKur(): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`USM${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`USI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]);
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist?.id]);
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`USK${sayac}`, 'Tezgah', ist?.id]);
    if (!m) throw new Error('makine kurulamadı');
    return m.id;
  }
  async function musteriKur(): Promise<number> {
    sayac += 1;
    return (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ($1, 'musteri', $2) RETURNING id", [`Deneme Alıcı ${sayac}`, yoneticiId]))!.id;
  }
  const adim = (kaynak: IsEmriGirdisi['kaynak']): IsEmriGirdisi => ({
    bilesenler: [], sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tipId, kaynak, ayarSuresiDk: '10', birimSureDk: '1',
    terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const terminal = (id: number, yol: string, govde?: unknown) => istek<{ mesaj?: string }>('operator', 'POST', `/uretim-emirleri/${id}/${yol}`, govde);
  // Tek adımlı emir biter; sağlam sayım emrin ürününü istasyona koyar.
  async function bitenEmir(saglam: number): Promise<number> {
    const m = await makineKur();
    const { uretimEmriId: id } = await o().vt.tx(async (db) => uretimEmriAc(db, kullanicilar.get('planlama_proje')!, {
      projeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(urunNo), isEmirleri: [adim({ tur: 'makine', id: m })],
    }));
    assert.equal((await terminal(id, 'baslat')).durum, 200);
    assert.equal((await terminal(id, 'sayim', { tur: 'saglam', adet: saglam })).durum, 200);
    // 327 a: ilk parça onaylanana kadar sağlam sayım karar bekler; sevk serbest parçayla ölçülür.
    await o().vt.tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));
    assert.equal((await terminal(id, 'bitir', {})).durum, 200);
    return id;
  }
  const bakiye = async (kosul: string, deger: string | number, emirId: number): Promise<number> => Number((await o().sahip.tek<{ m: string }>(
    `SELECT COALESCE(sum(b.miktar), 0)::text AS m FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id JOIN stok_parti p ON p.id = b.parti_id
      WHERE ${kosul} = $1 AND p.uretim_emri_id = $2`, [deger, emirId]))!.m);
  const sevkCikisi = async (emirId: number): Promise<number> => Number((await o().sahip.tek<{ m: string }>(
    `SELECT COALESCE(sum(h.miktar), 0)::text AS m FROM stok_hareketi h
      WHERE h.cikis_nedeni = 'sevk' AND h.uretim_emri_id = $1 AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)`, [emirId]))!.m);
  const gecis = (satir: UrunSevkSatiri, onceki: SevkIsDurumu, yeni: SevkIsDurumu) =>
    o().vt.tx((db) => urunSevkiYansit(db, { satirlar: [satir], onceki, yeni, kisiId: yoneticiId }));

  before(async () => {
    ortam = await testVeritabaniKur('stok_urun_sevki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.SEVK', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator'], ['depo', 'depo']] as const) await kisiEkle(ad, rol);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('US-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('US-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('us-dnm-1', 'mamul', 'US-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'us-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
  });
  after(async () => { await ortam?.kaldir(); });

  test('yola çıkış Yolda konumuna taşır, teslim sevk çıkışı yazar, geri dönüşler parçayı geldiği yere koyar; aynı emrin başka işine dokunmaz', async () => {
    const id = await bitenEmir(6);
    const firmaId = await musteriKur();
    const yolda = `YLD-${String(firmaId)}`;
    assert.equal(await bakiye('k.tur', 'istasyon', id), 6);
    const a: UrunSevkSatiri = { isId: ++isNo, uretimEmriId: id, adet: '4.0000', firmaId };
    const b: UrunSevkSatiri = { isId: ++isNo, uretimEmriId: id, adet: '1.0000', firmaId };

    assert.deepEqual(await gecis(a, 'planlandi', 'yolda'), [], 'serbest parçada uyarı yok');
    await gecis(b, 'havuzda', 'yolda');
    assert.deepEqual([await bakiye('k.tur', 'istasyon', id), await bakiye('k.kod', yolda, id)], [1, 5]);
    await gecis(a, 'yolda', 'planlandi');
    assert.deepEqual([await bakiye('k.tur', 'istasyon', id), await bakiye('k.kod', yolda, id)], [5, 1], 'yalnız geri alınan işin parçası döner');

    await gecis(a, 'havuzda', 'yolda');
    await gecis(a, 'yolda', 'tamamlandi');
    assert.deepEqual([await bakiye('k.kod', yolda, id), await sevkCikisi(id)], [1, 4]);
    await gecis(a, 'tamamlandi', 'yolda');
    assert.deepEqual([await bakiye('k.kod', yolda, id), await sevkCikisi(id)], [5, 0], 'geri alınan teslim Yolda konumuna döner');
    // Havuzdan doğrudan teslim iki adımdır; tamamlanmış işin havuza dönüşü ikisini de geri alır.
    await gecis(a, 'yolda', 'havuzda');
    await gecis(a, 'havuzda', 'tamamlandi');
    assert.deepEqual([await bakiye('k.tur', 'istasyon', id), await bakiye('k.kod', yolda, id), await sevkCikisi(id)], [1, 1, 4]);
    await gecis(a, 'tamamlandi', 'planlandi');
    assert.deepEqual([await bakiye('k.tur', 'istasyon', id), await bakiye('k.kod', yolda, id), await sevkCikisi(id)], [5, 1, 0]);
    // Havuz ile planlandı arası stok yazmaz.
    const once = await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM stok_hareketi WHERE uretim_emri_id = $1', [id]);
    await gecis(a, 'havuzda', 'planlandi');
    assert.deepEqual(await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM stok_hareketi WHERE uretim_emri_id = $1', [id]), once);
  });

  test('Soru 186 a: faturalı sevkin teslim çıkışı ne elle ne sevkiyatla geri alınır; kısmi iade yetmez, tam iade ya da iptal açar', async () => {
    const id = await bitenEmir(4);
    const firmaId = await musteriKur();
    const tek = async (sql: string, p: unknown[]): Promise<number> => (await o().sahip.tek<{ id: number }>(sql, p))!.id;
    sayac += 1;
    const siparisId = await tek(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
       VALUES ($1, 'onayli', $2, current_date, current_date + 30, 20, $3, $3, now()) RETURNING id`, [`SS-2026-${String(900 + sayac)}`, firmaId, yoneticiId]);
    const satirId = await tek('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 4, 250) RETURNING id', [siparisId, urunNo]);
    await o().sahip.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $2 WHERE id = $1', [id, satirId]);
    const nokta = await tek("INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, firma_id) VALUES ('Deneme Alıcı Noktası', 'musteri', 40, 29, $1) RETURNING id", [firmaId]);
    const isId = await tek("INSERT INTO sevkiyat_isi (tarih, istenen_tarih, tur, birakis_noktasi_id, agirlik_kilogram, palet_sayisi) VALUES (current_date, current_date, 'teslimat', $1, 10, 1) RETURNING id", [nokta]);
    // Biten emir bekleme listesine düşer; satır yoksa açılır.
    const bagli = await o().sahip.sorgu('UPDATE sevkiyat_bekleyen SET is_id = $2 WHERE uretim_emri_id = $1 AND is_id IS NULL RETURNING id', [id, isId]);
    if (bagli.length === 0) await o().sahip.sorgu("INSERT INTO sevkiyat_bekleyen (kaynak, uretim_emri_id, adet, is_id) VALUES ('urun', $1, 4, $2)", [id, isId]);
    const s: UrunSevkSatiri = { isId, uretimEmriId: id, adet: '4', firmaId };
    await gecis(s, 'planlandi', 'yolda');
    await gecis(s, 'yolda', 'tamamlandi');
    assert.equal(await sevkCikisi(id), 4);
    const belge = (g: { tur: 'fatura' | 'iade'; tutar: number; iade?: number }) => tek(
      `INSERT INTO finans_belge (yon, tur, kategori, firma_id, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani, belge_no, siparis_id, sevkiyat_isi_id, iade_belge_id, olusturan_id)
       VALUES ($1, $2, $3, $4, current_date, current_date, 'TRY', 1, $5, 20, $6, $7, $8, $9, $10) RETURNING id`,
      [g.tur === 'fatura' ? 'gelir' : 'gider', g.tur, g.tur === 'fatura' ? 'urun_satisi' : 'satis_iadesi', firmaId, g.tutar, g.tur === 'fatura' ? 'DNM-FAT-186' : null,
        siparisId, g.tur === 'fatura' ? isId : null, g.iade ?? null, yoneticiId]);
    const fatura = await belge({ tur: 'fatura', tutar: 1000 });
    const cikis = (await o().sahip.tek<{ id: number }>("SELECT id FROM stok_hareketi WHERE cikis_nedeni = 'sevk' AND uretim_emri_id = $1", [id]))!.id;
    const engel = 'Sevk faturalandı (DNM-FAT-186); stok çıkışı geri alınmaz. Önce faturayı iptal edin ya da iade kesin.';

    const elle = await istek<{ mesaj: string }>('depo', 'POST', `/stok/hareketler/${String(cikis)}/geri-al`, {});
    assert.deepEqual([elle.durum, elle.govde.mesaj], [409, engel]);
    assert.equal((await istek('depo', 'POST', '/stok/hareketler/geri-al', { hareketIdler: [cikis] })).durum, 409);
    await assert.rejects(gecis(s, 'tamamlandi', 'yolda'), (h: { message: string }) => h.message === engel);
    await belge({ tur: 'iade', tutar: 500, iade: fatura });
    assert.equal((await istek('depo', 'POST', `/stok/hareketler/${String(cikis)}/geri-al`, {})).durum, 409, 'kısmi iade yetmez');
    assert.equal(await sevkCikisi(id), 4);
    await belge({ tur: 'iade', tutar: 500, iade: fatura });
    await gecis(s, 'tamamlandi', 'yolda');
    assert.equal(await sevkCikisi(id), 0, 'tam iadeden sonra sevkiyat teslimi geri alır');

    // İptal edilen fatura da bağlamaz.
    await gecis(s, 'yolda', 'tamamlandi');
    const ikinci = await belge({ tur: 'fatura', tutar: 1000 });
    await assert.rejects(gecis(s, 'tamamlandi', 'yolda'), (h: { message: string }) => /DNM-FAT-186/.test(h.message));
    await o().sahip.sorgu("UPDATE finans_belge SET durum = 'iptal', iptal_zamani = now(), iptal_eden_id = $2 WHERE id = $1", [ikinci, yoneticiId]);
    const yeni = (await o().sahip.tek<{ id: number }>(
      "SELECT h.id FROM stok_hareketi h WHERE h.cikis_nedeni = 'sevk' AND h.uretim_emri_id = $1 AND NOT EXISTS (SELECT 1 FROM stok_hareketi g WHERE g.geri_alinan_id = h.id)", [id]))!.id;
    assert.equal((await istek('depo', 'POST', `/stok/hareketler/${String(yeni)}/geri-al`, {})).durum, 200);
    assert.equal(await sevkCikisi(id), 0);
  });

  test('firmasız noktada Yolda adımı yok, teslim bulunduğu konumdan düşer; yetmeyen ve adedi bilinmeyen sevk reddedilir, hiçbir şey yazılmaz', async () => {
    const id = await bitenEmir(3);
    const s: UrunSevkSatiri = { isId: ++isNo, uretimEmriId: id, adet: '2', firmaId: null };
    await gecis(s, 'planlandi', 'yolda');
    assert.equal(await bakiye('k.tur', 'istasyon', id), 3, 'firmasız yola çıkış stok yazmaz');
    await gecis(s, 'yolda', 'tamamlandi');
    assert.deepEqual([await bakiye('k.tur', 'istasyon', id), await sevkCikisi(id)], [1, 2]);

    const firmaId = await musteriKur();
    await assert.rejects(gecis({ isId: ++isNo, uretimEmriId: id, adet: '2', firmaId }, 'planlandi', 'yolda'),
      (h: { kod?: string; message: string }) => h.kod === 'CAKISMA' && /2 adet gerekli, stokta 1 adet var/.test(h.message));
    await assert.rejects(gecis({ isId: ++isNo, uretimEmriId: id, adet: null, firmaId }, 'planlandi', 'yolda'),
      (h: { kod?: string; message: string }) => h.kod === 'GECERSIZ' && /adedi bilinmiyor/.test(h.message));
    assert.deepEqual([await bakiye('k.tur', 'istasyon', id), await bakiye('k.tur', 'yolda', id)], [1, 0]);
  });

  test('147 b: karar bekleyen ve karantinadaki parça sevk edilmez; red parça çıkar, açıklaması söyler, geri alınır', async () => {
    const id = await bitenEmir(2);
    const firmaId = await musteriKur();
    const s: UrunSevkSatiri = { isId: ++isNo, uretimEmriId: id, adet: '2', firmaId };
    const emirNo = (await o().sahip.tek<{ no: string }>('SELECT emir_no AS no FROM uretim_emri WHERE id = $1', [id]))!.no;
    const kaliteYap = (k: string) => o().sahip.sorgu(
      'UPDATE stok_bakiye b SET kalite_durumu = $1 FROM stok_parti p WHERE p.id = b.parti_id AND p.uretim_emri_id = $2', [k, id]);

    await kaliteYap('karar_bekliyor');
    await assert.rejects(gecis(s, 'planlandi', 'yolda'), (h: { message: string }) => /2 adet kalite kararı bekliyor ya da karantinada/.test(h.message));
    await kaliteYap('serbest');
    const konumYap = (konumId: number) => o().sahip.sorgu(
      'UPDATE stok_bakiye b SET konum_id = $1 FROM stok_parti p WHERE p.id = b.parti_id AND p.uretim_emri_id = $2', [konumId, id]);
    const istasyon = (await o().sahip.tek<{ id: number }>(
      'SELECT b.konum_id AS id FROM stok_bakiye b JOIN stok_parti p ON p.id = b.parti_id WHERE p.uretim_emri_id = $1', [id]))!.id;
    const karantina = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur) SELECT depo_id, 'US-KRN', 'karantina' FROM stok_konum WHERE kod = 'KABUL' RETURNING id"))!.id;
    await konumYap(karantina);
    await assert.rejects(gecis(s, 'planlandi', 'yolda'), (h: { message: string }) => /karantinada/.test(h.message));
    await konumYap(istasyon);

    await kaliteYap('red');
    assert.deepEqual(await gecis(s, 'planlandi', 'yolda'), [`Emir ${emirNo}: 2 adet red parça sevk edildi.`]);
    assert.equal(await bakiye('k.tur', 'yolda', id), 2);
    const aciklama = await o().sahip.tek<{ a: string }>("SELECT aciklama AS a FROM stok_hareketi WHERE uretim_emri_id = $1 AND tur = 'transfer' ORDER BY id DESC LIMIT 1", [id]);
    assert.match(aciklama!.a, /yola çıktı · red parça$/);
    assert.deepEqual(await gecis(s, 'yolda', 'planlandi'), [], 'geri almada uyarı yok');
    assert.deepEqual([await bakiye('k.tur', 'yolda', id), await bakiye('k.id', istasyon, id)], [0, 2]);
  });

  test('sevkiyat işinin elle teslimi ve yeniden açılması bağ üzerinden stoğa yansır', async () => {
    const id = await bitenEmir(5);
    const firmaId = await musteriKur();
    const nokta = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, firma_id) VALUES ('US Alıcı Noktası', 'musteri', 39.95, 32.75, $1) RETURNING id", [firmaId]))!.id;
    const liste = await istek('planlama_proje', 'GET', '/sevkiyat/bekleyenler');
    const b = bekleyenlerCevabi.parse(liste.govde).bekleyenler.find((x) => x.kaynak === 'urun' && x.uretimEmriId === id)!;
    const tarih = (await o().sahip.tek<{ g: string }>("SELECT to_char(current_date, 'YYYY-MM-DD') AS g"))!.g;
    const c = await istek<{ is: { id: number } }>('depo', 'POST', `/sevkiyat/bekleyenler/${b.id}/ise-cevir`, {
      tarih, tur: 'teslimat', alisNoktasiId: null, birakisNoktasiId: nokta, agirlikKilogram: 120, paletSayisi: 2, durakSuresiDakika: null,
      alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null, belgeNo: null, aciklama: null, sabitAracId: null,
    });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const durum = (d: string) => istek('depo', 'POST', `/sevkiyat/isler/${c.govde.is.id}/durum`, { durum: d, tarih, not: null });

    assert.equal((await durum('tamamlandi')).durum, 200);
    assert.deepEqual([await bakiye('k.tur', 'istasyon', id), await sevkCikisi(id)], [0, 5]);
    // İleri izlenebilirlik (Sevkiyat madde 4): ürün partisinin izi emrin sevklerini müşterisiyle verir.
    const parti = (await o().sahip.tek<{ id: number }>('SELECT id FROM stok_parti WHERE uretim_emri_id = $1', [id]))!.id;
    const iz = await istek<PartiIziCevabi>('depo', 'GET', `/stok/partiler/${parti}/iz`);
    assert.equal(iz.durum, 200, JSON.stringify(iz.govde));
    const firmaAdi = (await o().sahip.tek<{ ad: string }>('SELECT ad FROM musteri_tedarikci_firma WHERE id = $1', [firmaId]))!.ad;
    assert.deepEqual(partiIziCevabi.parse(iz.govde).sevkler.map((x) => [x.emirId, x.isId, x.gun, x.durum, Number(x.adet), x.firmaId, x.firmaAdi]),
      [[id, c.govde.is.id, tarih, 'tamamlandi', 5, firmaId, firmaAdi]]);
    assert.equal((await durum('havuzda')).durum, 200);
    assert.deepEqual([await bakiye('k.tur', 'istasyon', id), await sevkCikisi(id)], [5, 0]);
  });
});
