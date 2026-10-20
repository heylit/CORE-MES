import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { LogoHazirlikCevabi, LogoKontrolCevabi } from '#paylasilan/sozlesme/logo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { kontrolAdiminiYorumla, LOGO_AKISLARI, LOGO_KONTROL_ADIMLARI, logoAkisDurumu } from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import { hazirlik, kontrol } from './servis.ts';

const PAROLA = 'dogru-parola-1';

describe('LOGO-H1 akış durumu', () => {
  const bagli = { kaynak: 'bagli' as const, ayarlar: ['logo.satis-gonderimi'] };
  test('kod, ortam, bağlantı ve kendi anahtarı tamamsa hazır; biri eksikse nedeni', () => {
    const acik = { 'logo.baglanti': true, 'logo.satis-gonderimi': true };
    assert.equal(logoAkisDurumu(bagli, { ortamVar: true, ayarlar: acik }), 'hazir');
    assert.equal(logoAkisDurumu(bagli, { ortamVar: false, ayarlar: acik }), 'ayar-eksik');
    assert.equal(logoAkisDurumu(bagli, { ortamVar: true, ayarlar: { ...acik, 'logo.baglanti': false } }), 'kapali');
    assert.equal(logoAkisDurumu(bagli, { ortamVar: true, ayarlar: { ...acik, 'logo.satis-gonderimi': false } }), 'kapali');
  });
  test('bağlanmamış ve yazılmamış akış ayarlar açık olsa da hazır değildir', () => {
    const acik = { 'logo.baglanti': true, 'logo.satin-alma-gonderimi': true };
    assert.equal(logoAkisDurumu({ kaynak: 'baglanmadi', ayarlar: ['logo.satin-alma-gonderimi'] }, { ortamVar: true, ayarlar: acik }), 'baglanmadi');
    assert.equal(logoAkisDurumu({ kaynak: 'kodda-yok', ayarlar: [] }, { ortamVar: true, ayarlar: acik }), 'kodda-yok');
  });
  test('iki anahtarlı akışta (hizmet kartı) biri açıksa yeter', () => {
    const t = LOGO_AKISLARI.find((a) => a.anahtar === 'hizmet-karti');
    assert.ok(t);
    const ayarlar = { 'logo.baglanti': true, 'logo.hizmet-alinan-gonderimi': false, 'logo.hizmet-verilen-gonderimi': true };
    assert.equal(logoAkisDurumu(t, { ortamVar: true, ayarlar }), 'hazir');
    assert.equal(logoAkisDurumu(t, { ortamVar: true, ayarlar: { ...ayarlar, 'logo.hizmet-verilen-gonderimi': false } }), 'kapali');
  });
});

