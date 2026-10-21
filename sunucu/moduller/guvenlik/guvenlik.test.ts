import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isiBirKezCalistir, modulIsleriniKesfet } from '#cekirdek/zamanlayici.ts';
import { SINYALLER, alarmListeCevabi, alarmSemasi, kilitListeCevabi, korumaCevabi, kurallarCevabi, oturumlarCevabi, ozetCevabi } from '#paylasilan/sozlesme/guvenlik.ts';
import type { Alarm } from '#paylasilan/sozlesme/guvenlik.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { HATALI_SERI, SAKLAMA_GUN } from './kurallar.ts';
import { taramaYap } from './servis.ts';
import { taramaKilidiAl } from './sorgular.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('guvenlik: alarm defteri, tarama ve uçlar (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function istek<T = unknown>(ad: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = ad === null ? {} : { cookie: cerezler.get(ad) ?? '' };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  async function giris(kullaniciAdi: string, cerezAdi = kullaniciAdi, tarayici?: string): Promise<void> {
    const c = await app.inject({
      method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA },
      ...(tarayici === undefined ? {} : { headers: { 'user-agent': tarayici } }),
    });
    assert.equal(c.statusCode, 200, c.body);
    cerezler.set(cerezAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<number> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    return o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return yeni;
    });
  }

  // Deneme satırları doğrudan yazılır: giriş akışının beklemesi on hatalı denemeyi dakikalara yayar.
  const deneme = async (ad: string, ip: string | null, adet: number, onceSn = 30, sonuc: 'hatali' | 'basarili' = 'hatali'): Promise<void> => {
    for (let i = 0; i < adet; i += 1) {
      await o().vt.sorgu(
        'INSERT INTO giris_denemesi (kullanici_adi, sonuc, ip, zaman) VALUES ($1, $2, $3, now() - make_interval(secs => $4))',
        [ad, sonuc, ip, onceSn + i],
      );
    }
  };
  const tara = () => o().vt.tx((db) => taramaYap(db));
  const alarmlar = async (): Promise<Alarm[]> => {
    const c = await istek<unknown>('yonetici', 'GET', '/guvenlik-alarmlari?gorunum=hepsi&sayfaBoyu=200');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return alarmListeCevabi.parse(c.govde).satirlar;
  };
  const alarmBul = async (k: Partial<Pick<Alarm, 'sinyal' | 'kullaniciAdi' | 'ip' | 'kisiId' | 'durum'>>): Promise<Alarm[]> =>
    (await alarmlar()).filter((a) => Object.entries(k).every(([alan, deger]) => a[alan as keyof Alarm] === deger));
  const defterSayisi = async (): Promise<number> =>
    (await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM guvenlik_taramasi'))?.n ?? -1;
  const kapaliAlarmYaz = async (gunOnce: number): Promise<number> => {
    const r = await o().vt.tek<{ id: number }>(
      `INSERT INTO guvenlik_alarmi (sinyal, onem, kullanici_adi, gozlenen_sayi, ilk_goruldu, son_goruldu, durum, kapatan_kisi_id, kapandi, kapanis_notu)
       VALUES ('hatali-giris-serisi', 'orta', $1, 10, now() - make_interval(days => $2 + 1), now() - make_interval(days => $2 + 1),
               'kapandi', $3, now() - make_interval(days => $2), 'Deneme notu') RETURNING id::int AS id`,
      [`saklama-${gunOnce}-${Math.random().toString(36).slice(2, 8)}`, gunOnce, yoneticiId],
    );
    if (!r) throw new Error('alarm yazılamadı');
    return r.id;
  };

  before(async () => {
    ortam = await testVeritabaniKur('guvenlik');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    await kisiEkle('mudur', 'mudur');
    await giris('mudur');
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('G-19: her uç oturumsuz 401, yönetici olmayan (müdür) 403; yönetici okur; sayaç yetkisize sayı vermez', async () => {
    const okumalar = ['/guvenlik/ozet', '/guvenlik-alarmlari', '/guvenlik-alarmlari/1', '/guvenlik/girisler', '/guvenlik/oturumlar', '/guvenlik/kilitler', '/guvenlik/koruma', '/guvenlik/kurallar'];
    const yazmalar = ['/guvenlik-alarmlari/1/onayla', '/guvenlik-alarmlari/1/kapat', '/guvenlik/oturumlar/1/kapat', '/guvenlik/kilitler/1/ac'];
    for (const yol of okumalar) {
      assert.equal((await istek(null, 'GET', yol)).durum, 401, yol);
      assert.equal((await istek('mudur', 'GET', yol)).durum, 403, yol);
    }
    for (const yol of yazmalar) {
      assert.equal((await istek(null, 'POST', yol, { surum: 1, not: 'x' })).durum, 401, yol);
      assert.equal((await istek('mudur', 'POST', yol, { surum: 1, not: 'x' })).durum, 403, yol);
    }
    for (const yol of okumalar.filter((y) => y !== '/guvenlik-alarmlari/1')) {
      assert.equal((await istek('yonetici', 'GET', yol)).durum, 200, yol);
    }
    assert.equal((await istek('yonetici', 'GET', '/guvenlik-alarmlari/999999')).durum, 404);
    assert.deepEqual((await istek('mudur', 'GET', '/guvenlik/menu-sayaclari')).govde, {});
    const sayac = await istek<Record<string, number>>('yonetici', 'GET', '/guvenlik/menu-sayaclari');
    assert.equal(sayac.durum, 200);
    assert.equal(Number.isInteger(sayac.govde.alarmlar), true);
  });

  test('G-02, G-03, G-20: tarama koşulu taşıyan kaynağa alarm açar, önemiyle; eşiğin altı açmaz; defter yalnız yeni alarmda yazılır (G-16)', async () => {
    await deneme('g02-ad', '10.2.0.1', HATALI_SERI.esik);
    await deneme('g02-eksik', '10.2.0.2', HATALI_SERI.esik - 1);
    await deneme('g03-a', '10.3.0.1', 1);
    await deneme('g03-b', '10.3.0.1', 1);
    await deneme('g03-c', '10.3.0.1', 1);
    await deneme('g20-ad', '10.20.0.1', 1);
    await deneme('g20-ad', '10.20.0.2', 1);
    await deneme('g20-ad', '10.20.0.3', 1);
    const defterOnce = await defterSayisi();
    const sonuc = await tara();
    assert.ok(sonuc && sonuc.yeniAlarm >= 3, JSON.stringify(sonuc));
    assert.equal(await defterSayisi(), defterOnce + 1);

    const [seri] = await alarmBul({ sinyal: 'hatali-giris-serisi', kullaniciAdi: 'g02-ad' });
    assert.deepEqual([seri?.onem, seri?.ip, seri?.gozlenenSayi, seri?.durum, seri?.tekrarSayisi], ['orta', '10.2.0.1', 10, 'acik', 1]);
    assert.deepEqual(await alarmBul({ kullaniciAdi: 'g02-eksik' }), []);
    const [yayilan] = await alarmBul({ sinyal: 'yayilan-deneme', ip: '10.3.0.1' });
    assert.deepEqual([yayilan?.onem, yayilan?.gozlenenSayi, yayilan?.kullaniciAdi], ['yuksek', 3, null]);
    const [hedefli] = await alarmBul({ sinyal: 'hedefli-hesap', kullaniciAdi: 'g20-ad' });
    assert.deepEqual([hedefli?.onem, hedefli?.gozlenenSayi, hedefli?.ip], ['yuksek', 3, null]);

    // G-06, G-07: koşul sürerken ikinci tarama yeni alarm açmaz; aynı veriyle sayaçlara dokunmaz, defter yazılmaz.
    const ikinci = await tara();
    assert.equal(ikinci?.yeniAlarm, 0);
    assert.equal(await defterSayisi(), defterOnce + 1);
    assert.equal((await alarmBul({ sinyal: 'hatali-giris-serisi', kullaniciAdi: 'g02-ad' })).length, 1);
    assert.equal((await alarmBul({ sinyal: 'hatali-giris-serisi', kullaniciAdi: 'g02-ad' }))[0]?.tekrarSayisi, 1);

    // G-07: yeni hatalı deneme sayaçları günceller; sürüm (insan kararlarının koruması) değişmez.
    await deneme('g02-ad', '10.2.0.1', 1, 0);
    const ucuncu = await tara();
    assert.ok((ucuncu?.guncellenenAlarm ?? 0) >= 1);
    const [guncel] = await alarmBul({ sinyal: 'hatali-giris-serisi', kullaniciAdi: 'g02-ad' });
    assert.deepEqual([guncel?.gozlenenSayi, guncel?.tekrarSayisi, guncel?.surum], [11, 2, seri?.surum]);
    assert.ok(guncel && seri && Date.parse(guncel.sonGoruldu) > Date.parse(seri.sonGoruldu));
  });

  test('G-05: bir kişinin 4 geçerli oturumu çok-oturum alarmı açar; 3 açmaz', async () => {
    const kisiId = await kisiEkle('cok-oturum', 'operator');
    for (let i = 0; i < 3; i += 1) await giris('cok-oturum', `cok-${i}`);
    await tara();
    assert.deepEqual(await alarmBul({ sinyal: 'cok-oturum', kisiId }), []);
    await giris('cok-oturum', 'cok-3');
    await tara();
    const [alarm] = await alarmBul({ sinyal: 'cok-oturum', kisiId });
    assert.deepEqual([alarm?.onem, alarm?.gozlenenSayi, alarm?.kisiAdi], ['orta', 4, 'Deneme cok-oturum']);
  });

  test('G-08, G-09: koşulu biten alarm kendiliğinden kapanmaz; kapanan alarmın koşulu sürerse yeni alarm açılır', async () => {
    await o().vt.sorgu("INSERT INTO guvenlik_alarmi (sinyal, onem, kullanici_adi, gozlenen_sayi) VALUES ('hatali-giris-serisi', 'orta', 'g09-sessiz', 10)");
    await tara();
    assert.deepEqual((await alarmBul({ kullaniciAdi: 'g09-sessiz' })).map((a) => a.durum), ['acik']);

    await deneme('g08-ad', '10.8.0.1', HATALI_SERI.esik);
    await tara();
    const [ilk] = await alarmBul({ kullaniciAdi: 'g08-ad' });
    assert.ok(ilk);
    const kapat = await istek<Alarm>('yonetici', 'POST', `/guvenlik-alarmlari/${ilk.id}/kapat`, { surum: ilk.surum, not: 'Kişi parolasını unutmuş.' });
    assert.equal(kapat.durum, 200, JSON.stringify(kapat.govde));
    const yeni = await tara();
    assert.ok((yeni?.yeniAlarm ?? 0) >= 1);
    assert.deepEqual((await alarmBul({ kullaniciAdi: 'g08-ad' })).map((a) => a.durum).sort(), ['acik', 'kapandi']);
  });

  test('G-15: tarama aynı anda tek kopya; kilidi alamayan tur hiçbir şey yazmadan null döner', async () => {
    let alindi!: () => void;
    let birak!: () => void;
    const kilitAlindi = new Promise<void>((coz) => { alindi = coz; });
    const bekle = new Promise<void>((coz) => { birak = coz; });
    const durumOnce = await o().vt.tek<{ son: string }>('SELECT son_tarama::text AS son FROM guvenlik_tarama_durumu');
    const tutan = o().vt.tx(async (db) => {
      assert.equal(await taramaKilidiAl(db), true);
      alindi();
      await bekle;
    });
    await kilitAlindi;
    try {
      assert.equal(await tara(), null);
      const durumSonra = await o().vt.tek<{ son: string }>('SELECT son_tarama::text AS son FROM guvenlik_tarama_durumu');
      assert.deepEqual(durumSonra, durumOnce);
    } finally {
      birak();
      await tutan;
    }
    assert.notEqual(await tara(), null);
  });

  test('onay ve kapanış: kişi ve zaman sunucudan; eski sürüm 409, durum kuralı 422, boş not 400, gövde kişi seçemez; denetime düşer', async () => {
    await deneme('onay-ad', '10.9.0.1', HATALI_SERI.esik);
    await tara();
    const [alarm] = await alarmBul({ kullaniciAdi: 'onay-ad' });
    assert.ok(alarm);
    const yol = `/guvenlik-alarmlari/${alarm.id}`;
    assert.equal((await istek('yonetici', 'POST', `${yol}/onayla`, { surum: alarm.surum, kisiId: 999 })).durum, 400);
    assert.equal((await istek('yonetici', 'POST', `${yol}/onayla`, { surum: alarm.surum + 1 })).durum, 409);
    const onay = await istek<Alarm>('yonetici', 'POST', `${yol}/onayla`, { surum: alarm.surum });
    assert.equal(onay.durum, 200, JSON.stringify(onay.govde));
    const onayli = alarmSemasi.parse(onay.govde);
    assert.deepEqual([onayli.durum, onayli.onaylayanAdi, onayli.surum], ['onaylandi', 'Deneme Yönetici', alarm.surum + 1]);
    assert.ok(onayli.onaylandi);
    // Onaylanmış alarm yeniden onaylanmaz.
    assert.equal((await istek('yonetici', 'POST', `${yol}/onayla`, { surum: onayli.surum })).durum, 422);
    assert.equal((await istek('yonetici', 'POST', `${yol}/kapat`, { surum: onayli.surum, not: '   ' })).durum, 400);
    assert.equal((await istek('yonetici', 'POST', `${yol}/kapat`, { surum: onayli.surum })).durum, 400);
    const kapat = await istek<Alarm>('yonetici', 'POST', `${yol}/kapat`, { surum: onayli.surum, not: '  Cihaz bilgi işlemde incelendi.  ' });
    assert.equal(kapat.durum, 200, JSON.stringify(kapat.govde));
    const kapali = alarmSemasi.parse(kapat.govde);
    assert.deepEqual([kapali.durum, kapali.kapatanAdi, kapali.kapanisNotu, kapali.onaylayanAdi], ['kapandi', 'Deneme Yönetici', 'Cihaz bilgi işlemde incelendi.', 'Deneme Yönetici']);
    // Kapanmış alarm değişmez (G-13): doğru sürümle de 422.
    assert.equal((await istek('yonetici', 'POST', `${yol}/kapat`, { surum: kapali.surum, not: 'yeniden' })).durum, 422);
    assert.equal((await istek('yonetici', 'POST', '/guvenlik-alarmlari/999999/onayla', { surum: 1 })).durum, 404);
    const denetim = await o().vt.sorgu<{ yol: string; kisi_id: number }>(
      "SELECT yol, kisi_id FROM denetim_kaydi WHERE yol LIKE '/guvenlik-alarmlari/:id/%' AND parametre->>'id' = $1 ORDER BY id",
      [String(alarm.id)],
    );
    assert.deepEqual(denetim.map((d) => d.kisi_id), [yoneticiId, yoneticiId]);
  });

  test('G-10, G-13: veritabanı durumu geri almaz, kapanmış alarmı değiştirmez, kaynağı değiştirmez; açık alarm silinmez; boşaltılamaz', async () => {
    const r = await o().vt.tek<{ id: number }>(
      "INSERT INTO guvenlik_alarmi (sinyal, onem, ip, gozlenen_sayi) VALUES ('yayilan-deneme', 'yuksek', '10.13.0.1', 3) RETURNING id::int AS id",
    );
    const id = r?.id ?? 0;
    const kisitli = (ad: string) => (h: unknown) => (h as { constraint?: string }).constraint === ad;
    await assert.rejects(o().vt.sorgu('DELETE FROM guvenlik_alarmi WHERE id = $1', [id]), kisitli('guvenlik_alarmi_silinmez'));
    await assert.rejects(o().vt.sorgu("UPDATE guvenlik_alarmi SET ip = '10.13.0.2' WHERE id = $1", [id]), kisitli('guvenlik_alarmi_kaynak_degismez'));
    await o().vt.sorgu("UPDATE guvenlik_alarmi SET durum = 'onaylandi', onaylayan_kisi_id = $2, onaylandi = now() WHERE id = $1", [id, yoneticiId]);
    await assert.rejects(
      o().vt.sorgu("UPDATE guvenlik_alarmi SET durum = 'acik', onaylayan_kisi_id = NULL, onaylandi = NULL WHERE id = $1", [id]),
      kisitli('guvenlik_alarmi_durum_ileri'),
    );
    await o().vt.sorgu("UPDATE guvenlik_alarmi SET durum = 'kapandi', kapatan_kisi_id = $2, kapandi = now(), kapanis_notu = 'not' WHERE id = $1", [id, yoneticiId]);
    await assert.rejects(o().vt.sorgu("UPDATE guvenlik_alarmi SET kapanis_notu = 'başka' WHERE id = $1", [id]), kisitli('guvenlik_alarmi_kapanan_degismez'));
    await assert.rejects(o().vt.sorgu('DELETE FROM guvenlik_alarmi WHERE id = $1', [id]), kisitli('guvenlik_alarmi_silinmez'));
    await assert.rejects(o().sahip.sorgu('TRUNCATE guvenlik_alarmi'), /yalnız ekleme/);
    await assert.rejects(o().sahip.sorgu('TRUNCATE guvenlik_taramasi'), /yalnız ekleme/);
    await assert.rejects(o().vt.sorgu('UPDATE guvenlik_taramasi SET yeni_alarm = 5'), /yalnız ekleme/);
  });

  test('G-13 saklama: kapanışının üzerinden süre geçmemiş alarm silinmez, geçmiş olanı tarama siler; sınır kod sabitiyle aynıdır', async () => {
    const genc = await kapaliAlarmYaz(SAKLAMA_GUN - 1);
    const yasli = await kapaliAlarmYaz(SAKLAMA_GUN + 1);
    await assert.rejects(o().vt.sorgu('DELETE FROM guvenlik_alarmi WHERE id = $1', [genc]), (h: unknown) => (h as { constraint?: string }).constraint === 'guvenlik_alarmi_silinmez');
    await o().vt.sorgu("INSERT INTO guvenlik_taramasi (calisti, yeni_alarm, guncellenen_alarm) VALUES (now() - make_interval(days => $1), 1, 0)", [SAKLAMA_GUN + 1]);
    await o().vt.sorgu("INSERT INTO guvenlik_taramasi (calisti, yeni_alarm, guncellenen_alarm) VALUES (now() - make_interval(days => $1), 1, 0)", [SAKLAMA_GUN - 1]);
    const sonuc = await tara();
    assert.ok((sonuc?.silinen ?? 0) >= 2);
    const kalan = await o().vt.sorgu<{ id: number }>('SELECT id::int AS id FROM guvenlik_alarmi WHERE id = ANY($1::bigint[])', [[genc, yasli]]);
    assert.deepEqual(kalan.map((k) => k.id), [genc]);
    const eskiDefter = await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM guvenlik_taramasi WHERE calisti < now() - make_interval(days => $1)', [SAKLAMA_GUN]);
    assert.equal(eskiDefter?.n, 0);
    const gencDefter = await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM guvenlik_taramasi WHERE calisti < now() - make_interval(days => $1)', [SAKLAMA_GUN - 2]);
    assert.equal(gencDefter?.n, 1);
  });

  test('veritabanı kısıtları: yalnız güvenlik sinyali, kaynak sinyale uygun, onay ve kapanış bütün, durum tutarlı, kapanmamış alarm kaynağa tek (G-01, G-06, G-11, G-12)', async () => {
    const kisitli = (ad: string) => (h: unknown) => (h as { constraint?: string }).constraint === ad;
    const yaz = (sutunlar: string, degerler: string, p: unknown[] = []) => o().vt.sorgu(`INSERT INTO guvenlik_alarmi (${sutunlar}) VALUES (${degerler})`, p);
    // Bilinmeyen sinyal kaynak kısıtına da takılır; hangisinin önce raporlanacağı belirsiz olduğundan sinyal kısıtı tanımından okunur.
    await assert.rejects(yaz('sinyal, onem, ip, gozlenen_sayi', "'makine-durdu', 'orta', '10.0.0.1', 1"), (h: unknown) => typeof (h as { constraint?: string }).constraint === 'string');
    const sinyalKisiti = await o().vt.tek<{ tanim: string }>(
      "SELECT pg_get_constraintdef(oid) AS tanim FROM pg_constraint WHERE conname = 'guvenlik_alarmi_sinyal_gecerli' AND conrelid = 'guvenlik_alarmi'::regclass",
    );
    assert.deepEqual([...(sinyalKisiti?.tanim ?? '').matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort(), [...SINYALLER].sort());
    await assert.rejects(yaz('sinyal, onem, ip, gozlenen_sayi', "'hatali-giris-serisi', 'orta', '10.0.0.1', 10"), kisitli('guvenlik_alarmi_kaynak_sinyale_uygun'));
    await assert.rejects(yaz('sinyal, onem, kullanici_adi, gozlenen_sayi', "'cok-oturum', 'orta', 'x', 4"), kisitli('guvenlik_alarmi_kaynak_sinyale_uygun'));
    await assert.rejects(yaz('sinyal, onem, kullanici_adi, gozlenen_sayi, durum, onaylandi', "'hedefli-hesap', 'yuksek', 'k1', 3, 'onaylandi', now()"), kisitli('guvenlik_alarmi_onay_butun'));
    await assert.rejects(
      yaz('sinyal, onem, kullanici_adi, gozlenen_sayi, durum, kapatan_kisi_id, kapandi', "'hedefli-hesap', 'yuksek', 'k2', 3, 'kapandi', $1, now()", [yoneticiId]),
      kisitli('guvenlik_alarmi_kapanis_butun'),
    );
    await assert.rejects(
      yaz('sinyal, onem, kullanici_adi, gozlenen_sayi, durum, kapatan_kisi_id, kapandi, kapanis_notu', "'hedefli-hesap', 'yuksek', 'k3', 3, 'kapandi', $1, now(), '  '", [yoneticiId]),
      kisitli('guvenlik_alarmi_not_gecerli'),
    );
    await assert.rejects(yaz('sinyal, onem, kullanici_adi, gozlenen_sayi, durum', "'hedefli-hesap', 'yuksek', 'k4', 3, 'onaylandi'"), kisitli('guvenlik_alarmi_durum_tutarli'));
    await assert.rejects(yaz('sinyal, onem, kullanici_adi, gozlenen_sayi', "'hedefli-hesap', 'yuksek', 'k5', 0"), kisitli('guvenlik_alarmi_gozlenen_gecerli'));
    await yaz('sinyal, onem, kullanici_adi, gozlenen_sayi', "'hedefli-hesap', 'yuksek', 'k6', 3");
    await assert.rejects(yaz('sinyal, onem, kullanici_adi, gozlenen_sayi', "'hedefli-hesap', 'yuksek', 'k6', 4"), kisitli('guvenlik_alarmi_acik_tekil'));
    await assert.rejects(o().vt.sorgu('INSERT INTO guvenlik_tarama_durumu (tek, son_tarama) VALUES (false, now())'), kisitli('guvenlik_tarama_durumu_tek'));
    await assert.rejects(o().vt.sorgu('INSERT INTO guvenlik_taramasi (yeni_alarm, guncellenen_alarm) VALUES (0, 0)'), kisitli('guvenlik_taramasi_yeni_alarm_gecerli'));
  });

  test('G-18: liste önce önem sonra son görülme; varsayılan görünüm açık ve onaylanmış; G-14: alarm yalnız izinli alanları taşır', async () => {
    const c = await istek<unknown>('yonetici', 'GET', '/guvenlik-alarmlari?sayfaBoyu=200');
    assert.equal(c.durum, 200);
    const liste = alarmListeCevabi.parse(c.govde).satirlar;
    assert.ok(liste.length >= 3);
    assert.equal(liste.every((a) => a.durum !== 'kapandi'), true);
    const sira = { kritik: 0, yuksek: 1, orta: 2 };
    for (let i = 1; i < liste.length; i += 1) {
      const [a, b] = [liste[i - 1], liste[i]];
      if (!a || !b) continue;
      assert.ok(sira[a.onem] < sira[b.onem] || (sira[a.onem] === sira[b.onem] && Date.parse(a.sonGoruldu) >= Date.parse(b.sonGoruldu)), `${a.id} ${b.id}`);
    }
    const kapali = await istek<{ satirlar: Alarm[] }>('yonetici', 'GET', '/guvenlik-alarmlari?gorunum=kapandi');
    assert.ok(kapali.govde.satirlar.length >= 1);
    assert.equal(kapali.govde.satirlar.every((a) => a.durum === 'kapandi'), true);
    const ham = (c.govde as { satirlar: Record<string, unknown>[] }).satirlar[0] ?? {};
    assert.deepEqual(Object.keys(ham).sort(), [
      'durum', 'gozlenenSayi', 'id', 'ilkGoruldu', 'ip', 'kapandi', 'kapanisNotu', 'kapatanAdi', 'kisiAdi', 'kisiId', 'kullaniciAdi',
      'onaylandi', 'onaylayanAdi', 'onem', 'sinyal', 'sonGoruldu', 'surum', 'tekrarSayisi',
    ]);
    assert.equal((await istek('yonetici', 'GET', '/guvenlik-alarmlari?gorunum=yok')).durum, 400);
  });

  test('özet, girişler, koruma ve kurallar: sayılar veriden; okunamayan madde "bilinmiyor", sıfır uydurulmaz', async () => {
    const ozet = ozetCevabi.parse((await istek('yonetici', 'GET', '/guvenlik/ozet')).govde);
    assert.equal(Number.isInteger(ozet.kilitliHesap), true);
    assert.equal(ozet.saatlik.length, 24);
    assert.ok(ozet.acikAlarm.yuksek >= 1 && ozet.girisler.hatali >= HATALI_SERI.esik && ozet.acikOturum.oturum >= 1);
    assert.equal(ozet.taramaDurdu, false);
    assert.ok(ozet.sonTarama);
    assert.ok(ozet.sonAlarmlar.length >= 1 && ozet.sonAlarmlar.length <= 5);

    const girisler = await istek<{ satirlar: { kullaniciAdi: string; sonuc: string }[]; toplam: number }>('yonetici', 'GET', '/guvenlik/girisler?ara=g03-&sonuc=hatali');
    assert.equal(girisler.durum, 200);
    assert.deepEqual(girisler.govde.satirlar.map((g) => g.kullaniciAdi).sort(), ['g03-a', 'g03-b', 'g03-c']);
    assert.equal((await istek('yonetici', 'GET', '/guvenlik/girisler?sonuc=kilitli')).durum, 400);

    const koruma = korumaCevabi.parse((await istek('yonetici', 'GET', '/guvenlik/koruma')).govde);
    assert.equal(koruma.maddeler.find((m) => m.anahtar === 'tarama')?.durum, 'acik');
    assert.match(koruma.maddeler.find((m) => m.anahtar === 'hesap-kilidi')?.deger ?? '', /^\d+ etkin kilit$/);
    assert.equal(koruma.maddeler.find((m) => m.anahtar === 'hesap-kilidi')?.durum, 'acik');
    for (const anahtar of ['yedek', 'guncelleme-imzasi', 'https', 'sertifika', 'denetim']) {
      const m = koruma.maddeler.find((x) => x.anahtar === anahtar);
      assert.deepEqual([m?.durum, m?.deger], ['bilinmiyor', null], anahtar);
    }
    const kurallar = kurallarCevabi.parse((await istek('yonetici', 'GET', '/guvenlik/kurallar')).govde);
    assert.deepEqual(kurallar.kurallar.map((k) => [k.sinyal, k.onem]), [
      ['hatali-giris-serisi', 'orta'], ['yayilan-deneme', 'yuksek'], ['hedefli-hesap', 'yuksek'], ['cok-oturum', 'orta'], ['hesap-kilidi', 'orta'],
    ]);
    assert.deepEqual([kurallar.vpnAraliklari, kurallar.muafSinyaller], [[], []]);
    assert.equal(kurallar.saklamaGun, SAKLAMA_GUN);
  });

  test('zamanlanmış iş: tarama her dakika koşan iş olarak bulunur; tek turu durum satırını yazar', async () => {
    const tanim = (await modulIsleriniKesfet()).find((i) => i.ad === 'guvenlik-taramasi');
    assert.equal(tanim?.aralikMs, 60_000);
    if (!tanim) throw new Error('iş yok');
    await o().vt.sorgu("UPDATE guvenlik_tarama_durumu SET son_tarama = now() - interval '1 hour'");
    assert.equal(await isiBirKezCalistir(o().vt, tanim), 'tamam');
    const durum = await o().vt.tek<{ taze: boolean }>("SELECT son_tarama > now() - interval '1 minute' AS taze FROM guvenlik_tarama_durumu");
    assert.equal(durum?.taze, true);
  });

  test('oturumlar: yönetici açık oturumları kişi adıyla görür; başkasının oturumunu kapatır, kendininkini kapatamaz; müdür kapatamaz', async () => {
    await giris('mudur', 'mudur-ikinci');
    const liste = oturumlarCevabi.parse((await istek('yonetici', 'GET', '/guvenlik/oturumlar')).govde);
    const kendi = liste.oturumlar.find((x) => x.buOturum);
    assert.equal(kendi?.kisiAdi, 'Deneme Yönetici');
    const mudurunkiler = liste.oturumlar.filter((x) => x.kisiAdi === 'Deneme mudur');
    assert.ok(mudurunkiler.length >= 2);
    const hedef = mudurunkiler[0];
    if (!hedef || !kendi) throw new Error('oturum yok');
    assert.equal((await istek('mudur', 'POST', `/guvenlik/oturumlar/${hedef.id}/kapat`)).durum, 403);
    assert.equal((await istek('yonetici', 'POST', `/guvenlik/oturumlar/${kendi.id}/kapat`)).durum, 422);
    assert.equal((await istek('yonetici', 'POST', `/guvenlik/oturumlar/${hedef.id}/kapat`)).durum, 200);
    assert.equal((await istek('yonetici', 'POST', `/guvenlik/oturumlar/${hedef.id}/kapat`)).durum, 404);
    const sonra = oturumlarCevabi.parse((await istek('yonetici', 'GET', '/guvenlik/oturumlar')).govde);
    assert.equal(sonra.oturumlar.some((x) => x.id === hedef.id), false);
    assert.equal(sonra.oturumlar.some((x) => x.id === kendi.id), true);
  });

  test('oturumlar: girişteki adres ve tarayıcı oturumla saklanır ve listede görünür; tarayıcı 300 karakterde kesilir, yoksa boştur', async () => {
    await giris('mudur', 'mudur-tarayicili', 'Deneme/1.0 (Windows NT 10.0; Win64; x64) Chrome/130.0');
    await giris('mudur', 'mudur-uzun', `Deneme/2.0 ${'x'.repeat(400)}`);
    await giris('mudur', 'mudur-tarayicisiz', '');
    const liste = oturumlarCevabi.parse((await istek('yonetici', 'GET', '/guvenlik/oturumlar')).govde).oturumlar;
    const bul = (onek: string) => liste.find((x) => x.tarayici?.startsWith(onek));
    const tarayicili = bul('Deneme/1.0');
    assert.equal(tarayicili?.ip, '127.0.0.1');
    assert.equal(tarayicili?.tarayici, 'Deneme/1.0 (Windows NT 10.0; Win64; x64) Chrome/130.0');
    assert.equal(bul('Deneme/2.0')?.tarayici?.length, 300);
    const bos = await o().vt.sorgu<{ n: number }>("SELECT count(*)::int AS n FROM oturum WHERE tarayici IS NULL AND ip = '127.0.0.1'");
    assert.ok((bos[0]?.n ?? 0) >= 1);
  });

  test('hesap kilidi: her yeni kilit orta önemli alarm açar; kapanan alarm aynı kilitle yeniden açılmaz, yeni kilitle açılır; kilidi yalnız yönetici açar', async () => {
    const kilit = (ad: string, onceSn: number) => o().vt.tek<{ id: number }>(
      `INSERT INTO oturum_hesap_kilidi (kullanici_adi, kilitlendi, bitis)
       VALUES ($1, now() - make_interval(secs => $2), now() - make_interval(secs => $2) + interval '15 minutes') RETURNING id::int AS id`,
      [ad, onceSn],
    );
    const ilk = await kilit('kilit-ad', 120);
    await tara();
    const [alarm, ...fazla] = await alarmBul({ sinyal: 'hesap-kilidi', kullaniciAdi: 'kilit-ad' });
    assert.deepEqual([alarm?.onem, alarm?.durum, alarm?.gozlenenSayi, fazla.length], ['orta', 'acik', 1, 0]);
    await tara();
    assert.equal((await alarmBul({ sinyal: 'hesap-kilidi', kullaniciAdi: 'kilit-ad' })).length, 1);

    const liste = kilitListeCevabi.parse((await istek('yonetici', 'GET', '/guvenlik/kilitler')).govde);
    assert.deepEqual(liste.satirlar.filter((k) => k.kullaniciAdi === 'kilit-ad').map((k) => k.id), [ilk?.id]);
    assert.equal(ozetCevabi.parse((await istek('yonetici', 'GET', '/guvenlik/ozet')).govde).kilitliHesap >= 1, true);
    assert.equal((await istek('mudur', 'POST', `/guvenlik/kilitler/${String(ilk?.id)}/ac`)).durum, 403);
    assert.deepEqual(await istek('yonetici', 'POST', `/guvenlik/kilitler/${String(ilk?.id)}/ac`), { durum: 200, govde: { acilan: 1 } });
    assert.equal((await istek('yonetici', 'POST', `/guvenlik/kilitler/${String(ilk?.id)}/ac`)).durum, 404);
    const acan = await o().vt.tek<{ acan: number }>('SELECT acan_kisi_id AS acan FROM oturum_hesap_kilidi WHERE id = $1', [ilk?.id]);
    assert.equal(acan?.acan, yoneticiId);

    if (!alarm) throw new Error('alarm yok');
    assert.equal((await istek('yonetici', 'POST', `/guvenlik-alarmlari/${alarm.id}/kapat`, { surum: alarm.surum, not: 'Kişi doğruladı' })).durum, 200);
    await tara();
    assert.equal((await alarmBul({ sinyal: 'hesap-kilidi', kullaniciAdi: 'kilit-ad', durum: 'acik' })).length, 0);
    await kilit('kilit-ad', 5);
    await tara();
    assert.equal((await alarmBul({ sinyal: 'hesap-kilidi', kullaniciAdi: 'kilit-ad', durum: 'acik' })).length, 1);
  });

  test('VPN aralığı: doluyken aralıktaki cihaz G-03 ve G-20 alarmı açmaz, dışındaki açar; G-02 sürer; hatalı aralık 400; kurallar muafiyeti gösterir', async () => {
    const yaz = (deger: string) => istek('yonetici', 'POST', '/ayarlar/guvenlik.vpn-adres-araligi/degistir', { deger });
    const kotu = await yaz('10.30.1.0/16');
    assert.equal(kotu.durum, 400, JSON.stringify(kotu.govde));
    assert.equal((await yaz('10.30.0.0/16, fd00:30::/32')).durum, 200);
    try {
      for (const ad of ['vpn-a', 'vpn-b', 'vpn-c']) await deneme(ad, '10.30.0.5', 1);
      for (const ad of ['dis-a', 'dis-b', 'dis-c']) await deneme(ad, '10.40.0.5', 1);
      for (const ip of ['10.30.1.1', '10.30.1.2', 'fd00:30::3']) await deneme('vpn-hedef', ip, 1);
      await deneme('vpn-seri', '10.30.2.2', HATALI_SERI.esik);
      await tara();
      assert.equal((await alarmBul({ sinyal: 'yayilan-deneme', ip: '10.30.0.5' })).length, 0);
      assert.equal((await alarmBul({ sinyal: 'yayilan-deneme', ip: '10.40.0.5' })).length, 1);
      assert.equal((await alarmBul({ sinyal: 'hedefli-hesap', kullaniciAdi: 'vpn-hedef' })).length, 0);
      assert.equal((await alarmBul({ sinyal: 'hatali-giris-serisi', kullaniciAdi: 'vpn-seri' })).length, 1);
      const kurallar = kurallarCevabi.parse((await istek('yonetici', 'GET', '/guvenlik/kurallar')).govde);
      assert.deepEqual([kurallar.vpnAraliklari, kurallar.muafSinyaller], [['10.30.0.0/16', 'fd00:30::/32'], ['yayilan-deneme', 'hedefli-hesap']]);
    } finally {
      assert.equal((await yaz('')).durum, 200);
    }
    await tara();
    assert.equal((await alarmBul({ sinyal: 'yayilan-deneme', ip: '10.30.0.5' })).length, 1);
  });
});
