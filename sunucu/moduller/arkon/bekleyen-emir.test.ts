import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';

// 3131: bekletilen emrin (3050 a) paketi okumada `tmi.bekletme` (nedenin adı) taşır; yayın durumu değişmez, hiçbir şey yazılmaz. Liste,
// tek okuma ve yazım aynı sürümü görür (Hazırlık bekleme sırasında paketi kaydedebilir). Devamda alan düşer. Veriler uydurmadır.
describe('arkon bekleyen emrin paketi (3131, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let revId = 0;
  let makineId = 0;
  const PAROLA = 'dogru-parola-1';
  const kisiler = new Map<string, Kullanici>();
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = (ad: string): Kullanici => {
    const k = kisiler.get(ad);
    if (k === undefined) throw new Error(`kişi yok: ${ad}`);
    return k;
  };
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
    kisiler.set(kullaniciAdi, k);
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
  }
  const istek = async (ad: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown) => {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, ...(govde === undefined ? {} : { payload: govde as object }),
      headers: { cookie: ad === null ? '' : (cerezler.get(ad) ?? ''), [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
    });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  const adim = (sira: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const emirAc = async () => o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
    malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revId, projeId, isEmirleri: [adim(1)],
  }));

  before(async () => {
    ortam = await testVeritabaniKur('arkon_bekleyen_emir');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerezler.set('yonetici', String(giris.headers['set-cookie']).split(';')[0] ?? '');
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('AR.BKL', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await kisiEkle('planlama_proje', 'planlama_proje');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('BKL-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('BKL-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('bkl-dnm-1', 'mamul', 'BKL-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'bkl-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    revId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('BKLM', 'Deneme Merkezi') RETURNING id");
    const istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('BKLI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('BKL1', 'Tezgah', $1) RETURNING id", [istasyonId]))!.id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  type Paket = { kimlik: string; surum: number; govde: { status?: string; tmi?: { isEmriId?: number; bekletme?: unknown; sayimKaynagi?: unknown } } };
  const paketler = async (): Promise<Paket[]> => {
    const c = await istek('yonetici', 'GET', '/arkon/belgeler/pkgs');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return (c.govde as { belgeler: Paket[] }).belgeler;
  };
  const paketi = async (isEmriId: number): Promise<Paket> => {
    const p = (await paketler()).find((b) => b.govde.tmi?.isEmriId === isEmriId);
    assert.ok(p, `iş emri ${String(isEmriId)} paketi listede`);
    return p;
  };

  test('bekletilen emrin paketi nedenle işaretlenir, yayın durumu değişmez; tek okuma aynı sürüm; kayıt çakışmaz; devamda işaret düşer', async () => {
    const { uretimEmriId: emirId, isEmriIdleri: [isEmriId] } = await emirAc();
    assert.ok(isEmriId);
    const once = await paketi(isEmriId);
    assert.equal(once.govde.tmi?.bekletme, undefined, 'beklemeyen emirde alan yok');

    const b = await istek('yonetici', 'POST', `/uretim-emirleri/${String(emirId)}/beklet`, { neden: 'malzeme' });
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    const bekleyen = await paketi(isEmriId);
    assert.equal(bekleyen.govde.tmi?.bekletme, 'Malzeme bekleniyor');
    assert.equal(bekleyen.govde.status, once.govde.status, 'yayın durumu değişmez');
    assert.equal((await o().vt.tek<{ n: number }>("SELECT count(*)::int AS n FROM arkon_belge WHERE depo = 'pkgs'"))!.n, 0, 'hiçbir şey yazılmaz');
    const tek = await istek('yonetici', 'GET', `/arkon/belgeler/pkgs/${encodeURIComponent(bekleyen.kimlik)}`);
    assert.equal(tek.durum, 200);
    assert.deepEqual((tek.govde as { belge: { surum: number; govde: unknown } }).belge, { surum: bekleyen.surum, govde: bekleyen.govde }, 'tek okuma listedekiyle aynı');

    // Hazırlık bekleme sırasında paketi kaydeder: listedeki sürüm taban olur, çakışma dönmez; işaret kayıtlı satıra güvenilmez, taslaktan gelir.
    const yaz = await istek('yonetici', 'POST', `/arkon/belgeler/pkgs/${encodeURIComponent(bekleyen.kimlik)}/yaz`, { taban: null, govde: bekleyen.govde, kaynak: 'bkl' });
    assert.equal(yaz.durum, 200, JSON.stringify(yaz.govde));
    assert.equal((yaz.govde as { sonuc: string }).sonuc, 'yazildi');
    const kayitli = await paketi(isEmriId);
    assert.equal(kayitli.govde.tmi?.bekletme, 'Malzeme bekleniyor', 'kayıtlı pakette de işaret');
    const ikinci = await istek('yonetici', 'POST', `/arkon/belgeler/pkgs/${encodeURIComponent(kayitli.kimlik)}/yaz`, { taban: kayitli.surum, govde: kayitli.govde, kaynak: 'bkl' });
    assert.equal((ikinci.govde as { sonuc: string }).sonuc, 'yazildi', 'listedeki sürümle yazım çakışmaz');

    const d = await istek('yonetici', 'POST', `/uretim-emirleri/${String(emirId)}/bekletme-kaldir`, {});
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    const sonra = await paketi(isEmriId);
    assert.equal(sonra.govde.tmi?.bekletme, undefined, 'devamda işaret düşer, kayıtlı paket yeniden yazılmadan');
  });

  test('3173: sayımı SmartES’ten gelen istasyondaki işin paketi işaret taşır; kayıtlı pakette de, istasyon terminale dönünce düşer', async () => {
    const { isEmriIdleri: [isEmriId] } = await emirAc();
    assert.ok(isEmriId);
    const kaynak = (k: 'terminal' | 'smartes') => o().vt.sorgu("UPDATE istasyon SET sayim_kaynagi = $1, sayim_kaynagi_gecerlilik = now() WHERE kod = 'BKLI'", [k]);
    assert.equal((await paketi(isEmriId)).govde.tmi?.sayimKaynagi, undefined, 'terminalden sayılan istasyonda alan yok');
    await kaynak('smartes');
    assert.equal((await paketi(isEmriId)).govde.tmi?.sayimKaynagi, undefined, 'aktarım anahtarı kapalıyken alan yok');
    assert.equal((await istek('yonetici', 'POST', '/ayarlar/smartes.sayim-aktarimi/degistir', { deger: true })).durum, 200);
    const isaretli = await paketi(isEmriId);
    assert.equal(isaretli.govde.tmi?.sayimKaynagi, 'smartes');
    const yaz = await istek('yonetici', 'POST', `/arkon/belgeler/pkgs/${encodeURIComponent(isaretli.kimlik)}/yaz`, { taban: null, govde: isaretli.govde, kaynak: 'bkl' });
    assert.equal((yaz.govde as { sonuc: string }).sonuc, 'yazildi', JSON.stringify(yaz.govde));
    assert.equal((await paketi(isEmriId)).govde.tmi?.sayimKaynagi, 'smartes', 'kayıtlı pakette de işaret');
    await kaynak('terminal');
    assert.equal((await paketi(isEmriId)).govde.tmi?.sayimKaynagi, undefined, 'kayıtlı satırdaki eski işarete güvenilmez');
  });
});
