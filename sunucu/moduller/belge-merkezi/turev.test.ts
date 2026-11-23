import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { BelgeAyrintisi, BelgeListesiCevabi } from '#paylasilan/sozlesme/belge-merkezi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import {
  bagliBelgelerinGuncelRevizyonlari, bagliBelgeninYayindakiCizimi, kaydaBagla, kisininGuncelRevizyonlari, kisininMalzemeCizimleri, kisininSecebildigiCizimler,
  kisininYayindakiCizimi, malzemelerinCizimleri,
} from './disari.ts';
import { ILETILER } from './kurallar.ts';

// 3468-2 türev modeli: kaynak denetimi, tek seviye, "Kaynağı eski", listede gruplu sıra, 3462 okuması. Sentetik PDF, ORN- adlar.
const PAROLA = 'dogru-parola-1';
const pdf = (): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(2500)]);
const ozetOf = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

interface Oturum { cerez: string; id: number }

describe('çizim türevleri (3468-2, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Oturum;
  let operator: Oturum;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisYap(rolKodu: string | null, yoneticiId: number | null): Promise<Oturum> {
    const kullaniciAdi = `turev-${(sayac += 1)}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null && yoneticiId !== null) {
        const rol = await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
        const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
        await rolAl(db, yoneticiId, yeni, yon?.id ?? 0);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }

  const gonder = (o: Oturum, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: o.cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
  const oku = <T>(o: Oturum, yol: string): Promise<T> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: o.cerez } }).then((c) => {
      assert.equal(c.statusCode, 200, c.body);
      return c.json<T>();
    });

  async function yukle(icerik: Buffer): Promise<string> {
    const ozet = ozetOf(icerik);
    const c = await gonder(yonetici, `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') });
    assert.equal(c.statusCode, 200, c.body);
    return ozet;
  }

  async function ac(ad: string, turev?: object): Promise<LightMyRequestResponse> {
    return gonder(yonetici, '/cizimler', { ad, tur: 'teknik-resim', ozet: await yukle(pdf()), dosyaAdi: 'orn.pdf', ...(turev ? { turev } : {}) });
  }
  async function acTamam(ad: string, turev?: object): Promise<BelgeAyrintisi> {
    const c = await ac(ad, turev);
    assert.equal(c.statusCode, 200, c.body);
    return c.json<BelgeAyrintisi>();
  }
  async function yayinla(b: BelgeAyrintisi, revizyonId = b.revizyonlar[0]!.id): Promise<BelgeAyrintisi> {
    const c = await gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${revizyonId}/yayinla`, { surum: b.surum });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<BelgeAyrintisi>();
  }
  async function yeniRevizyonYayinla(b: BelgeAyrintisi): Promise<BelgeAyrintisi> {
    const c = await gonder(yonetici, `/cizimler/${b.id}/revizyon-ekle`, { ozet: await yukle(pdf()), dosyaAdi: 'orn-b.pdf', surum: b.surum });
    assert.equal(c.statusCode, 200, c.body);
    const yeni = c.json<BelgeAyrintisi>();
    return yayinla(yeni, yeni.revizyonlar[0]!.id);
  }
  // Yayında revizyonu olan orijinal.
  const orijinal = async (ad: string): Promise<BelgeAyrintisi> => yayinla(await acTamam(ad));
  const ayrinti = (id: number): Promise<BelgeAyrintisi> => oku<BelgeAyrintisi>(yonetici, `/cizimler/${id}`);

  before(async () => {
    ortam = await testVeritabaniKur('belge_merkezi_turev');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonetici = await girisYap(null, null);
    operator = await girisYap('operator', yonetici.id);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('TV-1 yayındaki revizyondan türev açılır; türevde kaynak, orijinalde türev listesi', async () => {
    const o = await orijinal('ORN-Flans 120');
    const rev = o.revizyonlar[0]!;
    const t = await acTamam('ORN-Flans 120 dış üretim', { kaynakBelgeId: o.id, kaynakRevizyonId: rev.id, kullanim: 'dis-uretim' });
    assert.deepEqual(
      { belgeId: t.kaynak?.belgeId, revizyonId: t.kaynak?.revizyonId, kullanim: t.kaynak?.kullanim, eski: t.kaynak?.eski, harf: t.kaynak?.harf },
      { belgeId: o.id, revizyonId: rev.id, kullanim: 'dis-uretim', eski: false, harf: rev.harf },
    );
    assert.deepEqual(t.turevler, [], 'türevin türev listesi boş');
    const oa = await ayrinti(o.id);
    assert.equal(oa.kaynak, null);
    assert.deepEqual(oa.turevler?.map((x) => [x.id, x.kullanim, x.kaynakRevizyonId, x.kaynakEski, x.yayindakiHarf]), [[t.id, 'dis-uretim', rev.id, false, null]]);
  });

  test('TV-2 kaynak denetimi: taslak revizyon, başka belgenin revizyonu, türevin türevi, türevi olan belge', async () => {
    const taslakli = await acTamam('ORN-Taslak kaynak');
    let c = await ac('ORN-x', { kaynakBelgeId: taslakli.id, kaynakRevizyonId: taslakli.revizyonlar[0]!.id, kullanim: 'kalite' });
    assert.equal(c.statusCode, 400, c.body);
    assert.match(c.body, new RegExp(ILETILER.turevRevizyonTaslak));

    const a = await orijinal('ORN-A');
    const b = await orijinal('ORN-B');
    c = await ac('ORN-x', { kaynakBelgeId: a.id, kaynakRevizyonId: b.revizyonlar[0]!.id, kullanim: 'kalite' });
    assert.equal(c.statusCode, 400, c.body);
    assert.match(c.body, new RegExp(ILETILER.turevRevizyonYok));

    const t = await yayinla(await acTamam('ORN-A kalite', { kaynakBelgeId: a.id, kaynakRevizyonId: a.revizyonlar[0]!.id, kullanim: 'kalite' }));
    c = await ac('ORN-x', { kaynakBelgeId: t.id, kaynakRevizyonId: t.revizyonlar[0]!.id, kullanim: 'teklif' });
    assert.equal(c.statusCode, 400, c.body);
    assert.match(c.body, new RegExp(ILETILER.turevinTurevi));

    // Türevi olan A, B'nin türevi yapılamaz.
    c = await gonder(yonetici, `/cizimler/${a.id}/turev-bagla`, { kaynakBelgeId: b.id, kaynakRevizyonId: b.revizyonlar[0]!.id, kullanim: 'diger', surum: (await ayrinti(a.id)).surum });
    assert.equal(c.statusCode, 400, c.body);
    assert.match(c.body, new RegExp(ILETILER.turevliBelge));

    c = await gonder(yonetici, `/cizimler/${b.id}/turev-bagla`, { kaynakBelgeId: b.id, kaynakRevizyonId: b.revizyonlar[0]!.id, kullanim: 'diger', surum: b.surum });
    assert.equal(c.statusCode, 400, c.body);
    assert.match(c.body, new RegExp(ILETILER.turevKendisi));

    // 3609: farklı türdeki belge türev yapılamaz (bağlama ve açılış).
    const rapor = await gonder(yonetici, '/cizimler', { ad: 'ORN-Rapor', tur: 'rapor', ozet: await yukle(pdf()), dosyaAdi: 'orn-rapor.pdf' });
    assert.equal(rapor.statusCode, 200, rapor.body);
    const raporBelge = rapor.json<BelgeAyrintisi>();
    c = await gonder(yonetici, `/cizimler/${raporBelge.id}/turev-bagla`, { kaynakBelgeId: b.id, kaynakRevizyonId: b.revizyonlar[0]!.id, kullanim: 'diger', surum: raporBelge.surum });
    assert.equal(c.statusCode, 400, c.body);
    assert.match(c.body, new RegExp(ILETILER.turevTuruFarkli));
    c = await gonder(yonetici, '/cizimler', { ad: 'ORN-Rapor türevi', tur: 'rapor', ozet: await yukle(pdf()), dosyaAdi: 'orn.pdf', turev: { kaynakBelgeId: b.id, kaynakRevizyonId: b.revizyonlar[0]!.id, kullanim: 'diger' } });
    assert.equal(c.statusCode, 400, c.body);
    assert.match(c.body, new RegExp(ILETILER.turevTuruFarkli));

    c = await ac('ORN-x', { kaynakBelgeId: 999999, kaynakRevizyonId: b.revizyonlar[0]!.id, kullanim: 'kalite' });
    assert.equal(c.statusCode, 400, c.body);
    assert.match(c.body, new RegExp(ILETILER.turevKaynakYok));

    const arsivli = await orijinal('ORN-Arşiv kaynak');
    assert.equal((await gonder(yonetici, `/cizimler/${arsivli.id}/arsivle`, { surum: arsivli.surum })).statusCode, 200);
    c = await ac('ORN-x', { kaynakBelgeId: arsivli.id, kaynakRevizyonId: arsivli.revizyonlar[0]!.id, kullanim: 'kalite' });
    assert.equal(c.statusCode, 400, c.body);
    assert.match(c.body, new RegExp(ILETILER.turevKaynakArsivde));
    assert.match(c.body, /kaynakBelgeId/);
  });

  test('TV-3 kaynağa yeni revizyon yayınlanınca türev "Kaynağı eski" olur, kendisi yayında kalır', async () => {
    const o = await orijinal('ORN-Mil 40');
    const t = await yayinla(await acTamam('ORN-Mil 40 iç üretim', { kaynakBelgeId: o.id, kaynakRevizyonId: o.revizyonlar[0]!.id, kullanim: 'ic-uretim' }));
    await yeniRevizyonYayinla(o);
    const ta = await ayrinti(t.id);
    assert.equal(ta.kaynak?.eski, true);
    assert.equal(ta.revizyonlar[0]!.durum, 'yayinda', 'türev kendiliğinden eskiye düşmez');
    assert.equal((await ayrinti(o.id)).turevler?.[0]?.kaynakEski, true);
    const liste = await oku<BelgeListesiCevabi>(yonetici, `/cizimler?ara=${encodeURIComponent('ORN-Mil 40')}`);
    assert.equal(liste.satirlar.find((s) => s.id === t.id)?.kaynak?.eski, true);
  });

  test('TV-4 listede türev orijinalin hemen altında; kullanım süzgeci', async () => {
    const o1 = await orijinal('ORN-Grup 1');
    const o2 = await orijinal('ORN-Grup 2');
    const t1 = await acTamam('ORN-Grup 1 z kalite', { kaynakBelgeId: o1.id, kaynakRevizyonId: o1.revizyonlar[0]!.id, kullanim: 'kalite' });
    const t2 = await acTamam('ORN-Grup 1 a dış', { kaynakBelgeId: o1.id, kaynakRevizyonId: o1.revizyonlar[0]!.id, kullanim: 'dis-uretim' });
    const ara = encodeURIComponent('ORN-Grup');
    for (const yon of ['artan', 'azalan'] as const) {
      const l = await oku<BelgeListesiCevabi>(yonetici, `/cizimler?ara=${ara}&sirala=ad&yon=${yon}`);
      const sira = l.satirlar.map((s) => s.id);
      const grup1 = [o1.id, t2.id, t1.id];
      assert.deepEqual(yon === 'artan' ? sira.slice(0, 3) : sira.slice(1), grup1, `${yon}: önce orijinal, sonra türevler ada göre`);
      assert.equal(yon === 'artan' ? sira[3] : sira[0], o2.id);
    }
    const l = await oku<BelgeListesiCevabi>(yonetici, `/cizimler?ara=${ara}&sirala=ad&yon=artan`);
    assert.equal(l.satirlar.find((s) => s.id === o1.id)?.turevSayisi, 2);
    assert.deepEqual(l.satirlar.find((s) => s.id === t2.id)?.kullanim, 'dis-uretim');
    assert.deepEqual((await oku<BelgeListesiCevabi>(yonetici, `/cizimler?ara=${ara}&kullanim=orijinal`)).satirlar.map((s) => s.id).sort(), [o1.id, o2.id].sort());
    assert.deepEqual((await oku<BelgeListesiCevabi>(yonetici, `/cizimler?ara=${ara}&kullanim=kalite`)).satirlar.map((s) => s.id), [t1.id]);
  });

  test('TV-5 var olan belge türev olarak bağlanır ve bağı kaldırılır; operatör bağlayamaz', async () => {
    const o = await orijinal('ORN-Kapak');
    const ayri = await acTamam('ORN-Kapak düzenlenmiş');
    const govde = { kaynakBelgeId: o.id, kaynakRevizyonId: o.revizyonlar[0]!.id, kullanim: 'dis-operasyon', surum: ayri.surum };
    assert.equal((await gonder(operator, `/cizimler/${ayri.id}/turev-bagla`, govde)).statusCode, 403);
    let c = await gonder(yonetici, `/cizimler/${ayri.id}/turev-bagla`, govde);
    assert.equal(c.statusCode, 200, c.body);
    const bagli = c.json<BelgeAyrintisi>();
    assert.equal(bagli.kaynak?.kullanim, 'dis-operasyon');
    c = await gonder(yonetici, `/cizimler/${ayri.id}/turev-bagini-kaldir`, { surum: bagli.surum });
    assert.equal(c.statusCode, 200, c.body);
    assert.equal(c.json<BelgeAyrintisi>().kaynak, null);
    c = await gonder(yonetici, `/cizimler/${ayri.id}/turev-bagini-kaldir`, { surum: c.json<BelgeAyrintisi>().surum });
    assert.equal(c.statusCode, 409, c.body);
    assert.equal((await ayrinti(o.id)).turevler?.length, 0);
  });

  test('TV-6 3462 okuması: orijinal ve yayındaki türev; taslak türev yok, guncelMi kaynağa göre', async () => {
    const no = 900000 + Math.floor(Math.random() * 1000);
    const o = await orijinal('ORN-Malzeme çizimi');
    await vt().tx((db) => kaydaBagla(db, { id: yonetici.id, ad: 'deneme', islemler: [] }, o.id, 'malzemeler', no));
    const kaynak = { kaynakBelgeId: o.id, kaynakRevizyonId: o.revizyonlar[0]!.id };
    const yayinda = await yayinla(await acTamam('ORN-Malzeme çizimi dış', { ...kaynak, kullanim: 'dis-uretim' }));
    await acTamam('ORN-Malzeme çizimi taslak', { ...kaynak, kullanim: 'kalite' });
    let liste = (await vt().tx((db) => malzemelerinCizimleri(db, [no]))).get(no) ?? [];
    assert.deepEqual(liste.map((c) => [c.belgeId, c.kullanim, c.kaynakBelgeId, c.guncelMi]), [[o.id, null, null, true], [yayinda.id, 'dis-uretim', o.id, true]]);
    await yeniRevizyonYayinla(await ayrinti(o.id));
    liste = (await vt().tx((db) => malzemelerinCizimleri(db, [no]))).get(no) ?? [];
    assert.deepEqual(liste.map((c) => c.guncelMi), [true, false]);
    const ta = await ayrinti(yayinda.id);
    assert.equal((await gonder(yonetici, `/cizimler/${yayinda.id}/arsivle`, { surum: ta.surum })).statusCode, 200);
    liste = (await vt().tx((db) => malzemelerinCizimleri(db, [no]))).get(no) ?? [];
    assert.deepEqual(liste.map((c) => c.belgeId), [o.id], 'arşivdeki türev listelenmez');
  });

  test('TV-7 veritabanı son savunma: türevi olan belge doğrudan yazımla da türev olamaz; kısıt kullanım dışını almaz', async () => {
    const a = await orijinal('ORN-VT A');
    const b = await orijinal('ORN-VT B');
    await acTamam('ORN-VT A türev', { kaynakBelgeId: a.id, kaynakRevizyonId: a.revizyonlar[0]!.id, kullanim: 'teklif' });
    await assert.rejects(
      vt().sorgu("UPDATE belge_merkezi_belge SET kaynak_belge_id = $1, kaynak_revizyon_id = $2, kullanim = 'diger' WHERE id = $3", [b.id, b.revizyonlar[0]!.id, a.id]),
      /belge_merkezi_turev_tek_seviye|Türevi olan belge/,
    );
    await assert.rejects(
      vt().sorgu("UPDATE belge_merkezi_belge SET kaynak_belge_id = $1, kaynak_revizyon_id = $2, kullanim = 'baska' WHERE id = $3", [a.id, a.revizyonlar[0]!.id, b.id]),
      /belge_merkezi_belge_kullanim_degeri/,
    );
    await assert.rejects(
      vt().sorgu('UPDATE belge_merkezi_belge SET kaynak_belge_id = $1, kaynak_revizyon_id = $2 WHERE id = $3', [a.id, a.revizyonlar[0]!.id, b.id]),
      /belge_merkezi_belge_turev_butun/,
    );
  });

  test('TV-9 seçici (3571 K2): yalnız şu an yayındaki revizyon verilir, taslak ve eski 404; okuma işlemi olmayan kişiye hiçbir şey dönmez', async () => {
    const okur: Kullanici = { id: operator.id, ad: 'okur', islemler: ['sayfa.cizimler'] };
    const yetkisiz: Kullanici = { id: operator.id, ad: 'yetkisiz', islemler: ['satin-alma.talep-ac'] };
    const a = await orijinal('ORN-Secici A');
    const revA = a.revizyonlar[0]!.id;
    const taslakli = await acTamam('ORN-Secici taslak');
    const secilen = await vt().tx((db) => kisininYayindakiCizimi(db, okur, a.id, revA));
    assert.equal(secilen?.ozet, a.revizyonlar[0]!.ozet);
    assert.equal(await vt().tx((db) => kisininYayindakiCizimi(db, okur, taslakli.id, taslakli.revizyonlar[0]!.id)), null, 'taslak');
    assert.equal(await vt().tx((db) => kisininYayindakiCizimi(db, yetkisiz, a.id, revA)), null, 'yetkisiz');
    const liste = await vt().tx((db) => kisininSecebildigiCizimler(db, okur, 'ORN-Secici'));
    assert.deepEqual(liste?.map((b) => b.id), [a.id], 'taslak listede yok');
    assert.equal(await vt().tx((db) => kisininSecebildigiCizimler(db, yetkisiz, null)), null);
    assert.deepEqual(await vt().tx((db) => kisininSecebildigiCizimler(db, okur, null)), [], 'arama yazılmadan liste yok');
    const yeni = await yeniRevizyonYayinla(a);
    assert.equal(await vt().tx((db) => kisininYayindakiCizimi(db, okur, a.id, revA)), null, 'eski revizyon, yazan da olsa yalnız yayındaki');
    const guncel = await vt().tx((db) => kisininGuncelRevizyonlari(db, okur, [a.id, taslakli.id]));
    assert.deepEqual([...guncel.keys()], [a.id]);
    assert.equal(guncel.get(a.id)?.revizyonId, yeni.revizyonlar.find((r) => r.durum === 'yayinda')?.id);
    assert.equal((await vt().tx((db) => kisininGuncelRevizyonlari(db, yetkisiz, [a.id]))).size, 0);
    // Kayda bağlı belge (karar 3571 a): okuma işlemi aranmaz, yalnız şu an yayındaki revizyon; taslak belge yok.
    assert.equal((await vt().tx((db) => bagliBelgelerinGuncelRevizyonlari(db, [a.id, taslakli.id]))).get(a.id)?.revizyonId, guncel.get(a.id)?.revizyonId);
    assert.equal((await vt().tx((db) => bagliBelgelerinGuncelRevizyonlari(db, [taslakli.id]))).size, 0);
    assert.equal((await vt().tx((db) => bagliBelgeninYayindakiCizimi(db, a.id)))?.revizyonId, guncel.get(a.id)?.revizyonId);
    assert.equal(await vt().tx((db) => bagliBelgeninYayindakiCizimi(db, taslakli.id)), null);
    const no = 910000 + Math.floor(Math.random() * 1000);
    await vt().tx((db) => kaydaBagla(db, { id: yonetici.id, ad: 'y', islemler: [] }, a.id, 'malzemeler', no));
    assert.equal((await vt().tx((db) => kisininMalzemeCizimleri(db, okur, [no]))).get(no)?.length, 1);
    assert.equal((await vt().tx((db) => kisininMalzemeCizimleri(db, yetkisiz, [no]))).size, 0, 'öneri şeridi yetkisizde boş');
  });
});