describe('LOGO-H2/H3 canlı kontrol yalnız okur', () => {
  test('LOGO-H3: 2xx tamam; success=false ve 404 hata ama sürer; 401 ve ağ hatası sonrakileri durdurur', () => {
    assert.deepEqual(kontrolAdiminiYorumla({ durum: 200, govde: [] }), { sonuc: 'tamam', ileti: 'Cevap geldi (200).', devam: true });
    assert.equal(kontrolAdiminiYorumla({ durum: 200, govde: { success: false, error: 'x' } }).sonuc, 'hata');
    assert.deepEqual(kontrolAdiminiYorumla({ durum: 404, govde: null }), { sonuc: 'hata', ileti: 'Köprü isteği reddetti (404).', devam: true });
    assert.equal(kontrolAdiminiYorumla({ durum: 401, govde: null }).devam, false);
    assert.equal(kontrolAdiminiYorumla({ tur: 'ulasilamadi', ileti: 'Köprüye ulaşılamadı (ECONNREFUSED).' }).devam, false);
  });

  test('LOGO-H2 kabul: sahte köprüde üç adım tamam, yalnız GET gider, anahtar başlıkta', async () => {
    const k = await sahteKopruAc();
    try {
      const r = await kontrol(kopruIstemcisiKur({ adres: k.adres, anahtar: k.anahtar }, { sureMs: 5000 }), () => new Date('2026-10-15T10:00:00Z'));
      assert.equal(r.ulasildi, true);
      assert.deepEqual(r.adimlar.map((a) => a.sonuc), ['tamam', 'tamam', 'tamam']);
      assert.deepEqual(k.istekler.map((i) => `${i.yontem} ${i.yol}`), LOGO_KONTROL_ADIMLARI.map((a) => `GET ${a.yol}`));
      assert.ok(k.istekler.every((i) => i.anahtar === k.anahtar));
      assert.equal(k.acilan.size + k.siparisAcilan.size + k.hizmetAcilan.size, 0, 'kontrol Logo\'da kayıt açmaz');
    } finally {
      await k.kapat();
    }
  });

  test('LOGO-H2 (ret): yanlış anahtarda ilk adım hata, kalanlar atlanır; köprüye tek istek gider', async () => {
    const k = await sahteKopruAc();
    try {
      const r = await kontrol(kopruIstemcisiKur({ adres: k.adres, anahtar: 'yanlis-anahtar' }, { sureMs: 5000 }));
      assert.equal(r.ulasildi, false);
      assert.deepEqual(r.adimlar.map((a) => a.sonuc), ['hata', 'atlandi', 'atlandi']);
      assert.match(r.adimlar[0]?.ileti ?? '', /anahtarı reddedildi/);
      assert.equal(k.istekler.length, 1);
    } finally {
      await k.kapat();
    }
  });

  test('LOGO-H2 (ret): köprüye ulaşılamazsa hata, ileti adres ve anahtar taşımaz', async () => {
    const k = await sahteKopruAc();
    const adres = k.adres;
    await k.kapat();
    const r = await kontrol(kopruIstemcisiKur({ adres, anahtar: 'gizli-anahtar-123' }, { sureMs: 2000 }));
    assert.equal(r.ulasildi, false);
    assert.deepEqual(r.adimlar.map((a) => a.sonuc), ['hata', 'atlandi', 'atlandi']);
    const metin = JSON.stringify(r);
    assert.ok(!metin.includes(adres) && !metin.includes('gizli-anahtar-123'), metin);
  });

  test('köprü tanımlı değilse istek atılmaz, adımlar atlanır', async () => {
    const r = await kontrol(null);
    assert.equal(r.ulasildi, false);
    assert.ok(r.adimlar.every((a) => a.sonuc === 'atlandi'));
  });
});

