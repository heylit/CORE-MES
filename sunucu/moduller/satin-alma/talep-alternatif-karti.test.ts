import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { AcilisCevabi, KabulZarfiCevabi, Talebim } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kablola } from '../../kablolama.ts';
import { ILETILER } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

describe('3593: talep kaleminde alternatif kartı işaretleme (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c = { yonetici: '', talep: '' };
  const giris = async (k: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const post = (cerez: string, url: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/api${url}`, payload: payload as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const get = (cerez: string, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });
  let sira = 0;
  const kartAc = async (kayit: Record<string, unknown>): Promise<number> => {
    sira += 1;
    const kimlik = `akt-${String(sira)}`;
    return (await ortam!.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'HM-AKT-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [kimlik, sira, JSON.stringify({ id: kimlik, com: { ad: `Örnek ${kimlik}`, birim: 'adet' }, fam: 'metal', cls: 'aluminyum', ...kayit }), yoneticiId]))!.no;
  };
  const setAc = async (anaNo: number, ad: string, tur: string, kullanimYerleri: string[], nitelikler: unknown[]): Promise<number> => {
    const r = await post(c.yonetici, '/malzeme-alternatifleri/setler/kaydet', { anaNo, ad, tur, kullanimYerleri, notu: null, genisOnay: false, nitelikler });
    assert.equal(r.statusCode, 200, r.body);
    return (r.json() as { id: number }).id;
  };
  let kart = 0;
  const ak: number[] = [];
  const ac = (kalemler: unknown[]) => post(c.talep, '/satin-alma-talepleri/hizli-ac', { id: randomUUID(), kalemler });
  const govde = (r: { body: string }) => JSON.parse(r.body) as { alan?: string; mesaj?: string };

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('sa_talep_alternatif_karti');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await giris('yonetici');
    const rol = (await ortam.vt.tx((db) => db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'cam'")))!;
    await ortam.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme cam', kullaniciAdi: 'cam', parola: PAROLA });
      const k = await rolAta(db, yoneticiId, id, rol.id);
      for (const r of k.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
    });
    c.talep = await giris('cam');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-AKT-', 0) ON CONFLICT (onek) DO NOTHING");
    kart = await kartAc({ grade: '6082', form: 'cubuk', dims: { d: 50, l: 3000 }, opts: { durum: 'T6', yuzey: 'Ham' } });
    const pay = { nitelik: 'd', kip: 'pay', degerler: null, alt: null, ust: null, payAlt: 0, payUst: 5 };
    ak.push(await setAc(kart, 'ORN AK-1', 'tam', ['talep', 'satin_alma'], [{ nitelik: 'kalite', degerler: ['6082', '6061'], alt: null, ust: null }, pay]));
    ak.push(await setAc(kart, 'ORN AK-2', 'sartli', ['talep'], [{ nitelik: 'durum', degerler: ['T651'], alt: null, ust: null }]));
    ak.push(await setAc(kart, 'ORN AK-3', 'tam', ['uretim'], [pay]));
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kabul zarfı talepte kullanılan alternatif kartlarını özetiyle verir; yalnız üretimdeki kart gelmez', async () => {
    const z = (await get(c.talep, `/satin-alma-kabul-zarfi/${String(kart)}`)).json() as KabulZarfiCevabi;
    assert.deepEqual(z.alternatifKartlari?.map((x) => [x.id, x.tur]), [[ak[0], 'tam'], [ak[1], 'sartli']]);
    assert.match(z.alternatifKartlari![0]!.ozet, /6082 ya da 6061 · işlem serbest · Ø 50–55 \(−0\/\+5\)/);
  });

  test('izinli: işaretli kart özetiyle yazılır, Taleplerim ve satın alma açılışı aynı özeti gösterir; işaretsiz kalem boş', async () => {
    const r = await ac([{ malzemeNo: kart, miktar: '2', alternatifKartlari: [ak[0]] }, { malzemeNo: kart, miktar: '1' }]);
    assert.equal(r.statusCode, 200, r.body);
    const t = r.json() as Talebim;
    assert.deepEqual(t.kalemler.map((k) => k.alternatifKartlari?.map((x) => [x.setId, x.ad, x.tur])), [[[ak[0], 'ORN AK-1', 'tam']], []]);
    const a = (await get(c.yonetici, '/satin-alma-acilis')).json() as AcilisCevabi;
    const talep = a.talepler.find((x) => x.id === t.id)!;
    assert.deepEqual(talep.kalemAlternatifleri?.map((x) => [x.kalemId, x.kartlar.map((k) => k.ozet)]), [[t.kalemler[0]!.id, [t.kalemler[0]!.alternatifKartlari![0]!.ozet]]]);
  });

  test('birleştirme ve ayırma: işaretler kalemle birleşik talebe gider ve kaynağa döner (Risk K1, ON UPDATE CASCADE)', async () => {
    const a = (await ac([{ malzemeNo: kart, miktar: '2', alternatifKartlari: [ak[0]] }])).json() as Talebim;
    const b = (await ac([{ malzemeNo: kart, miktar: '1', alternatifKartlari: [ak[0], ak[1]] }])).json() as Talebim;
    const r = await post(c.yonetici, '/satin-alma-talepleri/birlestir', { id: randomUUID(), talepIdleri: [a.id, b.id] });
    assert.equal(r.statusCode, 200, r.body);
    const m = r.json() as { id: string; surum: number };
    const isaretler = async (talepId: string) => (await ortam!.sahip.sorgu<{ kalem: string; n: number }>(
      'SELECT kalem_id::text AS kalem, count(*)::int AS n FROM satin_alma_talep_kalemi_alternatif_karti WHERE talep_id = $1 GROUP BY kalem_id ORDER BY 2', [talepId]))
      .map((x) => [x.kalem, x.n]);
    assert.deepEqual(await isaretler(m.id), [[a.kalemler[0]!.id, 1], [b.kalemler[0]!.id, 2]]);
    const acilis = (await get(c.yonetici, '/satin-alma-acilis')).json() as AcilisCevabi;
    assert.equal(acilis.talepler.find((x) => x.id === m.id)?.kalemAlternatifleri?.length, 2);
    const y = await post(c.yonetici, `/satin-alma-talepleri/${m.id}/ayir`, { surum: m.surum });
    assert.equal(y.statusCode, 200, y.body);
    assert.deepEqual([await isaretler(a.id), await isaretler(b.id), await isaretler(m.id)], [[[a.kalemler[0]!.id, 1]], [[b.kalemler[0]!.id, 2]], []]);
  });

  test('yasak: talepte kullanılmayan kart, kartsız kalemde işaret ve tekrar reddedilir; talep açılmaz', async () => {
    const once = (await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM satin_alma_talep'))!.n;
    const r1 = await ac([{ malzemeNo: kart, miktar: '1' }, { malzemeNo: kart, miktar: '1', alternatifKartlari: [ak[2]] }]);
    assert.deepEqual([r1.statusCode, govde(r1).alan, govde(r1).mesaj], [400, 'kalemler.1.alternatifKartlari', ILETILER.alternatifKartiListeDisi]);
    const r2 = await ac([{ ad: 'Deneme vida', birim: 'adet', miktar: '3', alternatifKartlari: [ak[0]] }]);
    assert.deepEqual([r2.statusCode, govde(r2).mesaj], [400, ILETILER.alternatifKartiKartsiz]);
    assert.equal((await ac([{ malzemeNo: kart, miktar: '1', alternatifKartlari: [ak[0], ak[0]] }])).statusCode, 400);
    assert.equal((await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM satin_alma_talep'))!.n, once);
  });

  test('düzenleme: gelmeyen işaret korunur, boş liste kaldırır; kart sonradan değişse de işaretlendiği özet kalır, kaldırılan kartta setId boşalır', async () => {
    const t = (await ac([{ malzemeNo: kart, miktar: '2', alternatifKartlari: [ak[0], ak[1]] }, { malzemeNo: kart, miktar: '4', alternatifKartlari: [ak[1]] }])).json() as Talebim;
    const ilkOzet = t.kalemler[0]!.alternatifKartlari![0]!.ozet;
    const duzenle = (kalemler: unknown[], surum: number) => post(c.talep, `/satin-alma-talepleri/${t.id}/talebimi-duzenle`, { surum, kalemler });
    const id0 = t.kalemler[0]!.id!, id1 = t.kalemler[1]!.id!;
    const r1 = await duzenle([{ id: id0, miktar: '3' }, { id: id1, miktar: '4', alternatifKartlari: [] }], t.surum!);
    assert.equal(r1.statusCode, 200, r1.body);
    const d1 = r1.json() as Talebim;
    assert.deepEqual(d1.kalemler.map((k) => k.alternatifKartlari?.map((x) => x.setId)), [[ak[0], ak[1]], []]);
    // Ana kartın çapı değişir (Pay yeni çapı izler): talepteki özet işaretlendiği gibi kalır.
    await ortam!.sahip.sorgu(`UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{dims,d}', '60') WHERE no = $1`, [kart]);
    const yeni = ((await get(c.talep, `/satin-alma-kabul-zarfi/${String(kart)}`)).json() as KabulZarfiCevabi).alternatifKartlari![0]!.ozet;
    assert.match(yeni, /Ø 60–65/);
    const r2 = await duzenle([{ id: id0, miktar: '3', alternatifKartlari: [ak[0], ak[1]] }, { id: id1, miktar: '4' }], d1.surum!);
    assert.equal((r2.json() as Talebim).kalemler[0]!.alternatifKartlari![0]!.ozet, ilkOzet);
    // "Yeni sınırla güncelle": adı geçen kart bugünkü özetiyle yazılır. Sonra ana kart eski çapına döner ve yeniden güncellenir.
    const yeni1 = await duzenle([{ id: id0, miktar: '3', alternatifKartlari: [ak[0], ak[1]], alternatifKartlariYenile: [ak[0]] }, { id: id1, miktar: '4' }], (r2.json() as Talebim).surum!);
    assert.equal((yeni1.json() as Talebim).kalemler[0]!.alternatifKartlari![0]!.ozet, yeni);
    await ortam!.sahip.sorgu(`UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{dims,d}', '50') WHERE no = $1`, [kart]);
    const r2b = await duzenle([{ id: id0, miktar: '3', alternatifKartlari: [ak[0], ak[1]], alternatifKartlariYenile: [ak[0]] }, { id: id1, miktar: '4' }], (yeni1.json() as Talebim).surum!);
    assert.equal((r2b.json() as Talebim).kalemler[0]!.alternatifKartlari![0]!.ozet, ilkOzet);
    // Kart talepten çıkarılsa da işaretli kalem eski hâliyle yeniden gönderilebilir; yeni işaret reddedilir.
    await ortam!.sahip.sorgu("UPDATE malzeme_alternatif_seti SET kullanim_yerleri = ARRAY['uretim'] WHERE id = $1", [ak[1]]);
    const d2 = r2b.json() as Talebim;
    const r3 = await duzenle([{ id: id0, miktar: '3', alternatifKartlari: [ak[0], ak[1]] }, { id: id1, miktar: '4', alternatifKartlari: [ak[1]] }], d2.surum!);
    assert.deepEqual([r3.statusCode, govde(r3).alan], [400, 'kalemler.1.alternatifKartlari']);
    await ortam!.sahip.sorgu('DELETE FROM malzeme_alternatif_seti_niteligi WHERE set_id = $1', [ak[0]]);
    await ortam!.sahip.sorgu('DELETE FROM malzeme_alternatif_seti WHERE id = $1', [ak[0]]);
    const son = (await get(c.talep, '/satin-alma-taleplerim')).json() as { talepler: Talebim[] };
    assert.deepEqual(son.talepler.find((x) => x.id === t.id)!.kalemler[0]!.alternatifKartlari!.map((x) => [x.setId, x.ozet]), [[null, ilkOzet], [ak[1], d1.kalemler[0]!.alternatifKartlari![1]!.ozet]]);
  });

  test('güncelleme talebi: gönderilmeyen işaret yeni kaleme kopyalanır, gönderilen yazılır', async () => {
    await ortam!.sahip.sorgu("UPDATE malzeme_alternatif_seti SET kullanim_yerleri = ARRAY['talep'] WHERE id = $1", [ak[1]]);
    const t = (await ac([{ malzemeNo: kart, miktar: '2', alternatifKartlari: [ak[1]] }, { malzemeNo: kart, miktar: '4' }])).json() as Talebim;
    await ortam!.sahip.sorgu("UPDATE satin_alma_talep SET durum = 'teklif_isteniyor' WHERE id = $1", [t.id]);
    const r = await post(c.talep, `/satin-alma-talepleri/${t.id}/guncelleme-ac`, {
      id: randomUUID(), surum: t.surum, ihtiyacTarihi: null, aciklama: 'Deneme güncelleme',
      kalemler: [{ id: t.kalemler[0]!.id, miktar: '5' }, { id: t.kalemler[1]!.id, miktar: '4', alternatifKartlari: [ak[1]] }],
    });
    assert.equal(r.statusCode, 200, r.body);
    const g = r.json() as Talebim;
    assert.deepEqual(g.kalemler.map((k) => k.alternatifKartlari?.map((x) => x.setId)), [[ak[1]], [ak[1]]]);
  });
});
