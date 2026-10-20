import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { gecersiz } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isiBirKezCalistir } from '#cekirdek/zamanlayici.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { isler } from './isler.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { BELIRSIZ_BEKLEME_MS, FATURA_TUR_SINIRI, FATURA_YENIDEN_OKUMA_MS, LISTE_TAZELEME_MS } from './kurallar.ts';
import type { GonderilecekMalzemeFisi } from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { emirBittiYansit, emirMalzemeFisiKaynagi, faturaTuru, listeOkumaTuru, malKabulTuru, malzemeFisiTuru, yeniSurecBellegi } from './servis.ts';
import type { EmirFisKaynaklari, MalzemeFisiKaynagi, MalzemeFisiTurOrtami, TurOrtami, TurSonucu } from './servis.ts';
import type { FisTuru } from './sorgular.ts';

const PAROLA = 'dogru-parola-1';
const TEST_ISTEK_SURESI_MS = 5000;
const ZAMAN_ASIMI_SURESI_MS = 300;

interface SahteFis { fis: GonderilecekMalzemeFisi; kayitNo: string | null; hata: string | null }

describe('Logo okuma akışları ve malzeme fişi, sahte köprüyle (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let kopru: SahteKopru;
  let simdi = Date.parse('2026-10-15T10:00:00Z');
  const fisler = new Map<string, SahteFis>();
  let fisSayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const ayar = async (anahtar: string, deger: boolean): Promise<void> => {
    const c = await app.inject({
      method: 'POST', url: `/api/ayarlar/${anahtar}/degistir`, headers: { cookie: cerez, 'istek-kimligi': randomUUID() }, payload: { deger },
    });
    assert.equal(c.statusCode, 200, `${anahtar}: ${c.body}`);
  };
  const ortami = (bellek = yeniSurecBellegi(), sureMs = TEST_ISTEK_SURESI_MS): TurOrtami => ({
    kopru: kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs }), bellek, saat: () => new Date(simdi),
  });
  const istekSayisi = (): number => kopru.istekler.length;
  const sayi = async (tablo: string): Promise<number> => Number((await vt().tek<{ n: string }>(`SELECT count(*) AS n FROM ${tablo}`))?.n);

  const fisKaynagi: MalzemeFisiKaynagi = {
    async gidecekler(_db: Db, sinir: number) {
      return [...fisler.values()].filter((x) => x.kayitNo === null).slice(0, sinir).map((x) => x.fis);
    },
    async sonuc(_db: Db, tur: FisTuru, id: number, sonuc) {
      const x = fisler.get(`${tur}:${id}`);
      if (!x) throw gecersiz('Fiş yok.');
      if ('hata' in sonuc) { x.hata = sonuc.hata; return; }
      x.kayitNo = sonuc.kayitNo;
      x.hata = null;
    },
  };
  const fisEkle = (tur: FisTuru, ek: Partial<GonderilecekMalzemeFisi> = {}): GonderilecekMalzemeFisi => {
    const id = ++fisSayac;
    const fis: GonderilecekMalzemeFisi = {
      id, tur, no: `${tur === 'sarf-fisi' ? 'SF' : 'UG'}-${String(id).padStart(6, '0')}`, tarih: '2026-10-15', saat: '09:30:00', projeKodu: 'PRJ-DENEME',
      satirlar: [{ satirId: id * 10, stokKodu: 'HM-DEN-00001', miktar: '2.5', birim: 'kg', aciklama: 'Deneme' }],
      ...ek,
    };
    fisler.set(`${tur}:${fis.id}`, { fis, kayitNo: null, hata: null });
    return fis;
  };
  const fisOrtami = (bellek = yeniSurecBellegi(), sureMs = TEST_ISTEK_SURESI_MS): MalzemeFisiTurOrtami => ({ ...ortami(bellek, sureMs), kaynak: fisKaynagi });

  before(async () => {
    ortam = await testVeritabaniKur('logookuma');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Okuma', kullaniciAdi: 'lo-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lo-yonetici', parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await ayar('logo.baglanti', true);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    kopru = await sahteKopruAc();
    fisler.clear();
    simdi += 24 * 3600_000;
    for (const t of ['logo_mal_kabul_satiri', 'logo_mal_kabul_imleci', 'logo_cari', 'logo_ambar', 'logo_liste_okuma', 'logo_fatura', 'logo_fatura_okuma', 'logo_siparis_no', 'logo_malzeme_fisi_giden']) {
      await vt().sorgu(`DELETE FROM ${t}`);
    }
    await vt().sorgu("DELETE FROM logo_giden WHERE belge_turu = 'siparis'");
    for (const a of ['logo.mal-kabul-okumasi', 'logo.liste-okumasi', 'logo.fatura-okumasi', 'logo.malzeme-fisi-gonderimi']) await ayar(a, false);
  });
  afterEach(async () => { await kopru.kapat(); });

  test('LOGO-O4 yeni ayarların hepsi kapalı gelir; kapalıyken (ya da bağlantı kapalıyken, köprü yokken) hiçbir tur istek atmaz ve yazmaz', async () => {
    kopru.malKabulSatirlari.push({ logicalRef: 1, quantity: 1 });
    kopru.cariListesi = [{ code: 'C-1', name: 'Deneme' }];
    fisEkle('sarf-fisi');
    const turlar: [string, () => Promise<TurSonucu>][] = [
      ['mal-kabul-kapali', () => malKabulTuru(vt(), ortami())],
      ['liste-kapali', () => listeOkumaTuru(vt(), ortami())],
      ['fatura-kapali', () => faturaTuru(vt(), ortami())],
      ['malzeme-fisi-kapali', () => malzemeFisiTuru(vt(), fisOrtami())],
    ];
    for (const [beklenen, kos] of turlar) assert.deepEqual(await kos(), { tur: beklenen });
    assert.equal(istekSayisi(), 0);
    // Anahtar açık ama "Logo bağlantısı" kapalı ya da köprü değişkenleri yok: yine istek yok.
    for (const a of ['logo.mal-kabul-okumasi', 'logo.liste-okumasi', 'logo.fatura-okumasi', 'logo.malzeme-fisi-gonderimi']) await ayar(a, true);
    await ayar('logo.baglanti', false);
    try {
      for (const [, kos] of turlar) assert.deepEqual(await kos(), { tur: 'kapali' });
    } finally {
      await ayar('logo.baglanti', true);
    }
    assert.deepEqual(await malKabulTuru(vt(), { ...ortami(), kopru: null }), { tur: 'ortam-degiskeni-yok' });
    assert.deepEqual(await listeOkumaTuru(vt(), { ...ortami(), kopru: null }), { tur: 'ortam-degiskeni-yok' });
    assert.deepEqual(await faturaTuru(vt(), { ...ortami(), kopru: null }), { tur: 'ortam-degiskeni-yok' });
    assert.deepEqual(await malzemeFisiTuru(vt(), { ...fisOrtami(), kopru: null }), { tur: 'ortam-degiskeni-yok' });
    assert.equal(istekSayisi(), 0);
    for (const t of ['logo_mal_kabul_satiri', 'logo_mal_kabul_imleci', 'logo_cari', 'logo_ambar', 'logo_fatura', 'logo_malzeme_fisi_giden']) assert.equal(await sayi(t), 0, t);
  });

  test('LOGO-O5 iş listesi: yeni okuma işleri kayıtlı; ayar kapalıyken ve köprü değişkeni yokken iş "bekliyor" döner, istek ve yazma yok', async () => {
    const adlar = ['logo-mal-kabul-okumasi', 'logo-liste-okumasi', 'logo-fatura-okumasi'];
    for (const ad of adlar) {
      const is = isler.find((i) => i.ad === ad);
      assert.ok(is, `${ad} iş listesinde yok`);
      assert.equal(await isiBirKezCalistir(vt(), is), 'bekliyor');
    }
    // 335: malzeme fişi işi listede; anahtar kapalıyken o da bekler.
    assert.equal(await isiBirKezCalistir(vt(), isler.find((i) => i.ad === 'logo-malzeme-fisi-gonderimi')!), 'bekliyor');
    await ayar('logo.mal-kabul-okumasi', true);
    assert.equal(await isiBirKezCalistir(vt(), isler.find((i) => i.ad === 'logo-mal-kabul-okumasi')!), 'bekliyor', 'köprü değişkeni yok');
    assert.equal(istekSayisi(), 0);
  });

  test('LOGO-O6 mal kabul: açıkken since imleciyle yalnız GET; satırlar saklanır, tekrar okumada çift satır yok, imleç ilerler', async () => {
    await ayar('logo.mal-kabul-okumasi', true);
    kopru.malKabulSatirlari.push(
      { logicalRef: 11, orderLineRef: 101, itemCode: 'HM-DEN-00001', quantity: 4, unitCode: 'KG', ficheNo: 'IR-1' },
      { logicalRef: 12, orderLineRef: 102, itemCode: 'HM-DEN-00002', quantity: 2.5 },
      { quantity: 9 },
    );
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await malKabulTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'mal-kabul', sonuc: 'okundu', sayi: 2 });
    assert.deepEqual(kopru.malKabulSince, [0]);
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), ['GET /api/PurchaseOrder/receipts']);
    const satirlar = await vt().sorgu<{ logical_ref: number; siparis_satir_ref: number | null; malzeme_kodu: string | null; miktar: string | null; ham: { quantity?: number } }>(
      'SELECT logical_ref, siparis_satir_ref, malzeme_kodu, miktar, ham FROM logo_mal_kabul_satiri ORDER BY logical_ref');
    assert.deepEqual(satirlar.map((x) => [x.logical_ref, x.siparis_satir_ref, x.malzeme_kodu, x.miktar]), [[11, 101, 'HM-DEN-00001', '4'], [12, 102, 'HM-DEN-00002', '2.5']]);
    assert.equal(satirlar[0]?.ham.quantity, 4, 'tam satır ham saklanır');
    // Tekrar okuma: imleç 12; yeni satır yok -> çift satır yok.
    assert.deepEqual(await malKabulTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'mal-kabul', sonuc: 'okundu', sayi: 0 });
    assert.deepEqual(kopru.malKabulSince, [0, 12]);
    // Köprü eski satırı yine verirse (imleç geriye düşmüş gibi) tekil anahtar çift satırı engeller; imleç geriye gitmez.
    kopru.malKabulSatirlari.push({ logicalRef: 13, orderLineRef: 103, quantity: 1 });
    await vt().sorgu('UPDATE logo_mal_kabul_imleci SET son_ref = 0');
    assert.equal((await malKabulTuru(vt(), ortami(bellek))).tur, 'okuma');
    assert.equal(await sayi('logo_mal_kabul_satiri'), 3);
    assert.equal((await vt().tek<{ son_ref: number }>('SELECT son_ref FROM logo_mal_kabul_imleci'))?.son_ref, 13);
    assert.ok(kopru.istekler.every((i) => i.yontem === 'GET'), 'Logo\'ya yalnız GET gider');
    assert.equal(await sayi('logo_giden'), 0, 'okuma giden kutusuna yazmaz');
  });

  test('LOGO-O7 mal kabul: zarf biçimi de okunur; okunamayan cevap imleci ilerletmez ve satır yazmaz', async () => {
    await ayar('logo.mal-kabul-okumasi', true);
    kopru.malKabulBicimi = 'zarf';
    kopru.malKabulSatirlari.push({ logicalRef: 21, quantity: 1 });
    assert.equal((await malKabulTuru(vt(), ortami())).tur, 'okuma');
    assert.equal(await sayi('logo_mal_kabul_satiri'), 1);
    await vt().sorgu('DELETE FROM logo_mal_kabul_satiri');
    await vt().sorgu('DELETE FROM logo_mal_kabul_imleci');
    kopru.malKabulBicimi = 'bozuk';
    assert.deepEqual(await malKabulTuru(vt(), ortami()), { tur: 'okuma', akis: 'mal-kabul', sonuc: 'belirsiz', sayi: 0 });
    assert.equal(await sayi('logo_mal_kabul_satiri'), 0);
    assert.equal(await sayi('logo_mal_kabul_imleci'), 0, 'imleç ilerlemedi');
  });

  test('LOGO-O8 mal kabul: 401 ve ağ hatasında tur düşmez, hiçbir şey yazılmaz; başarısız okuma bekleme süresi dolmadan yinelenmez', async () => {
    await ayar('logo.mal-kabul-okumasi', true);
    kopru.malKabulSatirlari.push({ logicalRef: 31, quantity: 1 });
    kopru.senaryo = 'yetkisiz';
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await malKabulTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'mal-kabul', sonuc: 'yetkisiz', sayi: 0 });
    assert.equal(istekSayisi(), 1);
    assert.deepEqual(await malKabulTuru(vt(), ortami(bellek)), { tur: 'bos' }, 'bekleme dolmadan ikinci istek yok');
    assert.equal(istekSayisi(), 1);
    assert.equal(await sayi('logo_mal_kabul_satiri'), 0);
    // Köprü düzelince bekleme süresi sonra okunur.
    kopru.senaryo = 'basari';
    simdi += 6 * 60_000;
    assert.equal((await malKabulTuru(vt(), ortami(bellek))).tur, 'okuma');
    assert.equal(await sayi('logo_mal_kabul_satiri'), 1);
    // Ağ hatası: köprü kapalı.
    const adres = kopru.adres;
    await kopru.kapat();
    const o: TurOrtami = { kopru: kopruIstemcisiKur({ adres, anahtar: 'x' }, { sureMs: 2000 }), bellek: yeniSurecBellegi(), saat: () => new Date(simdi) };
    assert.deepEqual(await malKabulTuru(vt(), o), { tur: 'okuma', akis: 'mal-kabul', sonuc: 'ulasilamadi', sayi: 0 });
    assert.equal(await sayi('logo_mal_kabul_satiri'), 1, 'önceki kayıtlar durur');
  });

  test('LOGO-O9 cari ve ambar: saatte bir, turda tek istek; kod ve ad yazılır, tekrar okumada çift satır yok, silinen kod önbellekten düşer', async () => {
    await ayar('logo.liste-okumasi', true);
    kopru.cariListesi = [{ code: 'C-DEN-1', name: 'Deneme Cari 1' }, { CODE: 'C-DEN-2', title: 'Deneme Cari 2' }, { name: 'kodsuz' }];
    kopru.ambarlar = [{ nr: 0, name: 'Merkez' }, { nr: 1, name: 'Yedek' }];
    const bellek = yeniSurecBellegi();
    const kos = (): Promise<TurSonucu> => listeOkumaTuru(vt(), ortami(bellek));
    assert.deepEqual(await kos(), { tur: 'okuma', akis: 'cari', sonuc: 'okundu', sayi: 2 });
    assert.deepEqual(await kos(), { tur: 'okuma', akis: 'ambar', sonuc: 'okundu', sayi: 2 });
    assert.deepEqual(await kos(), { tur: 'bos' }, 'iki liste de taze');
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), ['GET /api/Arp/list', 'GET /api/Lookup/warehouses']);
    assert.deepEqual((await vt().sorgu<{ kod: string; ad: string | null }>('SELECT kod, ad FROM logo_cari ORDER BY kod')).map((x) => [x.kod, x.ad]),
      [['C-DEN-1', 'Deneme Cari 1'], ['C-DEN-2', 'Deneme Cari 2']]);
    assert.deepEqual((await vt().sorgu<{ kod: string; ad: string | null }>('SELECT kod, ad FROM logo_ambar ORDER BY kod')).map((x) => [x.kod, x.ad]), [['0', 'Merkez'], ['1', 'Yedek']]);
    // Bir saat sonra yeniden okunur; yinelenen satır yok, listeden düşen kod önbellekten de düşer, boş cevap önbelleği boşaltmaz.
    simdi += LISTE_TAZELEME_MS + 1000;
    kopru.cariListesi = [{ code: 'C-DEN-1', name: 'Deneme Cari 1 yeni' }];
    assert.deepEqual(await kos(), { tur: 'okuma', akis: 'cari', sonuc: 'okundu', sayi: 1 });
    assert.deepEqual((await vt().sorgu<{ kod: string; ad: string | null }>('SELECT kod, ad FROM logo_cari')).map((x) => [x.kod, x.ad]), [['C-DEN-1', 'Deneme Cari 1 yeni']]);
    kopru.ambarlar = [];
    assert.equal((await kos()).tur, 'okuma');
    assert.equal(await sayi('logo_ambar'), 2, 'boş cevap önbelleği silmez');
    assert.ok(kopru.istekler.every((i) => i.yontem === 'GET'));
  });

  test('LOGO-O10 cari ve ambar: 401\'de tur düşmez ve önbellek değişmez', async () => {
    await ayar('logo.liste-okumasi', true);
    kopru.cariListesi = [{ code: 'C-DEN-1' }];
    const bellek = yeniSurecBellegi();
    assert.equal((await listeOkumaTuru(vt(), ortami(bellek))).tur, 'okuma');
    simdi += LISTE_TAZELEME_MS + 1000;
    kopru.senaryo = 'yetkisiz';
    assert.deepEqual(await listeOkumaTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'cari', sonuc: 'yetkisiz', sayi: 0 });
    assert.equal(await sayi('logo_cari'), 1);
  });

  test('LOGO-O11 fatura: yalnız Logo\'ya gitmiş ve numarası bilinen siparişler, sıralı ve turda sınırlı sayıda; tekrar okumada çift satır yok', async () => {
    await ayar('logo.fatura-okumasi', true);
    const toplam = FATURA_TUR_SINIRI + 2;
    for (let i = 1; i <= toplam; i += 1) {
      await vt().sorgu(
        `INSERT INTO logo_giden (belge_turu, belge_no, deneme_sayisi, son_deneme, son_sonuc, logo_kayit_no) VALUES ('siparis', $1, 1, now(), 'gonderildi', $2)`, [i, String(500 + i)]);
      await vt().sorgu('INSERT INTO logo_siparis_no (belge_no, siparis_no) VALUES ($1, $2)', [i, `SP-DEN-${i}`]);
      if (i !== 2) kopru.faturalar.set(`SP-DEN-${i}`, [{ logicalRef: 900 + i, number: `FT-${i}` }, { logicalRef: 950 + i, number: `FT-${i}B` }]);
    }
    // Hiç gönderilmemiş, numarası olmayan ve hatalı sipariş okunmaz.
    await vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no, deneme_sayisi, son_deneme, son_sonuc, logo_kayit_no) VALUES ('siparis', 99, 1, now(), 'gonderildi', '999')`);
    await vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no, niyet_zamani) VALUES ('siparis', 98, now())`);
    await vt().sorgu(`INSERT INTO logo_siparis_no (belge_no, siparis_no) VALUES (98, 'SP-DEN-98')`);
    const bellek = yeniSurecBellegi();
    const kos = (): Promise<TurSonucu> => faturaTuru(vt(), ortami(bellek));
    assert.deepEqual(await kos(), { tur: 'okuma', akis: 'fatura', sonuc: 'okundu', sayi: (FATURA_TUR_SINIRI - 1) * 2 }, 'sipariş 2\'nin faturası yok (404 = boş)');
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), Array.from({ length: FATURA_TUR_SINIRI }, (_, i) => `GET /api/PurchaseOrder/SP-DEN-${i + 1}/invoices`));
    assert.deepEqual(await kos(), { tur: 'okuma', akis: 'fatura', sonuc: 'okundu', sayi: 4 }, 'kalan iki sipariş');
    assert.equal(istekSayisi(), toplam);
    assert.deepEqual(await kos(), { tur: 'bos' }, 'hepsi taze okundu');
    assert.equal(await sayi('logo_fatura'), (toplam - 1) * 2);
    // Bir saat sonra aynı faturalar yeniden okunur; çift satır açılmaz.
    simdi += FATURA_YENIDEN_OKUMA_MS + 1000;
    assert.equal((await kos()).tur, 'okuma');
    assert.equal(await sayi('logo_fatura'), (toplam - 1) * 2);
    assert.ok(kopru.istekler.every((i) => i.yontem === 'GET'));
    assert.equal(await sayi('logo_giden'), toplam + 2, 'okuma giden kutusunu değiştirmez');
  });

  test('LOGO-O12 fatura: 401\'de tur ilk istekte durur, iş düşmez, bekleme dolmadan yinelenmez', async () => {
    await ayar('logo.fatura-okumasi', true);
    for (let i = 1; i <= 3; i += 1) {
      await vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no, deneme_sayisi, son_deneme, son_sonuc, logo_kayit_no) VALUES ('siparis', $1, 1, now(), 'gonderildi', $2)`, [i, String(500 + i)]);
      await vt().sorgu('INSERT INTO logo_siparis_no (belge_no, siparis_no) VALUES ($1, $2)', [i, `SP-DEN-${i}`]);
    }
    kopru.senaryo = 'yetkisiz';
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await faturaTuru(vt(), ortami(bellek)), { tur: 'okuma', akis: 'fatura', sonuc: 'yetkisiz', sayi: 0 });
    assert.equal(istekSayisi(), 1);
    assert.deepEqual(await faturaTuru(vt(), ortami(bellek)), { tur: 'bos' });
    assert.equal(istekSayisi(), 1);
    assert.equal(await sayi('logo_fatura'), 0);
    assert.equal(await sayi('logo_fatura_okuma'), 0, 'başarısız okuma okunmuş sayılmaz');
  });

  test('LOGO-O13 malzeme fişi: kapalıyken istek yok; açıkken niyet, sonra doğru uç ve gövde; çift gönderim yok; sonuç kaynağa yazılır', async () => {
    await ayar('logo.malzeme-fisi-gonderimi', true);
    const sarf = fisEkle('sarf-fisi');
    const bellek = yeniSurecBellegi();
    const kos = (): Promise<TurSonucu> => malzemeFisiTuru(vt(), fisOrtami(bellek));
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi-niyet', no: sarf.id });
    assert.equal(istekSayisi(), 0, 'niyet turunda istek yok');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: sarf.id, sonuc: 'gonderildi' });
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), ['POST /api/MaterialSlip/AddConsumption']);
    assert.equal((kopru.malzemeFisleri[0]?.govde as { TYPE?: number }).TYPE, 12);
    assert.equal((kopru.malzemeFisleri[0]?.govde as { NUMBER?: string }).NUMBER, sarf.no);
    assert.equal(fisler.get(`sarf-fisi:${sarf.id}`)?.kayitNo, String(kopru.malzemeFisleri[0]?.ref));
    assert.deepEqual(await kos(), { tur: 'bos' }, 'gönderilen fiş kuyruktan çıkar');
    assert.equal(kopru.malzemeFisleri.length, 1);
    const g = await vt().tek<{ son_sonuc: string; logo_kayit_no: string; niyet: boolean }>(
      "SELECT son_sonuc, logo_kayit_no, niyet_zamani IS NOT NULL AS niyet FROM logo_malzeme_fisi_giden WHERE belge_turu = 'sarf-fisi' AND belge_no = $1", [sarf.id]);
    assert.deepEqual(g, { son_sonuc: 'gonderildi', logo_kayit_no: String(kopru.malzemeFisleri[0]?.ref), niyet: false });
    // Üretimden giriş kendi ucuna gider; sarfla aynı kimlik sayacı karışmaz.
    const uretim = fisEkle('uretim-girisi', { id: sarf.id });
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi-niyet', no: uretim.id });
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: uretim.id, sonuc: 'gonderildi' });
    assert.equal(kopru.istekler.at(-1)?.yol, '/api/MaterialSlip/AddProductionEntry');
    assert.equal((kopru.malzemeFisleri[1]?.govde as { TYPE?: number }).TYPE, 13);
    assert.equal(kopru.malzemeFisleri.length, 2);
  });

  test('LOGO-O14 malzeme fişi: sonucu bilinmeyen istek kendiliğinden yinelenmez (zaman aşımı); gövdesi bozuk fiş hiç gitmez', async () => {
    await ayar('logo.malzeme-fisi-gonderimi', true);
    const bozuk = fisEkle('sarf-fisi', { satirlar: [] });
    const bellek = yeniSurecBellegi();
    assert.deepEqual(await malzemeFisiTuru(vt(), fisOrtami(bellek)), { tur: 'malzeme-fisi', no: bozuk.id, sonuc: 'reddedildi' });
    assert.equal(istekSayisi(), 0);
    assert.match(fisler.get(`sarf-fisi:${bozuk.id}`)?.hata ?? '', /satırı yok/);
    fisler.clear();
    const fis = fisEkle('sarf-fisi');
    kopru.senaryo = 'zaman-asimi';
    const kos = (): Promise<TurSonucu> => malzemeFisiTuru(vt(), fisOrtami(bellek, ZAMAN_ASIMI_SURESI_MS));
    assert.equal((await kos()).tur, 'malzeme-fisi-niyet');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: fis.id, sonuc: 'belirsiz' });
    assert.equal(istekSayisi(), 1);
    assert.deepEqual(await kos(), { tur: 'bos' }, 'belirsiz bekleme dolmadan istek yok');
    simdi += BELIRSIZ_BEKLEME_MS + 1000;
    kopru.senaryo = 'basari';
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: fis.id, sonuc: 'reddedildi' });
    assert.match(fisler.get(`sarf-fisi:${fis.id}`)?.hata ?? '', /Logo'da kontrol/);
    assert.equal(istekSayisi(), 1, 'sonucu bilinmeyen fiş ikinci kez gönderilmedi');
    assert.equal(kopru.malzemeFisleri.length, 0);
  });

  test('LOGO-O15 malzeme fişi: 401 ve ağ hatasında tur düşmez; neden fişin sahibine yazılır, niyet boşalır', async () => {
    await ayar('logo.malzeme-fisi-gonderimi', true);
    const fis = fisEkle('uretim-girisi');
    const bellek = yeniSurecBellegi();
    kopru.senaryo = 'yetkisiz';
    const kos = (): Promise<TurSonucu> => malzemeFisiTuru(vt(), fisOrtami(bellek));
    assert.equal((await kos()).tur, 'malzeme-fisi-niyet');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: fis.id, sonuc: 'yetkisiz' });
    assert.match(fisler.get(`uretim-girisi:${fis.id}`)?.hata ?? '', /anahtarı reddedildi/);
    assert.equal(fisler.get(`uretim-girisi:${fis.id}`)?.kayitNo, null);
    assert.equal((await vt().tek<{ niyet: boolean }>("SELECT niyet_zamani IS NOT NULL AS niyet FROM logo_malzeme_fisi_giden WHERE belge_turu = 'uretim-girisi'"))?.niyet, false);
    // Köprü düzelince, geri çekilme dolunca fiş yeniden niyetle başlar ve bir kez gider.
    kopru.senaryo = 'basari';
    simdi += 31 * 60_000;
    assert.equal((await kos()).tur, 'malzeme-fisi-niyet');
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: fis.id, sonuc: 'gonderildi' });
    assert.equal(kopru.malzemeFisleri.length, 1);
    // Ağ hatası: köprü kapalı.
    const ikinci = fisEkle('sarf-fisi');
    const adres = kopru.adres;
    await kopru.kapat();
    const o: MalzemeFisiTurOrtami = { ...fisOrtami(yeniSurecBellegi()), kopru: kopruIstemcisiKur({ adres, anahtar: 'x' }, { sureMs: 2000 }) };
    assert.equal((await malzemeFisiTuru(vt(), o)).tur, 'malzeme-fisi-niyet');
    assert.deepEqual(await malzemeFisiTuru(vt(), o), { tur: 'malzeme-fisi', no: ikinci.id, sonuc: 'ulasilamadi' });
  });

  test('LOGO-O17 biten emrin fişleri (335): anahtar kapalıyken kuyruğa girmez; açıkken iki fiş bir kez girer, satırlar sahiplerinden okunur, boş fiş düşer, her biri bir kez gider', async () => {
    const EMIR = 4101;
    const okunan: number[][] = [];
    const kaynaklar: EmirFisKaynaklari = {
      async emirNolari(_db, idler) { okunan.push([...idler]); return new Map(idler.map((id) => [id, `UE-DEN-${id}`])); },
      async emirMalzemeFisleri(_db, idler) {
        return new Map(idler.map((id) => [id, { sarf: [], giris: [{ stokKodu: 'MM-DEN-00001', birim: 'adet', miktar: '5' }] }]));
      },
      async emirHurdalari(_db, idler) { return idler.map((id) => ({ uretimEmriId: id, stokKodu: 'MM-DEN-00001', birim: 'adet', hurdaAdet: 1 })); },
    };
    const kaynak = emirMalzemeFisiKaynagi(kaynaklar);
    const kuyruk = async (): Promise<string[]> => (await vt().sorgu<{ k: string }>(
      "SELECT belge_turu || ':' || belge_no AS k FROM logo_malzeme_fisi_giden ORDER BY 1")).map((r) => r.k);

    await vt().tx((db) => emirBittiYansit(db, { uretimEmriId: EMIR }));
    assert.deepEqual(await kuyruk(), [], 'anahtar kapalıyken biten emir sonradan Logo\'ya gitmez');
    await ayar('logo.baglanti', false);
    await ayar('logo.malzeme-fisi-gonderimi', true);
    await vt().tx((db) => emirBittiYansit(db, { uretimEmriId: EMIR }));
    assert.deepEqual(await kuyruk(), [], '"Logo bağlantısı" kapalıyken de girmez');
    await ayar('logo.baglanti', true);

    await ayar('logo.malzeme-fisi-gonderimi', true);
    await vt().tx((db) => emirBittiYansit(db, { uretimEmriId: EMIR }));
    await vt().tx((db) => emirBittiYansit(db, { uretimEmriId: EMIR }));
    assert.deepEqual(await kuyruk(), [`sarf-fisi:${EMIR}`, `uretim-girisi:${EMIR}`], 'yeniden biten emir ikinci kez girmez');

    const gidecek = await vt().tx((db) => kaynak.gidecekler(db, 10));
    assert.deepEqual(gidecek.map((f) => [f.tur, f.id, f.no]), [['uretim-girisi', EMIR, `UE-DEN-${EMIR}`]], 'sarfı olmayan fiş gitmez');
    assert.match(gidecek[0]?.tarih ?? '', /^\d{4}-\d{2}-\d{2}$/);
    assert.match(gidecek[0]?.saat ?? '', /^\d{2}:\d{2}:\d{2}$/);
    assert.deepEqual(gidecek[0]?.satirlar.map((x) => [x.miktar, x.aciklama]), [['5', null], ['1', 'Hurda']]);
    assert.deepEqual(await kuyruk(), [`uretim-girisi:${EMIR}`], 'boş sarf fişi kuyruktan düştü');
    assert.deepEqual(okunan, [[EMIR]], 'emirler tek seferde okunur');

    const bellek = yeniSurecBellegi();
    const kos = (): Promise<TurSonucu> => malzemeFisiTuru(vt(), { ...ortami(bellek), kaynak });
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi-niyet', no: EMIR });
    assert.deepEqual(await kos(), { tur: 'malzeme-fisi', no: EMIR, sonuc: 'gonderildi' });
    assert.equal(kopru.istekler.at(-1)?.yol, '/api/MaterialSlip/AddProductionEntry');
    const govde = kopru.malzemeFisleri[0]?.govde as { NUMBER?: string; TRANSACTIONS?: { QUANTITY: number; DESCRIPTION?: string }[] };
    assert.equal(govde.NUMBER, `UE-DEN-${EMIR}`);
    assert.deepEqual(govde.TRANSACTIONS?.map((x) => [x.QUANTITY, x.DESCRIPTION ?? null]), [[5, null], [1, 'Hurda']]);
    assert.deepEqual(await kos(), { tur: 'bos' }, 'gönderilen fiş kuyruktan çıkar');
    await vt().tx((db) => emirBittiYansit(db, { uretimEmriId: EMIR }));
    assert.deepEqual(await kos(), { tur: 'bos' }, 'yeniden biten emrin gönderilmiş fişi ikinci kez gitmez');
    assert.equal(kopru.malzemeFisleri.length, 1);

    // Niyeti yazılmış fiş sonradan boşalırsa düşmez (Logo'da açılmış olabilir).
    const IKINCI = EMIR + 1;
    await vt().tx((db) => emirBittiYansit(db, { uretimEmriId: IKINCI }));
    const niyetli = yeniSurecBellegi();
    assert.deepEqual(await malzemeFisiTuru(vt(), { ...ortami(niyetli), kaynak }), { tur: 'malzeme-fisi-niyet', no: IKINCI });
    const bosKaynak = emirMalzemeFisiKaynagi({ ...kaynaklar, emirMalzemeFisleri: async () => new Map(), emirHurdalari: async () => [] });
    assert.deepEqual(await vt().tx((db) => bosKaynak.gidecekler(db, 10)), []);
    assert.ok((await kuyruk()).includes(`uretim-girisi:${IKINCI}`), 'niyetli fiş kuyrukta kalır');
    assert.ok(!(await kuyruk()).includes(`sarf-fisi:${IKINCI}`), 'denenmemiş boş fiş düşer');
  });
});
