import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { bekleyenlerCevabi, tumIslerCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { depoCikisCevabi, depoSevkCevabi, partiIziCevabi } from '#paylasilan/sozlesme/stok.ts';
import { sayimGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { PartiIziCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import type { SevkIsDurumu, UrunSevkSatiri } from '../sevkiyat/disari.ts';
import { emirBaslat, emirBitir, emirSayim, kararliSayimiSonuclandir, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import { acikNcrPartiCozucusu, urunSevkiYansit } from './disari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// 1222 a: sevk serbest parçayı red parçadan önce alır, red uyarıyla çıkar (147 b); açık uygunsuzluğu (NCR) olan parti sevk edilmez.
describe('stok red ve açık NCR\'li parça sevki (gerçek PostgreSQL)', () => {
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
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`RSM${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`RSI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]);
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist?.id]);
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`RSK${sayac}`, 'Tezgah', ist?.id]);
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
  // Terminal komutlarının HTTP ucu yok (238 H3): terminal onları Arkon üzerinden uretim-emirleri/disari.ts ile yapar.
  const terminal = async (id: number, yol: string, govde?: unknown): Promise<Cevap<{ mesaj?: string }>> => {
    const k = kullanicilar.get('operator')!;
    try {
      await o().vt.tx((db) => {
        if (yol === 'baslat') return emirBaslat(db, k, id);
        if (yol === 'bitir') return emirBitir(db, k, id, (govde as { saglamAdet?: number } | undefined)?.saglamAdet);
        if (yol === 'sayim') return emirSayim(db, k, id, sayimGovdesi.parse(govde));
        throw new Error(`bilinmeyen komut ${yol}`);
      });
      return { durum: 200, govde: {} };
    } catch (h) {
      if (h instanceof UygulamaHatasi) return { durum: h.durum, govde: h.govde() };
      throw h;
    }
  };
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
  const emirNumarasi = async (emirId: number): Promise<string> => (await o().sahip.tek<{ no: string }>('SELECT emir_no AS no FROM uretim_emri WHERE id = $1', [emirId]))!.no;
  const gecis = (satir: UrunSevkSatiri, onceki: SevkIsDurumu, yeni: SevkIsDurumu) =>
    o().vt.tx((db) => urunSevkiYansit(db, { satirlar: [satir], onceki, yeni, kisiId: yoneticiId }));

  const eskiKayit = (emirId: number) => o().sahip.sorgu(
    `UPDATE sevkiyat_bekleyen SET serbest_zamani = hazir_zamani, tasima = 'biz', son_yazan_yer = 'otomatik', son_yazan_zamani = hazir_zamani
      WHERE kaynak = 'urun' AND uretim_emri_id = $1`, [emirId]);
  const bugun = async (): Promise<string> => (await o().sahip.tek<{ g: string }>("SELECT to_char(current_date, 'YYYY-MM-DD') AS g"))!.g;
  const isGovdesi = (tarih: string, nokta: number) => ({
    tarih, tur: 'teslimat', alisNoktasiId: null, birakisNoktasiId: nokta, agirlikKilogram: 120, paletSayisi: 2, durakSuresiDakika: null,
    alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null, belgeNo: null, aciklama: null, sabitAracId: null,
  });
  const kalemAsamasi = async (kalemId: number): Promise<string | undefined> => {
    const g = await bugun();
    const c = await istek('planlama_proje', 'GET', `/sevkiyat/tum-isler?baslangic=${g}&bitis=${g}`);
    return tumIslerCevabi.parse(c.govde).satirlar.find((x) => x.kalemId === kalemId)?.asama;
  };
  const depoListesi = async () => {
    const c = await istek('depo', 'GET', '/stok/depo-sevk');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return depoSevkCevabi.parse(c.govde).satirlar;
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_red_sevk');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.RSVK', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator'], ['depo', 'depo']] as const) await kisiEkle(ad, rol);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('RS-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('RS-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('rs-dnm-1', 'mamul', 'RS-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'rs-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
  });
  after(async () => { await ortam?.kaldir(); });
  test('serbest parça red parçadan önce, red sevkiyat alanında ve eski girişli olsa da; red yalnız serbest bitince uyarıyla çıkar', async () => {
    const id = await bitenEmir(4);
    const firmaId = await musteriKur();
    const emirNo = await emirNumarasi(id);
    const sevkAlani = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur) SELECT depo_id, 'RS-SVK', 'sevkiyat' FROM stok_konum WHERE kod = 'KABUL' RETURNING id"))!.id;
    // Partinin 2 adedi red ve sevkiyat alanında, daha eski girişle: eski sırada önce o seçilirdi.
    await o().sahip.sorgu(
      `WITH b AS (UPDATE stok_bakiye b SET miktar = miktar - 2 FROM stok_parti p WHERE p.id = b.parti_id AND p.uretim_emri_id = $1 RETURNING b.*)
       INSERT INTO stok_bakiye (malzeme_id, konum_id, parti_id, statu_id, kalite_durumu, miktar, ilk_giris)
       SELECT malzeme_id, $2, parti_id, statu_id, 'red', 2, ilk_giris - interval '1 day' FROM b`, [id, sevkAlani]);

    assert.deepEqual(await gecis({ isId: ++isNo, uretimEmriId: id, adet: '2', firmaId }, 'planlandi', 'yolda'), [], 'serbest yeterken red alınmaz');
    assert.deepEqual([await bakiye('k.tur', 'istasyon', id), await bakiye('k.tur', 'sevkiyat', id), await bakiye('k.tur', 'yolda', id)], [0, 2, 2]);
    assert.deepEqual(await gecis({ isId: ++isNo, uretimEmriId: id, adet: '1', firmaId }, 'planlandi', 'yolda'), [`Emir ${emirNo}: 1 adet red parça sevk edildi.`]);
    assert.deepEqual([await bakiye('k.tur', 'sevkiyat', id), await bakiye('k.tur', 'yolda', id)], [1, 3]);
  });

  test('açık NCR\'li parti sevk edilmez, kalitesi serbest olsa da; NCR kapanınca sevk açılır', async () => {
    const id = await bitenEmir(3);
    const firmaId = await musteriKur();
    const partiId = (await o().sahip.tek<{ id: number }>('SELECT id FROM stok_parti WHERE uretim_emri_id = $1', [id]))!.id;
    const acik = new Set([partiId]);
    acikNcrPartiCozucusu(async (_db, partiler) => new Set(partiler.filter((p) => acik.has(p))));
    const s: UrunSevkSatiri = { isId: ++isNo, uretimEmriId: id, adet: '2', firmaId };
    await assert.rejects(gecis(s, 'planlandi', 'yolda'),
      (h: { kod?: string; message: string }) => h.kod === 'CAKISMA' && /3 adet açık uygunsuzluk \(NCR\) kaydında; sevk edilemez/.test(h.message));
    assert.deepEqual([await bakiye('k.tur', 'istasyon', id), await bakiye('k.tur', 'yolda', id)], [3, 0], 'reddedilen sevk hiçbir şey yazmaz');
    acik.clear();
    assert.deepEqual(await gecis(s, 'planlandi', 'yolda'), []);
    assert.deepEqual([await bakiye('k.tur', 'istasyon', id), await bakiye('k.tur', 'yolda', id)], [1, 2]);
  });
});
