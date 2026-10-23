import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { SiparisAyrintisi, SiparisDonusumCevabi, TeklifAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import {
  logoyaGidecekSatisSiparisleri, logoyaGidecekSatisTeklifleri, satisSiparisiLogoSonucu, satisTeklifiLogoSonucu,
} from './disari.ts';
import type { SiparislerLogoTeklifi } from './disari.ts';

const PAROLA = 'dogru-parola-1';
const SINIR = 500;

describe('siparisler Logo satış sırası (H10; gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let sayac = 0;
  let musteriId = 0;
  let mamulNo = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function girisYap(rolKodu: string | null): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `sip-logo-${(sayac += 1)}`;
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

  async function komut<T = TeklifAyrintisi>(yol: string, govde: Record<string, unknown>, cerez = yonetici): Promise<T> {
    const c = await gonder(cerez, yol, govde);
    assert.equal(c.statusCode, 200, c.body);
    return c.json<T>();
  }
  async function teklifAc(): Promise<TeklifAyrintisi> {
    return komut('/siparisler/teklifler/ekle', {
      firmaId: musteriId, baslik: 'Logo deneme talebi', istenenTarih: '2026-11-30', aciklama: null,
      satirlar: [{ malzemeNo: mamulNo, tanim: 'Deneme parça A', miktar: '100' }, { malzemeNo: mamulNo, tanim: 'Deneme parça B', miktar: '10' }],
    });
  }
  const surumVer = (t: TeklifAyrintisi, iskontoOrani: string, ...birim: string[]): Promise<TeklifAyrintisi> =>
    komut(`/siparisler/teklifler/${t.id}/surum-ver`, {
      surum: t.surum, fiyatlar: t.satirlar.map((s, i) => ({ satirId: s.id, birimFiyat: birim[i] ?? '1' })), iskontoOrani, gecerlilik: '2026-12-31',
    });

  const teklifSirasi = async (no: string): Promise<SiparislerLogoTeklifi[]> =>
    (await o().vt.tx((db) => logoyaGidecekSatisTeklifleri(db, SINIR))).filter((t) => t.no === no || t.no.startsWith(`${no}-R`));
  const siparisSirasi = async (no: string) => (await o().vt.tx((db) => logoyaGidecekSatisSiparisleri(db, SINIR))).filter((s) => s.no === no);

  async function kartAc(): Promise<number> {
    sayac += 1;
    const kimlik = `sip-logo-dnm-${sayac}`;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'SLG-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [kimlik, sayac, JSON.stringify({ id: kimlik, com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
  }

  before(async () => {
    ortam = await testVeritabaniKur('siparisler_logo');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const y = await girisYap(null);
    yonetici = y.cerez;
    yoneticiId = y.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SLG-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    mamulNo = await kartAc();
    musteriId = (await komut<{ firma: { id: number } }>('/musteri-tedarikci/firmalar/ekle', { ad: 'Logo deneme müşteri', tur: 'musteri' })).firma.id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('müşteriye verilen her sürüm ayrı teklif olarak sıraya girer; yanıtsız talep girmez; satırda kart kodu, sürüm fiyatı ve iskonto', async () => {
    let t = await teklifAc();
    assert.deepEqual(await teklifSirasi(t.no), []);
    t = await surumVer(t, '5', '10', '20');
    t = await surumVer(t, '0', '12', '22');
    const sira = await teklifSirasi(t.no);
    assert.deepEqual(sira.map((x) => x.no), [t.no, `${t.no}-R2`]);
    const [ilk, ikinci] = sira;
    assert.deepEqual([ilk?.firmaId, ilk?.paraBirimi, ilk?.gecerlilikBitis, ilk?.kur], [musteriId, 'TRY', '2026-12-31', null]);
    assert.match(ilk?.tarih ?? '', /^\d{4}-\d{2}-\d{2}$/);
    const kod = t.satirlar[0]?.malzemeKodu;
    assert.ok(kod);
    assert.deepEqual(ilk?.satirlar.map((s) => [s.satirId, s.stokKodu, s.hizmet, s.miktar, s.birimFiyat, s.iskontoYuzdesi]),
      t.satirlar.map((s, i) => [s.id, kod, false, s.miktar, i === 0 ? '10.0000' : '20.0000', '5.00']));
    assert.deepEqual(ikinci?.satirlar.map((s) => [s.birimFiyat, s.iskontoYuzdesi]), [['12.0000', null], ['22.0000', null]]);
  });

  test('iskonto onayı bekleyen sürüm müşteriye gitmediği için sıraya girmez; müdür onaylayınca girer', async () => {
    const mudur = await girisYap('mudur');
    let t = await teklifAc();
    t = await surumVer(t, '10.01', '10', '20');
    assert.equal(t.durum, 'onay-bekliyor');
    assert.deepEqual(await teklifSirasi(t.no), []);
    await komut(`/siparisler/teklifler/${t.id}/iskonto-onayla`, { surum: t.surum }, mudur.cerez);
    assert.deepEqual((await teklifSirasi(t.no)).map((x) => [x.no, x.satirlar[0]?.iskontoYuzdesi]), [[t.no, '10.01']]);
  });

  test('sipariş kabul edilen sürümün Logo teklifinden, sipariş onaylanınca gider; teklif Logo\'da yokken ve taslakken gitmez', async () => {
    let t = await teklifAc();
    t = await surumVer(t, '0', '10', '20');
    t = await surumVer(t, '0', '11', '21');
    t = await komut(`/siparisler/teklifler/${t.id}/kabul`, { surum: t.surum, surumNo: 1 });
    const d = await komut<SiparisDonusumCevabi>(`/siparisler/teklifler/${t.id}/siparise-donustur`, {
      surum: t.surum, siparisTarihi: '2026-10-19', termin: '2026-11-20', kdvOrani: '20', musteriSiparisNo: null,
    });
    let s = await komut<SiparisAyrintisi>(`/siparisler/${d.siparisId}/onayla`, { surum: (await app.inject({
      method: 'GET', url: `/api/siparisler/${d.siparisId}`, headers: { cookie: yonetici },
    })).json<SiparisAyrintisi>().surum });
    assert.equal(s.durum, 'onayli');
    assert.deepEqual(await siparisSirasi(s.no), []);

    const [ilk] = await teklifSirasi(t.no);
    assert.ok(ilk);
    await o().vt.tx((db) => satisTeklifiLogoSonucu(db, ilk.id, {
      kayitNo: '7001', satirlar: ilk.satirlar.map((x, i) => ({ satirId: x.satirId, logoSatirRef: String(7101 + i) })),
    }));
    assert.deepEqual((await teklifSirasi(t.no)).map((x) => x.no), [`${t.no}-R2`]);
    const [sp] = await siparisSirasi(s.no);
    assert.deepEqual([sp?.teklifKayitNo, sp?.tarih], ['7001', '2026-10-19']);
    assert.deepEqual(sp?.satirlar.map((x) => [x.teklifSatirRef, x.miktar]), [['7101', '100.000'], ['7102', '10.000']]);

    await o().vt.tx((db) => satisSiparisiLogoSonucu(db, sp!.id, { kayitNo: '8001', satirlar: sp!.satirlar.map((x) => ({ satirId: x.satirId, logoSatirRef: '8101' })) }));
    assert.deepEqual(await siparisSirasi(s.no), []);
    s = (await app.inject({ method: 'GET', url: `/api/siparisler/${d.siparisId}`, headers: { cookie: yonetici } })).json<SiparisAyrintisi>();
    assert.equal(s.durum, 'onayli');
  });

  test('hata sonucu sırada kalır ve bekleyenlerin arkasına geçer; başka Logo kaydıyla gönderilmiş satıra ikinci kayıt yazılmaz', async () => {
    let a = await teklifAc();
    a = await surumVer(a, '0', '1', '1');
    const [x] = await teklifSirasi(a.no);
    assert.ok(x);
    await o().vt.tx((db) => satisTeklifiLogoSonucu(db, x.id, { hata: 'Firmanın Logo cari kodu yok.' }));
    let b = await teklifAc();
    b = await surumVer(b, '0', '1', '1');
    const hepsi = await o().vt.tx((db) => logoyaGidecekSatisTeklifleri(db, SINIR));
    const sira = hepsi.map((t) => t.no);
    assert.ok(sira.indexOf(b.no) < sira.indexOf(a.no), sira.join(','));
    const hata = await o().sahip.tek<{ durum: string; hata: string }>('SELECT durum, hata FROM siparisler_logo_gonderim WHERE id = $1', [x.id]);
    assert.deepEqual(hata, { durum: 'hata', hata: 'Firmanın Logo cari kodu yok.' });

    await o().vt.tx((db) => satisTeklifiLogoSonucu(db, x.id, { kayitNo: '9001', satirlar: [] }));
    await assert.rejects(o().vt.tx((db) => satisTeklifiLogoSonucu(db, x.id, { kayitNo: '9002', satirlar: [] })), { kod: 'GECERSIZ' });
    await o().vt.tx((db) => satisTeklifiLogoSonucu(db, x.id, { kayitNo: '9001', satirlar: [] }));
  });
});
