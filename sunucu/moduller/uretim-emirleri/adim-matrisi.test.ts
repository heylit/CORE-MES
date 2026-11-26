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
import { HAZIRLIK_MADDELERI, adimDurumuCevabi, adimMatrisiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { AdimDurumuCevabi, AdimMatrisiCevabi, HazirlikMaddesi, StatuTopluCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { hazirlikCozucusuKaydet } from './hazirlik.ts';
import type { HazirlikBilgisi } from './kurallar.ts';
import type { HazirlikCozucusu } from './hazirlik.ts';
import { ADIM_BITTI_STATU } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string }

// 3604: Adım Durumu matrisi okuması ve toplu elle statü yazımı (kalem başına karar, bayat kalem, defter, denetim).
describe('uretim-emirleri adım durumu matrisi (3604, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let sayac = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = (ad: string): Kullanici => {
    const k = kullanicilar.get(ad);
    if (k === undefined) throw new Error(`kişi yok: ${ad}`);
    return k;
  };
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
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`ADM${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`ADI${sayac}`, `Deneme ${sayac}`, im?.id]);
    if (!ist) throw new Error('istasyon kurulamadı');
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi ON CONFLICT DO NOTHING', [ist.id]);
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`ADMK${sayac}`, 'Tezgah', ist.id]);
    if (!m) throw new Error('makine kurulamadı');
    return m.id;
  }
  const adim = (sira: number, makineId: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const ac = async (): Promise<{ id: number; ie: number[] }> => {
    const m = await makineKur();
    const r = await o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
      malzemeNo: urunNo, adet: 4, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: [adim(1, m), adim(2, m)], projeId,
    }));
    return { id: r.uretimEmriId, ie: r.isEmriIdleri };
  };
  const oku = async (id: number, kisi = 'planlama_proje'): Promise<AdimDurumuCevabi> => {
    const c = await istek<AdimDurumuCevabi>(kisi, 'GET', `/adimli-emirler/${id}/adim-durumu`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return adimDurumuCevabi.parse(c.govde);
  };
  const baslat = async (id: number, isEmriId: number): Promise<Cevap<Hata>> => {
    try {
      await o().vt.tx((db) => emirBaslat(db, kim('operator'), id, undefined, undefined, isEmriId));
      return { durum: 200, govde: { kod: '', mesaj: '' } };
    } catch (h) {
      if (h instanceof UygulamaHatasi) return { durum: h.durum, govde: h.govde() as Hata };
      throw h;
    }
  };

  // Kayıtlı gerçek çözücüler (yayın, rota, makine...) test boyunca kaldırılır: her test yalnız kendi koyduğu maddeyi görür.
  const gercekCozuculer = new Map<HazirlikMaddesi, HazirlikCozucusu | null>();
  before(async () => {
    for (const m of HAZIRLIK_MADDELERI) gercekCozuculer.set(m, hazirlikCozucusuKaydet(m, null));
    ortam = await testVeritabaniKur('uretim_adim_matrisi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.ADIM', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const r of ['planlama_proje', 'operator', 'kalite', 'mudur']) await kisiEkle(r, r);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('AD-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('AD-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ad-dnm-1', 'mamul', 'AD-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'ad-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => {
    for (const [m, c] of gercekCozuculer) hazirlikCozucusuKaydet(m, c);
    await ortam?.kaldir();
  });


  const matris = async (kisi = 'planlama_proje', biten = false): Promise<AdimMatrisiCevabi> => {
    const c = await istek<AdimMatrisiCevabi>(kisi, 'GET', `/adimli-emirler/adim-matrisi${biten ? '?biten=1' : ''}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return adimMatrisiCevabi.parse(c.govde);
  };
  const toplu = (govde: unknown, kisi = 'planlama_proje') => istek<StatuTopluCevabi & Hata>(kisi, 'POST', '/adimli-emirler/statu-toplu', govde);
  const kalem = (emirId: number, isEmriId: number, sistemStatusu: string, statu: string | null = 'talep', not: string | null = null) =>
    ({ emirId, isEmriId, statu, not, sistemStatusu });
  const sonuclar = (c: Cevap<StatuTopluCevabi & Hata>): string[] => c.govde.kalemler.map((k) => k.sonuc);
  const defterSayisi = async (ie: readonly number[]): Promise<number> =>
    (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emirleri_adim_statusu WHERE is_emri_id = ANY($1::int[])', [[...ie]]))?.n ?? 0;

  test('matris okuması: açık emirlerin adımları, yetki ve elle statü; operatör okumaz', async () => {
    const { id, ie } = await ac();
    const m = await matris();
    const e = m.emirler.find((x) => x.emirId === id);
    assert.ok(e, 'açık emir matriste');
    assert.deepEqual(e.adimlar.map((a) => [a.opNo, a.sistemStatusu, a.elle]), [[10, 'baslayabilir', null], [20, 'onceki', null]]);
    assert.equal(m.yazabilir, true);
    assert.equal((await matris('kalite')).yazabilir, false, 'kalite okur, yazamaz');
    assert.equal((await istek('operator', 'GET', '/adimli-emirler/adim-matrisi')).durum, 403);
    assert.equal(ie.length, 2);
    const y = await toplu({ kalemler: [kalem(id, ie[0] ?? 0, 'baslayabilir', 'cizim', 'Revizyon bekleniyor')] });
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    const sonra = (await matris()).emirler.find((x) => x.emirId === id)?.adimlar[0]?.elle;
    assert.deepEqual([sonra?.statu, sonra?.not, sonra?.kisiAdi], ['cizim', 'Revizyon bekleniyor', 'Deneme planlama_proje']);
    // Tek adım ucunun görüşüyle aynı: Emir görünümü matristeki elle statüyü görür.
    assert.equal((await oku(id)).adimlar[0]?.elle?.statu, 'cizim');
  });

  test('toplu yazım: yetki, doğrulama sınırları ve kalem başına defter satırı', async () => {
    const a = await ac();
    const b = await ac();
    const kalemler = [kalem(a.id, a.ie[0] ?? 0, 'baslayabilir'), kalem(a.id, a.ie[1] ?? 0, 'onceki'), kalem(b.id, b.ie[0] ?? 0, 'baslayabilir', 'malzeme', 'Gelmedi')];
    for (const kisi of ['operator', 'kalite']) assert.equal((await toplu({ kalemler }, kisi)).durum, 403, `${kisi} yazmaz`);
    assert.equal((await toplu({ kalemler: [] })).durum, 400, 'boş seçim');
    assert.equal((await toplu({ kalemler: Array.from({ length: 101 }, () => kalem(a.id, a.ie[0] ?? 0, 'baslayabilir')) })).durum, 400, '100 üstü reddedilir');
    assert.equal((await toplu({ kalemler: [kalem(a.id, a.ie[0] ?? 0, 'baslayabilir', 'bitti')] })).durum, 400, 'elle yazılmayan statü');
    assert.equal((await toplu({ kalemler: [{ ...kalem(a.id, a.ie[0] ?? 0, 'baslayabilir'), fazla: 1 }] })).durum, 400, 'bilinmeyen alan');
    assert.equal(await defterSayisi([...a.ie, ...b.ie]), 0, 'reddedilen istek defter yazmaz');
    const c = await toplu({ kalemler }, 'mudur');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(sonuclar(c), ['yazildi', 'yazildi', 'yazildi']);
    assert.equal(await defterSayisi([...a.ie, ...b.ie]), 3, 'kalem başına bir defter satırı');
    const satir = await o().sahip.tek<{ kisi: string; statu: string; sistem: string; aciklama: string | null }>(
      `SELECT k.ad AS kisi, s.statu, s.sistem_statusu AS sistem, s.aciklama FROM uretim_emirleri_adim_statusu s JOIN kisi k ON k.id = s.kisi_id WHERE s.is_emri_id = $1`, [b.ie[0] ?? 0]);
    assert.deepEqual(satir, { kisi: 'Deneme mudur', statu: 'malzeme', sistem: 'baslayabilir', aciklama: 'Gelmedi' });
  });

  test('genel denetim kaydı toplu çağrıyı tek satırda tutar; kalem sonuçları ek satırdadır', async () => {
    const a = await ac();
    const once = (await o().sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM denetim_kaydi WHERE yol = '/adimli-emirler/statu-toplu'"))?.n ?? 0;
    const c = await toplu({ kalemler: [kalem(a.id, a.ie[0] ?? 0, 'baslayabilir'), kalem(a.id, a.ie[1] ?? 0, 'baslayabilir')] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const satirlar = await o().sahip.sorgu<{ govde: { kalemler?: unknown[]; _ek?: unknown } }>(
      "SELECT govde FROM denetim_kaydi WHERE yol = '/adimli-emirler/statu-toplu' ORDER BY id");
    assert.equal(satirlar.length, once + 1, 'çağrı başına tek satır');
    const son = satirlar.at(-1)?.govde;
    assert.equal(son?.kalemler?.length, 2, 'gövdedeki kalemler denetimde');
    assert.ok(son?._ek, 'kalem sonuçları ek satır olarak');
  });

  test('bayat kalem yalnız kendisi düşer ("eski"); ötekiler yazılır; yeniden denemede yazılır', async () => {
    const a = await ac();
    const c = await toplu({ kalemler: [kalem(a.id, a.ie[0] ?? 0, 'program'), kalem(a.id, a.ie[1] ?? 0, 'onceki')] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(sonuclar(c), ['eski', 'yazildi']);
    assert.equal(await defterSayisi(a.ie), 1);
    const yeniden = await toplu({ kalemler: [kalem(a.id, a.ie[0] ?? 0, 'baslayabilir')] });
    assert.deepEqual(sonuclar(yeniden), ['yazildi']);
  });

  test('beklemedeki emir ve olmayan iş emri: atlanır ya da reddedilir, ötekiler yazılır', async () => {
    const a = await ac();
    const b = await ac();
    assert.equal((await istek('planlama_proje', 'POST', `/uretim-emirleri/${b.id}/beklet`, { neden: 'malzeme', not: 'Deneme notu' })).durum, 200);
    const c = await toplu({ kalemler: [
      kalem(a.id, a.ie[0] ?? 0, 'baslayabilir'), kalem(b.id, b.ie[0] ?? 0, 'beklemede'), kalem(a.id, b.ie[1] ?? 0, 'baslayabilir'), kalem(2_000_000_000, 1, 'baslayabilir'),
    ] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(sonuclar(c), ['yazildi', 'atlandi', 'ret', 'ret']);
    assert.match(c.govde.kalemler[1]?.neden ?? '', /beklemede/);
  });

  test('çalışan adım toplu atlanır, tek hücre uyarısıyla (calisanOnay) yazılır; biten adım yazılmaz ama otomatiğe dönebilir', async () => {
    const a = await ac();
    const [ie1 = 0, ie2 = 0] = a.ie;
    assert.equal((await baslat(a.id, ie1)).durum, 200);
    const calisan = (await matris()).emirler.find((x) => x.emirId === a.id)?.adimlar[0]?.sistemStatusu;
    assert.ok(calisan === 'uretimde' || calisan === 'duraklatildi' || calisan === 'durdu', String(calisan));
    const atla = await toplu({ kalemler: [kalem(a.id, ie1, calisan ?? 'uretimde'), kalem(a.id, ie2, 'onceki')] });
    assert.deepEqual(sonuclar(atla), ['atlandi', 'yazildi']);
    assert.match(atla.govde.kalemler[0]?.neden ?? '', /çalışıyor/);
    const tek = await toplu({ kalemler: [kalem(a.id, ie1, calisan ?? 'uretimde', 'makine')], calisanOnay: true });
    assert.deepEqual(sonuclar(tek), ['yazildi']);
    // Adımı bitir: elle statü hiç düşmezdi, bu yüzden yeni yazım reddedilir (tek ve toplu yol); mevcut olanı otomatiğe dön kaldırır.
    await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', bitis = now(), saglam_adet = 4 WHERE id = $1", [ie1]);
    assert.equal((await matris()).emirler.find((x) => x.emirId === a.id)?.adimlar[0]?.sistemStatusu, 'bitti');
    assert.deepEqual(sonuclar(await toplu({ kalemler: [kalem(a.id, ie1, 'bitti', 'cizim')] })), ['atlandi']);
    const tekYol = await istek<Hata>('planlama_proje', 'POST', `/adimli-emirler/${a.id}/is-emirleri/${ie1}/statu-yaz`, { statu: 'cizim', not: null, sistemStatusu: 'bitti' });
    assert.deepEqual([tekYol.durum, tekYol.govde.mesaj], [409, ADIM_BITTI_STATU]);
    const don = await toplu({ kalemler: [kalem(a.id, ie1, 'bitti', null)] });
    assert.deepEqual(sonuclar(don), ['atlandi'], 'çalışırken yazılan elle statü bitişte zaten düştü: kaldırılacak bir şey yok');
  });

  test('otomatiğe dön: elle statüsü olan kalem kalkar, olmayan atlanır', async () => {
    const a = await ac();
    assert.deepEqual(sonuclar(await toplu({ kalemler: [kalem(a.id, a.ie[0] ?? 0, 'baslayabilir', 'talep')] })), ['yazildi']);
    const c = await toplu({ kalemler: [kalem(a.id, a.ie[0] ?? 0, 'baslayabilir', null), kalem(a.id, a.ie[1] ?? 0, 'onceki', null)] });
    assert.deepEqual(sonuclar(c), ['kaldirildi', 'atlandi']);
    assert.equal((await matris()).emirler.find((x) => x.emirId === a.id)?.adimlar[0]?.elle, null);
    assert.equal(await defterSayisi(a.ie), 2, 'yazma ve kaldırma ayrı satır, silinmez');
  });

  test('biten emir matriste yalnız "biten" isteğinde gelir ve toplu yazımda atlanır', async () => {
    const a = await ac();
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'bitti', baslama = now(), bitis = now(), saglam_adet = 4 WHERE id = $1", [a.id]);
    assert.equal((await matris()).emirler.some((x) => x.emirId === a.id), false);
    const m = (await matris('planlama_proje', true)).emirler.find((x) => x.emirId === a.id);
    assert.equal(m?.durum, 'bitti');
    const c = await toplu({ kalemler: [kalem(a.id, a.ie[0] ?? 0, m?.adimlar[0]?.sistemStatusu ?? 'baslayabilir')] });
    assert.deepEqual(sonuclar(c), ['atlandi']);
    assert.match(c.govde.kalemler[0]?.neden ?? '', /bitti/);
  });

  test('3738: matris okuması adım başına hazırlık maddelerini ve elle değeri verir; Adım Durumu okumasıyla aynıdır', async () => {
    const { id, ie } = await ac();
    const [ie1 = 0] = ie;
    const durumlar = new Map<HazirlikMaddesi, HazirlikBilgisi>([
      ['cnc', { durum: 'tamam', secildi: true, surum: 'P1' }], ['cizim', { durum: 'tamam', secildi: true, surum: '7@a' }],
      ['malzeme', { durum: 'yok', secildi: true }],
    ]);
    // Emir düzeyindeki madde (çizim) emir kimliğiyle, iş emri düzeyindeki (CNC, malzeme) ilk iş emriyle sorulur.
    const cozucu = (m: HazirlikMaddesi): HazirlikCozucusu => async (_db, idler) =>
      new Map(idler.filter((x) => x === (m === 'cizim' ? id : ie1)).map((x) => [x, durumlar.get(m)!]));
    const onceki = (['cnc', 'cizim', 'malzeme'] as const).map((m) => [m, hazirlikCozucusuKaydet(m, cozucu(m))] as const);
    try {
      const ilk = (await matris()).emirler.find((x) => x.emirId === id)?.adimlar[0];
      const maddeler = (a: typeof ilk) => a?.maddeler.filter((x) => ['cnc', 'cizim', 'malzeme'].includes(x.madde)).map((x) => [x.madde, x.hal, x.ham, x.elle]);
      assert.equal(ilk?.maddeler.length, HAZIRLIK_MADDELERI.length, 'her adımda bütün maddeler (hâl: gerekmez dahil)');
      assert.deepEqual(maddeler(ilk), [['cnc', 'tamam', 'tamam', null], ['cizim', 'tamam', 'tamam', null], ['malzeme', 'eksik', 'eksik', null]]);
      // Elle "hazır değil" (durduran madde) ve elle onay (uyaran madde); matris elle değeri kişi, gerekçe ve türle verir.
      const eksikYaz = await istek('planlama_proje', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie1}/hazirlik-elle-eksik`, { madde: 'cizim', gerekce: 'Revizyon sorgusu bekliyor', sistemHali: 'tamam' });
      assert.equal(eksikYaz.durum, 200, JSON.stringify(eksikYaz.govde));
      const onayYaz = await istek('mudur', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie1}/hazirlik-onayla`, { madde: 'malzeme', gerekce: null, sistemHali: 'eksik' });
      assert.equal(onayYaz.durum, 200, JSON.stringify(onayYaz.govde));
      const sonra = (await matris()).emirler.find((x) => x.emirId === id)?.adimlar;
      const [a1, a2] = sonra ?? [];
      assert.deepEqual(a1?.maddeler.find((x) => x.madde === 'cizim'), {
        madde: 'cizim', hal: 'eksik', ham: 'tamam', elle: { tur: 'eksik', gerekce: 'Revizyon sorgusu bekliyor', kisiAdi: 'Deneme planlama_proje', zaman: a1?.maddeler.find((x) => x.madde === 'cizim')?.elle?.zaman },
      });
      const malzeme = a1?.maddeler.find((x) => x.madde === 'malzeme');
      assert.deepEqual([malzeme?.hal, malzeme?.ham, malzeme?.elle?.tur, malzeme?.elle?.gerekce, malzeme?.elle?.kisiAdi], ['muaf', 'eksik', 'hazir', null, 'Deneme mudur']);
      assert.deepEqual(a2?.maddeler.map((x) => x.elle), a2?.maddeler.map(() => null), 'öteki adımın maddelerinde elle değer yok');
      // Adım Durumu okumasıyla aynı hâl, ham ve elle kümesi (matris tek toplu okumadır, hesap aynı).
      const d = await oku(id);
      for (const [i, a] of (sonra ?? []).entries()) {
        assert.deepEqual(a.maddeler.map((x) => [x.madde, x.hal, x.ham]), (d.adimlar[i]?.maddeler ?? []).map((x) => [x.madde, x.hal, x.ham]));
        assert.deepEqual(a.maddeler.filter((x) => x.elle !== null).map((x) => x.madde).sort(),
          [...(d.adimlar[i]?.onaylar ?? []), ...(d.adimlar[i]?.elleEksikler ?? [])].map((x) => x.madde).sort());
      }
      // Elle değer kaldırılınca matris de otomatiğe döner.
      assert.equal((await istek('planlama_proje', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie1}/hazirlik-onay-kaldir`, { madde: 'cizim' })).durum, 200);
      assert.equal((await matris()).emirler.find((x) => x.emirId === id)?.adimlar[0]?.maddeler.find((x) => x.madde === 'cizim')?.elle, null);
    } finally {
      for (const [m, c] of onceki) hazirlikCozucusuKaydet(m, c);
    }
  });

  test('50 emirlik matris okuması ve 100 kalemlik toplu yazım (süre ölçümü)', async () => {
    const hepsi: { id: number; ie: number[] }[] = [];
    for (let i = 0; i < 50; i += 1) hepsi.push(await ac());
    let t0 = Date.now();
    const m = await matris();
    const okuma = Date.now() - t0;
    assert.ok(m.emirler.length >= 50);
    const kalemler = hepsi.flatMap((x) => x.ie.map((ie) => kalem(x.id, ie, ie === x.ie[0] ? 'baslayabilir' : 'onceki', 'siparis'))).slice(0, 100);
    t0 = Date.now();
    const c = await toplu({ kalemler });
    const yazma = Date.now() - t0;
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.kalemler.filter((k) => k.sonuc === 'yazildi').length, 100);
    process.stderr.write(`3604 olcum: matris okuma ${m.emirler.length} emir ${okuma} ms; toplu yazim 100 kalem ${yazma} ms\n`);
  });
});
