import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { makineAyrimlariCevabi } from '#paylasilan/sozlesme/arkon.ts';
import type { MakineAyrimlariCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, uretimEmriAc } from '../uretim-emirleri/disari.ts';

const PAROLA = 'dogru-parola-1';

interface Cevap<T = unknown> { durum: number; govde: T }

// 393 d sonrası terminal makine seçicisi: seçicinin gösterdiği ayrım, başlatmanın reddettiğiyle aynı kuraldan gelir.
describe('arkon makine ayrımları (gerçek PostgreSQL)', () => {
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
    const merkez = await istek<{ id: number }>(yonetici, 'POST', '/is-merkezleri', { kod: `MA${(sayac += 1)}`, ad: 'Ayrım merkezi' });
    const ist = await istek<{ id: number }>(yonetici, 'POST', '/istasyonlar', { kod: `MI${(sayac += 1)}`, ad: 'Ayrım istasyonu', isMerkeziId: merkez.govde.id, tip: 'talasli' });
    assert.equal(ist.durum, 200, JSON.stringify(ist.govde));
    const makineler: { id: number; kod: string }[] = [];
    for (let i = 0; i < makineSayisi; i += 1) {
      const kod = `MK${(sayac += 1)}`;
      makineler.push({ id: (await sahip().tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [kod, 'Tezgah', ist.govde.id]))!.id, kod });
    }
    await sahip().sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2)', [yoneticiId, ist.govde.id]);
    return { merkezId: merkez.govde.id, istasyonId: ist.govde.id, makineler };
  }

  // Rotalı emir; her adım verilen makinede ve canlı planda şimdiden `bas`-`bit` dakika sonrasına yerleşmiş.
  async function emirKur(adimlar: { makineId: number; bas: number; bit: number }[]): Promise<{ emirId: number; emirNo: string }> {
    sayac += 1;
    const tip = (await sahip().tek<{ id: number }>('INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, $2, $3) RETURNING id', [`MT${sayac}`, 'Deneme tipi', 'TAL']))!.id;
    await sahip().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('MAY-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = (await sahip().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'MAY-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`may-${sayac}`, sayac, JSON.stringify({ id: `may-${sayac}`, com: { ad: `Ayrım ${sayac}` } }), yoneticiId],
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

  const ayrimlar = (cerez: string | null, emirId: number): Promise<Cevap<MakineAyrimlariCevabi>> =>
    istek<MakineAyrimlariCevabi>(cerez, 'GET', `/arkon/makine-ayrimlari?emirId=${emirId}`);
  const baslat = (emirId: number, makineIdleri: number[]): Promise<number> => vt().tx(async (db) => {
    try {
      await emirBaslat(db, (await kullaniciYukle(db, yoneticiId))!, emirId, makineIdleri);
      return 200;
    } catch (hata) {
      if ((hata as { kod?: string }).kod === 'CAKISMA') return 409;
      throw hata;
    }
  });

  before(async () => {
    ortam = await testVeritabaniKur('arkonayrim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ARKON.MA', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    yonetici = await girisCerezi('yonetici');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('planın makinesi döner; başka emre 4 saat içinde ayrılmış makine ayrımıyla gelir ve başlatma onu reddeder, boş makine geçer', async () => {
    const o = await istasyonKur(4);
    const [plan, ayrilmis, bos, ayniEmir] = o.makineler;
    const benim = await emirKur([{ makineId: plan!.id, bas: 300, bit: 360 }, { makineId: ayniEmir!.id, bas: 30, bit: 90 }]);
    const baska = await emirKur([{ makineId: ayrilmis!.id, bas: 60, bit: 120 }]);
    const operator = await kisiKur(`maop${(sayac += 1)}`, ['arkon.operator', 'sayfa.uretim-terminali']);

    const r = await ayrimlar(operator.cerez, benim.emirId);
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    assert.equal(makineAyrimlariCevabi.safeParse(r.govde).success, true);
    assert.equal(r.govde.planMakinesi, plan!.kod);
    assert.deepEqual(r.govde.ayrimlar.map((a) => [a.mc, a.emirNo, a.opNo]), [[ayrilmis!.kod, baska.emirNo, 10]], 'aynı emrin adımı ve boş makine ayrım değildir');
    assert.ok(Date.parse(r.govde.ayrimlar[0]!.baslangic) > Date.now(), 'ayrımın başlangıcı canlı plandandır');

    assert.equal(await baslat(benim.emirId, [ayrilmis!.id]), 409, 'seçicinin kilitlediği makinede başlatma reddedilir');
    assert.equal(await baslat(benim.emirId, [bos!.id]), 200, 'kilitsiz makinede başlatma geçer');
  });

  test('ayrılmış makinenin kendi emri için makine kilitli değildir', async () => {
    const o = await istasyonKur(2);
    const [a, b] = o.makineler;
    const emir = await emirKur([{ makineId: a!.id, bas: 60, bit: 120 }]);
    await emirKur([{ makineId: b!.id, bas: 30, bit: 90 }]);
    const r = await ayrimlar(yonetici, emir.emirId);
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    assert.equal(r.govde.planMakinesi, a!.kod);
    assert.deepEqual(r.govde.ayrimlar.map((x) => x.mc), [b!.kod]);
  });

  test('reddedilen: Arkon rolü olmayan, terminal sayfası olmayan ve kapsamı dışındaki istasyonun emrini soran 403; oturumsuz 401; emir yoksa boş', async () => {
    const o = await istasyonKur(2);
    const emir = await emirKur([{ makineId: o.makineler[0]!.id, bas: 60, bit: 120 }]);
    const rolsuz = await kisiKur(`mars${(sayac += 1)}`, ['sayfa.uretim-terminali']);
    assert.equal((await ayrimlar(rolsuz.cerez, emir.emirId)).durum, 403);
    const sayfasiz = await kisiKur(`masf${(sayac += 1)}`, ['arkon.operator']);
    assert.equal((await ayrimlar(sayfasiz.cerez, emir.emirId)).durum, 403);
    assert.equal((await ayrimlar(null, emir.emirId)).durum, 401);

    const disari = await kisiKur(`mads${(sayac += 1)}`, ['arkon.operator', 'sayfa.uretim-terminali']);
    const baskaMerkez = await istasyonKur(1);
    await sahip().sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [disari.id, baskaMerkez.merkezId]);
    assert.equal((await ayrimlar(disari.cerez, emir.emirId)).durum, 403, 'kapsam dışındaki istasyonun ayrımı okunmaz');
    await sahip().sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [disari.id, o.merkezId]);
    assert.equal((await ayrimlar(disari.cerez, emir.emirId)).durum, 200, 'kapsamındaki istasyon okunur');

    assert.deepEqual((await ayrimlar(yonetici, 999_999)).govde, { planMakinesi: null, ayrimlar: [] });
    assert.equal((await ayrimlar(yonetici, 0)).durum, 400);
  });
});
