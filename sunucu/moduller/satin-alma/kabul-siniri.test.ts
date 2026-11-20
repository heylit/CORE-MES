import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { AlternatifZarfi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import type { KabulZarfiCevabi, Talebim, TaleplerimCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kablola } from '../../kablolama.ts';
import { ILETILER, VARSAYILAN_KABUL, kabulReddi, kabulYazimi, kabulZarfi } from './kurallar.ts';
import { uclar } from './uclar.ts';

const PAROLA = 'dogru-parola-1';

const zarf = (ek: Partial<AlternatifZarfi> = {}): AlternatifZarfi => ({
  kapali: false, gerekce: null, kapaliKaynak: null, sartliAcik: false, sartliKaynak: null,
  kalite: { istenen: '6082', acik: true, kaynak: null, secenekler: [{ deger: '6061', tur: 'tam', notu: null }, { deger: '7075', tur: 'ust', notu: null }, { deger: '6060', tur: 'sartli', notu: null }], sinir: false },
  durum: { istenen: 'T6', acik: true, kaynak: null, secenekler: [{ deger: 'T651', tur: 'ust', notu: null }], sinir: false },
  form: 'cubuk', olcu: [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 55, sinirKaynak: null }], pay: { tur: 'mm', deger: 5, enAzMm: 0, kaynak: null },
  boy: { anahtar: 'l', istenen: 3000, uzunKesilir: true, kaynak: null, enAz: null, enCok: null, sinirKaynak: null },
  yuzey: { istenen: 'Ham', serbest: false, kaynak: null, secenekler: [], sinir: false }, ...ek,
});

describe('3437-2: talep kaleminin kabul sınırı (saf)', () => {
  test('yazım: varsayılan null, yalnız aynıda öteki alanlar boşalır, listeler tekrarsız ve sıralı', () => {
    assert.equal(kabulYazimi(null), null);
    assert.equal(kabulYazimi(VARSAYILAN_KABUL), null);
    assert.deepEqual(kabulYazimi({ ...VARSAYILAN_KABUL, yalnizAyni: true, kaliteler: ['6061'], payMm: 2 }), { ...VARSAYILAN_KABUL, yalnizAyni: true });
    assert.deepEqual(kabulYazimi({ ...VARSAYILAN_KABUL, kaliteler: ['7075', '6061', '7075'] })?.kaliteler, ['6061', '7075']);
  });
  test('izinli: zarfın muadillerinden seçim, zarfın payına eşit ya da dar pay, şartlı kabul, yalnız aynı (zarfsız kartta da)', () => {
    assert.equal(kabulReddi(zarf(), { ...VARSAYILAN_KABUL, kaliteler: ['6061'], durumlar: [], payMm: 5, sartliKabul: true }), null);
    assert.equal(kabulReddi(zarf(), { ...VARSAYILAN_KABUL, kaliteler: [] }), null);
    assert.equal(kabulReddi(null, { ...VARSAYILAN_KABUL, yalnizAyni: true }), null);
    assert.equal(kabulReddi(null, null), null);
  });
  test('yasak: zarfta olmayan kalite ya da durum, geniş pay, zarfsız ya da kapalı kartta daraltma, ölçüsüz kartta pay', () => {
    assert.equal(kabulReddi(zarf(), { ...VARSAYILAN_KABUL, kaliteler: ['5083'] }), ILETILER.kabulDisi('Kalite', ['5083']));
    assert.equal(kabulReddi(zarf(), { ...VARSAYILAN_KABUL, durumlar: ['O'] }), ILETILER.kabulDisi('Durum', ['O']));
    // Kalite muadili kuralla kapalıysa muadil listesi seçilemez.
    assert.equal(kabulReddi(zarf({ kalite: { ...zarf().kalite, acik: false } }), { ...VARSAYILAN_KABUL, kaliteler: ['6061'] }), ILETILER.kabulDisi('Kalite', ['6061']));
    assert.equal(kabulReddi(zarf(), { ...VARSAYILAN_KABUL, payMm: 6 }), ILETILER.kabulPayGenis(5));
    assert.equal(kabulReddi(zarf({ olcu: [] }), { ...VARSAYILAN_KABUL, payMm: 1 }), ILETILER.kabulPaysiz);
    assert.equal(kabulReddi(null, { ...VARSAYILAN_KABUL, sartliKabul: true }), ILETILER.kabulZarfsiz);
    assert.equal(kabulReddi(zarf({ kapali: true }), { ...VARSAYILAN_KABUL, kaliteler: [] }), ILETILER.kabulKapali);
  });
  test('daraltılmış zarf: liste ve pay kesişir, şartlı kabul açar, yalnız aynı kapatır; sınırsızda zarf aynen', () => {
    const z = zarf();
    assert.equal(kabulZarfi(z, null), z);
    const d = kabulZarfi(z, { ...VARSAYILAN_KABUL, kaliteler: ['6061'], durumlar: [], payMm: 2, sartliKabul: true });
    assert.deepEqual(d.kalite.secenekler.map((x) => x.deger), ['6061']);
    assert.deepEqual(d.durum.secenekler, []);
    assert.deepEqual(d.olcu, [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 52, sinirKaynak: null }]);
    assert.equal(d.sartliAcik, true);
    // Pay zarfınkinden büyük yazılmış eski kayıt (kural sonradan daraldı) zarfı genişletmez.
    assert.deepEqual(kabulZarfi(zarf({ olcu: [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 53, sinirKaynak: null }] }), { ...VARSAYILAN_KABUL, payMm: 5 }).olcu[0]?.enCok, 53);
    const a = kabulZarfi(z, { ...VARSAYILAN_KABUL, yalnizAyni: true });
    assert.deepEqual([a.kapali, a.gerekce], [true, ILETILER.kabulYalnizAyniGerekce]);
  });
});

