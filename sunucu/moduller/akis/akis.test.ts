import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { emirAkisiCevabi, emirListesiCevabi, kartAkisiCevabi, kartOzetleriCevabi } from '#paylasilan/sozlesme/akis.ts';
import { sayimGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, emirBitir, emirSayim, fasonDonusuKaydet, kararliSayimiSonuclandir, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// Kart #1338: emir yolculuğu kaynak modüllerin gerçek kayıtlarından kurulur; uç yalnız sayfa işlemiyle okunur.
describe('akis emir yolculuğu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();
  let tipId = 0;
  let urunNo = 0;
  let projeId = 0;
  let revizyonId = 0;
  let sayac = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '' };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    cerezler.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
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
    await giris(kullaniciAdi);
  }

  async function makineKur(): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`AKM${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`AKI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]);
    // UE20: iş başlatan test kişileri bu istasyonda yetkindir.
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist?.id]);
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`AKK${sayac}`, 'Tezgah', ist?.id]);
    if (!m) throw new Error('makine kurulamadı');
    return m.id;
  }

  const adim = (sira: number, kaynak: IsEmriGirdisi['kaynak']): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak,
    ayarSuresiDk: kaynak?.tur === 'fason' ? null : '10', birimSureDk: kaynak?.tur === 'fason' ? null : '1',
    terminGun: kaynak?.tur === 'fason' ? 5 : null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  // Terminal komutlarının HTTP ucu yok (238 H3): terminal onları Arkon üzerinden uretim-emirleri/disari.ts ile yapar.
  const terminal = async (id: number, yol: string, govde?: unknown): Promise<Cevap<{ mesaj?: string }>> => {
    const k = kullanicilar.get('operator')!;
    const komut = yol.replace(/^\//, '');
    try {
      await o().vt.tx((db) => {
        if (komut === 'baslat') return emirBaslat(db, k, id);
        if (komut === 'bitir') return emirBitir(db, k, id, (govde as { saglamAdet?: number } | undefined)?.saglamAdet);
        if (komut === 'sayim') return emirSayim(db, k, id, sayimGovdesi.parse(govde));
        throw new Error(`bilinmeyen komut ${yol}`);
      });
      return { durum: 200, govde: {} };
    } catch (h) {
      if (h instanceof UygulamaHatasi) return { durum: h.durum, govde: h.govde() };
      throw h;
    }
  };
  const fason = (id: number, isEmriId: number, yol: string, govde?: unknown) =>
    istek<{ mesaj?: string }>('depo', 'POST', `/adimli-emirler/${id}/is-emirleri/${isEmriId}/${yol}`, govde);

  before(async () => {
    ortam = await testVeritabaniKur('akis');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator'], ['depo', 'depo']] as const) await kisiEkle(ad, rol);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('AK-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('AK-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ak-dnm-1', 'mamul', 'AK-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'ak-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('AKIS.1', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    // Emrin kaynak revizyonu gerçek bir satırdır; iptal durumu açık ve yürürlükteki revizyonların tekil dizinine girmez.
    revizyonId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  async function fasonluEmir(): Promise<{ id: number; isEmriIdleri: number[] }> {
    const firmaId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fason', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    const m1 = await makineKur();
    const m3 = await makineKur();
    return o().vt.tx(async (db) => {
      const e = await uretimEmriAc(db, kullanicilar.get('planlama_proje')!, {
        malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revizyonId, projeId,
        isEmirleri: [adim(1, { tur: 'makine', id: m1 }), adim(2, { tur: 'fason', id: firmaId }), adim(3, { tur: 'makine', id: m3 })],
      });
      return { id: e.uretimEmriId, isEmriIdleri: e.isEmriIdleri };
    });
  }

  test('AKS-U1: sayfa işlemi olmayan okuyamaz (403); yönetici ve planlama okur; olmayan emir 404', async () => {
    const { id } = await fasonluEmir();
    assert.equal((await istek('operator', 'GET', `/akis/emirler/${id}`)).durum, 403);
    assert.equal((await istek('operator', 'GET', '/akis/emirler')).durum, 403);
    const liste = await istek('yonetici', 'GET', '/akis/emirler');
    assert.equal(liste.durum, 200, JSON.stringify(liste.govde));
    assert.ok(emirListesiCevabi.parse(liste.govde).emirler.some((e) => e.id === id));
    assert.equal((await istek('planlama_proje', 'GET', `/akis/emirler/${id}`)).durum, 200, 'rol göçü sayfa.akis verir');
    assert.equal((await istek('yonetici', 'GET', '/akis/emirler/2147483647')).durum, 404);
  });

  test('AKS-U2: emir yolculuğu adımların, fasonun ve sevke hazırın gerçek kayıtlarından kurulur', async () => {
    const { id, isEmriIdleri } = await fasonluEmir();
    const bas = await istek('yonetici', 'GET', `/akis/emirler/${id}`);
    assert.equal(bas.durum, 200, JSON.stringify(bas.govde));
    const once = emirAkisiCevabi.parse(bas.govde);
    assert.equal(once.damgalar.uretimBasladi, null, 'başlamamış emirde damga yok');
    assert.deepEqual(once.olculer.uretimAkis, { dk: null, acik: false });

    assert.equal((await terminal(id, 'baslat')).durum, 200);
    assert.equal((await terminal(id, 'sayim', { tur: 'saglam', adet: 10 })).durum, 200);
    // İlk parça onayına kadar sağlam adet kararda bekler (327 a); fasona onaylı adet gider.
    await o().vt.tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));
    assert.equal((await terminal(id, 'bitir', {})).durum, 200);
    const g = await fason(id, isEmriIdleri[1]!, 'fason-gidis', { adet: 10 });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    // Fason dönüşü mal kabulden girer; mal kabulün çağırdığı kayıt doğrudan çağrılır.
    await o().vt.tx((db) => fasonDonusuKaydet(db, yoneticiId, id, isEmriIdleri[1]!, 10, 0));

    const c = await istek('yonetici', 'GET', `/akis/emirler/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const a = emirAkisiCevabi.parse(c.govde);
    assert.ok(a.damgalar.uretimBasladi, 'ilk adımın başlaması damgalanır');
    assert.deepEqual(a.seritler.filter((s) => s.tur === 'adim').map((s) => s.baslik), ['OP10', 'OP20', 'OP30']);
    const [op10, op20, op30] = a.adimlar;
    assert.equal(op10?.saglamAdet, 10);
    assert.notEqual(op10?.islemeDk, null);
    assert.equal(op20?.fason, true);
    assert.notEqual(op20?.fasonDk, null, 'fason gidiş-dönüş süresi ölçülür');
    assert.equal(op30?.islemeDk, null, 'başlamamış adımın işlemesi yok');
    assert.equal(a.olculer.uretimAkis.acik, true, 'son adım bitmedi, akış sürüyor');
  });

  test('AKS-U3 (kart #708): kartın akışı kartın lotu ve kartla sayılanla ölçülür; anlar kabulden sayıma sırayla; yetki ve 404', async () => {
    for (const [rol, islemler] of [['depo', ['stok.giris', 'stok.transfer', 'stok.istek']], ['operator', ['stok.istek']]] as const) {
      const r = (await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!;
      for (const i of islemler) await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r.id, i]);
    }
    const hm = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ak-dnm-2', 'hammadde', 'AK-DNM-', 2, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'ak-dnm-2', com: { ad: 'Deneme hammadde' } }), yoneticiId]))!.no;
    const m1 = await makineKur();
    const ist = (await o().sahip.tek<{ istasyon_id: number }>('SELECT istasyon_id FROM makine WHERE id = $1', [m1]))!.istasyon_id;
    const id = (await o().vt.tx((db) => uretimEmriAc(db, kullanicilar.get('planlama_proje')!, {
      malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revizyonId, projeId,
      isEmirleri: [{ ...adim(1, { tur: 'makine', id: m1 }), bilesenler: [{ malzemeNo: hm, miktar: '1' }] }],
    }))).uretimEmriId;
    const kabul = await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: hm, miktar: '10' }] });
    assert.equal(kabul.durum, 200, JSON.stringify(kabul.govde));
    const lot = (await o().vt.tek<{ id: number; lot_no: string }>('SELECT id::int, lot_no FROM stok_parti WHERE malzeme_id = $1 ORDER BY id DESC LIMIT 1', [hm]))!;
    const ac = await istek<{ refakat: { id: number; etiket: string } }>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: id, lotKodu: `LOT:${lot.lot_no}` });
    assert.equal(ac.durum, 200, JSON.stringify(ac.govde));
    const kart = ac.govde.refakat;
    const kabulKonum = (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
    const g = await istek<{ teslim: { id: number; surum: number } }>('depo', 'POST', '/stok/teslimler/gonder', {
      statuId: null, not: null, kaynakKimligi: randomUUID(), malzemeId: hm, miktar: '10', kaynak: { konumId: kabulKonum }, hedef: { istasyonId: ist }, refakatPartisiId: kart.id,
    });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '10' })).durum, 200);

    assert.equal((await terminal(id, 'baslat')).durum, 200);
    assert.equal((await terminal(id, 'sayim', { tur: 'saglam', adet: 3, refakatPartisiId: kart.id })).durum, 200);
    assert.equal((await terminal(id, 'sayim', { tur: 'saglam', adet: 2 })).durum, 200);
    await o().vt.tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));

    assert.equal((await istek('operator', 'GET', `/akis/refakat-kartlari/${kart.id}`)).durum, 403);
    assert.equal((await istek('yonetici', 'GET', '/akis/refakat-kartlari/2147483647')).durum, 404);
    const c = await istek('yonetici', 'GET', `/akis/refakat-kartlari/${kart.id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const k = kartAkisiCevabi.parse(c.govde);
    const e = emirAkisiCevabi.parse((await istek('yonetici', 'GET', `/akis/emirler/${id}`)).govde);
    assert.deepEqual([k.kart.id, k.kart.etiket, k.kart.lotNo], [kart.id, kart.etiket, lot.lot_no]);
    assert.equal(e.adimlar[0]?.saglamAdet, 5, 'emir bütün sayımları sayar');
    assert.equal(k.adimlar[0]?.saglamAdet, 3, 'kart yalnız kartla sayılanı sayar');
    assert.deepEqual(k.hammadde.map((h) => h.partiId), [lot.id]);
    const turler = k.anlar.map((a) => a.tur);
    assert.deepEqual(turler.filter((t) => ['mal_kabul', 'kart_acildi', 'teslim_gonderildi', 'teslim_alindi'].includes(t)),
      ['mal_kabul', 'kart_acildi', 'teslim_gonderildi', 'teslim_alindi']);
    assert.ok(turler.indexOf('baslat') > turler.indexOf('teslim_alindi'), 'adım olayı teslimden sonra');
    const sayimlar = k.anlar.filter((a) => a.tur === 'saglam');
    assert.deepEqual(sayimlar.map((a) => [a.opNo, a.miktar]), [[10, '3']]);
    assert.equal(k.anlar.find((a) => a.tur === 'teslim_alindi')?.miktar, '10.000');
    const ad = (kullaniciAdi: string) => `Deneme ${kullaniciAdi}`;
    assert.deepEqual(k.teslimler.map((t) => [t.durum, t.gonderen, t.kapatan, t.miktar]), [['teslim', ad('depo'), ad('operator'), '10.000']], 'teslimi gönderen ve alan');
    assert.equal(k.anlar.find((a) => a.tur === 'baslat')?.kim, ad('operator'), 'olayı yazan kişi');
    assert.deepEqual([k.konum.durum, k.konum.opNo], ['uretimde', 10]);
    assert.deepEqual(k.rota.map((r) => [r.opNo, r.durum]), [[10, 'simdi']]);
    assert.deepEqual([k.rota[0]?.plan, k.rota[0]?.taban], [null, null], 'planda olmayan adımın plan saati yok');
    assert.equal(k.lead.acik, true);
    // 750 a: plan saati adımın güncel canlı yeridir.
    await o().sahip.sorgu("INSERT INTO plan_yerlesimi (is_emri_id, makine_id, baslangic, bitis, yazan_kisi_id) VALUES ($1, $2, '2026-10-21T06:00:00Z', '2026-10-21T07:30:00Z', $3)",
      [k.rota[0]!.isEmriId, m1, yoneticiId]);
    const kp = kartAkisiCevabi.parse((await istek('yonetici', 'GET', `/akis/refakat-kartlari/${kart.id}`)).govde);
    assert.deepEqual([kp.rota[0]?.plan, kp.rota[0]?.taban], [{ baslangic: '2026-10-21T06:00:00.000Z', bitis: '2026-10-21T07:30:00.000Z' }, null]);
    assert.deepEqual([k.kart.verilen, k.kart.malzeme?.includes('Deneme hammadde')], ['10', true]);
    const so = k.sureOzetleri[0]!;
    assert.deepEqual([so.kart.saglam, so.emir.saglam], [3, 5], 'kart sütunu kartın sayımları, emir sütunu hepsi');

    const ozet = await istek('yonetici', 'GET', `/akis/refakat-kartlari?idler=${String(kart.id)},2147483647`);
    assert.equal(ozet.durum, 200, JSON.stringify(ozet.govde));
    const oz = kartOzetleriCevabi.parse(ozet.govde);
    assert.deepEqual(oz.kartlar.map((x) => [x.id, x.konum.durum, x.rota.length, x.sonAn?.tur]), [[kart.id, 'uretimde', 1, k.anlar.at(-1)?.tur]], 'olmayan kart listede yok');
    assert.equal((await istek('operator', 'GET', `/akis/refakat-kartlari?idler=${String(kart.id)}`)).durum, 403);
    assert.equal((await istek('yonetici', 'GET', '/akis/refakat-kartlari?idler=1,x')).durum, 400);
    assert.equal((await istek('yonetici', 'GET', `/akis/refakat-kartlari?idler=${Array.from({ length: 51 }, (_, i) => i + 1).join(',')}`)).durum, 400, 'en çok 50 kart');
  });
});
