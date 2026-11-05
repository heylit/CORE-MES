import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { ArsivKartiCevabi, ArsivKartlariCevabi, KatalogKartiKaydetCevabi, KatalogKartlariCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tamGovde } from './test-kart.ts';

const PAROLA = 'dogru-parola-1';

// 2114c (2114-3 a, 2114-4 a): Arşiv. Bağ sayımı sunucu/kablolama.ts'in gerçek bağıyla gelir (test ön yüklemesi kablolar).
describe('Malzemeler Arşiv (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let onayci = '';
  let onayci2 = '';
  let yazar = '';
  let okuyucu = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerezi }, ...(govde === undefined ? {} : { payload: tamGovde(url, govde) as object }) });
  async function tamam<T>(cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<T> {
    const c = await istek(cerezi, yontem, url, govde);
    assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
    return c.json() as T;
  }
  async function ret(durum: number, kod: string, cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown) {
    const c = await istek(cerezi, yontem, url, govde);
    assert.deepEqual({ durum: c.statusCode, kod: c.json().kod }, { durum, kod }, `${yontem} ${url}: ${c.body}`);
    return c;
  }
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function girisYap(kullaniciAdi: string, rolKodu: string, aktor?: number): Promise<{ id: number; cerez: string }> {
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (hedefRol !== yoneticiRolu && aktor !== undefined) {
        await rolAta(db, aktor, yeni, hedefRol);
        await rolAl(db, aktor, yeni, yoneticiRolu);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { id, cerez: String(c.headers['set-cookie']).split(';')[0] ?? '' };
  }

  let sayac = 0;
  const kart = () => {
    const kimlik = `ars${++sayac}`;
    return {
      kimlik,
      govde: (surum: number | null, durum = 'taslak') => ({
        kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', com: { kod: 'HM-ARS-00001', ad: `Arşiv kart ${kimlik}`, birim: 'adet' }, onay: { durum } },
        ozet: { stok_kodu: 'HM-ARS-00001', tur: 'hammadde', onay_durumu: durum, benzersiz_anahtar: `HM|metal|${kimlik}`, mukerrer_gerekcesi: null },
        surum,
      }),
    };
  };
  const kaydet = (cerezi: string, k: ReturnType<typeof kart>, surum: number | null, durum?: string) =>
    tamam<KatalogKartiKaydetCevabi>(cerezi, 'POST', `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`, k.govde(surum, durum));
  const satir = async (k: ReturnType<typeof kart>) => (await vt().tek<{ no: number; stokKodu: string; durum: string }>(
    'SELECT no, stok_kodu AS "stokKodu", onay_durumu AS durum FROM malzeme_katalog_karti WHERE kimlik = $1', [k.kimlik]));
  // Kart açılır, istenirse bir kez aktif olur, sonra katalogdan silinir (2114a): arşive düşer.
  async function arsivlenmis(aktifOlsun = false): Promise<ReturnType<typeof kart>> {
    const k = kart();
    let r = await kaydet(onayci, k, null, aktifOlsun ? 'onayda' : 'taslak');
    if (aktifOlsun) r = await kaydet(onayci2, k, r.surum, 'aktif');
    await tamam(onayci, 'POST', `/malzeme-katalogu-kartlari/${k.kimlik}/iptal`);
    return k;
  }
  const arsivKarti = (k: ReturnType<typeof kart>) => tamam<ArsivKartiCevabi>(okuyucu, 'GET', `/malzeme-arsivi/${k.kimlik}`);

  before(async () => {
    ortam = await testVeritabaniKur('malzemearsiv');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const ilk = await girisYap('a-onayci', 'yonetici');
    onayci = ilk.cerez;
    onayci2 = (await girisYap('a-onayci-iki', 'yonetici')).cerez;
    yazar = (await girisYap('a-yazar', 'satin_alma', ilk.id)).cerez;
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('okuyucu', 'Okuyucu')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.malzemeler' FROM rol WHERE kod = 'okuyucu'");
    okuyucu = (await girisYap('a-okuyucu', 'okuyucu', ilk.id)).cerez;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('ARS-1: silinen kart arşivde silen ve zamanla görünür; bağı yoksa adetler sıfır; aktif kart arşivde yok', async () => {
    const k = await arsivlenmis();
    const canli = kart();
    await kaydet(onayci, canli, null);
    const liste = await tamam<ArsivKartlariCevabi>(okuyucu, 'GET', '/malzeme-arsivi');
    const bulunan = liste.kartlar.find((x) => x.kimlik === k.kimlik);
    assert.ok(bulunan, 'silinen kart listede');
    assert.deepEqual(
      [bulunan.stokKodu, bulunan.ad, bulunan.tur, bulunan.silen?.ad, bulunan.logoyaGitti, bulunan.kesinAdet, bulunan.olasiAdet],
      [(await satir(k))!.stokKodu, `Arşiv kart ${k.kimlik}`, 'hammadde', 'Deneme a-onayci', false, 0, 0],
    );
    assert.match(bulunan.silinme, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(!liste.kartlar.some((x) => x.kimlik === canli.kimlik), 'katalogdaki kart arşivde görünmez');
    assert.deepEqual((await arsivKarti(k)).izler, []);
    await ret(404, 'BULUNAMADI', okuyucu, 'GET', `/malzeme-arsivi/${canli.kimlik}`);
  });

  test('ARS-2 (2114-4 a): kesin bağ ve olası iz modül adıyla görünür ve kalıcı silmeyi engeller; temizlenince kart kalıcı silinir', async () => {
    const k = await arsivlenmis();
    const { no, stokKodu } = (await satir(k))!;
    await vt().sorgu('INSERT INTO istasyonlar_aparat_kapasitesi (aparat_karti_id, adet, degistiren_kisi_id) SELECT $1, 1, acan_kisi_id FROM malzeme_katalog_karti WHERE no = $1', [no]);
    await vt().sorgu(
      "INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) SELECT 'recete-rota-motoru-v1:ars-iz', 'json', jsonb_build_object('not', $1::text), 1, acan_kisi_id FROM malzeme_katalog_karti WHERE no = $2",
      [stokKodu, no],
    );
    const ayrinti = await arsivKarti(k);
    assert.deepEqual(
      ayrinti.izler?.map(({ modul, kayit, tur, adet }) => ({ modul, kayit, tur, adet })),
      [{ modul: 'İstasyonlar', kayit: 'Aparat kapasitesi', tur: 'kesin', adet: 1 }, { modul: 'Reçete-rota', kayit: 'Reçete-rota kaydı', tur: 'olasi', adet: 1 }],
    );
    assert.deepEqual([ayrinti.kart.kesinAdet, ayrinti.kart.olasiAdet], [1, 1]);
    await ret(409, 'BAGIMLI_KAYIT', onayci, 'POST', `/malzeme-arsivi/${k.kimlik}/kalici-sil`, { stokKodu });
    await vt().sorgu('DELETE FROM istasyonlar_aparat_kapasitesi WHERE aparat_karti_id = $1', [no]);
    await ret(409, 'BAGIMLI_KAYIT', onayci, 'POST', `/malzeme-arsivi/${k.kimlik}/kalici-sil`, { stokKodu });
    await vt().sorgu("DELETE FROM recete_rota_kayit WHERE anahtar = 'recete-rota-motoru-v1:ars-iz'");
    await vt().sorgu('INSERT INTO malzemeler_demirbas_teknik (kart_kimlik, guncelleyen_kisi_id) SELECT kimlik, acan_kisi_id FROM malzeme_katalog_karti WHERE kimlik = $1', [k.kimlik]);
    await tamam(onayci, 'POST', `/malzeme-arsivi/${k.kimlik}/kalici-sil`, { stokKodu });
    assert.equal(await satir(k), null, 'kart kalıcı silinir');
    assert.equal(await vt().tek('SELECT 1 FROM malzemeler_demirbas_teknik WHERE kart_kimlik = $1', [k.kimlik]), null, 'kartın kendi alt kaydı da gider');
    await ret(404, 'BULUNAMADI', onayci, 'POST', `/malzeme-arsivi/${k.kimlik}/kalici-sil`, { stokKodu });
  });

  test('ARS-3: kalıcı silme stok kodu yazılarak onaylanır; Logo\'ya gönderilmiş kart silinmez; yetki yalnız onaycıda', async () => {
    const k = await arsivlenmis();
    const { stokKodu } = (await satir(k))!;
    await ret(422, 'GECERSIZ', onayci, 'POST', `/malzeme-arsivi/${k.kimlik}/kalici-sil`, { stokKodu: 'HM-ARS-99999' });
    await ret(403, 'YETKI_YOK', yazar, 'POST', `/malzeme-arsivi/${k.kimlik}/kalici-sil`, { stokKodu });
    await ret(403, 'YETKI_YOK', okuyucu, 'POST', `/malzeme-arsivi/${k.kimlik}/kalici-sil`, { stokKodu });
    await ret(403, 'YETKI_YOK', yazar, 'POST', `/malzeme-arsivi/${k.kimlik}/geri-getir`);
    await vt().sorgu("UPDATE malzeme_katalog_karti SET logo_gonderim_durumu = 'gonderildi', logo_kayit_no = 'L-ARS', logo_gonderim_zamani = now() WHERE kimlik = $1", [k.kimlik]);
    assert.equal((await arsivKarti(k)).kart.logoyaGitti, true);
    await ret(422, 'GECERSIZ', onayci, 'POST', `/malzeme-arsivi/${k.kimlik}/kalici-sil`, { stokKodu });
    assert.equal((await satir(k))?.durum, 'iptal');
  });

  test('ARS-4: geri getirilen kart kataloğa döner; bir kez aktif olmuşsa pasif, hiç olmamışsa taslak', async () => {
    const taslak = await arsivlenmis();
    const aktif = await arsivlenmis(true);
    await tamam(onayci, 'POST', `/malzeme-arsivi/${taslak.kimlik}/geri-getir`);
    await tamam(onayci, 'POST', `/malzeme-arsivi/${aktif.kimlik}/geri-getir`);
    assert.deepEqual([(await satir(taslak))?.durum, (await satir(aktif))?.durum], ['taslak', 'pasif']);
    const liste = await tamam<ArsivKartlariCevabi>(okuyucu, 'GET', '/malzeme-arsivi');
    assert.ok(!liste.kartlar.some((x) => x.kimlik === taslak.kimlik || x.kimlik === aktif.kimlik), 'geri gelen kart arşivden çıkar');
    const katalog = await tamam<KatalogKartlariCevabi>(okuyucu, 'GET', '/malzeme-katalogu-kartlari?sayfaBoyu=500');
    assert.ok(katalog.satirlar.find((x) => x.kimlik === aktif.kimlik)?.kayit, 'katalogda gövdesiyle görünür');
    await ret(404, 'BULUNAMADI', onayci, 'POST', `/malzeme-arsivi/${aktif.kimlik}/geri-getir`);
  });
});