describe('3437-2: talep formu ve Taleplerim kabul sınırı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c = { yonetici: '', talep: '', operator: '' };
  const giris = async (k: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const post = (cerez: string, url: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/api${url}`, payload: payload as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const get = (cerez: string, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });
  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<string> {
    const rol = (await ortam!.vt.tx((db) => db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu])))!;
    await ortam!.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, id, rol.id);
      for (const r of k.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
    });
    return giris(kullaniciAdi);
  }
  let sira = 0;
  const kartAc = async (kayit: Record<string, unknown>, tur = 'hammadde'): Promise<number> => {
    sira += 1;
    const kimlik = `kabul-${String(sira)}`;
    return (await ortam!.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'HM-KBL-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [kimlik, tur, sira, JSON.stringify({ id: kimlik, com: { ad: `Örnek ${kimlik}`, birim: 'adet' }, fam: 'metal', cls: 'aluminyum', ...kayit }), yoneticiId]))!.no;
  };
  let kart = 0;
  let sarf = 0;
  const ac = (kalemler: unknown[]) => post(c.talep, '/satin-alma-talepleri/hizli-ac', { id: randomUUID(), kalemler });
  const kalemAlani = (r: { body: string }) => (JSON.parse(r.body) as { alan?: string }).alan;

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('sa_kabul_siniri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await giris('yonetici');
    c.talep = await rolluKisi('cam', 'cam');
    c.operator = await rolluKisi('operator', 'operator');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-KBL-', 0) ON CONFLICT (onek) DO NOTHING");
    kart = await kartAc({ grade: '6082', form: 'cubuk', dims: { d: 50, l: 3000 }, opts: { durum: 'T6', yuzey: 'Ham' } });
    sarf = await kartAc({ com: { ad: 'Örnek eldiven', birim: 'çift' } }, 'sarf');
    const kural = await post(c.yonetici, '/malzeme-alternatifleri/kurallar/kaydet', {
      kapsamTuru: 'sinif', kapsam: 'metal/aluminyum', kaliteAcik: null, durumAcik: null, sartliAcik: null, boyUzunKesilir: null, yuzeySerbest: null,
      payTuru: 'mm', payDeger: 5, payEnAzMm: null, kapali: null, gerekce: null,
    });
    assert.equal(kural.statusCode, 200, kural.body);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('uç tanımı: zarf okuması var olan talep, okuma ve yazma işlemleriyle; yeni işlem yok', () => {
    const u = uclar.find((x) => x.yol === '/satin-alma-kabul-zarfi/:no')!;
    assert.deepEqual(u.yetki, { biri: ['satin-alma.talep-ac', 'satin-alma.oku', 'satin-alma.yaz'] });
  });

  test('izinli: talep açan kartın zarfını okur; sarf kartında zarf yok. Yasak: yetkisiz 403, kimliksiz 401', async () => {
    const r = await get(c.talep, `/satin-alma-kabul-zarfi/${String(kart)}`);
    assert.equal(r.statusCode, 200, r.body);
    const z = (r.json() as KabulZarfiCevabi).zarf!;
    assert.deepEqual(z.olcu, [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 55, sinirKaynak: null }]);
    assert.ok(z.kalite.secenekler.some((x) => x.deger === '6061'));
    assert.equal((JSON.parse((await get(c.talep, `/satin-alma-kabul-zarfi/${String(sarf)}`)).body) as KabulZarfiCevabi).zarf, null);
    assert.equal((await get(c.operator, `/satin-alma-kabul-zarfi/${String(kart)}`)).statusCode, 403);
    assert.equal((await get('', `/satin-alma-kabul-zarfi/${String(kart)}`)).statusCode, 401);
  });

  test('izinli: talep sınırla açılır, Taleplerim kartı ve sınırı gösterir; sınırsız kalemde kabul null', async () => {
    const r = await ac([
      { malzemeNo: kart, miktar: '6', kabul: { yalnizAyni: false, kaliteler: ['6061', '6061'], durumlar: [], payMm: 2 } },
      { malzemeNo: kart, miktar: '1' },
      { malzemeNo: sarf, miktar: '2', kabul: { yalnizAyni: true } },
    ]);
    assert.equal(r.statusCode, 200, r.body);
    const t = r.json() as Talebim;
    assert.deepEqual(t.kalemler.map((k) => [k.malzemeNo, k.kabul]), [
      [kart, { yalnizAyni: false, sartliKabul: false, kaliteler: ['6061'], durumlar: [], payMm: 2 }],
      [kart, null],
      [sarf, { yalnizAyni: true, sartliKabul: false, kaliteler: null, durumlar: null, payMm: null }],
    ]);
    const liste = (await get(c.talep, '/satin-alma-taleplerim')).json() as TaleplerimCevabi;
    assert.deepEqual(liste.talepler.find((x) => x.id === t.id)?.kalemler.map((k) => k.kabul?.payMm ?? null), [2, null, null]);
  });

  test('yasak: zarf dışı kalite, geniş pay, kartsız kalemde sınır, zarfsız kartta daraltma reddedilir; talep açılmaz', async () => {
    const once = (await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM satin_alma_talep'))!.n;
    const r1 = await ac([{ malzemeNo: kart, miktar: '1' }, { malzemeNo: kart, miktar: '1', kabul: { yalnizAyni: false, kaliteler: ['5083'] } }]);
    assert.deepEqual([r1.statusCode, kalemAlani(r1)], [400, 'kalemler.1.kabul']);
    const r2 = await ac([{ malzemeNo: kart, miktar: '1', kabul: { yalnizAyni: false, payMm: 9 } }]);
    assert.deepEqual([r2.statusCode, (r2.json() as { mesaj: string }).mesaj], [400, ILETILER.kabulPayGenis(5)]);
    const r3 = await ac([{ ad: 'Deneme vida', birim: 'adet', miktar: '3', kabul: { yalnizAyni: true } }]);
    assert.deepEqual([r3.statusCode, (r3.json() as { mesaj: string }).mesaj], [400, ILETILER.kabulKartsiz]);
    const r4 = await ac([{ malzemeNo: sarf, miktar: '1', kabul: { yalnizAyni: false, sartliKabul: true } }]);
    assert.deepEqual([r4.statusCode, (r4.json() as { mesaj: string }).mesaj], [400, ILETILER.kabulZarfsiz]);
    // Gövde şeması: bilinmeyen alan ve aralık dışı pay.
    assert.equal((await ac([{ malzemeNo: kart, miktar: '1', kabul: { yalnizAyni: false, genislet: true } }])).statusCode, 400);
    assert.equal((await ac([{ malzemeNo: kart, miktar: '1', kabul: { yalnizAyni: false, payMm: -1 } }])).statusCode, 400);
    assert.equal((await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM satin_alma_talep'))!.n, once);
  });

  test('düzenleme: gelmeyen sınır korunur, null sınırı kaldırır, yeni sınır denetlenir ve yazılır', async () => {
    const t = (await ac([{ malzemeNo: kart, miktar: '2', kabul: { yalnizAyni: false, payMm: 3 } }, { malzemeNo: kart, miktar: '4' }])).json() as Talebim;
    const duzenle = (kalemler: unknown[], surum: number) => post(c.talep, `/satin-alma-talepleri/${t.id}/talebimi-duzenle`, { surum, kalemler });
    const id0 = t.kalemler[0]!.id!, id1 = t.kalemler[1]!.id!;
    const r1 = await duzenle([{ id: id0, miktar: '3' }, { id: id1, miktar: '4', kabul: { yalnizAyni: true } }], t.surum!);
    assert.equal(r1.statusCode, 200, r1.body);
    const d1 = r1.json() as Talebim;
    assert.deepEqual(d1.kalemler.map((k) => [k.kabul?.payMm ?? null, k.kabul?.yalnizAyni ?? null]), [[3, false], [null, true]]);
    const r2 = await duzenle([{ id: id0, miktar: '3', kabul: null }, { id: id1, miktar: '4', kabul: { yalnizAyni: false, durumlar: ['O'] } }], d1.surum!);
    assert.deepEqual([r2.statusCode, kalemAlani(r2)], [400, 'kalemler.1.kabul']);
    const r3 = await duzenle([{ id: id0, miktar: '3', kabul: null }, { id: id1, miktar: '4' }], d1.surum!);
    assert.equal(r3.statusCode, 200, r3.body);
    assert.deepEqual((r3.json() as Talebim).kalemler.map((k) => k.kabul?.yalnizAyni ?? null), [null, true]);
    const satir = await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM satin_alma_talep_kalemi WHERE talep_id = $1 AND kabul_pay_mm IS NOT NULL', [t.id]);
    assert.equal(satir!.n, 0);
  });

  test('güncelleme talebi: gönderilmeyen sınır yeni talebe kopyalanır, gönderilen yazılır; eski talep değişmez', async () => {
    const t = (await ac([{ malzemeNo: kart, miktar: '2', kabul: { yalnizAyni: false, payMm: 3 } }, { malzemeNo: kart, miktar: '4' }])).json() as Talebim;
    // Kurgu: teklif aşamasına satın alma akışı yerine doğrudan geçilir; sınanan güncellemedir.
    await ortam!.sahip.sorgu("UPDATE satin_alma_talep SET durum = 'teklif_isteniyor' WHERE id = $1", [t.id]);
    const r = await post(c.talep, `/satin-alma-talepleri/${t.id}/guncelleme-ac`, {
      id: randomUUID(), surum: t.surum, ihtiyacTarihi: null, aciklama: 'Deneme güncelleme',
      kalemler: [{ id: t.kalemler[0]!.id, miktar: '5' }, { id: t.kalemler[1]!.id, miktar: '4', kabul: { yalnizAyni: true } }],
    });
    assert.equal(r.statusCode, 200, r.body);
    const g = r.json() as Talebim;
    assert.notEqual(g.id, t.id);
    assert.deepEqual(g.kalemler.map((k) => [k.kabul?.payMm ?? null, k.kabul?.yalnizAyni ?? null]), [[3, false], [null, true]]);
    const eski = await ortam!.sahip.sorgu<{ pay: string | null; ayni: boolean }>(
      'SELECT kabul_pay_mm AS pay, yalniz_ayni AS ayni FROM satin_alma_talep_kalemi WHERE talep_id = $1 ORDER BY sira', [t.id]);
    assert.deepEqual(eski.map((x) => [x.pay === null ? null : Number(x.pay), x.ayni]), [[3, false], [null, false]]);
  });

  test('göç kısıtı: yalnız aynı işaretli kalemde öteki sınır alanı dolu olamaz', async () => {
    const t = (await ac([{ malzemeNo: kart, miktar: '1', kabul: { yalnizAyni: true } }])).json() as Talebim;
    await assert.rejects(
      ortam!.sahip.sorgu('UPDATE satin_alma_talep_kalemi SET kabul_pay_mm = 1 WHERE talep_id = $1', [t.id]),
      (h: { code?: string; constraint?: string }) => h.code === '23514' && h.constraint === 'satin_alma_talep_kalemi_yalniz_ayni',
    );
  });
});
