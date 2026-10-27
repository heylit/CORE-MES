import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Gorev, Proje, ProjeListesiCevabi, ProjeYonetimiCevabi, StatuListesiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

describe('proje yönetimi: statü, kilometre taşı, görev (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let planlama = '';
  let kalite = '';
  let operator = '';
  let yoneticiId = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisYap(rolKodu: string | null, yonetenId: number | null): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `pyon-${(sayac += 1)}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null && yonetenId !== null) {
        const rol = await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
        const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yonetenId, yeni, rol?.id ?? 0);
        await rolAl(db, yonetenId, yeni, yon?.id ?? 0);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }

  const gonder = (cerez: string, yol: string, govde: unknown, kimlik = randomUUID()): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': kimlik } });
  const oku = (cerez: string, yol: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });
  const yonetim = async (projeId: number): Promise<ProjeYonetimiCevabi> => {
    const c = await oku(yonetici, `/projeler/${projeId}/yonetim`);
    assert.equal(c.statusCode, 200, c.body);
    return c.json<ProjeYonetimiCevabi>();
  };
  const say = async (tablo: string): Promise<number> => (await vt().tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${tablo}`))?.n ?? -1;

  // Proje açılışı bu testin konusu değil (projeler.test.ts): satır doğrudan yazılır.
  async function projeAc(durum = 'aktif'): Promise<number> {
    const satir = await vt().tek<{ id: number }>(
      'INSERT INTO projeler_proje (kod, ad, durum, olusturan_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [`PY.${(sayac += 1)}`, 'Deneme yönetim projesi', durum, yoneticiId],
    );
    return satir?.id ?? 0;
  }
  async function statuAc(ad: string, ton = 'bilgi'): Promise<number> {
    const c = await gonder(yonetici, '/projeler/statuler', { ad, ton, sira: 1 });
    assert.equal(c.statusCode, 200, c.body);
    const s = c.json<StatuListesiCevabi>().statuler.find((x) => x.ad === ad);
    return s?.id ?? 0;
  }
  async function gorevAc(projeId: number, govde: Record<string, unknown> = {}, cerez = yonetici): Promise<Gorev> {
    const c = await gonder(cerez, `/projeler/${projeId}/gorevler`, { ad: 'Görev', planBaslangic: '2026-11-02', planBitis: '2026-11-06', ...govde });
    assert.equal(c.statusCode, 200, c.body);
    const g = c.json<ProjeYonetimiCevabi>().gorevler.at(-1);
    if (!g) throw new Error('görev yok');
    return g;
  }
  const gorevGuncelle = (g: Gorev, degisen: Record<string, unknown>): Promise<LightMyRequestResponse> =>
    gonder(yonetici, `/projeler/gorevler/${g.id}/guncelle`, {
      kilometreTasiId: g.kilometreTasiId, ad: g.ad, aciklama: g.aciklama, sorumluKisiId: g.sorumluKisiId, planBaslangic: g.planBaslangic,
      planBitis: g.planBitis, oncekiGorevId: g.oncekiGorevId, gercekBaslangic: g.gercekBaslangic, gercekBitis: g.gercekBitis,
      ilerleme: g.ilerleme, durum: g.durum, surum: g.surum, ...degisen,
    });

  before(async () => {
    ortam = await testVeritabaniKur('proje_yonetimi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const y = await girisYap(null, null);
    yonetici = y.cerez;
    yoneticiId = y.id;
    planlama = (await girisYap('planlama_proje', y.id)).cerez;
    kalite = (await girisYap('kalite', y.id)).cerez;
    operator = (await girisYap('operator', y.id)).cerez;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('yetki: planlama görev ve statü yazar, statü listesini değiştiremez; kalite okur yazamaz; operatör okuyamaz; girişsiz 401', async () => {
    const p = await projeAc();
    const statu = await statuAc('Yetki statüsü');
    await gorevAc(p, {}, planlama);
    assert.equal((await gonder(planlama, `/projeler/${p}/statu`, { statuId: statu })).statusCode, 200);
    assert.equal((await gonder(planlama, `/projeler/${p}/kilometre-taslari`, { ad: 'Taş', sira: 1, tabanTarih: '2026-11-10' })).statusCode, 200);
    assert.equal((await oku(planlama, '/projeler/sorumlu-secenekleri')).statusCode, 200);
    assert.equal((await gonder(planlama, '/projeler/statuler', { ad: 'Planlama statüsü', ton: 'tamam', sira: 1 })).statusCode, 403);
    const ayar = (await oku(planlama, '/projeler/statuler')).json<StatuListesiCevabi>();
    assert.equal((await gonder(planlama, '/projeler/statu-ayari/guncelle', { serbestStatu: false, surum: ayar.ayarSurum })).statusCode, 403);

    assert.equal((await oku(kalite, `/projeler/${p}/yonetim`)).statusCode, 200);
    assert.equal((await oku(kalite, '/projeler/statuler')).statusCode, 200);
    const once = [await say('projeler_gorev'), await say('projeler_statu_kaydi'), await say('projeler_kilometre_tasi')];
    assert.equal((await gonder(kalite, `/projeler/${p}/gorevler`, { ad: 'X', planBaslangic: '2026-11-02', planBitis: '2026-11-03' })).statusCode, 403);
    assert.equal((await gonder(kalite, `/projeler/${p}/statu`, { metin: 'Kalite yazdı' })).statusCode, 403);
    assert.equal((await gonder(kalite, `/projeler/${p}/kilometre-taslari`, { ad: 'Taş', sira: 1, tabanTarih: '2026-11-10' })).statusCode, 403);
    assert.equal((await oku(kalite, '/projeler/sorumlu-secenekleri')).statusCode, 403);
    assert.deepEqual([await say('projeler_gorev'), await say('projeler_statu_kaydi'), await say('projeler_kilometre_tasi')], once);

    assert.equal((await oku(operator, `/projeler/${p}/yonetim`)).statusCode, 403);
    assert.equal((await oku(operator, '/projeler/statuler')).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: `/api/projeler/${p}/yonetim` })).statusCode, 401);
    assert.equal((await oku(yonetici, '/projeler/999999/yonetim')).statusCode, 404);
  });

  test('PRJ-11 statü: listeden seçilir ya da elle yazılır; ikisi birden ya da hiçbiri reddedilir; geçmiş yeni üstte, kişi ve zaman sunucudan', async () => {
    const p = await projeAc();
    const statu = await statuAc('Malzeme bekleniyor', 'uyari');
    assert.equal((await yonetim(p)).statu, null);
    assert.equal((await gonder(yonetici, `/projeler/${p}/statu`, { statuId: statu, metin: 'İkisi' })).statusCode, 400);
    assert.equal((await gonder(yonetici, `/projeler/${p}/statu`, { not: 'Yalnız not' })).statusCode, 400);
    assert.equal((await gonder(yonetici, `/projeler/${p}/statu`, { statuId: 999999 })).statusCode, 400);
    const ilk = await gonder(yonetici, `/projeler/${p}/statu`, { statuId: statu, not: 'Termin kaydı' });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const ikinci = await gonder(yonetici, `/projeler/${p}/statu`, { metin: '  Çizim müşteride  ', kisiId: 1, an: '2020-01-01T00:00:00Z' });
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    const y = ikinci.json<ProjeYonetimiCevabi>();
    assert.deepEqual(y.statu && [y.statu.ad, y.statu.serbest, y.statu.ton], ['Çizim müşteride', true, null]);
    assert.deepEqual(y.statuGecmisi.map((k) => [k.ad, k.ton, k.not]), [['Çizim müşteride', null, null], ['Malzeme bekleniyor', 'uyari', 'Termin kaydı']]);
    assert.ok(y.statuGecmisi.every((k) => k.kisiAd?.startsWith('Deneme pyon-') === true && !k.an.startsWith('2020')));
    const liste = (await oku(yonetici, `/projeler?ara=${encodeURIComponent(`PY.`)}&sayfaBoyu=200`)).json<ProjeListesiCevabi>();
    assert.equal(liste.satirlar.find((x) => x.id === p)?.statu?.ad, 'Çizim müşteride');
    const suzulu = (await oku(yonetici, `/projeler?statuId=${statu}&sayfaBoyu=200`)).json<ProjeListesiCevabi>();
    assert.ok(!suzulu.satirlar.some((x) => x.id === p), 'son statüsü başka olan proje süzgeçte yok');
    const p2 = await projeAc();
    assert.equal((await gonder(yonetici, `/projeler/${p2}/statu`, { statuId: statu })).statusCode, 200);
    assert.deepEqual((await oku(yonetici, `/projeler?statuId=${statu}&sayfaBoyu=200`)).json<ProjeListesiCevabi>().satirlar.map((x) => x.id), [p2]);
    const tek = (await oku(yonetici, `/projeler/${p}`)).json<Proje>();
    assert.equal(tek.statu?.ad, 'Çizim müşteride');
    await assert.rejects(vt().tx((db) => db.sorgu('UPDATE projeler_statu_kaydi SET notu = $1 WHERE proje_id = $2', ['Değişti', p])));
    await assert.rejects(vt().tx((db) => db.sorgu('DELETE FROM projeler_statu_kaydi WHERE proje_id = $1', [p])));
  });

  test('PRJ-11 statü listesi: ad tekil, sürüm denetimli; kapatılan statü seçilemez ama geçmişte adıyla kalır; serbest yazı ayarla kapanır', async () => {
    const p = await projeAc();
    const id = await statuAc('Liste statüsü');
    assert.equal((await gonder(yonetici, `/projeler/${p}/statu`, { statuId: id })).statusCode, 200);
    const cift = await gonder(yonetici, '/projeler/statuler', { ad: 'liste STATÜSÜ', ton: 'hata', sira: 2 });
    assert.equal(cift.statusCode, 409, cift.body);
    assert.equal(cift.json().mesaj, 'Bu adla bir statü var.');
    assert.equal((await gonder(yonetici, '/projeler/statuler', { ad: 'Renksiz', ton: '#ff0000', sira: 2 })).statusCode, 400);
    const liste = (await oku(yonetici, '/projeler/statuler')).json<StatuListesiCevabi>();
    const s = liste.statuler.find((x) => x.id === id);
    if (!s) throw new Error('statü yok');
    const kapat = await gonder(yonetici, `/projeler/statuler/${id}/guncelle`, { ad: s.ad, ton: s.ton, sira: s.sira, etkin: false, surum: s.surum });
    assert.equal(kapat.statusCode, 200, kapat.body);
    assert.equal((await gonder(yonetici, `/projeler/statuler/${id}/guncelle`, { ad: s.ad, ton: s.ton, sira: s.sira, etkin: true, surum: s.surum })).statusCode, 409);
    assert.equal((await gonder(yonetici, '/projeler/statuler/999999/guncelle', { ad: 'Yok', ton: 'bilgi', sira: 1, etkin: true, surum: 1 })).statusCode, 404);
    const ret = await gonder(yonetici, `/projeler/${p}/statu`, { statuId: id });
    assert.deepEqual([ret.statusCode, ret.json().mesaj], [400, 'Bu statü artık seçilemiyor.']);
    const y = await yonetim(p);
    assert.equal(y.statu?.ad, 'Liste statüsü');
    assert.ok(!y.statuler.some((x) => x.id === id));

    const ayar = (await oku(yonetici, '/projeler/statuler')).json<StatuListesiCevabi>();
    const kapali = await gonder(yonetici, '/projeler/statu-ayari/guncelle', { serbestStatu: false, surum: ayar.ayarSurum });
    assert.equal(kapali.statusCode, 200, kapali.body);
    assert.equal((await gonder(yonetici, '/projeler/statu-ayari/guncelle', { serbestStatu: true, surum: ayar.ayarSurum })).statusCode, 409);
    const serbest = await gonder(yonetici, `/projeler/${p}/statu`, { metin: 'Elle' });
    assert.deepEqual([serbest.statusCode, serbest.json().mesaj], [400, 'Statü yalnız listeden seçilebilir.']);
    const ac = await gonder(yonetici, '/projeler/statu-ayari/guncelle', { serbestStatu: true, surum: kapali.json<StatuListesiCevabi>().ayarSurum });
    assert.equal(ac.statusCode, 200, ac.body);
    assert.equal((await gonder(yonetici, `/projeler/${p}/statu`, { metin: 'Elle' })).statusCode, 200);
  });

  test('PRJ-13 kilometre taşı: taban tarih yalnız gerekçeyle yenilenir, eski değer geçmişte kalır; doğrudan değişiklik veritabanında reddedilir', async () => {
    const p = await projeAc();
    const c = await gonder(yonetici, `/projeler/${p}/kilometre-taslari`, { ad: 'İlk parça onayı', sira: 1, tabanTarih: '2026-10-29' });
    assert.equal(c.statusCode, 200, c.body);
    const t = c.json<ProjeYonetimiCevabi>().kilometreTaslari[0];
    if (!t) throw new Error('taş yok');
    const g = await gonder(yonetici, `/projeler/kilometre-taslari/${t.id}/guncelle`, { ad: t.ad, sira: 2, gercekTarih: '2026-11-05', etkin: true, surum: t.surum });
    assert.equal(g.statusCode, 200, g.body);
    const t2 = g.json<ProjeYonetimiCevabi>().kilometreTaslari[0];
    assert.deepEqual(t2 && [t2.sira, t2.gercekTarih, t2.tabanTarih], [2, '2026-11-05', '2026-10-29']);
    assert.equal((await gonder(yonetici, `/projeler/kilometre-taslari/${t.id}/guncelle`, { ad: t.ad, sira: 3, etkin: true, surum: t.surum })).statusCode, 409);
    assert.equal((await gonder(yonetici, `/projeler/kilometre-taslari/${t.id}/taban-yenile`, { yeniTarih: '2026-11-05', gerekce: ' ', surum: t2?.surum })).statusCode, 400);
    const ayni = await gonder(yonetici, `/projeler/kilometre-taslari/${t.id}/taban-yenile`, { yeniTarih: '2026-10-29', gerekce: 'Aynı', surum: t2?.surum });
    assert.deepEqual([ayni.statusCode, ayni.json().mesaj], [400, 'Yeni taban tarih eskisiyle aynı.']);
    const eski = await gonder(yonetici, `/projeler/kilometre-taslari/${t.id}/taban-yenile`, { yeniTarih: '2026-11-05', gerekce: 'Eski', surum: t.surum });
    assert.equal(eski.statusCode, 409, eski.body);
    assert.equal(await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM projeler_kilometre_tasi_taban WHERE kilometre_tasi_id = $1', [t.id]).then((x) => x?.n), 0);
    const yeni = await gonder(yonetici, `/projeler/kilometre-taslari/${t.id}/taban-yenile`, { yeniTarih: '2026-11-05', gerekce: 'Malzeme gecikti', surum: t2?.surum });
    assert.equal(yeni.statusCode, 200, yeni.body);
    const t3 = yeni.json<ProjeYonetimiCevabi>().kilometreTaslari[0];
    assert.equal(t3?.tabanTarih, '2026-11-05');
    assert.deepEqual(t3?.tabanGecmisi.map((x) => [x.eskiTarih, x.yeniTarih, x.gerekce]), [['2026-10-29', '2026-11-05', 'Malzeme gecikti']]);
    await assert.rejects(vt().tx((db) => db.sorgu("UPDATE projeler_kilometre_tasi SET taban_tarih = '2026-12-01' WHERE id = $1", [t.id])), /projeler_kilometre_tasi_taban_donuk|yalnız gerekçeyle/);
    assert.equal((await gonder(yonetici, '/projeler/kilometre-taslari/999999/taban-yenile', { yeniTarih: '2026-11-05', gerekce: 'Yok', surum: 1 })).statusCode, 404);
  });

  test('PRJ-12 görev: tarih ve durum tutarlılığı, aynı projenin kilometre taşı, önceki görev zinciri döngüsüz; sürüm denetimli', async () => {
    const p = await projeAc();
    const baska = await projeAc();
    const tas = (await gonder(yonetici, `/projeler/${baska}/kilometre-taslari`, { ad: 'Başka', sira: 1, tabanTarih: '2026-11-10' }))
      .json<ProjeYonetimiCevabi>().kilometreTaslari[0];
    const yanlisTas = await gonder(yonetici, `/projeler/${p}/gorevler`, { ad: 'X', planBaslangic: '2026-11-02', planBitis: '2026-11-03', kilometreTasiId: tas?.id });
    assert.equal(yanlisTas.json().mesaj, 'Kilometre taşı bu projede yok.', yanlisTas.body);
    assert.equal((await gonder(yonetici, `/projeler/${p}/gorevler`, { ad: 'X', planBaslangic: '2026-11-05', planBitis: '2026-11-03' })).statusCode, 400);

    const a = await gorevAc(p, { ad: 'A' });
    const b = await gorevAc(p, { ad: 'B', oncekiGorevId: a.id });
    const dongu = await gorevGuncelle(a, { oncekiGorevId: b.id });
    assert.deepEqual([dongu.statusCode, dongu.json().mesaj], [400, 'Önce bitmesi gereken görev zinciri kendine dönüyor.']);
    assert.equal((await gorevGuncelle(a, { oncekiGorevId: a.id })).statusCode, 400);

    const bittiTarihsiz = await gorevGuncelle(a, { durum: 'bitti' });
    assert.deepEqual([bittiTarihsiz.statusCode, bittiTarihsiz.json().mesaj], [400, 'Biten görevin gerçekleşen bitiş tarihi zorunlu.']);
    assert.equal((await gorevGuncelle(a, { gercekBitis: '2026-11-04' })).statusCode, 400);
    assert.equal((await gorevGuncelle(a, { gercekBaslangic: '2026-11-04', gercekBitis: '2026-11-03' })).statusCode, 400);
    const bitti = await gorevGuncelle(a, { durum: 'bitti', ilerleme: 40, gercekBaslangic: '2026-11-02', gercekBitis: '2026-11-07' });
    assert.equal(bitti.statusCode, 200, bitti.body);
    const a2 = bitti.json<ProjeYonetimiCevabi>().gorevler.find((x) => x.id === a.id);
    assert.deepEqual(a2 && [a2.durum, a2.ilerleme, a2.gercekBitis], ['bitti', 100, '2026-11-07']);
    assert.equal((await gorevGuncelle(a, { ad: 'Eski sürüm' })).statusCode, 409);
    assert.equal((await gorevGuncelle({ ...a, id: 999999 }, {})).statusCode, 404);
    await assert.rejects(vt().tx((db) => db.sorgu('UPDATE projeler_gorev SET proje_id = $1 WHERE id = $2', [baska, a.id])));
  });

  test('PRJ-14 ilerleme: iptal dışındaki görevlerin plan süresiyle ağırlıklı ortalaması; görevsiz projede null', async () => {
    const p = await projeAc();
    assert.equal((await yonetim(p)).ilerleme, null);
    const kisa = await gorevAc(p, { planBaslangic: '2026-11-02', planBitis: '2026-11-02' });
    const uzun = await gorevAc(p, { planBaslangic: '2026-11-02', planBitis: '2026-11-04' });
    const iptal = await gorevAc(p, { planBaslangic: '2026-11-02', planBitis: '2026-11-30' });
    assert.equal((await gorevGuncelle(kisa, { ilerleme: 100, durum: 'suruyor' })).statusCode, 200);
    assert.equal((await gorevGuncelle(uzun, { ilerleme: 20, durum: 'suruyor' })).statusCode, 200);
    assert.equal((await gorevGuncelle(iptal, { durum: 'iptal' })).statusCode, 200);
    // (1 x 100 + 3 x 20) / 4 = 40
    assert.equal((await yonetim(p)).ilerleme, 40);
    assert.equal((await oku(yonetici, `/projeler/${p}`)).json<Proje>().ilerleme, 40);
  });

  test('PRJ-15 kapanmış projeye görev ve kilometre taşı yazılmaz; statü yazılır', async () => {
    const p = await projeAc('tamamlandi');
    const g = await gonder(yonetici, `/projeler/${p}/gorevler`, { ad: 'Geç', planBaslangic: '2026-11-02', planBitis: '2026-11-03' });
    assert.deepEqual([g.statusCode, g.json().mesaj], [400, 'Tamamlanmış ya da iptal edilmiş projede görev ve kilometre taşı yazılmaz.']);
    assert.equal((await gonder(yonetici, `/projeler/${p}/kilometre-taslari`, { ad: 'Geç', sira: 1, tabanTarih: '2026-11-10' })).statusCode, 400);
    assert.equal((await gonder(yonetici, `/projeler/${p}/statu`, { metin: 'Kapanış notu' })).statusCode, 200);
  });

  test('tekrar koruması: aynı istek kimliğiyle gelen ikinci görev ekleme yeni kayıt açmaz', async () => {
    const p = await projeAc();
    const kimlik = randomUUID();
    const govde = { ad: 'Tekrar', planBaslangic: '2026-11-02', planBitis: '2026-11-03' };
    assert.equal((await gonder(yonetici, `/projeler/${p}/gorevler`, govde, kimlik)).statusCode, 200);
    assert.equal((await gonder(yonetici, `/projeler/${p}/gorevler`, govde, kimlik)).statusCode, 200);
    assert.equal((await yonetim(p)).gorevler.length, 1);
  });
});
