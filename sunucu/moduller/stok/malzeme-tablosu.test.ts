import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { malzemelerCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { MalzemeAyrintiCevabi, MalzemelerCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// 2905: Malzemeler tablosunun dört yeni alanı (kategori adı, kart durumu, varsayılan konum, son hareket) ve yeni sıralamalar.
// Alan yoksa null'dır; sıfır ya da uydurma değer yazılmaz.
const PAROLA = 'dogru-parola-1';

describe('stok malzeme tablosu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const depo = async <T>(yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> => {
    const c = await app.inject({ method: govde === undefined ? 'GET' : 'POST', url: `/api${yol}`, headers: { cookie: cerez, ...(govde === undefined ? {} : { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }) }, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: c.json() as T };
  };
  let sira = 0;
  async function kart(tur: 'hammadde' | 'yarimamul' | 'mamul'): Promise<{ no: number; kod: string }> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['TBL-DNM-']);
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'TBL-DNM-', $3, 'aktif', $4, (SELECT min(id) FROM kisi), (SELECT min(id) FROM kisi)) RETURNING no`,
      [`tbl-dnm-${sira}`, tur, sira, JSON.stringify({ id: `tbl-dnm-${sira}`, com: { ad: `Deneme ${tur} ${sira}` } })],
    );
    const ayrinti = await depo<MalzemeAyrintiCevabi>(`/stok/malzemeler/${r!.no}`);
    return { no: r!.no, kod: ayrinti.govde.satir.stokKodu! };
  }
  const liste = async (sorgu: string) => {
    const c = await depo<MalzemelerCevabi>(`/stok/malzemeler?${sorgu}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return malzemelerCevabi.parse(c.govde).satirlar;
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_tablo');
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

  test('hareketi ve ayarı olmayan kartta yeni alanlar null; kart durumu malzemelerden gelir', async () => {
    const k = await kart('hammadde');
    await o().sahip.sorgu('INSERT INTO stok_malzeme_ayari (malzeme_id, kritik_seviye) VALUES ($1, 1)', [k.no]);
    const s = (await liste(`metin=${k.kod}`)).find((x) => x.malzemeId === k.no)!;
    assert.deepEqual({ v: s.varsayilanKonum, h: s.sonHareket, kat: s.kategoriAdi, d: s.kartDurumu }, { v: null, h: null, kat: null, d: 'aktif' });
  });

  test('varsayılan konum ayardan, son hareket defterden okunur; ayrıntı ve bütün kartlar aynı alanları taşır', async () => {
    const k = await kart('hammadde');
    const konum = (await o().vt.tek<{ id: number; kod: string }>("SELECT id, kod FROM stok_konum WHERE kod = 'KABUL'"))!;
    await o().sahip.sorgu('INSERT INTO stok_malzeme_ayari (malzeme_id, varsayilan_konum_id) VALUES ($1, $2)', [k.no, konum.id]);
    const kabul = await depo<unknown>('/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: k.no, miktar: '4' }] });
    assert.equal(kabul.durum, 200, JSON.stringify(kabul.govde));
    const son = (await o().vt.tek<{ zaman: Date }>('SELECT zaman FROM stok_hareketi WHERE malzeme_id = $1 ORDER BY id DESC LIMIT 1', [k.no]))!.zaman;
    const s = (await liste(`metin=${k.kod}`)).find((x) => x.malzemeId === k.no)!;
    assert.equal(s.varsayilanKonum, konum.kod);
    assert.ok(s.sonHareket !== null && Date.parse(s.sonHareket) === son.getTime(), String(s.sonHareket));
    const kartta = (await liste(`kapsam=kartlar&metin=${k.kod}`)).find((x) => x.malzemeId === k.no)!;
    assert.deepEqual({ v: kartta.varsayilanKonum, h: kartta.sonHareket }, { v: s.varsayilanKonum, h: s.sonHareket });
    const a = await depo<MalzemeAyrintiCevabi>(`/stok/malzemeler/${k.no}`);
    assert.deepEqual({ v: a.govde.satir.varsayilanKonum, h: a.govde.satir.sonHareket }, { v: s.varsayilanKonum, h: s.sonHareket });
  });

  test('serbest, kritik seviye ve son harekete göre sıralanır; tanımsız alan reddedilir', async () => {
    const az = await kart('hammadde');
    const cok = await kart('hammadde');
    for (const [k, m] of [[az, '2'], [cok, '9']] as const) {
      assert.equal((await depo<unknown>('/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: k.no, miktar: m }] })).durum, 200);
    }
    const sira = async (q: string) => (await liste(`${q}&sayfaBoyu=200`)).map((x) => x.malzemeId).filter((id) => id === az.no || id === cok.no);
    assert.deepEqual(await sira('sirala=serbest&yon=artan'), [az.no, cok.no]);
    assert.deepEqual(await sira('sirala=serbest&yon=azalan'), [cok.no, az.no]);
    assert.deepEqual(await sira('sirala=son&yon=azalan'), [cok.no, az.no], 'son kabul edilen önce');
    assert.equal((await liste('sirala=kritik&yon=artan&sayfaBoyu=5')).length > 0, true);
    assert.equal((await depo('/stok/malzemeler?sirala=ad')).durum, 400);
  });
});
