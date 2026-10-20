import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { gecersiz } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { bekleyenBolCevabi, bekleyenlerCevabi, isCevabi } from '#paylasilan/sozlesme/sevkiyat.ts';
import type { Bekleyen, Is } from '#paylasilan/sozlesme/sevkiyat.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirlerinSevkDurumu, emirlerinSevkleri, sevkIsiOzeti, siparisinSevkleri, urunSevkiDinle } from './disari.ts';
import type { UrunSevkiOlayi } from './disari.ts';
import * as servis from './servis.ts';
import { izgaraKaynagi } from './test-agi.ts';
import { fasonDonusuKaydet, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// Kart #1310: biten emrin ürünü bekleme listesine düşer; fasona gönderim firmanın noktasına teslimat işi açar, noktası yoksa listede bekler.
describe('sevkiyat bekleme listesi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();
  let tipId = 0;
  let urunNo = 0;
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
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`SBM${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`SBI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]);
    // UE20: iş başlatan test kişileri bu istasyonda yetkindir.
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist?.id]);
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`SBK${sayac}`, 'Tezgah', ist?.id]);
    if (!m) throw new Error('makine kurulamadı');
    return m.id;
  }
  async function fasonFirmaKur(noktali: boolean): Promise<{ firmaId: number; noktaId: number | null }> {
    sayac += 1;
    const firmaId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ($1, 'tedarikci', $2, true) RETURNING id", [`Deneme Fason ${sayac}`, yoneticiId]))!.id;
    if (!noktali) return { firmaId, noktaId: null };
    const nokta = await o().sahip.tek<{ id: number }>(
      "INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, firma_id) VALUES ($1, 'fason', 40.1, 29.1, $2) RETURNING id", [`Fason Noktası ${sayac}`, firmaId]);
    return { firmaId, noktaId: nokta!.id };
  }

  const adim = (sira: number, kaynak: IsEmriGirdisi['kaynak']): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak,
    ayarSuresiDk: kaynak?.tur === 'fason' ? null : '10', birimSureDk: kaynak?.tur === 'fason' ? null : '1',
    terminGun: kaynak?.tur === 'fason' ? 5 : null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const kullanici = (ad: string): Kullanici => kullanicilar.get(ad)!;
  const terminal = (id: number, yol: string, govde?: unknown) => istek<{ mesaj?: string }>('operator', 'POST', `/uretim-emirleri/${id}/${yol}`, govde);
  const fason = (id: number, isEmriId: number, yol: string, govde?: unknown) =>
    istek<{ hareketId: number; mesaj?: string }>('depo', 'POST', `/adimli-emirler/${id}/is-emirleri/${isEmriId}/${yol}`, govde);
  // Fason dönüşü mal kabulden girer; mal kabulün çağırdığı kayıt doğrudan çağrılır.
  const donus = (id: number, isEmriId: number, saglam: number, hurda: number) => o().vt.tx((db) => fasonDonusuKaydet(db, yoneticiId, id, isEmriId, saglam, hurda));
  const bekleyenler = async (): Promise<Bekleyen[]> => {
    const c = await istek<{ bekleyenler: Bekleyen[] }>('planlama_proje', 'GET', '/sevkiyat/bekleyenler');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return bekleyenlerCevabi.parse(c.govde).bekleyenler;
  };
  const isGovdesi = (tarih: string, birakisNoktasiId: number) => ({
    tarih, tur: 'teslimat', alisNoktasiId: null, birakisNoktasiId, agirlikKilogram: 120, paletSayisi: 2, durakSuresiDakika: null,
    alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null, belgeNo: null, aciklama: null, sabitAracId: null,
  });

  before(async () => {
    ortam = await testVeritabaniKur('sevkiyat_bekleyen');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('SEVK.BEKLEYEN', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator'], ['depo', 'depo']] as const) await kisiEkle(ad, rol);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('SB-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SB-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('sb-dnm-1', 'mamul', 'SB-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'sb-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
    // İptal durumu, malzemenin yürürlükteki revizyonuna dair tekil dizinle çakışmaz.
    revizyonId = (await ortam.sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id`, [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  async function fasonluEmir(firmaId: number) {
    const m1 = await makineKur();
    const m3 = await makineKur();
    const { uretimEmriId: id, isEmriIdleri } = await o().vt.tx((db) => uretimEmriAc(db, kullanici('planlama_proje'), {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revizyonId,
      isEmirleri: [adim(1, { tur: 'makine', id: m1 }), adim(2, { tur: 'fason', id: firmaId }), adim(3, { tur: 'makine', id: m3 })],
    }));
    assert.equal((await terminal(id, 'baslat')).durum, 200);
    assert.equal((await terminal(id, 'sayim', { tur: 'saglam', adet: 9 })).durum, 200);
    assert.equal((await terminal(id, 'bitir', {})).durum, 200);
    return { id, fasonIsEmriId: isEmriIdleri[1]! };
  }

  test('fasona gönderim: noktalı firmaya teslimat işi açılır; noktasız firmada gönderim kabul edilir, kayıt listede bekler', async () => {
    const noktali = await fasonFirmaKur(true);
    const e = await fasonluEmir(noktali.firmaId);
    const g = await fason(e.id, e.fasonIsEmriId, 'fason-gidis', { adet: 5 });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    const kayit = await o().sahip.tek<{ isId: number | null; adet: string }>(
      'SELECT is_id AS "isId", adet::text AS adet FROM sevkiyat_bekleyen WHERE fason_hareket_id = $1', [g.govde.hareketId]);
    assert.ok(kayit?.isId, 'gönderim işe bağlanır');
    const is = await o().sahip.tek<{ tur: string; birakis: number; palet: number; durum: string; bugun: boolean }>(
      `SELECT tur, birakis_noktasi_id AS birakis, palet_sayisi AS palet, durum, tarih = current_date AS bugun FROM sevkiyat_isi WHERE id = $1`, [kayit.isId]);
    assert.deepEqual(is, { tur: 'teslimat', birakis: noktali.noktaId, palet: 1, durum: 'havuzda', bugun: true });
    assert.equal((await bekleyenler()).some((b) => b.kaynak === 'fason'), false, 'işe bağlanan gönderim listede görünmez');

    // Dönüş iş açmaz.
    const isSayisi = async () => (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM sevkiyat_isi'))!.n;
    const once = await isSayisi();
    await donus(e.id, e.fasonIsEmriId, 5, 0);
    assert.equal(await isSayisi(), once);

    const noktasiz = await fasonFirmaKur(false);
    const e2 = await fasonluEmir(noktasiz.firmaId);
    assert.equal((await fason(e2.id, e2.fasonIsEmriId, 'fason-gidis', { adet: 3 })).durum, 200, 'noktası yok diye gönderim reddedilmez');
    const bekleyen = (await bekleyenler()).find((b) => b.kaynak === 'fason' && b.uretimEmriId === e2.id);
    assert.deepEqual(bekleyen && [bekleyen.firmaId, bekleyen.noktaId, bekleyen.adet, bekleyen.malzemeNo], [noktasiz.firmaId, null, '3.0000', urunNo]);
  });

  test('biten emir: ürün listeye bir kez düşer; işe çevrilir ya da kaldırılır; yetkisiz kişi çeviremez, kapalı kayıt ikinci kez çevrilmez', async () => {
    const f = await fasonFirmaKur(true);
    const e = await fasonluEmir(f.firmaId);
    assert.equal((await fason(e.id, e.fasonIsEmriId, 'fason-gidis', { adet: 9 })).durum, 200);
    await donus(e.id, e.fasonIsEmriId, 8, 1);
    assert.equal((await fason(e.id, e.fasonIsEmriId, 'fason-tamamla')).durum, 200);
    assert.equal((await bekleyenler()).some((b) => b.kaynak === 'urun' && b.uretimEmriId === e.id), false, 'emir bitmeden düşmez');
    assert.equal((await terminal(e.id, 'baslat')).durum, 200);
    assert.equal((await terminal(e.id, 'bitir', { saglamAdet: 7 })).durum, 200);
    const urunler = (await bekleyenler()).filter((b) => b.kaynak === 'urun' && b.uretimEmriId === e.id);
    assert.equal(urunler.length, 1);
    const b = urunler[0]!;
    assert.deepEqual([b.adet, b.malzemeNo, b.malzemeAd, b.firmaId], ['7.0000', urunNo, 'Deneme mamul', null]);
    assert.ok(b.emirNo, 'emir numarası okunur');

    const musteri = await o().sahip.tek<{ id: number }>("INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam) VALUES ('Deneme Müşteri', 'musteri', 40.2, 29.2) RETURNING id");
    const tarih = (await o().sahip.tek<{ g: string }>("SELECT to_char(current_date + 1, 'YYYY-MM-DD') AS g"))!.g;
    assert.equal((await istek('operator', 'POST', `/sevkiyat/bekleyenler/${b.id}/ise-cevir`, isGovdesi(tarih, musteri!.id))).durum, 403);
    assert.equal((await istek('operator', 'POST', `/sevkiyat/bekleyenler/${b.id}/kaldir`)).durum, 403);
    const c = await istek<{ is: Is }>('depo', 'POST', `/sevkiyat/bekleyenler/${b.id}/ise-cevir`, isGovdesi(tarih, musteri!.id));
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const is = isCevabi.parse(c.govde).is;
    assert.deepEqual([is.tarih, is.birakisNoktasiId, is.paletSayisi, is.durum], [tarih, musteri!.id, 2, 'havuzda']);
    assert.equal((await bekleyenler()).some((x) => x.id === b.id), false, 'işe çevrilen listeden düşer');
    assert.equal((await istek('depo', 'POST', `/sevkiyat/bekleyenler/${b.id}/ise-cevir`, isGovdesi(tarih, musteri!.id))).durum, 409);
    assert.equal((await istek('depo', 'POST', `/sevkiyat/bekleyenler/${b.id}/kaldir`)).durum, 409);

    // Akış Süresi okuması (kart #1338): işe çevrilen emir işin durumuyla, düşmemiş emir hiç dönmez, boş dizi sorgu açmaz.
    const durumlar = await o().vt.tx((db) => emirlerinSevkDurumu(db, [e.id, e.id, 2147483647]));
    assert.deepEqual([...durumlar.keys()], [e.id]);
    const d = durumlar.get(e.id)!;
    assert.deepEqual([d.isId, d.isDurumu, d.kaldirildi, d.isIptalEdildi], [is.id, 'havuzda', null, false]);
    assert.equal(d.hazirZamani, b.hazirZamani);
    assert.ok(d.isDurumZamani);
    assert.equal((await o().vt.tx((db) => emirlerinSevkDurumu(db, []))).size, 0);

    // Kaldırma: noktasız fason kaydı listeden çıkar, kaldıran kişi yazılır.
    const noktasiz = await fasonFirmaKur(false);
    const e2 = await fasonluEmir(noktasiz.firmaId);
    assert.equal((await fason(e2.id, e2.fasonIsEmriId, 'fason-gidis', { adet: 2 })).durum, 200);
    const k = (await bekleyenler()).find((x) => x.uretimEmriId === e2.id)!;
    assert.equal((await istek('depo', 'POST', `/sevkiyat/bekleyenler/${k.id}/kaldir`)).durum, 200);
    assert.equal((await bekleyenler()).some((x) => x.id === k.id), false);
    const kaldiran = await o().sahip.tek<{ kisi: number }>('SELECT kaldiran_kisi_id AS kisi FROM sevkiyat_bekleyen WHERE id = $1', [k.id]);
    assert.equal(kaldiran?.kisi, kullanici('depo').id);
    assert.equal((await istek('depo', 'POST', '/sevkiyat/bekleyenler/2147483647/kaldir')).durum, 404);
  });

  test('E-12: ürün taşıyan işin durum değişimi emir, adet ve müşteri firmasıyla bildirilir; ürünsüz iş bildirilmez; dinleyicinin reddi komutu geri alır; emirden sevke ve müşteriye iz okunur', async () => {
    const m = await makineKur();
    const { uretimEmriId: emirId } = await o().vt.tx((db) => uretimEmriAc(db, kullanici('planlama_proje'), {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revizyonId, isEmirleri: [adim(1, { tur: 'makine', id: m })],
    }));
    assert.equal((await terminal(emirId, 'baslat')).durum, 200);
    assert.equal((await terminal(emirId, 'sayim', { tur: 'saglam', adet: 6 })).durum, 200);
    assert.equal((await terminal(emirId, 'bitir', {})).durum, 200);
    const b = (await bekleyenler()).find((x) => x.kaynak === 'urun' && x.uretimEmriId === emirId)!;
    assert.equal(b.adet, '6.0000');

    // Izgara içinde müşteri noktası (firmaya bağlı) ve fabrika: plan onayı rota hesaplar.
    const firmaId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Alıcı', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
    const musteri = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, firma_id) VALUES ('Alıcı Noktası', 'musteri', 39.95, 32.75, $1) RETURNING id", [firmaId]))!.id;
    await o().sahip.sorgu("INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam) SELECT 'E12 Fabrika', 'fabrika', 39.90, 32.70 WHERE NOT EXISTS (SELECT 1 FROM sevkiyat_noktasi WHERE tur = 'fabrika' AND aktif)");
    const aracId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO sevkiyat_araci (ad, tur, kapasite_kilogram, kapasite_palet, musait_baslangic, musait_bitis) VALUES ('E12 Araç', 'kamyonet', 1500, 4, '08:00', '18:00') RETURNING id"))!.id;
    const tarih = (await o().sahip.tek<{ g: string }>("SELECT to_char(current_date + 2, 'YYYY-MM-DD') AS g"))!.g;
    const c = await istek<{ is: Is }>('depo', 'POST', `/sevkiyat/bekleyenler/${b.id}/ise-cevir`, isGovdesi(tarih, musteri));
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const is = isCevabi.parse(c.govde).is;
    const urunsuz = await o().vt.tx((db) => servis.isEkle(db, isGovdesi(tarih, musteri) as Parameters<typeof servis.isEkle>[1]));

    const olaylar: UrunSevkiOlayi[] = [];
    const birak = urunSevkiDinle(async (_db, olay) => { olaylar.push(olay); return olay.yeni === 'yolda' ? ['Yola çıkan uyarısı'] : []; });
    const depoId = kullanici('depo').id;
    const satir = { isId: is.id, uretimEmriId: emirId, adet: '6.0000', firmaId };
    try {
      // Elle teslim ve yeniden açma.
      await o().vt.tx((db) => servis.isDurumuDegistir(db, is.id, { durum: 'tamamlandi', tarih, not: null }, depoId));
      await o().vt.tx((db) => servis.isDurumuDegistir(db, is.id, { durum: 'havuzda', tarih, not: null }, depoId));
      await o().vt.tx((db) => servis.isDurumuDegistir(db, urunsuz.id, { durum: 'tamamlandi', tarih, not: null }, depoId));
      assert.deepEqual(olaylar, [
        { satirlar: [satir], onceki: 'havuzda', yeni: 'tamamlandi', kisiId: depoId },
        { satirlar: [satir], onceki: 'tamamlandi', yeni: 'havuzda', kisiId: depoId },
      ]);

      // Plan onayı işi yola çıkarır, onayın kaldırılması planlanmışa döndürür.
      olaylar.length = 0;
      const kaynak = izgaraKaynagi();
      // Önceki testlerin ızgara dışındaki açık işleri bu günün havuzuna düşmesin.
      await o().sahip.sorgu("UPDATE sevkiyat_isi SET iptal_edildi = now() WHERE id <> $1 AND iptal_edildi IS NULL AND durum IN ('havuzda', 'planlandi')", [is.id]);
      const p = await o().vt.tx((db) => servis.kaydet(db, tarih, { amac: 'sure', surum: null, rotalar: [{ aracId, kilitli: false, ogeler: [{ isId: is.id, alis: false }] }] }, kaynak));
      assert.deepEqual(olaylar, [], 'taslak plana almak bildirilmez');
      const onayli = await o().vt.tx((db) => servis.onayla(db, tarih, p.surum!, kaynak, depoId));
      assert.deepEqual(onayli.uyarilar, ['Yola çıkan uyarısı'], 'stok uyarısı onay cevabında döner (147 b)');
      const kaldirilan = await o().vt.tx((db) => servis.onayiKaldir(db, tarih, onayli.surum!, kaynak, depoId));
      assert.equal('uyarilar' in kaldirilan, false, 'uyarı yoksa alan gönderilmez');
      assert.deepEqual(olaylar, [
        { satirlar: [satir], onceki: 'planlandi', yeni: 'yolda', kisiId: depoId },
        { satirlar: [satir], onceki: 'yolda', yeni: 'planlandi', kisiId: depoId },
      ]);

      // Dinleyici reddederse durum komutu da geri alınır.
      const reddet = urunSevkiDinle(async () => { throw new Error('stok reddetti'); });
      try {
        const son = await o().vt.tx((db) => servis.gunPlani(db, tarih, kaynak));
        await assert.rejects(o().vt.tx((db) => servis.onayla(db, tarih, son.surum!, kaynak, depoId)), /stok reddetti/);
      } finally { reddet(); }
      const durum = await o().sahip.tek<{ durum: string }>('SELECT durum FROM sevkiyat_isi WHERE id = $1', [is.id]);
      assert.equal(durum?.durum, 'planlandi');
    } finally { birak(); }

    // İleri izlenebilirlik: emirden işe ve müşteriye; sevke çıkmamış emir ve boş dizi dönmez, iptal edilen iş görünmez.
    const izler = await o().vt.tx((db) => emirlerinSevkleri(db, [emirId, emirId, 2147483647]));
    assert.deepEqual([...izler.keys()], [emirId]);
    const [iz] = izler.get(emirId)!;
    assert.deepEqual(
      [iz!.isId, iz!.tarih, iz!.durum, iz!.adet, iz!.noktaId, iz!.noktaAdi, iz!.firmaId, iz!.firmaAdi],
      [is.id, tarih, 'planlandi', '6.0000', musteri, 'Alıcı Noktası', firmaId, 'Deneme Alıcı'],
    );
    assert.ok(iz!.durumZamani);
    assert.equal((await o().vt.tx((db) => emirlerinSevkleri(db, []))).size, 0);
    await o().sahip.sorgu('UPDATE sevkiyat_isi SET iptal_edildi = now() WHERE id = $1', [is.id]);
    assert.equal((await o().vt.tx((db) => emirlerinSevkleri(db, [emirId]))).size, 0);
  });

  test('E-12, 235 a: stok sevki reddederse durum komutu ret iletisiyle döner ve iş değişmez (ekran iletiyi yazar)', async () => {
    const m = await makineKur();
    const { uretimEmriId: emirId } = await o().vt.tx((db) => uretimEmriAc(db, kullanici('planlama_proje'), {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 3, teslim: null, kaynakRotaRevizyonId: revizyonId, isEmirleri: [adim(1, { tur: 'makine', id: m })],
    }));
    assert.equal((await terminal(emirId, 'baslat')).durum, 200);
    assert.equal((await terminal(emirId, 'sayim', { tur: 'saglam', adet: 3 })).durum, 200);
    assert.equal((await terminal(emirId, 'bitir', {})).durum, 200);
    const b = (await bekleyenler()).find((x) => x.kaynak === 'urun' && x.uretimEmriId === emirId)!;
    const musteri = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam) VALUES ('Ret Noktası', 'musteri', 39.96, 32.76) RETURNING id"))!.id;
    const tarih = (await o().sahip.tek<{ g: string }>("SELECT to_char(current_date + 3, 'YYYY-MM-DD') AS g"))!.g;
    const is = isCevabi.parse((await istek('depo', 'POST', `/sevkiyat/bekleyenler/${b.id}/ise-cevir`, isGovdesi(tarih, musteri))).govde).is;

    const ILETI = 'Kalite kararı bekleyen parça sevke çıkamaz.';
    const birak = urunSevkiDinle(async () => { throw gecersiz(ILETI); });
    try {
      const c = await istek<{ kod: string; mesaj: string }>('depo', 'POST', `/sevkiyat/isler/${is.id}/durum`, { durum: 'tamamlandi', tarih, not: null });
      assert.deepEqual([c.durum, c.govde.kod, c.govde.mesaj], [422, 'GECERSIZ', ILETI]);
    } finally { birak(); }
    const sonra = await o().sahip.tek<{ durum: string }>('SELECT durum FROM sevkiyat_isi WHERE id = $1', [is.id]);
    assert.equal(sonra?.durum, 'havuzda');
  });

  test('147 b: stok uyarısı durum komutunun cevabında döner, sevk yapılır; uyarısız komutta alan yoktur', async () => {
    const m = await makineKur();
    const { uretimEmriId: emirId } = await o().vt.tx((db) => uretimEmriAc(db, kullanici('planlama_proje'), {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 2, teslim: null, kaynakRotaRevizyonId: revizyonId, isEmirleri: [adim(1, { tur: 'makine', id: m })],
    }));
    assert.equal((await terminal(emirId, 'baslat')).durum, 200);
    assert.equal((await terminal(emirId, 'sayim', { tur: 'saglam', adet: 2 })).durum, 200);
    assert.equal((await terminal(emirId, 'bitir', {})).durum, 200);
    const b = (await bekleyenler()).find((x) => x.kaynak === 'urun' && x.uretimEmriId === emirId)!;
    const musteri = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam) VALUES ('Uyarı Noktası', 'musteri', 39.97, 32.77) RETURNING id"))!.id;
    const tarih = (await o().sahip.tek<{ g: string }>("SELECT to_char(current_date + 4, 'YYYY-MM-DD') AS g"))!.g;
    const is = isCevabi.parse((await istek('depo', 'POST', `/sevkiyat/bekleyenler/${b.id}/ise-cevir`, isGovdesi(tarih, musteri))).govde).is;

    const UYARI = 'Emir E-1: 2 adet red parça sevk edildi.';
    const birak = urunSevkiDinle(async (_db, olay) => (olay.yeni === 'tamamlandi' ? [UYARI] : []));
    try {
      const teslim = await istek<{ is: Is; uyarilar?: string[] }>('depo', 'POST', `/sevkiyat/isler/${is.id}/durum`, { durum: 'tamamlandi', tarih, not: null });
      assert.equal(teslim.durum, 200, JSON.stringify(teslim.govde));
      assert.deepEqual([teslim.govde.is.durum, teslim.govde.uyarilar], ['tamamlandi', [UYARI]]);
      const acilan = await istek<{ is: Is; uyarilar?: string[] }>('depo', 'POST', `/sevkiyat/isler/${is.id}/durum`, { durum: 'havuzda', tarih, not: null });
      assert.equal(acilan.durum, 200, JSON.stringify(acilan.govde));
      assert.equal('uyarilar' in acilan.govde, false);
    } finally { birak(); }
  });

  test('260 a, 302 a: sevk işi özeti tür, müşteri firması, emrin siparişi ve iptali verir; siparişin sevkleri iptaller işaretli döner; yoksa null ve boş', async () => {
    const m = await makineKur();
    const { uretimEmriId: emirId } = await o().vt.tx((db) => uretimEmriAc(db, kullanici('planlama_proje'), {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 1, teslim: null, kaynakRotaRevizyonId: revizyonId, isEmirleri: [adim(1, { tur: 'makine', id: m })],
    }));
    assert.equal((await terminal(emirId, 'baslat')).durum, 200);
    assert.equal((await terminal(emirId, 'sayim', { tur: 'saglam', adet: 1 })).durum, 200);
    assert.equal((await terminal(emirId, 'bitir', {})).durum, 200);
    const b = (await bekleyenler()).find((x) => x.kaynak === 'urun' && x.uretimEmriId === emirId)!;
    const firmaId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Fatura Alıcı', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
    const nokta = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, firma_id) VALUES ('Fatura Noktası', 'musteri', 39.99, 32.79, $1) RETURNING id", [firmaId]))!.id;
    const tarih = (await o().sahip.tek<{ g: string }>("SELECT to_char(current_date + 6, 'YYYY-MM-DD') AS g"))!.g;
    const is = isCevabi.parse((await istek('depo', 'POST', `/sevkiyat/bekleyenler/${b.id}/ise-cevir`, isGovdesi(tarih, nokta))).govde).is;
    const ozet = () => o().vt.tx((db) => sevkIsiOzeti(db, is.id));

    assert.deepEqual(await ozet(), { tur: 'teslimat', firmaId, siparisId: null, iptal: false });
    // Test düzeneği: emri bir sipariş satırına bağlar (sipariş açma akışı bu modülün işi değil).
    const siparisId = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id)
       VALUES ('SS-2026-901', 'taslak', $1, current_date, current_date + 30, 20, $2) RETURNING id`, [firmaId, yoneticiId]))!.id;
    const satirId = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 1, 5) RETURNING id', [siparisId, urunNo]))!.id;
    await o().sahip.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $2 WHERE id = $1', [emirId, satirId]);
    assert.deepEqual(await ozet(), { tur: 'teslimat', firmaId, siparisId, iptal: false });
    const sevkler = () => o().vt.tx((db) => siparisinSevkleri(db, siparisId));
    assert.deepEqual((await sevkler()).map((x) => ({ isId: x.isId, uretimEmriId: x.uretimEmriId, firmaId: x.firmaId, belgeNo: x.belgeNo, siparisId: x.siparisId, adet: x.adet, iptal: x.iptal })),
      [{ isId: is.id, uretimEmriId: emirId, firmaId, belgeNo: null, siparisId, adet: '1.0000', iptal: false }], '302 a: siparişin sevki');
    assert.equal((await istek('depo', 'POST', `/sevkiyat/isler/${is.id}/iptal-et`)).durum, 200);
    assert.equal((await ozet())?.iptal, true);
    assert.deepEqual((await sevkler()).map((x) => [x.isId, x.iptal]), [[is.id, true]], '302 a: iptal edilen sevk işaretli döner');
    // Test düzeneği: teslimat dışı iş faturaya bağlanmaz, listede yer almaz.
    const alis = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam) VALUES ('Aktarma Noktası', 'musteri', 39.98, 32.78) RETURNING id"))!.id;
    await o().sahip.sorgu("UPDATE sevkiyat_isi SET tur = 'aktarma', alis_noktasi_id = $2 WHERE id = $1", [is.id, alis]);
    assert.deepEqual(await sevkler(), [], '302 a: teslimat dışı iş dönmez');
    assert.equal(await o().vt.tx((db) => sevkIsiOzeti(db, 2147483647)), null);
    assert.deepEqual(await o().vt.tx((db) => siparisinSevkleri(db, 2147483647)), [], '302 a: olmayan siparişte boş liste');
  });

  test('261 a: ürün kaydı bölünür, parçalar ayrı işlere gider; müşteri sevk anında kayda yazılır; emrin sevk yeri geride kalan parçadır', async () => {
    const m = await makineKur();
    const { uretimEmriId: emirId } = await o().vt.tx((db) => uretimEmriAc(db, kullanici('planlama_proje'), {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 5, teslim: null, kaynakRotaRevizyonId: revizyonId, isEmirleri: [adim(1, { tur: 'makine', id: m })],
    }));
    assert.equal((await terminal(emirId, 'baslat')).durum, 200);
    assert.equal((await terminal(emirId, 'sayim', { tur: 'saglam', adet: 5 })).durum, 200);
    assert.equal((await terminal(emirId, 'bitir', {})).durum, 200);
    const kok = (await bekleyenler()).find((x) => x.kaynak === 'urun' && x.uretimEmriId === emirId)!;

    for (const [adet, kod] of [['5', 'GECERSIZ'], ['0', 'GECERSIZ']] as const) {
      const c = await istek<{ kod: string }>('depo', 'POST', `/sevkiyat/bekleyenler/${kok.id}/bol`, { adet });
      assert.deepEqual([c.durum, c.govde.kod], [422, kod], adet);
    }
    assert.equal((await istek('operator', 'POST', `/sevkiyat/bekleyenler/${kok.id}/bol`, { adet: '2' })).durum, 403);
    const c = await istek('depo', 'POST', `/sevkiyat/bekleyenler/${kok.id}/bol`, { adet: '2' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const { yeniId } = bekleyenBolCevabi.parse(c.govde);
    const liste = (await bekleyenler()).filter((x) => x.uretimEmriId === emirId);
    assert.deepEqual(liste.map((x) => [x.id, x.adet, x.hazirZamani]), [[kok.id, '3.0000', kok.hazirZamani], [yeniId, '2.0000', kok.hazirZamani]]);
    const ust = await o().sahip.tek<{ ust: number | null }>('SELECT ust_bekleyen_id AS ust FROM sevkiyat_bekleyen WHERE id = $1', [yeniId]);
    assert.equal(ust?.ust, kok.id);

    const firmaId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Kısmi Alıcı', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
    const musteri = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, firma_id) VALUES ('Kısmi Noktası', 'musteri', 39.98, 32.78, $1) RETURNING id", [firmaId]))!.id;
    const tarih = (await o().sahip.tek<{ g: string }>("SELECT to_char(current_date + 5, 'YYYY-MM-DD') AS g"))!.g;
    const parcaIs = isCevabi.parse((await istek('depo', 'POST', `/sevkiyat/bekleyenler/${yeniId}/ise-cevir`, isGovdesi(tarih, musteri))).govde).is;
    assert.equal((await istek('depo', 'POST', `/sevkiyat/bekleyenler/${yeniId}/bol`, { adet: '1' })).durum, 409, 'işe çevrilen kayıt bölünmez');
    const firmasi = async () => (await o().sahip.tek<{ f: number | null }>('SELECT firma_id AS f FROM sevkiyat_bekleyen WHERE id = $1', [yeniId]))?.f;
    assert.equal(await firmasi(), null, 'sevkten önce müşteri yazılmaz');

    const olaylar: UrunSevkiOlayi[] = [];
    const birak = urunSevkiDinle(async (_db, olay) => { olaylar.push(olay); });
    try {
      assert.equal((await istek('depo', 'POST', `/sevkiyat/isler/${parcaIs.id}/durum`, { durum: 'tamamlandi', tarih, not: null })).durum, 200);
    } finally { birak(); }
    assert.deepEqual(olaylar.map((x) => x.satirlar), [[{ isId: parcaIs.id, uretimEmriId: emirId, adet: '2.0000', firmaId }]]);
    assert.equal(await firmasi(), firmaId, 'teslimde müşteri kayda yazılır');

    const izler = (await o().vt.tx((db) => emirlerinSevkleri(db, [emirId]))).get(emirId)!;
    assert.deepEqual(izler.map((x) => [x.isId, x.adet, x.firmaAdi]), [[parcaIs.id, '2.0000', 'Kısmi Alıcı']]);
    const yer = (await o().vt.tx((db) => emirlerinSevkDurumu(db, [emirId]))).get(emirId)!;
    assert.deepEqual([yer.isId, yer.kaldirildi], [null, null], 'kalan 3 adet listede beklerken emir sevk edilmemiş görünür');
  });

  test('kısıt: ürün kaydı emirsiz yazılamaz, aynı emrin kök kaydı iki kez yazılamaz, bölünen parça yalnız üründe', async () => {
    await assert.rejects(o().sahip.sorgu("INSERT INTO sevkiyat_bekleyen (kaynak, adet) VALUES ('urun', 1)"), (h: { constraint?: string }) => h.constraint === 'sevkiyat_bekleyen_kaynak_alanlari');
    const emir = (await o().sahip.tek<{ id: number }>("SELECT uretim_emri_id AS id FROM sevkiyat_bekleyen WHERE kaynak = 'urun' LIMIT 1"))!;
    await assert.rejects(o().sahip.sorgu("INSERT INTO sevkiyat_bekleyen (kaynak, uretim_emri_id, adet) VALUES ('urun', $1, 1)", [emir.id]),
      (h: { constraint?: string }) => h.constraint === 'sevkiyat_bekleyen_urun_tek');
    const kok = (await o().sahip.tek<{ id: number }>("SELECT id FROM sevkiyat_bekleyen WHERE kaynak = 'urun' AND uretim_emri_id = $1 AND ust_bekleyen_id IS NULL", [emir.id]))!;
    await o().sahip.sorgu("INSERT INTO sevkiyat_bekleyen (kaynak, uretim_emri_id, adet, ust_bekleyen_id) VALUES ('urun', $1, 1, $2)", [emir.id, kok.id]);
    await assert.rejects(o().sahip.sorgu("INSERT INTO sevkiyat_bekleyen (kaynak, talep_id, ust_bekleyen_id) VALUES ('alim', gen_random_uuid(), $1)", [kok.id]),
      (h: { constraint?: string }) => h.constraint === 'sevkiyat_bekleyen_bolme_urunde');
  });
});
