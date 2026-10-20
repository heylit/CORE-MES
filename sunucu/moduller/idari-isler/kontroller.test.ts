import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { BugunCevabi, Kontrol, KontrolCevabi, KontrolKayitlariCevabi, KontrollerCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

// Rol x işlem satırları Çekirdek göçünde (216 a); burada yetki kişiye ek işlemle verilir.
describe('idari-isler periyodik kontroller (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sayac = 0;
  let idari = { cerez: '', id: 0 };
  let okuyan = { cerez: '', id: 0 };
  let personel = { cerez: '', id: 0 };
  let firma = 0;
  let pasifFirma = 0;
  let bugun = '';

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function girisYap(islemler: string[]): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `idari-k-${(sayac += 1)}`;
    const id = await o().vt.tx(async (db) => {
      const ilk = yoneticiId === 0;
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (!ilk) {
        // Yerleşik roller (216 a ile operatör de) idari işlem taşır; deneme kişisi işlemsiz rolle girer, işlemi kişiye ayrıca verilir.
        await db.sorgu("INSERT INTO rol (kod, ad) VALUES ('deneme_islemsiz', 'Deneme işlemsiz') ON CONFLICT (kod) DO NOTHING");
        const rol = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'deneme_islemsiz'");
        const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
        await rolAl(db, yoneticiId, yeni, yon?.id ?? 0);
      }
      return yeni;
    });
    if (yoneticiId === 0) yoneticiId = id;
    for (const islem of islemler) {
      await o().sahip.sorgu('INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, $2, $3)', [id, islem, yoneticiId]);
    }
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }

  const gonder = (cerez: string, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const oku = (cerez: string, yol: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });
  const gunSonra = (gun: number): string => {
    const d = new Date(`${bugun}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + gun);
    return d.toISOString().slice(0, 10);
  };

  async function ekle(degisen: Record<string, unknown> = {}): Promise<Kontrol> {
    const c = await gonder(idari.cerez, '/idari-isler/kontroller/ekle', {
      ad: 'Yangın tüpleri', tur: 'yasal', siklikDeger: 6, siklikBirim: 'ay', sonrakiTarih: gunSonra(10), ...degisen,
    });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<KontrolCevabi>().kontrol;
  }
  const komut = (k: Kontrol, ad: string, govde: Record<string, unknown> = {}) =>
    gonder(idari.cerez, `/idari-isler/kontroller/${k.id}/${ad}`, { surum: k.surum, ...govde });

  before(async () => {
    ortam = await testVeritabaniKur('idari_isler_kontrol');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await girisYap([]);
    idari = await girisYap(['idari-isler.oku', 'idari-isler.kontrol-yaz']);
    okuyan = await girisYap(['idari-isler.oku']);
    personel = await girisYap(['idari-isler.talep-ac']);
    const ekleFirma = async (ad: string, aktif: boolean) => (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, aktif) VALUES ($1, 'tedarikci', $2, $3) RETURNING id", [ad, yoneticiId, aktif]))!.id;
    firma = await ekleFirma('Deneme Kontrol Firmasi', true);
    pasifFirma = await ekleFirma('Deneme Pasif Firma', false);
    bugun = (await o().sahip.tek<{ bugun: string }>('SELECT current_date AS bugun'))!.bugun;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('IDR-12 ekleme ve liste: kalem grup ve kalan günle döner; firma adı okunur', async () => {
    const k = await ekle({ firmaId: firma });
    assert.equal(k.kalanGun, 10);
    assert.equal(k.grup, 'yakin');
    assert.equal(k.firmaAd, 'Deneme Kontrol Firmasi');
    const gecen = await ekle({ ad: 'Basınç testi', sonrakiTarih: gunSonra(-3) });
    assert.equal(gecen.grup, 'gecti');
    const liste = (await oku(okuyan.cerez, '/idari-isler/kontroller')).json<KontrollerCevabi>().kontroller;
    assert.ok(liste.some((x) => x.id === k.id) && liste.some((x) => x.id === gecen.id));
  });

  test('ekleme reddi: pasif firma, eksik sıklık 400; yetki: okuyan ve personel yazamaz, personel okuyamaz', async () => {
    const yanlis = (g: Record<string, unknown>) => gonder(idari.cerez, '/idari-isler/kontroller/ekle', {
      ad: 'X', tur: 'yasal', sonrakiTarih: gunSonra(5), ...g,
    });
    assert.equal((await yanlis({ firmaId: pasifFirma })).statusCode, 400);
    assert.equal((await yanlis({ siklikDeger: 3 })).statusCode, 400);
    assert.equal((await yanlis({ tur: 'bilinmeyen' })).statusCode, 400);
    const say = async () => (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM idari_isler_kontrol'))!.n;
    const once = await say();
    assert.equal((await gonder(okuyan.cerez, '/idari-isler/kontroller/ekle', { ad: 'X', tur: 'yasal', sonrakiTarih: gunSonra(5) })).statusCode, 403);
    assert.equal((await gonder(personel.cerez, '/idari-isler/kontroller/ekle', { ad: 'X', tur: 'yasal', sonrakiTarih: gunSonra(5) })).statusCode, 403);
    assert.equal(await say(), once);
    assert.equal((await oku(personel.cerez, '/idari-isler/kontroller')).statusCode, 403);
    assert.equal((await oku(okuyan.cerez, '/idari-isler/firma-secenekleri')).statusCode, 403);
  });

  test('IDR-13 yapıldı: kayıt eklenir, sonraki tarih sıklıktan ilerler, kalemin firması kayda yazılır; eski sürüm 409', async () => {
    const k = await ekle({ firmaId: firma, siklikDeger: 1, siklikBirim: 'yil' });
    const c = await komut(k, 'yapildi', { yapilma: bugun, belgeNo: 'RPR-1' });
    assert.equal(c.statusCode, 200, c.body);
    const yeni = c.json<KontrolCevabi>().kontrol;
    assert.equal(yeni.surum, k.surum + 1);
    assert.equal(yeni.grup, 'sonra');
    assert.equal((await komut(k, 'yapildi', { yapilma: bugun })).statusCode, 409);
    const kayitlar = (await oku(okuyan.cerez, `/idari-isler/kontroller/${k.id}/kayitlar`)).json<KontrolKayitlariCevabi>().kayitlar;
    assert.equal(kayitlar.length, 1);
    assert.equal(kayitlar[0]?.oncekiTarih, k.sonrakiTarih);
    assert.equal(kayitlar[0]?.sonrakiTarih, yeni.sonrakiTarih);
    assert.equal(kayitlar[0]?.belgeNo, 'RPR-1');
    assert.equal(kayitlar[0]?.firmaAd, 'Deneme Kontrol Firmasi');
    assert.equal(kayitlar[0]?.kaydedenAd?.startsWith('Deneme'), true);
  });

  test('IDR-13 red: gelecek tarih, miktarsız atık, sıklıksız kalemde tarihsiz kayıt 400; kalem değişmez', async () => {
    const atik = await ekle({ ad: 'Talaş teslimi', tur: 'atik', siklikDeger: 2, siklikBirim: 'hafta' });
    assert.equal((await komut(atik, 'yapildi', { yapilma: gunSonra(1), miktar: '10', birim: 'kg' })).statusCode, 400);
    assert.equal((await komut(atik, 'yapildi', { yapilma: bugun })).statusCode, 400);
    const sozlesme = await ekle({ ad: 'Temizlik sözleşmesi', tur: 'sozlesme', siklikDeger: null, siklikBirim: null });
    assert.equal((await komut(sozlesme, 'yapildi', { yapilma: bugun })).statusCode, 400);
    const teslim = await komut(atik, 'yapildi', { yapilma: bugun, miktar: '120.500', birim: 'kg' });
    assert.equal(teslim.statusCode, 200, teslim.body);
    const yenile = await komut(sozlesme, 'yapildi', { yapilma: bugun, sonrakiTarih: gunSonra(365) });
    assert.equal(yenile.json<KontrolCevabi>().kontrol.kalanGun, 365);
    const kayit = (await oku(okuyan.cerez, `/idari-isler/kontroller/${atik.id}/kayitlar`)).json<KontrolKayitlariCevabi>().kayitlar[0];
    assert.equal(kayit?.miktar, '120.500');
    assert.equal(kayit?.birim, 'kg');
  });

  test('IDR-15 bitir: biten kalem listeden çıkar, değiştirilemez ve yeniden bitirilemez (422)', async () => {
    const k = await ekle({ ad: 'Bina sigortası', tur: 'sozlesme', siklikDeger: 1, siklikBirim: 'yil' });
    const b = await komut(k, 'bitir', { neden: 'Firma değişti' });
    assert.equal(b.statusCode, 200, b.body);
    const bitmis = b.json<KontrolCevabi>().kontrol;
    assert.equal(bitmis.aktif, false);
    assert.equal((await komut(bitmis, 'yapildi', { yapilma: bugun })).statusCode, 422);
    assert.equal((await komut(bitmis, 'bitir')).statusCode, 422);
    const liste = (await oku(okuyan.cerez, '/idari-isler/kontroller')).json<KontrollerCevabi>().kontroller;
    assert.ok(!liste.some((x) => x.id === k.id));
  });

  test('güncelleme: ad, sıklık ve tarih değişir; eski sürüm 409; olmayan kalem 404', async () => {
    const k = await ekle();
    const c = await komut(k, 'guncelle', { ad: 'Yangın tüpleri (30 adet)', siklikDeger: 1, siklikBirim: 'yil', sonrakiTarih: gunSonra(40) });
    assert.equal(c.statusCode, 200, c.body);
    assert.equal(c.json<KontrolCevabi>().kontrol.grup, 'sonra');
    assert.equal((await komut(k, 'guncelle', { ad: 'Y', sonrakiTarih: gunSonra(1) })).statusCode, 409);
    assert.equal((await gonder(idari.cerez, '/idari-isler/kontroller/999999/guncelle', { surum: 1, ad: 'Y', sonrakiTarih: gunSonra(1) })).statusCode, 404);
  });

  test('IDR-14 Bugün ve sayaç: süresi geçen ve 7 gün içindeki kalem Bugün\'e düşer; periyodik sayacı geçenleri sayar', async () => {
    const gecen = await ekle({ ad: 'Topraklama ölçümü', sonrakiTarih: gunSonra(-1) });
    const yakin = await ekle({ ad: 'İlaçlama', sonrakiTarih: gunSonra(7) });
    const uzak = await ekle({ ad: 'Asansör muayenesi', sonrakiTarih: gunSonra(8) });
    const b = (await oku(okuyan.cerez, '/idari-isler/bugun')).json<BugunCevabi>();
    const idler = b.isler.flatMap((i) => (i.tur === 'kontrol' ? [i.kontrol.id] : []));
    assert.ok(idler.includes(gecen.id) && idler.includes(yakin.id));
    assert.ok(!idler.includes(uzak.id));
    assert.ok(b.sayilar.gecenKontrol >= 1);
    const s = (await oku(okuyan.cerez, '/idari-isler/menu-sayaclari')).json<Record<string, number | null>>();
    assert.equal(s.periyodik, b.sayilar.gecenKontrol);
    const p = (await oku(personel.cerez, '/idari-isler/menu-sayaclari')).json<Record<string, number | null>>();
    assert.equal(p.periyodik, null);
  });

  test('firma seçenekleri yalnız etkin tedarikçileri verir', async () => {
    const c = (await oku(idari.cerez, '/idari-isler/firma-secenekleri?ara=Deneme')).json<{ firmalar: { id: number }[] }>();
    assert.ok(c.firmalar.some((f) => f.id === firma));
    assert.ok(!c.firmalar.some((f) => f.id === pasifFirma));
  });

  test('kısıtlar: kayıt değişmez ve silinmez; miktar birimsiz olmaz (veritabanı)', async () => {
    const k = await ekle();
    await komut(k, 'yapildi', { yapilma: bugun });
    await assert.rejects(o().sahip.sorgu('UPDATE idari_isler_kontrol_kaydi SET belge_no = $1 WHERE kontrol_id = $2', ['X', k.id]));
    await assert.rejects(o().sahip.sorgu('DELETE FROM idari_isler_kontrol_kaydi WHERE kontrol_id = $1', [k.id]));
    await assert.rejects(
      o().sahip.sorgu(
        'INSERT INTO idari_isler_kontrol_kaydi (kontrol_id, yapilma, onceki_tarih, sonraki_tarih, miktar, kaydeden_kisi_id) VALUES ($1, $2, $2, $3, 5, $4)',
        [k.id, bugun, gunSonra(1), yoneticiId],
      ),
      /idari_isler_kontrol_kaydi_miktar_birim/,
    );
  });
});
