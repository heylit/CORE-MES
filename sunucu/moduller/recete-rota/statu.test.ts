import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { DURUM_ANAHTARI, receteRotaStatuleri } from './disari.ts';
import { adimCiktisiBul, statuleriTuret } from './kurallar.ts';
import { adimCiktisi, adimStatusu } from './servis.ts';

const PAROLA = 'dogru-parola-1';

const adim = (id: string, seq: number, ek: Record<string, unknown> = {}) => ({ id, seq, opId: 'op1', outItem: '', outStatus: '', ...ek });
const belge = (tur: string, adimlar: unknown[]) => ({
  items: [{ id: 'm1', code: 'ORN-1', type: tur }],
  opdefs: [{ id: 'op1', name: 'Kesim' }, { id: 'op2', name: 'Kaynak' }],
  routes: { m1: { steps: adimlar } },
});

describe('statü türetme kuralı', () => {
  test('adım çıktısı (kart #1289): ara adımın çıkan kalemi; son adımda, bilinmeyen ya da statü açmayan türde kalemde null', () => {
    const b = (outItem: string, tur = 'yari') => ({
      items: [{ id: '7', code: 'ORN-7', type: 'mamul' }, { id: '8', code: 'ORN-8', type: tur }],
      routes: { 7: { steps: [adim('7-o20', 20, { opNo: 20, outItem }), adim('7-o10', 10, { opNo: 10 }), adim('7-o30', 30, { opNo: 30, outItem: '8' })] } },
    });
    assert.equal(adimCiktisiBul(b('8'), 7, 20), 8);
    assert.equal(adimCiktisiBul(b(''), 7, 20), null, 'çıkan kalem yok');
    assert.equal(adimCiktisiBul(b('9'), 7, 20), null, 'belgede olmayan kalem');
    assert.equal(adimCiktisiBul(b('8', 'sarf'), 7, 20), null, 'statü açmayan tür');
    assert.equal(adimCiktisiBul(b('8'), 7, 30), null, 'son adımın çıktısı ürünün kendisidir');
    assert.equal(adimCiktisiBul(b('8'), 7, 40), null, 'rotada olmayan adım');
    assert.equal(adimCiktisiBul(null, 7, 20), null, 'bozuk belge');
  });

  test('HM, YM ve MM rotasının ara adımı statü açar; ad operasyon adıdır, son adım açmaz', () => {
    for (const [prototip, tur] of [['ham', 'HM'], ['yari', 'YM'], ['mamul', 'MM']] as const) {
      const s = statuleriTuret(belge(prototip, [adim('a1', 1), adim('a2', 2, { opId: 'op2' }), adim('a3', 3)]));
      assert.deepEqual(s.map((x) => [x.malzemeNo, x.ad, x.kaynakAdim, x.tur]), [['ORN-1', 'OP 1 Kesim', 'a1', tur], ['ORN-1', 'OP 2 Kaynak', 'a2', tur]]);
    }
  });

  test('diğer türlerde, gerçek karta ya da tanımlı statüye bağlı adımda statü açılmaz', () => {
    for (const tur of ['sarf', 'demirbas', 'hizmet', 'bilinmeyen']) {
      assert.deepEqual(statuleriTuret(belge(tur, [adim('a1', 1), adim('a2', 2)])), []);
    }
    assert.deepEqual(statuleriTuret(belge('yari', [adim('a1', 1, { outItem: 'm2' }), adim('a2', 2, { outStatus: 'KKB' }), adim('a3', 3)])), []);
  });

  test('tek adımlı rota, bozuk belge ve tanımsız operasyon: son adım açmaz, bozuk parça atlanır, ad OP sırasına döner', () => {
    assert.deepEqual(statuleriTuret(belge('ham', [adim('a1', 1)])), []);
    assert.deepEqual(statuleriTuret(null), []);
    assert.deepEqual(statuleriTuret({ items: 'x', routes: [] }), []);
    const s = statuleriTuret(belge('ham', [adim('a1', 4, { opId: 'yok' }), adim('a2', 5)]));
    assert.deepEqual(s.map((x) => x.ad), ['OP 4']);
  });

  test('aynı operasyon iki adımda geçse de adlar sırayla ayırt edilir; adımlar sırasız gelse de son adım seq en büyüğüdür', () => {
    const s = statuleriTuret(belge('yari', [adim('a3', 3), adim('a1', 1), adim('a2', 2)]));
    assert.deepEqual(s.map((x) => [x.kaynakAdim, x.ad]), [['a1', 'OP 1 Kesim'], ['a2', 'OP 2 Kesim']]);
  });

  test('bağlı adımın statü adı OP numarasıdır: adım taşınsa da ad ve kaynak adım değişmez (kullanıcı kararı 14.10.2026)', () => {
    const b = (sira: [number, number]) => belge('yari', [adim('7-o20', sira[0], { opNo: 20 }), adim('7-o10', sira[1], { opNo: 10 }), adim('7-o30', 30, { opNo: 30 })]);
    const once = statuleriTuret(b([20, 10])).map((x) => [x.kaynakAdim, x.ad]);
    assert.deepEqual(once, [['7-o10', 'OP 10 Kesim'], ['7-o20', 'OP 20 Kesim']]);
    assert.deepEqual(statuleriTuret(b([10, 20])).map((x) => [x.kaynakAdim, x.ad]).sort(), once);
  });

  test('aynı adım kimliği belgede iki kez geçse tek statü üretir; renk onaltılık biçimdedir', () => {
    const b = belge('yari', [adim('a1', 1), adim('a1', 2), adim('a3', 3)]);
    const s = statuleriTuret(b);
    assert.equal(s.length, 1);
    assert.match(s[0]?.renk ?? '', /^#[0-9A-Fa-f]{6}$/);
  });

  test('statü adımın taşıdığı malzemenindir: HM girerse HM, YM girerse YM; karta dönüşen adımdan sonra o kart (kullanıcı kararı 14.10.2026)', () => {
    const b = {
      items: [{ id: 'h1', code: 'HM-1', type: 'ham' }, { id: 'y1', code: 'YM-1', type: 'yari' }, { id: 'm1', code: 'MM-1', type: 'mamul' }],
      opdefs: [{ id: 'op1', name: 'Kesim' }, { id: 'op2', name: 'Torna' }],
      routes: {
        m1: { steps: [
          adim('m1-o10', 10, { opNo: 10, ins: [{ itemId: 'h1', qty: 1 }] }),
          adim('m1-o20', 20, { opNo: 20, opId: 'op2' }),
          adim('m1-o30', 30, { opNo: 30, outItem: 'y1' }),
          adim('m1-o40', 40, { opNo: 40 }),
          adim('m1-o50', 50, { opNo: 50 }),
        ] },
        y1: { steps: [adim('y1-o10', 10, { opNo: 10, ins: [{ itemId: 'y1x', qty: 1 }] }), adim('y1-o20', 20, { opNo: 20 })] },
      },
    };
    assert.deepEqual(statuleriTuret(b).map((x) => [x.kaynakAdim, x.malzemeNo, x.tur, x.ad]), [
      // bilinmeyen girdi statü açmaz; rota sahibi taşınır
      ['y1-o10', 'YM-1', 'YM', 'OP 10 Kesim'],
      ['m1-o10', 'HM-1', 'HM', 'OP 10 Kesim'],
      ['m1-o20', 'HM-1', 'HM', 'OP 20 Torna'],
      ['m1-o40', 'YM-1', 'YM', 'OP 40 Kesim'],
    ]);
  });

  test('bağımsız adım kendi ilk girdisini taşır; ardından gelen bağımlı adım zincirin bağımsız olmayan ilk adımını izler', () => {
    const b = {
      items: [{ id: 'h1', code: 'HM-1', type: 'ham' }, { id: 'h2', code: 'HM-2', type: 'ham' }, { id: 'm1', code: 'MM-1', type: 'mamul' }],
      opdefs: [{ id: 'op1', name: 'Kesim' }],
      routes: { m1: { steps: [
        adim('a1', 1, { ins: [{ itemId: 'h1', qty: 1 }] }),
        adim('a2', 2, { dep: 'bagimsiz', ins: [{ itemId: 'h2', qty: 1 }] }),
        adim('a3', 3),
        adim('a4', 4),
      ] } },
    };
    assert.deepEqual(statuleriTuret(b).map((x) => [x.kaynakAdim, x.malzemeNo]), [['a1', 'HM-1'], ['a2', 'HM-2'], ['a3', 'HM-1']]);
  });
});

describe('recete_rota_statu göçü ve akışı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yazar = '';
  let okur = '';
  let yetkisiz = '';
  let surum: number | null = null;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    return girisCerezi(kullaniciAdi);
  }

  const kaydet = async (deger: unknown) => {
    const c = await app.inject({
      method: 'POST', url: '/api/recete-rota/kayitlar/yaz', headers: { cookie: yazar },
      payload: { anahtar: DURUM_ANAHTARI, bicim: 'json', deger, beklenenSurum: surum },
    });
    assert.equal(c.statusCode, 200, c.body);
    surum = (c.json() as { kayit: { surum: number } }).kayit.surum;
  };
  const sayim = async (): Promise<number> => (await vt().sorgu('SELECT 1 FROM recete_rota_statu')).length;

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_statu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yazar = await islemliKisi('yazar', ['recete-rota.yaz']);
    okur = await islemliKisi('okur', ['recete-rota.oku']);
    yetkisiz = await islemliKisi('yetkisiz', ['sayfa.ayarlar']);
  });

  after(async () => { await ortam?.kaldir(); });

  test('göç: geçerli satır kabul edilir; boş ad, kötü renk, bilinmeyen tür ve yinelenen kaynak adım reddedilir', async () => {
    await vt().sorgu(`INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('X-1', 'Kesim', 'g1', '#112233', 'HM')`);
    const ihlal = (sql: string, kisit: string) => assert.rejects(vt().sorgu(sql), (h: { constraint?: string }) => h.constraint === kisit);
    const ekle = (ad: string, adimNo: string, renk: string, tur: string, malzemeNo = 'X-1') =>
      `INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('${malzemeNo}', '${ad}', '${adimNo}', '${renk}', '${tur}')`;
    await ihlal(ekle(' ', 'g2', '#112233', 'HM'), 'recete_rota_statu_ad_dolu');
    await ihlal(ekle('Kesim', 'g2', '#112233', 'HM', ' '), 'recete_rota_statu_malzeme_no_dolu');
    await ihlal(ekle('Kesim', ' ', '#112233', 'HM'), 'recete_rota_statu_kaynak_dolu');
    await ihlal(ekle('Kesim', 'g3', 'kirmizi', 'HM'), 'recete_rota_statu_renk_bicimi');
    await ihlal(ekle('Kesim', 'g4', '#112233', 'SARF'), 'recete_rota_statu_tur');
    await ihlal(ekle('Kesim', 'g1', '#112233', 'YM'), 'recete_rota_statu_adim_revizyon_tekil');
    await vt().sorgu(`DELETE FROM recete_rota_statu`);
  });

  test('statülü adım kaydedilince HM, YM, MM için statü açılır; yeniden kayıt çift açmaz, adı tazeler', async () => {
    const ilk = {
      items: [{ id: 'h', code: 'ORN-H', type: 'ham' }, { id: 'y', code: 'ORN-Y', type: 'yari' }, { id: 'm', code: 'ORN-M', type: 'mamul' }, { id: 's', code: 'ORN-S', type: 'sarf' }],
      opdefs: [{ id: 'op1', name: 'Kesim' }],
      routes: Object.fromEntries(['h', 'y', 'm', 's'].map((k) => [k, { steps: [adim(`${k}1`, 1), adim(`${k}2`, 2)] }])),
    };
    await kaydet(ilk);
    const bir = await vt().sorgu<{ malzeme_no: string; ad: string; tur: string }>('SELECT malzeme_no, ad, tur FROM recete_rota_statu ORDER BY malzeme_no');
    assert.deepEqual(bir, [
      { malzeme_no: 'ORN-H', ad: 'OP 1 Kesim', tur: 'HM' }, { malzeme_no: 'ORN-M', ad: 'OP 1 Kesim', tur: 'MM' }, { malzeme_no: 'ORN-Y', ad: 'OP 1 Kesim', tur: 'YM' },
    ]);
    await kaydet({ ...ilk, opdefs: [{ id: 'op1', name: 'Torna' }] });
    const iki = await vt().sorgu<{ ad: string }>('SELECT ad FROM recete_rota_statu');
    assert.equal(iki.length, 3);
    assert.deepEqual([...new Set(iki.map((x) => x.ad))], ['OP 1 Torna']);
    assert.equal(await sayim(), 3);
    const liste = await receteRotaStatuleri(vt());
    assert.equal(liste.length, 3);
    assert.ok(liste.every((x) => x.urunKodu === null), 'eski biçimli adım kimliğinde mamül kodu yok');
  });

  test('renk yalnız ilk açılışta yazılır: sonraki kayıtta adım sırası değişse de renk değişmez', async () => {
    await vt().sorgu(`UPDATE recete_rota_statu SET renk = '#010203' WHERE malzeme_no = 'ORN-H'`);
    await kaydet({
      items: [{ id: 'h', code: 'ORN-H', type: 'ham' }],
      opdefs: [{ id: 'op1', name: 'Torna' }],
      routes: { h: { steps: [adim('h0', 1), adim('h1', 2), adim('h2', 3)] } },
    });
    const h1 = await vt().tek<{ renk: string }>(`SELECT renk FROM recete_rota_statu WHERE kaynak_adim = 'h1'`);
    assert.equal(h1?.renk, '#010203');
    const yeni = await vt().tek<{ renk: string }>(`SELECT renk FROM recete_rota_statu WHERE kaynak_adim = 'h0'`);
    assert.match(yeni?.renk ?? '', /^#[0-9A-Fa-f]{6}$/);
  });

  test('başka anahtara ve metin biçimine yazma statü açmaz', async () => {
    const once = await sayim();
    const c = await app.inject({
      method: 'POST', url: '/api/recete-rota/kayitlar/yaz', headers: { cookie: yazar },
      payload: { anahtar: 'recete-rota-motoru-v1:studio', bicim: 'json', deger: belge('ham', [adim('z1', 1), adim('z2', 2)]), beklenenSurum: null },
    });
    assert.equal(c.statusCode, 200, c.body);
    assert.equal(await sayim(), once);
    const metin = await app.inject({
      method: 'POST', url: '/api/recete-rota/kayitlar/yaz', headers: { cookie: yazar },
      payload: { anahtar: DURUM_ANAHTARI, bicim: 'metin', deger: JSON.stringify(belge('ham', [adim('t1', 1), adim('t2', 2)])), beklenenSurum: surum },
    });
    assert.equal(metin.statusCode, 200, metin.body);
    surum = (metin.json() as { kayit: { surum: number } }).kayit.surum;
    assert.equal(await sayim(), once);
    assert.equal((await vt().sorgu(`SELECT 1 FROM recete_rota_statu WHERE kaynak_adim = 't1'`)).length, 0);
  });

  test('statü eşitlemesi düşerse kayıt da geri alınır', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    const once = await sayim();
    const kayitOnce = await vt().tek<{ surum: string }>('SELECT surum FROM recete_rota_kayit WHERE anahtar = $1', [DURUM_ANAHTARI]);
    await ortam.sahip.sorgu(`CREATE FUNCTION recete_rota_statu_deneme_hatasi() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'deneme'; END $$`);
    await ortam.sahip.sorgu('CREATE TRIGGER recete_rota_statu_deneme BEFORE INSERT ON recete_rota_statu FOR EACH ROW EXECUTE FUNCTION recete_rota_statu_deneme_hatasi()');
    try {
      const c = await app.inject({
        method: 'POST', url: '/api/recete-rota/kayitlar/yaz', headers: { cookie: yazar },
        payload: { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: belge('yari', [adim('r1', 1), adim('r2', 2)]), beklenenSurum: surum },
      });
      assert.equal(c.statusCode, 500);
    } finally {
      await ortam.sahip.sorgu('DROP TRIGGER recete_rota_statu_deneme ON recete_rota_statu');
      await ortam.sahip.sorgu('DROP FUNCTION recete_rota_statu_deneme_hatasi()');
    }
    assert.equal(await sayim(), once);
    const kayitSonra = await vt().tek<{ surum: string }>('SELECT surum FROM recete_rota_kayit WHERE anahtar = $1', [DURUM_ANAHTARI]);
    assert.equal(kayitSonra?.surum, kayitOnce?.surum);
  });

  test('GET /recete-rota/statuler: okuma yetkisi 200 ve satırlar; yetkisiz 403', async () => {
    const tamam = await app.inject({ method: 'GET', url: '/api/recete-rota/statuler', headers: { cookie: okur } });
    assert.equal(tamam.statusCode, 200, tamam.body);
    const govde = tamam.json() as { statuler: Array<{ malzemeNo: string; tur: string; zaman: string }> };
    assert.equal(govde.statuler.length, 4);
    assert.deepEqual(govde.statuler.map((x) => x.tur).sort(), ['HM', 'HM', 'MM', 'YM']);
    assert.equal(Number.isNaN(Date.parse(govde.statuler[0]?.zaman ?? '')), false);
    const red = await app.inject({ method: 'GET', url: '/api/recete-rota/statuler', headers: { cookie: yetkisiz } });
    assert.equal(red.statusCode, 403);
  });

  test('iki ürünün OP 10\'u ayrı statüdür; eski kimlikli satır aynı malzemenin yeni kimliğine taşınır, kimliği korunur', async () => {
    await vt().sorgu(`INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('ORN-B', 'OP 10 Kesim', 'o10', '#112233', 'YM')`);
    const eski = await vt().tek<{ id: number }>(`SELECT id FROM recete_rota_statu WHERE kaynak_adim = 'o10'`);
    const rota = (k: string) => ({ steps: [adim(`${k}-o10`, 10, { opNo: 10 }), adim(`${k}-o20`, 20, { opNo: 20 })] });
    await kaydet({
      items: [{ id: '5', code: 'ORN-A', type: 'mamul' }, { id: '6', code: 'ORN-B', type: 'yari' }],
      opdefs: [{ id: 'op1', name: 'Kesim' }],
      routes: { '5': rota('5'), '6': rota('6') },
    });
    const satirlar = await vt().sorgu<{ id: number; malzeme_no: string; kaynak_adim: string }>(
      `SELECT id, malzeme_no, kaynak_adim FROM recete_rota_statu WHERE malzeme_no IN ('ORN-A', 'ORN-B') ORDER BY malzeme_no`,
    );
    assert.deepEqual(satirlar.map((x) => [x.malzeme_no, x.kaynak_adim]), [['ORN-A', '5-o10'], ['ORN-B', '6-o10']]);
    assert.equal(satirlar.find((x) => x.malzeme_no === 'ORN-B')?.id, eski?.id, 'stokun bağlı olduğu satır yerinde kalır');
  });
  test('adım statüsü çözücüsü (kart #1289): ara adımın statü kimliği döner; son adım, karta bağlı adım ve rotada olmayan adım null', async () => {
    // Çıktı kartı taşıma tablosundan okunur (yabancı anahtar): kartlar katalogda olmalıdır.
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('CZC-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = async (sira: number, tur: string) => String((await vt().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'CZC-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`czc-${String(sira)}`, tur, sira, JSON.stringify({ id: `czc-${String(sira)}`, com: { ad: 'Çözücü deneme' } }), yoneticiId]))!.no);
    const m = await kart(1, 'mamul');
    const y = await kart(2, 'yarimamul');
    await kaydet({
      items: [{ id: m, code: 'ORN-C', type: 'mamul' }, { id: y, code: 'ORN-D', type: 'yari' }],
      opdefs: [{ id: 'op1', name: 'Kesim' }],
      routes: { [m]: { steps: [adim(`${m}-o10`, 10, { opNo: 10 }), adim(`${m}-o20`, 20, { opNo: 20, outItem: y }), adim(`${m}-o30`, 30, { opNo: 30 })] } },
    });
    const satir = await vt().tek<{ id: number }>('SELECT id FROM recete_rota_statu WHERE kaynak_adim = $1', [`${m}-o10`]);
    assert.ok(satir);
    assert.equal(await adimStatusu(vt(), { malzemeNo: Number(m), opNo: 10 }), satir.id);
    assert.equal(await adimStatusu(vt(), { malzemeNo: Number(m), opNo: 20 }), null);
    assert.equal(await adimStatusu(vt(), { malzemeNo: Number(m), opNo: 30 }), null);
    assert.equal(await adimStatusu(vt(), { malzemeNo: Number(m), opNo: 40 }), null);
    const ciktilar: (number | null)[] = [];
    for (const opNo of [10, 20, 30]) ciktilar.push(await adimCiktisi(vt(), { malzemeNo: Number(m), opNo }));
    assert.deepEqual(ciktilar, [null, Number(y), null], 'çıktı: OP 20 ara YM');
    // adım rotadan kalkınca eski statü satırı durur ama çözücü onu vermez
    await kaydet({
      items: [{ id: m, code: 'ORN-C', type: 'mamul' }],
      opdefs: [{ id: 'op1', name: 'Kesim' }],
      routes: { [m]: { steps: [adim(`${m}-o30`, 30, { opNo: 30 })] } },
    });
    assert.equal(await adimStatusu(vt(), { malzemeNo: Number(m), opNo: 10 }), null);
  });

  test('statü rota revizyonunundur: emir kendi revizyonunun adımında ve statüsünde sayılır (yeni revizyonda kalkmış adım dahil), etikette harfiyle; emirsiz yürürlükteki', async () => {
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('RVS-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = (await vt().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('rvs-1', 'mamul', 'RVS-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'rvs-1', com: { ad: 'Revizyon deneme' } }), yoneticiId]))!.no;
    const tip = (await vt().tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('RVS', 'Torna', 'TAL') RETURNING id"))!.id;
    const revizyon = async (harf: string, durum: 'onayli' | 'yururlukte', oplar: number[]) => {
      const id = (await vt().tek<{ id: number }>("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', $2, $3) RETURNING id", [kart, harf, yoneticiId]))!.id;
      for (const [i, op] of oplar.entries()) {
        await vt().sorgu('INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [kart, op, id]);
        await vt().sorgu('INSERT INTO rota_adimi (revizyon_id, malzeme_id, op_no, sira, operasyon_tipi_id, ad) VALUES ($1, $2, $3, $4, $5, $6)', [id, kart, op, i + 1, tip, `Adım ${String(op)}`]);
      }
      await vt().sorgu("UPDATE rota_revizyonu SET durum = 'onay_bekliyor', gonderen_kisi_id = $2, gonderme = now() WHERE id = $1", [id, yoneticiId]);
      await vt().sorgu("UPDATE rota_revizyonu SET durum = 'onayli', onaylayan_kisi_id = $2, onaylama = now(), dort_gozsuz_onay = true WHERE id = $1", [id, yoneticiId]);
      if (durum === 'yururlukte') await vt().sorgu("UPDATE rota_revizyonu SET durum = 'yururlukte', yururluge_alan_kisi_id = $2, yururluge_alma = now() WHERE id = $1", [id, yoneticiId]);
      return id;
    };
    const a = await revizyon('A', 'onayli', [10, 20, 30]);
    const b = await revizyon('B', 'yururlukte', [10, 30]);
    const emir = async (rev: number | null) => (await vt().tek<{ id: number }>(
      "INSERT INTO uretim_emri (emir_no, parca_no, parca_ad, adet, acan_id, malzeme_no, kaynak_rota_revizyonu_id) VALUES ($1, 'P', 'Parca', 1, $2, $3, $4) RETURNING id",
      [`RVS-${String(rev)}`, yoneticiId, kart, rev]))!.id;
    const k = String(kart);
    await kaydet({ items: [{ id: k, code: 'ORN-R', type: 'mamul' }], opdefs: [{ id: 'op1', name: 'Torna' }], routes: {} });
    const yururlukte = await adimStatusu(vt(), { malzemeNo: kart, opNo: 10 });
    assert.ok(yururlukte, 'emirsiz: yürürlükteki revizyon B');
    assert.equal(await adimStatusu(vt(), { malzemeNo: kart, opNo: 10, uretimEmriId: await emir(null) }), yururlukte, 'rotasız emir yürürlükteki statüyü kullanır');
    assert.equal(await adimStatusu(vt(), { malzemeNo: kart, opNo: 20 }), null, 'OP 20 yürürlükteki rotada yok');
    const eskiEmir = await emir(a);
    const eski10 = await adimStatusu(vt(), { malzemeNo: kart, opNo: 10, uretimEmriId: eskiEmir });
    const eski20 = await adimStatusu(vt(), { malzemeNo: kart, opNo: 20, uretimEmriId: eskiEmir });
    assert.ok(eski10 !== null && eski10 !== yururlukte, 'revizyon A kendi statüsünü açar');
    assert.ok(eski20 !== null, 'eski revizyonun emri yeni revizyonda kalkmış adımda da statü alır');
    const satirlar = new Map((await receteRotaStatuleri(vt())).map((x) => [x.id, x]));
    assert.deepEqual([satirlar.get(yururlukte)?.revizyon, satirlar.get(eski10!)?.revizyon, satirlar.get(eski20!)?.revizyon], ['B', 'A', 'A']);
    assert.equal(await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM recete_rota_statu WHERE rota_revizyonu_id = $1', [b]).then((x) => x?.n), 1, 'B\'de yalnız OP 10 ara adımdır');
  });
  test('çıktı statüyle aynı revizyondandır (kart #1214): emir kendi revizyonunun çıkan kalemini alır (yeni revizyonda kalkmış adım dahil); emirsiz, rotasız ya da bilinmeyen emir yürürlükteki', async () => {
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('RVC-', 0) ON CONFLICT (onek) DO NOTHING");
    const kartAc = async (sira: number, tur: string) => (await vt().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'RVC-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`rvc-${String(sira)}`, tur, sira, JSON.stringify({ id: `rvc-${String(sira)}`, com: { ad: 'Çıktı revizyon deneme' } }), yoneticiId]))!.no;
    const kart = await kartAc(1, 'mamul');
    const ym1 = await kartAc(2, 'yarimamul');
    const ym2 = await kartAc(3, 'yarimamul');
    const tip = (await vt().tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('RVC', 'Freze', 'TAL') RETURNING id"))!.id;
    const revizyon = async (harf: string, durum: 'onayli' | 'yururlukte', oplar: number[]) => {
      const id = (await vt().tek<{ id: number }>("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', $2, $3) RETURNING id", [kart, harf, yoneticiId]))!.id;
      for (const [i, op] of oplar.entries()) {
        await vt().sorgu('INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [kart, op, id]);
        await vt().sorgu('INSERT INTO rota_adimi (revizyon_id, malzeme_id, op_no, sira, operasyon_tipi_id, ad) VALUES ($1, $2, $3, $4, $5, $6)', [id, kart, op, i + 1, tip, `Adım ${String(op)}`]);
      }
      await vt().sorgu("UPDATE rota_revizyonu SET durum = 'onay_bekliyor', gonderen_kisi_id = $2, gonderme = now() WHERE id = $1", [id, yoneticiId]);
      await vt().sorgu("UPDATE rota_revizyonu SET durum = 'onayli', onaylayan_kisi_id = $2, onaylama = now(), dort_gozsuz_onay = true WHERE id = $1", [id, yoneticiId]);
      if (durum === 'yururlukte') await vt().sorgu("UPDATE rota_revizyonu SET durum = 'yururlukte', yururluge_alan_kisi_id = $2, yururluge_alma = now() WHERE id = $1", [id, yoneticiId]);
      return id;
    };
    const a = await revizyon('A', 'onayli', [10, 20, 30]);
    const b = await revizyon('B', 'yururlukte', [10, 30]);
    const emir = async (rev: number | null) => (await vt().tek<{ id: number }>(
      "INSERT INTO uretim_emri (emir_no, parca_no, parca_ad, adet, acan_id, malzeme_no, kaynak_rota_revizyonu_id) VALUES ($1, 'P', 'Parca', 1, $2, $3, $4) RETURNING id",
      [`RVC-${String(rev)}`, yoneticiId, kart, rev]))!.id;
    const k = String(kart);
    await kaydet({
      items: [{ id: k, code: 'ORN-RC', type: 'mamul' }, { id: String(ym1), code: 'ORN-Y1', type: 'yari' }, { id: String(ym2), code: 'ORN-Y2', type: 'yari' }],
      opdefs: [{ id: 'op1', name: 'Freze' }],
      routes: {},
      routeRevs: [
        { id: String(a), itemId: k, status: 'onayli', data: { steps: [{ id: `${k}-o10`, opNo: 10, outItem: String(ym1) }, { id: `${k}-o20`, opNo: 20, outItem: String(ym2) }] } },
        { id: String(b), itemId: k, status: 'yururlukte', data: { steps: [{ id: `${k}-o10`, opNo: 10, outItem: String(ym2) }] } },
      ],
    });
    const cikti = (opNo: number, uretimEmriId?: number | null) => adimCiktisi(vt(), { malzemeNo: kart, opNo, uretimEmriId });
    assert.deepEqual([await cikti(10), await cikti(20)], [ym2, null], 'emirsiz: yürürlükteki B; OP 20 B\'de yok');
    const eskiEmir = await emir(a);
    assert.deepEqual([await cikti(10, eskiEmir), await cikti(20, eskiEmir)], [ym1, ym2], 'A ile açılmış emir A\'nın bağını okur');
    assert.equal(await cikti(10, await emir(b)), ym2, 'B ile açılmış emir');
    assert.equal(await cikti(10, await emir(null)), ym2, 'rotasız emir yürürlükteki');
    assert.equal(await cikti(10, null), ym2, 'boş emir kimliği emirsiz gibi');
    assert.equal(await cikti(10, 2_000_000_000), ym2, 'bilinmeyen emir yürürlükteki');
    assert.equal(await adimStatusu(vt(), { malzemeNo: kart, opNo: 20, uretimEmriId: eskiEmir }), null, 'A\'da OP 20 karta bağlı: statü açmaz, çıktıyla tutarlı');
  });
});
