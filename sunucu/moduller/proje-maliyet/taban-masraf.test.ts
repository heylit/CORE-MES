import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { MasrafSecenekleriCevabi, ProjeMaliyetCevabi } from '#paylasilan/sozlesme/proje-maliyet.ts';
import type { Proje, ProjeYonetimiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import type { SiparisAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

describe('proje-maliyet taban ve masraf (934, 936 a, 940 c; gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let planlama = '';
  let kalite = '';
  let yoneticiId = 0;
  let sayac = 0;
  let siparis: SiparisAyrintisi;

  const sahip = (): TestVeritabani['sahip'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.sahip;
  };

  async function girisYap(rolKodu: string | null, yonetenId: number | null): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `pmt-${(sayac += 1)}`;
    const id = await ortam!.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null && yonetenId !== null) {
        const rol = await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
        const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yonetenId, yeni, rol?.id ?? 0);
        await rolAl(db, yonetenId, yeni, yon?.id ?? 0);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }

  const gonder = (cerez: string, yol: string, govde: unknown = {}): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const oku = (cerez: string, yol: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });
  async function tamam<T>(c: Promise<LightMyRequestResponse>): Promise<T> {
    const cevap = await c;
    assert.equal(cevap.statusCode, 200, cevap.body);
    return cevap.json<T>();
  }

  async function mamulAc(): Promise<number> {
    await sahip().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('PMT-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const kimlik = `pmt-dnm-${(sayac += 1)}`;
    const satir = await sahip().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'PMT-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [kimlik, sayac, JSON.stringify({ id: kimlik, com: { ad: 'Deneme mamul' } }), yoneticiId],
    );
    return satir?.no ?? 0;
  }

  // Projenin planlanabilir iş emri: istasyon saat maliyetiyle 6 dk x 10 adet + 30 dk ayar = 90 dk x 600 TL/saat = 900 TL.
  async function isEmriAc(projeId: number): Promise<void> {
    const n = (sayac += 1);
    const im = await sahip().tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`PMT${n}`, 'Deneme Merkezi']);
    const ist = await sahip().tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`PMTI${n}`, 'Deneme istasyon', im!.id]);
    const e = await sahip().tek<{ id: number }>(
      `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum, malzeme_no, proje_id)
       VALUES ('P-PMT', 'Deneme', 10, $1, $2, 'planli', $3, $4) RETURNING id`, [ist!.id, yoneticiId, await mamulAc(), projeId]);
    const tip = await sahip().tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1');
    await sahip().sorgu(
      `INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, istasyon_id, birim_sure_dk, ayar_suresi_dk)
       VALUES ($1, 1, 10, $2, 'Deneme işleme', $3, 6, 30)`, [e!.id, tip!.id, ist!.id]);
    await sahip().sorgu('INSERT INTO finans_istasyon_maliyet (istasyon_id, saat_maliyeti, guncelleyen_id) VALUES ($1, 600, $2)', [ist!.id, yoneticiId]);
  }

  // Finans belgesi açılışı bu testin konusu değil: faturasız gider doğrudan yazılır (kategori faturasız türlerden).
  async function giderAc(kategori: string, tutar: number, kur = 1, paraBirimi = 'TRY'): Promise<number> {
    const b = await sahip().tek<{ id: number }>(
      `INSERT INTO finans_belge (yon, tur, kategori, aciklama, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani, olusturan_id)
       VALUES ('gider', 'faturasiz', $1, 'Deneme masraf', '2026-10-20', '2026-10-20', $2, $3, $4, 20, $5) RETURNING id`,
      [kategori, paraBirimi, kur, tutar, yoneticiId]);
    return b!.id;
  }

  async function projeAc(kod: string): Promise<Proje> {
    return tamam<Proje>(gonder(yonetici, '/projeler', { kod, ad: 'Deneme projesi', siparisId: siparis.id }));
  }
  const maliyet = (projeId: number) => tamam<ProjeMaliyetCevabi>(oku(yonetici, `/proje-maliyet/${projeId}`));

  before(async () => {
    ortam = await testVeritabaniKur('proje_maliyet_taban');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const y = await girisYap(null, null);
    yonetici = y.cerez;
    yoneticiId = y.id;
    planlama = (await girisYap('planlama_proje', y.id)).cerez;
    kalite = (await girisYap('kalite', y.id)).cerez;
    const firmaId = (await tamam<{ firma: { id: number } }>(gonder(yonetici, '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Müşteri', tur: 'musteri' }))).firma.id;
    const taslak = await tamam<SiparisAyrintisi>(gonder(yonetici, '/siparisler/ekle', {
      firmaId, musteriSiparisNo: null, siparisTarihi: '2026-10-19', termin: '2026-11-15', kdvOrani: '20', odemeKosulu: null, aciklama: null,
      satirlar: [{ malzemeNo: await mamulAc(), miktar: '10', birimFiyat: '250', termin: null, aciklama: null }],
    }));
    siparis = await tamam<SiparisAyrintisi>(gonder(yonetici, `/siparisler/${taslak.id}/onayla`, { surum: taslak.surum }));
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('PM-40 taban: emirsiz projede alınmaz; ilk taban gerekçesiz, yenileme gerekçeli; eski taban geçmişte kalır, satır değişmez', async () => {
    const p = await projeAc('PMT.1');
    assert.equal((await gonder(yonetici, `/proje-maliyet/${p.id}/taban`)).statusCode, 422);
    await isEmriAc(p.id);
    await tamam(gonder(yonetici, `/proje-maliyet/${p.id}/taban`, { gerekce: 'yok sayılır' }));
    let c = await maliyet(p.id);
    assert.equal(c.ozet.taban?.sira, 1);
    assert.equal(c.ozet.taban?.plan, 900);
    assert.equal(c.ozet.taban?.gerekce, null);
    assert.equal(c.ozet.taban?.isEmriSayisi, 1);
    assert.deepEqual(c.ozet.taban?.kalemler.find((k) => k.kalem === 'isleme'), { kalem: 'isleme', plan: 600 });
    assert.ok(c.ozet.taban?.kisiAd?.startsWith('Deneme'));

    const gerekcesiz = await gonder(yonetici, `/proje-maliyet/${p.id}/taban`, { gerekce: '  ' });
    assert.equal(gerekcesiz.statusCode, 422);
    assert.match(gerekcesiz.body, /gerekçe zorunlu/);
    await isEmriAc(p.id);
    await tamam(gonder(yonetici, `/proje-maliyet/${p.id}/taban`, { gerekce: 'Müşteri adedi artırdı' }));
    c = await maliyet(p.id);
    assert.deepEqual([c.ozet.taban?.sira, c.ozet.taban?.plan, c.ozet.taban?.gerekce], [2, 1800, 'Müşteri adedi artırdı']);
    assert.deepEqual(c.ozet.tabanGecmisi.map((t) => [t.sira, t.plan]), [[1, 900]]);
    // Fark: henüz gerçekleşen yok; tahmini son = kalan plan = 1800 (eksik kalemler dışında); fark 0.
    assert.deepEqual([c.ozet.sonGerceklesen, c.ozet.tahminiSon, c.ozet.fark], [0, 1800, 0]);

    await assert.rejects(sahip().sorgu('UPDATE proje_maliyet_taban SET plan = 1 WHERE proje_id = $1', [p.id]), /yalnız ekleme/);
    await assert.rejects(sahip().sorgu('DELETE FROM proje_maliyet_taban WHERE proje_id = $1', [p.id]), /yalnız ekleme/);
    await assert.rejects(
      sahip().sorgu("INSERT INTO proje_maliyet_taban (proje_id, sira, kalemler, eksik_kalemler, is_emri_sayisi, kisi_id) VALUES ($1, 3, '{}', '[]', 1, $2)", [p.id, yoneticiId]),
      /proje_maliyet_taban_yenileme_gerekceli/,
    );
  });

  test('PM-41 masraf: gider belgesi projeye (isteğe bağlı görevine) bağlanır; bir belge tek projede; iptal, faiz ve başka projenin görevi reddedilir', async () => {
    const p = await projeAc('PMT.2');
    const baska = await projeAc('PMT.3');
    const yonetim = await tamam<ProjeYonetimiCevabi>(gonder(yonetici, `/projeler/${p.id}/gorevler`, {
      ad: 'Numune ölçümü', planBaslangic: '2026-10-20', planBitis: '2026-10-25',
    }));
    const gorevId = yonetim.gorevler[0]!.id;
    const baskaGorev = (await tamam<ProjeYonetimiCevabi>(gonder(yonetici, `/projeler/${baska.id}/gorevler`, {
      ad: 'Başka görev', planBaslangic: '2026-10-20', planBitis: '2026-10-25',
    }))).gorevler[0]!.id;
    const personel = await giderAc('personel', 1000);
    const doviz = await giderAc('personel', 100, 35.5, 'EUR');
    const faiz = await giderAc('faiz', 50);

    await tamam(gonder(yonetici, `/proje-maliyet/${p.id}/masraflar`, { belgeId: personel, gorevId }));
    await tamam(gonder(yonetici, `/proje-maliyet/${p.id}/masraflar`, { belgeId: doviz }));
    assert.equal((await gonder(yonetici, `/proje-maliyet/${baska.id}/masraflar`, { belgeId: personel })).statusCode, 409);
    assert.equal((await gonder(yonetici, `/proje-maliyet/${p.id}/masraflar`, { belgeId: faiz })).statusCode, 422);
    assert.equal((await gonder(yonetici, `/proje-maliyet/${p.id}/masraflar`, { belgeId: await giderAc('personel', 5), gorevId: baskaGorev })).statusCode, 409);
    assert.equal((await gonder(yonetici, `/proje-maliyet/${p.id}/masraflar`, { belgeId: 999999 })).statusCode, 404);
    assert.equal((await gonder(yonetici, '/proje-maliyet/999999/masraflar', { belgeId: personel })).statusCode, 404);

    let c = await maliyet(p.id);
    // KDV hariç TL: 1000 + 100 x 35,5 = 4550. Emirsiz projede üretim gerçekleşeni bilinmez, masraf ayrı görünür.
    assert.deepEqual(c.ozet.masraflar.map((m) => [m.belgeId, m.tutarTl, m.gorevId, m.iptal]), [[personel, 1000, gorevId, false], [doviz, 3550, null, false]]);
    assert.equal(c.ozet.masrafToplami, 4550);
    assert.deepEqual([c.ozet.sonGerceklesen, c.ozet.fark], [null, null]);

    // Bağdan sonra iptal edilen belge listede kalır, toplama girmez.
    await sahip().sorgu("UPDATE finans_belge SET durum = 'iptal', iptal_zamani = now(), iptal_eden_id = $2 WHERE id = $1", [doviz, yoneticiId]);
    c = await maliyet(p.id);
    assert.equal(c.ozet.masraflar.find((m) => m.belgeId === doviz)?.iptal, true);
    assert.equal(c.ozet.masrafToplami, 1000);
    const iptalBelge = await giderAc('personel', 10);
    await sahip().sorgu("UPDATE finans_belge SET durum = 'iptal', iptal_zamani = now(), iptal_eden_id = $2 WHERE id = $1", [iptalBelge, yoneticiId]);
    assert.equal((await gonder(yonetici, `/proje-maliyet/${p.id}/masraflar`, { belgeId: iptalBelge })).statusCode, 422);

    const bag = c.ozet.masraflar.find((m) => m.belgeId === personel)!;
    await tamam(gonder(yonetici, `/proje-maliyet/masraflar/${bag.id}/kaldir`));
    assert.equal((await gonder(yonetici, `/proje-maliyet/masraflar/${bag.id}/kaldir`)).statusCode, 404);
    await tamam(gonder(yonetici, `/proje-maliyet/${baska.id}/masraflar`, { belgeId: personel }));
  });

  test('940 c yetki: projeler.yaz taban alır ve bağlar; tutarı yalnız finans.maliyet-oku görür; projeler.yaz olmayan 403; girişsiz 401', async () => {
    const p = await projeAc('PMT.4');
    await isEmriAc(p.id);
    await tamam(gonder(planlama, `/proje-maliyet/${p.id}/taban`));
    const belge = await giderAc('personel', 250);
    const planlamaSecenek = await tamam<MasrafSecenekleriCevabi>(oku(planlama, '/proje-maliyet/masraf-secenekleri?ara=Deneme'));
    assert.equal(planlamaSecenek.belgeler.find((b) => b.id === belge)?.tutarTl, null);
    const yoneticiSecenek = await tamam<MasrafSecenekleriCevabi>(oku(yonetici, '/proje-maliyet/masraf-secenekleri'));
    assert.equal(yoneticiSecenek.belgeler.find((b) => b.id === belge)?.tutarTl, 250);
    assert.ok(!yoneticiSecenek.belgeler.some((b) => b.kategori === 'faiz'));
    await tamam(gonder(planlama, `/proje-maliyet/${p.id}/masraflar`, { belgeId: belge }));
    assert.ok(!(await tamam<MasrafSecenekleriCevabi>(oku(yonetici, '/proje-maliyet/masraf-secenekleri'))).belgeler.some((b) => b.id === belge));
    // Maliyet okuması finans.maliyet-oku ister; yazan planlama tutarı oradan göremez.
    assert.equal((await oku(planlama, `/proje-maliyet/${p.id}`)).statusCode, 403);

    assert.equal((await gonder(kalite, `/proje-maliyet/${p.id}/taban`, { gerekce: 'Deneme' })).statusCode, 403);
    assert.equal((await gonder(kalite, `/proje-maliyet/${p.id}/masraflar`, { belgeId: belge })).statusCode, 403);
    assert.equal((await oku(kalite, '/proje-maliyet/masraf-secenekleri')).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: `/api/proje-maliyet/${p.id}/taban`, payload: {} })).statusCode, 401);
  });

  test('tekrar koruması: aynı istek kimliğiyle ikinci taban yeni satır açmaz', async () => {
    const p = await projeAc('PMT.5');
    await isEmriAc(p.id);
    const kimlik = randomUUID();
    const istek = () => app.inject({ method: 'POST', url: `/api/proje-maliyet/${p.id}/taban`, payload: {}, headers: { cookie: yonetici, 'istek-kimligi': kimlik } });
    assert.equal((await istek()).statusCode, 200);
    assert.equal((await istek()).statusCode, 200);
    const sayi = await sahip().tek<{ n: number }>('SELECT count(*)::int AS n FROM proje_maliyet_taban WHERE proje_id = $1', [p.id]);
    assert.equal(sayi?.n, 1);
  });
});
