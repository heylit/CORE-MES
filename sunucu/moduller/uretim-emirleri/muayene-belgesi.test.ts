import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { SurumluOperasyonTipi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { AdimDurumuCevabi, MuayeneBelgeleriCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { fasonDonusuKaydet, fasonGidis, fasonTamamla } from './is-emri-servis.ts';
import { emirBaslat, emirBitir } from './servis.ts';
import { isEmirleriGetir } from './sorgular/is-emri/sorgular.ts';
import { KONTROL_ADIMI_KALITEDEN, MUAYENE_BELGESI_EKSIK, OTOMATIK_MUAYENE } from './kurallar.ts';
import { kaynaktaMuayeneOnayla } from './kontrol-adimi.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// 3708 kabul ölçütü 6: kaynağında muayene, operasyon tipinde adı yazılı belgeler yüklenmeden onaylanmaz (adım bitirilmez).
describe('uretim-emirleri kaynağında muayene belge kapısı (3708; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Kullanici;
  let cerez = '';
  let tipId = 0;
  let muayeneTipi = 0;
  let urunNo = 0;
  let rev = 0;
  let firma = 0;
  let projeId = 0;
  let makine = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tx = <T>(is: (db: Db) => Promise<T>): Promise<T> => o().vt.tx(is);
  async function istek<T = unknown>(yontem: 'GET' | 'POST', yol: string, govde?: unknown, kimCerez = cerez): Promise<Cevap<T>> {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: kimCerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: (c.headers['content-type']?.includes('json') === true ? c.json() : c.rawPayload) as T };
  }
  // Sentetik PDF: imzası türü belirler, gerisi rastgele; gerçek sertifika yok.
  async function belgeYukle(kimCerez = cerez): Promise<string> {
    const icerik = Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(2000)]);
    const ozet = createHash('sha256').update(icerik).digest('hex');
    const r = await istek('POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') }, kimCerez);
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    return ozet;
  }
  const ic = (op: number): IsEmriGirdisi => ({
    sira: op / 10, opNo: op, ad: `Adım ${op}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makine },
    ayarSuresiDk: '10', birimSureDk: '1', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const kaynakta = (op: number): IsEmriGirdisi => ({
    ...ic(op), ad: `Fason ${op}`, kaynak: { tur: 'fason', id: firma }, ayarSuresiDk: null, birimSureDk: null, terminGun: 3, kontrolTuru: 'kaynakta', muayeneSuresiSaat: 1,
  });
  // Muayene bekliyor: önceki adım bitti, parça fasonda (3809: muayene terminalden başlamaz, Kalite Merkezi onaylar).
  async function muayenedeEmir(): Promise<{ emirId: number; muayeneId: number; ilkId: number; fasonId: number; sonId: number }> {
    const r = await tx((db) => uretimEmriAc(db, yonetici, { malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: [ic(10), kaynakta(20), ic(30)], projeId }));
    const [ilkId, fasonId] = r.isEmriIdleri as [number, number];
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'planli' WHERE id = $1", [r.uretimEmriId]);
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 10 WHERE id = $1", [ilkId]);
    await tx((db) => fasonGidis(db, yonetici, r.uretimEmriId, fasonId, 10));
    const m = (await tx((db) => isEmirleriGetir(db, [r.uretimEmriId]))).find((i) => i.ekAciklama === OTOMATIK_MUAYENE);
    assert.ok(m, 'muayene adımı fason adımının arkasına girer');
    return { emirId: r.uretimEmriId, muayeneId: m.id, ilkId, fasonId, sonId: r.isEmriIdleri[2]! };
  }
  const yol = (emirId: number, isEmriId: number) => `/adimli-emirler/${String(emirId)}/is-emirleri/${String(isEmriId)}/muayene-belgeleri`;
  const bitir = (emirId: number, isEmriId: number, saglam?: number) => tx((db) => emirBitir(db, yonetici.id, emirId, saglam, null, undefined, isEmriId));
  const onayla = (isEmriId: number, saglam = 10, red = 0) => tx((db) => kaynaktaMuayeneOnayla(db, yonetici, isEmriId, { saglam, red }));

  before(async () => {
    ortam = await testVeritabaniKur('uretim_muayene_belgesi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'muayene-belge', parola: PAROLA }));
    yonetici = (await ortam.vt.tx((db) => kullaniciYukle(db, yoneticiId)))!;
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'muayene-belge', parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.MBK', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('MB-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    // 3809: tip koddan bulunur; göç KYM tipini açar.
    muayeneTipi = (await ortam.sahip.tek<{ id: number }>("SELECT id FROM istasyonlar_operasyon_tipi WHERE kod = 'KYM'"))!.id;
    firma = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fasoncu', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('MBM1', 'Deneme Merkezi') RETURNING id");
    const ist = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, tip) VALUES ('MBI1', 'Deneme talaşlı', $1, 'talasli') RETURNING id", [im?.id]))!.id;
    makine = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('MBMK1', 'Tezgah', $1) RETURNING id", [ist]))!.id;
    await ortam.sahip.sorgu("INSERT INTO istasyon (kod, ad, is_merkezi_id, tip) VALUES ('MBI2', 'Deneme kalite', $1, 'kalite')", [im?.id]);
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('MB-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('mb-dnm-1', 'mamul', 'MB-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'mb-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('zorunlu belge tanımsızsa muayene bugünkü gibi bitirilir; adım durumu muayene adımını işaretler', async () => {
    const { emirId, muayeneId, ilkId, fasonId, sonId } = await muayenedeEmir();
    const v = await istek<MuayeneBelgeleriCevabi>('GET', yol(emirId, muayeneId));
    assert.equal(v.durum, 200, JSON.stringify(v.govde));
    assert.deepEqual(v.govde, { zorunlu: [], eksik: [], belgeler: [] });
    const d = await istek<AdimDurumuCevabi>('GET', `/adimli-emirler/${String(emirId)}/adim-durumu`);
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.deepEqual(d.govde.adimlar.filter((a) => a.muayene === true).map((a) => a.isEmriId), [muayeneId]);
    assert.equal((await istek('GET', yol(emirId, ilkId))).durum, 409, 'muayene olmayan adıma belge bağlanmaz');
    // Fason adımı açıkken (parça firmada) muayene onaylanır: kendi fason öncülü sıradan düşer. Kalite 10 sağlam onaylar; terminal adımı yürütmez.
    await assert.rejects(tx((db) => emirBaslat(db, yonetici.id, emirId, undefined, muayeneId)), new RegExp(KONTROL_ADIMI_KALITEDEN.slice(0, 30)));
    await assert.rejects(bitir(emirId, muayeneId, 10), new RegExp(KONTROL_ADIMI_KALITEDEN.slice(0, 30)), 'terminal bitirmez');
    await onayla(muayeneId, 10);
    assert.equal((await o().sahip.tek<{ d: string }>('SELECT durum AS d FROM uretim_emirleri_is_emri WHERE id = $1', [muayeneId]))?.d, 'tamam');
    // Risk R1: muayeneden sonraki iç adım, parça firmadayken (fason açık) bitmez; dönüş girip fason kapanınca biter.
    await tx((db) => emirBaslat(db, yonetici.id, emirId, undefined, sonId));
    await assert.rejects(bitir(emirId, sonId), /OP 20 bitmeden OP 30 bitirilemez/);
    await tx((db) => fasonDonusuKaydet(db, yonetici.id, emirId, fasonId, 10, 0));
    await tx((db) => fasonTamamla(db, yonetici, emirId, fasonId));
    await bitir(emirId, sonId);
  });

  test('operasyon tipinde zorunlu belgeler yazılır; eksik belgeyle muayene bitirilemez, yüklenince biter; kaldırılan belge kapıyı yeniden kapatır', async () => {
    const tip = (await istek<{ operasyonTipleri: SurumluOperasyonTipi[] }>('GET', '/operasyon-tipleri?pasifler=true')).govde.operasyonTipleri.find((t) => t.id === muayeneTipi)!;
    const g = await istek<SurumluOperasyonTipi>('POST', `/operasyon-tipleri/${String(muayeneTipi)}/guncelle`, {
      ad: tip.ad, grup: tip.grup, aktif: tip.aktif, surum: tip.surum, zorunluBelgeler: [' Malzeme sertifikası ', 'Test raporu', '', 'Test raporu'],
    });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.deepEqual(g.govde.zorunluBelgeler, ['Malzeme sertifikası', 'Test raporu'], 'kırpılır, boş atılır, tekrar teke iner');
    // Alanı göndermeyen güncelleme (satır içi aktif/pasif) listeyi silmez.
    const g2 = await istek<SurumluOperasyonTipi>('POST', `/operasyon-tipleri/${String(muayeneTipi)}/guncelle`, { ad: tip.ad, grup: tip.grup, aktif: true, surum: g.govde.surum });
    assert.deepEqual(g2.govde.zorunluBelgeler, ['Malzeme sertifikası', 'Test raporu']);

    const { emirId, muayeneId } = await muayenedeEmir();
    await assert.rejects(onayla(muayeneId), (h: Error) => h.message.includes(MUAYENE_BELGESI_EKSIK) && h.message.includes('Malzeme sertifikası, Test raporu'));

    const ozet1 = await belgeYukle();
    const yanlis = await istek('POST', yol(emirId, muayeneId), { ozet: ozet1, dosyaAdi: 'ORN-sertifika.pdf', belgeTuru: 'Fatura' });
    assert.equal(yanlis.durum, 400, 'belge türü zorunlu adlardan biri olmalı');
    const b1 = await istek<MuayeneBelgeleriCevabi>('POST', yol(emirId, muayeneId), { ozet: ozet1, dosyaAdi: 'ORN-sertifika.pdf', belgeTuru: 'Malzeme sertifikası' });
    assert.equal(b1.durum, 200, JSON.stringify(b1.govde));
    assert.deepEqual([b1.govde.eksik, b1.govde.belgeler.map((b) => [b.ad, b.belgeTuru])], [['Test raporu'], [['ORN-sertifika.pdf', 'Malzeme sertifikası']]]);
    await assert.rejects(onayla(muayeneId), (h: Error) => h.message.includes('Eksik: Test raporu.'));

    const ozet2 = await belgeYukle();
    const b2 = await istek<MuayeneBelgeleriCevabi>('POST', yol(emirId, muayeneId), { ozet: ozet2, dosyaAdi: 'ORN-rapor.pdf', belgeTuru: 'Test raporu' });
    assert.deepEqual(b2.govde.eksik, []);
    const dosya = await istek('GET', `${yol(emirId, muayeneId)}/${ozet2}/dosya`);
    assert.equal(dosya.durum, 200);

    const k = await istek<MuayeneBelgeleriCevabi>('POST', `${yol(emirId, muayeneId)}/${ozet2}/kaldir`);
    assert.deepEqual([k.durum, k.govde.eksik], [200, ['Test raporu']]);
    assert.equal((await istek('POST', `${yol(emirId, muayeneId)}/${ozet2}/kaldir`)).durum, 404);
    await assert.rejects(onayla(muayeneId), (h: Error) => h.message.includes(MUAYENE_BELGESI_EKSIK));

    assert.equal((await istek('POST', yol(emirId, muayeneId), { ozet: ozet2, dosyaAdi: 'ORN-rapor.pdf', belgeTuru: 'Test raporu' })).durum, 200);
    await onayla(muayeneId);
    const durum = await o().sahip.tek<{ d: string }>('SELECT durum AS d FROM uretim_emirleri_is_emri WHERE id = $1', [muayeneId]);
    assert.equal(durum?.d, 'tamam');
    // Risk R2: biten muayenenin belgesi kaldırılmaz.
    const sonra = await istek<{ mesaj?: string }>('POST', `${yol(emirId, muayeneId)}/${ozet2}/kaldir`);
    assert.deepEqual([sonra.durum, sonra.govde.mesaj], [409, 'Muayene bitti; onaylı muayenenin belgesi kaldırılamaz.']);
    assert.deepEqual((await istek<MuayeneBelgeleriCevabi>('GET', yol(emirId, muayeneId))).govde.eksik, []);
  });

  // Test1 G2, 3809: kalite (fason yetkisi yok) belgeleri görür ve açar; muayeneyi onayladığı için belgeyi bağlar ve kaldırır.
  test('kalite belgeleri okur, açar, bağlar ve kaldırır', async () => {
    const rol = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'kalite'");
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    assert.ok(rol && yoneticiRolu, 'rol yok');
    await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme kalite', kullaniciAdi: 'muayene-kalite', parola: PAROLA });
      await rolAta(db, yonetici.id, yeni, rol.id);
      await rolAl(db, yonetici.id, yeni, yoneticiRolu.id);
    });
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'muayene-kalite', parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    const kalite = String(g.headers['set-cookie']).split(';')[0] ?? '';
    const { emirId, muayeneId } = await muayenedeEmir();
    const ozet = await belgeYukle();
    assert.equal((await istek('POST', yol(emirId, muayeneId), { ozet, dosyaAdi: 'ORN-k.pdf', belgeTuru: 'Test raporu' })).durum, 200);
    const kendi = await belgeYukle(kalite);
    const v = await istek<MuayeneBelgeleriCevabi>('GET', yol(emirId, muayeneId), undefined, kalite);
    assert.deepEqual([v.durum, v.govde.belgeler.map((b) => b.ad)], [200, ['ORN-k.pdf']]);
    assert.equal((await istek('GET', `${yol(emirId, muayeneId)}/${ozet}/dosya`, undefined, kalite)).durum, 200);
    const bag = await istek('POST', yol(emirId, muayeneId), { ozet: kendi, dosyaAdi: 'ORN-k2.pdf', belgeTuru: 'Malzeme sertifikası' }, kalite);
    assert.equal(bag.durum, 200, JSON.stringify(bag.govde));
    assert.equal((await istek('POST', `${yol(emirId, muayeneId)}/${kendi}/kaldir`, undefined, kalite)).durum, 200);
  });

  test('belge bir emrin muayenesine bağlıdır: başka emrin yolundan okunmaz', async () => {
    const a = await muayenedeEmir();
    const b = await muayenedeEmir();
    const ozet = await belgeYukle();
    assert.equal((await istek('POST', yol(a.emirId, a.muayeneId), { ozet, dosyaAdi: 'ORN-a.pdf', belgeTuru: 'Test raporu' })).durum, 200);
    assert.equal((await istek('GET', `${yol(b.emirId, b.muayeneId)}/${ozet}/dosya`)).durum, 404);
    assert.equal((await istek('GET', `${yol(b.emirId, a.muayeneId)}/${ozet}/dosya`)).durum, 404, 'iş emri başka emrin');
  });
});
