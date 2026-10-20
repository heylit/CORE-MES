import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { emirAkisiCevabi, emirListesiCevabi } from '#paylasilan/sozlesme/akis.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { fasonDonusuKaydet, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// Kart #1338: emir yolculuğu kaynak modüllerin gerçek kayıtlarından kurulur; uç yalnız sayfa işlemiyle okunur.
describe('akis emir yolculuğu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();
  let tipId = 0;
  let urunNo = 0;
  let projeId = 0;
  let revizyonId = 0;
  let sayac = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '' };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    cerezler.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
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
    await giris(kullaniciAdi);
  }

  async function makineKur(): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`AKM${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`AKI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]);
    // UE20: iş başlatan test kişileri bu istasyonda yetkindir.
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist?.id]);
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`AKK${sayac}`, 'Tezgah', ist?.id]);
    if (!m) throw new Error('makine kurulamadı');
    return m.id;
  }

  const adim = (sira: number, kaynak: IsEmriGirdisi['kaynak']): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak,
    ayarSuresiDk: kaynak?.tur === 'fason' ? null : '10', birimSureDk: kaynak?.tur === 'fason' ? null : '1',
    terminGun: kaynak?.tur === 'fason' ? 5 : null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const terminal = (id: number, yol: string, govde?: unknown) => istek<{ mesaj?: string }>('operator', 'POST', `/uretim-emirleri/${id}/${yol}`, govde);
  const fason = (id: number, isEmriId: number, yol: string, govde?: unknown) =>
    istek<{ mesaj?: string }>('depo', 'POST', `/adimli-emirler/${id}/is-emirleri/${isEmriId}/${yol}`, govde);

  before(async () => {
    ortam = await testVeritabaniKur('akis');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator'], ['depo', 'depo']] as const) await kisiEkle(ad, rol);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('AK-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('AK-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ak-dnm-1', 'mamul', 'AK-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'ak-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('AKIS.1', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    // Emrin kaynak revizyonu gerçek bir satırdır; iptal durumu açık ve yürürlükteki revizyonların tekil dizinine girmez.
    revizyonId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  async function fasonluEmir(): Promise<{ id: number; isEmriIdleri: number[] }> {
    const firmaId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fason', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    const m1 = await makineKur();
    const m3 = await makineKur();
    return o().vt.tx(async (db) => {
      const e = await uretimEmriAc(db, kullanicilar.get('planlama_proje')!, {
        malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revizyonId, projeId,
        isEmirleri: [adim(1, { tur: 'makine', id: m1 }), adim(2, { tur: 'fason', id: firmaId }), adim(3, { tur: 'makine', id: m3 })],
      });
      return { id: e.uretimEmriId, isEmriIdleri: e.isEmriIdleri };
    });
  }

  test('AKS-U1: sayfa işlemi olmayan okuyamaz (403); yönetici ve planlama okur; olmayan emir 404', async () => {
    const { id } = await fasonluEmir();
    assert.equal((await istek('operator', 'GET', `/akis/emirler/${id}`)).durum, 403);
    assert.equal((await istek('operator', 'GET', '/akis/emirler')).durum, 403);
    const liste = await istek('yonetici', 'GET', '/akis/emirler');
    assert.equal(liste.durum, 200, JSON.stringify(liste.govde));
    assert.ok(emirListesiCevabi.parse(liste.govde).emirler.some((e) => e.id === id));
    assert.equal((await istek('planlama_proje', 'GET', `/akis/emirler/${id}`)).durum, 200, 'rol göçü sayfa.akis verir');
    assert.equal((await istek('yonetici', 'GET', '/akis/emirler/2147483647')).durum, 404);
  });

  test('AKS-U2: emir yolculuğu adımların, fasonun ve sevke hazırın gerçek kayıtlarından kurulur', async () => {
    const { id, isEmriIdleri } = await fasonluEmir();
    const bas = await istek('yonetici', 'GET', `/akis/emirler/${id}`);
    assert.equal(bas.durum, 200, JSON.stringify(bas.govde));
    const once = emirAkisiCevabi.parse(bas.govde);
    assert.equal(once.damgalar.uretimBasladi, null, 'başlamamış emirde damga yok');
    assert.deepEqual(once.olculer.uretimAkis, { dk: null, acik: false });

    assert.equal((await terminal(id, 'baslat')).durum, 200);
    assert.equal((await terminal(id, 'sayim', { tur: 'saglam', adet: 10 })).durum, 200);
    assert.equal((await terminal(id, 'bitir', {})).durum, 200);
    const g = await fason(id, isEmriIdleri[1]!, 'fason-gidis', { adet: 10 });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    // Fason dönüşü mal kabulden girer; mal kabulün çağırdığı kayıt doğrudan çağrılır.
    await o().vt.tx((db) => fasonDonusuKaydet(db, yoneticiId, id, isEmriIdleri[1]!, 10, 0));

    const c = await istek('yonetici', 'GET', `/akis/emirler/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const a = emirAkisiCevabi.parse(c.govde);
    assert.ok(a.damgalar.uretimBasladi, 'ilk adımın başlaması damgalanır');
    assert.deepEqual(a.seritler.filter((s) => s.tur === 'adim').map((s) => s.baslik), ['OP10', 'OP20', 'OP30']);
    const [op10, op20, op30] = a.adimlar;
    assert.equal(op10?.saglamAdet, 10);
    assert.notEqual(op10?.islemeDk, null);
    assert.equal(op20?.fason, true);
    assert.notEqual(op20?.fasonDk, null, 'fason gidiş-dönüş süresi ölçülür');
    assert.equal(op30?.islemeDk, null, 'başlamamış adımın işlemesi yok');
    assert.equal(a.olculer.uretimAkis.acik, true, 'son adım bitmedi, akış sürüyor');
  });
});
