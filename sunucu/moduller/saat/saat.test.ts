import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { saatDurusNedenleriCevabi, saatEmriCevabi, saatIstasyonlariCevabi, saatOnizlemesiCevabi, saatSiradakiCevabi, saatUyarilariCevabi, saatVardiyaCevabi } from '#paylasilan/sozlesme/saat.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { emirBaslat, emirBitir, emirDevam, emirDurdur, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

describe('saat okuma uçları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let istasyonId = 0;
  let makineId = 0;
  let emirId = 0;
  let durusId = 0;
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function istek(ad: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown) {
    const basliklar: Record<string, string> = ad === null ? {} : { cookie: cerezler.get(ad) ?? '' };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as unknown };
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
    await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
    });
    await giris(kullaniciAdi);
  }

  // Yalnız Fabrika Haritası sayfası olan rol: emir listesini okumaz ama istasyon durumunu görür.
  async function islemliKisiEkle(kullaniciAdi: string, islemler: readonly string[]): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await kisiEkle(kullaniciAdi, `test_${kullaniciAdi}`);
  }

  let projeId = 0;

  // İş emirsiz emir yalnız test kurulumunda doğrudan yazılır: ekranlı açma Reçete ve Rota'dadır.
  async function emirYaz(g: { parcaNo: string; parcaAd: string; adet: number; istasyonId: number }): Promise<number> {
    return (await o().sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, proje_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [g.parcaNo, g.parcaAd, g.adet, g.istasyonId, yoneticiId, projeId]))!.id;
  }

  // Başlatma, devam, durdurma ve bitirmenin ekranı Arkon'dur ve uretim-emirleri/disari.ts'ten girer: test kişinin yetkisiyle çağırır.
  async function uretim(ad: string, id: number, komut: 'baslat' | 'devam' | 'durdur' | 'bitir', g: { durusNedeniId?: number; saglamAdet?: number } = {}) {
    try {
      await o().vt.tx(async (db) => {
        const kisi = await db.tek<{ id: number }>('SELECT id FROM kisi WHERE kullanici_adi = $1', [ad]);
        const k = kisi === null ? null : await kullaniciYukle(db, kisi.id);
        if (k === null) throw new Error(`kişi yok: ${ad}`);
        if (komut === 'baslat') return emirBaslat(db, k, id);
        if (komut === 'devam') return emirDevam(db, k, id);
        if (komut === 'durdur') return emirDurdur(db, k, id, g.durusNedeniId ?? 0);
        return emirBitir(db, k, id, g.saglamAdet);
      });
      return { durum: 200, govde: undefined as unknown };
    } catch (h) {
      if (h instanceof UygulamaHatasi) return { durum: h.durum, govde: h.govde() as unknown };
      throw h;
    }
  }

  before(async () => {
    ortam = await testVeritabaniKur('saat');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    // Denetim #27: rotasız emir varsayılan kapalı ve projeyle açılır; kurulum ayarı açar, test projesi verir.
    projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('TEST.PROJE', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('uretim-emirleri.rotasiz-emir', 'true', $1)", [yoneticiId]);
    await giris('yonetici');
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
    await islemliKisiEkle('harita', ['sayfa.atolye']);
    durusId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES ('SA-D1', 'Malzeme bekleniyor', 'plansiz', 951) RETURNING id"))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('SAM1', 'Deneme Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('SAI1', 'CNC-01', $1) RETURNING id", [im?.id]))!.id;
    // UE20: iş başlatan test kişileri bu istasyonda yetkindir.
    await ortam.sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [istasyonId]);
    makineId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO makine (kod, ad, istasyon_id) VALUES ('SAK1', 'Tezgah', $1) RETURNING id", [istasyonId]))!.id;
    emirId = await emirYaz({ parcaNo: 'DNM-1', parcaAd: 'Deneme flanş', adet: 5, istasyonId });
  });
  after(async () => { await ortam?.kaldir(); });

  test('oturumsuz istek 401, emir listesini okumayan rol 403', async () => {
    for (const yol of ['/saat/istasyonlar', '/saat/uyarilar', `/saat/emirler/${emirId}`]) {
      assert.equal((await istek(null, 'GET', yol)).durum, 401, yol);
      assert.equal((await istek('operator', 'GET', yol)).durum, 403, yol);
    }
  });

  test('yalnız saat okuması olan rol saatte okur; plan saatini ve üstlenmeyi almaz', async () => {
    await islemliKisiEkle('saat_okur', ['saat.oku']);
    for (const yol of ['/saat/istasyonlar', '/saat/uyarilar', `/saat/emirler/${emirId}`, '/saat/vardiya']) {
      assert.equal((await istek('saat_okur', 'GET', yol)).durum, 200, yol);
    }
    assert.equal((await istek('saat_okur', 'GET', `/saat/istasyonlar/${istasyonId}/siradaki`)).durum, 403);
    assert.equal(saatUyarilariCevabi.parse((await istek('saat_okur', 'GET', '/saat/uyarilar')).govde).ustlenebilir, false);
    assert.equal((await istek('saat_okur', 'GET', '/uretim-emirleri')).durum, 403, 'emir listesi sayfası açılmaz');
  });

  test('Fabrika Haritası sayfası olan rol de okur', async () => {
    for (const yol of ['/saat/istasyonlar', '/saat/uyarilar', `/saat/emirler/${emirId}`]) {
      assert.equal((await istek('harita', 'GET', yol)).durum, 200, yol);
    }
  });

  test('başlamamış emir: istasyon "bekliyor", sayaç null (sıfır uydurulmaz), birim süre olmadığı için kalan null', async () => {
    const c = await istek('planlama_proje', 'GET', '/saat/istasyonlar');
    assert.equal(c.durum, 200);
    const cnc = saatIstasyonlariCevabi.parse(c.govde).istasyonlar.find((i) => i.id === istasyonId);
    assert.equal(cnc?.durum, 'bekliyor');
    assert.deepEqual(cnc?.emir && { id: cnc.emir.id, saglam: cnc.emir.saglam, hedef: cnc.emir.hedef }, { id: emirId, saglam: null, hedef: 5 });

    const e = await istek('planlama_proje', 'GET', `/saat/emirler/${emirId}`);
    assert.equal(e.durum, 200);
    const emir = saatEmriCevabi.parse(e.govde);
    assert.deepEqual(
      [emir.parcaAd, emir.calisma, emir.saglam, emir.hurda, emir.hedef, emir.birimSaniye, emir.kalanSaniye],
      ['Deneme flanş', null, null, null, 5, null, null],
    );
  });

  test('başlayan emir "calisiyor" ve sayacı sıfırdan açılır; duruşta istasyon "durdu" ve nedeniyle uyarı olur', async () => {
    assert.equal((await uretim('operator', emirId, 'baslat')).durum, 200);
    let ist = saatIstasyonlariCevabi.parse((await istek('planlama_proje', 'GET', '/saat/istasyonlar')).govde);
    assert.deepEqual(ist.istasyonlar.find((i) => i.id === istasyonId)?.durum, 'calisiyor');
    let emir = saatEmriCevabi.parse((await istek('planlama_proje', 'GET', `/saat/emirler/${emirId}`)).govde);
    assert.deepEqual([emir.calisma, emir.saglam, emir.hurda], ['calisiyor', 0, 0]);

    const d = await uretim('operator', emirId, 'durdur', { durusNedeniId: durusId });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    ist = saatIstasyonlariCevabi.parse((await istek('planlama_proje', 'GET', '/saat/istasyonlar')).govde);
    assert.equal(ist.istasyonlar.find((i) => i.id === istasyonId)?.durum, 'durdu');
    emir = saatEmriCevabi.parse((await istek('planlama_proje', 'GET', `/saat/emirler/${emirId}`)).govde);
    assert.equal(emir.durusNedeni, 'Malzeme bekleniyor');
    assert.notEqual(emir.durusBaslangic, null);
    const u = saatUyarilariCevabi.parse((await istek('planlama_proje', 'GET', '/saat/uyarilar')).govde);
    assert.deepEqual(u.uyarilar.map((x) => [x.tur, x.istasyon?.id, x.aciklama]), [['durus', istasyonId, 'Malzeme bekleniyor']]);
  });

  test('arızalı makine istasyonu "ariza" yapar ve uyarılarda duruştan önce gelir', async () => {
    await o().sahip.sorgu(
      "INSERT INTO istasyonlar_makine_durumu (makine_id, durum, aciklama, degistiren_kisi_id) VALUES ($1, 'ariza', 'Mil sesi', $2)", [makineId, yoneticiId]);
    const c = saatIstasyonlariCevabi.parse((await istek('planlama_proje', 'GET', '/saat/istasyonlar')).govde);
    assert.equal(c.istasyonlar.find((i) => i.id === istasyonId)?.durum, 'ariza');
    const u = saatUyarilariCevabi.parse((await istek('planlama_proje', 'GET', '/saat/uyarilar')).govde);
    assert.deepEqual(u.uyarilar.map((x) => [x.tur, x.aciklama]), [['ariza', 'Mil sesi'], ['durus', 'Malzeme bekleniyor']]);
  });

  test('iş merkezi kısıtlı kişi başka iş merkezinin istasyonunu, uyarısını ve emrini görmez', async () => {
    const im2 = await o().sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('SAM2', 'Öteki Merkez') RETURNING id");
    const istasyon2 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('SAI2', 'CNC-02', $1) RETURNING id", [im2?.id]))!.id;
    const makine2 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO makine (kod, ad, istasyon_id) VALUES ('SAK2', 'Tezgah 2', $1) RETURNING id", [istasyon2]))!.id;
    await o().sahip.sorgu(
      "INSERT INTO istasyonlar_makine_durumu (makine_id, durum, aciklama, degistiren_kisi_id) VALUES ($1, 'bakim', 'Yağlama', $2)", [makine2, yoneticiId]);
    const emir2 = await emirYaz({ parcaNo: 'DNM-3', parcaAd: 'Deneme burç', adet: 3, istasyonId: istasyon2 });

    await islemliKisiEkle('kisitli', ['sayfa.atolye']);
    const kisi = await o().vt.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'kisitli'");
    const sm1 = await o().vt.tek<{ id: number }>("SELECT id FROM is_merkezi WHERE kod = 'SAM1'");
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisi?.id, sm1?.id]);

    const tumu = saatIstasyonlariCevabi.parse((await istek('planlama_proje', 'GET', '/saat/istasyonlar')).govde);
    assert.ok(tumu.istasyonlar.some((i) => i.id === istasyon2), 'kısıtsız kişi her iş merkezini görür');
    const kisitliIst = saatIstasyonlariCevabi.parse((await istek('kisitli', 'GET', '/saat/istasyonlar')).govde);
    assert.ok(kisitliIst.istasyonlar.some((i) => i.id === istasyonId), 'kendi iş merkezi görünür');
    assert.ok(!kisitliIst.istasyonlar.some((i) => i.id === istasyon2), 'kapsam dışı istasyon gelmez');

    const tumUyari = saatUyarilariCevabi.parse((await istek('planlama_proje', 'GET', '/saat/uyarilar')).govde);
    assert.ok(tumUyari.uyarilar.some((u) => u.istasyon?.id === istasyon2), 'kısıtsız kişi kapsam dışı uyarıyı da görür');
    const kisitliUyari = saatUyarilariCevabi.parse((await istek('kisitli', 'GET', '/saat/uyarilar')).govde);
    assert.ok(kisitliUyari.uyarilar.some((u) => u.istasyon?.id === istasyonId), 'kendi iş merkezinin uyarısı görünür');
    assert.ok(!kisitliUyari.uyarilar.some((u) => u.istasyon?.id === istasyon2), 'kapsam dışı uyarı gelmez');

    assert.equal((await istek('kisitli', 'GET', `/saat/emirler/${emirId}`)).durum, 200);
    assert.equal((await istek('kisitli', 'GET', `/saat/emirler/${emir2}`)).durum, 403);
    assert.equal((await istek('planlama_proje', 'GET', `/saat/emirler/${emir2}`)).durum, 200);
  });

  test('iş emirli emir: istasyon kodu, tezgah, op, sıradaki, durum başlangıcı; kalite ve malzeme uyarıları', async () => {
    const sayi = Date.now() % 100000;
    const kart = async (tur: 'mamul' | 'hammadde', sira: number): Promise<number> => {
      await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SA-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
      return (await o().sahip.tek<{ no: number }>(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, $2, 'SA-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
        [`sa-dnm-${sira}`, tur, sira, JSON.stringify({ id: `sa-dnm-${sira}`, com: { ad: `Deneme ${tur}` } }), yoneticiId]))!.no;
    };
    const urunNo = await kart('mamul', sayi);
    const hammadde = await kart('hammadde', sayi + 1);
    const rev = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('SA-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    const kur = async (kod: string) => {
      const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $1) RETURNING id', [`M${kod}`]);
      const ist = (await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $1, $2) RETURNING id', [kod, im?.id]))!.id;
      await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
      const mk = (await o().sahip.tek<{ id: number }>(
        "INSERT INTO makine (kod, ad, tur, istasyon_id) VALUES ($1, $2, 'CNC', $3) RETURNING id", [`K${kod}`, `Tezgah ${kod}`, ist]))!.id;
      return { ist, mk };
    };
    const a = await kur('SAI3');
    const adim = (sira: number, makine: number, bilesen: boolean) => ({
      sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tip, kaynak: { tur: 'makine' as const, id: makine }, ayarSuresiDk: '10', birimSureDk: '1.5',
      terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      ...(bilesen ? { bilesenler: [{ malzemeNo: hammadde, miktar: '2.5' }] } : {}),
    });
    const yonetici: Kullanici = { id: yoneticiId, ad: 'Deneme Yönetici', islemler: ['uretim-emirleri.yaz'] };
    const ac = (makine: number, bilesen: boolean) => o().vt.tx((db) => uretimEmriAc(db, yonetici, {
      malzemeNo: urunNo, adet: 4, teslim: null, kaynakRotaRevizyonId: rev, projeId,
      isEmirleri: [adim(1, makine, bilesen), adim(2, makine, false)],
    }));
    const emirNoAl = async (id: number) => saatEmriCevabi.parse((await istek('planlama_proje', 'GET', `/saat/emirler/${id}`)).govde);

    const e1 = (await ac(a.mk, false)).uretimEmriId;
    let emir = await emirNoAl(e1);
    assert.deepEqual([emir.op, emir.tezgah, emir.siradaki, emir.malzemeHazir, emir.durumBaslangic],
      [null, { ad: 'Tezgah SAI3', tur: 'CNC' }, { opNo: 10, ad: 'Adım 1', adet: 4 }, null, null]);
    assert.equal((await uretim('operator', e1, 'baslat')).durum, 200);
    emir = await emirNoAl(e1);
    assert.deepEqual([emir.op, emir.siradaki, emir.birimSaniye], [{ opNo: 10, ad: 'Adım 1' }, { opNo: 10, ad: 'Adım 1', adet: 4 }, 90]);
    // Geri sayım tezgâhta ilk üretim girilince başlar: giriş yokken son üretim anı yoktur.
    assert.equal(emir.sonUretimAni, null);
    assert.equal((await uretim('operator', e1, 'durdur', { durusNedeniId: durusId })).durum, 200);
    emir = await emirNoAl(e1);
    assert.notEqual(emir.durumBaslangic, null);
    assert.equal(emir.durumBaslangic, emir.durusBaslangic);
    const satir = saatIstasyonlariCevabi.parse((await istek('planlama_proje', 'GET', '/saat/istasyonlar')).govde).istasyonlar.find((i) => i.id === a.ist);
    assert.deepEqual([satir?.kod, satir?.durum, satir?.tezgah, satir?.durumBaslangic], ['SAI3', 'durdu', { ad: 'Tezgah SAI3', tur: 'CNC' }, emir.durusBaslangic]);

    await o().sahip.sorgu(
      `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, duzeltme, zaman, is_emri_id)
       SELECT $1, $2, $3, 'karar_bekliyor', 2, false, now(), id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY sira LIMIT 1`, [e1, yoneticiId, a.ist]);
    const sayimAni = (await o().sahip.tek<{ an: string }>(
      `SELECT to_char(max(zaman) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS an FROM uretim_sayimi WHERE emir_id = $1`, [e1]))!.an;
    assert.equal(Date.parse((await emirNoAl(e1)).sonUretimAni ?? ''), Date.parse(sayimAni));
    const kalite = saatUyarilariCevabi.parse((await istek('planlama_proje', 'GET', '/saat/uyarilar')).govde).uyarilar.filter((u) => u.tur === 'kalite');
    assert.deepEqual(kalite.map((u) => [u.istasyon?.id, u.emirNo, u.aciklama]), [[a.ist, emir.emirNo, '2 adet kalite kararı bekliyor']]);

    const b = await kur('SAI4');
    const e2 = (await ac(b.mk, true)).uretimEmriId;
    const malzemeUyarilari = async () => saatUyarilariCevabi.parse((await istek('planlama_proje', 'GET', '/saat/uyarilar')).govde).uyarilar
      .filter((u) => u.tur === 'malzeme').map((u) => [u.istasyon?.id, u.aciklama]);
    assert.equal((await emirNoAl(e2)).malzemeHazir, false);
    assert.deepEqual(await malzemeUyarilari(), [[b.ist, 'Malzeme stoğu yetersiz']]);
    const konum = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur) SELECT id, 'SA-ZEM', 'depo_zemini' FROM stok_depo WHERE kod = 'ANA' RETURNING id"))!.id;
    await o().sahip.sorgu('INSERT INTO stok_bakiye (malzeme_id, konum_id, miktar, ilk_giris) VALUES ($1, $2, 10, now())', [hammadde, konum]);
    assert.equal((await emirNoAl(e2)).malzemeHazir, true);
    assert.deepEqual(await malzemeUyarilari(), []);
  });

  test('kalibrasyon uyarısı yalnız kalibrasyonu okuyabilen kişiye gelir ve istasyonsuzdur', async () => {
    const tur = (await o().sahip.tek<{ id: number }>("INSERT INTO olcu_aleti_turu (ad) VALUES ('SA-Mastar') RETURNING id"))!.id;
    const alet = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO olcu_aleti (no, tur_id, periyot_gun) VALUES ('SA-K1', $1, 30) RETURNING id", [tur]))!.id;
    await o().sahip.sorgu(
      "INSERT INTO kalibrasyon_kaydi (alet_id, tarih, sonuc, kisi_id) VALUES ($1, current_date - 60, 'uygun', $2)", [alet, yoneticiId]);
    await islemliKisiEkle('kalibrasyoncu', ['sayfa.atolye', 'kalibrasyon.oku']);
    const liste = async (ad: string) => saatUyarilariCevabi.parse((await istek(ad, 'GET', '/saat/uyarilar')).govde).uyarilar.filter((u) => u.tur === 'kalibrasyon');
    const gorunen = await liste('kalibrasyoncu');
    assert.deepEqual(gorunen.map((u) => [u.istasyon, u.alet?.no, u.alet?.ad, u.aciklama]), [[null, 'SA-K1', 'SA-Mastar', 'Kalibrasyon vadesi geçti']]);
    assert.deepEqual(await liste('harita'), []);
  });

  test('duruş yazma: terminal.uret yetkisiz kişi durduramaz, başka iş merkezindeki emir durdurulamaz (normal oturum)', async () => {
    const emir = await emirYaz({ parcaNo: 'DNM-D1', parcaAd: 'Deneme pim', adet: 4, istasyonId });
    assert.equal((await uretim('operator', emir, 'baslat')).durum, 200);
    assert.equal((await istek(null, 'POST', `/saat/emirler/${emir}/durdur`, { durusNedeniId: durusId })).durum, 401);
    assert.equal((await istek('harita', 'POST', `/saat/emirler/${emir}/durdur`, { durusNedeniId: durusId })).durum, 403);
    const hala = saatEmriCevabi.parse((await istek('planlama_proje', 'GET', `/saat/emirler/${emir}`)).govde);
    assert.equal(hala.calisma, 'calisiyor', 'reddedilen komut emri durdurmadı');

    const im2 = await o().sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('SAM9', 'Yazma Dışı Merkez') RETURNING id");
    const ist2 = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('SAI9', 'CNC-09', $1) RETURNING id", [im2?.id]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist2]);
    const emir2 = await emirYaz({ parcaNo: 'DNM-D2', parcaAd: 'Deneme vida', adet: 2, istasyonId: ist2 });
    assert.equal((await uretim('operator', emir2, 'baslat')).durum, 200);

    await islemliKisiEkle('durdurucu', ['terminal.uret']);
    const kisi = await o().vt.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'durdurucu'");
    const sm1 = await o().vt.tek<{ id: number }>("SELECT id FROM is_merkezi WHERE kod = 'SAM1'");
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisi?.id, sm1?.id]);
    assert.equal((await istek('durdurucu', 'POST', `/saat/emirler/${emir2}/durdur`, { durusNedeniId: durusId })).durum, 403);
    const hala2 = saatEmriCevabi.parse((await istek('planlama_proje', 'GET', `/saat/emirler/${emir2}`)).govde);
    assert.equal(hala2.calisma, 'calisiyor', 'kapsam dışı emir durdurulmadı');
  });

  test('duruş yazma: yetkili kişi kendi kapsamındaki çalışan emri nedenle durdurur; neden listesi aktif nedenleri verir', async () => {
    const sm1 = await o().vt.tek<{ id: number }>("SELECT id FROM is_merkezi WHERE kod = 'SAM1'");
    const bos = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('SAI8', 'CNC-08', $1) RETURNING id", [sm1?.id]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [bos]);
    const emir = await emirYaz({ parcaNo: 'DNM-D3', parcaAd: 'Deneme somun', adet: 3, istasyonId: bos });
    assert.equal((await uretim('operator', emir, 'baslat')).durum, 200);
    const liste = await istek('operator', 'GET', '/saat/durus-nedenleri');
    assert.equal(liste.durum, 200);
    assert.ok(saatDurusNedenleriCevabi.parse(liste.govde).nedenler.some((n) => n.id === durusId && n.ad === 'Malzeme bekleniyor'));
    assert.equal((await istek('harita', 'GET', '/saat/durus-nedenleri')).durum, 403);

    const c = await istek('durdurucu', 'POST', `/saat/emirler/${emir}/durdur`, { durusNedeniId: durusId });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const cevap = saatEmriCevabi.parse(c.govde);
    assert.equal(cevap.calisma, 'durdu');
    assert.equal(cevap.durusNedeni, 'Malzeme bekleniyor');
    const e = saatEmriCevabi.parse((await istek('planlama_proje', 'GET', `/saat/emirler/${emir}`)).govde);
    assert.deepEqual([e.calisma, e.durusNedeni], ['durdu', 'Malzeme bekleniyor']);
  });

  test('duruş yazma tekrar korumalı: kimliksiz istek reddedilir, aynı kimlikle yeniden gönderim tek duruş üretir', async () => {
    const sm1 = await o().vt.tek<{ id: number }>("SELECT id FROM is_merkezi WHERE kod = 'SAM1'");
    const ist = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('SAI7', 'CNC-07', $1) RETURNING id", [sm1?.id]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
    const emir = await emirYaz({ parcaNo: 'DNM-D4', parcaAd: 'Deneme rondela', adet: 3, istasyonId: ist });
    assert.equal((await uretim('operator', emir, 'baslat')).durum, 200);
    const gonder = (kimlik: string | null) => app.inject({
      method: 'POST', url: `/api/saat/emirler/${emir}/durdur`, payload: { durusNedeniId: durusId },
      headers: { cookie: cerezler.get('durdurucu') ?? '', ...(kimlik === null ? {} : { [ISTEK_KIMLIGI_BASLIGI]: kimlik }) },
    });
    const kimliksiz = await gonder(null);
    assert.ok(kimliksiz.statusCode >= 400 && kimliksiz.statusCode < 500, String(kimliksiz.statusCode));
    assert.equal(saatEmriCevabi.parse((await istek('planlama_proje', 'GET', `/saat/emirler/${emir}`)).govde).calisma, 'calisiyor');
    const kimlik = randomUUID();
    const bir = await gonder(kimlik);
    const iki = await gonder(kimlik);
    assert.equal(bir.statusCode, 200, bir.body);
    assert.equal(iki.statusCode, 200, iki.body);
    const sayi = await o().vt.tek<{ n: string }>("SELECT count(*)::text AS n FROM uretim_olayi WHERE emir_id = $1 AND olay = 'durdur'", [emir]);
    assert.equal(sayi?.n, '1');
  });

  test('olmayan ve iptal edilmiş emir 404', async () => {
    assert.equal((await istek('planlama_proje', 'GET', '/saat/emirler/999999')).durum, 404);
    const yeni = await emirYaz({ parcaNo: 'DNM-2', parcaAd: 'Deneme mil', adet: 2, istasyonId });
    assert.equal((await istek('planlama_proje', 'GET', `/saat/emirler/${yeni}`)).durum, 200);
    // İş emirsiz emrin iptal komutu yoktur; iptal hâli doğrudan yazılır.
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now(), surum = surum + 1 WHERE id = $1", [yeni]);
    assert.equal((await istek('planlama_proje', 'GET', `/saat/emirler/${yeni}`)).durum, 404);
  });

  // B verileri: çalışmaya geçiş anı, duruş saniyesi ve pencere, biten emir uyarısı (uretim-emirleri/disari.ts Saat okumaları).
  async function bIstasyonu(kod: string): Promise<{ ist: number; im: number }> {
    const im = (await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $1) RETURNING id', [`M${kod}`]))!.id;
    const ist = (await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $1, $2) RETURNING id', [kod, im]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
    await o().sahip.sorgu('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $1, $2)', [`K${kod}`, ist]);
    return { ist, im };
  }
  async function bEmri(ist: number, parcaNo: string): Promise<number> {
    return emirYaz({ parcaNo, parcaAd: `Deneme ${parcaNo}`, adet: 5, istasyonId: ist });
  }
  const istasyonSatiri = async (ad: string, ist: number) =>
    saatIstasyonlariCevabi.parse((await istek(ad, 'GET', '/saat/istasyonlar')).govde).istasyonlar.find((i) => i.id === ist);

  test('çalışan istasyonda ve emirde durum başlangıcı çalışmaya geçiş anıdır; başlamamış emirde null kalır', async () => {
    const a = await bIstasyonu('SAB1');
    const b = await bIstasyonu('SAB2');
    const calisan = await bEmri(a.ist, 'DNM-B1');
    const bekleyen = await bEmri(b.ist, 'DNM-B2');
    const once = Date.now();
    assert.equal((await uretim('operator', calisan, 'baslat')).durum, 200);
    const sonra = Date.now();
    const satir = await istasyonSatiri('planlama_proje', a.ist);
    assert.equal(satir?.durum, 'calisiyor');
    assert.notEqual(satir?.durumBaslangic, null);
    const an = Date.parse(satir?.durumBaslangic ?? '');
    assert.ok(an >= once - 2000 && an <= sonra + 2000, 'başlatma anı');
    const emir = saatEmriCevabi.parse((await istek('planlama_proje', 'GET', `/saat/emirler/${calisan}`)).govde);
    assert.equal(emir.calisma, 'calisiyor');
    assert.equal(emir.durumBaslangic, satir?.durumBaslangic);
    assert.equal((await istasyonSatiri('planlama_proje', b.ist))?.durumBaslangic, null);
    assert.equal(saatEmriCevabi.parse((await istek('planlama_proje', 'GET', `/saat/emirler/${bekleyen}`)).govde).durumBaslangic, null);
  });

  test('istasyonlar cevabı pencere.baslangic (tesis gün başı) ve istasyon başına durusSaniye taşır; duruş kaydı olmayan istasyon null', async () => {
    const a = await bIstasyonu('SAB3');
    const b = await bIstasyonu('SAB4');
    const emirA = await bEmri(a.ist, 'DNM-B3');
    assert.equal((await uretim('operator', emirA, 'baslat')).durum, 200);
    const neden = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES ('SA-D2', 'Pencere duruşu', 'plansiz', 952) RETURNING id"))!.id;
    const T = Date.now();
    const olay = (tur: string, sn: number) => o().sahip.sorgu(
      'INSERT INTO uretim_olayi (emir_id, kisi_id, istasyon_id, olay, durus_nedeni_id, zaman) VALUES ($1, $2, $3, $4, $5, $6)',
      [emirA, yoneticiId, a.ist, tur, tur === 'durdur' ? neden : null, new Date(T - sn * 1000).toISOString()]);
    await olay('durdur', 90);
    await olay('devam', 30);
    const cevap = saatIstasyonlariCevabi.parse((await istek('planlama_proje', 'GET', '/saat/istasyonlar')).govde);
    assert.equal(cevap.pencere.baslangic, new Date(tesisGunBasi(tesisGunu(Date.parse(cevap.zaman)))).toISOString());
    const baslangic = Date.parse(cevap.pencere.baslangic);
    const beklenen = Math.round((T - 30_000 - Math.max(T - 90_000, baslangic)) / 1000);
    assert.equal(cevap.istasyonlar.find((i) => i.id === a.ist)?.durusSaniye, beklenen, 'duruş pencereyle kesilir');
    assert.equal(cevap.istasyonlar.find((i) => i.id === b.ist)?.durusSaniye, null, 'duruş verisi yoksa sıfır değil null');
  });

  test('istasyon başına bugünkü sağlam ve hurda pencere içindeki sayımdır; sayımı olmayan istasyonda null', async () => {
    const a = await bIstasyonu('SAB9');
    const b = await bIstasyonu('SAB10');
    const emirA = await bEmri(a.ist, 'DNM-B9');
    assert.equal((await uretim('operator', emirA, 'baslat')).durum, 200);
    const sayim = (adet: number, zaman: string) => o().sahip.sorgu(
      `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, zaman) VALUES ($1, $2, $3, 'saglam', $4, $5)`,
      [emirA, yoneticiId, a.ist, adet, zaman]);
    const cevap0 = saatIstasyonlariCevabi.parse((await istek('planlama_proje', 'GET', '/saat/istasyonlar')).govde);
    await sayim(3, new Date(Date.parse(cevap0.pencere.baslangic) - 60_000).toISOString());
    await sayim(4, new Date().toISOString());
    const cevap = saatIstasyonlariCevabi.parse((await istek('planlama_proje', 'GET', '/saat/istasyonlar')).govde);
    assert.deepEqual(cevap.istasyonlar.find((i) => i.id === a.ist)?.bugun, { saglam: 4, hurda: 0 }, 'pencere öncesi sayım girmez');
    assert.equal(cevap.istasyonlar.find((i) => i.id === b.ist)?.bugun, null, 'sayım yoksa sıfır değil null');
  });

  test('bitti uyarısı: pencerede biten emir kapsamdaki istasyonda gelir; kapsam dışı istasyonun bitti uyarısı gelmez', async () => {
    const a = await bIstasyonu('SAB5');
    const b = await bIstasyonu('SAB6');
    const emirA = await bEmri(a.ist, 'DNM-B5');
    const emirB = await bEmri(b.ist, 'DNM-B6');
    const acik = await bEmri(a.ist, 'DNM-B7');
    for (const id of [emirA, emirB]) {
      assert.equal((await uretim('operator', id, 'baslat')).durum, 200);
      const bit = await uretim('operator', id, 'bitir', { saglamAdet: 5 });
      assert.equal(bit.durum, 200, JSON.stringify(bit.govde));
    }
    const noOku = async (id: number) => (await o().sahip.tek<{ emir_no: string }>('SELECT emir_no FROM uretim_emri WHERE id = $1', [id]))!.emir_no;
    await islemliKisiEkle('bitti_kisitli', ['sayfa.atolye']);
    const kisi = await o().vt.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'bitti_kisitli'");
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisi?.id, a.im]);

    const bitti = async (ad: string) => saatUyarilariCevabi.parse((await istek(ad, 'GET', '/saat/uyarilar')).govde).uyarilar.filter((u) => u.tur === 'bitti');
    const tum = await bitti('planlama_proje');
    const noA = await noOku(emirA);
    const noB = await noOku(emirB);
    const acikNo = await noOku(acik);
    const uyariA = tum.find((u) => u.istasyon?.id === a.ist && u.emirNo === noA);
    assert.ok(uyariA, 'kapsamsız kişi biten emri görür');
    assert.ok(tum.some((u) => u.istasyon?.id === b.ist && u.emirNo === noB));
    assert.equal(uyariA?.aciklama, null);
    assert.equal(uyariA?.alet, null);
    assert.notEqual(uyariA?.baslangic, null);
    assert.ok(!tum.some((u) => u.emirNo === acikNo), 'açık emir bitti değildir');
    const kisitli = await bitti('bitti_kisitli');
    assert.deepEqual(kisitli.map((u) => [u.istasyon?.id, u.emirNo, u.aciklama]), [[a.ist, noA, null]], 'kapsam dışı istasyonun bitti uyarısı gelmez');
  });
  // 3B önizleme: Çizim Merkezi'nin yayındaki model kareleri (cizimler/disari.ts); saat 3B çözmez, kareleri kendi ucundan okur.
  test('önizleme: emre bağlı model önce, yoksa ürünün malzeme kartının modeli; tezgâhın modeli istasyondan ayrı okunur; kare sunucuda bulunan kayıtla okunur; model yoksa null ve 404; kapsam dışı reddedilir', async () => {
    const png = (n: number): Buffer => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, n)]);
    const ozet = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
    const yukle = async (b: Buffer): Promise<string> => {
      const c = await istek('yonetici', 'POST', `/dosyalar/${ozet(b)}/parca`, { sira: 0, toplam: 1, veri: b.toString('base64') });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return ozet(b);
    };
    const model = async (ad: string, kareler: Buffer[]): Promise<{ belge: number; rev: number }> => {
      const step = Buffer.concat([Buffer.from('ISO-10303-21;\nHEADER;\n'), Buffer.from(ad.repeat(40))]);
      const ac = await istek('yonetici', 'POST', '/cizimler', { ad, tur: '3b-model', ozet: await yukle(step), dosyaAdi: 'parca.step' });
      assert.equal(ac.durum, 200, JSON.stringify(ac.govde));
      const b = ac.govde as { id: number; surum: number; revizyonlar: { id: number }[] };
      const rev = b.revizyonlar[0]!.id;
      const y = await istek('yonetici', 'POST', `/cizimler/${b.id}/revizyonlar/${rev}/yayinla`, { surum: b.surum });
      assert.equal(y.durum, 200, JSON.stringify(y.govde));
      const k: { kare: number; ozet: string }[] = [];
      for (const [kare, icerik] of kareler.entries()) k.push({ kare, ozet: await yukle(icerik) });
      const on = await istek('yonetici', 'POST', `/cizimler/${b.id}/revizyonlar/${rev}/onizleme`, { kareler: k });
      assert.equal(on.durum, 200, JSON.stringify(on.govde));
      return { belge: b.id, rev };
    };
    const bagla = (belge: number, modul: string, id: number) => o().sahip.sorgu(
      'INSERT INTO belge_merkezi_bag (belge_id, hedef_modul, hedef_id, ekleyen_id) VALUES ($1, $2, $3, $4)', [belge, modul, id, yoneticiId]);
    const onizleme = async (ad: string, id: number) =>
      saatOnizlemesiCevabi.parse((await istek(ad, 'GET', `/saat/emirler/${id}/onizleme`)).govde).onizleme;
    const kare = (ad: string, id: number, k: number) =>
      app.inject({ method: 'GET', url: `/api/saat/emirler/${id}/onizleme/${k}`, headers: { cookie: cerezler.get(ad) ?? '' } });

    const a = await bIstasyonu('SAB11');
    const b = await bIstasyonu('SAB12');
    const emirA = await bEmri(a.ist, 'DNM-B11');
    const emirB = await bEmri(b.ist, 'DNM-B12');
    const bos = await bEmri(b.ist, 'DNM-B13');
    // Emir B ürün kartlı olsun: malzemenin modeli emre bağ yoksa gelir.
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SA-3B-', 0) ON CONFLICT (onek) DO NOTHING");
    const urunNo = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('sa-3b-1', 'mamul', 'SA-3B-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'sa-3b-1', com: { ad: 'Deneme 3B' } }), yoneticiId]))!.no;
    const rota = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    await o().sahip.sorgu('UPDATE uretim_emri SET malzeme_no = $1, kaynak_rota_revizyonu_id = $2 WHERE id = $3', [urunNo, rota, emirB]);

    const emreBagli = await model('Emre bağlı', [png(1), png(2)]);
    const malzemeye = await model('Malzemeye bağlı', [png(3)]);
    const emirOzel = await model('Emir B özel', [png(4)]);
    await bagla(emreBagli.belge, 'uretim-emirleri', emirA);
    await bagla(malzemeye.belge, 'malzemeler', urunNo);

    assert.deepEqual(await onizleme('planlama_proje', emirA), { revizyonId: emreBagli.rev, kareler: [0, 1] });
    const k1 = await kare('planlama_proje', emirA, 1);
    assert.equal(k1.statusCode, 200);
    assert.equal(k1.headers['content-type'], 'image/png');
    assert.deepEqual(k1.rawPayload, png(2));
    assert.deepEqual(await onizleme('planlama_proje', emirB), { revizyonId: malzemeye.rev, kareler: [0] }, 'emre bağ yoksa malzemenin modeli');
    assert.deepEqual((await kare('planlama_proje', emirB, 0)).rawPayload, png(3));
    await bagla(emirOzel.belge, 'uretim-emirleri', emirB);
    assert.equal((await onizleme('planlama_proje', emirB))?.revizyonId, emirOzel.rev, 'emre bağlı model malzemeninkinden önce gelir');

    assert.equal(await onizleme('planlama_proje', bos), null, 'model yoksa null');
    assert.equal((await kare('planlama_proje', bos, 0)).statusCode, 404);
    assert.equal((await kare('planlama_proje', emirA, 5)).statusCode, 404, 'olmayan kare');

    await islemliKisiEkle('onizleme_kisitli', ['sayfa.atolye']);
    const kisi = await o().vt.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'onizleme_kisitli'");
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisi?.id, b.im]);
    assert.equal((await istek('onizleme_kisitli', 'GET', `/saat/emirler/${emirA}/onizleme`)).durum, 403, 'kapsam dışı emrin önizlemesi');
    assert.equal((await kare('onizleme_kisitli', emirA, 0)).statusCode, 403, 'kapsam dışı emrin karesi');
    assert.equal((await kare('oturumsuz', emirA, 0)).statusCode, 401);

    // Tezgahin modeli istasyona baglanir; parca modelinden ayri okunur, parcanin onizlemesini degistirmez.
    const tezgahOnizlemesi = async (ad: string, id: number) =>
      saatOnizlemesiCevabi.parse((await istek(ad, 'GET', `/saat/istasyonlar/${id}/onizleme`)).govde).onizleme;
    const tezgahKaresi = (ad: string, id: number, k: number) =>
      app.inject({ method: 'GET', url: `/api/saat/istasyonlar/${id}/onizleme/${k}`, headers: { cookie: cerezler.get(ad) ?? '' } });
    assert.equal(await tezgahOnizlemesi('planlama_proje', a.ist), null, 'tezgah modeli yoksa null');
    assert.equal((await tezgahKaresi('planlama_proje', a.ist, 0)).statusCode, 404);
    const tezgah = await model('Tezgah A', [png(5), png(6), png(7)]);
    await bagla(tezgah.belge, 'istasyonlar', a.ist);
    assert.deepEqual(await tezgahOnizlemesi('planlama_proje', a.ist), { revizyonId: tezgah.rev, kareler: [0, 1, 2] });
    assert.deepEqual((await tezgahKaresi('planlama_proje', a.ist, 2)).rawPayload, png(7));
    assert.equal((await tezgahKaresi('planlama_proje', a.ist, 3)).statusCode, 404, 'olmayan tezgah karesi');
    assert.equal((await onizleme('planlama_proje', emirA))?.revizyonId, emreBagli.rev, 'tezgah modeli parca onizlemesinin yerine gecmez');
    assert.equal(await tezgahOnizlemesi('planlama_proje', b.ist), null, 'baska istasyonun modeli gelmez');
    assert.equal((await istek('planlama_proje', 'GET', '/saat/istasyonlar/999999/onizleme')).durum, 404, 'olmayan istasyon');
    assert.equal((await istek('onizleme_kisitli', 'GET', `/saat/istasyonlar/${a.ist}/onizleme`)).durum, 403, 'kapsam disi tezgahin onizlemesi');
    assert.equal((await tezgahKaresi('onizleme_kisitli', a.ist, 0)).statusCode, 403, 'kapsam disi tezgahin karesi');
    assert.equal(await tezgahOnizlemesi('onizleme_kisitli', b.ist), null, 'kapsamdaki tezgah okunur');
    assert.equal((await tezgahKaresi('oturumsuz', a.ist, 0)).statusCode, 401);
  });
  test('vardiya: emir listesini okumayan rol 403; takvimsiz kişide vardiya null, son sekiz saat ve gün sayımı kapsamdaki istasyonlardan', async () => {
    assert.equal((await istek(null, 'GET', '/saat/vardiya')).durum, 401);
    assert.equal((await istek('operator', 'GET', '/saat/vardiya')).durum, 403);
    const c = await istek('planlama_proje', 'GET', '/saat/vardiya');
    assert.equal(c.durum, 200);
    const v = saatVardiyaCevabi.parse(c.govde);
    assert.equal(v.vardiya, null, 'istasyona atanmamış kişinin takvimi yoktur; vardiya uydurulmaz');
    assert.equal(v.saatlik.length, 8);
    assert.ok(v.saatlik.every((s, i) => i === 0 || Date.parse(s.baslangic) - Date.parse(v.saatlik[i - 1]!.baslangic) === 3_600_000));
    assert.equal(v.pencere.baslangic, new Date(tesisGunBasi(tesisGunu(Date.parse(v.zaman)))).toISOString());
    const ist = saatIstasyonlariCevabi.parse((await istek('planlama_proje', 'GET', '/saat/istasyonlar')).govde);
    const toplam = ist.istasyonlar.filter((i) => i.bugun !== null);
    assert.deepEqual(v.bugun, toplam.length === 0 ? null : {
      saglam: toplam.reduce((t, i) => t + i.bugun!.saglam, 0), hurda: toplam.reduce((t, i) => t + i.bugun!.hurda, 0),
    });
    assert.equal((await istek('harita', 'GET', '/saat/vardiya')).durum, 200);
  });

  test('sıradaki iş: yalnız plan okuyan rol; kapsam dışı istasyon 403; terminalin sırasında ilk bekleyen adım (Hazırlık sırası önce)', async () => {
    const im = await o().sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('SAMP', 'Plan Merkezi') RETURNING id");
    const ist = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('SAIP', 'CNC-P', $1) RETURNING id", [im?.id]))!.id;
    const mk = (await o().sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('SAKP', 'Tezgah P', $1) RETURNING id", [ist]))!.id;
    const yol = `/saat/istasyonlar/${ist}/siradaki`;
    assert.equal((await istek(null, 'GET', yol)).durum, 401);
    assert.equal((await istek('harita', 'GET', yol)).durum, 403, 'plan okumayan rol plan saatini görmez');
    assert.equal((await istek('planlama_proje', 'GET', '/saat/istasyonlar/999999/siradaki')).durum, 404);
    assert.equal(saatSiradakiCevabi.parse((await istek('planlama_proje', 'GET', yol)).govde).siradaki, null, 'canlı planda iş yoksa null');

    const sayi = (Date.now() % 100000) + 50000;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SA-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const urunNo = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'SA-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`sa-dnm-${sayi}`, sayi, JSON.stringify({ id: `sa-dnm-${sayi}`, com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    const rev = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('SA-TP', 'Plan tipi', 'TAL') RETURNING id"))!.id;
    const adim = (sira: number) => ({
      sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tip, kaynak: { tur: 'makine' as const, id: mk }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
    });
    const yonetici: Kullanici = { id: yoneticiId, ad: 'Deneme Yönetici', islemler: ['uretim-emirleri.yaz'] };
    const e = (await o().vt.tx((db) => uretimEmriAc(db, yonetici, {
      malzemeNo: urunNo, adet: 6, teslim: null, kaynakRotaRevizyonId: rev, projeId, isEmirleri: [adim(1), adim(2)],
    }))).uretimEmriId;
    const isler = (await o().sahip.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY sira', [e])).map((r) => r.id);
    const yerlestir = (isEmriId: number, saat: number) => o().sahip.sorgu(
      `INSERT INTO plan_yerlesimi (is_emri_id, makine_id, baslangic, bitis, yazan_kisi_id)
       VALUES ($1, $2, now() + make_interval(hours => $3), now() + make_interval(hours => $3 + 1), $4)`, [isEmriId, mk, saat, yoneticiId]);
    await yerlestir(isler[0]!, 2);
    await yerlestir(isler[1]!, 4);
    let s = saatSiradakiCevabi.parse((await istek('planlama_proje', 'GET', yol)).govde).siradaki;
    assert.deepEqual(s && { opNo: s.opNo, ad: s.ad, adet: s.adet, tezgah: s.tezgah }, { opNo: 10, ad: 'Adım 1', adet: 6, tezgah: 'Tezgah P' });

    // 3a: terminalin sırası. Hazırlık ikinci adımı öne aldıysa saat de onu gösterir; başka istasyonun sırası sayılmaz.
    const hazirla = (istasyon: number) => o().sahip.sorgu(
      'INSERT INTO arkon_kuyruk_sirasi (is_emri_id, parca_no, istasyon_id, sira, surum, kisi_id) VALUES ($1, 0, $2, 1, 1, $3)', [isler[1], istasyon, yoneticiId]);
    await hazirla(istasyonId);
    assert.equal(saatSiradakiCevabi.parse((await istek('planlama_proje', 'GET', yol)).govde).siradaki?.opNo, 10, 'başka istasyonun Hazırlık sırası');
    await o().sahip.sorgu('DELETE FROM arkon_kuyruk_sirasi WHERE is_emri_id = $1', [isler[1]]);
    await hazirla(ist);
    assert.equal(saatSiradakiCevabi.parse((await istek('planlama_proje', 'GET', yol)).govde).siradaki?.opNo, 20, 'Hazırlık sırası plandan önce');
    await o().sahip.sorgu('DELETE FROM arkon_kuyruk_sirasi WHERE is_emri_id = $1', [isler[1]]);

    // Çalışan adım sıradaki değildir: ilk adım başlayınca sıra ikinci adıma geçer.
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi ON CONFLICT DO NOTHING', [ist]);
    assert.equal((await uretim('operator', e, 'baslat')).durum, 200);
    s = saatSiradakiCevabi.parse((await istek('planlama_proje', 'GET', yol)).govde).siradaki;
    assert.equal(s?.opNo, 20);

    await islemliKisiEkle('plan_kisitli', ['plan.oku']);
    const kisi = await o().vt.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'plan_kisitli'");
    const sm1 = await o().vt.tek<{ id: number }>("SELECT id FROM is_merkezi WHERE kod = 'SAM1'");
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisi?.id, sm1?.id]);
    assert.equal((await istek('plan_kisitli', 'GET', yol)).durum, 403, 'kapsam dışı istasyonun sırası');
    assert.equal((await istek('plan_kisitli', 'GET', `/saat/istasyonlar/${istasyonId}/siradaki`)).durum, 200);
  });
  test('üstlenme: işlemsiz kişi 403; ilk üstlenen kazanır, ikinci 409; kapsam dışı ve kapanmış uyarı 404; 12 saat sonra başkası üstlenir', async () => {
    const im = await o().sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('SAMU', 'Üstlenme Merkezi') RETURNING id");
    const ist = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('SAIU', 'CNC-U', $1) RETURNING id", [im?.id]))!.id;
    await o().sahip.sorgu("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('SAKU', 'Tezgah U', $1)", [ist]);
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi ON CONFLICT DO NOTHING', [ist]);
    const e = await emirYaz({ parcaNo: 'DNM-U', parcaAd: 'Deneme mil', adet: 2, istasyonId: ist });
    assert.equal((await uretim('operator', e, 'baslat')).durum, 200);
    assert.equal((await uretim('operator', e, 'durdur', { durusNedeniId: durusId })).durum, 200);

    await islemliKisiEkle('ustlenen_a', ['sayfa.atolye', 'saat.uyari-ustlen']);
    await islemliKisiEkle('ustlenen_b', ['sayfa.atolye', 'saat.uyari-ustlen']);
    await islemliKisiEkle('ustlenen_kisitli', ['sayfa.atolye', 'saat.uyari-ustlen']);
    const kisitli = await o().vt.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'ustlenen_kisitli'");
    const sm1 = await o().vt.tek<{ id: number }>("SELECT id FROM is_merkezi WHERE kod = 'SAM1'");
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisitli?.id, sm1?.id]);

    const liste = async (ad: string) => saatUyarilariCevabi.parse((await istek(ad, 'GET', '/saat/uyarilar')).govde);
    const durus = async (ad: string) => (await liste(ad)).uyarilar.find((u) => u.tur === 'durus' && u.istasyon?.id === ist);
    const u = await durus('ustlenen_a');
    assert.ok(u, 'duruş uyarısı listede');
    assert.equal(u.ustlenen, null);
    assert.equal((await liste('ustlenen_a')).ustlenebilir, true);
    assert.equal((await liste('harita')).ustlenebilir, false, 'işlemi olmayan kişide düğme yok');

    const ustlen = (ad: string | null, kimlik: string) => istek(ad, 'POST', '/saat/uyarilar/ustlen', { kimlik });
    assert.equal((await ustlen(null, u.kimlik)).durum, 401);
    assert.equal((await ustlen('harita', u.kimlik)).durum, 403, 'işlemsiz kişi üstlenemez');
    assert.equal((await ustlen('ustlenen_kisitli', u.kimlik)).durum, 404, 'kapsam dışı uyarı görünmez, üstlenilemez');
    assert.equal((await ustlen('ustlenen_a', 'durus|0||||')).durum, 404, 'olmayan uyarı');
    assert.equal((await ustlen('ustlenen_a', 'x'.repeat(301))).durum, 400);

    const c = await ustlen('ustlenen_a', u.kimlik);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(saatUyarilariCevabi.parse(c.govde).uyarilar.find((x) => x.kimlik === u.kimlik)?.ustlenen?.ad, 'Deneme ustlenen_a');
    assert.equal((await durus('ustlenen_b'))?.ustlenen?.ad, 'Deneme ustlenen_a', 'başkası da üstleneni görür');
    assert.equal((await ustlen('ustlenen_b', u.kimlik)).durum, 409, 'geçerli üstlenme varken başkası üstlenemez');
    assert.equal((await ustlen('ustlenen_a', u.kimlik)).durum, 200, 'aynı kişi yeniden üstlenebilir');

    await o().sahip.sorgu("UPDATE saat_uyari_ustlenme SET ustlenme = now() - interval '13 hours' WHERE kimlik = $1", [u.kimlik]);
    assert.equal((await durus('ustlenen_b'))?.ustlenen, null, 'süresi geçen üstlenme gösterilmez');
    assert.equal((await ustlen('ustlenen_b', u.kimlik)).durum, 200, 'süresi geçince başkası üstlenir');
    assert.equal((await durus('ustlenen_a'))?.ustlenen?.ad, 'Deneme ustlenen_b');

    // Üstlenme uyarıyı kapatmaz: duruş kaynağında bitince uyarı listeden düşer ve artık üstlenilemez.
    assert.equal((await uretim('operator', e, 'devam')).durum, 200);
    assert.equal(await durus('ustlenen_a'), undefined);
    assert.equal((await ustlen('ustlenen_a', u.kimlik)).durum, 404);
  });
});
