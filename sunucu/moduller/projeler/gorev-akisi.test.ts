import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type {
  Gorev, GorevAyrintisiCevabi, GorevlerimCevabi, ProjeYonetimiCevabi, SablonListesiCevabi, SablonSecenekleriCevabi,
} from '#paylasilan/sozlesme/projeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { butunOlaylariVeEskiKademeleriAc } from '../bildirim/disari.ts';

const PAROLA = 'dogru-parola-1';

interface Kisi { cerez: string; id: number }

describe('3269 görev akışı ve şablon (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Kisi;
  let planlama: Kisi;
  let kalite1: Kisi;
  let kalite2: Kisi;
  let operator1: Kisi;
  let operator2: Kisi;
  let guvenlik: Kisi;
  const rol = new Map<string, number>();
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = (kod: string): number => {
    const id = rol.get(kod);
    if (id === undefined) throw new Error(`rol yok: ${kod}`);
    return id;
  };

  async function girisYap(rolKodu: string | null, yonetenId: number | null): Promise<Kisi> {
    const kullaniciAdi = `gak-${(sayac += 1)}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null && yonetenId !== null) {
        await rolAta(db, yonetenId, yeni, rolId(rolKodu));
        await rolAl(db, yonetenId, yeni, rolId('yonetici'));
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }

  // Tek işlemli kişi: geçici rol yalnız verilen işlemleri taşır (uç yetkisini rol bileşiminden ayrı ölçmek için).
  async function islemliKisi(islemler: string[]): Promise<Kisi & { rolId: number }> {
    const ad = `gak-tek-${(sayac += 1)}`;
    const gecici = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${ad.replaceAll('-', '_')}`, ad]);
    if (!gecici) throw new Error('rol kurulamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [gecici.id, islem]);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, yonetici.id, yeni, gecici.id);
      await rolAl(db, yonetici.id, yeni, rolId('yonetici'));
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id, rolId: gecici.id };
  }

  const gonder = (k: Kisi, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: k.cerez, 'istek-kimligi': randomUUID() } });
  const oku = (k: Kisi, yol: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: k.cerez } });

  async function projeAc(): Promise<number> {
    const s = await vt().tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, durum, baslangic, bitis, olusturan_id) VALUES ($1, 'Deneme akış projesi', 'aktif', '2026-12-01', '2026-12-31', $2) RETURNING id",
      [`GA.${(sayac += 1)}`, yonetici.id],
    );
    return s?.id ?? 0;
  }
  async function gorevAc(projeId: number, govde: Record<string, unknown>): Promise<Gorev> {
    const c = await gonder(planlama, `/projeler/${projeId}/gorevler`, { ad: 'Akış görevi', planBaslangic: '2026-12-01', planBitis: '2026-12-05', ...govde });
    assert.equal(c.statusCode, 200, c.body);
    const g = c.json<ProjeYonetimiCevabi>().gorevler.at(-1);
    if (!g) throw new Error('görev yok');
    return g;
  }
  async function ayrinti(k: Kisi, gorevId: number): Promise<GorevAyrintisiCevabi> {
    const c = await oku(k, `/projeler/gorevler/${gorevId}/ayrinti`);
    assert.equal(c.statusCode, 200, c.body);
    return c.json<GorevAyrintisiCevabi>();
  }
  async function komut(k: Kisi, gorevId: number, ad: string, ek: Record<string, unknown> = {}): Promise<LightMyRequestResponse> {
    const surum = (await vt().tek<{ surum: number }>('SELECT surum FROM projeler_gorev WHERE id = $1', [gorevId]))?.surum ?? 0;
    return gonder(k, `/projeler/gorevler/${gorevId}/${ad}`, { surum, ...ek });
  }
  async function basarili(k: Kisi, gorevId: number, ad: string, ek: Record<string, unknown> = {}): Promise<GorevAyrintisiCevabi> {
    const c = await komut(k, gorevId, ad, ek);
    assert.equal(c.statusCode, 200, `${ad}: ${c.body}`);
    return c.json<GorevAyrintisiCevabi>();
  }
  const okunmamis = async (kisiId: number, tur: string): Promise<number> =>
    (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM bildirim_kaydi WHERE kisi_id = $1 AND tur = $2 AND okundu IS NULL', [kisiId, tur]))?.n ?? -1;
  const olaylar = async (gorevId: number): Promise<string[]> =>
    (await vt().sorgu<{ olay: string }>('SELECT olay FROM projeler_gorev_olayi WHERE gorev_id = $1 ORDER BY id', [gorevId])).map((o) => o.olay);

  before(async () => {
    ortam = await testVeritabaniKur('gorev_akisi');
    // 3478: olaylar varsayılan kapalıdır; bu dosya 3478'den önceki gibi açık olaylarla çalışır.
    await ortam.vt.tx((db) => butunOlaylariVeEskiKademeleriAc(db, null));
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    for (const r of await ortam.vt.sorgu<{ id: number; kod: string }>('SELECT id, kod FROM rol')) rol.set(r.kod, r.id);
    yonetici = await girisYap(null, null);
    planlama = await girisYap('planlama_proje', yonetici.id);
    kalite1 = await girisYap('kalite', yonetici.id);
    kalite2 = await girisYap('kalite', yonetici.id);
    operator1 = await girisYap('operator', yonetici.id);
    operator2 = await girisYap('operator', yonetici.id);
    guvenlik = await girisYap('guvenlik_gorevlisi', yonetici.id);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('rol görevi: rolündeki üstlenir, rol dışı 403; yapan kontrol edemez; geri gönderme gerekçeli; onayla biter ve bildirim kapanır', async () => {
    const p = await projeAc();
    const g = await gorevAc(p, { yapanRolId: rolId('kalite'), kontrolRolId: rolId('operator') });
    assert.deepEqual([g.yapanRolAd !== null, g.kontrolRolAd !== null, g.onaylandi], [true, true, false]);
    assert.equal(await okunmamis(kalite1.id, 'projeler.gorev-atandi'), 1, 'rol üyesine atama bildirimi');

    const liste = (await oku(kalite1, '/projeler/gorevlerim/liste')).json<GorevlerimCevabi>().gorevler;
    assert.deepEqual(liste.filter((x) => x.id === g.id).map((x) => [x.tur, x.izinler.ustlenebilir]), [['rolume', true]]);
    assert.equal((await oku(guvenlik, '/projeler/gorevlerim/liste')).statusCode, 403, 'güvenlik görevlisine sayfa yok');

    const rolDisi = await komut(operator1, g.id, 'ustlen');
    assert.equal(rolDisi.statusCode, 403, rolDisi.body);
    assert.equal((await komut(kalite1, g.id, 'basla')).statusCode, 403, 'üstlenmeden başlanmaz');
    await basarili(kalite1, g.id, 'ustlen');
    const ikinci = await komut(kalite2, g.id, 'ustlen');
    assert.equal(ikinci.statusCode, 409, ikinci.body);
    assert.equal((await komut(kalite2, g.id, 'bitir')).statusCode, 403, 'başkasının görevi bitirilmez');

    await basarili(kalite1, g.id, 'basla');
    const bitti = await basarili(kalite1, g.id, 'bitir');
    assert.equal(bitti.gorev.durum, 'kontrolde');
    assert.equal(await okunmamis(operator1.id, 'projeler.gorev-kontrol-bekliyor'), 1);
    assert.equal(await okunmamis(kalite1.id, 'projeler.gorev-kontrol-bekliyor'), 0, 'bitiren kendine bildirim almaz');

    assert.equal((await komut(kalite1, g.id, 'onayla')).statusCode, 403, 'yapan kendi işini onaylamaz');
    assert.equal((await komut(kalite2, g.id, 'onayla')).statusCode, 403, 'kontrol rolünde olmayan onaylamaz');
    const yaptim = (await oku(kalite1, '/projeler/gorevlerim/liste')).json<GorevlerimCevabi>().gorevler.find((x) => x.id === g.id);
    assert.equal(yaptim?.tur, 'yaptim');
    const kontrolumde = (await oku(operator1, '/projeler/gorevlerim/liste')).json<GorevlerimCevabi>().gorevler.find((x) => x.id === g.id);
    assert.deepEqual([kontrolumde?.tur, kontrolumde?.izinler.onaylayabilir], ['kontrolumde', true]);

    assert.equal((await komut(operator1, g.id, 'geri-gonder', { gerekce: '' })).statusCode, 400, 'gerekçesiz geri gönderilmez');
    const geri = await basarili(operator1, g.id, 'geri-gonder', { gerekce: 'Ölçü raporu eksik' });
    assert.equal(geri.gorev.durum, 'suruyor');
    assert.equal(geri.olaylar[0]?.gerekce, 'Ölçü raporu eksik');
    assert.equal(await okunmamis(operator1.id, 'projeler.gorev-kontrol-bekliyor'), 0, 'geri gönderince kontrol bildirimi kapanır');

    await basarili(kalite1, g.id, 'bitir');
    const onay = await basarili(operator2, g.id, 'onayla');
    assert.deepEqual([onay.gorev.durum, onay.gorev.onaylandi, onay.gorev.ilerleme], ['bitti', true, 100]);
    assert.deepEqual(await olaylar(g.id), ['ustlen', 'basla', 'bitti', 'geri', 'bitti', 'onay']);
    assert.equal(await okunmamis(operator1.id, 'projeler.gorev-kontrol-bekliyor'), 0);
    assert.equal((await komut(kalite1, g.id, 'bitir')).statusCode, 400, 'biten görev yeniden bitmez');
  });

  test('eşzamanlı üstlenme: aynı rol görevine iki kişi aynı anda; biri alır, öteki 409; tek olay', async () => {
    const p = await projeAc();
    const g = await gorevAc(p, { yapanRolId: rolId('kalite') });
    const [a, b] = await Promise.all([komut(kalite1, g.id, 'ustlen'), komut(kalite2, g.id, 'ustlen')]);
    assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 409], `${a.body} ${b.body}`);
    assert.deepEqual(await olaylar(g.id), ['ustlen']);
    const s = await vt().tek<{ sorumlu_kisi_id: number; yapan_rol_id: number | null }>('SELECT sorumlu_kisi_id, yapan_rol_id FROM projeler_gorev WHERE id = $1', [g.id]);
    assert.ok(s !== null && [kalite1.id, kalite2.id].includes(s.sorumlu_kisi_id));
    assert.equal(s?.yapan_rol_id, null);
  });

  test('yedek kontrol: asıl kontrol eden işi yapan kişiyse yedek hemen onaylar; değilse yedek 2 gün dolmadan onaylayamaz', async () => {
    const p = await projeAc();
    const g = await gorevAc(p, { sorumluKisiId: kalite1.id, kontrolKisiId: kalite1.id, yedekKontrolRolId: rolId('operator') });
    await basarili(kalite1, g.id, 'bitir');
    assert.equal(await okunmamis(operator1.id, 'projeler.gorev-kontrol-bekliyor'), 1, 'yedek bildirilir');
    assert.equal((await komut(kalite1, g.id, 'onayla')).statusCode, 403);
    await basarili(operator1, g.id, 'onayla');

    const h = await gorevAc(p, { sorumluKisiId: kalite1.id, kontrolKisiId: kalite2.id, yedekKontrolRolId: rolId('operator') });
    await basarili(kalite1, h.id, 'bitir');
    assert.equal((await komut(operator1, h.id, 'onayla')).statusCode, 403, 'süre dolmadan yedek onaylamaz');
    await basarili(kalite2, h.id, 'onayla');
  });

  test('dört göz (K2): düzenleme kontrollü görevi bitiremez ve kontrole sokamaz; kontrolsüz görev kontrole geçmez', async () => {
    const p = await projeAc();
    const g = await gorevAc(p, { sorumluKisiId: kalite1.id, kontrolRolId: rolId('operator') });
    const govde = (x: Gorev, d: Record<string, unknown>) => ({
      kilometreTasiId: null, ad: x.ad, aciklama: null, sorumluKisiId: x.sorumluKisiId, planBaslangic: x.planBaslangic, planBitis: x.planBitis,
      oncekiGorevId: null, gercekBaslangic: null, gercekBitis: null, ilerleme: 0, durum: x.durum, surum: x.surum, kontrolRolId: x.kontrolRolId, ...d,
    });
    const bitir = await gonder(planlama, `/projeler/gorevler/${g.id}/guncelle`, govde(g, { durum: 'bitti', gercekBaslangic: '2026-12-01', gercekBitis: '2026-12-02' }));
    assert.equal(bitir.statusCode, 400, bitir.body);
    const kaldirip = await gonder(planlama, `/projeler/gorevler/${g.id}/guncelle`, govde(g, {
      durum: 'bitti', gercekBaslangic: '2026-12-01', gercekBitis: '2026-12-02', kontrolRolId: null,
    }));
    assert.equal(kaldirip.statusCode, 400, 'kontrol edeni kaldırıp aynı yazmada bitirmek de reddedilir');
    assert.equal((await gonder(planlama, `/projeler/gorevler/${g.id}/guncelle`, govde(g, { durum: 'kontrolde' }))).statusCode, 400);
    const k = await gorevAc(p, {});
    assert.equal((await gonder(planlama, `/projeler/gorevler/${k.id}/guncelle`, govde(k, { durum: 'kontrolde', kontrolRolId: null }))).statusCode, 400);
    const cift = await gonder(planlama, `/projeler/${p}/gorevler`, {
      ad: 'Çift', planBaslangic: '2026-12-01', planBitis: '2026-12-02', sorumluKisiId: kalite1.id, yapanRolId: rolId('kalite'),
    });
    assert.equal(cift.statusCode, 400, 'kişi ve rol birlikte atanmaz');
    assert.equal((await vt().tek<{ durum: string }>('SELECT durum FROM projeler_gorev WHERE id = $1', [g.id]))?.durum, 'yapilacak');
  });

  test('dört göz (K2): kontrolde bekleyen görevin kontrol edeni ve yedeği düzenlemeyle değişmez (409); başka alan değişir', async () => {
    const p = await projeAc();
    const g = await gorevAc(p, { sorumluKisiId: kalite1.id, kontrolRolId: rolId('operator') });
    await basarili(kalite1, g.id, 'basla');
    await basarili(kalite1, g.id, 'bitir');
    const x = (await ayrinti(planlama, g.id)).gorev;
    assert.equal(x.durum, 'kontrolde');
    const govde = (d: Record<string, unknown>) => ({
      kilometreTasiId: null, ad: x.ad, aciklama: null, sorumluKisiId: x.sorumluKisiId, planBaslangic: x.planBaslangic, planBitis: x.planBitis,
      oncekiGorevId: null, gercekBaslangic: x.gercekBaslangic, gercekBitis: x.gercekBitis, ilerleme: x.ilerleme, durum: x.durum, surum: x.surum,
      kontrolRolId: x.kontrolRolId, ...d,
    });
    const yol = `/projeler/gorevler/${g.id}/guncelle`;
    const kontrolDegisir = await gonder(planlama, yol, govde({ kontrolRolId: null, kontrolKisiId: planlama.id }));
    assert.equal(kontrolDegisir.statusCode, 409, kontrolDegisir.body);
    assert.equal((await gonder(planlama, yol, govde({ yedekKontrolRolId: rolId('kalite') }))).statusCode, 409, 'yedek eklemek de değiştirmektir');
    assert.equal((await gonder(planlama, yol, govde({ kontrolRolId: null }))).statusCode, 409, 'kontrol edeni kaldırmak da');
    const ad = await gonder(planlama, yol, govde({ ad: 'Akış görevi (adı düzeldi)' }));
    assert.equal(ad.statusCode, 200, ad.body);
    const son = await vt().tek<{ durum: string; kontrol_rol_id: number | null; kontrol_kisi_id: number | null }>(
      'SELECT durum, kontrol_rol_id, kontrol_kisi_id FROM projeler_gorev WHERE id = $1', [g.id]);
    assert.deepEqual(son, { durum: 'kontrolde', kontrol_rol_id: rolId('operator'), kontrol_kisi_id: null });
  });

  test('ayrıntı: projeyi okuyamayan yalnız kendisine düşen görevi açar; ötekisi 404; işlemsiz 403', async () => {
    const p = await projeAc();
    const kendi = await gorevAc(p, { sorumluKisiId: operator1.id });
    const baska = await gorevAc(p, { sorumluKisiId: kalite1.id });
    assert.equal((await oku(operator1, `/projeler/${p}/yonetim`)).statusCode, 403);
    const a = await ayrinti(operator1, kendi.id);
    assert.deepEqual([a.proje.id, a.izinler.baslayabilir, a.izinler.ustlenebilir], [p, true, false]);
    assert.equal((await oku(operator1, `/projeler/gorevler/${baska.id}/ayrinti`)).statusCode, 404);
    assert.equal((await oku(guvenlik, `/projeler/gorevler/${kendi.id}/ayrinti`)).statusCode, 403);
    assert.equal((await ayrinti(kalite1, kendi.id)).izinler.baslayabilir, false, 'okuyan görür, işleyemez');
  });

  test('şablon: yalnız şablon yazan yazar; projeye eklenince hazırlık kalemi dışındakiler görev olur, tarih ve sıra kalemden, hâl donar', async () => {
    const kalemler = [
      { ad: 'Çizim incelemesi', asama: 'Mühendislik', dayanak: 'baslangic', gun: 0, sureGun: 3, yapanRolId: rolId('kalite'), kontrolRolId: rolId('operator') },
      { ad: 'CNC programı', dayanak: 'baslangic', gun: 3, sureGun: 2, yapanRolId: rolId('operator'), hazirlikMaddesi: 'cnc', kontrolKosulu: 'yeni-revize' },
      { ad: 'Sevk öncesi kontrol', dayanak: 'termin', gun: -2, sureGun: 2, yapanKisiId: kalite1.id, oncekiSira: 0 },
    ];
    const govde = { ad: 'Deneme şablonu', varsayilan: false, etkin: true, kalemler };
    assert.equal((await gonder(operator1, '/projeler/sablonlar', govde)).statusCode, 403);
    assert.equal((await oku(operator1, '/projeler/sablonlar/liste')).statusCode, 403);
    const geriye = await gonder(planlama, '/projeler/sablonlar', { ...govde, kalemler: [{ ...kalemler[2], oncekiSira: 0 }] });
    assert.equal(geriye.statusCode, 400, 'önceki kalem listede önde olmalı');
    const c = await gonder(planlama, '/projeler/sablonlar', govde);
    assert.equal(c.statusCode, 200, c.body);
    const sablon = c.json<SablonListesiCevabi>().sablonlar.find((x) => x.ad === 'Deneme şablonu');
    assert.deepEqual(sablon?.kalemler.map((k) => [k.ad, k.oncekiSira]), [['Çizim incelemesi', null], ['CNC programı', null], ['Sevk öncesi kontrol', 0]]);
    const secenek = (await oku(planlama, '/projeler/sablon-secenekleri')).json<SablonSecenekleriCevabi>().sablonlar.find((x) => x.id === sablon?.id);
    assert.deepEqual([secenek?.gorevSayisi, secenek?.hazirlikSayisi], [2, 1]);

    const p = await projeAc();
    const y = await gonder(planlama, `/projeler/${p}/sablondan-ekle`, { sablonId: sablon?.id });
    assert.equal(y.statusCode, 200, y.body);
    const gorevler = y.json<ProjeYonetimiCevabi>().gorevler;
    assert.deepEqual(gorevler.map((g) => [g.ad, g.planBaslangic, g.planBitis, g.asama]), [
      ['Çizim incelemesi', '2026-12-01', '2026-12-03', 'Mühendislik'],
      ['Sevk öncesi kontrol', '2026-12-29', '2026-12-30', null],
    ]);
    assert.equal(gorevler[1]?.oncekiGorevId, gorevler[0]?.id);
    assert.equal(gorevler[1]?.sorumluKisiId, kalite1.id);
    const don = await vt().tek<{ n: number; surum: number }>('SELECT jsonb_array_length(kalemler)::int AS n, sablon_surum AS surum FROM projeler_proje_sablonu WHERE proje_id = $1', [p]);
    assert.deepEqual(don, { n: 3, surum: 1 });

    if (!sablon) throw new Error('şablon yok');
    const d = await gonder(planlama, `/projeler/sablonlar/${sablon.id}/guncelle`, { ...govde, etkin: false, kalemler: [kalemler[0]], surum: sablon.surum });
    assert.equal(d.statusCode, 200, d.body);
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM projeler_gorev WHERE proje_id = $1', [p]))?.n, 2, 'açık proje değişmez');
    const kapali = await gonder(planlama, `/projeler/${p}/sablondan-ekle`, { sablonId: sablon.id });
    assert.equal(kapali.statusCode, 400, kapali.body);
  });

  test('uç yetkileri (T1): her yazma ucu kendi işlemini ister; tek işlemli kişiyle red ve kabul', async () => {
    const isleyen = await islemliKisi(['projeler.gorev-isle']);
    const kontrolcu = await islemliKisi(['projeler.gorev-kontrol']);
    const yazar = await islemliKisi(['projeler.gorev-yaz']);
    const okur = await islemliKisi(['projeler.oku']);
    const p = await projeAc();
    const kontroleDusur = async (kontrolKisiId: number): Promise<number> => {
      const g = await gorevAc(p, { sorumluKisiId: kalite1.id, kontrolKisiId });
      await basarili(kalite1, g.id, 'basla');
      await basarili(kalite1, g.id, 'bitir');
      return g.id;
    };
    // Kontrol eden olarak atanmış ama yalnız gorev-isle taşıyan onaylayamaz ve geri gönderemez; gorev-kontrol taşıyan onaylar.
    const a = await kontroleDusur(isleyen.id);
    assert.equal((await komut(isleyen, a, 'onayla')).statusCode, 403);
    assert.equal((await komut(isleyen, a, 'geri-gonder', { gerekce: 'Eksik' })).statusCode, 403);
    const b = await kontroleDusur(kontrolcu.id);
    assert.equal((await komut(kontrolcu, b, 'geri-gonder', { gerekce: 'Ölçü eksik' })).statusCode, 200);
    await basarili(kalite1, b, 'bitir');
    assert.equal((await komut(kontrolcu, b, 'onayla')).statusCode, 200);
    // Rolüne atanmış ama yalnız gorev-kontrol taşıyan üstlenemez, başlayamaz, bitiremez; gorev-isle taşıyan üstlenir.
    const r = await gorevAc(p, { yapanRolId: kontrolcu.rolId });
    assert.equal((await komut(kontrolcu, r.id, 'ustlen')).statusCode, 403);
    const s1 = await gorevAc(p, { sorumluKisiId: kontrolcu.id });
    assert.equal((await komut(kontrolcu, s1.id, 'basla')).statusCode, 403);
    assert.equal((await komut(kontrolcu, s1.id, 'bitir')).statusCode, 403);
    const r2 = await gorevAc(p, { yapanRolId: isleyen.rolId });
    assert.equal((await komut(isleyen, r2.id, 'ustlen')).statusCode, 200);
    // Şablonu yalnız sablon-yaz yazar ve okur; şablondan ekleme gorev-yaz ister; görevlerim projeler.oku ile açılmaz.
    const govde = { ad: 'Yetki şablonu', varsayilan: false, etkin: true, kalemler: [{ ad: 'Kalem', dayanak: 'baslangic', gun: 0, sureGun: 1 }] };
    assert.equal((await gonder(yazar, '/projeler/sablonlar', govde)).statusCode, 403);
    assert.equal((await oku(yazar, '/projeler/sablonlar/liste')).statusCode, 403);
    assert.equal((await oku(okur, '/projeler/sablonlar/liste')).statusCode, 403);
    const c = await gonder(planlama, '/projeler/sablonlar', govde);
    assert.equal(c.statusCode, 200, c.body);
    const sablon = c.json<SablonListesiCevabi>().sablonlar.find((x) => x.ad === 'Yetki şablonu');
    if (!sablon) throw new Error('şablon yok');
    assert.equal((await gonder(yazar, `/projeler/sablonlar/${sablon.id}/guncelle`, { ...govde, surum: sablon.surum })).statusCode, 403);
    assert.equal((await gonder(isleyen, `/projeler/${p}/sablondan-ekle`, { sablonId: sablon.id })).statusCode, 403);
    assert.equal((await gonder(yazar, `/projeler/${p}/sablondan-ekle`, { sablonId: sablon.id })).statusCode, 200);
    assert.equal((await oku(okur, '/projeler/gorevlerim/liste')).statusCode, 403);
    assert.equal((await oku(isleyen, '/projeler/gorevlerim/liste')).statusCode, 200);
  });

  test('kendi işi (T1 not): bitiren, sonradan yapan değişse de onaylayamaz', async () => {
    const p = await projeAc();
    const g = await gorevAc(p, { sorumluKisiId: kalite1.id, kontrolRolId: rolId('kalite') });
    await basarili(kalite1, g.id, 'basla');
    await basarili(kalite1, g.id, 'bitir');
    const x = (await ayrinti(planlama, g.id)).gorev;
    const d = await gonder(planlama, `/projeler/gorevler/${g.id}/guncelle`, {
      kilometreTasiId: null, ad: x.ad, aciklama: null, sorumluKisiId: kalite2.id, planBaslangic: x.planBaslangic, planBitis: x.planBitis,
      oncekiGorevId: null, gercekBaslangic: x.gercekBaslangic, gercekBitis: x.gercekBitis, ilerleme: x.ilerleme, durum: x.durum, surum: x.surum,
      kontrolRolId: x.kontrolRolId,
    });
    assert.equal(d.statusCode, 200, d.body);
    assert.equal((await komut(kalite1, g.id, 'onayla')).statusCode, 403, 'bitiren artık yapan değil ama yine onaylayamaz');
    assert.equal((await komut(kalite2, g.id, 'onayla')).statusCode, 403, 'yeni yapan da onaylayamaz');
  });

  test('bildirim (3303): alıcısı kayda bağlıdır, Bildirim yönetimi alıcı seçmez, gösterimi ayarlar', async () => {
    const ayar = await gonder(yonetici, '/bildirimler/alicilar/projeler.gorev-atandi/degistir', { rolIdleri: [rolId('kalite')], kisiIdleri: [], surum: null });
    assert.equal(ayar.statusCode, 400, 'kayda bağlı türün alıcısı seçilmez');
    const alicilar = (await oku(yonetici, '/bildirimler/alicilar')).json<{ satirlar: { tur: string }[] }>().satirlar.map((t) => t.tur);
    assert.ok(!alicilar.some((t) => t.startsWith('projeler.gorev')), 'alıcı listesinde yok');
    const gosterim = (await oku(yonetici, '/bildirimler/gosterim')).json<{ satirlar: { tur: string }[] }>().satirlar.map((t) => t.tur);
    assert.ok(gosterim.includes('projeler.gorev-atandi'), 'gösterimi (onay istenir) ayarlanır');
    const p = await projeAc();
    const once = await okunmamis(kalite2.id, 'projeler.gorev-atandi');
    await gorevAc(p, { sorumluKisiId: kalite1.id });
    assert.equal(await okunmamis(kalite2.id, 'projeler.gorev-atandi'), once, 'yalnız atanana gider');
    assert.ok(await okunmamis(kalite1.id, 'projeler.gorev-atandi') >= 1, 'atanan kişiye gider');
    // Tür eskiden alıcı ayarlıydı: kalmış bir kayıtlı seçim (yalnız kalite2) atananı susturmaz.
    await vt().sorgu("INSERT INTO bildirim_tur_ayari (tur) VALUES ('projeler.gorev-atandi')");
    await vt().sorgu("INSERT INTO bildirim_tur_kisisi (tur, kisi_id) VALUES ('projeler.gorev-atandi', $1)", [kalite2.id]);
    const p2 = await projeAc();
    const kalite1Once = await okunmamis(kalite1.id, 'projeler.gorev-atandi');
    await gorevAc(p2, { sorumluKisiId: kalite1.id });
    assert.equal(await okunmamis(kalite1.id, 'projeler.gorev-atandi'), kalite1Once + 1, 'eski alıcı kaydı okunmaz');
    assert.equal(await okunmamis(kalite2.id, 'projeler.gorev-atandi'), once, 'kayıttaki kişiye gitmez');
    // 3303-2 a: atama bildirimi "Okudum, anladım" denene kadar kalır; onaysız arşive kaldırılamaz.
    const satir = await vt().tek<{ id: number; onay: boolean }>(
      "SELECT id, onay_istenir AS onay FROM bildirim_kaydi WHERE kisi_id = $1 AND tur = 'projeler.gorev-atandi' ORDER BY id DESC LIMIT 1", [kalite1.id],
    );
    assert.equal(satir?.onay, true, 'onay ister');
    const arsiv = await app.inject({ method: 'POST', url: `/api/bildirimler/${satir?.id ?? 0}/arsivle`, payload: {}, headers: { cookie: kalite1.cerez, 'istek-kimligi': randomUUID() } });
    assert.equal(arsiv.statusCode, 400, arsiv.body);
  });

  test('iptal (3303-1 c): görev silinmez, görev yazan iptal eder; bitmiş ve iptal görev iptal edilmez; kontrol bildirimi kapanır', async () => {
    const p = await projeAc();
    const a = await gorevAc(p, { sorumluKisiId: kalite1.id });
    assert.equal((await komut(kalite1, a.id, 'iptal')).statusCode, 403, 'görev işleyen iptal edemez');
    const eski = await gonder(planlama, `/projeler/gorevler/${a.id}/iptal`, { surum: a.surum + 1 });
    assert.equal(eski.statusCode, 409, `eski sürümle iptal: ${eski.body}`);
    const iptal = await basarili(planlama, a.id, 'iptal');
    assert.equal(iptal.gorev.durum, 'iptal');
    assert.equal((await komut(planlama, a.id, 'iptal')).statusCode, 400, 'iptal görev yeniden iptal edilmez');
    assert.equal((await komut(kalite1, a.id, 'basla')).statusCode, 400, 'iptal görev işlenmez');
    const y = (await oku(planlama, `/projeler/${p}/yonetim`)).json<ProjeYonetimiCevabi>();
    assert.ok(y.gorevler.some((g) => g.id === a.id && g.durum === 'iptal'), 'görev listede kalır');
    // Kontrolde bekleyen görev iptal edilince kontrol bildirimi kapanır.
    const baskaKontrolcu = await islemliKisi(['projeler.gorev-kontrol']);
    const k = await gorevAc(p, { sorumluKisiId: kalite1.id, kontrolKisiId: kalite2.id });
    await basarili(kalite1, k.id, 'basla');
    await basarili(kalite1, k.id, 'bitir');
    const bekleyen = await okunmamis(kalite2.id, 'projeler.gorev-kontrol-bekliyor');
    assert.ok(bekleyen >= 1);
    assert.equal(await okunmamis(baskaKontrolcu.id, 'projeler.gorev-kontrol-bekliyor'), 0, 'kontrol bildirimi yalnız kayıttaki kontrol edene');
    await basarili(planlama, k.id, 'iptal');
    assert.equal(await okunmamis(kalite2.id, 'projeler.gorev-kontrol-bekliyor'), bekleyen - 1, 'kontrol bildirimi kapandı');
    assert.equal((await komut(kalite2, k.id, 'onayla')).statusCode, 400, 'iptal görev onaylanmaz');
    // Bitmiş görev iptal edilmez.
    const b = await gorevAc(p, { sorumluKisiId: kalite1.id });
    await basarili(kalite1, b.id, 'basla');
    await basarili(kalite1, b.id, 'bitir');
    assert.equal((await komut(planlama, b.id, 'iptal')).statusCode, 400);
  });

  test('geri çevir (3458-4 a): atanan gerekçeyle geri çevirir; kişi görevi atanmamış, üstlenilen rol görevi role döner; yazana zil', async () => {
    const p = await projeAc();
    const zil = 'projeler.gorev-geri-cevrildi';
    const onceki = await okunmamis(planlama.id, zil);
    const a = await gorevAc(p, { sorumluKisiId: operator1.id });
    await basarili(operator1, a.id, 'basla');
    assert.equal((await ayrinti(operator1, a.id)).izinler.geriCevirebilir, true);
    assert.equal((await komut(operator1, a.id, 'geri-cevir', { gerekce: '  ' })).statusCode, 400, 'gerekçesiz geri çevrilmez');
    assert.equal((await komut(kalite1, a.id, 'geri-cevir', { gerekce: 'Benim değil' })).statusCode, 403, 'atanmayan geri çeviremez');
    // Projeyi okuyamayan atanan kişi geri çevirince de cevap alır (geçmişteki olayı onu ilgili tutar).
    const atamaOnce = await okunmamis(operator1.id, 'projeler.gorev-atandi');
    const c = await basarili(operator1, a.id, 'geri-cevir', { gerekce: 'Tezgah arızalı' });
    assert.equal(await okunmamis(operator1.id, 'projeler.gorev-atandi'), atamaOnce - 1, '3478: geri çevirenin atama bildirimi kapandı');
    assert.deepEqual([c.gorev.sorumluKisiId, c.gorev.yapanRolId, c.gorev.durum], [null, null, 'suruyor']);
    assert.deepEqual([c.olaylar[0]?.olay, c.olaylar[0]?.gerekce], ['cevir', 'Tezgah arızalı']);
    assert.equal(c.izinler.geriCevirebilir, false);
    assert.equal(await okunmamis(planlama.id, zil), onceki + 1, 'görevi yazana zil');
    assert.equal(await okunmamis(operator1.id, zil), 0, 'geri çevirene zil gitmez');
    assert.equal((await komut(operator1, a.id, 'bitir')).statusCode, 403, 'geri çeviren artık işleyemez');
    assert.deepEqual(await olaylar(a.id), ['basla', 'cevir']);

    // Rol görevi: üstlenen geri çevirince görev role döner, rolden başkası üstlenir.
    const r = await gorevAc(p, { yapanRolId: rolId('kalite') });
    await basarili(kalite1, r.id, 'ustlen');
    const satir = async () => vt().tek<{ yapan_rol_id: number | null; ustlenilen_rol_id: number | null; sorumlu_kisi_id: number | null }>(
      'SELECT yapan_rol_id, ustlenilen_rol_id, sorumlu_kisi_id FROM projeler_gorev WHERE id = $1', [r.id]);
    assert.deepEqual(await satir(), { yapan_rol_id: null, ustlenilen_rol_id: rolId('kalite'), sorumlu_kisi_id: kalite1.id });
    // Önceki atama zilleri okunmuş sayılır; role dönen görevin zili görev başına yeni satırdır (3478).
    await vt().sorgu("UPDATE bildirim_kaydi SET okundu = now() WHERE kisi_id = $1 AND tur = 'projeler.gorev-atandi'", [kalite2.id]);
    const rc = await basarili(kalite1, r.id, 'geri-cevir', { gerekce: 'Ölçü aleti kalibrasyonda' });
    assert.equal(await okunmamis(kalite2.id, 'projeler.gorev-atandi'), 1, 'role dönünce rolün öteki üyesine atama zili');
    assert.deepEqual([rc.gorev.sorumluKisiId, rc.gorev.yapanRolId], [null, rolId('kalite')]);
    assert.deepEqual(await satir(), { yapan_rol_id: rolId('kalite'), ustlenilen_rol_id: null, sorumlu_kisi_id: null });
    assert.equal((await ayrinti(kalite2, r.id)).izinler.ustlenebilir, true, 'rolden başkası üstlenir');
    await basarili(kalite2, r.id, 'ustlen');

    // Düzenleme: aynı kişi kalınca üstlenilen rol korunur; kişi değişince silinir (görev artık rolden üstlenilmiş değildir).
    const x = (await ayrinti(planlama, r.id)).gorev;
    const govde = (d: Record<string, unknown>) => ({
      kilometreTasiId: null, ad: x.ad, aciklama: null, sorumluKisiId: x.sorumluKisiId, planBaslangic: x.planBaslangic, planBitis: x.planBitis,
      oncekiGorevId: null, gercekBaslangic: x.gercekBaslangic, gercekBitis: x.gercekBitis, ilerleme: x.ilerleme, durum: x.durum, surum: x.surum, ...d,
    });
    const yol = `/projeler/gorevler/${r.id}/guncelle`;
    assert.equal((await gonder(planlama, yol, govde({ ad: 'Akış görevi (ad)' }))).statusCode, 200);
    assert.equal((await satir())?.ustlenilen_rol_id, rolId('kalite'));
    assert.equal((await gonder(planlama, yol, govde({ sorumluKisiId: kalite1.id, surum: x.surum + 1 }))).statusCode, 200);
    assert.deepEqual(await satir(), { yapan_rol_id: null, ustlenilen_rol_id: null, sorumlu_kisi_id: kalite1.id });

    // Kontrolde, bitmiş ve iptal görev geri çevrilmez.
    const k = await gorevAc(p, { sorumluKisiId: kalite1.id, kontrolKisiId: kalite2.id });
    await basarili(kalite1, k.id, 'basla');
    await basarili(kalite1, k.id, 'bitir');
    assert.equal((await komut(kalite1, k.id, 'geri-cevir', { gerekce: 'Geç kaldım' })).statusCode, 400, 'kontrolde');
    await basarili(kalite2, k.id, 'onayla');
    assert.equal((await komut(kalite1, k.id, 'geri-cevir', { gerekce: 'Geç kaldım' })).statusCode, 400, 'bitti');
    const i = await gorevAc(p, { sorumluKisiId: kalite1.id });
    await basarili(planlama, i.id, 'iptal');
    assert.equal((await komut(kalite1, i.id, 'geri-cevir', { gerekce: 'Gerek yok' })).statusCode, 400, 'iptal');

    // Kısıt: üstlenilen rol yalnız kişili ve rolsüz satırda durur; cevir olayı gerekçesiz yazılmaz.
    await assert.rejects(vt().sorgu('UPDATE projeler_gorev SET ustlenilen_rol_id = $2, sorumlu_kisi_id = NULL WHERE id = $1', [i.id, rolId('kalite')]));
    await assert.rejects(vt().sorgu('UPDATE projeler_gorev SET ustlenilen_rol_id = $2, yapan_rol_id = $2, sorumlu_kisi_id = NULL WHERE id = $1', [i.id, rolId('kalite')]));
    await assert.rejects(vt().sorgu("INSERT INTO projeler_gorev_olayi (gorev_id, olay, kisi_id) VALUES ($1, 'cevir', $2)", [i.id, kalite1.id]));
  });

  test('geri çevir yetkisi (T1): yalnız gorev-isle taşıyan atanan geri çevirir', async () => {
    const isleyen = await islemliKisi(['projeler.gorev-isle']);
    const kontrolcu = await islemliKisi(['projeler.gorev-kontrol']);
    const p = await projeAc();
    const a = await gorevAc(p, { sorumluKisiId: kontrolcu.id });
    assert.equal((await ayrinti(kontrolcu, a.id)).izinler.geriCevirebilir, false, 'gorev-isle yoksa düğme yok');
    assert.equal((await komut(kontrolcu, a.id, 'geri-cevir', { gerekce: 'Bende değil' })).statusCode, 403);
    const b = await gorevAc(p, { sorumluKisiId: isleyen.id });
    const c = await basarili(isleyen, b.id, 'geri-cevir', { gerekce: 'Bende değil' });
    assert.equal(c.gorev.sorumluKisiId, null);
  });

  test('3478: atama bildirimi görev başınadır; aynı projede ikinci görev ayrı satır açar, iptal edilen görevin bildirimi kapanır', async () => {
    const kisi = await islemliKisi(['projeler.gorev-isle']);
    const p = await projeAc();
    const a = await gorevAc(p, { sorumluKisiId: kisi.id });
    const b = await gorevAc(p, { sorumluKisiId: kisi.id });
    await gorevAc(p, { sorumluKisiId: kisi.id });
    assert.equal(await okunmamis(kisi.id, 'projeler.gorev-atandi'), 3, 'üç görev üç bildirim');
    await basarili(planlama, a.id, 'iptal');
    assert.equal(await okunmamis(kisi.id, 'projeler.gorev-atandi'), 2, 'iptal komutuyla kapanan görevin bildirimi kapandı, ötekiler kaldı');
    // Düzenleme ekranından durum iptal yapılınca da o görevin atama bildirimi kapanır.
    const surum = (await vt().tek<{ surum: number }>('SELECT surum FROM projeler_gorev WHERE id = $1', [b.id]))?.surum ?? 0;
    const d = await gonder(planlama, `/projeler/gorevler/${b.id}/guncelle`, {
      ad: 'Akış görevi', planBaslangic: '2026-12-01', planBitis: '2026-12-05', sorumluKisiId: kisi.id, ilerleme: 0, durum: 'iptal', surum,
    });
    assert.equal(d.statusCode, 200, d.body);
    assert.equal(await okunmamis(kisi.id, 'projeler.gorev-atandi'), 1, 'düzenlemede iptal edilenin bildirimi kapandı, sonuncusu kaldı');
  });
});
