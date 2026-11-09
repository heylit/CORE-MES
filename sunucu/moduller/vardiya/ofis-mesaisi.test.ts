import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { OfisMesaisiCevabi, TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { isGunuSonrasi, kisilerinIsGunleri, tesisIsGunleri } from './disari.ts';

// 2452: ofis mesaisi (vardiyanın kendi günleri), departman ve tesis varsayılanı, kişi başına iş günü ve `vardiya.tanim-yaz` (2452-1 a).
// Tarihler 2099'dadır: 2099-10-05 pazartesi. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const HAFTA = { baslangic: '2099-10-05', bitis: '2099-10-11' };
const PZT_CUM = ['2099-10-05', '2099-10-06', '2099-10-07', '2099-10-08', '2099-10-09'];

describe('vardiya (gerçek PostgreSQL): ofis mesaisi ve iş günü (2452)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c: Record<'yonetici' | 'ikci' | 'operator' | 'kisitli', string> = { yonetici: '', ikci: '', operator: '', kisitli: '' };
  let sayac = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tek = async (sql: string, p: unknown[] = []): Promise<number> => (await o().sahip.tek<{ id: number }>(sql, p))!.id;

  async function istek<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, baslik: Record<string, string> = {}): Promise<{ durum: number; govde: T }> {
    const cevap = await app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerez, ...baslik }, payload: payload as object | undefined });
    return { durum: cevap.statusCode, govde: cevap.json() as T };
  }
  const tamam = async <T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, baslik?: Record<string, string>): Promise<T> => {
    const cevap = await istek<T>(cerez, yontem, url, payload, baslik);
    assert.equal(cevap.durum, 200, JSON.stringify(cevap.govde));
    return cevap.govde;
  };
  const kimlikli = () => ({ [ISTEK_KIMLIGI_BASLIGI]: randomUUID() });
  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  const kisi = () => tek('INSERT INTO kisi (ad) VALUES ($1) RETURNING id', [`Deneme ofis ${String(++sayac)}`]);
  let ikMerkezi = 0;
  const personel = (kisiId: number, departmanNo: number | null) => o().sahip.sorgu(
    `INSERT INTO ik_personel (kimlik, ad, soyad, kisi_id, departman_no, is_merkezi_id, olusturan_kisi_id, guncelleyen_kisi_id)
     VALUES ($1, 'Ad', 'Deneme', $2, $3, $4, $5, $5)`, [`dnm_ofis_${String(++sayac)}`, kisiId, departmanNo, ikMerkezi, yoneticiId]);
  const departman = () => tek(
    'INSERT INTO ik_departman (kimlik, ad, olusturan_kisi_id, guncelleyen_kisi_id) VALUES ($1, $2, $3, $3) RETURNING no AS id',
    [`dnm_dep_${String(++sayac)}`, `Deneme departman ${String(sayac)}`, yoneticiId],
  );
  const vardiyaAc = async (cerez: string, ad: string) => {
    const t = await tamam<TakvimCevabi>(cerez, 'POST', '/vardiyalar', { ad, baslangic: '08:30', bitis: '17:30', molalar: [] }, kimlikli());
    return t.vardiyalar.find((v) => v.ad === ad)!.id;
  };
  const gunler = async (kisiId: number, aralik = HAFTA) => (await kisilerinIsGunleri(o().vt, [kisiId], aralik)).get(kisiId);

  before(async () => {
    ortam = await testVeritabaniKur('vardiya_ofis');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await girisCerezi('yonetici');
    const roller = (await tamam<{ roller: { id: number; ad: string }[] }>(c.yonetici, 'GET', '/roller')).roller;
    for (const [ad, rolAdi] of [['ikci', 'İnsan Kaynakları'], ['operator', 'Operatör'], ['kisitli', 'Planlama ve Proje']] as const) {
      const rol = roller.find((r) => r.ad === rolAdi)!.id;
      await o().vt.tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
        const k = await rolAta(db, yoneticiId, id, rol);
        for (const r of k.roller) if (r.id !== rol) await rolAl(db, yoneticiId, id, r.id);
      });
      c[ad] = await girisCerezi(ad);
    }
    ikMerkezi = (await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'OF-IK', ad: 'Deneme ofis merkezi', aciklama: null })).id;
    const kisitliId = (await o().sahip.tek<{ id: number }>("SELECT id FROM kisi WHERE ad = 'Deneme kisitli'"))!.id;
    await tamam(c.yonetici, 'POST', `/kisi-is-merkezleri/${String(kisitliId)}/belirle`, { isMerkeziIdleri: [ikMerkezi] });
  });
  after(async () => { await ortam?.kaldir(); });

  test('2452-1 a: İK rolü vardiya.tanim-yaz taşır, vardiya.yaz taşımaz; tanım yazar, matris ve fazla mesai yazamaz; operatör hiçbirini yazamaz', async () => {
    const ik = await o().vt.tx(async (db) => kullaniciYukle(db, (await db.tek<{ id: number }>("SELECT id FROM kisi WHERE ad = 'Deneme ikci'"))!.id));
    assert.ok(ik?.islemler.includes('vardiya.tanim-yaz'));
    assert.equal(ik?.islemler.includes('vardiya.yaz'), false);
    const v = await vardiyaAc(c.ikci, 'Ofis deneme');
    assert.equal((await istek(c.ikci, 'POST', '/vardiya-gunleri/degistir', { vardiyaId: v, gunler: [1, 2, 3, 4, 5] })).durum, 200);
    assert.equal((await istek(c.ikci, 'POST', '/takvim-gunleri', { tarih: '2099-12-30', tur: 'kapali' })).durum, 200);
    assert.equal((await istek(c.ikci, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: ikMerkezi, gun: 1, vardiyaId: v, acik: true })).durum, 403);
    const fm = { tarih: '2099-10-06', baslangic: '18:00', bitis: '20:00', kapsam: 'is-merkezi', isMerkeziId: ikMerkezi, kisiIdleri: [] };
    assert.equal((await istek(c.ikci, 'POST', '/fazla-mesai', fm, kimlikli())).durum, 403);
    assert.equal((await istek(c.operator, 'POST', '/vardiya-gunleri/degistir', { vardiyaId: v, gunler: [1] })).durum, 403);
    assert.equal((await istek(c.operator, 'POST', '/vardiya-varsayilani/belirle', { vardiyaId: v })).durum, 403);
    assert.equal((await istek(c.operator, 'GET', '/vardiya-ofis')).durum, 403);
    assert.equal((await istek(c.ikci, 'GET', '/vardiya-ofis')).durum, 200);
    // İş merkezi kısıtı olan kişi tesis geneli atamayı yazamaz.
    assert.equal((await istek(c.kisitli, 'POST', '/vardiya-varsayilani/belirle', { vardiyaId: v })).durum, 403);
    assert.equal((await istek(c.ikci, 'POST', '/takvim-gunleri/2099-12-30/kaldir')).durum, 200);
  });

  test('gövde ve kayıt denetimi: aynı gün iki kez, olmayan vardiya ve olmayan departman reddedilir', async () => {
    const v = await vardiyaAc(c.ikci, 'Ofis denetim');
    assert.equal((await istek(c.ikci, 'POST', '/vardiya-gunleri/degistir', { vardiyaId: v, gunler: [1, 1] })).durum, 400);
    assert.equal((await istek(c.ikci, 'POST', '/vardiya-gunleri/degistir', { vardiyaId: v, gunler: [8] })).durum, 400);
    assert.equal((await istek(c.ikci, 'POST', '/vardiya-gunleri/degistir', { vardiyaId: 2147483647, gunler: [1] })).durum, 404);
    assert.equal((await istek(c.ikci, 'POST', '/departman-vardiyalari/2147483647/belirle', { vardiyaId: v })).durum, 404);
    const d = await departman();
    assert.equal((await istek(c.ikci, 'POST', `/departman-vardiyalari/${String(d)}/belirle`, { vardiyaId: 2147483647 })).durum, 409);
    assert.equal((await istek(c.ikci, 'POST', '/vardiya-varsayilani/belirle', { vardiyaId: 2147483647 })).durum, 409);
  });

  test('2452-2 a: kişi > departman > tesis varsayılanı; günler vardiyanın kendi günleri; hiçbiri yoksa İK ayarı (2452-3 a)', async () => {
    const ofis = await vardiyaAc(c.ikci, 'Ofis PztCum');
    const cmt = await vardiyaAc(c.ikci, 'Ofis PztCmt');
    const tesis = await vardiyaAc(c.ikci, 'Tesis SaliCar');
    await tamam(c.ikci, 'POST', '/vardiya-gunleri/degistir', { vardiyaId: ofis, gunler: [1, 2, 3, 4, 5] });
    await tamam(c.ikci, 'POST', '/vardiya-gunleri/degistir', { vardiyaId: cmt, gunler: [1, 2, 3, 4, 5, 6] });
    const t = await tamam<TakvimCevabi>(c.ikci, 'POST', '/vardiya-gunleri/degistir', { vardiyaId: tesis, gunler: [2, 3] });
    assert.deepEqual((t.vardiyaGunleri ?? []).filter((g) => g.vardiyaId === tesis).map((g) => g.gun), [2, 3]);
    const d = await departman();
    const [kendi, depli, bos, bagsiz] = [await kisi(), await kisi(), await kisi(), await kisi()];
    await personel(kendi, d);
    await personel(depli, d);
    await personel(bos, null);

    // Hiç atama yok: İK ayarı; ayar kaydı yoksa cumartesi iş günü değildir.
    assert.deepEqual(await gunler(bos), { gunler: PZT_CUM, izinliGunler: [], kaynak: 'ik-ayari', vardiyaId: null });
    await o().sahip.sorgu("INSERT INTO ik_genel_ayar (anahtar, cumartesi_is_gunu, guncelleyen_kisi_id) VALUES ('genel', true, $1)", [yoneticiId]);
    assert.deepEqual((await gunler(bos))?.gunler, [...PZT_CUM, '2099-10-10']);
    assert.equal((await tamam<OfisMesaisiCevabi>(c.ikci, 'GET', '/vardiya-ofis')).cumartesiIsGunu, true);

    const vt = await tamam<TakvimCevabi>(c.ikci, 'POST', '/vardiya-varsayilani/belirle', { vardiyaId: tesis });
    assert.equal(vt.varsayilanVardiyaId, tesis);
    assert.deepEqual(await gunler(bos), { gunler: ['2099-10-06', '2099-10-07'], izinliGunler: [], kaynak: 'varsayilan-vardiya', vardiyaId: tesis });
    assert.deepEqual(await tesisIsGunleri(o().vt, HAFTA), ['2099-10-06', '2099-10-07']);

    await tamam(c.ikci, 'POST', `/departman-vardiyalari/${String(d)}/belirle`, { vardiyaId: ofis });
    await tamam(c.ikci, 'POST', `/kisi-vardiyalari/${String(kendi)}/belirle`, { vardiyaId: cmt });
    const hepsi = await kisilerinIsGunleri(o().vt, [kendi, depli, bos, bagsiz], HAFTA);
    assert.deepEqual([...hepsi.keys()].sort((a, b) => a - b), [kendi, depli, bos, bagsiz].sort((a, b) => a - b));
    assert.deepEqual(hepsi.get(kendi), { gunler: [...PZT_CUM, '2099-10-10'], izinliGunler: [], kaynak: 'kisi', vardiyaId: cmt });
    assert.deepEqual(hepsi.get(depli), { gunler: PZT_CUM, izinliGunler: [], kaynak: 'departman', vardiyaId: ofis });
    // İK kaydı olmayan kişi de tesis varsayılanını alır.
    assert.equal(hepsi.get(bagsiz)?.kaynak, 'varsayilan-vardiya');

    // Ofis personeli listesi: departmanı ve kişi vardiyasıyla; İK kaydı olmayan kişi listede yoktur.
    const ofisCevap = await tamam<OfisMesaisiCevabi>(c.ikci, 'GET', '/vardiya-ofis');
    assert.ok(ofisCevap.departmanlar.some((x) => x.no === d));
    const kendiSatiri = ofisCevap.personel.find((p) => p.kisiId === kendi);
    assert.deepEqual([kendiSatiri?.departmanNo, kendiSatiri?.vardiyaId], [d, cmt]);
    assert.equal(ofisCevap.personel.some((p) => p.kisiId === bagsiz), false);

    // Pasif vardiya yok sayılır: kişi ataması pasifse departmana düşer. Kaldırma null ile.
    const cmtV = (await tamam<TakvimCevabi>(c.ikci, 'GET', '/vardiya-takvimi')).vardiyalar.find((v) => v.id === cmt)!;
    await tamam(c.ikci, 'POST', `/vardiyalar/${String(cmt)}/guncelle`, { ad: cmtV.ad, baslangic: cmtV.baslangic, bitis: cmtV.bitis, molalar: [], aktif: false, surum: cmtV.surum });
    assert.equal((await gunler(kendi))?.kaynak, 'departman');
    await tamam(c.ikci, 'POST', `/departman-vardiyalari/${String(d)}/belirle`, { vardiyaId: null });
    await tamam(c.ikci, 'POST', '/vardiya-varsayilani/belirle', { vardiyaId: null });
    assert.equal((await gunler(depli))?.kaynak, 'ik-ayari');
    await o().sahip.sorgu('DELETE FROM ik_genel_ayar');
  });

  test('kapalı gün, İK resmî tatili ve çıkış tarihi iş gününü düşürür; izin düşürmez, ayrıca işaretlenir; pasif kişi haritada yoktur', async () => {
    const k = await kisi();
    await personel(k, null);
    await tamam(c.ikci, 'POST', '/takvim-gunleri', { tarih: '2099-10-06', tur: 'kapali' });
    await o().sahip.sorgu("INSERT INTO ik_genel_ayar (anahtar, cumartesi_is_gunu, guncelleyen_kisi_id) VALUES ('genel', false, $1)", [yoneticiId]);
    await o().sahip.sorgu("INSERT INTO ik_resmi_tatil (yil, ay, gun, ad, sira) VALUES (2099, 10, 7, 'Deneme tatil', 1)");
    await o().sahip.sorgu(
      `INSERT INTO ik_izin (kimlik, personel_no, tur, baslangic, bitis, gun, durum, olusturan_kisi_id, guncelleyen_kisi_id)
       SELECT 'dnm_izin_ofis', no, 'Yıllık izin', '2099-10-08', '2099-10-08', 1, 'Onaylandı', $2, $2 FROM ik_personel WHERE kisi_id = $1`, [k, yoneticiId]);
    const s = await gunler(k);
    assert.deepEqual(s?.gunler, ['2099-10-05', '2099-10-08', '2099-10-09']);
    assert.deepEqual(s?.izinliGunler, ['2099-10-08']);
    await o().sahip.sorgu("UPDATE ik_personel SET cikis_tarihi = '2099-10-08', surum = surum + 1 WHERE kisi_id = $1", [k]);
    assert.deepEqual((await gunler(k))?.gunler, ['2099-10-05', '2099-10-08']);
    await o().sahip.sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [k]);
    assert.equal(await gunler(k), undefined);
    assert.deepEqual(await kisilerinIsGunleri(o().vt, [], HAFTA), new Map());
    await tamam(c.ikci, 'POST', '/takvim-gunleri/2099-10-06/kaldir');
  });

  test('iş merkezi olan kişi üretim matrisinden çalışır; departman varsayılanı onu değiştirmez', async () => {
    const v = await vardiyaAc(c.yonetici, 'Uretim gunduz');
    const istasyon = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'OF-IST', ad: 'Deneme istasyon', isMerkeziId: ikMerkezi })).id;
    await tamam(c.yonetici, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: ikMerkezi, gun: 1, vardiyaId: v, acik: true });
    await tamam(c.yonetici, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: ikMerkezi, gun: 7, vardiyaId: v, acik: true });
    const d = await departman();
    const ofis = await vardiyaAc(c.ikci, 'Ofis atolye');
    await tamam(c.ikci, 'POST', '/vardiya-gunleri/degistir', { vardiyaId: ofis, gunler: [1, 2, 3, 4, 5] });
    await tamam(c.ikci, 'POST', `/departman-vardiyalari/${String(d)}/belirle`, { vardiyaId: ofis });
    const k = await kisi();
    await personel(k, d);
    await tamam(c.yonetici, 'POST', `/istasyonlar/${String(istasyon)}/kisiler/ata`, { kisiId: k, yuzde: '100.00' });
    assert.deepEqual(await gunler(k), { gunler: ['2099-10-05', '2099-10-11'], izinliGunler: [], kaynak: 'is-merkezi', vardiyaId: null });
    assert.equal((await tamam<OfisMesaisiCevabi>(c.ikci, 'GET', '/vardiya-ofis')).personel.some((p) => p.kisiId === k), false);
  });

  test('isGunuSonrasi: tarihin kendisi sayılmaz; liste yetmezse ya da n geçersizse null', () => {
    assert.equal(isGunuSonrasi(PZT_CUM, '2099-10-05', 1), '2099-10-06');
    assert.equal(isGunuSonrasi(PZT_CUM, '2099-10-04', 5), '2099-10-09');
    assert.equal(isGunuSonrasi(PZT_CUM, '2099-10-05', 5), null);
    assert.equal(isGunuSonrasi(PZT_CUM, '2099-10-05', 0), null);
  });
});
