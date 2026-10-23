import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { malzemeAyrintiCevabi, malzemelerCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { MalzemeAyrintiCevabi, MalzemelerCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// K-X8 (Soru 256 a): statü Reçete ve Rota'nın rota tanımından gelir; Stok Merkezi statülü süzgeçle, statü adıyla ve ayrıntıda
// tanımlı ama stoğu olmayan statüyle onu gösterir. "Statüde" yalnız statü kimliği dolu bakiyedir.
const PAROLA = 'dogru-parola-1';

describe('stok statü görünürlüğü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const depo = async <T>(yol: string): Promise<{ durum: number; govde: T }> => {
    const c = await app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });
    return { durum: c.statusCode, govde: c.json() as T };
  };
  let sira = 0;
  async function kart(tur: 'hammadde' | 'yarimamul' | 'mamul'): Promise<{ no: number; kod: string }> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['STS-DNM-']);
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'STS-DNM-', $3, 'aktif', $4, (SELECT min(id) FROM kisi), (SELECT min(id) FROM kisi)) RETURNING no`,
      [`sts-dnm-${sira}`, tur, sira, JSON.stringify({ id: `sts-dnm-${sira}`, com: { ad: `Deneme ${tur} ${sira}` } })],
    );
    const ayrinti = await depo<MalzemeAyrintiCevabi>(`/stok/malzemeler/${r!.no}`);
    return { no: r!.no, kod: ayrinti.govde.satir.stokKodu! };
  }
  const statu = async (malzemeNo: string, ad: string, kaynakAdim: string): Promise<number> =>
    (await o().sahip.tek<{ id: number }>("INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ($1, $2, $3, '#336699', 'YM') RETURNING id",
      [malzemeNo, ad, kaynakAdim]))!.id;
  async function bakiye(malzemeId: number, miktar: string, d: { statuId?: number; kalite?: string } = {}): Promise<void> {
    const konum = (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
    await o().sahip.sorgu('INSERT INTO stok_bakiye (malzeme_id, konum_id, statu_id, kalite_durumu, miktar, ilk_giris) VALUES ($1, $2, $3, $4, $5, now())',
      [malzemeId, konum, d.statuId ?? null, d.kalite ?? 'serbest', miktar]);
  }
  const liste = async (sorgu: string) => {
    const c = await depo<MalzemelerCevabi>(`/stok/malzemeler?${sorgu}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return malzemelerCevabi.parse(c.govde).satirlar;
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_statu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const rol = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'depo'");
    const yon = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'stok.giris') ON CONFLICT DO NOTHING", [rol!.id]);
    await ortam.vt.tx(async (db) => {
      const d = await yoneticiOlustur(db, { ad: 'Deneme depo', kullaniciAdi: 'depo', parola: PAROLA });
      await rolAta(db, yonetici, d, rol!.id);
      await rolAl(db, yonetici, d, yon!.id);
    });
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'depo', parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await ortam?.kaldir(); });

  test('statüde yalnız statülü bakiyedir: karantinadaki statüsüz miktar statüde sayılmaz', async () => {
    const k = await kart('yarimamul');
    const s = await statu(k.kod, 'OP 10 Kaba torna', `${k.no}-o10`);
    await bakiye(k.no, '5');
    await bakiye(k.no, '2', { kalite: 'karar_bekliyor' });
    await bakiye(k.no, '3', { statuId: s });
    const satir = (await liste(`metin=${k.kod}`)).find((x) => x.malzemeId === k.no)!;
    assert.deepEqual({ toplam: satir.toplam, serbest: satir.serbest, statude: satir.statude }, { toplam: '10', serbest: '5', statude: '3' });
    const yalniz = await kart('yarimamul');
    await bakiye(yalniz.no, '4', { kalite: 'red' });
    const r = (await liste(`metin=${yalniz.kod}`)).find((x) => x.malzemeId === yalniz.no)!;
    assert.equal(r.statude, '0', 'red bakiye statü değildir');
  });

  test('statülü süzgeç: statülü bakiyesi olan ve tanımlı statüsü olup stoğu olmayan kart gelir; statüsüz kart gelmez', async () => {
    const stoklu = await kart('yarimamul');
    const s = await statu(stoklu.kod, 'OP 20 Freze', `${stoklu.no}-o20`);
    await bakiye(stoklu.no, '1', { statuId: s });
    const stoksuz = await kart('yarimamul');
    await statu(stoksuz.kod, 'OP 30 Taşlama', `${stoksuz.no}-o30`);
    const duz = await kart('hammadde');
    await bakiye(duz.no, '8');
    const idler = (await liste('durum=statulu&sayfaBoyu=200')).map((x) => x.malzemeId);
    assert.ok(idler.includes(stoklu.no));
    assert.ok(idler.includes(stoksuz.no), 'tanımlı, stoğu olmayan statünün kartı');
    assert.ok(!idler.includes(duz.no));
    assert.ok(!(await liste('sayfaBoyu=200')).some((x) => x.malzemeId === stoksuz.no), 'Tümü sekmesi stoksuz kartı eklemez');
    assert.equal((await depo('/stok/malzemeler?durum=yok')).durum, 400);
  });

  test('statü adıyla arama: o statüde bakiyesi olan ve statüsü tanımlı kart bulunur', async () => {
    const k = await kart('mamul');
    const s = await statu(k.kod, 'OP 40 Benzersiz kaplama', `${k.no}-o40`);
    await bakiye(k.no, '6', { statuId: s });
    const t = await kart('mamul');
    await statu(t.kod, 'OP 50 Benzersiz kaplama', `${t.no}-o50`);
    const idler = (await liste('metin=benzersiz kaplama')).map((x) => x.malzemeId);
    assert.deepEqual(idler.sort((a, b) => a - b), [k.no, t.no].sort((a, b) => a - b));
    assert.deepEqual(await liste('metin=hic-olmayan-statu-adi'), []);
    const sekmede = (await liste('durum=statulu&metin=OP 50 benzersiz')).map((x) => x.malzemeId);
    assert.deepEqual(sekmede, [t.no], 'statülü sekmede metin yalnız uyan statülerin kartını bırakır');
  });

  test('ayrıntı: stoğu olmayan tanımlı statü salt okunur satırdır, stoklu statü kırılımdadır', async () => {
    const k = await kart('yarimamul');
    const stoklu = await statu(k.kod, 'OP 10 Torna', `${k.no}-o11`);
    const bos = await statu(k.kod, 'OP 20 Delik', `${k.no}-o21`);
    const baska = await kart('yarimamul');
    await statu(baska.kod, 'OP 10 Torna', `${baska.no}-o12`);
    await bakiye(k.no, '2', { statuId: stoklu });
    const c = await depo<MalzemeAyrintiCevabi>(`/stok/malzemeler/${k.no}`);
    assert.equal(c.durum, 200);
    const a = malzemeAyrintiCevabi.parse(c.govde);
    assert.deepEqual(a.statuKirilimi.map((x) => x.statuId), [stoklu]);
    assert.deepEqual(a.tanimliStatuler, [{ statuId: bos }]);
    assert.equal(a.satir.statude, '2');
  });
});
