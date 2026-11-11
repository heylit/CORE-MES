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
import { adimliEmirCevabi, siradakiFasonCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { AdimliEmirAyrintisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { dieAc, fasonIsEmirleri, fasonIsEmriBelgesi, planlanacakIsEmirleri, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import {
  FASON_FIRMA_BEKLENIYOR, FASON_KAYNAGI_SABIT, FASON_TERMINSIZ, FASON_VARSAYILAN_GUN, FIRMASIZ_KAYNAKLI, TERMIN_FASON_DISI, fasonBeklemesi, fasonGidisIhlali,
  fasonMu, isEmirleriIhlali, siradakiFasonAdimi, varsayilanAdim,
} from './kurallar.ts';

// 2874: rotada firması seçilmemiş fason adım (2682 a) emre firmasız fason iş emri olarak gelir; firmayı sonra satın alma ya da emir ekranı
// seçer. Firma seçilene kadar gidiş, dönüş, dış işlem emri ve belge reddedilir; operatör ve plan adımı iç adım saymaz. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string }

describe('2874 firmasız fason kuralı (saf)', () => {
  const ozet = (ek: Partial<Parameters<typeof isEmirleriIhlali>[0][number]>) => ({
    sira: 1, opNo: 10, kaynakTuru: null, ayarSuresiDk: null, birimSureDk: null, terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, ...ek,
  });
  test('izinli: firmasız adım kaynaksız ve süresizdir; termin isteğe bağlıdır', () => {
    assert.equal(isEmirleriIhlali([ozet({ fasonFirmasiz: true })]), null);
    assert.equal(isEmirleriIhlali([ozet({ fasonFirmasiz: true, terminGun: 4 })]), null);
    assert.equal(fasonMu({ fasonFirmaId: null, fasonFirmasiz: true }), true);
    assert.equal(fasonMu({ fasonFirmaId: 3 }), true);
    assert.equal(fasonMu({ fasonFirmaId: null, fasonFirmasiz: false }), false);
  });
  test('reddedilen: firmasız adıma kaynak ya da süre; firmasız olmayan iç adıma termin', () => {
    assert.equal(isEmirleriIhlali([ozet({ fasonFirmasiz: true, kaynakTuru: 'makine' })]), FIRMASIZ_KAYNAKLI);
    assert.equal(isEmirleriIhlali([ozet({ fasonFirmasiz: true, birimSureDk: '1' })]), FASON_TERMINSIZ);
    assert.equal(isEmirleriIhlali([ozet({ terminGun: 4 })]), TERMIN_FASON_DISI);
  });
  test('gidiş ve dönüş firma ister; firma seçilince aynı durum geçer', () => {
    const d = { durum: 'bekliyor' as const, fason: true, siradaki: true, gonderilen: 0, donenSaglam: 0, donenHurda: 0, gonderilebilir: 10 };
    assert.equal(fasonGidisIhlali({ ...d, firmaBekleniyor: true }, 1), FASON_FIRMA_BEKLENIYOR);
    assert.equal(fasonGidisIhlali({ ...d, firmaBekleniyor: false }, 1), null);
  });
  test('plan beklemesi firmasız adımda varsayılan süreyi alır; sıradaki fason ve terminal varsayılanı firmasızı fason sayar', () => {
    const adimlar = [
      { opNo: 10, bagimlilik: 'bekleyen' as const, devirAdedi: null, id: 1, sira: 1, fasonFirmaId: null, fasonFirmasiz: true, terminGun: null, durum: 'bekliyor' as const, onculler: null },
      { opNo: 20, bagimlilik: 'bekleyen' as const, devirAdedi: null, id: 2, sira: 2, fasonFirmaId: null, fasonFirmasiz: false, terminGun: null, durum: 'bekliyor' as const, onculler: null },
    ];
    assert.equal(fasonBeklemesi(adimlar, 2, () => 99), FASON_VARSAYILAN_GUN, 'firması yokken tahmin sorulmaz');
    assert.equal(fasonBeklemesi([{ ...adimlar[0]!, terminGun: 3 }, adimlar[1]!], 2), 3);
    assert.equal(siradakiFasonAdimi(adimlar)?.id, 1);
    const calisan = adimlar.map((a) => ({ ...a, durum: 'calisiyor' as const }));
    assert.equal((varsayilanAdim(calisan) as { id: number } | null)?.id, 2, 'firmasız fason açık adım sayılmaz');
  });
});

describe('2874 firmasız fason iş emri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();
  let tipId = 0;
  let varsayilanIstasyon = 0;
  let firmaId = 0;
  let urunNo = 0;
  let rev = 0;
  let sayac = 0;

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
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() };
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
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`FFK${sayac}`, 'Tezgah', varsayilanIstasyon]);
    if (!m) throw new Error('makine kurulamadı');
    return m.id;
  }

  const icAdim = (sira: number, makine: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makine },
    ayarSuresiDk: '10.00', birimSureDk: '1.5000', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const firmasizAdim = (sira: number, terminGun: number | null = 4): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Kaplama ${sira}`, operasyonTipiId: tipId, kaynak: null, fasonFirmasiz: true,
    ayarSuresiDk: null, birimSureDk: null, terminGun, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const ac = async (isEmirleri: IsEmriGirdisi[]) =>
    o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), { projeId: denemeProjeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri }));
  const ayrinti = async (id: number): Promise<AdimliEmirAyrintisi> => {
    const c = await istek<{ emir: AdimliEmirAyrintisi }>('planlama_proje', 'GET', `/adimli-emirler/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return adimliEmirCevabi.parse(c.govde).emir;
  };
  const dieSayisi = async (isEmriId: number) =>
    (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emirleri_dis_islem_emri WHERE is_emri_id = $1', [isEmriId]))!.n;

  before(async () => {
    ortam = await testVeritabaniKur('fason_firmasiz');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.FF', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['depo', 'depo']] as const) await kisiEkle(ad, rol);
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('FFM', 'Deneme Merkezi') RETURNING id");
    varsayilanIstasyon = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('FFI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>(
      `INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup, varsayilan_ayar_dk, varsayilan_birim_dk, varsayilan_istasyon_id)
       VALUES ('FF-T', 'Deneme tipi', 'TAL', 7, 2, $1) RETURNING id`, [varsayilanIstasyon]))!.id;
    firmaId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fason', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('FF-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ff-1', 'mamul', 'FF-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'ff-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', $3, 'iptal', $2, $2, now()) RETURNING id", [urunNo, yoneticiId, 'ZZ']))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('izinli: emir firmasız fason adımla açılır; adım fason görünür, firma bekler, plana iç adım olarak girmez, ön talep listesine düşer', async () => {
    const { uretimEmriId: id, isEmriIdleri } = await ac([firmasizAdim(1), icAdim(2, await makineKur())]);
    const ie = isEmriIdleri[0]!;
    const e = await ayrinti(id);
    const a = e.isEmirleri[0];
    assert.deepEqual([a?.fasonFirmasiz, a?.kaynak, a?.istasyon, a?.terminGun, a?.fason?.gonderilen], [true, null, null, 4, 0]);
    assert.equal(e.isEmirleri[1]?.fasonFirmasiz, false);
    assert.equal(await dieSayisi(ie), 0, 'dış işlem emri firma seçilince açılır');
    const liste = (await o().vt.okumaTx((db) => fasonIsEmirleri(db))).find((x) => x.isEmriId === ie);
    assert.deepEqual(liste && [liste.firmaId, liste.terminGun], [null, 4]);
    const plan = await o().vt.okumaTx((db) => planlanacakIsEmirleri(db, { taslakDahil: true }));
    assert.deepEqual(plan.filter((p) => p.uretimEmriId === id).map((p) => p.id), [isEmriIdleri[1]], 'firmasız fason adım plana iç iş olarak girmez');
  });

  test('kısıt: firmasız adıma makine, istasyon ya da süre yazılamaz', async () => {
    const { isEmriIdleri } = await ac([firmasizAdim(1)]);
    const ie = isEmriIdleri[0]!;
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emirleri_is_emri SET makine_id = $2 WHERE id = $1', [ie, await makineKur()]), /uretim_emirleri_is_emri_(firmasiz_kaynaksiz|tek_kaynak)/);
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emirleri_is_emri SET istasyon_id = $2 WHERE id = $1', [ie, varsayilanIstasyon]), /uretim_emirleri_is_emri_firmasiz_kaynaksiz/);
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emirleri_is_emri SET birim_sure_dk = 1 WHERE id = $1', [ie]), /uretim_emirleri_is_emri_firmasiz_suresiz/);
    await o().sahip.sorgu('UPDATE uretim_emirleri_is_emri SET termin_gun = 9 WHERE id = $1', [ie]);
  });

  test('reddedilen: firma seçilmeden fasona gidiş, dış işlem emri ve fason belgesi; ekrandan makine atanamaz; siradaki fason firma bekler', async () => {
    const { uretimEmriId: id, isEmriIdleri } = await ac([firmasizAdim(1)]);
    const ie = isEmriIdleri[0]!;
    const g = await istek<Hata>('depo', 'POST', `/adimli-emirler/${id}/is-emirleri/${ie}/fason-gidis`, { adet: 1 });
    assert.deepEqual([g.durum, g.govde.mesaj], [409, FASON_FIRMA_BEKLENIYOR]);
    const firmaYok = (h: unknown) => h instanceof UygulamaHatasi && h.message === FASON_FIRMA_BEKLENIYOR;
    await assert.rejects(o().vt.tx((db) => dieAc(db, yoneticiId, { kaynak: 'emir', isEmriId: ie, aciklama: null }, { acilis: 'elle' })), firmaYok);
    await assert.rejects(o().vt.tx((db) => fasonIsEmriBelgesi(db, ie)), firmaYok);
    const e = await ayrinti(id);
    const k = await istek<Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/adim-kaynagi`, { opNo: 10, kaynak: { tur: 'makine', id: await makineKur() }, surum: e.surum });
    assert.deepEqual([k.durum, k.govde.mesaj], [409, FASON_KAYNAGI_SABIT]);
    const s = await istek<unknown>('depo', 'GET', `/adimli-emirler/${id}/siradaki-fason`);
    assert.equal(s.durum, 200, JSON.stringify(s.govde));
    const f = siradakiFasonCevabi.parse(s.govde).fason;
    assert.deepEqual(f && [f.isEmriId, f.firma, f.firmaBekleniyor], [ie, null, true]);
  });

  test('izinli: firma emir ekranından seçilince adım firmalı fason olur, dış işlem emri açılır, gidiş yazılır; içeri alınca tipin varsayılanı gelir', async () => {
    const { uretimEmriId: id, isEmriIdleri } = await ac([firmasizAdim(1, null)]);
    const ie = isEmriIdleri[0]!;
    const sec = await istek<{ emir: AdimliEmirAyrintisi } & Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/uretim-yeri`,
      { opNo: 10, yer: 'fason', firmaId, terminGun: 6, surum: (await ayrinti(id)).surum });
    assert.equal(sec.durum, 200, JSON.stringify(sec.govde));
    const a = sec.govde.emir.isEmirleri[0];
    assert.deepEqual([a?.fasonFirmasiz, a?.kaynak?.tur, a?.kaynak?.id, a?.terminGun], [false, 'fason', firmaId, 6]);
    assert.equal(sec.govde.emir.isEmirleri[0]?.uretimYeriDegisimi?.yer, 'fason');
    assert.equal(await dieSayisi(ie), 1);
    const geri = await istek<{ emir: AdimliEmirAyrintisi } & Hata>('planlama_proje', 'POST', `/adimli-emirler/${id}/uretim-yeri`,
      { opNo: 10, yer: 'ic', firmaId: null, terminGun: null, surum: sec.govde.emir.surum });
    assert.equal(geri.durum, 200, JSON.stringify(geri.govde));
    const b = geri.govde.emir.isEmirleri[0];
    assert.deepEqual([b?.fasonFirmasiz, b?.kaynak, b?.istasyon?.id, b?.ayarSuresiDk], [false, null, varsayilanIstasyon, '7.00'], 'firmasız hâle değil, iç varsayılana döner');
    const { uretimEmriId: id2, isEmriIdleri: ie2 } = await ac([firmasizAdim(1)]);
    await istek('planlama_proje', 'POST', `/adimli-emirler/${id2}/uretim-yeri`, { opNo: 10, yer: 'fason', firmaId, terminGun: 6, surum: (await ayrinti(id2)).surum });
    const g = await istek<Hata>('depo', 'POST', `/adimli-emirler/${id2}/is-emirleri/${ie2[0]!}/fason-gidis`, { adet: 2 });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
  });
});
