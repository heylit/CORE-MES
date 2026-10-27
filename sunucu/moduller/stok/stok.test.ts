import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { islemMi } from '#paylasilan/islemler.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import { STOK_IKINCI_MENU } from '#paylasilan/sayfalar/stok.ts';
import {
  cikisOnerisiCevabi, emirTamamlamaCevabi, hareketlerCevabi, isKutusuCevabi, konumAyrintiCevabi, malKabulAyrintiCevabi, malKabulCevabi, malzemeAyrintiCevabi, malzemelerCevabi,
  araCevabi, yerlesimCevabi, fisAyrintiCevabi, fislerCevabi, kodCozCevabi, toplamaAyrintiCevabi, panelCevabi, aylikStokDegeriCevabi, partiIziCevabi, rafMatrisiCevabi,
  malzemeIstegiCevabi, malzemeIstekleriCevabi, stokOzetiCevabi, haritaOzetiCevabi, gozStoklariCevabi, lotEtiketleriCevabi, zeminCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import type { ZeminCevabi, AylikStokDegeriCevabi, HareketCevabi, MalzemeAyrintiCevabi, KodCozCevabi, LotEtiketleriCevabi, EmirTamamlamaCevabi, GozStoklariCevabi, HaritaOzetiCevabi, KonumAyrintiCevabi, KonumDuzenleCevabi, RafDuzenleCevabi, MalKabulAyrintiCevabi, MalKabulCevabi, MalzemeIstegiAcGirdisi, MalzemeIstegiCevabi, MalzemeIstekleriCevabi, PanelCevabi, Raf, SiparisIrsaliyeleriCevabi, SonPartilerCevabi, StokOzetiCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { komutIstegi } from '../../../istemci/src/moduller/recete-rota/kaynak-komutlari.ts';
import { PLAN_STOK_KOMUTLARI } from '../../../istemci/src/moduller/recete-rota/plan-stok-komutlari.ts';
import { statulerCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { Statu } from '#paylasilan/sozlesme/recete-rota.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { kayitlaraBagliBelgeler } from '../cizimler/disari.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { statuListesiCozucusu, degerGrubuToplamlari, dusukStokSayisi, partiKaliteDurumuYap, partilerinRedBakiyeleri, karantinadanBirak, karantinaDisiKonumlar, hareketPartileri, partilerinRedGirisleri, partileriBul, emrinAkisHareketleri, emrinPartileri, partiGirisZamanlari, sonPartiler, konumAdlari, malzemeIstegiAc, malzemeIstekleri, malzemeStokDurumlari, stokMiktarlari, stokYokIstekleri, lotEtiketleri } from './disari.ts';
import * as sorgular from './sorgular.ts';
import { kaliteDegistir } from './servis.ts';
import { acikEmirler } from '../uretim-emirleri/disari.ts';

const PAROLA = 'dogru-parola-1';
// Rol x işlem satırları kisiler modülünün göçüyle gelecek (BASKA-MODUL-ISTEKLERI); test kendi şemasında ekler.
const ROL_ISLEMLERI: Record<string, string[]> = {
  depo: ['stok.giris', 'stok.cikis', 'stok.transfer', 'stok.sayim', 'stok.tanim', 'stok.geri-al', 'stok.toplama'],
  kalite: ['stok.sayim'],
  mudur: ['stok.giris', 'stok.cikis', 'stok.transfer', 'stok.sayim', 'stok.tanim', 'stok.geri-al', 'stok.toplama', 'finans.oku'],
};

interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string; alan?: string; ayrinti?: { mevcut?: string; alan?: string } }

describe('stok (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
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

  async function istek<T = unknown>(kim: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    // Her yazma yeni istek kimliği taşır: tekrar korumalı uç kimliksiz isteği reddeder, korumasız uç başlığı yok sayar.
    const baslik = { ...(kim ? { cookie: cerezler.get(kim) ?? '' } : {}), ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const depo = <T = unknown>(y: 'GET' | 'POST', yol: string, g?: unknown) => istek<T>('depo', y, yol, g);
  const mudur = <T = unknown>(y: 'GET' | 'POST', yol: string, g?: unknown) => istek<T>('mudur', y, yol, g);

  async function kisiEkle(ad: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yonetici = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const id = await o().vt.tx(async (db) => {
      const y = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, kisiler.get('yonetici')!, y, rol!.id);
      await rolAl(db, kisiler.get('yonetici')!, y, yonetici!.id);
      return y;
    });
    kisiler.set(ad, id);
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  // Kart fikstürü tek yerde: malzemeler modülünün katalog kartı (5eb9481 göçü); ad kayıt.com.ad'dan okunur.
  let kartSira = 0;
  const kartAdlari = new Map<number, string>();
  async function kart(tur: 'hammadde' | 'yarimamul' | 'mamul' | 'sarf' | 'demirbas' | 'hizmet', durum = 'aktif', birim?: string): Promise<number> {
    kartSira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['STK-DNM-']);
    const ad = `Deneme ${tur} ${kartSira}`;
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, hizmet_yonu)
       VALUES ($1, $2, 'STK-DNM-', $3, $4, $5, $6, $6, $7) RETURNING no`,
      [`stok-dnm-${kartSira}`, tur, kartSira, durum, JSON.stringify({ id: `stok-dnm-${kartSira}`, com: { ad, ...(birim ? { birim } : {}) } }), kisiler.get('yonetici'),
        tur === 'hizmet' ? 'alinan' : null],
    );
    kartAdlari.set(r!.no, ad);
    return r!.no;
  }
  let emirSayac = 0;
  async function emir(): Promise<number> {
    emirSayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`SIM${emirSayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`SIS${emirSayac}`, `Deneme ${emirSayac}`, im!.id]);
    const e = await o().sahip.tek<{ id: number }>('INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ($1, $2, 10, $3, $4) RETURNING id', [`P-${emirSayac}`, 'Deneme', ist!.id, kisiler.get('yonetici')]);
    return e!.id;
  }
  const konumId = async (kod: string): Promise<number> => (await o().vt.tek<{ id: number }>('SELECT id FROM stok_konum WHERE kod = $1', [kod]))!.id;
  async function malKabul(malzemeId: number, miktar: string, ek: Record<string, unknown> = {}): Promise<Cevap<MalKabulCevabi & Hata>> {
    return depo<MalKabulCevabi & Hata>('POST', '/stok/mal-kabul', { tur: ek.siparisSatirId === undefined ? 'diger' : 'satin_alma', satirlar: [{ malzemeId, miktar, ...ek }] });
  }
  async function rafAc(kod: string, bolme = 2, kat = 2): Promise<Raf> {
    const c = await mudur<{ raf: Raf }>('POST', '/stok/raflar', { kod, tur: 'palet', numaralama: 'sirali', bolmeSayisi: bolme, katSayisi: kat, bolmeGenislikM: '2.7', derinlikM: '1.1', katAraligiM: '1.5' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.raf;
  }
  const bakiye = async (malzemeId: number, kod: string): Promise<string | null> =>
    (await o().vt.tek<{ m: string }>('SELECT sum(b.miktar)::text AS m FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id WHERE b.malzeme_id = $1 AND k.kod = $2', [malzemeId, kod]))?.m ?? null;

  before(async () => {
    ortam = await testVeritabaniKur('stok');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]);
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r!.id, i]);
    }
    for (const rol of ['depo', 'kalite', 'mudur', 'satin_alma', 'operator']) await kisiEkle(rol, rol);
    await kisiEkle('depo_kisitli', 'depo');
  });
  after(async () => { await ortam?.kaldir(); });

  test('statü adları stoğun kendi ucundan gelir: reçete-rota yetkisi olmayan depocu 200 alır; çözücü yokken liste boş, oturumsuz 401', async () => {
    assert.equal((await istek(null, 'GET', '/stok/statuler')).durum, 401);
    const bos = await depo('GET', '/stok/statuler');
    assert.equal(bos.durum, 200);
    assert.deepEqual(bos.govde, { statuler: [] });
    const statu: Statu = { id: 7, malzemeNo: 'YM-900', ad: 'OP 10 Tornalama', kaynakAdim: '12-o10', urunKodu: 'MM-950', revizyon: 'B', renk: 'x', tur: 'YM', zaman: '2026-10-05T08:00:00+03:00' };
    statuListesiCozucusu(async () => [statu]);
    try {
      const c = await depo('GET', '/stok/statuler');
      assert.equal(c.durum, 200);
      assert.deepEqual(statulerCevabi.parse(c.govde).statuler, [statu]);
      assert.equal((await depo('GET', '/recete-rota/statuler')).durum, 403, 'depocunun reçete-rota yetkisi yok');
    } finally {
      statuListesiCozucusu(async () => []);
    }
  });
  test('menü: her madde kayıtlı bir işlem ister, oturum yazılmaz; sayaç ucu anahtarlarla eşler (K6)', async () => {
    const maddeler: readonly { anahtar: string; islem: string }[] = STOK_IKINCI_MENU.gruplar.flatMap((g): readonly { anahtar: string; islem: string }[] => g.maddeler);
    for (const m of maddeler) assert.ok(islemMi(m.islem), `${m.anahtar}: ${m.islem}`);
    const c = await istek<Record<string, number | null>>('satin_alma', 'GET', '/stok/menu-sayaclari');
    assert.equal(c.durum, 200);
    ikinciMenuSayacSemasi.parse(c.govde);
    assert.deepEqual(Object.keys(c.govde).sort(), maddeler.map((m) => m.anahtar).sort());
    // Yetkiye göre süzülür: giriş işlemi olmayan kişide mal kabul sayısı null; olan kişide sayı.
    assert.equal(c.govde['mal-kabul'], null);
    assert.equal(typeof (await depo<Record<string, number | null>>('GET', '/stok/menu-sayaclari')).govde['mal-kabul'], 'number');
    // İş kutusu sayısı ekrandaki satır sayısıdır: sıfır olmayan iş türü sayısı, adetlerin toplamı değil.
    const kutu = (await depo<Record<string, number>>('GET', '/stok/is-kutusu')).govde;
    const satir = ['kabuldeBekleyen', 'eksiBakiye', 'kritik', 'logoFarki', 'logoHatasi'].filter((a) => (kutu[a] ?? 0) > 0).length;
    assert.equal((await depo<Record<string, number | null>>('GET', '/stok/menu-sayaclari')).govde['is-kutusu'], satir);
  });

  test('yetki (ST5): okuma stok sayfası ya da stok işlemiyle, yazma işlemle; girişsiz 401, işlemsiz 403, işlemli 200; menü sayacı oturumla', async () => {
    const k = await kart('sarf');
    assert.equal((await istek(null, 'GET', '/stok/hareketler')).durum, 401);
    assert.equal((await istek('satin_alma', 'GET', '/stok/hareketler')).durum, 200);
    assert.equal((await istek('kalite', 'GET', '/stok/hareketler')).durum, 200);
    for (const yol of ['/stok/hareketler', '/stok/malzemeler', '/stok/mal-kabuller', '/stok/is-kutusu']) {
      assert.equal((await istek('operator', 'GET', yol)).durum, 403, yol);
    }
    assert.equal((await istek('operator', 'GET', '/stok/menu-sayaclari')).durum, 200);
    assert.equal((await istek('satin_alma', 'POST', '/stok/mal-kabul', { tur: 'satin_alma', satirlar: [{ malzemeId: k, miktar: '1' }] })).durum, 403);
    assert.equal((await malKabul(k, '1')).durum, 200);
    // Soru 104 a: siparişsiz satın alma kabulü reddedilir, stoğa bir şey girmez; siparişli kabul aşağıdaki sipariş testlerinde 200.
    const siparissiz = await depo<Hata>('POST', '/stok/mal-kabul', { tur: 'satin_alma', satirlar: [{ malzemeId: k, miktar: '1' }] });
    assert.deepEqual([siparissiz.durum, siparissiz.govde.alan], [400, 'satirlar.0.siparisSatirId'], JSON.stringify(siparissiz.govde));
    assert.match(siparissiz.govde.mesaj, /"diğer" türüyle/);
    assert.equal((await istek('kalite', 'POST', '/stok/raflar', { kod: 'Y', tur: 'palet', numaralama: 'sirali', bolmeSayisi: 1, katSayisi: 1, bolmeGenislikM: '1', derinlikM: '1', katAraligiM: '1' })).durum, 403);
    assert.equal((await istek('kalite', 'POST', '/stok/cikis', { malzemeId: k, konumId: await konumId('KABUL'), miktar: '1', cikisNedeni: 'sevk' })).durum, 403);
  });

  test('yetki (746, 3 a): sayfayı açan rol sayfanın okuduğu stok verisini görür; yalnız o uçlar açılır, yazma kapalı kalır', async () => {
    const yalniz = async (kod: string, islem: string): Promise<void> => {
      const r = await o().sahip.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]);
      await o().sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [r!.id, islem]);
      await kisiEkle(kod, kod);
    };
    await yalniz('yalniz_rota', 'sayfa.rota');
    await yalniz('yalniz_planlama', 'plan.planlama-oku');
    await kisiEkle('cam', 'cam');
    await kisiEkle('planlama_proje', 'planlama_proje');
    const k = await kart('sarf');

    // Rota > Stok bölümü: kart listesi ve son hareketler.
    for (const kim of ['yalniz_rota', 'cam']) {
      for (const yol of ['/stok/malzemeler', '/stok/hareketler']) assert.equal((await istek(kim, 'GET', yol)).durum, 200, `${kim} ${yol}`);
    }
    for (const yol of ['/stok/is-kutusu', '/stok/partiler', '/stok/mal-kabuller', `/stok/malzemeler/${k}`, '/stok/acik-siparis-satirlari']) {
      assert.equal((await istek('yalniz_rota', 'GET', yol)).durum, 403, yol);
    }
    // Planlama > Malzeme planı ve Terminler: açık sipariş satırları.
    for (const kim of ['yalniz_planlama', 'planlama_proje']) assert.equal((await istek(kim, 'GET', '/stok/acik-siparis-satirlari')).durum, 200, kim);
    for (const yol of ['/stok/malzemeler', '/stok/hareketler', '/stok/fason-isleri']) assert.equal((await istek('yalniz_planlama', 'GET', yol)).durum, 403, yol);
    assert.equal((await istek('kalite', 'GET', '/stok/acik-siparis-satirlari')).durum, 403, 'iki işlemi de olmayan');
    assert.equal((await istek(null, 'GET', '/stok/acik-siparis-satirlari')).durum, 401);

    for (const kim of ['yalniz_rota', 'cam', 'yalniz_planlama', 'planlama_proje']) {
      const red = await istek<Hata>(kim, 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: k, miktar: '1' }] });
      assert.deepEqual([red.durum, red.govde.kod], [403, 'YETKI_YOK'], kim);
    }
  });

  test('DEP-14/12/13 raf: gözler Kod-Bölme-Kat açılır; kod değişince gözün kimliği aynı kalır; stoklu göz kapatılamaz', async () => {
    const raf = await rafAc('A', 2, 2);
    const m = await mudur<{ gozler: { kod: string; konumId: number }[] }>('GET', `/stok/raflar/${raf.id}`);
    rafMatrisiCevabi.parse(m.govde);
    assert.deepEqual(m.govde.gozler.map((g) => g.kod).sort(), ['A-01-01', 'A-01-02', 'A-02-01', 'A-02-02']);
    const goz = m.govde.gozler.find((g) => g.kod === 'A-02-02')!;
    const k = await kart('sarf');
    assert.equal((await malKabul(k, '5', { konumId: goz.konumId })).durum, 200);
    const yeni = await mudur<RafDuzenleCevabi>('POST', `/stok/raflar/${raf.id}/duzenle`, { surum: raf.surum, kod: 'AB', tur: 'palet', numaralama: 'sirali', bolmeSayisi: 2, katSayisi: 2, bolmeGenislikM: '2.7', derinlikM: '1.1', katAraligiM: '1.5' });
    assert.equal(yeni.durum, 200, JSON.stringify(yeni.govde));
    // 94 a: raf kodu değişince bütün gözlerin etiketi yeniden basılır.
    assert.deepEqual(yeni.govde.koduDegisenler.map((d) => [d.eskiKod, d.yeniKod, d.tur, d.bolmeNo, d.katNo]), [
      ['A-01-01', 'AB-01-01', 'raf_gozu', 1, 1], ['A-01-02', 'AB-01-02', 'raf_gozu', 1, 2], ['A-02-01', 'AB-02-01', 'raf_gozu', 2, 1], ['A-02-02', 'AB-02-02', 'raf_gozu', 2, 2],
    ]);
    const ayni = await mudur<KonumAyrintiCevabi>('GET', `/stok/konumlar/${goz.konumId}`);
    assert.equal(ayni.govde.konum.kod, 'AB-02-02');
    assert.equal(ayni.govde.bakiyeler[0]?.miktar, '5.000');
    const daral = await mudur<Hata>('POST', `/stok/raflar/${raf.id}/duzenle`, { surum: yeni.govde.raf.surum, kod: 'AB', tur: 'palet', numaralama: 'sirali', bolmeSayisi: 1, katSayisi: 2, bolmeGenislikM: '2.7', derinlikM: '1.1', katAraligiM: '1.5' });
    assert.equal(daral.durum, 409, JSON.stringify(daral.govde));
    assert.match(daral.govde.mesaj, /stok var/);
    assert.equal(await bakiye(k, 'AB-02-02'), '5.000');
  });

  test('134 a kalite durumu: red ve karar bekleyen kullanılabilir sayılmaz; sevke karar bekleyen çıkamaz, red uyarıyla çıkar (147 b); geri alma kaliteyi geri koyar', async () => {
    const k = await kart('sarf');
    assert.equal((await malKabul(k, '10')).durum, 200);
    const kabul = await konumId('KABUL');
    const partiId = (await o().vt.tek<{ p: number }>('SELECT parti_id AS p FROM stok_bakiye WHERE malzeme_id = $1', [k]))!.p;
    const degistir = (kaynak: 'serbest' | 'karar_bekliyor' | 'red', hedef: 'serbest' | 'karar_bekliyor' | 'red', miktar: bigint) => o().vt.tx((db) => kaliteDegistir(db, kisiler.get('depo')!, {
      malzemeId: k, konumId: kabul, partiId, statuId: null, kaynak, hedef, miktar, uretimEmriId: null, aciklama: 'Deneme kalite',
    }));
    await degistir('serbest', 'red', 4000n);
    await degistir('serbest', 'karar_bekliyor', 2000n);
    await assert.rejects(degistir('serbest', 'red', 5000n), /yeterli stok yok/);
    await assert.rejects(o().vt.sorgu("UPDATE stok_bakiye SET kalite_durumu = 'bloke' WHERE malzeme_id = $1", [k]), /stok_bakiye_kalite_degeri/);
    const durumlar = async () => (await o().vt.sorgu<{ q: string; m: string }>('SELECT kalite_durumu AS q, miktar::text AS m FROM stok_bakiye WHERE malzeme_id = $1 ORDER BY kalite_durumu', [k]))
      .map((r) => [r.q, r.m]);
    assert.deepEqual(await durumlar(), [['karar_bekliyor', '2.000'], ['red', '4.000'], ['serbest', '4.000']]);
    const m = (await o().vt.tx((db) => stokMiktarlari(db, [k]))).get(k);
    assert.deepEqual([m?.toplam, m?.kullanilabilir], ['10.000', '4.000']);

    const cikis = (g: Record<string, unknown>) => depo<HareketCevabi & Hata>('POST', '/stok/cikis', { malzemeId: k, konumId: kabul, partiId, miktar: '1', cikisNedeni: 'sevk', ...g });
    const bekleyen = await cikis({ kaliteDurumu: 'karar_bekliyor' });
    assert.notEqual(bekleyen.durum, 200);
    assert.match(bekleyen.govde.mesaj, /Karar bekleyen parça sevke çıkamaz/);
    const red = await cikis({ kaliteDurumu: 'red', aciklama: 'Sevk 7' });
    assert.equal(red.durum, 200, JSON.stringify(red.govde));
    assert.match(red.govde.uyari ?? '', /"red" notu/);
    const h = await o().vt.tek<{ q: string; a: string }>('SELECT kaynak_kalite_durumu AS q, aciklama AS a FROM stok_hareketi WHERE id = $1', [red.govde.hareketIdler[0]]);
    assert.deepEqual(h, { q: 'red', a: 'Red parça · Sevk 7' });
    const serbest = await cikis({});
    assert.equal(serbest.durum, 200);
    assert.equal(serbest.govde.uyari, undefined);
    assert.deepEqual(await durumlar(), [['karar_bekliyor', '2.000'], ['red', '3.000'], ['serbest', '3.000']]);
    assert.equal((await depo('POST', `/stok/hareketler/${red.govde.hareketIdler[0]}/geri-al`, {})).durum, 200);
    assert.deepEqual(await durumlar(), [['karar_bekliyor', '2.000'], ['red', '4.000'], ['serbest', '3.000']]);
    assert.deepEqual((await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db))).filter((f) => f.malzemeId === k), []);
  });

  test('229 a Kalite Merkezi parti kararı: lot ya da emirle parti bulunur; partinin bütün konumlardaki bakiyesi hedef kaliteye geçer, ikinci karar boş döner', async () => {
    const k = await kart('sarf');
    assert.equal((await malKabul(k, '6')).durum, 200);
    const p = (await o().vt.tek<{ id: number; lot: string }>('SELECT p.id, p.lot_no AS lot FROM stok_bakiye b JOIN stok_parti p ON p.id = b.parti_id WHERE b.malzeme_id = $1', [k]))!;
    assert.deepEqual(await o().vt.tx((db) => partileriBul(db, { lotNo: p.lot })), [p.id]);
    assert.deepEqual(await o().vt.tx((db) => partileriBul(db, {})), []);
    assert.deepEqual(await o().vt.tx((db) => partileriBul(db, { lotNo: 'LT-YOK-229' })), []);
    const zemin = await mudur<{ konum: { id: number } }>('POST', '/stok/konumlar', { tur: 'depo_zemini', kod: `KAL-229-${kartSira}`, ad: null });
    assert.equal(zemin.durum, 200, JSON.stringify(zemin.govde));
    const kabul = await konumId('KABUL');
    assert.equal((await depo('POST', '/stok/tasima', { malzemeId: k, partiId: p.id, kaynakKonumId: kabul, hedefKonumId: zemin.govde.konum.id, miktar: '2' })).durum, 200);
    const kisi = kisiler.get('depo')!;
    const degisen = await o().vt.tx((db) => partiKaliteDurumuYap(db, kisi, { partiId: p.id, hedef: 'red', aciklama: 'NCR deneme' }));
    assert.deepEqual(degisen.map((d) => [d.konumId, d.statuId, d.kaynak, d.miktar]).sort((a, b) => Number(a[0]) - Number(b[0])),
      [[kabul, null, 'serbest', '4'], [zemin.govde.konum.id, null, 'serbest', '2']].sort((a, b) => Number(a[0]) - Number(b[0])));
    const durumlar = await o().vt.sorgu<{ q: string; m: string }>('SELECT kalite_durumu AS q, sum(miktar)::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND miktar > 0 GROUP BY 1', [k]);
    assert.deepEqual(durumlar.map((r) => [r.q, r.m]), [['red', '6.000']]);
    const h = await o().vt.tek<{ a: string; q: string }>('SELECT aciklama AS a, hedef_kalite_durumu AS q FROM stok_hareketi WHERE id = $1', [degisen[0]!.hareketId]);
    assert.deepEqual(h, { a: 'NCR deneme', q: 'red' });
    // Denetim #16: kalite kararını yazan hareket stok geri almasıyla bozulmaz; teki de toplusu da reddedilir.
    const tek = await mudur<{ mesaj: string }>('POST', `/stok/hareketler/${String(degisen[0]!.hareketId)}/geri-al`, {});
    assert.deepEqual([tek.durum, tek.govde.mesaj], [409, 'Otomatik hareket yalnız onu yazan çağrıyla geri alınır.']);
    assert.equal((await mudur('POST', '/stok/hareketler/geri-al', { hareketIdler: degisen.map((d) => d.hareketId) })).durum, 409);
    assert.deepEqual((await o().vt.sorgu<{ q: string }>('SELECT DISTINCT kalite_durumu AS q FROM stok_bakiye WHERE malzeme_id = $1 AND miktar > 0', [k])).map((r) => r.q), ['red']);
    // İkinci karar değişecek satır bulmaz.
    assert.deepEqual(await o().vt.tx((db) => partiKaliteDurumuYap(db, kisi, { partiId: p.id, hedef: 'red', aciklama: 'NCR deneme' })), []);
    assert.deepEqual((await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db))).filter((f) => f.malzemeId === k), []);
  });

  test('16.1: NCR ile yerinde red olan parti eksi onayıyla da taşınmaz, düşülmez, sepetle gitmez; serbest eksikte eksi onayı sürer', async () => {
    const k = await kart('sarf');
    assert.equal((await malKabul(k, '6')).durum, 200);
    const kabul = await konumId('KABUL');
    const p = (await o().vt.tek<{ id: number }>('SELECT parti_id AS id FROM stok_bakiye WHERE malzeme_id = $1', [k]))!.id;
    const zemin = await mudur<{ konum: { id: number } }>('POST', '/stok/konumlar', { tur: 'depo_zemini', kod: `NCR-161-${kartSira}`, ad: null });
    assert.equal(zemin.durum, 200, JSON.stringify(zemin.govde));
    const z = zemin.govde.konum.id;
    await o().vt.tx((db) => partiKaliteDurumuYap(db, kisiler.get('depo')!, { partiId: p, hedef: 'red', aciklama: 'NCR deneme' }));
    const engel = /^Bu gözdeki parça serbest değil: 6 red \(karantinada\)\. Eksi onayı kalite kararını aşmaz/;

    const tasi = await depo<Hata>('POST', '/stok/tasima', { malzemeId: k, partiId: p, kaynakKonumId: kabul, hedefKonumId: z, miktar: '6', eksiOnay: true });
    assert.equal(tasi.durum, 422, JSON.stringify(tasi.govde));
    assert.match(tasi.govde.mesaj, engel);
    const cik = await depo<Hata>('POST', '/stok/cikis', { malzemeId: k, partiId: p, konumId: kabul, miktar: '1', cikisNedeni: 'diger', eksiOnay: true });
    assert.deepEqual([cik.durum, engel.test(cik.govde.mesaj)], [422, true], JSON.stringify(cik.govde));
    const ekle = await depo<Hata & { satirlar: { id: number }[] }>('POST', '/stok/sepet/satir-ekle', { malzemeId: k, kaynakKonumId: kabul, partiId: p, miktar: '6' });
    assert.equal(ekle.durum, 200, JSON.stringify(ekle.govde));
    const sepet = await depo<Hata>('POST', '/stok/sepet/teslim-et', { hedefKonumId: z, eksiOnay: true });
    assert.deepEqual([sepet.durum, engel.test(sepet.govde.mesaj)], [422, true], JSON.stringify(sepet.govde));
    const dus = await depo<Hata>('POST', '/stok/sepet/stoktan-dus', { cikisNedeni: 'diger', eksiOnay: true });
    assert.deepEqual([dus.durum, engel.test(dus.govde.mesaj)], [422, true], JSON.stringify(dus.govde));
    for (const x of ekle.govde.satirlar) assert.equal((await depo('POST', `/stok/sepet/satirlar/${String(x.id)}/sil`, {})).durum, 200);
    const durumlar = await o().vt.sorgu<{ k: number; q: string; m: string }>(
      'SELECT konum_id AS k, kalite_durumu AS q, sum(miktar)::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND miktar <> 0 GROUP BY 1, 2', [k]);
    assert.deepEqual(durumlar.map((r) => [r.k, r.q, r.m]), [[kabul, 'red', '6.000']], 'hiçbir şey yazılmaz');
    assert.deepEqual((await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db))).filter((f) => f.malzemeId === k), []);
  });

  test('denetim #15: karantinadaki parça depoda yalnız hurdaya taşınır ya da fire çıkışıyla düşer; serbest bırakmayı Kalite Merkezi çağırır', async () => {
    const k = await kart('sarf');
    assert.equal((await malKabul(k, '6')).durum, 200);
    const kabul = await konumId('KABUL');
    const p = (await o().vt.tek<{ id: number }>('SELECT parti_id AS id FROM stok_bakiye WHERE malzeme_id = $1', [k]))!.id;
    const karantina = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur) SELECT depo_id, $1, 'karantina' FROM stok_konum WHERE kod = 'KABUL' RETURNING id", [`KRN-15-${kartSira}`]))!.id;
    const hurda = await mudur<{ konum: { id: number } }>('POST', '/stok/konumlar', { tur: 'hurda', kod: `HRD-15-${kartSira}`, ad: null });
    assert.equal(hurda.durum, 200, JSON.stringify(hurda.govde));
    const tasi = (kaynakKonumId: number, hedefKonumId: number, miktar: string) => depo<{ mesaj?: string }>('POST', '/stok/tasima', { malzemeId: k, partiId: p, kaynakKonumId, hedefKonumId, miktar });
    const cik = (cikisNedeni: string) => depo<{ mesaj?: string }>('POST', '/stok/cikis', { malzemeId: k, partiId: p, konumId: karantina, miktar: '1', cikisNedeni });
    const engel = 'Karantinadaki parça yalnız hurdaya taşınır ya da fire nedeniyle çıkar; serbest bırakma Kalite Merkezi kararıyla olur.';

    assert.equal((await tasi(kabul, karantina, '4')).durum, 200, 'karantinaya taşıma açık');
    const disari = await tasi(karantina, kabul, '1');
    assert.deepEqual([disari.durum, disari.govde.mesaj], [422, engel]);
    const diger = await cik('diger');
    assert.deepEqual([diger.durum, diger.govde.mesaj], [422, engel]);
    assert.equal((await tasi(karantina, hurda.govde.konum.id, '1')).durum, 200);
    assert.equal((await cik('fire')).durum, 200);

    const birakilan = await o().vt.tx((db) => karantinadanBirak(db, kisiler.get('depo')!, { partiId: p, hedefKonumId: kabul, aciklama: 'Kalite serbest bıraktı' }));
    assert.deepEqual(birakilan.map((b) => [b.konumId, b.miktar]), [[karantina, '2']]);
    const yerler = await o().vt.sorgu<{ k: number; m: string }>('SELECT konum_id AS k, sum(miktar)::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND miktar > 0 GROUP BY 1 ORDER BY 1', [k]);
    assert.deepEqual(yerler.map((r) => [r.k, r.m]).sort((a, b) => Number(a[0]) - Number(b[0])), [[kabul, '4.000'], [hurda.govde.konum.id, '1.000']].sort((a, b) => Number(a[0]) - Number(b[0])));
    await assert.rejects(o().vt.tx((db) => karantinadanBirak(db, kisiler.get('depo')!, { partiId: p, hedefKonumId: karantina, aciklama: 'x' })), /karantina dışında/);
    assert.deepEqual((await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db))).filter((f) => f.malzemeId === k), []);
  });

  test('denetim #15 Kalite istekleri: hedefsiz serbest bırakma parçayı karantinadan önceki konumuna döndürür, bilinmiyorsa açık hata; konum listesi karantinasız; hareket -> parti', async () => {
    const k = await kart('sarf');
    assert.equal((await malKabul(k, '5')).durum, 200);
    const kabul = await konumId('KABUL');
    const p = (await o().vt.tek<{ id: number }>('SELECT parti_id AS id FROM stok_bakiye WHERE malzeme_id = $1', [k]))!.id;
    const zemin = await mudur<{ konum: { id: number } }>('POST', '/stok/konumlar', { tur: 'depo_zemini', kod: `ZMN-15-${kartSira}`, ad: null });
    assert.equal(zemin.durum, 200, JSON.stringify(zemin.govde));
    const krnKod = `KRN-15B-${kartSira}`;
    const karantina = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur) SELECT depo_id, $1, 'karantina' FROM stok_konum WHERE kod = 'KABUL' RETURNING id", [krnKod]))!.id;
    const tasi = (kaynakKonumId: number, hedefKonumId: number, miktar: string) => depo<{ hareketIdler?: number[] }>('POST', '/stok/tasima', { malzemeId: k, partiId: p, kaynakKonumId, hedefKonumId, miktar });
    assert.equal((await tasi(kabul, zemin.govde.konum.id, '5')).durum, 200);
    assert.equal((await tasi(zemin.govde.konum.id, karantina, '3')).durum, 200);

    const giris = (await o().vt.tek<{ id: number }>("SELECT id FROM stok_hareketi WHERE parti_id = $1 AND hedef_konum_id = $2 AND tur = 'transfer'", [p, karantina]))!.id;
    const partiler = await o().vt.tx((db) => hareketPartileri(db, [giris, 2147483000]));
    assert.deepEqual([...partiler], [[giris, p]]);
    assert.deepEqual([...(await o().vt.tx((db) => hareketPartileri(db, [])))], []);

    const secenekler = await o().vt.tx((db) => karantinaDisiKonumlar(db));
    assert.equal(secenekler.some((x) => x.id === karantina), false);
    assert.equal(secenekler.some((x) => x.id === zemin.govde.konum.id && x.tur === 'depo_zemini'), true);

    const birakilan = await o().vt.tx((db) => karantinadanBirak(db, kisiler.get('depo')!, { partiId: p, aciklama: 'MRB: olduğu gibi kullan' }));
    assert.deepEqual(birakilan.map((b) => [b.konumId, b.hedefKonumId, b.miktar]), [[karantina, zemin.govde.konum.id, '3']]);
    assert.equal(await bakiye(k, `ZMN-15-${kartSira}`), '5.000');

    // Mal kabulde doğrudan karantinaya giren partinin önceki konumu yoktur: hedef verilmeden bırakılmaz, hiçbir şey yazılmaz.
    const k2 = await kart('sarf');
    assert.equal((await malKabul(k2, '2', { konumId: karantina })).durum, 200);
    const p2 = (await o().vt.tek<{ id: number }>('SELECT parti_id AS id FROM stok_bakiye WHERE malzeme_id = $1', [k2]))!.id;
    await assert.rejects(o().vt.tx((db) => karantinadanBirak(db, kisiler.get('depo')!, { partiId: p2, aciklama: 'x' })), /karantinadan önceki konumu bilinmiyor/);
    assert.equal(await bakiye(k2, krnKod), '2.000');
    assert.deepEqual((await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db))).filter((f) => f.malzemeId === k || f.malzemeId === k2), []);
  });

  test('miktarlı serbest bırakma: verilen miktar karantina bakiyelerinden sırayla taşınır, kalan karantinada kalır; fazlası ve sıfır reddedilir, hiçbir şey yazmaz; miktarsız bugünkü gibi hepsini taşır', async () => {
    const k = await kart('sarf');
    assert.equal((await malKabul(k, '10')).durum, 200);
    const kabul = await konumId('KABUL');
    const p = (await o().vt.tek<{ id: number }>('SELECT parti_id AS id FROM stok_bakiye WHERE malzeme_id = $1', [k]))!.id;
    const karantinaAc = async (kod: string) => (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur) SELECT depo_id, $1, 'karantina' FROM stok_konum WHERE kod = 'KABUL' RETURNING id", [kod]))!.id;
    const kod1 = `KRN-M1-${kartSira}`, kod2 = `KRN-M2-${kartSira}`;
    const krn1 = await karantinaAc(kod1), krn2 = await karantinaAc(kod2);
    const tasi = (hedefKonumId: number, miktar: string) => depo('POST', '/stok/tasima', { malzemeId: k, partiId: p, kaynakKonumId: kabul, hedefKonumId, miktar });
    assert.equal((await tasi(krn1, '6')).durum, 200);
    assert.equal((await tasi(krn2, '2')).durum, 200);
    const birak = (miktar?: string) => o().vt.tx((db) => karantinadanBirak(db, kisiler.get('depo')!, { partiId: p, hedefKonumId: kabul, aciklama: 'NCR kısmi karar', ...(miktar === undefined ? {} : { miktar }) }));

    const ilk = await birak('7');
    assert.deepEqual(ilk.map((b) => [b.konumId, b.miktar]), [[krn1, '6'], [krn2, '1']]);
    assert.deepEqual([await bakiye(k, kod1), await bakiye(k, kod2), await bakiye(k, 'KABUL')], [null, '1.000', '9.000']);

    await assert.rejects(birak('2'), /kullanılabilir miktarı aşıyor/);
    await assert.rejects(birak('0'), /sıfırdan büyük/);
    assert.deepEqual([await bakiye(k, kod2), await bakiye(k, 'KABUL')], ['1.000', '9.000']);

    const kalan = await birak();
    assert.deepEqual(kalan.map((b) => [b.konumId, b.miktar]), [[krn2, '1']]);
    assert.deepEqual([await bakiye(k, kod2), await bakiye(k, 'KABUL')], [null, '10.000']);
    assert.deepEqual((await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db))).filter((f) => f.malzemeId === k), []);
  });

  test('320 a NCR kısmi serbest bırakma: satırlı kalite kararı yalnız verilen satır ve miktarı çevirir, karantinada kalan red kalır; aşan, bulunmayan ya da sıfır satır hiçbir şey yazmaz', async () => {
    const k = await kart('sarf');
    assert.equal((await malKabul(k, '10')).durum, 200);
    const kabul = await konumId('KABUL');
    const p = (await o().vt.tek<{ id: number }>('SELECT parti_id AS id FROM stok_bakiye WHERE malzeme_id = $1', [k]))!.id;
    const krn = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur) SELECT depo_id, $1, 'karantina' FROM stok_konum WHERE kod = 'KABUL' RETURNING id", [`KRN-320-${kartSira}`]))!.id;
    assert.equal((await depo('POST', '/stok/tasima', { malzemeId: k, partiId: p, kaynakKonumId: kabul, hedefKonumId: krn, miktar: '6' })).durum, 200);
    const kisi = kisiler.get('depo')!;
    await o().vt.tx((db) => partiKaliteDurumuYap(db, kisi, { partiId: p, hedef: 'red', aciklama: 'NCR açıldı' }));
    const durum = async () => (await o().vt.sorgu<{ konum: number; q: string; m: string }>(
      'SELECT konum_id AS konum, kalite_durumu AS q, miktar::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND miktar > 0 ORDER BY 1, 2', [k])).map((r) => [r.konum, r.q, r.m]);
    const hareketSayisi = async () => Number((await o().vt.tek<{ n: string }>('SELECT count(*)::text AS n FROM stok_hareketi WHERE malzeme_id = $1', [k]))!.n);

    const birakilan = await o().vt.tx((db) => karantinadanBirak(db, kisi, { partiId: p, hedefKonumId: kabul, aciklama: 'NCR kısmi', miktar: '4' }));
    const satirlar = birakilan.map((b) => ({ konumId: b.hedefKonumId, statuId: b.statuId, kaliteDurumu: b.kaliteDurumu, miktar: b.miktar }));
    assert.deepEqual(satirlar, [{ konumId: kabul, statuId: null, kaliteDurumu: 'red', miktar: '4' }]);
    const yap = (s: typeof satirlar) => o().vt.tx((db) => partiKaliteDurumuYap(db, kisi, { partiId: p, hedef: 'serbest', aciklama: 'NCR kapandı', satirlar: s }));

    const once = [await durum(), await hareketSayisi()];
    await assert.rejects(yap([{ ...satirlar[0]!, miktar: '9' }]), /kullanılabilir miktarını aşıyor/);
    await assert.rejects(yap([{ ...satirlar[0]!, konumId: krn, kaliteDurumu: 'serbest' }]), /bakiyesi yok/);
    await assert.rejects(yap([{ ...satirlar[0]!, miktar: '0' }]), /sıfırdan büyük/);
    await assert.rejects(yap([{ ...satirlar[0]!, miktar: '2' }, { ...satirlar[0]!, miktar: '3' }]), /tek satır/);
    assert.deepEqual([await durum(), await hareketSayisi()], once, 'reddedilen çağrı hiçbir şey yazmaz');

    const degisen = await yap(satirlar);
    assert.deepEqual(degisen.map((d) => [d.konumId, d.kaynak, d.miktar]), [[kabul, 'red', '4']]);
    assert.deepEqual(await durum(), [[kabul, 'red', '4.000'], [kabul, 'serbest', '4.000'], [krn, 'red', '2.000']].sort((a, b) => Number(a[0]) - Number(b[0])));
    assert.deepEqual((await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db))).filter((f) => f.malzemeId === k), []);
  });

  test('320 a partilerin red bakiyeleri: karantinadaki ve yerinde duran red bakiye önce karantina olmak üzere listelenir; yoldaki ayrılan düşülür, red olmayan ve bakiyesiz parti boş döner', async () => {
    const k = await kart('sarf');
    assert.equal((await malKabul(k, '10')).durum, 200);
    const kabul = await konumId('KABUL');
    const p = (await o().vt.tek<{ id: number }>('SELECT parti_id AS id FROM stok_bakiye WHERE malzeme_id = $1', [k]))!.id;
    const krn = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur) SELECT depo_id, $1, 'karantina' FROM stok_konum WHERE kod = 'KABUL' RETURNING id", [`KRN-RB-${kartSira}`]))!.id;
    assert.equal((await depo('POST', '/stok/tasima', { malzemeId: k, partiId: p, kaynakKonumId: kabul, hedefKonumId: krn, miktar: '6' })).durum, 200);
    const oku = (idler: number[]) => o().vt.tx((db) => partilerinRedBakiyeleri(db, idler));
    assert.deepEqual([...(await oku([p]))], [[p, []]], 'red olmayan bakiye listede yok');
    const kisi = kisiler.get('depo')!;
    await o().vt.tx((db) => partiKaliteDurumuYap(db, kisi, { partiId: p, hedef: 'red', aciklama: 'NCR açıldı' }));
    await o().sahip.sorgu(
      `INSERT INTO stok_teslim (no, kaynak_kimligi, malzeme_id, miktar, parti_id, kaynak_konum_id, hedef_konum_id, gonderen_kisi_id, durum, kalite_durumu)
       VALUES ($1, $1, $2, 1, $3, $4, $5, $6, 'yolda', 'red')`, [`TS-RB-${kartSira}`, k, p, kabul, krn, kisi]);
    const yok = 2147483000;
    assert.deepEqual([...(await oku([p, yok]))], [
      [p, [
        { konumId: krn, statuId: null, kaliteDurumu: 'red', kullanilabilir: '6', karantinaKonumuMu: true },
        { konumId: kabul, statuId: null, kaliteDurumu: 'red', kullanilabilir: '3', karantinaKonumuMu: false },
      ]],
      [yok, []],
    ]);
    assert.deepEqual([...(await oku([]))], []);
  });

  test('320 a kaliteyle serbest bırakma: aynı karantinada red ve serbest satır varken kalite verilen çağrı yalnız o kaliteyi taşır, aşım da yalnız ondan hesaplanır', async () => {
    const k = await kart('sarf');
    assert.equal((await malKabul(k, '10')).durum, 200);
    const kabul = await konumId('KABUL');
    const p = (await o().vt.tek<{ id: number }>('SELECT parti_id AS id FROM stok_bakiye WHERE malzeme_id = $1', [k]))!.id;
    const krn = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur) SELECT depo_id, $1, 'karantina' FROM stok_konum WHERE kod = 'KABUL' RETURNING id", [`KRN-KB-${kartSira}`]))!.id;
    assert.equal((await depo('POST', '/stok/tasima', { malzemeId: k, partiId: p, kaynakKonumId: kabul, hedefKonumId: krn, miktar: '6' })).durum, 200);
    const kisi = kisiler.get('depo')!;
    await o().vt.tx((db) => partiKaliteDurumuYap(db, kisi, { partiId: p, hedef: 'red', aciklama: 'NCR açıldı', satirlar: [{ konumId: krn, statuId: null, kaliteDurumu: 'serbest', miktar: '4' }] }));
    const durum = async () => (await o().vt.sorgu<{ konum: number; q: string; m: string }>(
      'SELECT konum_id AS konum, kalite_durumu AS q, miktar::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND miktar > 0 ORDER BY 1, 2', [k])).map((r) => [r.konum, r.q, r.m]);
    assert.deepEqual(await durum(), [[kabul, 'serbest', '4.000'], [krn, 'red', '4.000'], [krn, 'serbest', '2.000']]);
    const birak = (miktar: string) => o().vt.tx((db) => karantinadanBirak(db, kisi, { partiId: p, hedefKonumId: kabul, aciklama: 'NCR kısmi', miktar, kaliteDurumu: 'red' }));

    await assert.rejects(birak('5'), /kullanılabilir miktarı aşıyor/, 'aşım yalnız red bakiyeden: 4');
    const tasinan = await birak('3');
    assert.deepEqual(tasinan.map((t) => [t.konumId, t.kaliteDurumu, t.miktar]), [[krn, 'red', '3']]);
    assert.deepEqual(await durum(), [[kabul, 'red', '3.000'], [kabul, 'serbest', '4.000'], [krn, 'red', '1.000'], [krn, 'serbest', '2.000']]);
    assert.deepEqual((await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db))).filter((f) => f.malzemeId === k), []);
  });

  test('Kalite #1971: partinin şu anki red bakiyesini oluşturan redde giriş hareketleri; red sıfıra inince eskiler düşer', async () => {
    const k = await kart('sarf');
    assert.equal((await malKabul(k, '5')).durum, 200);
    const p = (await o().vt.tek<{ id: number }>('SELECT parti_id AS id FROM stok_bakiye WHERE malzeme_id = $1', [k]))!.id;
    const kisi = kisiler.get('depo')!;
    const yap = (hedef: 'red' | 'serbest') => o().vt.tx((db) => partiKaliteDurumuYap(db, kisi, { partiId: p, hedef, aciklama: 'Kalite deneme' }));
    const oku = async () => [...(await o().vt.tx((db) => partilerinRedGirisleri(db, [p, 2147483000])))];
    assert.deepEqual(await oku(), [[p, []], [2147483000, []]], 'red bakiyesi yoksa boş dizi');
    const ilk = (await yap('red')).map((x) => x.hareketId);
    assert.deepEqual(await oku(), [[p, ilk], [2147483000, []]]);
    await yap('serbest');
    assert.deepEqual(await oku(), [[p, []], [2147483000, []]], 'red sıfıra inince giriş kalmaz');
    const ikinci = (await yap('red')).map((x) => x.hareketId);
    assert.deepEqual(await oku(), [[p, ikinci], [2147483000, []]], 'yalnız son sıfırdan sonraki giriş');
    // Red parçanın konum değiştirmesi yeni giriş sayılmaz.
    const zemin = await mudur<{ konum: { id: number } }>('POST', '/stok/konumlar', { tur: 'depo_zemini', kod: `ZMN-RED-${kartSira}`, ad: null });
    assert.equal(zemin.durum, 200, JSON.stringify(zemin.govde));
    // Elle taşıma yalnız serbest parçayı taşır; red parçanın gidip dönen yer değiştirmesi hareket defterine doğrudan yazılır (bakiye değişmez).
    const kabul = await konumId('KABUL');
    for (const [kaynak, hedef] of [[kabul, zemin.govde.konum.id], [zemin.govde.konum.id, kabul]]) await o().sahip.sorgu(
      `INSERT INTO stok_hareketi (tur, malzeme_id, parti_id, parti_secimi, kaynak_konum_id, hedef_konum_id, miktar, kisi_id, kaynak_kalite_durumu, hedef_kalite_durumu)
       VALUES ('transfer', $1, $2, 'kisi', $3, $4, 2, $5, 'red', 'red')`, [k, p, kaynak, hedef, kisi]);
    assert.deepEqual((await oku())[0], [p, ikinci]);
    assert.deepEqual([...(await o().vt.tx((db) => partilerinRedGirisleri(db, [])))], []);
  });

  test('DEP-29 sürüm: eski sürümle düzenleme 409 eski-surum', async () => {
    const c = await mudur<{ konum: { id: number; surum: number } }>('POST', '/stok/konumlar', { tur: 'depo_zemini', kod: 'D-C4', ad: 'Zemin C4' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const ayniKod = await mudur<KonumDuzenleCevabi>('POST', `/stok/konumlar/${c.govde.konum.id}/duzenle`, { surum: c.govde.konum.surum, kod: 'D-C4', ad: 'Zemin' });
    assert.equal(ayniKod.durum, 200);
    assert.deepEqual(ayniKod.govde.koduDegisenler, []);
    const eski = await mudur<Hata & { ayrinti: { neden: string } }>('POST', `/stok/konumlar/${c.govde.konum.id}/duzenle`, { surum: c.govde.konum.surum, kod: 'D-C4', ad: 'Başka' });
    assert.equal(eski.durum, 409);
    assert.equal(eski.govde.ayrinti.neden, 'eski-surum');
  });

  test('94 a konum kodu değişince cevap yeniden basılacak etiketi verir', async () => {
    const c = await mudur<{ konum: { id: number; surum: number } }>('POST', '/stok/konumlar', { tur: 'ara_alan', kod: 'ARA-K1', ad: 'Bekleme' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const d = await mudur<KonumDuzenleCevabi>('POST', `/stok/konumlar/${c.govde.konum.id}/duzenle`, { surum: c.govde.konum.surum, kod: 'ARA-K2', ad: 'Bekleme' });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.deepEqual(d.govde.koduDegisenler, [{ konumId: c.govde.konum.id, eskiKod: 'ARA-K1', yeniKod: 'ARA-K2', tur: 'ara_alan', ad: 'Bekleme', bolmeNo: null, katNo: null }]);
  });

  test('DEP-20/10/49 mal kabul: hammadde her girişte lot alır, aynı döküm no ikinci gelişte ayrı lottur, kullanılamaz kart reddedilir, demirbaş parti almaz', async () => {
    // #1018: numarasız hammadde girişi yeni lot açar; ikinci numarasız giriş (parçalı teslimat) ayrı lottur.
    const hl = await kart('hammadde');
    assert.equal((await malKabul(hl, '3')).durum, 200);
    assert.equal((await malKabul(hl, '2')).durum, 200);
    const lotlar = await o().vt.sorgu<{ lot_no: string; tedarikci_parti_no: string | null }>('SELECT lot_no, tedarikci_parti_no FROM stok_parti WHERE malzeme_id = $1 ORDER BY id', [hl]);
    assert.equal(lotlar.length, 2);
    for (const l of lotlar) { assert.match(l.lot_no, /^LT-\d{6}$/); assert.equal(l.tedarikci_parti_no, null); }
    assert.notEqual(lotlar[0]!.lot_no, lotlar[1]!.lot_no);
    const h = await kart('hammadde');
    const p1 = await malKabul(h, '10', { parti: { tedarikciPartiNo: 'TP-1', dokumNo: 'D-77', sertifikaNo: 'S-1' } });
    assert.equal(p1.durum, 200, JSON.stringify(p1.govde));
    malKabulCevabi.parse(p1.govde);
    assert.match(p1.govde.belge.no, /^MK-\d{6}$/);
    assert.equal((await malKabul(h, '5', { parti: { tedarikciPartiNo: 'TP-1', dokumNo: 'D-77' } })).durum, 200);
    // #124: aynı tedarikçi parti ve döküm no ikinci gelişte de yeni lottur; iki lotun miktarı ayrı tutulur.
    const partiler = await o().vt.sorgu<{ lot_no: string; miktar: string }>(
      `SELECT p.lot_no, sum(b.miktar)::numeric(14,3)::text AS miktar FROM stok_parti p JOIN stok_bakiye b ON b.parti_id = p.id WHERE p.malzeme_id = $1 GROUP BY p.id ORDER BY p.id`, [h]);
    assert.deepEqual(partiler.map((x) => x.miktar), ['10.000', '5.000']);
    assert.notEqual(partiler[0]!.lot_no, partiler[1]!.lot_no);
    assert.equal(await bakiye(h, 'KABUL'), '15.000');
    // #960: son partiler okuması parti, döküm ve sertifika numarasıyla döner; en yeni lot önce gelir.
    const son = await o().vt.tx((db) => sonPartiler(db, h));
    assert.deepEqual(son.map(({ partiId: _p, kayitZamani: _z, lotNo: _l, ...x }) => x), [
      { tedarikciPartiNo: 'TP-1', dokumNo: 'D-77', sertifikaNo: null, belgeler: [] },
      { tedarikciPartiNo: 'TP-1', dokumNo: 'D-77', sertifikaNo: 'S-1', belgeler: [] },
    ]);
    assert.match(son[0]!.lotNo, /^LT-\d{6}$/);
    assert.deepEqual(await o().vt.tx((db) => sonPartiler(db, 424242)), []);
    // #1001: aynı okuma uçtan; satın alma da okur, sinir 1-50.
    const uc = await istek<SonPartilerCevabi>('satin_alma', 'GET', `/stok/malzemeler/${h}/son-partiler?sinir=5`);
    assert.equal(uc.durum, 200, JSON.stringify(uc.govde));
    assert.deepEqual(uc.govde.partiler.map((p) => p.dokumNo), ['D-77', 'D-77']);
    assert.equal((await depo('GET', `/stok/malzemeler/${h}/son-partiler`)).durum, 200);
    assert.equal((await depo('GET', `/stok/malzemeler/${h}/son-partiler?sinir=51`)).durum, 400);
    assert.equal((await istek('operator', 'GET', `/stok/malzemeler/${h}/son-partiler`)).durum, 403);
    const pasif = await kart('sarf', 'pasif');
    assert.equal((await malKabul(pasif, '1')).durum, 422);
    const d = await kart('demirbas');
    assert.equal((await malKabul(d, '1', { parti: { tedarikciPartiNo: 'X' } })).durum, 400);
    assert.equal((await malKabul(d, '1')).durum, 200);
  });

  test('#960 mal kabulde sertifika dosyası partiye bağlanır; partisiz satırda ve başkasının yüklediği dosyada mal kabul yazılmaz', async () => {
    const yukle = async (kim: string): Promise<string> => {
      const icerik = Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(2000)]);
      const ozet = createHash('sha256').update(icerik).digest('hex');
      const c = await istek<{ tamam: boolean }>(kim, 'POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return ozet;
    };
    const h = await kart('hammadde');
    const ozet = await yukle('depo');
    const r = await malKabul(h, '4', { parti: { tedarikciPartiNo: 'TP-S', sertifikaNo: 'S-9' }, sertifika: { ozet, dosyaAdi: 'sertifika.pdf' } });
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    const [p] = await o().vt.tx((db) => sonPartiler(db, h));
    assert.deepEqual(p?.belgeler.map((b) => [b.tur, b.harf]), [['sertifika', 'A']]);
    assert.match(p?.belgeler[0]?.ad ?? '', /S-9/);
    // #1013: mal kabul ayrıntısı partinin sertifikasını taşır; dosya stok'un ucundan, yalnız o partiye bağlıysa verilir.
    const ayrinti = await depo<MalKabulAyrintiCevabi>('GET', `/stok/mal-kabuller/${r.govde.belge.id}`);
    malKabulAyrintiCevabi.parse(ayrinti.govde);
    const belge = p!.belgeler[0]!;
    assert.deepEqual(ayrinti.govde.satirlar[0]?.partiBelgeleri.map((b) => b.id), [belge.id]);
    const dosya = await app.inject({ method: 'GET', url: `/api/stok/partiler/${p!.partiId}/belgeler/${belge.id}`, headers: { cookie: cerezler.get('depo') ?? '' } });
    assert.equal(dosya.statusCode, 200);
    assert.equal(createHash('sha256').update(dosya.rawPayload).digest('hex'), ozet);
    assert.equal((await depo('GET', `/stok/partiler/${p!.partiId}/belgeler/${belge.id + 999}`)).durum, 404);
    assert.equal((await istek('operator', 'GET', `/stok/partiler/${p!.partiId}/belgeler/${belge.id}`)).durum, 403);

    const demirbas = await kart('demirbas');
    const partisiz = await malKabul(demirbas, '1', { sertifika: { ozet: await yukle('depo'), dosyaAdi: 'a.pdf' } });
    assert.equal(partisiz.durum, 400);
    assert.equal(partisiz.govde.alan, 'satirlar.0.sertifika');
    assert.equal(await bakiye(demirbas, 'KABUL'), null);

    const h2 = await kart('hammadde');
    const baskasinin = await malKabul(h2, '2', { parti: { tedarikciPartiNo: 'TP-B' }, sertifika: { ozet: await yukle('mudur'), dosyaAdi: 'b.pdf' } });
    assert.ok(baskasinin.durum >= 400, JSON.stringify(baskasinin.govde));
    assert.equal(await bakiye(h2, 'KABUL'), null);
    assert.deepEqual(await o().vt.tx((db) => sonPartiler(db, h2)), []);
  });

  test('numara kuralları: mal kabul no ayardaki kalıpla sunucuda kurulur, dolu numara atlanır, numarasız ve tekrar eden kayıt reddedilir', async () => {
    const k = await kart('sarf');
    const ilk = await malKabul(k, '1');
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    const sira = Number(/^MK-(\d{6})$/.exec(ilk.govde.belge.no)![1]);
    const sonraki = (n: number) => `MK-${String(n).padStart(6, '0')}`;
    await o().sahip.sorgu("INSERT INTO stok_mal_kabul (no, tur, kisi_id) VALUES ($1, 'diger', $2)", [sonraki(sira + 1), kisiler.get('yonetici')]);
    assert.equal((await malKabul(k, '1')).govde.belge.no, sonraki(sira + 2));
    await assert.rejects(o().sahip.sorgu("INSERT INTO stok_mal_kabul (tur, kisi_id) VALUES ('diger', $1)", [kisiler.get('yonetici')]), /null value in column "no"/);
    await assert.rejects(o().sahip.sorgu("INSERT INTO stok_mal_kabul (no, tur, kisi_id) VALUES ($1, 'diger', $2)", [sonraki(sira + 1), kisiler.get('yonetici')]), /stok_mal_kabul_no_tek/);
  });

  test('DEP-02/03/04/37 çıkış: yetersizde ONAY_GEREKLI ve mevcut; onayla eksi yazılır ve görünür; yeterliyken onay yok sayılır', async () => {
    const k = await kart('sarf');
    await malKabul(k, '3');
    const kabul = await konumId('KABUL');
    const red = await depo<Hata>('POST', '/stok/cikis', { malzemeId: k, konumId: kabul, miktar: '5', cikisNedeni: 'sevk' });
    assert.equal(red.durum, 409, JSON.stringify(red.govde));
    assert.equal(red.govde.kod, 'ONAY_GEREKLI');
    assert.equal(red.govde.ayrinti?.mevcut, '3.000');
    assert.equal(await bakiye(k, 'KABUL'), '3.000');
    const onay = await depo<{ onayliEksi: boolean }>('POST', '/stok/cikis', { malzemeId: k, konumId: kabul, miktar: '5', cikisNedeni: 'sevk', eksiOnay: true });
    assert.equal(onay.durum, 200);
    assert.equal(onay.govde.onayliEksi, true);
    assert.equal(await bakiye(k, 'KABUL'), '-2.000');
    const liste = await depo<{ satirlar: { malzemeId: number; durum: string }[] }>('GET', '/stok/malzemeler?durum=eksi');
    malzemelerCevabi.parse(liste.govde);
    assert.ok(liste.govde.satirlar.some((s) => s.malzemeId === k && s.durum === 'eksi'));
    const kutu = await depo<{ eksiBakiye: number; sayimBekleyen: number | null }>('GET', '/stok/is-kutusu');
    isKutusuCevabi.parse(kutu.govde);
    assert.ok(kutu.govde.eksiBakiye >= 1);
    assert.equal(typeof kutu.govde.sayimBekleyen, 'number');
    const k2 = await kart('sarf');
    await malKabul(k2, '9');
    const fazlaOnay = await depo<{ onayliEksi: boolean }>('POST', '/stok/cikis', { malzemeId: k2, konumId: kabul, miktar: '2', cikisNedeni: 'fire', eksiOnay: true });
    assert.equal(fazlaOnay.govde.onayliEksi, false);
  });

  test('DEP-05/08 çıkış önerisi: en eski giriş önce; bakiyesi olmayan malzemede veri yetersiz', async () => {
    const k = await kart('sarf');
    const raf = await rafAc('B', 1, 1);
    const goz = (await mudur<{ gozler: { konumId: number }[] }>('GET', `/stok/raflar/${raf.id}`)).govde.gozler[0]!.konumId;
    await malKabul(k, '4', { konumId: goz });
    await malKabul(k, '6');
    const c = await depo<{ oneriler: { konumId: number; miktar: string }[]; yeterli: boolean }>('GET', `/stok/malzemeler/${k}/cikis-onerisi?miktar=5`);
    cikisOnerisiCevabi.parse(c.govde);
    assert.deepEqual(c.govde.oneriler.map((x) => [x.konumId, x.miktar]), [[goz, '4'], [await konumId('KABUL'), '1']]);
    const yok = await depo<{ veriYetersiz: boolean }>('GET', `/stok/malzemeler/${await kart('sarf')}/cikis-onerisi?miktar=1`);
    assert.equal(yok.govde.veriYetersiz, true);
  });

  test('soru 98 a: mamul ve yarı mamul elle sevk çıkışı reddedilir (sevkiyat işinden düşer); fire çıkışı ve hammadde sevki geçer', async () => {
    const kabul = await konumId('KABUL');
    for (const tur of ['mamul', 'yarimamul'] as const) {
      const m = await kart(tur);
      assert.equal((await malKabul(m, '3')).durum, 200);
      const red = await depo<Hata>('POST', '/stok/cikis', { malzemeId: m, konumId: kabul, miktar: '1', cikisNedeni: 'sevk' });
      assert.equal(red.durum, 422, JSON.stringify(red.govde));
      assert.match(red.govde.mesaj, /Teslim et > Sevk/);
      // Kalite engeli önce gelir: karar bekleyen mamul tür engeline değil kalite nedenine takılır (akış sağlığı adım 10).
      const bekleyen = await depo<Hata>('POST', '/stok/cikis', { malzemeId: m, konumId: kabul, miktar: '1', cikisNedeni: 'sevk', kaliteDurumu: 'karar_bekliyor' });
      assert.deepEqual([bekleyen.durum, bekleyen.govde.mesaj], [422, 'Karar bekleyen parça sevke çıkamaz; kalite kararını bekleyin.']);
      assert.equal((await depo('POST', '/stok/cikis', { malzemeId: m, konumId: kabul, miktar: '1', cikisNedeni: 'fire' })).durum, 200, `${tur} fire`);
    }
    const h = await kart('hammadde');
    await malKabul(h, '2');
    assert.equal((await depo('POST', '/stok/cikis', { malzemeId: h, konumId: kabul, miktar: '1', cikisNedeni: 'sevk' })).durum, 200, 'emirsiz malzemede elle sevk');
  });

  test('DEP-23/22 parti: gözde iki parti varsa seçim istenir; başka malzemenin partisi bağlanamaz', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '2', { parti: { dokumNo: 'X1' } });
    await malKabul(h, '2', { parti: { dokumNo: 'X2' } });
    const r = await depo<Hata>('POST', '/stok/cikis', { malzemeId: h, konumId: await konumId('KABUL'), miktar: '1', cikisNedeni: 'sevk' });
    assert.equal(r.durum, 400);
    assert.match(r.govde.mesaj, /birden çok parti/);
    const baska = await kart('hammadde');
    const yabanci = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1 LIMIT 1', [h]))!.id;
    const y = await malKabul(baska, '1', { partiId: yabanci });
    // Yabancı anahtar ihlali türü gereği 409 BAGIMLI_KAYIT; ileti modülündür.
    assert.equal(y.durum, 409, JSON.stringify(y.govde));
    assert.match(y.govde.mesaj, /bu malzemeye ait değil/);
  });

  test('DEP-09/13 taşıma: ilk giriş ve parti taşınır; stoklu konum pasife alınamaz', async () => {
    const h = await kart('hammadde');
    await malKabul(h, '8', { parti: { tedarikciPartiNo: 'T9' } });
    const ilk = (await o().vt.tek<{ t: string }>("SELECT ilk_giris::text AS t FROM stok_bakiye WHERE malzeme_id = $1", [h]))!.t;
    const zemin = await mudur<{ konum: { id: number; surum: number } }>('POST', '/stok/konumlar', { tur: 'depo_zemini', kod: 'D-B2' });
    const t = await depo('POST', '/stok/tasima', { malzemeId: h, kaynakKonumId: await konumId('KABUL'), hedefKonumId: zemin.govde.konum.id, miktar: '3' });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const hedef = await o().vt.tek<{ t: string; p: number | null }>('SELECT ilk_giris::text AS t, parti_id AS p FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2', [h, zemin.govde.konum.id]);
    assert.equal(hedef?.t, ilk);
    assert.notEqual(hedef?.p, null);
    const pasif = await mudur<Hata>('POST', `/stok/konumlar/${zemin.govde.konum.id}/pasif-yap`, { surum: zemin.govde.konum.surum });
    assert.equal(pasif.durum, 409, JSON.stringify(pasif.govde));
    assert.match(pasif.govde.mesaj, /stok var/);
  });

  test('DEP-16 sayım: beklenen değiştiyse 409; fark yönüyle yazılır; göz son sayımı alır', async () => {
    const k = await kart('sarf');
    const zemin = await mudur<{ konum: { id: number } }>('POST', '/stok/konumlar', { tur: 'depo_zemini', kod: 'D-S1' });
    const z = zemin.govde.konum.id;
    await malKabul(k, '10', { konumId: z });
    const kp = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1', [k]))!.id;
    assert.equal((await istek('kalite', 'POST', '/stok/sayim', { konumId: z, satirlar: [{ malzemeId: k, partiId: kp, beklenenMiktar: '9', sayilanMiktar: '7' }] })).durum, 409);
    const c = await istek<{ farkSayisi: number }>('kalite', 'POST', '/stok/sayim', { konumId: z, satirlar: [{ malzemeId: k, partiId: kp, beklenenMiktar: '10', sayilanMiktar: '7' }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.farkSayisi, 1);
    const a = await depo<{ konum: { sonSayim: string | null }; bakiyeler: { miktar: string }[] }>('GET', `/stok/konumlar/${z}`);
    konumAyrintiCevabi.parse(a.govde);
    assert.equal(a.govde.bakiyeler[0]?.miktar, '7.000');
    assert.notEqual(a.govde.konum.sonSayim, null);
  });

  test('DEP-17/18/19 geri alma: ters hareket yazar; ikinci kez ve geri almanın geri alınması reddedilir; mal kabul hareketi tek başına geri alınmaz', async () => {
    const k = await kart('sarf');
    const mk = await malKabul(k, '6');
    const kabul = await konumId('KABUL');
    const c = await depo<{ hareketIdler: number[] }>('POST', '/stok/cikis', { malzemeId: k, konumId: kabul, miktar: '2', cikisNedeni: 'numune' });
    const id = c.govde.hareketIdler[0]!;
    assert.equal((await istek('kalite', 'POST', `/stok/hareketler/${id}/geri-al`, {})).durum, 403);
    const g = await mudur<{ hareketIdler: number[] }>('POST', `/stok/hareketler/${id}/geri-al`, {});
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.equal(await bakiye(k, 'KABUL'), '6.000');
    assert.equal((await mudur<Hata>('POST', `/stok/hareketler/${id}/geri-al`, {})).durum, 409);
    assert.equal((await mudur<Hata>('POST', `/stok/hareketler/${g.govde.hareketIdler[0]}/geri-al`, {})).durum, 409);
    const mkHareket = mk.govde.hareketIdler[0]!;
    const r = await mudur<Hata>('POST', `/stok/hareketler/${mkHareket}/geri-al`, {});
    assert.equal(r.durum, 409);
    assert.match(r.govde.mesaj, /belgeyi düzeltin/);
  });

  test('DEP-53 mal kabul düzeltmesi: eski belge ters çevrilir, yeni belge açılır, belge bir kez düzeltilir; eski satırın Logo durumu değişmez', async () => {
    const k = await kart('sarf');
    const ilk = await malKabul(k, '12');
    const belge = ilk.govde.belge.id;
    assert.equal((await istek('kalite', 'POST', `/stok/mal-kabuller/${belge}/duzelt`, { satirlar: [{ malzemeId: k, miktar: '10' }] })).durum, 403);
    const d = await mudur<MalKabulCevabi>('POST', `/stok/mal-kabuller/${belge}/duzelt`, { satirlar: [{ malzemeId: k, miktar: '10' }] });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.equal(d.govde.belge.duzeltilenId, belge);
    assert.equal(await bakiye(k, 'KABUL'), '10.000');
    assert.equal((await mudur('POST', `/stok/mal-kabuller/${belge}/duzelt`, { satirlar: [{ malzemeId: k, miktar: '1' }] })).durum, 409);
    const eski = await mudur<{ belge: { duzeltenId: number | null }; satirlar: { logoDurumu: string }[] }>('GET', `/stok/mal-kabuller/${belge}`);
    malKabulAyrintiCevabi.parse(eski.govde);
    assert.equal(eski.govde.belge.duzeltenId, d.govde.belge.id);
    assert.equal(eski.govde.satirlar[0]?.logoDurumu, 'irsaliye_bekleniyor');
  });

  test('DEP-53 düzeltmede sıfır miktarlı satır yazılmaz; satırsız düzeltme belgeyi tamamen iptal eder', async () => {
    const [a, b] = [await kart('sarf'), await kart('sarf')];
    const iki = await depo<MalKabulCevabi>('POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: a, miktar: '5' }, { malzemeId: b, miktar: '7' }] });
    assert.equal(iki.durum, 200, JSON.stringify(iki.govde));
    const d = await mudur<MalKabulCevabi>('POST', `/stok/mal-kabuller/${iki.govde.belge.id}/duzelt`, { satirlar: [{ malzemeId: a, miktar: '5' }, { malzemeId: b, miktar: '0' }] });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.equal(d.govde.belge.satirSayisi, 1);
    assert.equal(await bakiye(a, 'KABUL'), '5.000');
    assert.equal(await bakiye(b, 'KABUL'), null);
    const iptal = await mudur<MalKabulCevabi>('POST', `/stok/mal-kabuller/${d.govde.belge.id}/duzelt`, { satirlar: [] });
    assert.equal(iptal.durum, 200, JSON.stringify(iptal.govde));
    assert.equal(iptal.govde.belge.satirSayisi, 0);
    assert.equal(iptal.govde.belge.duzeltilenId, d.govde.belge.id);
    assert.equal(await bakiye(a, 'KABUL'), null);
    assert.equal((await malKabul(a, '0')).durum, 400);
  });

  test('DEP-47/48/25 üretim girişi: yalnız mamul ve yarı mamul, URETIM konumuna, partisi emir; sarf çıkışı emre bağlanır, parti izi iki yönlü', async () => {
    const e = await emir();
    const m = await kart('mamul');
    assert.equal((await depo('POST', '/stok/uretim-girisi', { uretimEmriId: e, malzemeId: await kart('hammadde'), miktar: '1' })).durum, 400);
    assert.equal((await depo('POST', '/stok/uretim-girisi', { uretimEmriId: e, malzemeId: m, miktar: '4' })).durum, 200);
    assert.equal((await depo('POST', '/stok/uretim-girisi', { uretimEmriId: e, malzemeId: m, miktar: '1' })).durum, 200);
    assert.equal(await bakiye(m, 'URETIM'), '5.000');
    const p = await o().vt.sorgu<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1 AND uretim_emri_id = $2', [m, e]);
    assert.equal(p.length, 1);
    const emirNo = (await o().vt.tek<{ emirNo: string }>('SELECT emir_no AS "emirNo" FROM uretim_emri WHERE id = $1', [e]))!.emirNo;
    const hr = await depo<{ satirlar: { uretimEmriId: number | null; emirNo: string | null; partiEtiketi: string | null }[] }>('GET', `/stok/hareketler?malzemeId=${m}`);
    const giris = hr.govde.satirlar.find((x) => x.uretimEmriId === e);
    assert.ok(giris, 'üretim girişi hareketi gelmeli');
    assert.equal(giris.emirNo, emirNo);
    assert.equal(giris.partiEtiketi?.includes(`Emir ${emirNo}`), true, giris.partiEtiketi ?? '');
    assert.equal(giris.partiEtiketi?.includes('#'), false);
    assert.equal((await depo<Hata>('POST', '/stok/uretim-girisi', { uretimEmriId: 999999, malzemeId: m, miktar: '1' })).durum, 409);
    const h = await kart('hammadde');
    await malKabul(h, '20', { parti: { dokumNo: 'DK-5' } });
    const kabul = await konumId('KABUL');
    const sarfsiz = await depo<Hata>('POST', '/stok/cikis', { malzemeId: h, konumId: kabul, miktar: '1', cikisNedeni: 'uretime_sarf' });
    assert.equal(sarfsiz.durum, 422);
    assert.equal((await depo('POST', '/stok/cikis', { malzemeId: h, konumId: kabul, miktar: '6', cikisNedeni: 'uretime_sarf', uretimEmriId: e })).durum, 200);
    const partiler = await o().vt.tx((db) => emrinPartileri(db, e));
    assert.deepEqual(partiler.map((x) => [x.malzemeId, x.dokumNo, x.miktar]), [[h, 'DK-5', '6.000']]);
    const hp = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1', [h]))!.id;
    const iz = await depo<{ emirler: number[]; sevkler: unknown[] }>('GET', `/stok/partiler/${hp}/iz`);
    partiIziCevabi.parse(iz.govde);
    assert.deepEqual(iz.govde.emirler, [e]);
    assert.deepEqual(iz.govde.sevkler, [], 'emri sevk edilmemiş partinin izinde sevk uydurulmaz');
  });

  test('21.4: emrin ürününün elle üretim girişi emrin adedini aşmaz (önceki girişlerle birlikte); emrin ürünü olmayan kart sınırsız', async () => {
    const e = await emir();
    const m = await kart('mamul');
    await o().sahip.sorgu('UPDATE uretim_emri SET malzeme_no = $2 WHERE id = $1', [e, m]);
    const gir = (malzemeId: number, miktar: string) => depo<Hata>('POST', '/stok/uretim-girisi', { uretimEmriId: e, malzemeId, miktar });
    assert.equal((await gir(m, '6')).durum, 200);
    const asan = await gir(m, '6');
    assert.deepEqual([asan.durum, asan.govde.mesaj], [400, 'Üretim girişi emrin girilmemiş adedini (4) aşamaz.'], JSON.stringify(asan.govde));
    assert.equal((await gir(m, '4')).durum, 200);
    assert.equal((await gir(m, '1')).govde.mesaj, 'Üretim girişi emrin girilmemiş adedini (0) aşamaz.');
    assert.equal(await bakiye(m, 'URETIM'), '10.000');
    // Geri alınan giriş yer açar.
    const h = (await o().vt.tek<{ id: number }>("SELECT id FROM stok_hareketi WHERE malzeme_id = $1 AND tur = 'giris' ORDER BY id DESC LIMIT 1", [m]))!.id;
    assert.equal((await mudur('POST', `/stok/hareketler/${String(h)}/geri-al`, {})).durum, 200);
    assert.equal((await gir(m, '4')).durum, 200);
    const baska = await kart('yarimamul');
    assert.equal((await gir(baska, '11')).durum, 200, 'emrin ürünü olmayan yarı mamul sınırsız');
  });

  test('kart #1338 akış süresi okumaları: emrin, partisinin ve tesliminin hareketleri tekrarsız ve sıralı; parti giriş zamanı', async () => {
    const e = await emir();
    const m = await kart('mamul');
    assert.equal((await depo('POST', '/stok/uretim-girisi', { uretimEmriId: e, malzemeId: m, miktar: '4' })).durum, 200);
    const mp = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1 AND uretim_emri_id = $2', [m, e]))!.id;
    const zemin = await mudur<{ konum: { id: number } }>('POST', '/stok/konumlar', { kod: 'AKS-Z1', tur: 'depo_zemini' });
    assert.equal(zemin.durum, 200, JSON.stringify(zemin.govde));
    const emirsiz = await depo<{ hareketIdler: number[] }>('POST', '/stok/tasima', { malzemeId: m, partiId: mp, kaynakKonumId: await konumId('URETIM'), hedefKonumId: zemin.govde.konum.id, miktar: '1' });
    assert.equal(emirsiz.durum, 200, JSON.stringify(emirsiz.govde));
    const h = await kart('hammadde');
    await malKabul(h, '10', { parti: { dokumNo: 'DK-AKS' } });
    const hp = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1', [h]))!.id;
    const t = await depo<{ hareketIdler: number[] }>('POST', '/stok/tasima', { malzemeId: h, kaynakKonumId: await konumId('KABUL'), hedefKonumId: zemin.govde.konum.id, miktar: '2' });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const teslimHareketi = t.govde.hareketIdler[0]!;
    await o().sahip.sorgu(
      `INSERT INTO stok_teslim (no, kaynak_kimligi, malzeme_id, miktar, parti_id, kaynak_konum_id, hedef_konum_id, uretim_emri_id, gonderen_kisi_id, durum, alinan, hareket_id, kapatan_kisi_id, kapanis)
       VALUES ('TS-AKS', 'aks-1', $1, 2, $2, $3, $4, $5, $6, 'teslim', 2, $7, $6, now())`,
      [h, hp, await konumId('KABUL'), zemin.govde.konum.id, e, kisiler.get('yonetici'), teslimHareketi]);
    assert.equal((await depo('POST', '/stok/cikis', { malzemeId: h, konumId: await konumId('KABUL'), miktar: '3', cikisNedeni: 'uretime_sarf', uretimEmriId: e })).durum, 200);
    const baskaEmir = await emir();
    assert.equal((await depo('POST', '/stok/uretim-girisi', { uretimEmriId: baskaEmir, malzemeId: await kart('mamul'), miktar: '1' })).durum, 200);

    const akis = await o().vt.tx((db) => emrinAkisHareketleri(db, e));
    assert.deepEqual(akis.map((x) => [x.tur, x.malzemeId, x.miktar]),
      [['giris', m, '4.000'], ['transfer', m, '1.000'], ['transfer', h, '2.000'], ['cikis', h, '3.000']], 'emir, parti ve teslim yolu; başka emir yok');
    assert.equal(new Set(akis.map((x) => x.id)).size, akis.length, 'tekrarsız');
    const [giris, tasima, , sarf] = akis;
    assert.equal(giris!.girisKaynagi, 'uretim');
    assert.equal(giris!.hedefKonumTur, 'uretim_cikisi');
    assert.equal(giris!.kaynakKonumTur, null);
    assert.equal(tasima!.partiId, mp);
    assert.equal(tasima!.hedefKonumTur, 'depo_zemini');
    assert.equal(sarf!.cikisNedeni, 'uretime_sarf');
    assert.equal(akis[2]!.id, teslimHareketi);
    assert.ok(akis.every((x, i) => i === 0 || akis[i - 1]!.zaman <= x.zaman));
    assert.deepEqual(await o().vt.tx((db) => emrinAkisHareketleri(db, 999999)), []);

    const zamanlar = await o().vt.tx((db) => partiGirisZamanlari(db, [hp, mp, hp, 999999]));
    assert.equal(zamanlar.size, 2, 'olmayan parti haritada yok');
    assert.ok(zamanlar.get(hp)!.malKabulZamani);
    assert.match(zamanlar.get(hp)!.lotNo, /^LT-/);
    assert.equal(zamanlar.get(mp)!.malKabulZamani, null, 'üretim partisi mal kabulle girmez');
    assert.equal((await o().vt.tx((db) => partiGirisZamanlari(db, []))).size, 0);
  });

  test('DEP-38/39 Logo eşleme alanları: durumla tutarsız yazılamaz; satırın Logo dışı alanı değişmez; tutarlı eşleme yazılır', async () => {
    const k = await kart('sarf');
    const mk = await malKabul(k, '10');
    const satir = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_mal_kabul_satiri WHERE mal_kabul_id = $1', [mk.govde.belge.id]))!.id;
    await assert.rejects(o().vt.sorgu("UPDATE stok_mal_kabul_satiri SET logo_durumu = 'eslesti' WHERE id = $1", [satir]), /stok_mal_kabul_satiri_logo_tutarli/);
    await assert.rejects(o().vt.sorgu("UPDATE stok_mal_kabul_satiri SET logo_durumu = 'eslesti', logo_irsaliye_satir_no = 5, logo_irsaliye_miktari = 9 WHERE id = $1", [satir]), /stok_mal_kabul_satiri_logo_tutarli/);
    await assert.rejects(o().vt.sorgu('UPDATE stok_mal_kabul_satiri SET sayilan_miktar = 1 WHERE id = $1', [satir]), /yalnız Logo/);
    await o().vt.sorgu("UPDATE stok_mal_kabul_satiri SET logo_durumu = 'fark_var', logo_irsaliye_satir_no = 5, logo_irsaliye_miktari = 9 WHERE id = $1", [satir]);
    const kutu = await depo<{ logoFarki: number }>('GET', '/stok/is-kutusu');
    assert.ok(kutu.govde.logoFarki >= 1);
  });

  test('DEP-50/17 Logo gönderim ve defter: gönderildi kayıt no ister; hareket defteri değişmez', async () => {
    const k = await kart('sarf');
    const mk = await malKabul(k, '1');
    const h = mk.govde.hareketIdler[0]!;
    await assert.rejects(o().vt.sorgu("INSERT INTO stok_hareketi_logo (hareket_id, logo_gonderim_durumu) VALUES ($1, 'gonderildi')", [h]), /stok_hareketi_logo_gonderildi_nolu/);
    await o().vt.sorgu("INSERT INTO stok_hareketi_logo (hareket_id, logo_gonderim_durumu, logo_kayit_no) VALUES ($1, 'gonderildi', 77)", [h]);
    await assert.rejects(o().vt.sorgu('UPDATE stok_hareketi SET miktar = 2 WHERE id = $1', [h]));
    await assert.rejects(o().vt.sorgu('DELETE FROM stok_hareketi WHERE id = $1', [h]));
  });

  test('hareket listesi sayfalı: süzgeçsiz istekte toplam null, süzgeçlide sayı; cevap sözleşmeye uyar', async () => {
    const k = await kart('sarf');
    await malKabul(k, '1');
    const hepsi = await depo<{ toplam: number | null; sayfaBoyu: number }>('GET', '/stok/hareketler?sayfaBoyu=500');
    hareketlerCevabi.parse(hepsi.govde);
    assert.equal(hepsi.govde.toplam, null);
    assert.equal(hepsi.govde.sayfaBoyu, 200);
    const suz = await depo<{ toplam: number | null; satirlar: { malzemeAd: string | null }[] }>('GET', `/stok/hareketler?malzemeId=${k}`);
    assert.equal(suz.govde.toplam, 1);
    assert.equal(suz.govde.satirlar[0]?.malzemeAd, kartAdlari.get(k));
  });

  test('DEP-28 malzeme ayarı: kritik seviye sürümlü yazılır; ayrıntı ve dışa açık miktarlar tutarlı', async () => {
    const k = await kart('sarf');
    await malKabul(k, '4');
    const a = await mudur<{ ayar: { surum: number | null } }>('POST', `/stok/malzemeler/${k}/ayar-duzenle`, { surum: null, kritikSeviye: '5', varsayilanAmbalaj: { tur: 'koli', olcu: 'm' }, ambalajlar: [{ tur: 'koli', olcu: 'm', iciMiktar: '12' }] });
    assert.equal(a.durum, 200, JSON.stringify(a.govde));
    malzemeAyrintiCevabi.parse(a.govde);
    const ay = await depo<{ satir: { durum: string }; ayar: { ambalajlar: unknown[] } }>('GET', `/stok/malzemeler/${k}`);
    assert.equal(ay.govde.satir.durum, 'kritik');
    assert.equal(ay.govde.ayar.ambalajlar.length, 1);
    assert.equal((await mudur('POST', `/stok/malzemeler/${k}/ayar-duzenle`, { surum: 99, kritikSeviye: '1', varsayilanAmbalaj: null, ambalajlar: [] })).durum, 409);
    const m = await o().vt.tx((db) => stokMiktarlari(db, [k, 424242]));
    assert.deepEqual(m.get(k), { toplam: '4.000', kullanilabilir: '4.000', uretimde: '0' });
    assert.equal(m.has(424242), false);
    const ad = await o().vt.tx(async (db) => konumAdlari(db, [await konumId('KABUL')]));
    assert.deepEqual([...ad.values()], ['KABUL']);
  });

  test('DEP-59 DEP-60 varsayılan konum: yalnız aktif konum yazılır; kart bilgisi oturumla okunur, kart kimliğiyle gelir', async () => {
    const k = await kart('hammadde');
    const zemin = await mudur<{ konum: { id: number; surum: number } }>('POST', '/stok/konumlar', { tur: 'depo_zemini', kod: 'D-VK1' });
    const yaz = (g: Record<string, unknown>) => mudur<{ ayar: { varsayilanKonum: { id: number; kod: string } | null; surum: number | null } }>(
      'POST', `/stok/malzemeler/${k}/ayar-duzenle`, { kritikSeviye: '7', varsayilanAmbalaj: null, ambalajlar: [], ...g });
    const a = await yaz({ surum: null, varsayilanKonumId: zemin.govde.konum.id });
    assert.equal(a.durum, 200, JSON.stringify(a.govde));
    assert.deepEqual(a.govde.ayar.varsayilanKonum, { id: zemin.govde.konum.id, kod: 'D-VK1' });
    assert.equal((await yaz({ surum: a.govde.ayar.surum, varsayilanKonumId: 999999 })).durum, 422);
    const pasif = await mudur<{ konum: { id: number; surum: number } }>('POST', '/stok/konumlar', { tur: 'depo_zemini', kod: 'D-VK2' });
    assert.equal((await mudur('POST', `/stok/konumlar/${pasif.govde.konum.id}/pasif-yap`, { surum: pasif.govde.konum.surum })).durum, 200);
    assert.equal((await yaz({ surum: a.govde.ayar.surum, varsayilanKonumId: pasif.govde.konum.id })).durum, 422);
    assert.equal((await istek(null, 'GET', '/stok/malzeme-kart-bilgileri')).durum, 401);
    const b = await istek<{ satirlar: { malzemeId: number; kartKimligi: string | null; kritikSeviye: string | null; varsayilanKonum: string | null }[] }>('operator', 'GET', '/stok/malzeme-kart-bilgileri?sayfaBoyu=500');
    assert.equal(b.durum, 200);
    assert.deepEqual(b.govde.satirlar.find((x) => x.malzemeId === k), { malzemeId: k, kartKimligi: `stok-dnm-${kartSira}`, kritikSeviye: '7.000', varsayilanKonum: 'D-VK1' });
    const temiz = await yaz({ surum: a.govde.ayar.surum, kritikSeviye: null, varsayilanKonumId: null });
    assert.equal(temiz.govde.ayar.varsayilanKonum, null);
    const c = await istek<{ satirlar: { malzemeId: number }[] }>('operator', 'GET', '/stok/malzeme-kart-bilgileri?sayfaBoyu=500');
    assert.equal(c.govde.satirlar.some((x) => x.malzemeId === k), false);
  });

  test('panel, DEP-34 göz önerisi, arama ve göz ölçüsü: önizleme ekranlarının verisi', async () => {
    const raf = await rafAc('P', 2, 2);
    const gozler = (await mudur<{ gozler: { konumId: number; kod: string; ambalajlar: unknown[] }[] }>('GET', `/stok/raflar/${raf.id}`)).govde.gozler;
    const k = await kart('sarf');
    const yeniKart = await kart('sarf');
    const ilk = await depo<{ oneri: { kod: string } | null }>('GET', `/stok/malzemeler/${yeniKart}/goz-onerisi`);
    assert.equal(ilk.durum, 200);
    assert.match(ilk.govde.oneri?.kod ?? '', /-02$/); // malzeme hiçbir gözde yok: kolay kat (2) boş göz
    const goz = gozler.find((g) => g.kod === 'P-02-01')!;
    await malKabul(k, '7', { konumId: goz.konumId, ambalaj: { tur: 'koli', olcu: 'm', adet: 2 } });
    assert.equal((await depo<{ oneri: { kod: string } | null }>('GET', `/stok/malzemeler/${k}/goz-onerisi`)).govde.oneri?.kod, 'P-02-01');
    const ayrinti = await depo<{ raf: { tur: string; bolmeGenislikM: string } | null }>('GET', `/stok/konumlar/${goz.konumId}`);
    assert.equal(ayrinti.govde.raf?.tur, 'palet');
    const m = await depo<{ gozler: { kod: string; ambalajlar: { tur: string; olcu: string; adet: number | null }[] }[] }>('GET', `/stok/raflar/${raf.id}`);
    assert.deepEqual(m.govde.gozler.find((g) => g.kod === 'P-02-01')?.ambalajlar, [{ tur: 'koli', olcu: 'm', adet: 2 }]);
    const ara = await depo<{ satirlar: { malzemeId: number; konumlar: { kod: string }[] }[] }>('GET', '/stok/malzemeler?metin=P-02-01');
    assert.deepEqual(ara.govde.satirlar.map((x) => x.malzemeId), [k]);
    assert.equal(ara.govde.satirlar[0]?.konumlar[0]?.kod, 'P-02-01');
    const har = await depo<{ satirlar: { malzemeId: number }[]; toplam: number | null }>('GET', '/stok/hareketler?metin=P-02-01');
    assert.equal(har.govde.toplam, 1);
    const p = await depo<{ gunluk: { giris: number }[]; gozToplam: number; gozDolu: number; malzemeCesidi: number; raflar: { kod: string }[]; sonHareketler: unknown[] }>('GET', '/stok/panel');
    assert.equal(p.durum, 200, JSON.stringify(p.govde));
    panelCevabi.parse(p.govde);
    assert.equal(p.govde.gunluk.length, 7);
    assert.ok((p.govde.gunluk.at(-1)?.giris ?? 0) > 0);
    assert.ok(p.govde.gozDolu >= 1 && p.govde.gozToplam >= p.govde.gozDolu);
    assert.ok(p.govde.raflar.some((r) => r.kod === 'P'));
    assert.equal(p.govde.sonHareketler.length, 6);
  });

  test('DEP-54/40/41 sepet kişiye özel; teslim tek işlemde, yetmezse onay ister ve hiçbir şey yazmaz; fiş değişmez', async () => {
    const a = await kart('sarf'), b = await kart('sarf');
    await malKabul(a, '10'); await malKabul(b, '3');
    const zemin = await mudur<{ konum: { id: number } }>('POST', '/stok/konumlar', { tur: 'depo_zemini', kod: 'D-T1' });
    const z = zemin.govde.konum.id;
    // Soru 133: sepet herkesindir (stok.istek); depo işlemi olmayan rol de kendi sepetini görür.
    assert.equal((await istek('satin_alma', 'GET', '/stok/sepet')).durum, 200);
    assert.equal((await depo('POST', '/stok/sepet/satir-ekle', { malzemeId: a, miktar: '4' })).durum, 200);
    assert.equal((await depo('POST', '/stok/sepet/satir-ekle', { malzemeId: a, miktar: '2' })).durum, 200);
    const sep = await depo<{ satirlar: { id: number; malzemeId: number; miktar: string; mevcut: string }[] }>('POST', '/stok/sepet/satir-ekle', { malzemeId: b, miktar: '5' });
    assert.deepEqual(sep.govde.satirlar.map((x) => [x.malzemeId, x.miktar, x.mevcut]), [[a, '6', '10'], [b, '5', '3']]);
    assert.equal((await mudur<{ satirlar: unknown[] }>('GET', '/stok/sepet')).govde.satirlar.length, 0);
    const baskasi = sep.govde.satirlar[0]!.id;
    assert.equal((await mudur('POST', `/stok/sepet/satirlar/${baskasi}/sil`, {})).durum, 404);
    const red = await depo<Hata & { ayrinti: { eksikler: unknown[] } }>('POST', '/stok/sepet/teslim-et', { hedefKonumId: z });
    assert.equal(red.durum, 409, JSON.stringify(red.govde));
    assert.equal(red.govde.kod, 'ONAY_GEREKLI');
    assert.equal(red.govde.ayrinti.eksikler.length, 1);
    assert.equal(await bakiye(a, 'D-T1'), null);
    const ok = await depo<{ fis: { id: number; no: string; satirSayisi: number; hedefKonumKod: string } }>('POST', '/stok/sepet/teslim-et', { hedefKonumId: z, eksiOnay: true, aciklama: 'İE-7' });
    assert.equal(ok.durum, 200, JSON.stringify(ok.govde));
    assert.match(ok.govde.fis.no, /^TF-\d{6}$/);
    assert.equal(ok.govde.fis.hedefKonumKod, 'D-T1');
    assert.equal(await bakiye(a, 'D-T1'), '6.000');
    assert.equal(await bakiye(a, 'KABUL'), '4.000');
    assert.equal(await bakiye(b, 'D-T1'), '5.000');
    assert.equal(await bakiye(b, 'KABUL'), '-2.000');
    assert.equal((await depo<{ satirlar: unknown[] }>('GET', '/stok/sepet')).govde.satirlar.length, 0);
    const f = await depo<{ hareketler: { tur: string; onayliEksi: boolean }[] }>('GET', `/stok/fisler/${ok.govde.fis.id}`);
    fisAyrintiCevabi.parse(f.govde);
    assert.deepEqual(f.govde.hareketler.map((h) => [h.tur, h.onayliEksi]), [['transfer', false], ['transfer', false], ['transfer', true]]);
    await assert.rejects(o().vt.sorgu('UPDATE stok_fis SET aciklama = $2 WHERE id = $1', [ok.govde.fis.id, 'x']));
    assert.equal((await depo('POST', '/stok/sepet/teslim-et', { hedefKonumId: z })).durum, 422);
    await depo('POST', '/stok/sepet/satir-ekle', { malzemeId: a, miktar: '1', kaynakKonumId: z });
    // Okuma işlemi salt okunurdur; kaynak gözlü satırın mevcudu kilitsiz okunur.
    const gozlu = await depo<{ satirlar: { kaynakKonumId: number | null; mevcut: string }[] }>('GET', '/stok/sepet');
    assert.equal(gozlu.durum, 200, JSON.stringify(gozlu.govde));
    assert.deepEqual(gozlu.govde.satirlar.map((x) => [x.kaynakKonumId, x.mevcut]), [[z, '6']]);
    assert.equal((await istek('kalite', 'POST', '/stok/sepet/stoktan-dus', { cikisNedeni: 'fire' })).durum, 403);
    const dus = await depo<{ fis: { cikisNedeni: string } }>('POST', '/stok/sepet/stoktan-dus', { cikisNedeni: 'fire' });
    assert.equal(dus.govde.fis.cikisNedeni, 'fire');
    assert.equal(await bakiye(a, 'D-T1'), '5.000');
    const liste = await depo<{ toplam: number }>('GET', '/stok/fisler');
    fislerCevabi.parse(liste.govde);
    assert.ok(liste.govde.toplam >= 2);
  });

  test('DEP-55 kod çözümleme: konum kodu ve LOC öneki, kart numarası ve MLZ öneki; bilinmeyen kod uydurulmaz', async () => {
    const k = await kart('sarf');
    await malKabul(k, '2');
    const konum = await depo<{ tur: string; konum: { kod: string } }>('GET', '/stok/kod-coz?kod=LOC:kabul');
    kodCozCevabi.parse(konum.govde);
    assert.equal(konum.govde.tur, 'konum');
    assert.equal(konum.govde.konum.kod, 'KABUL');
    const m = await depo<{ tur: string; ozet: { id: number }; toplam: string }>('GET', `/stok/kod-coz?kod=MLZ:${k}`);
    assert.equal(m.govde.tur, 'malzeme');
    assert.equal(m.govde.ozet.id, k);
    assert.equal(m.govde.toplam, '2');
    assert.equal((await depo<{ tur: string }>('GET', `/stok/kod-coz?kod=${k}`)).govde.tur, 'malzeme');
    assert.equal((await depo<{ tur: string }>('GET', '/stok/kod-coz?kod=YOK-999')).govde.tur, 'bilinmiyor');
    // DEP-64: Malzemeler'in kendi etiketi stok kodunu taşır.
    const stokKodu = (await o().sahip.tek<{ kod: string }>('SELECT stok_kodu AS kod FROM malzeme_katalog_karti WHERE no = $1', [k]))!.kod;
    const mk = await depo<{ tur: string; ozet: { id: number } }>('GET', `/stok/kod-coz?kod=${encodeURIComponent(`MK:${stokKodu}`)}`);
    assert.deepEqual([mk.govde.tur, mk.govde.ozet.id], ['malzeme', k]);
    assert.equal((await depo<{ tur: string }>('GET', '/stok/kod-coz?kod=MK:YOK-00000')).govde.tur, 'bilinmiyor');
  });

  test('#1060 lot etiketi ve LOT okutma: etiket verisi okuma yetkisiyle gelir; LOT: kodu o lotu çözer, düşüm o lottan olur; bilinmeyen lot tanınmaz', async () => {
    const h = await kart('hammadde');
    const ilk = await malKabul(h, '4', { parti: { dokumNo: 'D-ETK', sertifikaNo: 'S-ETK' } });
    const ikinci = await malKabul(h, '6');
    assert.equal(ikinci.durum, 200, JSON.stringify(ikinci.govde));
    const e = await depo<LotEtiketleriCevabi>('GET', `/stok/mal-kabuller/${ilk.govde.belge.id}/lot-etiketleri`);
    assert.equal(e.durum, 200, JSON.stringify(e.govde));
    lotEtiketleriCevabi.parse(e.govde);
    const [et] = e.govde.etiketler;
    assert.deepEqual([e.govde.etiketler.length, et?.malzemeId, et?.dokumNo, et?.sertifikaNo, et?.tedarikciPartiNo, et?.miktar, et?.belgeNo, et?.malzemeTuru],
      [1, h, 'D-ETK', 'S-ETK', null, '4.000', ilk.govde.belge.no, 'hammadde']);
    assert.match(et!.lotNo, /^LT-\d{6}$/);
    const yeniden = await depo<LotEtiketleriCevabi>('GET', `/stok/partiler/${et!.partiId}/etiket`);
    assert.deepEqual(yeniden.govde.etiketler.map((x) => [x.lotNo, x.belgeNo, x.miktar]), [[et!.lotNo, ilk.govde.belge.no, '4.000']]);
    assert.equal((await depo('GET', '/stok/partiler/999999999/etiket')).durum, 404);
    // Etiket Merkezi aynı etiketleri disari'dan alır; olmayan kayıt boş dizi.
    assert.deepEqual(await o().vt.tx((db) => lotEtiketleri(db, { malKabulId: ilk.govde.belge.id })), e.govde.etiketler);
    assert.deepEqual(await o().vt.tx((db) => lotEtiketleri(db, { partiId: et!.partiId })), yeniden.govde.etiketler);
    assert.deepEqual([await o().vt.tx((db) => lotEtiketleri(db, { partiId: 999999999 })), await o().vt.tx((db) => lotEtiketleri(db, { malKabulId: 999999999 }))], [[], []]);
    assert.equal((await istek('operator', 'GET', `/stok/mal-kabuller/${ilk.govde.belge.id}/lot-etiketleri`)).durum, 403);
    assert.equal((await istek('operator', 'GET', `/stok/partiler/${et!.partiId}/etiket`)).durum, 403);

    const oku = async (kod: string) => {
      const c = await depo<KodCozCevabi>('GET', `/stok/kod-coz?kod=${encodeURIComponent(kod)}`);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return kodCozCevabi.parse(c.govde);
    };
    const lot = await oku(`LOT:${et!.lotNo}`);
    assert.equal(lot.tur, 'lot');
    if (lot.tur !== 'lot') return;
    assert.deepEqual([lot.parti.id, lot.ozet.id, lot.toplam, lot.bakiyeler.map((b) => b.partiId)], [et!.partiId, h, '4', [et!.partiId]]);
    assert.equal((await oku(et!.lotNo.toLowerCase())).tur, 'lot', 'öneksiz LT- biçimi de lottur');
    assert.equal((await oku('LOT:LT-999999')).tur, 'bilinmiyor');
    assert.equal((await oku('LT-999999')).tur, 'bilinmiyor');
    // #1070: önek ayrımı ortak kod sözlüğünden; boşluk ve küçük harf tolere edilir, emir kodu stokta çözülmez.
    assert.equal((await oku(` lot: ${et!.lotNo.toLowerCase()} `)).tur, 'lot');
    assert.equal((await oku('UE:4512')).tur, 'bilinmiyor');
    assert.equal((await oku('UE-004512')).tur, 'bilinmiyor');

    // Okutulan lot en eski lot kuralını geçer: ikinci (daha yeni) lot okutulup düşülür, ilki değişmez.
    const yeniLot = (await o().vt.tek<{ lotNo: string }>('SELECT lot_no AS "lotNo" FROM stok_parti WHERE malzeme_id = $1 AND id <> $2', [h, et!.partiId]))!.lotNo;
    const ikinciLot = await oku(`LOT:${yeniLot}`);
    if (ikinciLot.tur !== 'lot') { assert.fail('lot bekleniyordu'); return; }
    const b = ikinciLot.bakiyeler[0]!;
    const c = await depo('POST', '/stok/cikis', { malzemeId: h, konumId: b.konumId, partiId: b.partiId, miktar: '2', cikisNedeni: 'sevk' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const sonra = await oku(`LOT:${yeniLot}`), ilkSonra = await oku(`LOT:${et!.lotNo}`);
    assert.deepEqual([sonra.tur === 'lot' ? sonra.toplam : null, ilkSonra.tur === 'lot' ? ilkSonra.toplam : null], ['4', '4']);
  });

  test('DEP-42/56 toplama: en eski girişten ayrılır, rotaya dizilir, eksik söylenir; adım toplanınca çıkış yazılır, iki kez toplanmaz; kapanınca toplanmaz', async () => {
    const raf = await rafAc('T', 3, 2);
    const g = (await mudur<{ gozler: { konumId: number; kod: string }[] }>('GET', `/stok/raflar/${raf.id}`)).govde.gozler;
    const goz = (kod: string) => g.find((x) => x.kod === kod)!.konumId;
    const a = await kart('sarf'), b = await kart('sarf');
    await malKabul(a, '3', { konumId: goz('T-03-01') });
    await malKabul(a, '4', { konumId: goz('T-01-02') });
    await malKabul(b, '2', { konumId: goz('T-02-01') });
    assert.equal((await istek('kalite', 'POST', '/stok/toplamalar', { ad: 'S-1', kalemler: [{ malzemeId: a, miktar: '1' }] })).durum, 403);
    const t = await depo<{ toplama: { id: number; surum: number; eksikVar: boolean }; kalemler: { malzemeId: number; eksik: string }[]; adimlar: { id: number; konumKod: string; miktar: string }[] }>(
      'POST', '/stok/toplamalar', { ad: 'Sipariş 7781', kalemler: [{ malzemeId: a, miktar: '5' }, { malzemeId: b, miktar: '3' }] });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    toplamaAyrintiCevabi.parse(t.govde);
    assert.deepEqual(t.govde.adimlar.map((x) => [x.konumKod, x.miktar]), [['T-01-02', '2'], ['T-02-01', '2'], ['T-03-01', '3']]);
    assert.equal(t.govde.toplama.eksikVar, true);
    assert.equal(t.govde.kalemler.find((k) => k.malzemeId === b)?.eksik, '1');
    const ilk = t.govde.adimlar[0]!;
    const top = await depo<{ toplama: { surum: number; toplanan: number } }>('POST', `/stok/toplamalar/${t.govde.toplama.id}/adimlar/${ilk.id}/topla`, { surum: t.govde.toplama.surum });
    assert.equal(top.durum, 200, JSON.stringify(top.govde));
    assert.equal(top.govde.toplama.toplanan, 1);
    assert.equal(await bakiye(a, 'T-01-02'), '2.000');
    assert.equal((await depo('POST', `/stok/toplamalar/${t.govde.toplama.id}/adimlar/${ilk.id}/topla`, { surum: t.govde.toplama.surum })).durum, 409);
    assert.equal((await depo('POST', `/stok/toplamalar/${t.govde.toplama.id}/adimlar/${ilk.id}/topla`, { surum: top.govde.toplama.surum })).durum, 409);
    const kap = await depo<{ toplama: { durum: string; surum: number } }>('POST', `/stok/toplamalar/${t.govde.toplama.id}/kapat`, { surum: top.govde.toplama.surum, durum: 'bitti' });
    assert.equal(kap.govde.toplama.durum, 'bitti');
    assert.equal((await depo('POST', `/stok/toplamalar/${t.govde.toplama.id}/adimlar/${t.govde.adimlar[1]!.id}/topla`, { surum: kap.govde.toplama.surum })).durum, 409);
    assert.equal((await depo<{ toplam: number }>('GET', '/stok/toplamalar?durum=bitti')).govde.toplam >= 1, true);
  });

  test('ST4 toplama kapatma: açan ya da toplama işlemi olan başkası kapatır; kapatan kişi listede görünür; işlemsiz 403; panel açık listeyi sayar', async () => {
    const a = await kart('sarf');
    await malKabul(a, '3');
    const ac = async () => (await depo<{ toplama: { id: number; surum: number } }>('POST', '/stok/toplamalar', { ad: 'ST4', kalemler: [{ malzemeId: a, miktar: '1' }] })).govde.toplama;
    const t1 = await ac();
    assert.equal((await istek('kalite', 'POST', `/stok/toplamalar/${t1.id}/kapat`, { surum: t1.surum, durum: 'iptal' })).durum, 403);
    const baskasi = await mudur<{ toplama: { durum: string; kisiAd: string | null; kapatanKisiAd: string | null } }>('POST', `/stok/toplamalar/${t1.id}/kapat`, { surum: t1.surum, durum: 'iptal' });
    assert.equal(baskasi.durum, 200, JSON.stringify(baskasi.govde));
    toplamaAyrintiCevabi.parse(baskasi.govde);
    assert.deepEqual([baskasi.govde.toplama.kisiAd, baskasi.govde.toplama.kapatanKisiAd], ['Deneme depo', 'Deneme mudur']);
    const bekleyen = async () => (await mudur<{ toplamaBekleyen: number }>('GET', '/stok/panel')).govde.toplamaBekleyen;
    const once = await bekleyen();
    const t2 = await ac();
    assert.equal(await bekleyen(), once + 1);
    assert.equal((await depo<{ toplama: { kapatanKisiAd: string | null } }>('GET', `/stok/toplamalar/${t2.id}`)).govde.toplama.kapatanKisiAd, null);
    const kendisi = await depo<{ toplama: { kapatanKisiAd: string | null } }>('POST', `/stok/toplamalar/${t2.id}/kapat`, { surum: t2.surum, durum: 'bitti' });
    assert.equal(kendisi.govde.toplama.kapatanKisiAd, 'Deneme depo');
    assert.equal(await bekleyen(), once);
    const liste = await depo<{ satirlar: { id: number; kapatanKisiAd: string | null }[] }>('GET', '/stok/toplamalar?durum=iptal');
    assert.equal(liste.govde.satirlar.find((x) => x.id === t1.id)?.kapatanKisiAd, 'Deneme mudur');
    await assert.rejects(o().vt.sorgu("INSERT INTO stok_toplama (no, ad, kisi_id, kapatan_kisi_id) VALUES ('TL-X', 'X', $1, $1)", [kisiler.get('depo')]), /stok_toplama_kapatan_kapaliysa/);
  });

  test('ST1 sipariş bağı: yalnız satın alma kabulünde; olmayan sipariş satırı 409; bağ belgenin parçasıdır, sonradan değişmez', async () => {
    const k = await kart('sarf');
    const diger = await depo<Hata>('POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: k, miktar: '1', siparisSatirId: 1 }] });
    assert.equal(diger.durum, 400, JSON.stringify(diger.govde));
    assert.equal((diger.govde as Hata & { alan?: string }).alan, 'satirlar.0.siparisSatirId');
    const yok = await malKabul(k, '1', { siparisSatirId: 999999 });
    assert.equal(yok.durum, 409, JSON.stringify(yok.govde));
    assert.equal(yok.govde.mesaj, 'Sipariş satırı bulunamadı.');
    assert.equal(await bakiye(k, 'KABUL'), null);
    const bagsiz = await malKabul(k, '2');
    const ay = await depo<{ satirlar: { siparisSatirId: number | null }[] }>('GET', `/stok/mal-kabuller/${bagsiz.govde.belge.id}`);
    malKabulAyrintiCevabi.parse(ay.govde);
    assert.equal(ay.govde.satirlar[0]?.siparisSatirId, null);
    const satir = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_mal_kabul_satiri WHERE mal_kabul_id = $1', [bagsiz.govde.belge.id]))!.id;
    await assert.rejects(o().vt.sorgu('UPDATE stok_mal_kabul_satiri SET siparis_satir_id = 1 WHERE id = $1', [satir]), /yalnız Logo/);
  });

  // Sipariş verilmiş en küçük talep (satın almanın tabloları; fikstür, satın alma akışı kendi testinde).
  let talepSira = 0;
  // `malzemeNo` verilirse kalem o karta bağlı bir katalog kalemidir; verilmezse katalogsuz (kartsız) kalemdir.
  async function siparisSatiri(miktar: string, durum = 'siparis_verildi', malzemeNo: number | null = null): Promise<number> {
    talepSira += 1;
    const [t, kl, tk] = [randomUUID(), randomUUID(), randomUUID()];
    const s = o().sahip;
    await s.sorgu('INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $2, $3, $4, $4, $5)',
      [t, 90000 + talepSira, `Deneme talep ${talepSira}`, kisiler.get('yonetici'), durum]);
    let katalog: string | null = null;
    if (malzemeNo !== null) {
      katalog = randomUUID();
      await s.sorgu("INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)", [katalog, malzemeNo]);
    }
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id) VALUES ($1, $2, 1, 'Deneme kalem', $3)", [t, kl, katalog]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [t, tk]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
    return (await s.tek<{ id: number }>("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, $4, 'adet') RETURNING id", [t, tk, kl, miktar]))!.id;
  }
  const teslimler = async (siparisSatirId: number) =>
    (await o().vt.sorgu<{ malKabulSatirId: number; miktar: string }>(
      'SELECT mal_kabul_satiri_id::int AS "malKabulSatirId", miktar::text FROM satin_alma_teslim WHERE siparis_satiri_id = $1 ORDER BY id', [siparisSatirId])).map((x) => [x.malKabulSatirId, Number(x.miktar)]);

  test('#1026 siparişli satırda yüklenen sertifika sipariş satırına da bağlanır; siparişsiz satırda yalnız partide', async () => {
    const yukle = async (): Promise<string> => {
      const icerik = Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(2000)]);
      const ozet = createHash('sha256').update(icerik).digest('hex');
      assert.equal((await istek('depo', 'POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') })).durum, 200);
      return ozet;
    };
    const h = await kart('hammadde');
    const ss = await siparisSatiri('5', 'siparis_verildi', h);
    const r = await malKabul(h, '5', { siparisSatirId: ss, sertifika: { ozet: await yukle(), dosyaAdi: 's.pdf' } });
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    const [p] = await o().vt.tx((db) => sonPartiler(db, h));
    const siparisteki = (await o().vt.tx((db) => kayitlaraBagliBelgeler(db, 'satin-alma', [ss]))).get(ss) ?? [];
    assert.deepEqual(siparisteki.map((b) => b.id), p!.belgeler.map((b) => b.id));
    assert.equal(siparisteki.length, 1);

    const ss2 = await siparisSatiri('5', 'siparis_verildi', h);
    assert.equal((await malKabul(h, '1', { sertifika: { ozet: await yukle(), dosyaAdi: 't.pdf' } })).durum, 200);
    assert.deepEqual((await o().vt.tx((db) => kayitlaraBagliBelgeler(db, 'satin-alma', [ss2]))).get(ss2) ?? [], []);
  });

  test('stok değeri (#544): eldeki miktar x ağırlıklı ortalama alış fiyatı (TRY); fiyatı olmayan stoklu kart sayılır; yalnız finans.oku görür', async () => {
    const kurus = (d: string | null) => (d === null ? 0n : BigInt(d.replace('.', '')));
    const once = await mudur<PanelCevabi>('GET', '/stok/panel');
    assert.equal(once.durum, 200, JSON.stringify(once.govde));
    const [k, fiyatsiz] = [await kart('sarf'), await kart('sarf')];
    const fiyatliTeslim = async (fiyat: number) => {
      const ss = await siparisSatiri('5', 'siparis_verildi', k);
      await o().sahip.sorgu(`INSERT INTO satin_alma_teklif_satiri (talep_id, teklif_id, kalem_id, birim_fiyat)
        SELECT talep_id, teklif_id, kalem_id, $2 FROM satin_alma_siparis_satiri WHERE id = $1`, [ss, fiyat]);
      assert.equal((await malKabul(k, '5', { siparisSatirId: ss })).durum, 200);
    };
    await fiyatliTeslim(245.5);
    await malKabul(fiyatsiz, '3');
    const sonra = await mudur<PanelCevabi>('GET', '/stok/panel');
    panelCevabi.parse(sonra.govde);
    // Değer finans rakamıdır (#680): depo stoğu okur ama değeri görmez; uç hesaplamaz.
    const depocu = await depo<PanelCevabi>('GET', '/stok/panel');
    assert.deepEqual([depocu.govde.degerGorunur, depocu.govde.stokDegeri, depocu.govde.fiyatsizKart, sonra.govde.degerGorunur], [false, null, 0, true]);
    assert.equal(kurus(sonra.govde.stokDegeri) - kurus(once.govde.stokDegeri), 122750n);
    assert.equal(sonra.govde.fiyatsizKart - once.govde.fiyatsizKart, 1);
    // İkinci teslim 5 x 100: ortalama (5 x 245.5 + 5 x 100) / 10 = 172.75; eldeki 10 x 172.75 = 1727.50 (son fiyat 100 olsaydı 1000).
    await fiyatliTeslim(100);
    const iki = await mudur<PanelCevabi>('GET', '/stok/panel');
    assert.equal(kurus(iki.govde.stokDegeri) - kurus(once.govde.stokDegeri), 172750n);
  });

  test('güncel stok değeri (228 a: yalnız kullanılabilir; hurda, fason, yolda ayrı): eldeki miktar x satın almanın kg fiyatından birim fiyatı (TRY); birim fiyatı olmayan kart değere katılmaz, sayılır; yalnız finans.oku görür', async () => {
    const kurus = (d: string | null) => (d === null ? 0n : BigInt(d.replace('.', '')));
    const once = await mudur<PanelCevabi>('GET', '/stok/panel');
    assert.equal(once.durum, 200, JSON.stringify(once.govde));
    const kalite = `STK-KG-${kartSira}`;
    const kgKarti = async (birim: string): Promise<number> => {
      const no = await kart('hammadde', 'aktif', birim);
      await o().sahip.sorgu("UPDATE malzeme_katalog_karti SET kayit = kayit || jsonb_build_object('grade', $2::text, 'form', 'cubuk', 'fam', 'metal') WHERE no = $1", [no, kalite]);
      return no;
    };
    const [kg, adet] = [await kgKarti('kg'), await kgKarti('adet')];
    await o().sahip.sorgu("INSERT INTO satin_alma_kg_fiyati (kalite_kodu, form, kg_fiyati, para_birimi, gecerlilik, kisi_id) VALUES ($1, NULL, 150, 'TRY', current_date, $2)",
      [kalite, kisiler.get('yonetici')]);
    for (const [m, miktar] of [[kg, '4'], [adet, '3']] as const) {
      const r = await malKabul(m, miktar);
      assert.equal(r.durum, 200, JSON.stringify(r.govde));
    }
    const sonra = await mudur<PanelCevabi>('GET', '/stok/panel');
    panelCevabi.parse(sonra.govde);
    assert.equal(kurus(sonra.govde.guncelDeger) - kurus(once.govde.guncelDeger), 60000n, '4 kg x 150 TL');
    // Adetle tutulan kartın kg ağırlığı bilinmiyor: birim fiyatı yok, değere sıfır olarak katılmaz, fiyatsız sayılır.
    assert.equal(sonra.govde.guncelFiyatsizKart - once.govde.guncelFiyatsizKart, 1);
    // Ortalama alış fiyatıyla değer ayrı kalır: bu kartların alış fiyatı yok.
    assert.equal(kurus(sonra.govde.stokDegeri) - kurus(once.govde.stokDegeri), 0n);
    // 228 a: hurda, fason ve karantinadaki miktar güncel değerden çıkar, kendi satırında görünür; toplam aynı kalır.
    const yer = async (tur: 'hurda' | 'fason' | 'karantina'): Promise<number> => {
      if (tur === 'karantina') {
        return (await o().sahip.tek<{ id: number }>("INSERT INTO stok_konum (depo_id, kod, tur) SELECT depo_id, $1, 'karantina' FROM stok_konum WHERE kod = 'KABUL' RETURNING id",
          [`KRN-KG${kartSira}`]))!.id;
      }
      const r = await mudur<{ konum: { id: number } }>('POST', '/stok/konumlar', { tur, kod: `${tur.toUpperCase()}-KG${kartSira}`, ad: null });
      assert.equal(r.durum, 200, JSON.stringify(r.govde));
      return r.govde.konum.id;
    };
    for (const [tur, miktar] of [['hurda', '1'], ['fason', '2'], ['karantina', '0.5']] as const) {
      const t = await depo('POST', '/stok/tasima', { malzemeId: kg, kaynakKonumId: await konumId('KABUL'), hedefKonumId: await yer(tur), miktar });
      assert.equal(t.durum, 200, JSON.stringify(t.govde));
    }
    const ayrik = await mudur<PanelCevabi>('GET', '/stok/panel');
    panelCevabi.parse(ayrik.govde);
    const fark = (k: keyof PanelCevabi['guncelAyri']) => kurus(ayrik.govde.guncelAyri[k]) - kurus(sonra.govde.guncelAyri[k]);
    assert.deepEqual([kurus(ayrik.govde.guncelDeger) - kurus(sonra.govde.guncelDeger), fark('hurda'), fark('fason'), fark('kalite'), fark('yolda'), fark('diger'), fark('toplam')],
      [-52500n, 15000n, 30000n, 7500n, 0n, 0n, 0n]);
    assert.equal(ayrik.govde.guncelFiyatsizKart, sonra.govde.guncelFiyatsizKart);
    // Satın alma aynı kırılımı disari'dan alır.
    assert.deepEqual((await degerGrubuToplamlari(o().vt)).filter((x) => x.malzemeId === kg).map((x) => [x.grup, Number(x.toplam)]),
      [['fason', 2], ['hurda', 1], ['kalite', 0.5], ['kullanilabilir', 0.5]]);
    const depocu = await depo<PanelCevabi>('GET', '/stok/panel');
    assert.deepEqual([depocu.govde.degerGorunur, depocu.govde.guncelDeger, depocu.govde.guncelFiyatsizKart, depocu.govde.guncelAyri],
      [false, null, 0, { kalite: null, hurda: null, fason: null, yolda: null, diger: null, toplam: null }]);
  });

  test('#1079 aylık stok değeri: ay sonu miktarı bugünkü bakiyeden sonraki hareketler geri sarılarak bulunur; yalnız finans.oku görür', async () => {
    const kurus = (d: string | null) => (d === null ? 0n : BigInt(d.replace('.', '')));
    const seri = async () => {
      const r = await mudur<AylikStokDegeriCevabi>('GET', '/stok/panel/aylik-deger?ay=6');
      assert.equal(r.durum, 200, JSON.stringify(r.govde));
      return aylikStokDegeriCevabi.parse(r.govde).aylar;
    };
    const once = await seri();
    assert.equal(once.length, 6);
    const k = await kart('sarf');
    const ss = await siparisSatiri('5', 'siparis_verildi', k);
    await o().sahip.sorgu(`INSERT INTO satin_alma_teklif_satiri (talep_id, teklif_id, kalem_id, birim_fiyat)
      SELECT talep_id, teklif_id, kalem_id, 100 FROM satin_alma_siparis_satiri WHERE id = $1`, [ss]);
    assert.equal((await malKabul(k, '5', { siparisSatirId: ss })).durum, 200);
    // Dört ay önce giren, iki ay önce çıkan 3 birim (defter toplamı değişmez): yalnız aradaki iki ay sonunda vardı.
    await o().sahip.sorgu(`INSERT INTO stok_hareketi (zaman, tur, malzeme_id, kaynak_konum_id, hedef_konum_id, miktar, giris_kaynagi, cikis_nedeni, kisi_id)
      SELECT date_trunc('month', now()) - make_interval(months => g.once) + interval '1 day', g.tur, $1, g.kaynak, g.hedef, 3, g.giris, g.neden, (SELECT min(id) FROM kisi)
      FROM (SELECT konum_id FROM stok_bakiye WHERE malzeme_id = $1 LIMIT 1) b,
        LATERAL (VALUES (4, 'giris', NULL::int, b.konum_id, 'mal_kabul', NULL), (2, 'cikis', b.konum_id, NULL::int, NULL, 'fire')) AS g(once, tur, kaynak, hedef, giris, neden)`, [k]);
    const sonra = await seri();
    assert.deepEqual(sonra.map((a) => a.ay), once.map((a) => a.ay));
    assert.deepEqual(sonra.map((a, i) => kurus(a.stokDegeri) - kurus(once[i]!.stokDegeri)), [0n, 30000n, 30000n, 0n, 0n, 50000n]);
    const depocu = await depo<AylikStokDegeriCevabi>('GET', '/stok/panel/aylik-deger');
    assert.deepEqual(depocu.govde, { degerGorunur: false, aylar: [] });
    assert.equal((await mudur<unknown>('GET', '/stok/panel/aylik-deger?ay=25')).durum, 400);
  });

  describe('#1108 statülü stok', () => {
    const statuAc = async (ad: string): Promise<number> => (await o().sahip.tek<{ id: number }>(
      `INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('M-1', $1, $2, '#2F6FDE', 'YM') RETURNING id`, [ad, `adim-${ad}-${randomBytes(4).toString('hex')}`]))!.id;
    const ayrinti = async (k: number) => {
      const r = await depo<MalzemeAyrintiCevabi>('GET', `/stok/malzemeler/${k}`);
      assert.equal(r.durum, 200, JSON.stringify(r.govde));
      return malzemeAyrintiCevabi.parse(r.govde);
    };
    const hazirla = async (miktar: string) => {
      const k = await kart('sarf');
      assert.equal((await malKabul(k, miktar)).durum, 200);
      const b = (await ayrinti(k)).bakiyeler[0]!;
      return { k, konumId: b.konumId, partiId: b.partiId, ilkGiris: b.ilkGiris };
    };
    const degistir = (x: { k: number; konumId: number; partiId: number | null }, kaynakStatuId: number | null, hedefStatuId: number | null, miktar: string) =>
      mudur<HareketCevabi & Hata>('POST', '/stok/statu-degistir', { malzemeId: x.k, konumId: x.konumId, partiId: x.partiId, kaynakStatuId, hedefStatuId, miktar });

    test('STK-S1 statü yalnız hareketle değişir: değişim transfer hareketi yazar, kart kırılımı ve hareket statüyü gösterir; aynı statüye ve mevcuttan fazlası reddedilir; depo değiştiremez', async () => {
      const st = await statuAc('OP 20 Taşlama');
      const x = await hazirla('10');
      const r = await degistir(x, null, st, '4');
      assert.equal(r.durum, 200, JSON.stringify(r.govde));
      const a = await ayrinti(x.k);
      assert.deepEqual(a.statuKirilimi.map((y) => [y.statuId, y.miktar]), [[null, '6'], [st, '4']]);
      assert.equal(a.satir.toplam, '10');
      const h = a.sonHareketler.find((y) => y.id === r.govde.hareketIdler[0]);
      assert.deepEqual([h?.tur, h?.kaynakStatuId, h?.hedefStatuId, h?.kaynakKonumKod === h?.hedefKonumKod], ['transfer', null, st, true]);
      const ayni = await degistir(x, st, st, '1');
      assert.equal(ayni.durum, 400, JSON.stringify(ayni.govde));
      const fazla = await degistir(x, st, null, '5');
      assert.equal(fazla.durum, 400, JSON.stringify(fazla.govde));
      assert.equal(fazla.govde.alan, 'miktar');
      for (const kim of ['kalite', 'depo']) {
        assert.equal((await istek(kim, 'POST', '/stok/statu-degistir', { malzemeId: x.k, konumId: x.konumId, partiId: x.partiId, kaynakStatuId: null, hedefStatuId: st, miktar: '1' })).durum, 403, kim);
      }
      assert.deepEqual(await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db)), []);
    });

    test('STK-S3 statülü stok çıkışa, önerilere ve kullanılabilire girmez; serbeste dönen stok çıkar', async () => {
      const st = await statuAc('OP 30 Kontrol');
      const x = await hazirla('5');
      assert.equal((await degistir(x, null, st, '5')).durum, 200);
      const red = await depo<Hata>('POST', '/stok/cikis', { malzemeId: x.k, konumId: x.konumId, partiId: x.partiId, miktar: '1', cikisNedeni: 'sevk' });
      assert.equal(red.durum, 409, JSON.stringify(red.govde));
      assert.equal(red.govde.ayrinti?.mevcut, '0');
      const oneri = await depo<{ oneriler: unknown[]; mevcut: string }>('GET', `/stok/malzemeler/${x.k}/cikis-onerisi?miktar=1`);
      assert.deepEqual([oneri.govde.oneriler.length, oneri.govde.mevcut], [0, '0']);
      const m = (await o().vt.tx((db) => stokMiktarlari(db, [x.k]))).get(x.k);
      assert.deepEqual([m?.toplam, Number(m?.kullanilabilir)], ['5.000', 0]);
      assert.equal((await degistir(x, st, null, '2')).durum, 200);
      const izin = await depo<Hata>('POST', '/stok/cikis', { malzemeId: x.k, konumId: x.konumId, partiId: x.partiId, miktar: '2', cikisNedeni: 'sevk' });
      assert.equal(izin.durum, 200, JSON.stringify(izin.govde));
      assert.deepEqual((await ayrinti(x.k)).statuKirilimi.map((y) => [y.statuId, y.miktar]), [[st, '3']]);
    });

    test('STK-S4 bekleme süresi statüye girişten sayılır: statü satırı değişim anıyla açılır, ikinci giriş en eskiyi korur; geri alma statüyü geri çevirir', async () => {
      const st = await statuAc('OP 40 Yıkama');
      const x = await hazirla('6');
      const once = Date.now();
      const r = await degistir(x, null, st, '2');
      assert.equal(r.durum, 200);
      const k1 = (await ayrinti(x.k)).statuKirilimi;
      const statude = k1.find((y) => y.statuId === st)!;
      assert.ok(Date.parse(statude.ilkGiris) >= once - 1000 && Date.parse(statude.ilkGiris) > Date.parse(x.ilkGiris));
      assert.equal(k1.find((y) => y.statuId === null)?.ilkGiris, x.ilkGiris);
      assert.equal((await degistir(x, null, st, '1')).durum, 200);
      assert.equal((await ayrinti(x.k)).statuKirilimi.find((y) => y.statuId === st)?.ilkGiris, statude.ilkGiris);
      const g = await mudur<HareketCevabi & Hata>('POST', `/stok/hareketler/${r.govde.hareketIdler[0]}/geri-al`, {});
      assert.equal(g.durum, 200, JSON.stringify(g.govde));
      assert.deepEqual((await ayrinti(x.k)).statuKirilimi.map((y) => [y.statuId, y.miktar]), [[null, '5'], [st, '1']]);
      assert.deepEqual(await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db)), []);
    });

    test('statü kimliği Reçete ve Rota tanımına bağlıdır: olmayan statü yabancı anahtarla reddedilir, bakiye değişmez', async () => {
      const x = await hazirla('3');
      const r = await degistir(x, null, 2147483000, '1');
      assert.deepEqual([r.durum, r.govde.kod], [409, 'BAGIMLI_KAYIT']);
      assert.deepEqual((await ayrinti(x.k)).statuKirilimi.map((y) => [y.statuId, y.miktar]), [[null, '3']]);
    });
  });

  test('ST2 SH1: siparişe bağlı mal kabul teslimi satın almaya aynı işlemde yazar; kalanı aşan teslim reddedilmez; düzeltme eskisini ters kayıtla geri alır', async () => {
    const k = await kart('sarf');
    const ss = await siparisSatiri('5');
    const acik = await depo<{ satirlar: { id: number; miktar: string; birim: string }[] }>('GET', '/stok/acik-siparis-satirlari');
    assert.equal(acik.durum, 200);
    assert.deepEqual(acik.govde.satirlar.filter((x) => x.id === ss).map((x) => [Number(x.miktar), x.birim]), [[5, 'adet']]);
    assert.equal((await istek('kalite', 'GET', '/stok/acik-siparis-satirlari')).durum, 403);
    const ilk = await malKabul(k, '7', { siparisSatirId: ss });
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    const satir = async (belge: number) => (await o().vt.tek<{ id: number }>('SELECT id FROM stok_mal_kabul_satiri WHERE mal_kabul_id = $1', [belge]))!.id;
    const eski = await satir(ilk.govde.belge.id);
    assert.deepEqual(await teslimler(ss), [[eski, 7]]);
    const d = await mudur<MalKabulCevabi>('POST', `/stok/mal-kabuller/${ilk.govde.belge.id}/duzelt`, { satirlar: [{ malzemeId: k, miktar: '4', siparisSatirId: ss }] });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.deepEqual(await teslimler(ss), [[eski, 7], [eski, -7], [await satir(d.govde.belge.id), 4]]);
    assert.equal(await bakiye(k, 'KABUL'), '4.000');
  });

  test('denetim #18: açık sipariş satırı kalan miktarı taşır (sipariş - net teslim); kısmi teslimden sonra öneri kalandır', async () => {
    const k = await kart('sarf');
    const ss = await siparisSatiri('5');
    const oku = async () => (await depo<{ satirlar: { id: number; miktar: string; kalanMiktar: string }[] }>('GET', '/stok/acik-siparis-satirlari')).govde.satirlar
      .filter((x) => x.id === ss).map((x) => [x.miktar, x.kalanMiktar]);
    assert.deepEqual(await oku(), [['5', '5']]);
    const r = await malKabul(k, '2', { siparisSatirId: ss });
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    assert.deepEqual(await oku(), [['5', '3']]);
  });

  test('#1124: sipariş satırının irsaliyeleri no ve zamanla okunur; düzeltilen belge düşer, yerine geleni görünür; satın alma okur, yetkisiz 403', async () => {
    const k = await kart('sarf');
    const [ss, ss2] = [await siparisSatiri('5'), await siparisSatiri('3')];
    const ilk = await depo<MalKabulCevabi>('POST', '/stok/mal-kabul', { tur: 'satin_alma', irsaliyeNo: 'DN-IRS-1', satirlar: [{ malzemeId: k, miktar: '2', siparisSatirId: ss }] });
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    const ikinci = await depo<MalKabulCevabi>('POST', '/stok/mal-kabul', { tur: 'satin_alma', satirlar: [{ malzemeId: k, miktar: '3', siparisSatirId: ss }] });
    assert.equal(ikinci.durum, 200, JSON.stringify(ikinci.govde));
    const oku = (kim: string, satirlar: number[]) => istek<SiparisIrsaliyeleriCevabi>(kim, 'GET', `/stok/siparis-irsaliyeleri?siparisSatirlari=${satirlar.join(',')}`);
    const r = await oku('satin_alma', [ss, ss2]);
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    assert.deepEqual(r.govde.irsaliyeler.map((x) => [x.siparisSatirId, x.malKabulNo, x.irsaliyeNo]),
      [[ss, ilk.govde.belge.no, 'DN-IRS-1'], [ss, ikinci.govde.belge.no, null]]);
    assert.equal(r.govde.irsaliyeler[0]!.zaman, ilk.govde.belge.zaman);
    const d = await mudur<MalKabulCevabi>('POST', `/stok/mal-kabuller/${ilk.govde.belge.id}/duzelt`, { satirlar: [{ malzemeId: k, miktar: '1', siparisSatirId: ss }] });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.deepEqual((await oku('depo', [ss])).govde.irsaliyeler.map((x) => x.malKabulNo).sort(), [ikinci.govde.belge.no, d.govde.belge.no].sort());
    assert.deepEqual((await oku('satin_alma', [ss2])).govde.irsaliyeler, []);
    assert.equal((await oku('operator', [ss])).durum, 403);
    assert.equal((await istek('satin_alma', 'GET', '/stok/siparis-irsaliyeleri?siparisSatirlari=1;2')).durum, 400);
  });

  test('KD-009: başka kartın sipariş satırına bağlanan mal kabul reddedilir, hiçbir şey yazmaz; kendi kartının satırı kabul edilir', async () => {
    const [a, b] = [await kart('sarf'), await kart('sarf')];
    const ss = await siparisSatiri('10', 'siparis_verildi', b);
    const yanlis = await malKabul(a, '10', { siparisSatirId: ss });
    assert.equal(yanlis.durum, 400, JSON.stringify(yanlis.govde));
    assert.equal((yanlis.govde as Hata & { alan?: string }).alan, 'satirlar.0.siparisSatirId');
    assert.equal(await bakiye(a, 'KABUL'), null);
    assert.deepEqual(await teslimler(ss), []);
    const dogru = await malKabul(b, '10', { siparisSatirId: ss });
    assert.equal(dogru.durum, 200, JSON.stringify(dogru.govde));
    assert.equal(await bakiye(b, 'KABUL'), '10.000');
    const d = await mudur<Hata & { alan?: string }>('POST', `/stok/mal-kabuller/${dogru.govde.belge.id}/duzelt`, { satirlar: [{ malzemeId: a, miktar: '10', siparisSatirId: ss }] });
    assert.equal(d.durum, 400, JSON.stringify(d.govde));
    assert.equal(await bakiye(b, 'KABUL'), '10.000');
  });

  test('KD-013: hizmet kartı hiçbir komutla bakiye açmaz (sayım fazlası, eksiye onaylı çıkış)', async () => {
    const h = await kart('hizmet');
    const z = await konumId('KABUL');
    const sayim = await istek<Hata>('kalite', 'POST', '/stok/sayim', { konumId: z, satirlar: [{ malzemeId: h, partiId: null, beklenenMiktar: '0', sayilanMiktar: '5' }] });
    assert.equal(sayim.durum, 400, JSON.stringify(sayim.govde));
    assert.match(sayim.govde.mesaj, /hizmet stoklanmaz/);
    const cikis = await depo<Hata>('POST', '/stok/cikis', { malzemeId: h, konumId: z, miktar: '1', cikisNedeni: 'diger', eksiOnay: true });
    assert.equal(cikis.durum, 400, JSON.stringify(cikis.govde));
    assert.equal(await bakiye(h, 'KABUL'), null);
    const hareket = await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM stok_hareketi WHERE malzeme_id = $1', [h]);
    assert.equal(hareket!.n, 0);
  });

  // Fason fikstürü: ham yarı mamul fason konumuna taşınmış, kaplama hizmeti siparişi açık.
  let fasonSira = 0;
  async function fasonHazirla(giden = '10') {
    fasonSira += 1;
    const [ham, kapli, hizmet] = [await kart('yarimamul'), await kart('yarimamul'), await kart('hizmet')];
    const fk = await mudur<{ konum: { id: number; tur: string } }>('POST', '/stok/konumlar', { tur: 'fason', kod: `FSN-T${fasonSira}`, ad: 'Deneme fasoncu' });
    assert.equal(fk.durum, 200, JSON.stringify(fk.govde));
    assert.equal(fk.govde.konum.tur, 'fason');
    assert.equal((await malKabul(ham, giden, { parti: { tedarikciPartiNo: `FP-${fasonSira}` } })).durum, 200);
    const t = await depo('POST', '/stok/tasima', { malzemeId: ham, kaynakKonumId: await konumId('KABUL'), hedefKonumId: fk.govde.konum.id, miktar: giden });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    return { ham, kapli, hizmet, fasonKonum: fk.govde.konum.id, fasonKod: `FSN-T${fasonSira}`, ss: await siparisSatiri('10', 'siparis_verildi', hizmet) };
  }
  const hareketSayisi = async (malzemeId: number) => (await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM stok_hareketi WHERE malzeme_id = $1', [malzemeId]))!.n;

  test('DEP-58 fason dönüşü: dönen yarı mamul girer, giden fason konumundan düşer, teslim satın almaya yazılır; düzeltme hepsini geri alır', async () => {
    const f = await fasonHazirla();
    const acik = await depo<{ satirlar: { id: number; malzemeTur: string | null }[] }>('GET', '/stok/acik-siparis-satirlari');
    assert.equal(acik.govde.satirlar.find((x) => x.id === f.ss)?.malzemeTur, 'hizmet');
    const r = await malKabul(f.kapli, '8', { siparisSatirId: f.ss, parti: { tedarikciPartiNo: 'KP-1' }, fason: { malzemeId: f.ham, konumId: f.fasonKonum, miktar: '10' } });
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    assert.equal(r.govde.hareketIdler.length, 2);
    assert.equal(await bakiye(f.kapli, 'KABUL'), '8.000');
    assert.equal(await bakiye(f.ham, f.fasonKod), null, 'sıfırlanan bakiye satırı silinir');
    assert.equal(await bakiye(f.hizmet, 'KABUL'), null);
    const satir = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_mal_kabul_satiri WHERE mal_kabul_id = $1', [r.govde.belge.id]))!.id;
    assert.deepEqual(await teslimler(f.ss), [[satir, 8]]);
    const ay = await depo<{ satirlar: { fason: { malzemeId: number; miktar: string; konumId: number; konumKod: string; hizmetMalzemeId: number | null } | null }[] }>('GET', `/stok/mal-kabuller/${r.govde.belge.id}`);
    malKabulAyrintiCevabi.parse(ay.govde);
    const fa = ay.govde.satirlar[0]?.fason;
    assert.deepEqual(fa && [fa.malzemeId, fa.miktar, fa.konumId, fa.konumKod, fa.hizmetMalzemeId], [f.ham, '10.000', f.fasonKonum, f.fasonKod, f.hizmet]);
    const cikis = r.govde.hareketIdler[1]!;
    const tek = await mudur<Hata>('POST', `/stok/hareketler/${cikis}/geri-al`, {});
    assert.equal(tek.durum, 409, JSON.stringify(tek.govde));
    assert.match(tek.govde.mesaj, /belgeyi düzeltin/);
    const d = await mudur<MalKabulCevabi>('POST', `/stok/mal-kabuller/${r.govde.belge.id}/duzelt`, { satirlar: [{ malzemeId: f.kapli, miktar: '3', siparisSatirId: f.ss, parti: { tedarikciPartiNo: 'KP-1' }, fason: { malzemeId: f.ham, konumId: f.fasonKonum, miktar: '4' } }] });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.equal(await bakiye(f.kapli, 'KABUL'), '3.000');
    assert.equal(await bakiye(f.ham, f.fasonKod), '6.000');
    const yeniSatir = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_mal_kabul_satiri WHERE mal_kabul_id = $1', [d.govde.belge.id]))!.id;
    assert.deepEqual(await teslimler(f.ss), [[satir, 8], [satir, -8], [yeniSatir, 3]]);
  });

  test('DEP-58 fason dönüşü: fason konumunda yetmeyen giden ONAY_GEREKLI ister ve hiçbir şey yazmaz; onayla eksiye düşer', async () => {
    const f = await fasonHazirla('3');
    const g = { siparisSatirId: f.ss, parti: { tedarikciPartiNo: 'KP-2' }, fason: { malzemeId: f.ham, konumId: f.fasonKonum } };
    const r = await malKabul(f.kapli, '5', g);
    assert.equal(r.durum, 409, JSON.stringify(r.govde));
    assert.equal(r.govde.kod, 'ONAY_GEREKLI');
    assert.equal(await hareketSayisi(f.kapli), 0);
    assert.equal(await bakiye(f.ham, f.fasonKod), '3.000');
    assert.deepEqual(await teslimler(f.ss), []);
    const onay = await depo<MalKabulCevabi>('POST', '/stok/mal-kabul', { tur: 'satin_alma', eksiOnay: true, satirlar: [{ malzemeId: f.kapli, miktar: '5', ...g }] });
    assert.equal(onay.durum, 200, JSON.stringify(onay.govde));
    assert.equal(await bakiye(f.ham, f.fasonKod), '-2.000');
  });

  test('DEP-58 saf hizmet: malzeme dönmezse stok yazılmaz, teslim satın almaya yazılır; düzeltme teslimi geri alır', async () => {
    const h = await kart('hizmet');
    const ss = await siparisSatiri('1', 'siparis_verildi', h);
    const r = await malKabul(h, '1', { siparisSatirId: ss });
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    assert.deepEqual(r.govde.hareketIdler, []);
    assert.equal(await hareketSayisi(h), 0);
    const satir = (await o().vt.tek<{ id: number; k: number | null }>('SELECT id, konum_id AS k FROM stok_mal_kabul_satiri WHERE mal_kabul_id = $1', [r.govde.belge.id]))!;
    assert.equal(satir.k, null);
    assert.deepEqual(await teslimler(ss), [[satir.id, 1]]);
    const ay = await depo<{ satirlar: { konumKod: string | null; hareketId: number | null; fason: unknown }[] }>('GET', `/stok/mal-kabuller/${r.govde.belge.id}`);
    malKabulAyrintiCevabi.parse(ay.govde);
    assert.deepEqual(ay.govde.satirlar.map((x) => [x.konumKod, x.hareketId, x.fason]), [[null, null, null]]);
    const d = await mudur<MalKabulCevabi>('POST', `/stok/mal-kabuller/${r.govde.belge.id}/duzelt`, { satirlar: [{ malzemeId: h, miktar: '2', siparisSatirId: ss }] });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.equal((await teslimler(ss)).map((x) => x[1]).join(','), '1,-1,2');
    assert.equal(await hareketSayisi(h), 0);
  });

  test('DEP-58 reddedilenler: fason olmayan konum, hizmet siparişinde eksik fason, hizmetsiz siparişte fason, konumlu saf hizmet, siparişsiz hizmet, başka hizmet kartının siparişi, kutuda birden çok parti', async () => {
    const f = await fasonHazirla();
    const alan = (c: Cevap<MalKabulCevabi & Hata>) => [c.durum, (c.govde as Hata & { alan?: string }).alan];
    const kabul = await konumId('KABUL');
    assert.deepEqual(alan(await malKabul(f.kapli, '1', { siparisSatirId: f.ss, parti: { tedarikciPartiNo: 'X' }, fason: { malzemeId: f.ham, konumId: kabul } })), [400, 'satirlar.0.fason.konumId']);
    assert.deepEqual(alan(await malKabul(f.kapli, '1', { siparisSatirId: f.ss, parti: { tedarikciPartiNo: 'X' } })), [400, 'satirlar.0.fason']);
    const ymSiparis = await siparisSatiri('1', 'siparis_verildi', f.kapli);
    assert.deepEqual(alan(await malKabul(f.kapli, '1', { siparisSatirId: ymSiparis, parti: { tedarikciPartiNo: 'X' }, fason: { malzemeId: f.ham, konumId: f.fasonKonum } })), [400, 'satirlar.0.fason']);
    assert.deepEqual(alan(await malKabul(f.hizmet, '1', { siparisSatirId: f.ss, konumId: kabul })), [400, 'satirlar.0.malzemeId']);
    assert.deepEqual(alan(await malKabul(f.hizmet, '1', { siparisSatirId: f.ss, fason: { malzemeId: f.ham, konumId: f.fasonKonum } })), [400, 'satirlar.0.malzemeId']);
    assert.deepEqual(alan(await malKabul(f.hizmet, '1')), [400, 'satirlar.0.siparisSatirId']);
    assert.deepEqual(alan(await malKabul(await kart('hizmet'), '1', { siparisSatirId: f.ss })), [400, 'satirlar.0.siparisSatirId'], 'başka hizmet kartının siparişi (KD-009)');
    await malKabul(f.ham, '2', { parti: { tedarikciPartiNo: 'FP-IKINCI' }, konumId: f.fasonKonum });
    assert.deepEqual(alan(await malKabul(f.kapli, '1', { siparisSatirId: f.ss, parti: { tedarikciPartiNo: 'X' }, fason: { malzemeId: f.ham, konumId: f.fasonKonum } })), [400, 'satirlar.0.fason.partiId']);
    assert.deepEqual(alan(await malKabul(f.kapli, '1', { siparisSatirId: f.ss, parti: { tedarikciPartiNo: 'X' }, fason: { malzemeId: f.hizmet, konumId: f.fasonKonum } })), [400, 'satirlar.0.fason.malzemeId']);
    assert.equal(await hareketSayisi(f.kapli), 0);
    assert.equal(await bakiye(f.ham, f.fasonKod), '12.000');
    assert.deepEqual(await teslimler(f.ss), []);
  });

  test('ST2: satın alma teslimi reddederse (talep sipariş aşamasında değil) mal kabul hiçbir şey yazmaz', async () => {
    const k = await kart('sarf');
    const ss = await siparisSatiri('5', 'onayda');
    const r = await malKabul(k, '1', { siparisSatirId: ss });
    assert.equal(r.durum, 422, JSON.stringify(r.govde));
    assert.equal(await bakiye(k, 'KABUL'), null);
    assert.deepEqual(await teslimler(ss), []);
  });

  test('tekrar koruması: aynı istek kimliğiyle yinelenen mal kabul ikinci belge açmaz, ilk cevap döner; kimliksiz yazma 400', async () => {
    const k = await kart('sarf');
    const kimlik = randomUUID();
    const gonder = (istekKimligi: string | null) => app.inject({
      method: 'POST', url: '/api/stok/mal-kabul', payload: { tur: 'diger', satirlar: [{ malzemeId: k, miktar: '3' }] },
      headers: { cookie: cerezler.get('depo') ?? '', ...(istekKimligi === null ? {} : { [ISTEK_KIMLIGI_BASLIGI]: istekKimligi }) },
    });
    const ilk = await gonder(kimlik);
    const ikinci = await gonder(kimlik);
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.deepEqual(ikinci.json(), ilk.json());
    assert.equal(await bakiye(k, 'KABUL'), '3.000');
    assert.equal((await gonder(null)).statusCode, 400);
    assert.equal(await bakiye(k, 'KABUL'), '3.000');
  });

  test('fiş emir numarasını taşır (borç #419): emre sarf fişi emirNo verir, emirsiz fişte null', async () => {
    const h = await kart('sarf');
    await malKabul(h, '4');
    const e = await emir();
    const emirNo = (await o().vt.tek<{ emirNo: string }>('SELECT emir_no AS "emirNo" FROM uretim_emri WHERE id = $1', [e]))!.emirNo;
    assert.equal((await depo('POST', '/stok/sepet/satir-ekle', { malzemeId: h, miktar: '1' })).durum, 200);
    const sarf = await depo<{ fis: { id: number; uretimEmriId: number | null; emirNo?: string | null } }>('POST', '/stok/sepet/stoktan-dus', { cikisNedeni: 'uretime_sarf', uretimEmriId: e });
    assert.equal(sarf.durum, 200, JSON.stringify(sarf.govde));
    assert.equal(sarf.govde.fis.emirNo, emirNo);
    const f = await depo<{ fis: { emirNo?: string | null } }>('GET', `/stok/fisler/${sarf.govde.fis.id}`);
    fisAyrintiCevabi.parse(f.govde);
    assert.equal(f.govde.fis.emirNo, emirNo);
    assert.equal((await depo('POST', '/stok/sepet/satir-ekle', { malzemeId: h, miktar: '1' })).durum, 200);
    const fire = await depo<{ fis: { emirNo?: string | null } }>('POST', '/stok/sepet/stoktan-dus', { cikisNedeni: 'fire' });
    assert.equal(fire.govde.fis.emirNo, null);
  });

  test('DEP-36 üretime sarf iş merkezi kapsamı: kapsam dışındaki emre sarf 403 ve hiçbir şey yazmaz; kapsamdaki emre yazılır', async () => {
    const h = await kart('sarf');
    await malKabul(h, '10');
    const kabul = await konumId('KABUL');
    const disarida = await emir();
    const icerde = await emir();
    const im = async (e: number) => (await o().sahip.tek<{ id: number }>('SELECT i.is_merkezi_id AS id FROM uretim_emri u JOIN istasyon i ON i.id = u.istasyon_id WHERE u.id = $1', [e]))!.id;
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisiler.get('depo_kisitli'), await im(icerde)]);
    const sarf = (e: number) => istek<Hata>('depo_kisitli', 'POST', '/stok/cikis', { malzemeId: h, konumId: kabul, miktar: '1', cikisNedeni: 'uretime_sarf', uretimEmriId: e });
    const red = await sarf(disarida);
    assert.equal(red.durum, 403, JSON.stringify(red.govde));
    assert.equal(await bakiye(h, 'KABUL'), '10.000');
    assert.equal((await sarf(icerde)).durum, 200);
    assert.equal(await bakiye(h, 'KABUL'), '9.000');
    assert.equal((await istek('depo_kisitli', 'POST', '/stok/sepet/satir-ekle', { malzemeId: h, miktar: '1' })).durum, 200);
    const sepet = await istek<Hata>('depo_kisitli', 'POST', '/stok/sepet/stoktan-dus', { cikisNedeni: 'uretime_sarf', uretimEmriId: disarida });
    assert.equal(sepet.durum, 403, JSON.stringify(sepet.govde));
    assert.equal(await bakiye(h, 'KABUL'), '9.000');
  });

  test('3B depo ucu kaldırıldı (borç #438): ekransız kalan uç 404 döner', async () => {
    assert.equal((await istek('satin_alma', 'GET', '/stok/depo-3b')).durum, 404);
  });

  test('DEP-57 yerleşim: taşı, ekle, kaldır tek işlemde; numaralama değişince stok gözle kalır; stoklu raf kaldırılmaz; aynı adres ve eski sürüm reddedilir', async () => {
    type YR = { id: number; surum: number; kod: string; tur: string; numaralama: string; ilkBolme: number; bolmeSayisi: number; katSayisi: number; bolmeGenislikM: number; derinlikM: number; katAraligiM: number; xM: number; zM: number; aci: number; onYuzTers: boolean; stokluGoz: number };
    type YC = { depo: { ad: string }; yerlesim: { bina: { x0: number; x1: number; z0: number; z1: number }; kabul: object; kareBoyu: number; fason: object; surum: number }; raflar: YR[] };
    const raf = await rafAc('Y', 2, 2);
    const bos = await rafAc('Z', 1, 1);
    const goz = (await mudur<{ gozler: { konumId: number; kod: string }[] }>('GET', `/stok/raflar/${raf.id}`)).govde.gozler.find((g) => g.kod === 'Y-02-01')!;
    const k = await kart('sarf');
    await malKabul(k, '4', { konumId: goz.konumId });
    const y0 = await istek<YC>('satin_alma', 'GET', '/stok/yerlesim');
    assert.equal(y0.durum, 200);
    yerlesimCevabi.parse(y0.govde);
    assert.equal(y0.govde.yerlesim.bina.x1 - y0.govde.yerlesim.bina.x0, 40);
    const govde = (y: YC, raflar: unknown[], silinenler: unknown[] = []) => ({ surum: y.yerlesim.surum, depoAdi: 'Ana depo', bina: y.yerlesim.bina, kabul: y.yerlesim.kabul, kareBoyu: y.yerlesim.kareBoyu, sayimSuresiGun: 30, fason: y.yerlesim.fason, raflar, silinenler });
    const alan = ({ id, surum, kod, tur, numaralama, ilkBolme, bolmeSayisi, katSayisi, bolmeGenislikM, derinlikM, katAraligiM, xM, zM, aci, onYuzTers }: YR) => ({ id, surum, kod, tur, numaralama, ilkBolme, bolmeSayisi, katSayisi, bolmeGenislikM, derinlikM, katAraligiM, xM, zM, aci, onYuzTers });
    const yR = y0.govde.raflar.find((r) => r.id === raf.id)!, zR = y0.govde.raflar.find((r) => r.id === bos.id)!;
    assert.equal(yR.stokluGoz, 1);
    assert.equal((await istek('kalite', 'POST', '/stok/yerlesim/kaydet', govde(y0.govde, []))).durum, 403);
    const yeni = { id: null, surum: null, kod: 'YY', tur: 'celik', numaralama: 'sirali', ilkBolme: 1, bolmeSayisi: 2, katSayisi: 3, bolmeGenislikM: 1, derinlikM: 0.5, katAraligiM: 0.45, xM: 12, zM: -4, aci: 90, onYuzTers: false };
    const k1 = await mudur<YC>('POST', '/stok/yerlesim/kaydet', govde(y0.govde, [{ ...alan(yR), xM: 3.5, zM: -2, numaralama: 'cift' }, yeni], [{ id: zR.id, surum: zR.surum }]));
    assert.equal(k1.durum, 200, JSON.stringify(k1.govde));
    const yR1 = k1.govde.raflar.find((r) => r.id === raf.id)!;
    assert.deepEqual([yR1.xM, yR1.zM, yR1.numaralama], [3.5, -2, 'cift']);
    assert.ok(k1.govde.raflar.some((r) => r.kod === 'YY' && r.aci === 90));
    assert.equal(k1.govde.raflar.some((r) => r.id === bos.id), false);
    // İkinci bölme (sıra 1) çift numaralamada 4 olur; stok aynı gözde, yeni adreste.
    assert.equal(await bakiye(k, 'Y-04-01'), '4.000');
    const ayni = await depo<{ konum: { kod: string } }>('GET', `/stok/konumlar/${goz.konumId}`);
    assert.equal(ayni.govde.konum.kod, 'Y-04-01');
    assert.equal((await mudur('POST', '/stok/yerlesim/kaydet', govde(y0.govde, []))).durum, 409);
    const sil = await mudur<Hata>('POST', '/stok/yerlesim/kaydet', govde(k1.govde, [], [{ id: raf.id, surum: yR1.surum }]));
    assert.equal(sil.durum, 409, JSON.stringify(sil.govde));
    const cakisan = { ...yeni, kod: 'Y', numaralama: 'cift', xM: 20, zM: 0, aci: 0 };
    assert.equal((await mudur<Hata>('POST', '/stok/yerlesim/kaydet', govde(k1.govde, [cakisan]))).durum, 409);
    // Eski dama tahtası kare adları kalktı (borç #441): kaydetme ucu yok, yerleşim cevabında ad alanı yok.
    assert.equal((await mudur('POST', '/stok/yerlesim/kare-adi', { kare: 'C4', ad: 'Sevkiyat hazırlık' })).durum, 404);
    assert.equal('kareAdlari' in k1.govde, false);
  });

  test('stok içi arama: konum kodu ve LOC, raf, parti no, kart no; bilinmeyen sonuç uydurmaz', async () => {
    const raf = await rafAc('W', 1, 1);
    const k = await kart('hammadde');
    await malKabul(k, '1', { parti: { dokumNo: 'ARA-777' } });
    const al = async (q: string) => (await istek<{ sonuclar: { tur: string; kod?: string }[] }>('satin_alma', 'GET', `/stok/ara?q=${encodeURIComponent(q)}`)).govde.sonuclar;
    araCevabi.parse({ sonuclar: await al('W-01') });
    assert.ok((await al('LOC:W-01-01')).some((x) => x.tur === 'konum' && x.kod === 'W-01-01'));
    assert.ok((await al('W')).some((x) => x.tur === 'raf' && x.kod === 'W'));
    assert.ok((await al('ARA-777')).some((x) => x.tur === 'parti'));
    assert.ok((await al(`MLZ:${k}`)).some((x) => x.tur === 'malzeme'));
    assert.deepEqual(await al('ZZZQQQ'), []);
    void raf;
  });

  test('DEP-15 sayım bekleyen: dolu ve süreden uzun sayılmamış göz listelenir; sayılınca düşer; fiş hareketlerde bağlıdır', async () => {
    const raf = await rafAc('V', 1, 1);
    const g = (await mudur<{ gozler: { konumId: number }[] }>('GET', `/stok/raflar/${raf.id}`)).govde.gozler[0]!.konumId;
    const k = await kart('sarf');
    await malKabul(k, '2', { konumId: g });
    const kp = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1', [k]))!.id;
    const once = await depo<{ gun: number; gozler: { konumId: number }[] }>('GET', '/stok/sayim-bekleyenler');
    assert.equal(once.govde.gun, 30);
    assert.ok(once.govde.gozler.some((x) => x.konumId === g));
    // Ana sayfa kartı ve iş kutusu aynı sayıyı verir (demoda kart 0, iş kutusu 2 gösterdi).
    const kutu = await mudur<{ sayimBekleyen: number | null }>('GET', '/stok/is-kutusu');
    const pano = await mudur<{ sayimBekleyen: number | null }>('GET', '/stok/ozet');
    assert.equal(pano.govde.sayimBekleyen, kutu.govde.sayimBekleyen);
    assert.ok((pano.govde.sayimBekleyen ?? 0) >= 1);
    await istek('kalite', 'POST', '/stok/sayim', { konumId: g, satirlar: [{ malzemeId: k, partiId: kp, beklenenMiktar: '2', sayilanMiktar: '2' }] });
    assert.equal((await depo<{ gozler: { konumId: number }[] }>('GET', '/stok/sayim-bekleyenler')).govde.gozler.some((x) => x.konumId === g), false);
    await depo('POST', '/stok/sepet/satir-ekle', { malzemeId: k, miktar: '1', kaynakKonumId: g });
    const f = await depo<{ fis: { id: number; no: string } }>('POST', '/stok/sepet/stoktan-dus', { cikisNedeni: 'numune' });
    const h = await depo<{ satirlar: { fisId: number | null; fisNo: string | null }[] }>('GET', `/stok/hareketler?malzemeId=${k}&tur=cikis`);
    assert.deepEqual([h.govde.satirlar[0]?.fisId, h.govde.satirlar[0]?.fisNo], [f.govde.fis.id, f.govde.fis.no]);
  });

  test('ST3 birim kartın biriminden gelir; kartta yoksa null, uydurulmaz', async () => {
    const kg = await kart('sarf', 'aktif', 'kg');
    const birimsiz = await kart('sarf');
    assert.equal((await malKabul(kg, '2')).durum, 200);
    assert.equal((await depo<{ ozet: { birim: string | null } }>('GET', `/stok/malzemeler/${kg}/ozet`)).govde.ozet.birim, 'kg');
    assert.equal((await depo<{ ozet: { birim: string | null } }>('GET', `/stok/malzemeler/${birimsiz}/ozet`)).govde.ozet.birim, null);
    assert.equal((await depo<{ satir: { birim: string | null } }>('GET', `/stok/malzemeler/${kg}`)).govde.satir.birim, 'kg');
  });

  test('bütün kartlar (#680): stoğu olmayan kart 0 ile listelenir; stoklu kart sayısıyla gelir; hizmet kartı girmez', async () => {
    const [stoklu, stoksuz, h] = [await kart('sarf'), await kart('hammadde'), await kart('hizmet')];
    assert.equal((await malKabul(stoklu, '3')).durum, 200);
    type Liste = { satirlar: { malzemeId: number; toplam: string }[]; toplam: number | null };
    const bul = async (k: number, kapsam: string) =>
      (await depo<Liste>('GET', `/stok/malzemeler?${kapsam}metin=${encodeURIComponent(kartAdlari.get(k)!)}`)).govde.satirlar.find((x) => x.malzemeId === k);
    assert.equal((await bul(stoksuz, '')), undefined);
    assert.deepEqual(await bul(stoksuz, 'kapsam=kartlar&'), { ...(await bul(stoksuz, 'kapsam=kartlar&')), malzemeId: stoksuz, toplam: '0' });
    assert.equal((await bul(stoklu, 'kapsam=kartlar&'))?.toplam, '3');
    assert.equal(await bul(h, 'kapsam=kartlar&'), undefined);
    const sayfa = await depo<Liste>('GET', '/stok/malzemeler?kapsam=kartlar&sayfaBoyu=2&sayfa=2');
    assert.equal(sayfa.durum, 200, JSON.stringify(sayfa.govde));
    assert.equal(sayfa.govde.satirlar.length <= 2 && (sayfa.govde.toplam ?? 0) >= 2, true);
  });

  test('Y4 adla arama: Malzemeler ve stok içi arama kartın adıyla bulur (malzemeAra); eşleşmeyen ad sonuç uydurmaz', async () => {
    const k = await kart('sarf');
    assert.equal((await malKabul(k, '3')).durum, 200);
    const ad = kartAdlari.get(k)!;
    const liste = await depo<{ satirlar: { malzemeId: number }[] }>('GET', `/stok/malzemeler?metin=${encodeURIComponent(ad)}`);
    assert.deepEqual(liste.govde.satirlar.map((x) => x.malzemeId), [k]);
    const ara = await depo<{ sonuclar: { tur: string; malzemeId?: number }[] }>('GET', `/stok/ara?q=${encodeURIComponent(ad)}`);
    assert.deepEqual(ara.govde.sonuclar.filter((x) => x.tur === 'malzeme').map((x) => x.malzemeId), [k]);
    assert.deepEqual((await depo<{ satirlar: unknown[] }>('GET', '/stok/malzemeler?metin=yok-boyle-ad')).govde.satirlar, []);
    // Hizmet kartı stoklanmaz; mal kabul ve toplama seçicileri bu aramayı kullandığı için önerilmez (adla da numarayla da).
    const h = await kart('hizmet');
    for (const q of [kartAdlari.get(h)!, String(h)]) {
      const r = await depo<{ sonuclar: { tur: string; malzemeId?: number }[] }>('GET', `/stok/ara?q=${encodeURIComponent(q)}`);
      assert.deepEqual(r.govde.sonuclar.filter((x) => x.tur === 'malzeme').map((x) => x.malzemeId), []);
    }
  });

  test('dışa açık stok durumu: toplam, kritik seviye ve durum; ayarsız kart tanımsız, stoksuz kart yok; düşük stok sayısı panelle aynı', async () => {
    const [a, b, yok] = [await kart('sarf'), await kart('sarf'), await kart('sarf')];
    const once = await o().vt.tx((db) => dusukStokSayisi(db));
    await malKabul(a, '3');
    await malKabul(b, '9');
    const ayar = await mudur('POST', `/stok/malzemeler/${a}/ayar-duzenle`, { surum: null, kritikSeviye: '5', varsayilanAmbalaj: null, ambalajlar: [] });
    assert.equal(ayar.durum, 200, JSON.stringify(ayar.govde));
    const d = await o().vt.tx((db) => malzemeStokDurumlari(db, [a, b, yok, a]));
    assert.deepEqual([...d.entries()].sort((x, y) => x[0] - y[0]), [[a, { toplam: '3.000', serbest: '3.000', kritikSeviye: '5.000', durum: 'kritik' }], [b, { toplam: '9.000', serbest: '9.000', kritikSeviye: null, durum: 'tanimsiz' }]]);
    assert.equal(await o().vt.tx((db) => dusukStokSayisi(db)), once + 1);
    const panel = await depo<{ kritik: number }>('GET', '/stok/panel');
    assert.equal(panel.govde.kritik, once + 1);
    assert.equal((await o().vt.tx((db) => malzemeStokDurumlari(db, []))).size, 0);
  });

  test('toplu geri alma: yeniden eskiye tek işlemde, ara bakiye eksiye düşmez; biri reddedilirse hiçbiri yazılmaz; aynı hareket iki kez 400; geri alma yetkisi olmayan 403', async () => {
    const k = await kart('sarf');
    await malKabul(k, '5');
    const zemin = await mudur<{ konum: { id: number } }>('POST', '/stok/konumlar', { tur: 'depo_zemini', kod: 'D-TG1' });
    const t = await depo<{ hareketIdler: number[] }>('POST', '/stok/tasima', { malzemeId: k, kaynakKonumId: await konumId('KABUL'), hedefKonumId: zemin.govde.konum.id, miktar: '5' });
    const c = await depo<{ hareketIdler: number[] }>('POST', '/stok/cikis', { malzemeId: k, konumId: zemin.govde.konum.id, miktar: '2', cikisNedeni: 'numune' });
    const [tasima, cikis] = [t.govde.hareketIdler[0]!, c.govde.hareketIdler[0]!];
    assert.equal((await istek('kalite', 'POST', '/stok/hareketler/geri-al', { hareketIdler: [tasima, cikis] })).durum, 403);
    const cift = await mudur<Hata & { alan?: string }>('POST', '/stok/hareketler/geri-al', { hareketIdler: [cikis, cikis] });
    assert.deepEqual([cift.durum, cift.govde.alan], [400, 'hareketIdler']);
    const tek = await mudur<{ hareketIdler: number[] }>('POST', `/stok/hareketler/${cikis}/geri-al`, {});
    assert.equal(tek.durum, 200, JSON.stringify(tek.govde));
    const c2 = await depo<{ hareketIdler: number[] }>('POST', '/stok/cikis', { malzemeId: k, konumId: zemin.govde.konum.id, miktar: '2', cikisNedeni: 'numune' });
    // Yeni olan (c2) önce geri alınır, sonra eski ve zaten geri alınmış çıkış reddedilir: c2'nin geri alması da yazılmamalı.
    const red = await mudur<Hata>('POST', '/stok/hareketler/geri-al', { hareketIdler: [cikis, c2.govde.hareketIdler[0]] });
    assert.equal(red.durum, 409, JSON.stringify(red.govde));
    assert.equal(await bakiye(k, 'D-TG1'), '3.000', 'reddedilen toplu geri alma yeni çıkışı da geri almadı');
    const r = await mudur<{ hareketIdler: number[]; onayliEksi: boolean }>('POST', '/stok/hareketler/geri-al', { hareketIdler: [tasima, c2.govde.hareketIdler[0]] });
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    assert.equal(r.govde.hareketIdler.length, 2);
    assert.equal(r.govde.onayliEksi, false);
    assert.equal(await bakiye(k, 'D-TG1'), null);
    assert.equal(await bakiye(k, 'KABUL'), '5.000');
  });

  // İş emirli emir fikstürü: uretim-emirleri tablolarına sahip bağlantısıyla yazılır (açma komutu rota ister). Bileşen [iş emri sırası, malzeme, birim miktar].
  async function rotaliEmir(urun: number, adet: number, bilesenler: [number, number, string][]): Promise<number> {
    emirSayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`SIM${emirSayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`SIS${emirSayac}`, `Deneme ${emirSayac}`, im!.id]);
    const tip = await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`ST-${emirSayac}`]);
    const e = await o().sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, malzeme_no, kaynak_rota_revizyonu_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [`P-${emirSayac}`, 'Deneme', adet, ist!.id, kisiler.get('yonetici'), urun, await revizyon(urun)]);
    const isEmirleri = new Map<number, number>();
    for (const [sira, malzeme, miktar] of bilesenler) {
      if (!isEmirleri.has(sira)) {
        isEmirleri.set(sira, (await o().sahip.tek<{ id: number }>('INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [e!.id, sira, sira * 10, tip!.id, `OP ${sira * 10}`]))!.id);
      }
      await o().sahip.sorgu('INSERT INTO uretim_emirleri_is_emri_bileseni (is_emri_id, malzeme_no, miktar) VALUES ($1, $2, $3)', [isEmirleri.get(sira), malzeme, miktar]);
    }
    return e!.id;
  }
  const emriBitir = (e: number, saglam: number) => o().sahip.sorgu("UPDATE uretim_emri SET durum = 'bitti', baslama = now(), bitis = now(), saglam_adet = $2 WHERE id = $1", [e, saglam]);

  test('emir tamamlama: bitmemiş emirde ve eksikte reddeder; kalan sarfı en eski girişten düşer, verilmiş sarfı saymaz, hizmeti düşmez; çıktı emir partisiyle girer; ikinci kez yazmaz', async () => {
    const urun = await kart('mamul');
    const [h, sf, hz] = [await kart('hammadde'), await kart('sarf'), await kart('hizmet')];
    // Brüt: h 4x2 + 4x0.5 = 10 (iki iş emri toplanır), sf 4x0.3333 = 1.3332 yukarı 1.334, hizmet düşülmez.
    const e = await rotaliEmir(urun, 4, [[1, h, '2'], [1, sf, '0.3333'], [1, hz, '1'], [2, h, '0.5']]);
    await malKabul(h, '6', { parti: { dokumNo: 'TM-A' } });
    await malKabul(h, '6', { parti: { dokumNo: 'TM-B' } });
    await malKabul(sf, '1');
    const kabul = await konumId('KABUL');
    const pA = (await o().vt.tek<{ id: number }>("SELECT id FROM stok_parti WHERE malzeme_id = $1 AND dokum_no = 'TM-A'", [h]))!.id;
    assert.equal((await depo('POST', '/stok/cikis', { malzemeId: h, konumId: kabul, partiId: pA, miktar: '3', cikisNedeni: 'uretime_sarf', uretimEmriId: e })).durum, 200);

    const oku = async () => {
      const c = await depo<EmirTamamlamaCevabi>('GET', `/stok/uretim-emirleri/${e}/tamamlama`);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return emirTamamlamaCevabi.parse(c.govde);
    };
    const tamamla = (g: Record<string, unknown> = {}, kim = 'depo') => istek<Hata & { hareketIdler: number[] }>(kim, 'POST', `/stok/uretim-emirleri/${e}/tamamla`, g);
    assert.equal((await oku()).engel, 'Emir bitmedi; stokta tamamlama bitmiş emirde yapılır.');
    assert.equal((await tamamla()).durum, 409);

    await emriBitir(e, 3);
    const eksikli = await oku();
    assert.deepEqual(eksikli.bilesenler.map((b) => [b.malzemeId, b.hizmet, b.brut, b.verilen, b.kalan, b.mevcut, b.eksik]).sort((x, y) => Number(x[0]) - Number(y[0])), [
      [h, false, '10', '3', '7', '9', '0'], [sf, false, '1.334', '0', '1.334', '1', '0.334'], [hz, true, '4', '0', '0', '0', '0'],
    ].sort((x, y) => Number(x[0]) - Number(y[0])));
    assert.equal(eksikli.engel, 'Eksik malzeme var; önce eksikleri teslim alın.');
    const red = await tamamla();
    assert.equal(red.durum, 409);
    assert.equal(await bakiye(h, 'KABUL'), '9.000', 'eksikte hiçbir şey yazılmadı');

    await malKabul(sf, '1');
    const hazir = await oku();
    assert.deepEqual([hazir.engel, hazir.cikti], [null, { girilen: '0', kalan: '3' }], 'çıktı sağlam adetle (adet 4, sağlam 3)');
    assert.equal((await tamamla({}, 'kalite')).durum, 403);
    const asim = await tamamla({ miktar: '5' });
    assert.deepEqual([asim.durum, asim.govde.ayrinti?.alan ?? (asim.govde as { alan?: string }).alan], [400, 'miktar']);

    const ok = await tamamla();
    assert.equal(ok.durum, 200, JSON.stringify(ok.govde));
    assert.equal(ok.govde.hareketIdler.length, 5, 'iki parti h, iki lot sf, bir üretim girişi');
    assert.equal(await bakiye(h, 'KABUL'), '2.000');
    assert.equal(await bakiye(sf, 'KABUL'), '0.666');
    assert.equal(await bakiye(urun, 'URETIM'), '3.000');
    const partiler = await o().vt.tx((db) => emrinPartileri(db, e));
    assert.deepEqual(partiler.filter((x) => x.malzemeId === h).map((x) => [x.dokumNo, x.miktar]), [['TM-A', '6.000'], ['TM-B', '4.000']], 'en eski parti önce bitti');
    assert.equal((await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM stok_parti WHERE malzeme_id = $1 AND uretim_emri_id = $2', [urun, e]))!.n, 1);

    // Sağlam 3, adet 4: fireli emir kapanmıştır, fire adedi ikinci çağrıda girmez.
    const sonra = await oku();
    assert.deepEqual([sonra.engel, sonra.cikti, sonra.bilesenler.every((b) => b.kalan === '0')], ['Bu emir stokta zaten tamamlandı.', { girilen: '3', kalan: '0' }, true]);
    const bitti = await tamamla();
    assert.deepEqual([bitti.durum, bitti.govde.mesaj], [409, 'Bu emir stokta zaten tamamlandı.']);
    assert.equal(await bakiye(urun, 'URETIM'), '3.000');

    // Üretim girişi geri alınınca girilen düşer ve çıktı yeniden girilebilir.
    const giris = ok.govde.hareketIdler.at(-1)!;
    assert.equal((await mudur('POST', `/stok/hareketler/${giris}/geri-al`, {})).durum, 200);
    assert.deepEqual([(await oku()).engel, (await oku()).cikti], [null, { girilen: '0', kalan: '3' }]);
    assert.equal((await tamamla({ miktar: '2' })).durum, 200, 'sağlam adetten az girilebilir');
    assert.equal(await bakiye(urun, 'URETIM'), '2.000');
    assert.equal((await tamamla()).durum, 200, 'kalan sağlam adet girer');
    assert.equal(await bakiye(urun, 'URETIM'), '3.000');
  });

  test('Reçete ve Rota komutları (#1186): emir tamamlama ve sayım köprü tablosuyla stoğa yazar, hareket bağlı durumda işaretli görünür; yetkisiz ve geçersiz girdi reddedilir', async () => {
    const urun = await kart('mamul');
    const h = await kart('hammadde');
    const e = await rotaliEmir(urun, 4, [[1, h, '2']]);
    await malKabul(h, '20');
    const kabul = await konumId('KABUL');
    // Köprü ve bu test aynı tabloyu ve istek kurucusunu kullanır.
    const komut = (ad: string, girdi: Record<string, unknown>, kim = 'depo') => {
      const istegi = komutIstegi(PLAN_STOK_KOMUTLARI[ad]!, girdi);
      assert.equal(istegi.tekrarKorumali, true);
      return istek<Hata & { hareketIdler?: number[] }>(kim, 'POST', istegi.yol, istegi.govde);
    };
    const hareketler = async (malzemeId: number) => {
      const d = await istek<DurumCevabi>('mudur', 'GET', '/recete-rota/durum');
      assert.equal(d.durum, 200, JSON.stringify(d.govde));
      return d.govde.moves!.filter((m) => m.itemId === String(malzemeId)).map((m) => [m.qty, m.note, m.status]);
    };
    assert.deepEqual(await hareketler(urun), [], 'tamamlanmadan üretim girişi yok');

    // Emir bitmeden tamamlama sahibinin kuralıyla reddedilir; köprü ayrıca kurallamaz.
    assert.equal((await komut('stok-emir-tamamla', { id: e })).durum, 409);
    await emriBitir(e, 4);
    assert.equal((await komut('stok-emir-tamamla', { id: e }, 'kalite')).durum, 403, 'stok giriş yetkisi ister');
    assert.throws(() => komut('stok-emir-tamamla', { id: 'abc' }), /Geçersiz id/);
    assert.throws(() => komut('stok-emir-tamamla', { id: 0 }), /Geçersiz id/);
    const ok = await komut('stok-emir-tamamla', { id: e, aciklama: 'Reçete ve Rota', sinsi: 'gecmemeli' });
    assert.equal(ok.durum, 200, JSON.stringify(ok.govde));
    assert.equal(await bakiye(urun, 'URETIM'), '4.000');
    assert.equal(await bakiye(h, 'KABUL'), '12.000');
    assert.deepEqual(await hareketler(urun), [[4, `Üretim girişi (emir ${String(e)})`, '']]);
    assert.deepEqual(await hareketler(h), [[20, 'Mal kabul girişi', ''], [-8, `Üretime sarf (emir ${String(e)}): Reçete ve Rota`, '']]);

    // Sayım düzeltmesi: eksik sayım eksi hareket olur.
    const bak = (await o().vt.tek<{ parti: number | null }>('SELECT parti_id AS parti FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2', [h, kabul]))!;
    const sayimGirdisi = { konumId: kabul, satirlar: [{ malzemeId: h, partiId: bak.parti, beklenenMiktar: '12', sayilanMiktar: '10' }] };
    assert.equal((await komut('stok-sayim', sayimGirdisi, 'mudur')).durum, 200);
    assert.equal(await bakiye(h, 'KABUL'), '10.000');
    assert.deepEqual((await hareketler(h)).at(-1), [-2, 'Sayım düzeltmesi', '']);
    assert.equal((await komut('stok-sayim', { ...sayimGirdisi, satirlar: [] }, 'depo')).durum, 200, 'boş sayım hareket yazmaz');
    assert.equal((await hareketler(h)).length, 3);

    // Üretim girişi: emrin çıktısından bir kısmı girer.
    const e2 = await rotaliEmir(urun, 5, [[1, h, '1']]);
    assert.equal((await komut('stok-uretim-girisi', { uretimEmriId: e2, malzemeId: urun, miktar: '2' })).durum, 200);
    assert.equal((await hareketler(urun)).at(-1)?.[0], 2);

    // Oturumsuz istek durumu okuyamaz.
    const yetkisiz = await istek<DurumCevabi>(null, 'GET', '/recete-rota/durum');
    assert.equal(yetkisiz.durum, 401);
  });

  test('emir tamamlama sıfır miktarla: yalnız kalan sarfı yazar; hepsi fire olan emir sonra tamamlanmış sayılır; yapılacak sarf yoksa 409', async () => {
    const urun = await kart('mamul');
    const h = await kart('sarf');
    await malKabul(h, '10');
    const e = await rotaliEmir(urun, 4, [[1, h, '2']]);
    await emriBitir(e, 3);
    assert.equal((await depo('POST', '/stok/uretim-girisi', { uretimEmriId: e, malzemeId: urun, miktar: '3' })).durum, 200);
    const tamamla = (g: Record<string, unknown>) => depo<Hata & { hareketIdler: number[] }>('POST', `/stok/uretim-emirleri/${e}/tamamla`, g);
    // Hepsi fire: sağlam 0; sıfırla yalnız sarf yazılır, sonra emir tamamlanmış sayılır, miktarsız çağrı da çıktı girmez.
    const urunF = await kart('mamul');
    const fire = await rotaliEmir(urunF, 2, [[1, h, '1']]);
    await emriBitir(fire, 0);
    const tamamlaF = (g: Record<string, unknown>) => depo<Hata>('POST', `/stok/uretim-emirleri/${fire}/tamamla`, g);
    assert.equal((await tamamlaF({ miktar: '0' })).durum, 200);
    assert.equal(await bakiye(h, 'KABUL'), '8.000');
    assert.equal((await tamamlaF({})).durum, 409);
    assert.equal(await bakiye(urunF, 'URETIM'), null);
    const ok = await tamamla({ miktar: '0.000' });
    assert.equal(ok.durum, 200, JSON.stringify(ok.govde));
    assert.equal(ok.govde.hareketIdler.length, 1, 'yalnız sarf');
    assert.equal(await bakiye(h, 'KABUL'), null, 'kalan sarf 8 düşüldü');
    assert.equal(await bakiye(urun, 'URETIM'), '3.000', 'çıktı girmedi');
    assert.equal((await tamamla({ miktar: '0' })).durum, 409);
  });

  test('emir tamamlama eşzamanlı: aynı emri iki kişi aynı anda tamamlarsa biri yazar, öteki yeniden hesaplayıp reddedilir', async () => {
    const urun = await kart('mamul');
    const h = await kart('sarf');
    await malKabul(h, '50');
    const e = await rotaliEmir(urun, 2, [[1, h, '3']]);
    await emriBitir(e, 2);
    const [a, b] = await Promise.all([depo<Hata>('POST', `/stok/uretim-emirleri/${e}/tamamla`, {}), mudur<Hata>('POST', `/stok/uretim-emirleri/${e}/tamamla`, {})]);
    assert.deepEqual([a.durum, b.durum].sort(), [200, 409], JSON.stringify([a.govde, b.govde]));
    assert.equal(await bakiye(h, 'KABUL'), '44.000');
    assert.equal(await bakiye(urun, 'URETIM'), '2.000');
  });

  test('emir tamamlama DEP-36: kapsam dışındaki emir 403 ve hiçbir şey yazmaz', async () => {
    const urun = await kart('mamul');
    const h = await kart('sarf');
    await malKabul(h, '5');
    const e = await rotaliEmir(urun, 1, [[1, h, '1']]);
    await emriBitir(e, 1);
    const baska = await o().sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('SIM-KAPSAM', 'Başka merkez') RETURNING id");
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisiler.get('depo_kisitli'), baska!.id]);
    const red = await istek<Hata>('depo_kisitli', 'POST', `/stok/uretim-emirleri/${e}/tamamla`, {});
    assert.equal(red.durum, 403, JSON.stringify(red.govde));
    assert.equal(await bakiye(h, 'KABUL'), '5.000');
    assert.equal(await bakiye(urun, 'URETIM'), null);
  });

  test('emir tamamlama tek işlemdir: çıktı yazılamazsa sarf da yazılmaz; çıkış yetkisi olmayan 403; olmayan emir 404', async () => {
    const yanlis = await kart('hammadde');
    const h = await kart('sarf');
    await malKabul(h, '5');
    const e = await rotaliEmir(yanlis, 2, [[1, h, '1']]);
    await emriBitir(e, 2);
    const red = await depo<Hata>('POST', `/stok/uretim-emirleri/${e}/tamamla`, {});
    assert.equal(red.durum, 400, JSON.stringify(red.govde));
    assert.equal(await bakiye(h, 'KABUL'), '5.000', 'sarf geri alındı');
    assert.deepEqual(await o().vt.tx((db) => emrinPartileri(db, e)), []);

    const rol = await o().sahip.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('stok_giris_deneme', 'Deneme giriş') RETURNING id");
    await o().sahip.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'stok.giris')", [rol!.id]);
    await kisiEkle('girisci', 'stok_giris_deneme');
    const urun = await kart('mamul');
    const e2 = await rotaliEmir(urun, 1, [[1, h, '1']]);
    await emriBitir(e2, 1);
    const yetkisiz = await istek<Hata>('girisci', 'POST', `/stok/uretim-emirleri/${e2}/tamamla`, {});
    assert.equal(yetkisiz.durum, 403, JSON.stringify(yetkisiz.govde));
    assert.equal((await depo('GET', '/stok/uretim-emirleri/2147483000/tamamlama')).durum, 404);
  });

  test('stokYokIstekleri: yalnız stok_yok istekleri en eski önce döner; malzemeIstekleri onu yine acik gösterir', async () => {
    const stoklu = await kart('hammadde');
    const bos = await kart('hammadde', 'aktif', 'kg');
    await malKabul(stoklu, '10');
    const e = await emir();
    const istasyonId = (await o().sahip.tek<{ id: number }>('SELECT istasyon_id AS id FROM uretim_emri WHERE id = $1', [e]))!.id;
    const op: Kullanici = { id: kisiler.get('operator')!, ad: 'Deneme operator', islemler: ['terminal.uret'] };
    const ac = (g: Partial<MalzemeIstegiAcGirdisi>) => o().vt.tx((db) => malzemeIstegiAc(db, op, { malzemeId: stoklu, miktar: '2', istasyonId, uretimEmriId: e, not: null, kaynakKimligi: 'arkon:syi:0', ...g }));
    const acik = await ac({ kaynakKimligi: 'arkon:syi:acik' });
    const yok1 = await ac({ kaynakKimligi: 'arkon:syi:yok1', malzemeId: bos, miktar: '3' });
    const yok2 = await ac({ kaynakKimligi: 'arkon:syi:yok2', malzemeId: bos, miktar: '1.5', uretimEmriId: null });
    assert.equal(acik.durum, 'acik');
    assert.equal(yok1.durum, 'stok_yok');
    const liste = await o().vt.tx((db) => stokYokIstekleri(db));
    assert.deepEqual(liste.map((i) => i.id), [yok1.id, yok2.id], 'yalnız stok_yok, en eski önce');
    assert.deepEqual(liste.map((i) => [i.no, i.malzemeId, i.birim, i.uretimEmriId, i.istasyonId]), [[yok1.no, bos, 'kg', e, istasyonId], [yok2.no, bos, 'kg', null, istasyonId]]);
    assert.equal(liste[0]!.miktar, '3.000');
    assert.match(liste[0]!.acilma, /^\d{4}-\d\d-\d\dT.*(Z|[+-]\d\d:?\d\d)$/);
    assert.match(liste[0]!.guncelleme, /^\d{4}-\d\d-\d\dT/);
    assert.equal((await o().vt.tx((db) => stokYokIstekleri(db, 1))).length, 1);
    assert.equal((await o().vt.tx((db) => stokYokIstekleri(db, 0))).length, 1, 'sınır en az 1');
    const durumlar = await o().vt.tx((db) => malzemeIstekleri(db, ['arkon:syi:yok1', 'arkon:syi:acik']));
    assert.equal(durumlar.get('arkon:syi:yok1')!.durum, 'acik', 'stok_yok dışarıya acik görünür');
    assert.equal(durumlar.get('arkon:syi:acik')!.durum, 'acik');
  });

  test('malzeme isteği: üretim disari ile açar, aynı kaynak kimliği tek kayıt; depo hazırlar ve teslim eder; kapanan değişmez', async () => {
    const h = await kart('hammadde');
    // Depoda stok var: istek açık açılır (stok yoksa "stok yok", STK-T1; teslim.test.ts).
    await malKabul(h, '10');
    const e = await emir();
    const istasyonId = (await o().sahip.tek<{ id: number }>('SELECT istasyon_id AS id FROM uretim_emri WHERE id = $1', [e]))!.id;
    const op: Kullanici = { id: kisiler.get('operator')!, ad: 'Deneme operator', islemler: ['terminal.uret'] };
    const ac = (k: Kullanici, g: Partial<MalzemeIstegiAcGirdisi> = {}) =>
      o().vt.tx((db) => malzemeIstegiAc(db, k, { malzemeId: h, miktar: '2', istasyonId, uretimEmriId: e, not: 'acil', kaynakKimligi: 'arkon:logi:1', ...g }));
    const ilk = await ac(op);
    assert.equal(ilk.durum, 'acik');
    assert.match(ilk.no, /^MI-\d{6}$/);
    assert.deepEqual(await ac(op, { miktar: '9' }), ilk, 'aynı kaynak ilk kaydı döner');
    // Eşzamanlı: ilk işlem kaydı tutarken ikinci yazmada bekler; ilk bitince ikinci aynı kaydı döner.
    let birak!: () => void;
    const tutuluyor = new Promise<void>((r) => { birak = r; });
    const ilkCagri = o().vt.tx(async (db) => {
      const r = await malzemeIstegiAc(db, op, { malzemeId: h, miktar: '2', istasyonId, uretimEmriId: null, not: null, kaynakKimligi: 'arkon:logi:2' });
      await tutuluyor;
      return r;
    });
    await new Promise((r) => setTimeout(r, 50));
    const ikinciCagri = ac(op, { kaynakKimligi: 'arkon:logi:2' });
    for (let i = 0; i < 100; i += 1) {
      const bekleyen = await o().sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'INSERT INTO stok_malzeme_istegi%'");
      if (bekleyen!.n > 0) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    birak();
    const [x, y] = await Promise.all([ilkCagri, ikinciCagri]);
    assert.equal(x.id, y.id, 'eşzamanlı iki çağrı tek istek');
    assert.equal((await o().vt.tek<{ n: number }>("SELECT count(*)::int AS n FROM stok_malzeme_istegi WHERE kaynak_kimligi IN ('arkon:logi:1', 'arkon:logi:2')"))!.n, 2);

    // Ret: işlemsiz, hizmet kartı, olmayan istasyon, olmayan emir, sıfır miktar, kapsam dışı istasyon; hiçbiri satır yazmaz.
    await assert.rejects(ac({ ...op, islemler: [] }, { kaynakKimligi: 'arkon:logi:3' }), { kod: 'YETKI_YOK' });
    await assert.rejects(ac(op, { kaynakKimligi: 'arkon:logi:3', malzemeId: await kart('hizmet') }), { kod: 'DOGRULAMA', alan: 'malzemeId' });
    await assert.rejects(ac(op, { kaynakKimligi: 'arkon:logi:3', istasyonId: 2147483000 }), { kod: 'DOGRULAMA', alan: 'istasyonId' });
    await assert.rejects(ac(op, { kaynakKimligi: 'arkon:logi:3', uretimEmriId: 2147483000 }), { kod: 'DOGRULAMA', alan: 'uretimEmriId' });
    await assert.rejects(ac(op, { kaynakKimligi: 'arkon:logi:3', miktar: '0' }), { kod: 'DOGRULAMA', alan: 'miktar' });
    await assert.rejects(ac(op, { kaynakKimligi: 'arkon:logi:3', malzemeId: await kart('hammadde', 'taslak') }), { kod: 'GECERSIZ' });
    const pasif = await emir();
    await o().sahip.sorgu('UPDATE istasyon SET aktif = false WHERE id = (SELECT istasyon_id FROM uretim_emri WHERE id = $1)', [pasif]);
    const pasifIstasyon = (await o().sahip.tek<{ id: number }>('SELECT istasyon_id AS id FROM uretim_emri WHERE id = $1', [pasif]))!.id;
    await assert.rejects(ac(op, { kaynakKimligi: 'arkon:logi:3', istasyonId: pasifIstasyon }), { kod: 'DOGRULAMA', alan: 'istasyonId' });
    const icerde = await emir();
    const im = (await o().sahip.tek<{ id: number }>('SELECT i.is_merkezi_id AS id FROM uretim_emri u JOIN istasyon i ON i.id = u.istasyon_id WHERE u.id = $1', [icerde]))!.id;
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [kisiler.get('depo_kisitli'), im]);
    const kisitli: Kullanici = { ...op, id: kisiler.get('depo_kisitli')! };
    await assert.rejects(ac(kisitli, { kaynakKimligi: 'arkon:logi:3' }), { kod: 'YETKI_YOK' });
    // Kaynak kimliğini bilen kapsam dışı kişi var olan kaydı da okuyamaz.
    await assert.rejects(ac(kisitli), { kod: 'YETKI_YOK' });
    assert.equal((await o().vt.tek("SELECT 1 FROM stok_malzeme_istegi WHERE kaynak_kimligi = 'arkon:logi:3'")), null);
    const icerdeIstasyon = (await o().sahip.tek<{ id: number }>('SELECT istasyon_id AS id FROM uretim_emri WHERE id = $1', [icerde]))!.id;
    assert.equal((await ac(kisitli, { kaynakKimligi: 'arkon:logi:4', istasyonId: icerdeIstasyon, uretimEmriId: icerde })).durum, 'acik', 'kapsamdaki istasyon kabul');

    const durumlar = () => o().vt.tx((db) => malzemeIstekleri(db, ['arkon:logi:1', 'arkon:logi:yok']));
    const once = await durumlar();
    assert.deepEqual([...once.keys()], ['arkon:logi:1']);
    assert.equal(once.get('arkon:logi:1')!.karsilanan, null);

    const liste = await depo<MalzemeIstekleriCevabi>('GET', '/stok/malzeme-istekleri?durum=acik');
    assert.equal(liste.durum, 200);
    const satir = malzemeIstekleriCevabi.parse(liste.govde).satirlar.find((i) => i.id === ilk.id)!;
    assert.equal(satir.malzemeAd, kartAdlari.get(h));
    assert.equal(satir.aciklama, 'acil');
    assert.equal(satir.kisiAd, 'Deneme operator');
    const yol = `/stok/malzeme-istekleri/${ilk.id}`;
    assert.equal((await istek('operator', 'POST', `${yol}/hazirla`, { surum: satir.surum })).durum, 403);
    const hazir = await depo<MalzemeIstegiCevabi>('POST', `${yol}/hazirla`, { surum: satir.surum });
    assert.equal(hazir.govde.istek.durum, 'hazirlaniyor');
    assert.equal((await depo<Hata>('POST', `${yol}/hazirla`, { surum: hazir.govde.istek.surum })).durum, 409);
    const eski = await depo<Hata>('POST', `${yol}/teslim-et`, { surum: satir.surum, karsilanan: '2' });
    assert.equal(eski.durum, 409, 'eski sürüm');
    const teslim = await depo<MalzemeIstegiCevabi>('POST', `${yol}/teslim-et`, { surum: hazir.govde.istek.surum, karsilanan: '2.5' });
    assert.equal(teslim.durum, 200, JSON.stringify(teslim.govde));
    malzemeIstegiCevabi.parse(teslim.govde);
    assert.equal(teslim.govde.istek.karsilanan, '2.500');
    assert.equal(teslim.govde.istek.kapatanKisiAd, 'Deneme depo');
    assert.equal((await depo<Hata>('POST', `${yol}/iptal-et`, { surum: teslim.govde.istek.surum })).durum, 409);
    const sonra = (await durumlar()).get('arkon:logi:1')!;
    assert.equal(sonra.durum, 'teslim');
    assert.equal(sonra.karsilanan, '2.500');
    // İptal açık istekte olur; olmayan istek 404.
    const iptal = await depo<MalzemeIstegiCevabi>('POST', `/stok/malzeme-istekleri/${x.id}/iptal-et`, { surum: 1 });
    assert.equal(iptal.govde.istek.durum, 'iptal');
    assert.equal(iptal.govde.istek.karsilanan, null);
    assert.equal((await depo('POST', '/stok/malzeme-istekleri/2147483000/hazirla', { surum: 1 })).durum, 404);
  });

  test('stok özeti (rol panosu): her sayı kendi işlemiyle; yetkisize null; eksik emir ve açık istek sayılır', async () => {
    const ozet = async (kim: string) => {
      const c = await istek<StokOzetiCevabi>(kim, 'GET', '/stok/ozet');
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return stokOzetiCevabi.parse(c.govde);
    };
    assert.equal((await istek(null, 'GET', '/stok/ozet')).durum, 401);
    assert.deepEqual(await ozet('operator'), { acikIstek: null, dusukStok: null, sayimBekleyen: null, eksikEmir: null });
    const satinAlma = await ozet('satin_alma');
    assert.equal(satinAlma.acikIstek, null);
    assert.equal(satinAlma.sayimBekleyen, null);
    assert.equal(typeof satinAlma.dusukStok, 'number');
    const once = await ozet('depo');
    assert.equal(once.dusukStok, await o().vt.tx((db) => dusukStokSayisi(db)));

    // Eksik emir: kalan sarfı stokla karşılanmayan açık emir sayılır; stok gelince düşer.
    const urun = await kart('mamul');
    const h = await kart('sarf');
    await rotaliEmir(urun, 2, [[1, h, '3']]);
    assert.equal((await ozet('depo')).eksikEmir, once.eksikEmir! + 1);
    await malKabul(h, '6');
    assert.equal((await ozet('depo')).eksikEmir, once.eksikEmir);
    // Her emir stoğu tek başına görür: aynı 6'yı bekleyen ikinci emir de karşılanmış sayılır; 9 bekleyen sayılır.
    await rotaliEmir(urun, 2, [[1, h, '3']]);
    assert.equal((await ozet('depo')).eksikEmir, once.eksikEmir, 'ortak stok bir emirden düşülmez');
    await rotaliEmir(urun, 3, [[1, h, '3']]);
    assert.equal((await ozet('depo')).eksikEmir, once.eksikEmir! + 1);
    // Emre verilmiş sarf kalan ihtiyaçtan düşer: 6 isteyen emre 3 verildi, kalan 3 stoktaki 3 ile karşılanır.
    const h2 = await kart('sarf');
    const kismi = await rotaliEmir(urun, 2, [[1, h2, '3']]);
    await malKabul(h2, '6');
    assert.equal((await depo('POST', '/stok/cikis', { malzemeId: h2, konumId: await konumId('KABUL'), miktar: '3', cikisNedeni: 'uretime_sarf', uretimEmriId: kismi })).durum, 200);
    assert.equal((await ozet('depo')).eksikEmir, once.eksikEmir! + 1, 'kısmen sarf edilmiş emir eksik sayılmaz');
    // Sayı, her açık emrin tamamlama önizlemesiyle aynıdır (veritabanındaki bütün emirler: bölünmüş, fasonlu, kısmen sarf edilmiş).
    const acik = (await o().vt.tx((db) => acikEmirler(db))).map((x) => x.id);
    let eksikli = 0;
    for (const id of acik) {
      const t = await istek<EmirTamamlamaCevabi>('depo', 'GET', `/stok/uretim-emirleri/${id}/tamamlama`);
      if (t.durum === 200 && t.govde.bilesenler.some((b) => Number(b.eksik) > 0)) eksikli += 1;
    }
    assert.ok(acik.length >= 3, 'karşılaştırmada birden çok açık emir var');
    assert.equal((await ozet('depo')).eksikEmir, eksikli, 'tamamlama önizlemesiyle aynı sayı');

    // Açık istek: açık ve hazırlanan sayılır, teslim ve iptal sayılmaz.
    const istasyonId = (await o().sahip.tek<{ id: number }>('SELECT id FROM istasyon ORDER BY id DESC LIMIT 1'))!.id;
    const op: Kullanici = { id: kisiler.get('operator')!, ad: 'Deneme operator', islemler: ['terminal.uret'] };
    const yeni = await o().vt.tx((db) => malzemeIstegiAc(db, op, { malzemeId: h, miktar: '1', istasyonId, uretimEmriId: null, not: null, kaynakKimligi: 'arkon:logi:ozet' }));
    assert.equal((await ozet('depo')).acikIstek, once.acikIstek! + 1);
    assert.equal((await depo('POST', `/stok/malzeme-istekleri/${yeni.id}/iptal-et`, { surum: 1 })).durum, 200);
    assert.equal((await ozet('depo')).acikIstek, once.acikIstek);
  });

  test('Fabrika Haritası eşlemesi (#686, #711): yalnız depo seçilen bölümün gözü ve stok alanı konum olur; adres değişince kod izler, silinen göz kapanır; stoklu bölüm depodan çıkmaz', async () => {
    const vt = o().vt;
    const salon = await vt.tek<{ id: number }>(
      "INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, kaydeden_kisi_id) VALUES ('HB-1', 'Harita bölümü', 20, 20, 4, $1) RETURNING id", [kisiler.get('yonetici')]);
    const raf = await vt.tek<{ id: number }>(
      `INSERT INTO atolye_raf (salon_id, kod, ad, tur, bolme_sayisi, kat_sayisi, goz_sayisi, bolme_genisligi, derinlik, yukseklik, x, z, donus)
       VALUES ($1, 'H1', 'Harita rafı', 'palet', 2, 1, 1, 2, 1, 2, 5, 5, 0) RETURNING id`, [salon!.id]);
    await vt.sorgu('INSERT INTO atolye_goz (raf_id, bolme, kat, goz) VALUES ($1, 1, 1, 1), ($1, 2, 1, 1)', [raf!.id]);
    const alan = (tur: string, ad: string) => vt.tek<{ id: number }>(
      'INSERT INTO atolye_alan (salon_id, tur, ad, x, z, donus, genislik, derinlik) VALUES ($1, $2, $3, 2, 2, 0, 2, 2) RETURNING id', [salon!.id, tur, ad]);
    const kabul = await alan('kabul', 'Harita kabul');
    await alan('yuruyus_yolu', 'Stoka ilgisiz yol');

    assert.equal((await istek('kalite', 'POST', '/stok/konumlar/haritadan-esle')).durum, 403);
    // Depo seçilmemiş bölüm (üretim salonu gibi) eşlenmez; özette depo kodu boş görünür.
    assert.deepEqual((await mudur('POST', '/stok/konumlar/haritadan-esle')).govde, { eklenen: 0, guncellenen: 0, kapatilan: 0, atlanan: [], koduDegisenler: [] });
    const ozet = await mudur<HaritaOzetiCevabi>('GET', '/stok/harita-ozeti');
    haritaOzetiCevabi.parse(ozet.govde);
    assert.deepEqual(ozet.govde.bolumler.find((b) => b.salonId === salon!.id), { salonId: salon!.id, kod: 'HB-1', gozSayisi: 2, depoKod: null });
    assert.equal((await istek('kalite', 'POST', `/stok/harita-bolumleri/${salon!.id}/depo`, { depo: true })).durum, 403);
    const yap = await mudur<HaritaOzetiCevabi>('POST', `/stok/harita-bolumleri/${salon!.id}/depo`, { depo: true });
    assert.equal(yap.durum, 200, JSON.stringify(yap.govde));
    assert.equal(yap.govde.bolumler.find((b) => b.salonId === salon!.id)?.depoKod, 'HB1');
    const konumlar = () => vt.sorgu<{ kod: string; tur: string; aktif: boolean; depoKod: string; alanId: number | null }>(
      `SELECT k.kod, k.tur, k.aktif, d.kod AS "depoKod", k.atolye_alan_id AS "alanId" FROM stok_konum k JOIN stok_depo d ON d.id = k.depo_id
        WHERE d.atolye_salon_id = $1 ORDER BY k.kod`, [salon!.id]);
    assert.deepEqual(await konumlar(), [
      { kod: `ALAN-${kabul!.id}`, tur: 'kabul', aktif: true, depoKod: 'HB1', alanId: kabul!.id },
      { kod: 'H1-01-1-1', tur: 'raf_gozu', aktif: true, depoKod: 'HB1', alanId: null },
      { kod: 'H1-02-1-1', tur: 'raf_gozu', aktif: true, depoKod: 'HB1', alanId: null },
    ]);
    assert.deepEqual((await mudur('POST', '/stok/konumlar/haritadan-esle')).govde, { eklenen: 0, guncellenen: 0, kapatilan: 0, atlanan: [], koduDegisenler: [] });

    // Stoklu göz haritada silinebilir (kullanıcı kararı 12.10, #711): konum bağsız kalır, eşleme kapatmaz, özette listelenir.
    const gozIdleri = (await vt.sorgu<{ id: number }>('SELECT id FROM atolye_goz WHERE raf_id = $1 ORDER BY bolme', [raf!.id])).map((g) => g.id);
    const m = await kart('sarf');
    await malKabul(m, '2');
    const ilkGoz = await vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'H1-01-1-1'");
    assert.equal((await depo('POST', '/stok/tasima', { malzemeId: m, kaynakKonumId: await konumId('KABUL'), hedefKonumId: ilkGoz!.id, miktar: '2' })).durum, 200);
    // KD-042: pasif rafın stoklu gözü eşlemeyi düşürmez; açık kalır ve bildirilir, stoksuz göz kapanır.
    await vt.sorgu('UPDATE atolye_raf SET aktif = false WHERE id = $1', [raf!.id]);
    assert.deepEqual((await mudur('POST', '/stok/konumlar/haritadan-esle')).govde, { eklenen: 0, guncellenen: 1, kapatilan: 0, atlanan: ['H1-01-1-1'], koduDegisenler: [] });
    await vt.sorgu('UPDATE atolye_raf SET aktif = true WHERE id = $1', [raf!.id]);
    assert.deepEqual((await mudur('POST', '/stok/konumlar/haritadan-esle')).govde, { eklenen: 0, guncellenen: 1, kapatilan: 0, atlanan: [], koduDegisenler: [] });
    await vt.sorgu("UPDATE atolye_raf SET kod = 'H2' WHERE id = $1", [raf!.id]);
    await vt.sorgu('DELETE FROM atolye_goz WHERE raf_id = $1 AND bolme = 2', [raf!.id]);
    // 94 a: raf kodu haritada değişince açık kalan gözün eski etiketi okunmaz; eşleme yeniden basılacakları döner.
    assert.deepEqual((await mudur('POST', '/stok/konumlar/haritadan-esle')).govde, {
      eklenen: 0, guncellenen: 1, kapatilan: 1, atlanan: [],
      koduDegisenler: [{ konumId: ilkGoz!.id, eskiKod: 'H1-01-1-1', yeniKod: 'H2-01-1-1', tur: 'raf_gozu', ad: null, bolmeNo: 1, katNo: 1 }],
    });
    assert.deepEqual((await konumlar()).map((k) => [k.kod, k.aktif]), [[`ALAN-${kabul!.id}`, true], ['H1-02-1-1', false], ['H2-01-1-1', true]]);

    const ayrinti = await mudur<KonumAyrintiCevabi>('GET', `/stok/konumlar/${ilkGoz!.id}`);
    assert.deepEqual([ayrinti.govde.haritaYeri, ayrinti.govde.konum.haritaGozId], ['H2-01-1-1', gozIdleri[0]]);
    const gs = await depo<GozStoklariCevabi>('GET', `/stok/goz-stoklari?gozIdler=${gozIdleri.join(',')}`);
    gozStoklariCevabi.parse(gs.govde);
    assert.deepEqual(gs.govde.gozler.map((g) => [g.gozId, g.konumId, g.kalemSayisi, typeof g.ilkMalzemeAd]), [[gozIdleri[0], ilkGoz!.id, 1, 'string']]);
    assert.equal((await depo('GET', '/stok/goz-stoklari?gozIdler=1,x')).durum, 400);

    // Stoklu bölüm depodan çıkmaz; stok taşınınca çıkar, konumları kapanır, bağsız konum listesine düşmez.
    assert.equal((await mudur('POST', `/stok/harita-bolumleri/${salon!.id}/depo`, { depo: false })).durum, 409);
    assert.equal((await depo('POST', '/stok/tasima', { malzemeId: m, kaynakKonumId: ilkGoz!.id, hedefKonumId: await konumId('KABUL'), miktar: '2' })).durum, 200);
    const cikar = await mudur<HaritaOzetiCevabi>('POST', `/stok/harita-bolumleri/${salon!.id}/depo`, { depo: false });
    assert.equal(cikar.durum, 200, JSON.stringify(cikar.govde));
    assert.equal(cikar.govde.bolumler.find((b) => b.salonId === salon!.id)?.depoKod, null);
    assert.deepEqual((await konumlar()).filter((k) => k.aktif), []);

    const depoId = (await vt.tek<{ id: number }>('SELECT id FROM stok_depo WHERE atolye_salon_id = $1', [salon!.id]))!.id;
    const goz = (await vt.tek<{ id: number }>('SELECT id FROM atolye_goz WHERE raf_id = $1', [raf!.id]))!.id;
    await assert.rejects(vt.sorgu("INSERT INTO stok_konum (depo_id, kod, tur, atolye_goz_id) VALUES ($1, 'YANLIS-1', 'kabul', $2)", [depoId, goz]), /stok_konum_tur_alanlari/);
    await assert.rejects(vt.sorgu("INSERT INTO stok_konum (depo_id, kod, tur, bolme_no, kat_no, atolye_alan_id) VALUES ($1, 'YANLIS-2', 'raf_gozu', 1, 1, $2)", [depoId, kabul!.id]), /stok_konum_alan_turu/);
    await assert.rejects(vt.sorgu("INSERT INTO stok_konum (depo_id, kod, tur, atolye_goz_id) VALUES ($1, 'YANLIS-3', 'raf_gozu', $2)", [depoId, goz]), /stok_konum_tur_alanlari/);
  });

  test('karar 108 a: karantina ve sevkiyat kutusundaki stok çıkış önerisine ve serbest toplama girmez; ara alandaki girer', async () => {
    const vt = o().vt;
    const salon = await vt.tek<{ id: number }>(
      "INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, fabrika_x, fabrika_z, kaydeden_kisi_id) VALUES ('KR-1', 'Kalite', 20, 20, 4, 600, 600, $1) RETURNING id", [kisiler.get('yonetici')]);
    const alan = async (tur: string, x: number) => (await vt.tek<{ id: number }>(
      'INSERT INTO atolye_alan (salon_id, tur, ad, x, z, donus, genislik, derinlik) VALUES ($1, $2, $2, $3, 2, 0, 2, 2) RETURNING id', [salon!.id, tur, x]))!.id;
    const karantina = await alan('karantina', 2), sevkiyat = await alan('sevkiyat', 6), bekleme = await alan('ara_alan', 10);
    assert.equal((await mudur('POST', '/stok/konumlar/haritadan-esle')).durum, 200);
    const konumu = async (alanId: number) => (await vt.tek<{ id: number; tur: string }>('SELECT id, tur FROM stok_konum WHERE atolye_alan_id = $1', [alanId]))!;
    assert.deepEqual([(await konumu(karantina)).tur, (await konumu(sevkiyat)).tur], ['karantina', 'sevkiyat']);
    const m = await kart('sarf');
    await malKabul(m, '5');
    const tasi = async (alanId: number, miktar: string) =>
      assert.equal((await depo('POST', '/stok/tasima', { malzemeId: m, kaynakKonumId: await konumId('KABUL'), hedefKonumId: (await konumu(alanId)).id, miktar })).durum, 200);
    await tasi(karantina, '2');
    await tasi(sevkiyat, '3');
    const oneri = await depo<{ veriYetersiz: boolean }>('GET', `/stok/malzemeler/${m}/cikis-onerisi?miktar=1`);
    assert.equal(oneri.govde.veriYetersiz, true, JSON.stringify(oneri.govde));
    assert.equal(Number(await vt.tx((db) => sorgular.statuToplami(db, m, null))), 0);
    // İzinli: ara alandaki stok önerilir ve serbest toplama girer.
    assert.equal((await depo('POST', '/stok/tasima', { malzemeId: m, kaynakKonumId: (await konumu(sevkiyat)).id, hedefKonumId: (await konumu(bekleme)).id, miktar: '1' })).durum, 200);
    assert.equal(Number(await vt.tx((db) => sorgular.statuToplami(db, m, null))), 1);
  });

  test('#1304 harita alan türü: hurda ve ara alan depo olmayan bölümde ANA depoya konum olur, tür değişince izler; DEP-62 elle konumun türü yalnız boşken değişir', async () => {
    const vt = o().vt;
    const salon = await vt.tek<{ id: number }>(
      "INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, fabrika_x, fabrika_z, kaydeden_kisi_id) VALUES ('UR-9', 'Üretim', 20, 20, 4, 300, 300, $1) RETURNING id", [kisiler.get('yonetici')]);
    const hurda = await vt.tek<{ id: number }>("INSERT INTO atolye_alan (salon_id, tur, ad, x, z, donus, genislik, derinlik) VALUES ($1, 'hurda', 'Hurda kasası', 2, 2, 0, 2, 2) RETURNING id", [salon!.id]);
    const bekleme = await vt.tek<{ id: number }>("INSERT INTO atolye_alan (salon_id, tur, ad, x, z, donus, genislik, derinlik) VALUES ($1, 'ara_alan', 'B-4', 6, 2, 0, 2, 2) RETURNING id", [salon!.id]);
    assert.deepEqual((await mudur('POST', '/stok/konumlar/haritadan-esle')).govde, { eklenen: 2, guncellenen: 0, kapatilan: 0, atlanan: [], koduDegisenler: [] });
    const alanKonumu = (alanId: number) => vt.tek<{ id: number; tur: string; aktif: boolean; depoKod: string }>(
      'SELECT k.id, k.tur, k.aktif, d.kod AS "depoKod" FROM stok_konum k JOIN stok_depo d ON d.id = k.depo_id WHERE k.atolye_alan_id = $1', [alanId]);
    assert.deepEqual(await alanKonumu(hurda!.id), { id: (await alanKonumu(hurda!.id))!.id, tur: 'hurda', aktif: true, depoKod: 'ANA' });
    assert.equal((await alanKonumu(bekleme!.id))?.tur, 'ara_alan');

    // Hurdadaki stok kullanılabilir sayılmaz ve çıkış önerisine girmez.
    const m = await kart('sarf');
    await malKabul(m, '3');
    const hurdaKonumu = (await alanKonumu(hurda!.id))!.id;
    assert.equal((await depo('POST', '/stok/tasima', { malzemeId: m, kaynakKonumId: await konumId('KABUL'), hedefKonumId: hurdaKonumu, miktar: '3' })).durum, 200);
    const oneri = await depo<{ veriYetersiz: boolean }>('GET', `/stok/malzemeler/${m}/cikis-onerisi?miktar=1`);
    assert.equal(oneri.govde.veriYetersiz, true, JSON.stringify(oneri.govde));

    // Stoklu konumun türü harita alanıyla değişmez, bildirilir; stoksuz olan izler; stok dışı türe dönen kapanır.
    await vt.sorgu("UPDATE atolye_alan SET tur = 'ara_alan' WHERE id = $1", [hurda!.id]);
    await vt.sorgu("UPDATE atolye_alan SET tur = 'fason' WHERE id = $1", [bekleme!.id]);
    const esle = await mudur<{ guncellenen: number; atlanan: string[] }>('POST', '/stok/konumlar/haritadan-esle');
    assert.deepEqual([esle.govde.guncellenen, esle.govde.atlanan], [1, [`ALAN-${hurda!.id}`]]);
    assert.equal((await alanKonumu(hurda!.id))?.tur, 'hurda');
    assert.equal((await alanKonumu(bekleme!.id))?.tur, 'fason');
    await vt.sorgu("UPDATE atolye_alan SET tur = 'yuruyus_yolu' WHERE id = $1", [bekleme!.id]);
    assert.equal((await mudur<{ kapatilan: number }>('POST', '/stok/konumlar/haritadan-esle')).govde.kapatilan, 1);
    assert.equal((await alanKonumu(bekleme!.id))?.aktif, false);

    // DEP-62: haritaya bağlı konumun türü Stok Merkezi'nden değişmez; elle açılan boş konumun türü değişir, stoklusu değişmez.
    const k = await mudur<{ konum: { id: number; surum: number } }>('GET', `/stok/konumlar/${hurdaKonumu}`);
    const bagli = await mudur<Hata>('POST', `/stok/konumlar/${hurdaKonumu}/duzenle`, { surum: k.govde.konum.surum, kod: `ALAN-${hurda!.id}`, tur: 'depo_zemini' });
    assert.equal(bagli.durum, 400, JSON.stringify(bagli.govde));
    assert.match(bagli.govde.mesaj, /Fabrika Haritası/);
    const elle = await mudur<{ konum: { id: number; surum: number; tur: string } }>('POST', '/stok/konumlar', { tur: 'depo_zemini', kod: 'HRD-01', ad: null });
    assert.equal(elle.durum, 200, JSON.stringify(elle.govde));
    const cevir = await mudur<{ konum: { surum: number; tur: string } }>('POST', `/stok/konumlar/${elle.govde.konum.id}/duzenle`, { surum: elle.govde.konum.surum, kod: 'HRD-01', tur: 'hurda' });
    assert.equal(cevir.durum, 200, JSON.stringify(cevir.govde));
    assert.equal(cevir.govde.konum.tur, 'hurda');
    await malKabul(m, '1');
    assert.equal((await depo('POST', '/stok/tasima', { malzemeId: m, kaynakKonumId: await konumId('KABUL'), hedefKonumId: elle.govde.konum.id, miktar: '1' })).durum, 200);
    const stoklu = await mudur<Hata>('POST', `/stok/konumlar/${elle.govde.konum.id}/duzenle`, { surum: cevir.govde.konum.surum, kod: 'HRD-01', tur: 'depo_zemini' });
    assert.equal(stoklu.durum, 400);
    assert.match(stoklu.govde.mesaj, /stok var/);
  });

  test('DEP-61 Stok Merkezi > Depo: tanım yetkilisi yalnız stok deposu bölümünün rafını ve göz kalemini yazar; bölümün öbür öğeleri kalır (#1304)', async () => {
    const vt = o().vt;
    // Bölümler fabrika planında yan yana (ATL-31: üst üste binmez).
    const salonAc = async (kod: string, x: number) => (await vt.tek<{ id: number }>(
      "INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, kaydeden_kisi_id, fabrika_x) VALUES ($1, 'Deneme bölümü', 20, 20, 4, $2, $3) RETURNING id", [kod, kisiler.get('yonetici'), x]))!.id;
    const rafAcHarita = async (salonId: number, kod: string) => {
      const r = (await vt.tek<{ id: number }>(
        `INSERT INTO atolye_raf (salon_id, kod, ad, tur, bolme_sayisi, kat_sayisi, goz_sayisi, bolme_genisligi, derinlik, yukseklik, x, z, donus)
         VALUES ($1, $2, 'Deneme rafı', 'palet', 1, 1, 1, 2, 1, 2, 5, 5, 0) RETURNING id`, [salonId, kod]))!.id;
      const g = (await vt.tek<{ id: number }>('INSERT INTO atolye_goz (raf_id, bolme, kat, goz) VALUES ($1, 1, 1, 1) RETURNING id', [r]))!.id;
      return { r, g };
    };
    const depoSalon = await salonAc('DB-1', 100);
    const uretimSalon = await salonAc('UB-1', 200);
    const d = await rafAcHarita(depoSalon, 'D7');
    const u = await rafAcHarita(uretimSalon, 'U7');
    const alan = (await vt.tek<{ id: number }>("INSERT INTO atolye_alan (salon_id, tur, ad, x, z, donus, genislik, derinlik) VALUES ($1, 'bolge', 'Deneme bölge', 15, 15, 0, 2, 2) RETURNING id", [depoSalon]))!.id;
    assert.equal((await mudur('POST', `/stok/harita-bolumleri/${depoSalon}/depo`, { depo: true })).durum, 200);
    const surum = async (id: number) => (await vt.tek<{ surum: number }>('SELECT surum FROM atolye_salon WHERE id = $1', [id]))!.surum;
    const raf = (id: number | null, kod: string, x: number) => ({
      id, kod, ad: 'Deneme rafı', tur: 'palet', bolmeSayisi: 1, katSayisi: 1, gozSayisi: 1, bolmeGenisligi: 2, derinlik: 1, yukseklik: 2, x, z: 5, donus: 0, aktif: true,
    });

    // İzinli: depo bölümüne raf eklenir; var olan raf ve alan kalır, sürüm ilerler.
    const once = await surum(depoSalon);
    const yaz = await mudur<{ raflar: { kod: string }[]; alanlar: { id: number }[] }>('POST', `/stok/depo-bolumleri/${depoSalon}/raflari-kaydet`, { surum: once, raflar: [raf(d.r, 'D7', 5), raf(null, 'D8', 10)] });
    assert.equal(yaz.durum, 200, JSON.stringify(yaz.govde));
    assert.deepEqual(yaz.govde.raflar.map((r) => r.kod).sort(), ['D7', 'D8']);
    assert.deepEqual(yaz.govde.alanlar.map((a) => a.id), [alan]);
    assert.equal(await surum(depoSalon), once + 1);
    // Ret: eski sürüm, yetkisiz kişi, depo olmayan bölüm, başka bölümün rafını depoya çekmek.
    assert.equal((await mudur('POST', `/stok/depo-bolumleri/${depoSalon}/raflari-kaydet`, { surum: once, raflar: [raf(d.r, 'D7', 5)] })).durum, 409);
    assert.equal((await istek('kalite', 'POST', `/stok/depo-bolumleri/${depoSalon}/raflari-kaydet`, { surum: once + 1, raflar: [] })).durum, 403);
    const disari = await mudur<Hata>('POST', `/stok/depo-bolumleri/${uretimSalon}/raflari-kaydet`, { surum: await surum(uretimSalon), raflar: [raf(u.r, 'U7', 5), raf(null, 'U8', 10)] });
    assert.equal(disari.durum, 403);
    assert.match(disari.govde.mesaj, /stok deposu değil/);
    const cekme = await mudur('POST', `/stok/depo-bolumleri/${depoSalon}/raflari-kaydet`, { surum: once + 1, raflar: [raf(d.r, 'D7', 5), raf(null, 'D8', 10), raf(u.r, 'U7', 15)] });
    assert.ok(cekme.durum >= 400 && cekme.durum < 500, JSON.stringify(cekme.govde));
    assert.equal((await vt.tek<{ salonId: number }>('SELECT salon_id AS "salonId" FROM atolye_raf WHERE id = $1', [u.r]))!.salonId, uretimSalon);

    // Göz kalemi: depo gözüne yazılır ve silinir; depo olmayan bölümün gözü ve kalemi 403; yetkisiz 403.
    const kalem = { gozId: d.g, kod: 'DENEME-K1', ad: 'Deneme kalem', doluluk: 40 };
    const k = await mudur<{ id: number; adres: string }>('POST', '/stok/depo-goz-kalemleri/yaz', kalem);
    assert.equal(k.durum, 200, JSON.stringify(k.govde));
    assert.equal(k.govde.adres, 'D7-01-1-1');
    assert.equal((await istek('kalite', 'POST', '/stok/depo-goz-kalemleri/yaz', kalem)).durum, 403);
    assert.equal((await mudur('POST', '/stok/depo-goz-kalemleri/yaz', { ...kalem, gozId: u.g })).durum, 403);
    const uKalem = (await vt.tek<{ id: number }>(
      "INSERT INTO atolye_goz_kalemi (goz_id, kod_anahtari, kod, ad, doluluk, kaydeden_kisi_id) VALUES ($1, 'DENEME-K2', 'DENEME-K2', 'Deneme', 10, $2) RETURNING id", [u.g, kisiler.get('yonetici')]))!.id;
    assert.equal((await mudur('POST', '/stok/depo-goz-kalemleri/sil', { id: uKalem })).durum, 403);
    assert.equal((await istek('kalite', 'POST', '/stok/depo-goz-kalemleri/sil', { id: k.govde.id })).durum, 403);
    assert.ok([200, 204].includes((await mudur('POST', '/stok/depo-goz-kalemleri/sil', { id: k.govde.id })).durum));
    assert.equal((await mudur('POST', '/stok/depo-goz-kalemleri/sil', { id: k.govde.id })).durum, 404);
  });

  test('#1304 zemin ızgarası: kareler Fabrika Haritası bölümünden gelir; karedeki öğe ve stok konumu görünür; konum ve bakiye yerdeki kareyi taşır', async () => {
    const vt = o().vt;
    const salon = await vt.tek<{ id: number }>(
      "INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, fabrika_x, fabrika_z, kaydeden_kisi_id) VALUES ('ZM-1', 'Zemin', 12, 8, 4, 500, 500, $1) RETURNING id", [kisiler.get('yonetici')]);
    const hurda = await vt.tek<{ id: number }>("INSERT INTO atolye_alan (salon_id, tur, ad, x, z, donus, genislik, derinlik) VALUES ($1, 'hurda', 'Hurda kasası', 6, 6, 0, 2, 2) RETURNING id", [salon!.id]);
    assert.equal((await mudur('POST', '/stok/konumlar/haritadan-esle')).durum, 200);
    const konum = (await vt.tek<{ id: number }>('SELECT id FROM stok_konum WHERE atolye_alan_id = $1', [hurda!.id]))!.id;
    const m = await kart('sarf');
    await malKabul(m, '2');
    assert.equal((await depo('POST', '/stok/tasima', { malzemeId: m, kaynakKonumId: await konumId('KABUL'), hedefKonumId: konum, miktar: '2' })).durum, 200);

    assert.equal((await istek(null, 'GET', '/stok/zemin')).durum, 401);
    const z = await depo<ZeminCevabi>('GET', '/stok/zemin');
    zeminCevabi.parse(z.govde);
    const b = z.govde.bolumler.find((x) => x.salonId === salon!.id)!;
    assert.deepEqual([b.kod, b.sutunlar, b.satirlar, b.depoKod], ['ZM-1', ['A', 'B', 'C'], ['1', '2'], null]);
    assert.deepEqual(b.nesneler, [{ tur: 'alan', id: hurda!.id, kod: null, ad: 'Hurda kasası', altTur: 'hurda', hucre: 'B2' }]);
    assert.deepEqual(b.konumlar.map((k) => [k.id, k.tur, k.hucre, k.satirSayisi]), [[konum, 'hurda', 'B2', 1]]);

    assert.equal((await depo<KonumAyrintiCevabi>('GET', `/stok/konumlar/${konum}`)).govde.zemin, 'ZM-1 B2');
    const ayrinti = await depo<MalzemeAyrintiCevabi>('GET', `/stok/malzemeler/${m}`);
    assert.deepEqual(ayrinti.govde.bakiyeler.map((x) => [x.konumId, x.zemin]), [[konum, 'ZM-1 B2']]);
    assert.equal((await depo<KonumAyrintiCevabi>('GET', `/stok/konumlar/${await konumId('KABUL')}`)).govde.zemin, null, 'haritada yeri olmayan konumun karesi uydurulmaz');
  });

  test('DEP-11 her (malzeme, konum, parti) için bakiye hareket toplamına eşittir', async () => {
    const fark = await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db));
    assert.deepEqual(fark, []);
  });
});
