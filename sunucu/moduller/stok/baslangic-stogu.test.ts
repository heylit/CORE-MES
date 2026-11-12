import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import {
  baslangicDenetleCevabi, baslangicGeriAlmaDurumu, baslangicYukleCevabi, hareketlerCevabi, malKabulAyrintiCevabi, malKabullerCevabi,
  type BaslangicSatirGirdisi, type MalKabulCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { baslangicSatirDenetimi, logoyaGiderMi, type BaslangicSatirBaglami } from './kurallar.ts';

// 3129 (3134 a, 3144 a): başlangıç stoğu Excel'den tek mal kabul belgesiyle girer; denetim tutmazsa hiçbir şey yazılmaz, belge bütün
// olarak ve yalnız hareket görmemişse geri alınır, aynı dosya geri alınmamış belgeyle ikinci kez girmez. Veriler uydurmadır (ORN-).
const PAROLA = 'dogru-parola-1';
const ROL_ISLEMLERI: Record<string, string[]> = {
  depo: ['stok.giris', 'stok.transfer', 'stok.cikis'],
  mudur: ['stok.giris', 'stok.transfer', 'stok.geri-al'],
};
interface Cevap<T = unknown> { durum: number; govde: T }

describe('stok: başlangıç stoğu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  let yonetici = 0, sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function kart(g: { tur?: string; birim?: string; skt?: boolean; durum?: string } = {}): Promise<{ no: number; kod: string }> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['ORN-BS-']);
    const r = (await o().sahip.tek<{ no: number; kod: string }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, hizmet_yonu)
       VALUES ($1, $2, 'ORN-BS-', $3, $4, $5, $6, $6, CASE WHEN $2 = 'hizmet' THEN 'alinan' END) RETURNING no, stok_kodu AS kod`,
      [`orn-bs-${sira}`, g.tur ?? 'hammadde', sira, g.durum ?? 'aktif',
        JSON.stringify({ id: `orn-bs-${sira}`, com: { ad: `ORN başlangıç ${sira}`, birim: g.birim ?? 'kg', ...(g.skt ? { skt: true } : {}) } }), yonetici]))!;
    return r;
  }
  async function konum(tur = 'depo_zemini'): Promise<string> {
    sira += 1;
    const kod = `ORN-G-${sira}`;
    await o().sahip.sorgu('INSERT INTO stok_konum (depo_id, kod, tur) SELECT depo_id, $1, $2 FROM stok_konum WHERE kod = \'KABUL\'', [kod, tur]);
    return kod;
  }
  // Dosya sunucuya gelmez (3144 a): özet tarayıcıda hesaplanır; testte her yükleme yeni bir dosyadır.
  async function yukle(_kim = 'depo'): Promise<string> {
    return createHash('sha256').update(randomBytes(2000)).digest('hex');
  }
  const satir = (s: Partial<BaslangicSatirGirdisi> & { malzemeKodu: string; konumKodu: string }, i = 2): BaslangicSatirGirdisi => ({ sira: i, miktar: '5', ...s });
  const denetle = async (satirlar: BaslangicSatirGirdisi[], ozet?: string) => {
    const c = await istek('depo', 'POST', '/stok/baslangic-stogu/denetle', { satirlar, ...(ozet ? { dosyaOzeti: ozet } : {}) });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return baslangicDenetleCevabi.parse(c.govde);
  };
  const yukleKomutu = async (satirlar: BaslangicSatirGirdisi[], ozet: string, kim = 'depo', duzeltmeler: unknown[] = []) =>
    istek(kim, 'POST', '/stok/baslangic-stogu', { dosyaOzeti: ozet, dosyaAdi: 'ORN-sayim.xlsx', satirlar, duzeltmeler });
  const bakiye = async (kod: string, konumKod: string): Promise<{ miktar: number; kalite: string; lot: string | null }[]> => (await o().sahip.sorgu<{ miktar: string; kalite: string; lot: string | null }>(
    `SELECT b.miktar::text AS miktar, b.kalite_durumu AS kalite, p.lot_no AS lot FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
       JOIN malzeme_katalog_karti m ON m.no = b.malzeme_id LEFT JOIN stok_parti p ON p.id = b.parti_id
      WHERE m.stok_kodu = $1 AND k.kod = $2 AND b.miktar <> 0 ORDER BY p.lot_no`, [kod, konumKod])).map((x) => ({ ...x, miktar: Number(x.miktar) }));

  before(async () => {
    ortam = await testVeritabaniKur('stok_baslangic');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const yon = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = (await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!.id;
      await ortam.vt.sorgu('DELETE FROM rol_islemi WHERE rol_id = $1', [r]);
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r, i]);
    }
    for (const rol of ['depo', 'mudur', 'operator']) {
      const r = (await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!.id;
      await ortam.vt.tx(async (db) => {
        const k = await yoneticiOlustur(db, { ad: `Deneme ${rol}`, kullaniciAdi: rol, parola: PAROLA });
        await rolAta(db, yonetici, k, r);
        await rolAl(db, yonetici, k, yon);
      });
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: rol, parola: PAROLA } });
      assert.equal(g.statusCode, 200);
      cerezler.set(rol, String(g.headers['set-cookie']).split(';')[0] ?? '');
    }
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: yükleme stok.giris, geri alma stok.geri-al ister; oturumsuz 401', async () => {
    const k = await kart();
    const g = await konum();
    const s = [satir({ malzemeKodu: k.kod, konumKodu: g })];
    assert.equal((await istek('oturumsuz', 'POST', '/stok/baslangic-stogu/denetle', { satirlar: s })).durum, 401);
    assert.equal((await istek('operator', 'POST', '/stok/baslangic-stogu/denetle', { satirlar: s })).durum, 403);
    assert.equal((await yukleKomutu(s, await yukle('operator'), 'operator')).durum, 403);
    const y = await yukleKomutu(s, await yukle());
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    const belge = baslangicYukleCevabi.parse(y.govde).belge!;
    assert.equal((await istek('depo', 'POST', `/stok/baslangic-stogu/${belge.id}/geri-al`)).durum, 403);
  });

  test('denetim: kod, konum, miktar, birim, SKT, lot ve tür hataları satırda döner; gözdeki bakiye ve dosya içi tekrar uyarıdır', async () => {
    const k = await kart();
    const adet = await kart({ birim: 'adet' });
    const skt = await kart({ skt: true });
    const hizmet = await kart({ tur: 'hizmet' });
    const taslak = await kart({ durum: 'taslak' });
    const demirbas = await kart({ tur: 'demirbas', birim: 'adet' });
    const baska = await kart();
    const g = await konum();
    const karantina = await konum('karantina');
    const hurda = await konum('hurda');
    // Gözde bakiye ve başka kartın lotu: önce küçük bir yükleme.
    const ilk = await yukleKomutu([satir({ malzemeKodu: k.kod, konumKodu: g, miktar: '3' }), satir({ malzemeKodu: baska.kod, konumKodu: g, lotNo: 'ORN-LOT-BASKA' }, 3)], await yukle());
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    const d = await denetle([
      satir({ malzemeKodu: 'ORN-YOK-1', konumKodu: g }, 2),
      satir({ malzemeKodu: k.kod, konumKodu: 'ORN-YOK-GOZ' }, 3),
      satir({ malzemeKodu: k.kod, konumKodu: g, miktar: '0' }, 4),
      satir({ malzemeKodu: adet.kod, konumKodu: g, miktar: '2.5' }, 5),
      satir({ malzemeKodu: skt.kod, konumKodu: g }, 6),
      satir({ malzemeKodu: k.kod, konumKodu: g, lotNo: 'orn-lot-baska' }, 7),
      satir({ malzemeKodu: hizmet.kod, konumKodu: g }, 8),
      satir({ malzemeKodu: taslak.kod, konumKodu: g }, 9),
      satir({ malzemeKodu: demirbas.kod, konumKodu: g, lotNo: 'ORN-D-1' }, 10),
      satir({ malzemeKodu: k.kod, konumKodu: karantina }, 11),
      satir({ malzemeKodu: k.kod, konumKodu: hurda }, 12),
      satir({ malzemeKodu: k.kod, konumKodu: g.toLowerCase(), miktar: '1,5' }, 13),
      satir({ malzemeKodu: k.kod.toLowerCase(), konumKodu: g, lotNo: 'ORN-YENI-1' }, 14),
      satir({ malzemeKodu: k.kod, konumKodu: g, lotNo: 'ORN-YENI-1' }, 15),
      satir({ malzemeKodu: skt.kod, konumKodu: g, sonKullanma: '2027-02-30' }, 16),
      satir({ malzemeKodu: skt.kod, konumKodu: g, sonKullanma: '2027-03-31' }, 17),
    ]);
    const hata = (i: number): string => d.satirlar[i]!.hatalar.map((h) => `${h.alan}: ${h.ileti}`).join(' | ');
    assert.match(hata(0), /^malzeme: Malzeme kodu bulunamadı: ORN-YOK-1/);
    assert.match(hata(1), /^konum: Konum kodu bulunamadı/);
    assert.match(hata(2), /^miktar: Miktar sıfırdan büyük/);
    assert.match(hata(3), /^miktar: Birimi adet olan kartta miktar tam sayıdır/);
    assert.match(hata(4), /^sonKullanma: Bu kart son kullanma takipli/);
    assert.match(hata(5), /^lotNo: Bu lot no başka malzemenin lotu/);
    assert.match(hata(6), /hizmet kartı stoklanmaz/);
    assert.match(hata(7), /kart kullanılabilir değil/);
    assert.match(hata(8), /Demirbaş parti almaz/);
    assert.match(hata(9), /serbest girer; karantina/);
    assert.match(hata(10), /Mal kabul bu konuma yazılmaz/);
    assert.match(hata(11), /^miktar:/, 'virgüllü miktar istemcide noktaya çevrilir; sunucu yalnız noktayı kabul eder');
    assert.equal(d.satirlar[11]!.konum?.kod, g, 'konum kodu büyük-küçük harf gözetmez');
    assert.equal(d.satirlar[12]!.durum, 'uyarili');
    assert.equal(d.satirlar[12]!.malzeme?.kod, k.kod, 'malzeme kodu büyük-küçük harf gözetmez');
    assert.match(d.satirlar[12]!.uyarilar.map((u) => u.ileti).join(' '), /Gözde zaten 3 kg var; eklenecek/);
    assert.match(d.satirlar[13]!.uyarilar.map((u) => u.ileti).join(' '), /14\. satırda da var/);
    assert.match(hata(14), /Son kullanma tarihi geçersiz/);
    assert.equal(d.satirlar[15]!.hatalar.length, 0);
    assert.equal(d.satirlar[15]!.malzeme?.birim, 'kg');
    assert.equal(d.tekrar, null);
  });

  test('yükleme: bütün satırlar serbest, var olan bakiyeye eklenir; dosyadaki lot no kullanılır, boşsa verilir; hareketler kaynakla süzülür', async () => {
    const k = await kart();
    const skt = await kart({ skt: true });
    const g = await konum();
    const ozet = await yukle();
    const satirlar = [
      satir({ malzemeKodu: k.kod, konumKodu: g, miktar: '10', lotNo: 'ORN-L-0101', tedarikciPartiNo: 'ORN-TP-1', tedarikci: 'ORN-TED', not: 'ORN sayım' }, 2),
      satir({ malzemeKodu: k.kod, konumKodu: g, miktar: '2.5', lotNo: 'ORN-L-0101' }, 3),
      satir({ malzemeKodu: k.kod, konumKodu: g, miktar: '4' }, 4),
      satir({ malzemeKodu: skt.kod, konumKodu: g, miktar: '1', sonKullanma: '2027-03-31' }, 5),
    ];
    const y = await yukleKomutu(satirlar, ozet, 'depo', [{ sira: 3, alan: 'miktar', dosyada: '25', girilen: '2.5', toplu: false }]);
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    const c = baslangicYukleCevabi.parse(y.govde);
    assert.equal(c.denetim, null);
    assert.equal(c.belge?.tur, 'baslangic');
    assert.equal(c.belge?.satirSayisi, 4);
    assert.equal(c.belge?.malzemeSayisi, 2);
    const b = await bakiye(k.kod, g);
    assert.equal(b.length, 2);
    assert.deepEqual(b.find((x) => x.lot === 'ORN-L-0101'), { miktar: 12.5, kalite: 'serbest', lot: 'ORN-L-0101' });
    assert.equal(b.find((x) => x.lot !== 'ORN-L-0101')?.miktar, 4);
    assert.equal((await o().sahip.tek<{ t: string }>("SELECT t.son_kullanma::text AS t FROM stok_parti_son_kullanma t JOIN stok_parti p ON p.id = t.parti_id WHERE p.malzeme_id = $1", [skt.no]))?.t, '2027-03-31');

    // K2: Logo'ya hiçbir şey gitmez; satır "Diğer" gibi irsaliye beklemez durumda kalır, fiş açılmaz.
    const satirDurumu = await o().sahip.sorgu<{ logo: string }>('SELECT logo_durumu AS logo FROM stok_mal_kabul_satiri WHERE mal_kabul_id = $1', [c.belge!.id]);
    assert.deepEqual([...new Set(satirDurumu.map((x) => x.logo))], ['irsaliye_bekleniyor']);
    assert.equal(logoyaGiderMi({ tur: 'giris', cikisNedeni: null, girisKaynagi: 'mal_kabul' }), false);
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM stok_fis_satiri f JOIN stok_mal_kabul_satiri s ON s.hareket_id = f.hareket_id WHERE s.mal_kabul_id = $1', [c.belge!.id]))!.n, 0);

    const h = await istek('depo', 'GET', `/stok/hareketler?kaynak=baslangic&malzemeId=${k.no}`);
    assert.equal(h.durum, 200, JSON.stringify(h.govde));
    const hl = hareketlerCevabi.parse(h.govde).satirlar;
    assert.equal(hl.length, 3);
    assert.deepEqual([...new Set(hl.map((x) => x.baslangicBelgeNo))], [c.belge!.no]);
    assert.match(hl.find((x) => Number(x.miktar) === 10)?.aciklama ?? '', new RegExp(`^Başlangıç stoğu ${c.belge!.no} · Tedarikçi: ORN-TED · ORN sayım$`));
    const mk = hareketlerCevabi.parse((await istek('depo', 'GET', `/stok/hareketler?kaynak=mal_kabul&malzemeId=${k.no}`)).govde).satirlar;
    assert.equal(mk.length, 0, 'mal kabul süzgeci başlangıç stoğunu içermez');

    const ayr = malKabulAyrintiCevabi.parse((await istek('depo', 'GET', `/stok/mal-kabuller/${c.belge!.id}`)).govde);
    assert.deepEqual(ayr.baslangic, { dosyaAdi: 'ORN-sayim.xlsx', duzeltmeler: [{ sira: 3, alan: 'miktar', dosyada: '25', girilen: '2.5', toplu: false }] });
    const liste = malKabullerCevabi.parse((await istek('depo', 'GET', '/stok/mal-kabuller?tur=baslangic&asil=1')).govde);
    assert.ok(liste.satirlar.some((x) => x.id === c.belge!.id));
  });

  test('hatalı satır varsa hiçbir şey yazılmaz; denetim satırlarla döner', async () => {
    const k = await kart();
    const g = await konum();
    const once = (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM stok_mal_kabul'))!.n;
    const y = await yukleKomutu([satir({ malzemeKodu: k.kod, konumKodu: g }, 2), satir({ malzemeKodu: 'ORN-YOK-9', konumKodu: g }, 3)], await yukle());
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    const c = baslangicYukleCevabi.parse(y.govde);
    assert.equal(c.belge, null);
    assert.deepEqual(c.denetim?.satirlar.map((s) => s.durum), ['eklenecek', 'hatali']);
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM stok_mal_kabul'))!.n, once);
    assert.deepEqual(await bakiye(k.kod, g), []);
  });

  test('aynı dosya geri alınmamış belgeyle ikinci kez girmez; bozuk özet reddedilir; geri alınan dosya yeniden yüklenir (K1)', async () => {
    const k = await kart();
    const g = await konum();
    const s = [satir({ malzemeKodu: k.kod, konumKodu: g })];
    assert.equal((await yukleKomutu(s, 'ORN-bozuk')).durum, 400);
    const ozet = await yukle();
    const ilk = baslangicYukleCevabi.parse((await yukleKomutu(s, ozet)).govde).belge!;
    const ikinci = await yukleKomutu(s, ozet);
    assert.equal(ikinci.durum, 409);
    assert.match(JSON.stringify(ikinci.govde), new RegExp(`Bu dosya ${ilk.no} olarak yüklendi`));
    assert.deepEqual((await denetle(s, ozet)).tekrar, { id: ilk.id, no: ilk.no });
    assert.equal((await istek('mudur', 'POST', `/stok/baslangic-stogu/${ilk.id}/geri-al`)).durum, 200);
    assert.equal((await denetle(s, ozet)).tekrar, null);
    assert.equal((await yukleKomutu(s, ozet)).durum, 200);
  });

  test('işlem kaydı: kontrol isteğine yalnız satır sayısı ve dosya özeti, yüklemeye gövde tam girer (3150 a)', async () => {
    const k = await kart();
    const g = await konum();
    const s = [satir({ malzemeKodu: k.kod, konumKodu: g, lotNo: 'ORN-L-D1' }), satir({ malzemeKodu: k.kod, konumKodu: g }, 3)];
    const ozet = await yukle();
    await denetle(s, ozet);
    const son = async (yol: string) => (await o().sahip.tek<{ govde: Record<string, unknown> }>(
      'SELECT govde FROM denetim_kaydi WHERE yol LIKE $1 ORDER BY id DESC LIMIT 1', [`%${yol}`]))!.govde;
    const kontrol = await son('/stok/baslangic-stogu/denetle');
    assert.equal(JSON.stringify(kontrol).includes('ORN-L-D1'), false);
    assert.equal(JSON.stringify(kontrol).includes(k.kod), false);
    assert.match(JSON.stringify(kontrol), /"satirSayisi":2/);
    assert.match(JSON.stringify(kontrol), new RegExp(ozet));
    assert.equal((await yukleKomutu(s, ozet)).durum, 200);
    const yukleme = await son('/stok/baslangic-stogu');
    assert.match(JSON.stringify(yukleme), /ORN-L-D1/);
  });

  test('geri alma: bütün belge ters döner; lot sonradan hareket gördüyse durur ve lotu söyler; ikinci kez geri alınmaz', async () => {
    const k = await kart();
    const g = await konum();
    const g2 = await konum();
    const belge = baslangicYukleCevabi.parse((await yukleKomutu([
      satir({ malzemeKodu: k.kod, konumKodu: g, miktar: '6', lotNo: 'ORN-GA-1' }, 2), satir({ malzemeKodu: k.kod, konumKodu: g, miktar: '4', lotNo: 'ORN-GA-2' }, 3),
    ], await yukle())).govde).belge!;
    const parti = (await o().sahip.tek<{ id: number }>("SELECT id FROM stok_parti WHERE lot_no = 'ORN-GA-2'"))!.id;
    const kaynak = (await o().sahip.tek<{ id: number }>('SELECT id FROM stok_konum WHERE kod = $1', [g]))!.id;
    const hedef = (await o().sahip.tek<{ id: number }>('SELECT id FROM stok_konum WHERE kod = $1', [g2]))!.id;
    const t = await istek('depo', 'POST', '/stok/tasima', { malzemeId: k.no, kaynakKonumId: kaynak, partiId: parti, hedefKonumId: hedef, miktar: '1' });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const durum = baslangicGeriAlmaDurumu.parse((await istek('depo', 'GET', `/stok/baslangic-stogu/${belge.id}/geri-alma`)).govde);
    assert.deepEqual({ satir: durum.satirSayisi, lot: durum.lotSayisi, goren: durum.hareketGorenler.map((x) => [x.etiket, x.tur]) }, { satir: 2, lot: 2, goren: [['ORN-GA-2', 'transfer']] });
    const engel = await istek('mudur', 'POST', `/stok/baslangic-stogu/${belge.id}/geri-al`);
    assert.equal(engel.durum, 409);
    assert.match(JSON.stringify(engel.govde), /Şu lotlar hareket gördü: ORN-GA-2/);
    assert.equal((await bakiye(k.kod, g)).length, 2, 'durdurulan geri alma hiçbir şey yazmaz');

    const temiz = baslangicYukleCevabi.parse((await yukleKomutu([satir({ malzemeKodu: k.kod, konumKodu: g2, miktar: '3' })], await yukle())).govde).belge!;
    const once = await bakiye(k.kod, g2);
    const geri = await istek<MalKabulCevabi>('mudur', 'POST', `/stok/baslangic-stogu/${temiz.id}/geri-al`);
    assert.equal(geri.durum, 200, JSON.stringify(geri.govde));
    assert.equal(geri.govde.belge.duzeltilenId, temiz.id);
    assert.equal(geri.govde.hareketIdler.length, 1);
    assert.deepEqual(await bakiye(k.kod, g2), once.filter((x) => x.miktar !== 3 || x.lot === 'ORN-GA-2'));
    assert.equal((await istek('mudur', 'POST', `/stok/baslangic-stogu/${temiz.id}/geri-al`)).durum, 409);
    assert.equal(baslangicGeriAlmaDurumu.parse((await istek('depo', 'GET', `/stok/baslangic-stogu/${temiz.id}/geri-alma`)).govde).geriAlindi, true);
    const hl = hareketlerCevabi.parse((await istek('depo', 'GET', `/stok/hareketler?kaynak=baslangic&malzemeId=${k.no}&tur=geri_alma`)).govde).satirlar;
    assert.equal(hl.length, 1, 'geri alma hareketi de başlangıç stoğu süzgecindedir');
    const asil = malKabullerCevabi.parse((await istek('depo', 'GET', '/stok/mal-kabuller?tur=baslangic&asil=1')).govde).satirlar;
    assert.ok(!asil.some((x) => x.duzeltilenId === temiz.id), 'geri alma kaydı asıl belgeler listesinde yok');
  });

  test('K4: mal kabul formu başlangıç türü açamaz; başlangıç belgesi mal kabul düzeltmesiyle değişmez', async () => {
    const k = await kart();
    const g = await konum();
    const kid = (await o().sahip.tek<{ id: number }>('SELECT id FROM stok_konum WHERE kod = $1', [g]))!.id;
    assert.equal((await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'baslangic', satirlar: [{ malzemeId: k.no, miktar: '1', konumId: kid }] })).durum, 400);
    const belge = baslangicYukleCevabi.parse((await yukleKomutu([satir({ malzemeKodu: k.kod, konumKodu: g })], await yukle())).govde).belge!;
    const d = await istek('mudur', 'POST', `/stok/mal-kabuller/${belge.id}/duzelt`, { satirlar: [] });
    assert.equal(d.durum, 409);
    assert.match(JSON.stringify(d.govde), /Başlangıç stoğu belgesi düzeltilmez/);
  });

  test('2000 satır tek istekte denetlenir ve yazılır', async () => {
    const kartlar: { no: number; kod: string }[] = [];
    for (let i = 0; i < 50; i += 1) kartlar.push(await kart());
    const gozler: string[] = [];
    for (let i = 0; i < 20; i += 1) gozler.push(await konum());
    const satirlar = Array.from({ length: 2000 }, (_, i) => satir({ malzemeKodu: kartlar[i % 50]!.kod, konumKodu: gozler[i % 20]!, miktar: String((i % 7) + 1) }, i + 2));
    const bas = performance.now();
    const d = await denetle(satirlar);
    const denetimSuresi = performance.now() - bas;
    assert.equal(d.satirlar.filter((s) => s.durum === 'hatali').length, 0);
    const y = await yukleKomutu(satirlar, await yukle());
    const sure = performance.now() - bas;
    assert.equal(y.durum, 200, JSON.stringify(y.govde).slice(0, 500));
    assert.equal(baslangicYukleCevabi.parse(y.govde).belge?.satirSayisi, 2000);
    console.log(`2000 satır: denetim ${Math.round(denetimSuresi)} ms, denetim + yükleme ${Math.round(sure)} ms`);
    assert.ok(sure < 120_000);
  });

  test('göç: dosya alanları yalnız başlangıç belgesinde; özet ve düzeltme listesi biçimli', async () => {
    const kisit = (ad: string) => (h: unknown) => (h as { constraint?: string }).constraint === ad;
    let n = 0;
    const ekle = (tur: string, ozet: string | null, duzeltme: string | null) => o().sahip.sorgu(
      'INSERT INTO stok_mal_kabul (no, tur, kisi_id, dosya_ozeti, dosya_adi, duzeltmeler) VALUES ($1, $2, $3, $4, $5, $6::jsonb)',
      [`ORN-MK-G${String(n += 1)}`, tur, yonetici, ozet, ozet === null ? null : 'ORN-sayim.xlsx', duzeltme]);
    const ozet = 'a'.repeat(64);
    await assert.rejects(ekle('diger', ozet, '[]'), kisit('stok_mal_kabul_dosya_yalniz_baslangic'));
    await assert.rejects(ekle('baslangic', 'ORN', '[]'), kisit('stok_mal_kabul_dosya_ozeti_bicimi'));
    await assert.rejects(ekle('baslangic', ozet, '{}'), kisit('stok_mal_kabul_duzeltmeler_bicimi'));
    await ekle('baslangic', ozet, '[]');
    await ekle('diger', null, null);
  });

  test('kural: satır denetimi saf; eksik kod ve boş konum ayrı iletidir', () => {
    const bos: BaslangicSatirBaglami = {
      malzemeKodu: null, malzeme: null, konumKodu: null, konum: null, miktar: '1', lotNo: null, lot: null, malzemeId: null, dosyadaBaskaKart: null,
      partiBilgisiVar: false, sonKullanma: null, sktTakipli: false, gozdeki: null, oncekiSatir: null,
    };
    assert.deepEqual(baslangicSatirDenetimi(bos).hatalar.map((h) => h.ileti), ['Malzeme kodu boş.', 'Konum kodu boş.']);
  });
});
