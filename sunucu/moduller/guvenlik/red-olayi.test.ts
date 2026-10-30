import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { RET_NEDENLERI as CEKIRDEK_RET_NEDENLERI, retKaydet, retOlaylariniBosalt } from '#cekirdek/red-kaydi.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { RET_NEDENLERI, alarmListeCevabi, retListeCevabi } from '#paylasilan/sozlesme/guvenlik.ts';
import type { Alarm } from '#paylasilan/sozlesme/guvenlik.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { ADRES_TARAMASI, RED_SAKLAMA_GUN, YETKI_REDDI_SERISI } from './kurallar.ts';
import { olayYazicisiniKur, taramaYap } from './servis.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('guvenlik: reddedilen istekler, yeni sinyaller ve kritik alarm duyurusu (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let mudurId = 0;
  const cerezler = new Map<string, string>();
  const olaylar: string[] = [];
  let olayGeriAl: () => void = () => undefined;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function istek<T = unknown>(ad: string | null, yontem: 'GET' | 'POST', yol: string, ip = '10.0.0.20'): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = ad === null ? {} : { cookie: cerezler.get(ad) ?? '' };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, remoteAddress: ip });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerezler.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  const tara = () => o().vt.tx((db) => taramaYap(db));
  const alarmlar = async (): Promise<Alarm[]> => {
    const c = await istek<unknown>('yonetici', 'GET', '/guvenlik-alarmlari?gorunum=hepsi&sayfaBoyu=200');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return alarmListeCevabi.parse(c.govde).satirlar;
  };

  before(async () => {
    ortam = await testVeritabaniKur('guvenlikret');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const rol = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'mudur'");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    mudurId = await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Müdür', kullaniciAdi: 'mudur', parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return yeni;
    });
    await giris('yonetici');
    await giris('mudur');
    olayGeriAl = olayYazicisiniKur((metin) => { olaylar.push(metin); });
  });
  after(async () => {
    olayGeriAl();
    await app?.close();
    await ortam?.kaldir();
  });

  test('ret nedeni listesi çekirdek, sözleşme ve tablo kısıtında aynıdır', async () => {
    assert.deepEqual([...RET_NEDENLERI], [...CEKIRDEK_RET_NEDENLERI]);
    const kisit = await o().vt.tek<{ tanim: string }>(
      "SELECT pg_get_constraintdef(oid) AS tanim FROM pg_constraint WHERE conname = 'guvenlik_red_olayi_neden_gecerli' AND conrelid = 'guvenlik_red_olayi'::regclass",
    );
    assert.deepEqual([...(kisit?.tanim ?? '').matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort(), [...RET_NEDENLERI].sort());
  });

  test('reddedilen istek tarama turunda tabloya geçer; liste yalnız guvenlik.oku ile okunur, süzgeç ve arama sunucuda', async () => {
    retOlaylariniBosalt();
    assert.equal((await istek('mudur', 'GET', '/guvenlik/ozet')).durum, 403);
    assert.equal((await istek(null, 'GET', '/guvenlik/ozet', '10.0.0.30')).durum, 401);
    assert.equal((await istek('mudur', 'GET', '/yok-boyle-bir-adres?x=1', '10.0.0.31')).durum, 404);
    assert.equal((await istek('yonetici', 'GET', '/guvenlik/ozet')).durum, 200);
    await tara();
    assert.deepEqual(retOlaylariniBosalt().olaylar, []);

    assert.equal((await istek('mudur', 'GET', '/guvenlik/reddedilen-istekler')).durum, 403);
    const liste = await istek<unknown>('yonetici', 'GET', '/guvenlik/reddedilen-istekler?sayfaBoyu=200');
    assert.equal(liste.durum, 200);
    const satirlar = retListeCevabi.parse(liste.govde).satirlar;
    const ozet = satirlar.map((r) => [r.neden, r.kisiAdi, r.yontem, r.yol, r.ip]);
    assert.deepEqual(ozet.find((r) => r[0] === 'yetki'), ['yetki', 'Deneme Müdür', 'GET', '/guvenlik/ozet', '10.0.0.20']);
    assert.deepEqual(ozet.find((r) => r[0] === 'oturum-yok'), ['oturum-yok', null, 'GET', '/guvenlik/ozet', '10.0.0.30']);
    assert.deepEqual(ozet.find((r) => r[0] === 'adres-yok'), ['adres-yok', null, 'GET', '/api/yok-boyle-bir-adres', '10.0.0.31']);

    const suzulmus = retListeCevabi.parse((await istek('yonetici', 'GET', '/guvenlik/reddedilen-istekler?neden=adres-yok')).govde);
    assert.equal(suzulmus.satirlar.every((r) => r.neden === 'adres-yok'), true);
    const aranan = retListeCevabi.parse((await istek('yonetici', 'GET', '/guvenlik/reddedilen-istekler?ara=10.0.0.30')).govde);
    assert.deepEqual(aranan.satirlar.map((r) => r.ip), ['10.0.0.30']);
    assert.equal((await istek('yonetici', 'GET', '/guvenlik/reddedilen-istekler?neden=uydurma')).durum, 400);
  });

  test('yetki reddi serisi: bir kişi farklı uçlarda eşik kadar red alınca yüksek alarm; aynı ucu yoklamak ve telefon reddi sayılmaz', async () => {
    const yaz = (kisiId: number, neden: 'yetki' | 'cihaz', yol: string) =>
      retKaydet({ zaman: new Date(), neden, kisiId, yontem: 'GET', yol, ip: '10.0.0.40' });
    for (let i = 0; i < 20; i += 1) yaz(yoneticiId, 'yetki', '/ayni-uc');
    for (let i = 0; i < YETKI_REDDI_SERISI.farkliUc; i += 1) yaz(yoneticiId, 'cihaz', `/telefon-${i}`);
    await tara();
    assert.equal((await alarmlar()).some((a) => a.sinyal === 'yetki-reddi-serisi' && a.kisiId === yoneticiId), false);

    for (let i = 0; i < YETKI_REDDI_SERISI.farkliUc; i += 1) yaz(mudurId, 'yetki', `/uc-${i}`);
    await tara();
    const alarm = (await alarmlar()).find((a) => a.sinyal === 'yetki-reddi-serisi' && a.kisiId === mudurId);
    assert.equal(alarm?.onem, 'yuksek');
    assert.equal(alarm?.kisiAdi, 'Deneme Müdür');
    assert.equal(olaylar.some((m) => m.includes('Yetkisiz')), false, 'yüksek alarm olay günlüğüne yazılmaz');
  });

  test('adres taraması: bir cihazdan eşik kadar farklı var olmayan adres kritik alarm açar; yöneticiye bildirim ve olay günlüğü', async () => {
    for (let i = 0; i < ADRES_TARAMASI.farkliYol - 1; i += 1) await istek(null, 'GET', `/tarama-${i}`, '10.0.0.66');
    await tara();
    assert.equal((await alarmlar()).some((a) => a.sinyal === 'adres-taramasi' && a.ip === '10.0.0.66'), false);

    await istek(null, 'GET', '/tarama-son', '10.0.0.66');
    await tara();
    const alarm = (await alarmlar()).find((a) => a.sinyal === 'adres-taramasi' && a.ip === '10.0.0.66');
    assert.equal(alarm?.onem, 'kritik');
    assert.equal(alarm?.gozlenenSayi, ADRES_TARAMASI.farkliYol);
    assert.deepEqual(olaylar.filter((m) => m.includes('10.0.0.66')), [`TMI guvenlik alarmi: Adres taraması: 10.0.0.66 (${String(ADRES_TARAMASI.farkliYol)})`]);

    const bildirimler = await istek<{ satirlar: { tur: string; yol: string | null }[] }>('yonetici', 'GET', '/bildirimler');
    assert.deepEqual(bildirimler.govde.satirlar.filter((b) => b.tur === 'guvenlik.kritik-alarm').map((b) => b.yol), ['/guvenlik/alarmlar']);
    const mudurun = await istek<{ satirlar: { tur: string }[] }>('mudur', 'GET', '/bildirimler');
    assert.equal(mudurun.govde.satirlar.some((b) => b.tur === 'guvenlik.kritik-alarm'), false);

    // Koşul sürdükçe aynı alarm güncellenir; yeni duyuru gitmez.
    await istek(null, 'GET', '/tarama-yeni', '10.0.0.66');
    await tara();
    assert.equal(olaylar.filter((m) => m.includes('10.0.0.66')).length, 1);
  });

  test('saklama: satır değişmez, genç satır silinmez, boşaltılamaz; süresi geçeni tarama siler; sınır kod sabitiyle aynıdır', async () => {
    const kisitli = (ad: string) => (h: unknown) => (h as { constraint?: string }).constraint === ad;
    const ekle = async (gunOnce: number): Promise<number> => {
      const r = await o().vt.tek<{ id: number }>(
        `INSERT INTO guvenlik_red_olayi (zaman, neden, yontem, yol, ip) VALUES (now() - make_interval(days => $1), 'adres-yok', 'GET', '/eski', '10.0.0.90')
         RETURNING id::int AS id`, [gunOnce],
      );
      if (!r) throw new Error('satır yazılamadı');
      return r.id;
    };
    const genc = await ekle(RED_SAKLAMA_GUN - 1);
    const eski = await ekle(RED_SAKLAMA_GUN + 1);
    await assert.rejects(o().vt.sorgu("UPDATE guvenlik_red_olayi SET yol = '/x' WHERE id = $1", [genc]));
    await assert.rejects(o().vt.sorgu('DELETE FROM guvenlik_red_olayi WHERE id = $1', [genc]), kisitli('guvenlik_red_olayi_silinmez'));
    await assert.rejects(o().vt.sorgu('TRUNCATE guvenlik_red_olayi'));
    await assert.rejects(
      o().vt.sorgu("INSERT INTO guvenlik_red_olayi (zaman, neden, yontem, yol) VALUES (now(), 'yetki', 'GET', '/x')"),
      kisitli('guvenlik_red_olayi_kisi_nedene_uygun'),
    );
    await tara();
    const kalan = await o().vt.sorgu<{ id: number }>('SELECT id::int AS id FROM guvenlik_red_olayi WHERE id = ANY($1::int[])', [[genc, eski]]);
    assert.deepEqual(kalan.map((r) => r.id), [genc]);
  });
});
