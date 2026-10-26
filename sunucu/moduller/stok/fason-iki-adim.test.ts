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
import { bekleyenlerCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import type { Bekleyen } from '#paylasilan/sozlesme/sevkiyat.ts';
import type { FasonIsleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { sayimGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, emirBitir, emirSayim, kararliSayimiSonuclandir, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import { adimCiktisiCozucusuKaydet, adimStatusuCozucusuKaydet, fasonEksikGonderimSayisi, uretimGirisi } from './servis.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// Kart #1310: biten emrin ürünü bekleme listesine düşer; fasona gönderim firmanın noktasına teslimat işi açar, noktası yoksa listede bekler.
// Kart #1310: fasona gönderimde stok iki adımda yürür (Yolda, sonra firma); dönüşte hurda firmadan düşer.
describe('stok fason iki adım (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();
  let tipId = 0;
  let urunNo = 0;
  let sayac = 0;

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
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`SFM${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`SFI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]);
    // UE20: iş başlatan test kişileri bu istasyonda yetkindir.
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist?.id]);
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`SFK${sayac}`, 'Tezgah', ist?.id]);
    if (!m) throw new Error('makine kurulamadı');
    return m.id;
  }
  async function fasonFirmaKur(noktali: boolean): Promise<{ firmaId: number; noktaId: number | null }> {
    sayac += 1;
    const firmaId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ($1, 'tedarikci', $2, true) RETURNING id", [`Deneme Fason ${sayac}`, yoneticiId]))!.id;
    if (!noktali) return { firmaId, noktaId: null };
    const nokta = await o().sahip.tek<{ id: number }>(
      "INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, firma_id) VALUES ($1, 'fason', 40.1, 29.1, $2) RETURNING id", [`Fason Noktası ${sayac}`, firmaId]);
    return { firmaId, noktaId: nokta!.id };
  }

  const adim = (sira: number, kaynak: IsEmriGirdisi['kaynak'], bilesenler: IsEmriGirdisi['bilesenler'] = []): IsEmriGirdisi => ({
    bilesenler,
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak,
    ayarSuresiDk: kaynak?.tur === 'fason' ? null : '10', birimSureDk: kaynak?.tur === 'fason' ? null : '1',
    terminGun: kaynak?.tur === 'fason' ? 5 : null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const kullanici = (ad: string): Kullanici => kullanicilar.get(ad)!;
  // 327 a: ilk parça onaylanana kadar sağlam sayım karar bekler; fasona gidecek adet onaydan sonra sayılır.
  const ilkParcaOnay = (id: number) => o().vt.tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));
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
    istek<{ hareketId: number; mesaj?: string }>('depo', 'POST', `/adimli-emirler/${id}/is-emirleri/${isEmriId}/${yol}`, govde);
  const bekleyenler = async (): Promise<Bekleyen[]> => {
    const c = await istek<{ bekleyenler: Bekleyen[] }>('planlama_proje', 'GET', '/sevkiyat/bekleyenler');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return bekleyenlerCevabi.parse(c.govde).bekleyenler;
  };
  const isGovdesi = (tarih: string, birakisNoktasiId: number) => ({
    tarih, tur: 'teslimat', alisNoktasiId: null, birakisNoktasiId, agirlikKilogram: 120, paletSayisi: 2, durakSuresiDakika: null,
    alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null, belgeNo: null, aciklama: null, sabitAracId: null,
  });

  before(async () => {
    ortam = await testVeritabaniKur('stok_fason_iki_adim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.FASON', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator'], ['depo', 'depo']] as const) await kisiEkle(ad, rol);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('SF-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SF-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('sf-dnm-1', 'mamul', 'SF-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'sf-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
  });
  after(async () => { await ortam?.kaldir(); });

  async function fasonluEmir(firmaId: number) {
    const m1 = await makineKur();
    const m3 = await makineKur();
    const { uretimEmriId: id, isEmriIdleri } = await o().vt.tx(async (db) => uretimEmriAc(db, kullanici('planlama_proje'), {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(urunNo),
      isEmirleri: [adim(1, { tur: 'makine', id: m1 }), adim(2, { tur: 'fason', id: firmaId }), adim(3, { tur: 'makine', id: m3 })],
    }));
    assert.equal((await terminal(id, 'baslat')).durum, 200);
    assert.equal((await terminal(id, 'sayim', { tur: 'saglam', adet: 9 })).durum, 200);
    await ilkParcaOnay(id);
    assert.equal((await terminal(id, 'bitir', {})).durum, 200);
    // Girdisiz rotada ara adımın sayımı stok yazmaz; fasona gidecek parça istasyona üretim girişiyle konur.
    const konum = (await o().sahip.tek<{ id: number }>('SELECT k.id FROM stok_konum k JOIN makine m ON m.istasyon_id = k.istasyon_id WHERE m.id = $1', [m1]))!.id;
    assert.equal(await bakiye('k.tur', 'istasyon', id), 0, 'ara adım sayımı ürün girmez');
    await o().vt.tx((db) => uretimGirisi(db, yoneticiId, { uretimEmriId: id, malzemeId: urunNo, miktar: '9', konumId: konum }));
    return { id, fasonIsEmriId: isEmriIdleri[1]! };
  }

  // Konum türü ya da koduna göre emrin partisinin bakiyesi (adet).
  const bakiye = async (kosul: string, deger: string | number, emirId: number): Promise<number> => Number((await o().sahip.tek<{ m: string }>(
    `SELECT COALESCE(sum(b.miktar), 0)::text AS m FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id JOIN stok_parti p ON p.id = b.parti_id
      WHERE ${kosul} = $1 AND p.uretim_emri_id = $2`, [deger, emirId]))!.m);
  const durum = (isId: number, d: string, tarih: string) => istek<{ mesaj?: string }>('depo', 'POST', `/sevkiyat/isler/${isId}/durum`, { durum: d, tarih, not: null });

  test('gönderimde parça istasyondan firmanın Yolda konumuna, sevkiyat tesliminde firmaya geçer; geri alınan teslim geri döner; dönüşte hurda firmadan düşer', async () => {
    const f = await fasonFirmaKur(true);
    const e = await fasonluEmir(f.firmaId);
    assert.equal(await bakiye('k.tur', 'istasyon', e.id), 9, 'üretim girişi istasyonda');
    assert.equal((await fason(e.id, e.fasonIsEmriId, 'fason-gidis', { adet: 6 })).durum, 200);
    assert.equal(await bakiye('k.tur', 'istasyon', e.id), 3);
    assert.equal(await bakiye('k.kod', `YLD-${String(f.firmaId)}`, e.id), 6);
    const yolda = await o().sahip.tek<{ tur: string; firma: number }>('SELECT tur, firma_id AS firma FROM stok_konum WHERE kod = $1', [`YLD-${String(f.firmaId)}`]);
    assert.deepEqual(yolda, { tur: 'yolda', firma: f.firmaId });

    const isId = (await o().sahip.tek<{ id: number }>("SELECT is_id AS id FROM sevkiyat_bekleyen WHERE kaynak = 'fason' AND uretim_emri_id = $1", [e.id]))!.id;
    const bugun = (await o().sahip.tek<{ g: string }>("SELECT to_char(current_date, 'YYYY-MM-DD') AS g"))!.g;
    const teslim = await durum(isId, 'tamamlandi', bugun);
    assert.equal(teslim.durum, 200, JSON.stringify(teslim.govde));
    assert.equal(await bakiye('k.kod', `YLD-${String(f.firmaId)}`, e.id), 0);
    assert.equal(await bakiye('k.kod', `FSN-${String(f.firmaId)}`, e.id), 6);
    assert.equal((await durum(isId, 'havuzda', bugun)).durum, 200);
    assert.equal(await bakiye('k.kod', `YLD-${String(f.firmaId)}`, e.id), 6, 'geri alınan teslim Yolda konumuna döner');
    assert.equal((await durum(isId, 'tamamlandi', bugun)).durum, 200);
    assert.equal(await bakiye('k.kod', `FSN-${String(f.firmaId)}`, e.id), 6);

    // Dönüş mal kabulden: girdisiz rotada emrin ürünü döner; hurda firmadan düşer, sağlam kabule gelir, dönüş kaydı emre yazılır.
    const sip = await hizmetSiparisi(f.firmaId);
    const d = await fasonKabulu(sip.siparisSatirId, urunNo, 4, e.fasonIsEmriId, 1);
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.deepEqual([await bakiye('k.kod', `FSN-${String(f.firmaId)}`, e.id), await bakiye('k.kod', 'KABUL', e.id)], [1, 4]);
    const kayit = (await istek<FasonIsleriCevabi>('depo', 'GET', `/stok/fason-isleri?konumId=${String(sip.kutu)}`)).govde.isler.find((x) => x.isEmriId === e.fasonIsEmriId);
    assert.deepEqual([kayit?.donen, kayit?.hurda, kayit?.statulu], [4, 1, false]);
    const fire = await o().sahip.tek<{ m: string }>("SELECT sum(miktar)::text AS m FROM stok_hareketi WHERE cikis_nedeni = 'fire' AND uretim_emri_id = $1", [e.id]);
    assert.equal(Number(fire?.m), 1);
    // Açık emrin firmadaki parçası eksik sayılmaz.
    const kutu = await istek<{ fasondaEksik: number }>('depo', 'GET', '/stok/is-kutusu');
    assert.equal(kutu.govde.fasondaEksik, 0);
  });

  test('noktasız firmaya gönderim de Yolda konumuna geçer; istasyonda parça bulunmasa da gönderim reddedilmez', async () => {
    const f = await fasonFirmaKur(false);
    const e = await fasonluEmir(f.firmaId);
    // Elle açılmış konum firma konumunun koduyla çakışırsa firma konumu ekli kodla açılır.
    await o().sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur) SELECT id, $1, 'depo_zemini' FROM stok_depo WHERE kod = 'ANA'", [`YLD-${String(f.firmaId)}`]);
    assert.equal((await fason(e.id, e.fasonIsEmriId, 'fason-gidis', { adet: 6 })).durum, 200);
    assert.equal(await bakiye('k.kod', `YLD-${String(f.firmaId)}-1`, e.id), 6);
    // Sayılandan azı istasyonda: kalan gönderim olan kadarını taşır, eksik Dış operasyonlarda kaydedilir.
    await o().sahip.sorgu(
      `UPDATE stok_bakiye b SET miktar = 1 FROM stok_konum k, stok_parti p
        WHERE k.id = b.konum_id AND p.id = b.parti_id AND k.tur = 'istasyon' AND p.uretim_emri_id = $1`, [e.id]);
    assert.equal((await fason(e.id, e.fasonIsEmriId, 'fason-gidis', { adet: 3 })).durum, 200);
    assert.equal(await bakiye('k.kod', `YLD-${String(f.firmaId)}-1`, e.id), 7, 'olan kadar taşınır');
    assert.equal(await bakiye('k.tur', 'istasyon', e.id), 0);
  });

  // Borç #440 (kullanıcı kararı 16.10, "Uyarı versin"): eksik giden gönderim reddedilmez, iş kutusu uyarısı sayısını artırır.
  test('eksik gönderim uyarı sayısını artırır, tam gönderim artırmaz; ilk adım fason sayılmaz', async () => {
    const sayi = (): Promise<number> => o().vt.tx((db) => fasonEksikGonderimSayisi(db));
    const f = await fasonFirmaKur(false);
    const e = await fasonluEmir(f.firmaId);
    const bas = await sayi();
    assert.equal((await fason(e.id, e.fasonIsEmriId, 'fason-gidis', { adet: 6 })).durum, 200);
    assert.equal(await sayi(), bas, 'tam gönderim uyarı vermez');
    await o().sahip.sorgu(
      `UPDATE stok_bakiye b SET miktar = 1 FROM stok_konum k, stok_parti p
        WHERE k.id = b.konum_id AND p.id = b.parti_id AND k.tur = 'istasyon' AND p.uretim_emri_id = $1`, [e.id]);
    assert.equal((await fason(e.id, e.fasonIsEmriId, 'fason-gidis', { adet: 3 })).durum, 200, 'eksik gönderim reddedilmez');
    assert.equal(await sayi(), bas + 1, 'eksik giden gönderim uyarı sayısını artırır');
    const kutu = (await istek<Record<string, number | null>>('depo', 'GET', '/stok/is-kutusu')).govde;
    assert.equal(kutu['fasonEksikGonderimi'], bas + 1, 'iş kutusu ucu sayıyı verir');
    const satir = ['kabuldeBekleyen', 'eksiBakiye', 'kritik', 'logoFarki', 'logoHatasi', 'sayimBekleyen', 'fasondaEksik', 'fasonEksikGonderimi'].filter((a) => (kutu[a] ?? 0) > 0).length;
    assert.equal((await istek<Record<string, number | null>>('depo', 'GET', '/stok/menu-sayaclari')).govde['is-kutusu'], satir, 'menü sayacı eksik gönderimi de kat');

    const g = await fasonFirmaKur(false);
    const m2 = await makineKur();
    const { uretimEmriId: id, isEmriIdleri } = await o().vt.tx(async (db) => uretimEmriAc(db, kullanici('planlama_proje'), {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(urunNo),
      isEmirleri: [adim(1, { tur: 'fason', id: g.firmaId }), adim(2, { tur: 'makine', id: m2 })],
    }));
    assert.equal((await fason(id, isEmriIdleri[0]!, 'fason-gidis', { adet: 4 })).durum, 200);
    assert.equal(await sayi(), bas + 1, 'ilk adım fason gönderimi uyarı vermez');
  });

  test('fason ilk adımsa gönderim reddedilmez ve stok taşınmaz (önceki istasyon yok)', async () => {
    const f = await fasonFirmaKur(false);
    const m2 = await makineKur();
    const { uretimEmriId: id, isEmriIdleri } = await o().vt.tx(async (db) => uretimEmriAc(db, kullanici('planlama_proje'), {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(urunNo),
      isEmirleri: [adim(1, { tur: 'fason', id: f.firmaId }), adim(2, { tur: 'makine', id: m2 })],
    }));
    const c = await fason(id, isEmriIdleri[0]!, 'fason-gidis', { adet: 4 });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const tasima = await o().sahip.tek<{ n: string }>("SELECT count(*)::text AS n FROM stok_hareketi WHERE uretim_emri_id = $1 AND tur = 'transfer'", [id]);
    assert.equal(Number(tasima?.n), 0, 'ilk adımda stok taşınmaz');
  });

  test('kısıt: Yolda konumu firmasız olamaz; firma konumu yalnız fason ve yolda türünde; firma başına her türden tek konum', async () => {
    const f = await fasonFirmaKur(false);
    const depo = (await o().sahip.tek<{ id: number }>("SELECT id FROM stok_depo WHERE kod = 'ANA'"))!.id;
    const kisit = (ad: string) => (h: unknown) => (h as { constraint?: string }).constraint === ad;
    await assert.rejects(o().sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur) VALUES ($1, 'YLD-X', 'yolda')", [depo]), kisit('stok_konum_firma_turu'));
    await assert.rejects(o().sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur, firma_id) VALUES ($1, 'KBL-X', 'kabul', $2)", [depo, f.firmaId]), kisit('stok_konum_firma_turu'));
    await o().sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur, firma_id) VALUES ($1, 'FSN-X1', 'fason', $2)", [depo, f.firmaId]);
    await assert.rejects(o().sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur, firma_id) VALUES ($1, 'FSN-X2', 'fason', $2)", [depo, f.firmaId]), kisit('stok_konum_firma_tek'));
  });

  // Hizmet siparişi satırı (satın almanın tabloları; fikstür) ve firmanın fason kutusu: fasondan dönüş mal kabulle yazılır.
  async function hizmetSiparisi(firmaId: number): Promise<{ siparisSatirId: number; kutu: number }> {
    sayac += 1;
    const sh = o().sahip;
    const hizmet = (await sh.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, hizmet_yonu)
       VALUES ($1, 'hizmet', 'SF-DNM-', $2, 'aktif', $3, $4, $4, 'alinan') RETURNING no`,
      [`sf-dnm-h${sayac}`, 100 + sayac, JSON.stringify({ id: `sf-dnm-h${sayac}`, com: { ad: 'Deneme kaplama' } }), yoneticiId]))!.no;
    const [t, kl, tk, katalog] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await sh.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, 'siparis_verildi')", [t, 95000 + sayac, yoneticiId]);
    await sh.sorgu("INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)", [katalog, hizmet]);
    await sh.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id) VALUES ($1, $2, 1, 'Deneme kalem', $3)", [t, kl, katalog]);
    await sh.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [t, tk]);
    await sh.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    await sh.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
    const siparisSatirId = (await sh.tek<{ id: number }>("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 10, 'adet') RETURNING id", [t, tk, kl]))!.id;
    const kutu = (await sh.tek<{ id: number }>("SELECT id FROM stok_konum WHERE tur = 'fason' AND firma_id = $1", [firmaId]))?.id ?? (await sh.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, firma_id) SELECT id, $1, 'fason', $2 FROM stok_depo WHERE kod = 'ANA' RETURNING id", [`FSN-${String(firmaId)}`, firmaId]))!.id;
    return { siparisSatirId, kutu };
  }
  const fasonKabulu = (siparisSatirId: number, malzemeId: number, adet: number, isEmriId: number, hurdaAdet?: number) =>
    istek<{ kod?: string; mesaj?: string }>('depo', 'POST', '/stok/mal-kabul', {
      tur: 'satin_alma', satirlar: [{ malzemeId, miktar: String(adet), siparisSatirId, fasonIsi: { isEmriId, ...(hurdaAdet === undefined ? {} : { hurdaAdet }) } }],
    });

  // Kart #1289: girdili emirde fasona giden, önceki adımın statüsündeki HM'dir. Dönüş yalnız mal kabulle girer (karar 15.10 B): dönüş
  // kaydı (sağlam, hurda) emre yazılır, hurda firmadan düşer, sağlam firmadan kabule gelir ve fason adımının statüsüne çevrilir.
  test('girdili emir: statülü HM firmaya gider, mal kabulde hurdası firmadan düşer, sağlamı fason adımının statüsüyle döner ve son adımda tükenir', async () => {
    const f = await fasonFirmaKur(false);
    const hm = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('sf-dnm-hm', 'hammadde', 'SF-DNM-', 2, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'sf-dnm-hm', com: { ad: 'Deneme çubuk' } }), yoneticiId]))!.no;
    const statu = async (op: number) => (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('SF-HM', $1, $2, '#2F6FDE', 'HM') RETURNING id", [`OP ${op}`, `sf-${op}`]))!.id;
    const [s10, s20] = [await statu(10), await statu(20)];
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo !== urunNo ? null : g.opNo === 10 ? s10 : g.opNo === 20 ? s20 : null));
    adimCiktisiCozucusuKaydet(async () => null);
    try {
      const [m1, m3] = [await makineKur(), await makineKur()];
      const { uretimEmriId: id, isEmriIdleri } = await o().vt.tx(async (db) => uretimEmriAc(db, kullanici('planlama_proje'), {
        projeId: denemeProjeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(urunNo),
        isEmirleri: [adim(1, { tur: 'makine', id: m1 }, [{ malzemeNo: hm, miktar: '2.5' }]), adim(2, { tur: 'fason', id: f.firmaId }), adim(3, { tur: 'makine', id: m3 })],
      }));
      const konum = async (m: number) => (await o().sahip.tek<{ id: number }>('SELECT k.id FROM stok_konum k JOIN makine m ON m.istasyon_id = k.istasyon_id WHERE m.id = $1', [m]))?.id;
      const yer = async (kod: string) => (await o().sahip.tek<{ id: number }>('SELECT id FROM stok_konum WHERE kod = $1', [kod]))?.id ?? 0;
      const hmBakiye = async (konumId: number | undefined, st: number | null) => Number((await o().sahip.tek<{ m: string }>(
        'SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2 AND statu_id IS NOT DISTINCT FROM $3', [hm, konumId ?? 0, st]))!.m);
      // HM istasyona doğrudan kabul edilir (hazırlık akışı teslim testlerinde).
      await o().sahip.sorgu(`INSERT INTO stok_konum (depo_id, kod, tur, istasyon_id)
        SELECT d.id, 'IST-' || m.istasyon_id, 'istasyon', m.istasyon_id FROM stok_depo d, makine m WHERE d.kod = 'ANA' AND m.id = $1`, [m1]);
      const k1 = await konum(m1);
      const kabul = await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: hm, miktar: '30', konumId: k1 }] });
      assert.equal(kabul.durum, 200, JSON.stringify(kabul.govde));
      const b1 = await terminal(id, 'baslat');
      assert.equal(b1.durum, 200, JSON.stringify(b1.govde));
      assert.equal((await terminal(id, 'sayim', { tur: 'saglam', adet: 4 })).durum, 200);
      await ilkParcaOnay(id);
      assert.equal((await terminal(id, 'bitir', {})).durum, 200);
      assert.equal(await hmBakiye(k1, s10), 10, '4 adet x 2,5: OP 10 statüsü');

      assert.equal((await fason(id, isEmriIdleri[1]!, 'fason-gidis', { adet: 4 })).durum, 200);
      const yolda = await yer(`YLD-${String(f.firmaId)}`);
      assert.deepEqual([await hmBakiye(k1, s10), await hmBakiye(yolda, s10)], [0, 10], 'yarı parça statüsüyle Yolda');

      const kabulKonumu = await yer('KABUL');
      const sip = await hizmetSiparisi(f.firmaId);
      const isler = await istek<FasonIsleriCevabi>('depo', 'GET', `/stok/fason-isleri?konumId=${String(sip.kutu)}`);
      assert.equal(isler.durum, 200, JSON.stringify(isler.govde));
      assert.deepEqual(isler.govde.isler.map((x) => [x.isEmriId, x.donenKart.malzemeId, x.statulu, x.gonderilen]), [[isEmriIdleri[1], hm, true, 4]], 'fason kutusunda açık iş ve dönecek kart');
      assert.equal((await fasonKabulu(sip.siparisSatirId, hm, 1, isEmriIdleri[1]!, 5)).durum, 400, 'gidenden fazla hurda dönmez');
      const fazla = await fasonKabulu(sip.siparisSatirId, hm, 5, isEmriIdleri[1]!, 1);
      assert.equal(fazla.durum, 200, JSON.stringify(fazla.govde));
      assert.deepEqual([await hmBakiye(yolda, s10), await hmBakiye(kabulKonumu, s10), await hmBakiye(kabulKonumu, s20)], [0, 0, 7.5],
        'hurda (2,5) firmadan düşer; firmada kalan 3 adet: 5 yazılsa da 3 adet mal kabule gelir ve OP 20 (fason) statüsüne çevrilir');
      const kayit = (await istek<FasonIsleriCevabi>('depo', 'GET', `/stok/fason-isleri?konumId=${String(sip.kutu)}`)).govde.isler[0];
      assert.deepEqual([kayit?.donen, kayit?.hurda], [3, 1], 'dönüş kaydı emre mal kabulden yazılır');
      const duzelt = await istek<{ mesaj?: string }>('depo', 'POST', `/stok/mal-kabuller/${String((fazla.govde as { belge?: { id: number } }).belge?.id)}/duzelt`, { satirlar: [] });
      assert.notEqual(duzelt.durum, 200, 'fason işinden dönen satırlı belge düzeltilmez');

      const tamam = await fason(id, isEmriIdleri[1]!, 'fason-tamamla', {});
      assert.equal(tamam.durum, 200, JSON.stringify(tamam.govde));
      const b3 = await terminal(id, 'baslat');
      assert.equal(b3.durum, 200, JSON.stringify(b3.govde));
      assert.equal((await terminal(id, 'sayim', { tur: 'saglam', adet: 3 })).durum, 200);
      // 562 1 b: fasondan dönüp kabulde bekleyen parça da teslimsiz düşülmez; son adım istasyonunda eksiye düşer, teslimle kapanır.
      const k3 = await konum(m3);
      assert.deepEqual([await hmBakiye(kabulKonumu, s20), await hmBakiye(k3, s20)], [7.5, -7.5], 'son adım kabule dokunmaz, istasyonda eksi düşer');
      const ist3 = (await o().sahip.tek<{ id: number }>('SELECT istasyon_id AS id FROM makine WHERE id = $1', [m3]))!.id;
      const g = await istek<{ teslim: { id: number; surum: number } }>('depo', 'POST', '/stok/teslimler/gonder', {
        malzemeId: hm, miktar: '7.5', statuId: s20, not: null, kaynakKimligi: randomUUID(), kaynak: { konumId: kabulKonumu }, hedef: { istasyonId: ist3 },
      });
      assert.equal(g.durum, 200, JSON.stringify(g.govde));
      const al = await istek('operator', 'POST', `/stok/teslimler/${String(g.govde.teslim.id)}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '7.5' });
      assert.equal(al.durum, 200, JSON.stringify(al.govde));
      assert.deepEqual([await hmBakiye(kabulKonumu, s20), await hmBakiye(k3, s20)], [0, 0], 'teslim alınınca eksi kapanır: son adım fasondan dönen HM\'yi tüketmiş olur');
      assert.equal(await bakiye('k.tur', 'istasyon', id), 3, 'ürün son adımın istasyonuna girer');
    } finally {
      adimStatusuCozucusuKaydet(async () => null);
      adimCiktisiCozucusuKaydet(async () => null);
    }
  });

  test('girdili emir: fason adımının çıkanı YM ise dönüşte YM mal kabule girer, giden statülü HM tükenir', async () => {
    const f = await fasonFirmaKur(false);
    const kart = async (sira: number, tur: string) => (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'SF-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`sf-dnm-${sira}`, tur, sira, JSON.stringify({ id: `sf-dnm-${sira}`, com: { ad: `Deneme ${sira}` } }), yoneticiId]))!.no;
    const [hm, ym] = [await kart(3, 'hammadde'), await kart(4, 'yarimamul')];
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('SF-HM2', 'OP 10', 'sf2-10', '#2F6FDE', 'HM') RETURNING id"))!.id;
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === urunNo && g.opNo === 10 ? s10 : null));
    adimCiktisiCozucusuKaydet(async (_db, g) => (g.malzemeNo === urunNo && g.opNo === 20 ? ym : null));
    try {
      const [m1, m3] = [await makineKur(), await makineKur()];
      const { uretimEmriId: id, isEmriIdleri } = await o().vt.tx(async (db) => uretimEmriAc(db, kullanici('planlama_proje'), {
        projeId: denemeProjeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: await revizyon(urunNo),
        isEmirleri: [adim(1, { tur: 'makine', id: m1 }, [{ malzemeNo: hm, miktar: '2' }]), adim(2, { tur: 'fason', id: f.firmaId }), adim(3, { tur: 'makine', id: m3 })],
      }));
      await o().sahip.sorgu(`INSERT INTO stok_konum (depo_id, kod, tur, istasyon_id)
        SELECT d.id, 'IST-' || m.istasyon_id, 'istasyon', m.istasyon_id FROM stok_depo d, makine m WHERE d.kod = 'ANA' AND m.id = $1`, [m1]);
      const k1 = (await o().sahip.tek<{ id: number }>('SELECT k.id FROM stok_konum k JOIN makine m ON m.istasyon_id = k.istasyon_id WHERE m.id = $1', [m1]))!.id;
      const kabulKonumu = (await o().sahip.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
      const miktar = async (malzemeId: number, konumId: number, st: number | null) => Number((await o().sahip.tek<{ m: string }>(
        'SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2 AND statu_id IS NOT DISTINCT FROM $3', [malzemeId, konumId, st]))!.m);
      assert.equal((await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: hm, miktar: '20', konumId: k1 }] })).durum, 200);
      assert.equal((await terminal(id, 'baslat')).durum, 200);
      assert.equal((await terminal(id, 'sayim', { tur: 'saglam', adet: 5 })).durum, 200);
      await ilkParcaOnay(id);
      assert.equal((await terminal(id, 'bitir', {})).durum, 200);
      assert.equal((await fason(id, isEmriIdleri[1]!, 'fason-gidis', { adet: 5 })).durum, 200);
      const sip = await hizmetSiparisi(f.firmaId);
      assert.equal((await fasonKabulu(sip.siparisSatirId, hm, 5, isEmriIdleri[1]!)).durum, 400, 'rotada çıkan YM: HM kartıyla dönüş reddedilir');
      const d = await fasonKabulu(sip.siparisSatirId, ym, 5, isEmriIdleri[1]!);
      assert.equal(d.durum, 200, JSON.stringify(d.govde));
      assert.deepEqual([await miktar(hm, kabulKonumu, s10), await miktar(ym, kabulKonumu, null)], [0, 5], 'giden 10 kg OP 10 HM tükenir, 5 YM girer');
      const sarf = await o().sahip.tek<{ m: string }>(
        "SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_hareketi WHERE uretim_emri_id = $1 AND malzeme_id = $2 AND cikis_nedeni = 'uretime_sarf'", [id, hm]);
      assert.equal(Number(sarf?.m), 10, 'HM emre sarf edilir');
    } finally {
      adimStatusuCozucusuKaydet(async () => null);
      adimCiktisiCozucusuKaydet(async () => null);
    }
  });
});
