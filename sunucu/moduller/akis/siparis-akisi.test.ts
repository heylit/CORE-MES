import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { siparisAkisiCevabi, siparisAsamalariCevabi } from '#paylasilan/sozlesme/akis.ts';
import { sayimGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { siparisTerminRiskleri } from './disari.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, emirBitir, emirlerinIsEmriIdleri, emirSayim, kararliSayimiSonuclandir, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';

const PAROLA = 'dogru-parola-1';
const KAPANIS_GEREKCESI = 'Eksikle kapatmak için gerekçe yazın';
interface Cevap<T = unknown> { durum: number; govde: T }

// 3429-1 a (SPA-1..SPA-4, SIP-41): siparişin akışı emir, sevk ve faturadan okunur; eksik varken kapatma gerekçe ister.
describe('akis satış siparişi akışı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let ticariNo = 0;
  let yariNo = 0;
  let hamNo = 0;
  let firmaId = 0;
  let sayac = 0;
  let revizyonId = 0;
  let nokta: number | undefined;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tek = async (sql: string, p: unknown[]): Promise<number> => (await o().sahip.tek<{ id: number }>(sql, p))!.id;

  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '' };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const k = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    kullanicilar.set(kullaniciAdi, k);
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
  }

  async function makineKur(): Promise<number> {
    sayac += 1;
    const im = await tek('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`SAM${sayac}`, 'Deneme Merkezi']);
    const ist = await tek('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`SAI${sayac}`, `Deneme İstasyonu ${sayac}`, im]);
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
    return tek('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`SAK${sayac}`, 'Tezgah', ist]);
  }

  const adim = (kaynak: IsEmriGirdisi['kaynak']): IsEmriGirdisi => ({
    bilesenler: [], sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tipId, kaynak, ayarSuresiDk: '10', birimSureDk: '1',
    terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });

  // Terminal komutlarının HTTP ucu yok (238 H3).
  async function terminal(id: number, komut: 'baslat' | 'sayim' | 'bitir', adet = 0): Promise<void> {
    const k = kullanicilar.get('operator')!;
    try {
      await o().vt.tx((db) => {
        if (komut === 'baslat') return emirBaslat(db, k, id);
        if (komut === 'bitir') return emirBitir(db, k, id);
        return emirSayim(db, k, id, sayimGovdesi.parse({ tur: 'saglam', adet }));
      });
    } catch (h) {
      if (h instanceof UygulamaHatasi) assert.fail(`${komut}: ${h.message}`);
      throw h;
    }
  }

  async function siparisAc(kalemler: readonly { malzemeNo: number; miktar: number; fiyat: number; karsilama?: 'uret' | 'stok' | 'satin-al' }[]): Promise<{ id: number; satirlar: number[] }> {
    sayac += 1;
    const id = await tek(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
       VALUES ($1, 'onayli', $2, current_date, current_date + 30, 20, $3, $3, now()) RETURNING id`, [`SS-2031-${String(700 + sayac)}`, firmaId, yoneticiId]);
    const satirlar: number[] = [];
    for (const [i, k] of kalemler.entries()) {
      satirlar.push(await tek('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat, karsilama) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [id, i + 1, k.malzemeNo, k.miktar, k.fiyat, k.karsilama ?? 'uret']));
    }
    return { id, satirlar };
  }

  async function emirAc(satirId: number, adet: number, adimSayisi = 1): Promise<number> {
    const m = await makineKur();
    const isEmirleri = Array.from({ length: adimSayisi }, (_, i) => ({ ...adim({ tur: 'makine', id: m }), sira: i + 1, opNo: 10 * (i + 1), ad: `Adım ${String(i + 1)}` }));
    const { uretimEmriId } = await o().vt.tx((db) => uretimEmriAc(db, kullanicilar.get('planlama_proje')!, {
      projeId, malzemeNo: urunNo, adet, teslim: null, kaynakRotaRevizyonId: revizyonId, isEmirleri,
    }));
    await o().sahip.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $2 WHERE id = $1', [uretimEmriId, satirId]);
    return uretimEmriId;
  }

  async function emirBitsin(id: number, saglam: number): Promise<void> {
    await terminal(id, 'baslat');
    await terminal(id, 'sayim', saglam);
    await o().vt.tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));
    await terminal(id, 'bitir');
  }

  // Sevkiyat işinin durumu doğrudan yazılır: akış yalnız okur; stok yansıması urun-sevki.test.ts'tedir.
  async function sevkEt(emirId: number, adet: number | null, durum: 'yolda' | 'tamamlandi'): Promise<number> {
    nokta ??= await tek("INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, firma_id) VALUES ('Deneme Alıcı Noktası', 'musteri', 40, 29, $1) RETURNING id", [firmaId]);
    const isId = await tek("INSERT INTO sevkiyat_isi (tarih, istenen_tarih, tur, birakis_noktasi_id, agirlik_kilogram, palet_sayisi) VALUES (current_date, current_date, 'teslimat', $1, 10, 1) RETURNING id", [nokta]);
    // Biten emir bekleme listesine düşer; kısmi sevkin ikinci parçası kök kaydın altına açılır.
    const kok = await o().sahip.tek<{ id: number; isId: number | null }>(
      "SELECT id, is_id AS \"isId\" FROM sevkiyat_bekleyen WHERE kaynak = 'urun' AND uretim_emri_id = $1 AND ust_bekleyen_id IS NULL", [emirId]);
    if (kok !== null && kok.isId === null) await o().sahip.sorgu('UPDATE sevkiyat_bekleyen SET adet = $2, is_id = $3 WHERE id = $1', [kok.id, adet, isId]);
    else {
      await o().sahip.sorgu("INSERT INTO sevkiyat_bekleyen (kaynak, yon, uretim_emri_id, adet, is_id, ust_bekleyen_id) VALUES ('urun', 'gidis', $1, $2, $3, $4)",
        [emirId, adet, isId, kok?.id ?? null]);
    }
    await o().sahip.sorgu('UPDATE sevkiyat_isi SET durum = $2, durum_zamani = now() WHERE id = $1', [isId, durum]);
    return isId;
  }

  const fatura = (siparisId: number, tutar: number, g: { tur?: 'fatura' | 'iade'; para?: string; iade?: number } = {}) => {
    sayac += 1;
    const tur = g.tur ?? 'fatura';
    return tek(
      `INSERT INTO finans_belge (yon, tur, kategori, firma_id, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani, belge_no, siparis_id, iade_belge_id, olusturan_id)
       VALUES ($1, $2, $3, $4, current_date, current_date, $5, 1, $6, 20, $7, $8, $9, $10) RETURNING id`,
      [tur === 'fatura' ? 'gelir' : 'gider', tur, tur === 'fatura' ? 'urun_satisi' : 'satis_iadesi', firmaId, g.para ?? 'TRY', tutar,
        tur === 'fatura' ? `DNM-FAT-SPA-${String(sayac)}` : null, siparisId, g.iade ?? null, yoneticiId]);
  };

  const akis = async (ad: string, id: number) => {
    const c = await istek(ad, 'GET', `/akis/siparisler/${String(id)}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return siparisAkisiCevabi.parse(c.govde);
  };
  const surum = async (id: number): Promise<number> => (await istek<{ surum: number }>('mudur', 'GET', `/siparisler/${String(id)}`)).govde.surum;

  before(async () => {
    ortam = await testVeritabaniKur('akis_siparis_akisi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = await tek("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('SPA.AKIS', 'Deneme proje', $1) RETURNING id", [yoneticiId]);
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator'], ['mudur', 'mudur'], ['cam', 'cam']] as const) await kisiEkle(ad, rol);
    tipId = await tek("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('SPA-T', 'Deneme tipi', 'TAL') RETURNING id", []);
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SPA-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = (sira: number, tur: string) => ortam!.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'SPA-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`spa-dnm-${String(sira)}`, tur, sira, JSON.stringify({ id: `spa-dnm-${String(sira)}`, com: { ad: `Deneme ${tur}` } }), yoneticiId]).then((r) => r!.no);
    urunNo = await kart(1, 'mamul');
    ticariNo = await kart(2, 'ticari_mal');
    yariNo = await kart(3, 'yarimamul');
    hamNo = await kart(4, 'hammadde');
    revizyonId = await tek(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id`, [urunNo, yoneticiId]);
    firmaId = await tek("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Alıcı SPA', 'musteri', $1) RETURNING id", [yoneticiId]);
  });
  after(async () => { await ortam?.kaldir(); });

  test('SPA-1..SPA-4, SIP-41: emir, sevk ve faturayla aşama ilerler; eksik varken kapatma gerekçe ister, eksik kalmayınca gerekçesiz kapanır', async () => {
    const s = await siparisAc([{ malzemeNo: urunNo, miktar: 4, fiyat: 250 }, { malzemeNo: ticariNo, miktar: 2, fiyat: 50 }]);
    let a = await akis('mudur', s.id);
    assert.deepEqual([a.asama, a.fatura, a.kalemler.map((k) => [k.uretilir, k.emirler.length, k.uretilen])], ['emir-bekliyor', 'yok', [[true, 0, null], [false, 0, null]]]);
    assert.deepEqual(a.kapanisEksikleri, ['Kalem 1: teslim edilen 0 / 4.', 'Fatura kesilmedi.'], 'ticari mal kaleminin sevki ölçülmez');

    const emir = await emirAc(s.satirlar[0]!, 4);
    a = await akis('mudur', s.id);
    assert.equal(a.kalemler[0]?.emirler[0]?.id, emir);
    assert.ok(['emir-acildi', 'planlandi'].includes(a.asama), a.asama);

    const ret = await istek<{ mesaj: string; alan?: string }>('mudur', 'POST', `/siparisler/${String(s.id)}/kapat`, { surum: await surum(s.id) });
    assert.equal(ret.durum, 400, JSON.stringify(ret.govde));
    assert.equal(ret.govde.mesaj, `${KAPANIS_GEREKCESI}: Kalem 1: teslim edilen 0 / 4. Fatura kesilmedi.`);

    await emirBitsin(emir, 4);
    a = await akis('mudur', s.id);
    assert.deepEqual([a.asama, a.kalemler[0]?.uretilen], ['uretildi', 4]);

    await sevkEt(emir, 3, 'tamamlandi');
    const yolda = await sevkEt(emir, 1, 'yolda');
    a = await akis('mudur', s.id);
    assert.deepEqual([a.asama, a.kalemler[0]?.sevkEdilen, a.kalemler[0]?.yolda], ['kismi-sevk', 3, 1]);
    await o().sahip.sorgu("UPDATE sevkiyat_isi SET durum = 'tamamlandi' WHERE id = $1", [yolda]);

    // Ara toplam 4 x 250 + 2 x 50 = 1100 (KDV hariç).
    const f = await fatura(s.id, 1100);
    await fatura(s.id, 100, { tur: 'iade', iade: f });
    a = await akis('mudur', s.id);
    assert.deepEqual([a.fatura, a.faturaSayisi, a.kapanisEksikleri], ['kismi', 1, ['Faturalanan tutar sipariş tutarının altında.']]);
    await fatura(s.id, 100);
    a = await akis('mudur', s.id);
    assert.deepEqual([a.asama, a.fatura, a.kapanisEksikleri], ['faturalandi', 'tam', []]);

    const kapat = await istek<{ durum: string }>('mudur', 'POST', `/siparisler/${String(s.id)}/kapat`, { surum: await surum(s.id) });
    assert.deepEqual([kapat.durum, kapat.govde.durum], [200, 'kapandi']);
    a = await akis('mudur', s.id);
    assert.deepEqual([a.asama, a.kapanisEksikleri], ['kapandi', []]);
  });

  test('SIP-41: gerekçeyle eksikli kapanır, gerekçe uç denetim kaydına düşer; SPA-2: başka para birimli fatura karşılaştırılamaz', async () => {
    const s = await siparisAc([{ malzemeNo: urunNo, miktar: 5, fiyat: 10 }]);
    await fatura(s.id, 50, { para: 'EUR' });
    const a = await akis('mudur', s.id);
    assert.deepEqual([a.fatura, a.kapanisEksikleri.at(-1)], ['karsilastirilamaz', 'Fatura tutarı sipariş tutarıyla karşılaştırılamadı (para birimi farklı); faturaları kontrol edin.']);
    const bos = await istek('mudur', 'POST', `/siparisler/${String(s.id)}/kapat`, { surum: await surum(s.id), neden: '   ' });
    assert.equal(bos.durum, 400, 'boşluk gerekçe sayılmaz');
    const kapat = await istek<{ durum: string }>('mudur', 'POST', `/siparisler/${String(s.id)}/kapat`, { surum: await surum(s.id), neden: 'Müşteri kalanı istemedi' });
    assert.deepEqual([kapat.durum, kapat.govde.durum], [200, 'kapandi']);
    const kayit = await o().sahip.tek<{ yol: string }>("SELECT yol FROM denetim_kaydi WHERE govde->>'neden' = 'Müşteri kalanı istemedi' ORDER BY id DESC LIMIT 1", []);
    assert.match(kayit?.yol ?? '', /kapat$/);
  });

  test('SPA-1, SPA-4, SPA-5: yarı mamul üretilir, hammadde üretilmez; plan bitişi en geç bitiş; bitmemiş emrin adedi boş teslimatı emir adedidir', async () => {
    const s = await siparisAc([{ malzemeNo: yariNo, miktar: 6, fiyat: 10 }, { malzemeNo: hamNo, miktar: 3, fiyat: 5 }]);
    let a = await akis('mudur', s.id);
    assert.deepEqual(a.kalemler.map((k) => k.uretilir), [true, false]);
    assert.deepEqual(a.kapanisEksikleri, ['Kalem 1: teslim edilen 0 / 6.', 'Fatura kesilmedi.'], 'hammadde kaleminin sevki ölçülmez');

    // İki iş emirli emir ve aynı kalemin ikinci emri; plan bitişleri sırasız yazılır.
    const e1 = await emirAc(s.satirlar[0]!, 4, 2);
    const e2 = await emirAc(s.satirlar[0]!, 2);
    const ie = await o().vt.tx((db) => emirlerinIsEmriIdleri(db, [e1, e2]));
    const m = await makineKur();
    const yerles = (isEmriId: number, bitis: string) => o().sahip.sorgu(
      'INSERT INTO plan_yerlesimi (is_emri_id, makine_id, baslangic, bitis, yazan_kisi_id) VALUES ($1, $2, $3::timestamptz - interval \'1 hour\', $3, $4)', [isEmriId, m, bitis, yoneticiId]);
    await yerles(ie.get(e1)![1]!, '2026-12-03T10:00:00Z');
    await yerles(ie.get(e1)![0]!, '2026-12-02T10:00:00Z');
    await yerles(ie.get(e2)![0]!, '2026-12-01T10:00:00Z');
    a = await akis('mudur', s.id);
    const emirBitisi = new Map(a.kalemler[0]!.emirler.map((e) => [e.id, e.planBitis]));
    assert.deepEqual([emirBitisi.get(e1), emirBitisi.get(e2), a.kalemler[0]!.planBitis], ['2026-12-03T10:00:00.000Z', '2026-12-01T10:00:00.000Z', '2026-12-03T10:00:00.000Z']);

    // Bitmemiş emirde sağlam adet verilmez; adedi boş teslimat işi emrin adedini (4) sayar.
    await terminal(e1, 'baslat');
    await terminal(e1, 'sayim', 1);
    await sevkEt(e1, null, 'tamamlandi');
    a = await akis('mudur', s.id);
    assert.deepEqual([a.kalemler[0]!.emirler.find((e) => e.id === e1)?.saglam, a.kalemler[0]!.sevkEdilen, a.kalemler[0]!.uretilen], [null, 4, 0]);
    assert.equal(a.kapanisEksikleri[0], 'Kalem 1: teslim edilen 4 / 6.');
  });

  test('3429-3 F: üretilen türde "Stoktan" ya da "Satın al" kalem üretilmez sayılır, karşılama yolu akışta döner', async () => {
    const s = await siparisAc([
      { malzemeNo: yariNo, miktar: 6, fiyat: 10 },
      { malzemeNo: yariNo, miktar: 2, fiyat: 10, karsilama: 'stok' },
      { malzemeNo: yariNo, miktar: 1, fiyat: 10, karsilama: 'satin-al' },
    ]);
    const a = await akis('mudur', s.id);
    assert.deepEqual(a.kalemler.map((k) => [k.uretilir, k.karsilama]), [[true, 'uret'], [false, 'stok'], [false, 'satin-al']]);
    assert.deepEqual(a.kapanisEksikleri, ['Kalem 1: teslim edilen 0 / 6.', 'Kalem 2: teslim edilen 0 / 2.', 'Kalem 3: teslim edilen 0 / 1.', 'Fatura kesilmedi.'],
      '3429-3 F4: emirsiz kalemin sevki de ölçülür');
  });

  test('SPA-6: Kokpit planı kalem termininden sonra bitince termin riski ve kademe kaydı; plan düzelince ya da teslim bitince kalkar', async () => {
    const s = await siparisAc([{ malzemeNo: urunNo, miktar: 2, fiyat: 10 }]);
    const termin = (await o().sahip.tek<{ t: string }>("SELECT to_char(termin, 'YYYY-MM-DD') AS t FROM siparisler_siparis WHERE id = $1", [s.id]))!.t;
    const e = await emirAc(s.satirlar[0]!, 2);
    const ie = (await o().vt.tx((db) => emirlerinIsEmriIdleri(db, [e]))).get(e)![0]!;
    const m = await makineKur();
    const bitis = (gun: number) => new Date(Date.parse(`${termin}T09:00:00Z`) + gun * 86_400_000).toISOString();
    await o().sahip.sorgu('INSERT INTO plan_yerlesimi (is_emri_id, makine_id, baslangic, bitis, yazan_kisi_id) VALUES ($1, $2, $3::timestamptz - interval \'1 hour\', $3, $4)', [ie, m, bitis(4), yoneticiId]);
    let a = await akis('mudur', s.id);
    assert.deepEqual([a.kalemler[0]?.terminRiski, a.terminRiski], [4, 4]);
    const l = await istek<{ asamalar: { terminRiski: number | null }[] }>('mudur', 'GET', `/akis/siparis-asamalari?idler=${String(s.id)}`);
    assert.equal(l.govde.asamalar[0]?.terminRiski, 4);
    assert.deepEqual(await o().vt.tx((db) => siparisTerminRiskleri(db, [s.id, 999999])), [{ siparisId: s.id, termin, gun: 4 }]);

    await o().sahip.sorgu('UPDATE plan_yerlesimi SET baslangic = $2::timestamptz - interval \'1 hour\', bitis = $2 WHERE is_emri_id = $1', [ie, bitis(0)]);
    a = await akis('mudur', s.id);
    assert.deepEqual([a.kalemler[0]?.terminRiski, a.terminRiski], [null, null], 'termin günü içinde biten plan risk değil');
    assert.deepEqual(await o().vt.tx((db) => siparisTerminRiskleri(db, [s.id])), []);
  });

  test('SPA-U1: akış ve aşama listesi siparişi okuyana açık, okumayana 403; olmayan sipariş 404, listede atlanır', async () => {
    const s = await siparisAc([{ malzemeNo: urunNo, miktar: 1, fiyat: 1 }]);
    assert.equal((await istek('cam', 'GET', `/akis/siparisler/${String(s.id)}`)).durum, 403);
    assert.equal((await istek('cam', 'GET', `/akis/siparis-asamalari?idler=${String(s.id)}`)).durum, 403);
    assert.equal((await istek('mudur', 'GET', '/akis/siparisler/999999')).durum, 404);
    const l = await istek('mudur', 'GET', `/akis/siparis-asamalari?idler=${String(s.id)},999999`);
    assert.equal(l.durum, 200, JSON.stringify(l.govde));
    assert.deepEqual(siparisAsamalariCevabi.parse(l.govde).asamalar, [{ siparisId: s.id, asama: 'emir-bekliyor', terminRiski: null }]);
    assert.equal((await istek('mudur', 'GET', '/akis/siparis-asamalari?idler=abc')).durum, 400);
  });
});
