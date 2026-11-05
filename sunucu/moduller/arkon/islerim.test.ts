import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { islerimCevabi } from '#paylasilan/sozlesme/arkon.ts';
import type { IslerimCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, emirDuraklat, uretimEmriAc } from '../uretim-emirleri/disari.ts';

const PAROLA = 'dogru-parola-1';

interface Cevap<T = unknown> { durum: number; govde: T }

// 2125-1 b: terminal çarkının "İşlerim" şeridi. Kişi farklı istasyonlardaki makinelerde çalışan işlerini tek okumada görür; başkasının işini görmez.
describe('arkon işlerim (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  let yonetici = '';
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const sahip = (): TestVeritabani['sahip'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    return ortam.sahip;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function istek<T = unknown>(cerez: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem, url: `/api${yol}`, headers: cerez ? { cookie: cerez } : {}, ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }

  async function kisiKur(kullaniciAdi: string, islemler: string[]): Promise<{ cerez: string; id: number }> {
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const gecici = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, kullaniciAdi]);
    if (!yoneticiRolu || !gecici) throw new Error('rol kurulamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [gecici.id, islem]);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, gecici.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return yeni;
    });
    return { cerez: await girisCerezi(kullaniciAdi), id };
  }

  async function istasyonKur(makineSayisi: number): Promise<{ merkezId: number; istasyonId: number; makineler: { id: number; kod: string }[] }> {
    const merkez = await istek<{ id: number }>(yonetici, 'POST', '/is-merkezleri', { kod: `IM${(sayac += 1)}`, ad: 'İşlerim merkezi' });
    const ist = await istek<{ id: number }>(yonetici, 'POST', '/istasyonlar', { kod: `II${(sayac += 1)}`, ad: 'İşlerim istasyonu', isMerkeziId: merkez.govde.id, tip: 'talasli' });
    assert.equal(ist.durum, 200, JSON.stringify(ist.govde));
    const makineler: { id: number; kod: string }[] = [];
    for (let i = 0; i < makineSayisi; i += 1) {
      const kod = `IK${(sayac += 1)}`;
      makineler.push({ id: (await sahip().tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [kod, 'Tezgah', ist.govde.id]))!.id, kod });
    }
    await sahip().sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2)', [yoneticiId, ist.govde.id]);
    return { merkezId: merkez.govde.id, istasyonId: ist.govde.id, makineler };
  }

  // Rotalı emir; her adım verilen makinede ve canlı planda şimdiden `bas`-`bit` dakika sonrasına yerleşmiş.
  async function emirKur(adimlar: { makineId: number; bas: number; bit: number }[]): Promise<{ emirId: number; emirNo: string }> {
    sayac += 1;
    const tip = (await sahip().tek<{ id: number }>('INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, $2, $3) RETURNING id', [`IT${sayac}`, 'Deneme tipi', 'TAL']))!.id;
    await sahip().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ISL-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = (await sahip().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'ISL-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`isl-${sayac}`, sayac, JSON.stringify({ id: `isl-${sayac}`, com: { ad: `İşlerim ${sayac}` } }), yoneticiId],
    ))!.no;
    await sahip().sorgu("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', 'A', $2)", [kart, yoneticiId]);
    const revizyon = (await sahip().tek<{ id: number }>("SELECT id FROM rota_revizyonu WHERE malzeme_id = $1 AND harf = 'A'", [kart]))!.id;
    const { uretimEmriId } = await vt().tx(async (db) => uretimEmriAc(db, (await kullaniciYukle(db, yoneticiId))!, {
      projeId: denemeProjeId, malzemeNo: kart, adet: 10, teslim: null, kaynakRotaRevizyonId: revizyon,
      isEmirleri: adimlar.map((a, n) => ({
        sira: n + 1, opNo: (n + 1) * 10, ad: `Adım ${n + 1}`, operasyonTipiId: tip, kaynak: { tur: 'makine' as const, id: a.makineId }, ayarSuresiDk: '0', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      })),
    }));
    const isEmirleri = await sahip().sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY sira', [uretimEmriId]);
    for (const [n, a] of adimlar.entries()) {
      await sahip().sorgu(
        `INSERT INTO plan_yerlesimi (is_emri_id, makine_id, kisi_id, baslangic, bitis, yazan_kisi_id)
         VALUES ($1, $2, NULL, now() + make_interval(mins => $3), now() + make_interval(mins => $4), $5)`,
        [isEmirleri[n]!.id, a.makineId, a.bas, a.bit, yoneticiId],
      );
    }
    const emirNo = (await sahip().tek<{ emir_no: string }>('SELECT emir_no FROM uretim_emri WHERE id = $1', [uretimEmriId]))!.emir_no;
    return { emirId: uretimEmriId, emirNo };
  }

  const islerim = (cerez: string | null): Promise<Cevap<IslerimCevabi>> => istek<IslerimCevabi>(cerez, 'GET', '/arkon/islerim');
  const yonetimDb = async (db: Parameters<typeof kullaniciYukle>[0]) => (await kullaniciYukle(db, yoneticiId))!;

  before(async () => {
    ortam = await testVeritabaniKur('arkonislerim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ARKON.IS', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    yonetici = await girisCerezi('yonetici');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('iki istasyonda çalışan işler makine başına gelir, son girilen önce; duraklatılan iş düşer; başkası görmez', async () => {
    const birinci = await istasyonKur(2);
    const ikinci = await istasyonKur(1);
    const [m1, m2] = birinci.makineler;
    const [m3] = ikinci.makineler;
    const a = await emirKur([{ makineId: m1!.id, bas: 600, bit: 660 }]);
    const b = await emirKur([{ makineId: m3!.id, bas: 600, bit: 660 }]);
    assert.deepEqual((await islerim(yonetici)).govde, { isler: [] }, 'çalışan işi yokken liste boştur');

    await vt().tx(async (db) => emirBaslat(db, await yonetimDb(db), a.emirId, [m1!.id, m2!.id], new Date(Date.now() - 120_000).toISOString()));
    await vt().tx(async (db) => emirBaslat(db, await yonetimDb(db), b.emirId, [m3!.id], new Date(Date.now() - 60_000).toISOString()));

    const r = await islerim(yonetici);
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    assert.equal(islerimCevabi.safeParse(r.govde).success, true);
    assert.deepEqual(r.govde.isler.map((x) => [x.emirNo, x.opNo, x.mc]), [[b.emirNo, 10, m3!.kod], [a.emirNo, 10, m1!.kod], [a.emirNo, 10, m2!.kod]]);
    const istKod = async (id: number) => (await sahip().tek<{ kod: string }>('SELECT kod FROM istasyon WHERE id = $1', [id]))!.kod;
    assert.equal(r.govde.isler[0]!.istasyon, await istKod(ikinci.istasyonId));
    assert.equal(r.govde.isler[1]!.istasyon, await istKod(birinci.istasyonId));
    assert.equal(r.govde.isler[1]!.makineAd, 'Tezgah');

    const operator = await kisiKur(`isop${(sayac += 1)}`, ['arkon.operator', 'sayfa.uretim-terminali']);
    assert.deepEqual((await islerim(operator.cerez)).govde, { isler: [] }, 'başkasının çalışan işi listede yoktur');

    await vt().tx(async (db) => emirDuraklat(db, await yonetimDb(db), a.emirId));
    assert.deepEqual((await islerim(yonetici)).govde.isler.map((x) => x.emirNo), [b.emirNo], 'duraklatılan iş listeden düşer');
  });

  test('reddedilen: Arkon rolü olmayan ya da terminal sayfası olmayan 403; oturumsuz 401', async () => {
    const rolsuz = await kisiKur(`isrs${(sayac += 1)}`, ['sayfa.uretim-terminali']);
    assert.equal((await islerim(rolsuz.cerez)).durum, 403);
    const sayfasiz = await kisiKur(`issf${(sayac += 1)}`, ['arkon.operator']);
    assert.equal((await islerim(sayfasiz.cerez)).durum, 403);
    assert.equal((await islerim(null)).durum, 401);
  });
});