describe('Logo hazırlık uçları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let okuyucu = '';
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  const oku = (yol: string, cerez: string) => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });

  before(async () => {
    ortam = await testVeritabaniKur('logohaz');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'lh-yonetici', parola: PAROLA }));
    const id = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Okuyucu', kullaniciAdi: 'lh-okuyucu', parola: PAROLA }));
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('lh_ayarci', 'Ayarcı')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.ayarlar' FROM rol WHERE kod = 'lh_ayarci'");
    await vt().sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'lh_ayarci') WHERE kisi_id = $1", [id]);
    yonetici = await giris('lh-yonetici');
    okuyucu = await giris('lh-okuyucu');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('yönetici hazırlığı okur; ortam değişkeni yokken bağlı akışlar "ayar eksik", anahtar hiç görünmez', async () => {
    await vt().sorgu(
      `INSERT INTO logo_giden (belge_turu, belge_no, deneme_sayisi, son_deneme, son_sonuc, son_hata, logo_kayit_no) VALUES
         ('malzeme', 1, 1, '2026-10-15T08:00:00Z', 'gonderildi', NULL, '11'), ('malzeme', 2, 1, '2026-10-15T09:00:00Z', 'zaten-vardi', NULL, '12'),
         ('malzeme', 3, 2, '2026-10-15T07:00:00Z', 'reddedildi', 'Logo reddetti.', NULL)`,
    );
    const c = await oku('/logo/hazirlik', yonetici);
    assert.equal(c.statusCode, 200, c.body);
    const h = c.json<LogoHazirlikCevabi>();
    assert.deepEqual(h.ortam, { adres: null, anahtarTanimli: false });
    assert.equal(h.baglanti, 'kapali');
    const malzeme = h.akislar.find((a) => a.anahtar === 'malzeme-karti');
    assert.equal(malzeme?.durum, 'ayar-eksik');
    assert.equal(malzeme?.gonderilen, 2);
    assert.equal(malzeme?.hatali, 1);
    assert.ok(malzeme?.sonDeneme?.startsWith('2026-10-15'));
    assert.equal(h.akislar.find((a) => a.anahtar === 'mal-kabul')?.durum, 'ayar-eksik');
    assert.equal(h.akislar.find((a) => a.anahtar === 'malzeme-fisi')?.durum, 'ayar-eksik');
    assert.equal(h.akislar.find((a) => a.anahtar === 'fatura')?.durum, 'ayar-eksik');
    assert.equal(h.akislar.find((a) => a.anahtar === 'satin-alma-siparisi')?.durum, 'ayar-eksik');
    assert.equal(h.akislar.find((a) => a.anahtar === 'malzeme-guncelleme')?.durum, 'ayar-eksik');
    assert.ok(!h.akislar.some((a) => a.durum === 'kodda-yok'), 'kodu olmayan akış kalmadı');
    assert.deepEqual(['logo.mal-kabul-okumasi', 'logo.liste-okumasi', 'logo.fatura-okumasi', 'logo.malzeme-fisi-gonderimi', 'logo.malzeme-guncelleme-gonderimi']
      .map((k) => h.ayarlar.find((a) => a.anahtar === k)?.acik), [false, false, false, false, false], 'yeni akışlar kapalı gelir');
    assert.equal(h.akislar.find((a) => a.anahtar === 'mal-kabul')?.hatali, null, 'okuma akışının hatalı sayısı yoktur');
    assert.equal(h.akislar.find((a) => a.anahtar === 'mal-kabul')?.gonderilen, 0);
    assert.ok(h.ayarlar.some((a) => a.anahtar === 'logo.baglanti' && a.acik === false));
  });

  test('köprü tanımlı ve anahtarlar açıkken bağlı akış hazır (servis)', async () => {
    const k = await sahteKopruAc();
    try {
      const a = await app.inject({ method: 'POST', url: '/api/ayarlar/logo.baglanti/degistir', headers: { cookie: yonetici }, payload: { deger: true } });
      assert.equal(a.statusCode, 200, a.body);
      const kopru = kopruIstemcisiKur({ adres: k.adres, anahtar: k.anahtar });
      const h = await vt().okumaTx((db) => hazirlik(db, kopru, { adres: k.adres, anahtarTanimli: true }));
      assert.equal(h.baglanti, 'acik');
      assert.equal(h.akislar.find((a) => a.anahtar === 'malzeme-karti')?.durum, 'hazir');
      assert.equal(h.akislar.find((a) => a.anahtar === 'satis')?.durum, 'kapali');
      assert.equal(k.istekler.length, 0, 'hazırlık okuması köprüye istek atmaz');
    } finally {
      await k.kapat();
    }
  });

  test('kontrol ucu yönetici için cevap verir; değişken yokken istek atmadan atlar', async () => {
    const c = await oku('/logo/hazirlik/kontrol', yonetici);
    assert.equal(c.statusCode, 200, c.body);
    const r = c.json<LogoKontrolCevabi>();
    assert.equal(r.ulasildi, false);
    assert.ok(r.adimlar.every((a) => a.sonuc === 'atlandi'));
  });

  test('(ret) sistem ayrıntısı yetkisi olmayan iki ucu da göremez', async () => {
    assert.equal((await oku('/logo/hazirlik', okuyucu)).statusCode, 403);
    assert.equal((await oku('/logo/hazirlik/kontrol', okuyucu)).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/logo/hazirlik' })).statusCode, 401);
  });
});
