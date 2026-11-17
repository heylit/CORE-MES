import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type {
  AcilisCevabi, ButceKullanimiCevabi, DegerlendirmeCevabi, KgFiyatiGecmisiCevabi, KgFiyatlariCevabi, MalzemeKgFiyatlariCevabi, SatinAlmaOzetiCevabi,
  SiparisTakibiCevabi, TalepKaydi as Talep, TalepGovdesi,
} from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kablola } from '../../kablolama.ts';

const PAROLA = 'dogru-parola-1';
type Cevap = Awaited<ReturnType<FastifyInstance['inject']>>;

// 3401-1 a: fiyat kapısı. Fiyat görür = satin-alma.fiyat-oku, yaz ya da onayla; yalnız satin-alma.oku (planlama) talebi, kalemi, tedarikçiyi,
// termini ve durumu görür, fiyatı görmez. Talaş satış fiyatı yalnız finans.maliyet-oku'ya gelir. Hepsi gerçek giriş ve gerçek rollerle sınanır.
describe('satın alma fiyat kapısı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let firmaA = 0;
  let katalog = '';
  const c: Record<'yonetici' | 'sa' | 'samuduru' | 'mudur' | 'plan' | 'planp' | 'muh', string> = { yonetici: '', sa: '', samuduru: '', mudur: '', plan: '', planp: '', muh: '' };
  const kisi: Record<string, number> = {};
  const vt = () => ortam!.vt;
  const giris = async (k: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown): Promise<Cevap> =>
    app.inject({ method: yontem, url: `/api${url}`, payload: payload as object | undefined, headers: yontem === 'POST' ? { cookie: cerez, 'istek-kimligi': randomUUID() } : { cookie: cerez } });
  const tamam = <T>(r: Cevap): T => { assert.equal(r.statusCode, 200, r.body); return r.json() as T; };
  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<string> {
    const rol = (await vt().tx((db) => db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu])))!;
    kisi[kullaniciAdi] = await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, id, rol.id);
      for (const r of k.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
      return id;
    });
    return giris(kullaniciAdi);
  }
  const kalem = (adi: string, miktar = '10') => ({ id: randomUUID(), katalogId: katalog, ad: adi, ozellik: '', miktar, birim: 'adet', kategori: '' });
  const yeniTalep = (alan: Partial<TalepGovdesi> = {}): TalepGovdesi => ({
    id: randomUUID(), baslik: 'Deneme talep', birim: null, talepEdenKisiId: null, oncelik: 'normal', ihtiyacTarihi: '2026-10-30', notlar: '',
    durum: 'taslak', iptalNedeni: '', agirliklar: null, kalemler: [kalem('Deneme rulman'), kalem('Deneme kayış', '4')], teklifIstekleri: [],
    teklifler: [], karar: null, onaylar: [], hareketler: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, metin: 'Talep açıldı' }],
    senaryolar: [], ...alan,
  });
  const teklif = (kalemler: { id: string }[]) => ({
    id: randomUUID(), firmaId: firmaA, tedarikciAdi: 'Deneme Tedarik A', teklifTarihi: '2026-10-05', gecerlilik: null,
    paraBirimi: 'TRY' as const, kur: null, iskontoYuzdesi: '3', nakliye: '7', digerMasraf: '2', teslimSekli: '', nakliyeDahil: true, terminGun: 7,
    vadeGun: 30, avansYuzdesi: '0', garantiAy: null, teknikUygun: true, notlar: 'Deneme gizli teklif notu', ilkToplam: null, revizyon: 0,
    fiyatlar: kalemler.map((k) => ({ kalemId: k.id, birimFiyat: '1234.5' })),
  });
  const govde = (t: Talep) => {
    const { no: _n, talepEdenAdi: _a, acanKisiId: _k, olusturma: _o, guncelleme: _g, ...g } = t as unknown as Record<string, unknown>;
    return g as Record<string, unknown> & { id: string };
  };
  const kaydet = (cerez: string, t: Record<string, unknown> & { id: string }) => istek(cerez, 'POST', `/satin-alma-talepleri/${t.id}/kaydet`, t);
  const onayKaydi = () => ({ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay' as const, dortGozsuz: false, notlar: 'Deneme gizli onay notu 777' });
  const acilis = async (cerez: string) => tamam<AcilisCevabi>(await istek(cerez, 'GET', '/satin-alma-acilis'));

  // Siparişi verilmiş talep: teklif fiyatlı, karar ve onay notlu, ödeme planı kurulmuş.
  let siparisli: Talep;
  let taslak: Talep;

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('satin_alma_fiyat');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await giris('yonetici');
    c.sa = await rolluKisi('satinalma', 'satin_alma');
    c.samuduru = await rolluKisi('samuduru', 'satin_alma_muduru');
    c.mudur = await rolluKisi('mudur', 'mudur');
    c.plan = await rolluKisi('planmuduru', 'planlama_muduru');
    c.planp = await rolluKisi('planproje', 'planlama_proje');
    c.muh = await rolluKisi('muhasebe', 'muhasebe_finans');
    const ayar = (await acilis(c.sa)).ayarlar;
    // Onay limiti basamağını yalnız yönetici (ayarlar.yaz) yazar.
    tamam(await istek(c.yonetici, 'POST', '/satin-alma-ayarlari/kaydet', {
      sirket: '', agirliklar: ayar.agirliklar, gecerlilikGun: 15, enAzTeklif: 3, fiyatUyariYuzdesi: '10',
      kurlar: [{ paraBirimi: 'TRY', aylikFaizYuzdesi: '0' }], kategoriler: [], birimler: [{ ad: 'Deneme birim', yillikButce: '5000' }],
      onayLimitleri: [{ azamiTutar: '50000', seviye: 'Deneme uzmanı', rolId: null }, { azamiTutar: null, seviye: 'Deneme müdürü', rolId: null }], surum: ayar.surum,
    }));
    firmaA = tamam<{ firma: { id: number } }>(await istek(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Tedarik A', tur: 'tedarikci' })).firma.id;
    tamam(await istek(c.yonetici, 'POST', '/satin-alma-tedarikcileri/kaydet', { firmaId: firmaA, puan: 4, notlar: '', kategoriler: [], degerlendirmeler: [], surum: null }));
    tamam(await istek(c.yonetici, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } }));
    const kimlik = 'fk-kart-1';
    tamam(await istek(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1001 }, com: { kod: 'HM-SAT-00001', ad: 'Deneme fikstür', birim: 'adet' }, onay: { durum: 'aktif' } },
      ozet: { benzersiz_anahtar: `hammadde|fiyat-kapisi|${kimlik}`, mukerrer_gerekcesi: null }, surum: null,
    }));
    const no = (await ortam.sahip.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kayit->'com'->>'kod' = 'HM-SAT-00001'"))!.no;
    katalog = tamam<{ id: string }>(await istek(c.sa, 'POST', '/satin-alma-katalogu/kaydet', { id: randomUUID(), malzemeNo: no, ozellik: '', notlar: '', takmaAdlari: [], surum: null })).id;

    const t = tamam<Talep>(await istek(c.sa, 'POST', '/satin-alma-talepleri/ac', yeniTalep()));
    const a = teklif(t.kalemler);
    const deg = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a] }));
    const ond = tamam<Talep>(await kaydet(c.sa, {
      ...govde(deg), durum: 'onayda', teklifler: [a],
      karar: { mod: 'tek', teklifId: a.id, bolunme: [], gerekce: 'Deneme gizli karar gerekçesi 888', kararVerenKisiId: kisi.satinalma!, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] },
    }));
    const onayli = tamam<Talep>(await kaydet(c.mudur, { ...govde(ond), onaylar: [onayKaydi()] }));
    siparisli = tamam<Talep>(await kaydet(c.sa, {
      ...govde(onayli), durum: 'siparis_verildi',
      karar: { ...onayli.karar!, siparisler: [{ teklifId: a.id, siparisNo: 'FK-1', siparisTarihi: '2026-10-07', beklenenTeslim: '2026-10-20' }] },
    }));
    taslak = tamam<Talep>(await istek(c.plan, 'POST', '/satin-alma-talepleri/ac', yeniTalep({ baslik: 'Deneme planlama taslağı' })));
  });
  after(async () => { await ortam?.kaldir(); });

  const bul = (a: AcilisCevabi, id: string) => a.talepler.find((x) => x.id === id)!;

  test('planlama talebi, kalemi, tedarikçiyi, termini ve durumu görür; teklif fiyatı, iskonto, karar gerekçesi, senaryo ve onay notu görmez', async () => {
    for (const cerez of [c.plan, c.planp]) {
      const t = bul(await acilis(cerez), siparisli.id);
      assert.deepEqual([t.no, t.durum, t.kalemler.map((k) => k.ad), t.karar?.siparisler.map((s) => s.beklenenTeslim)], [siparisli.no, 'siparis_verildi', ['Deneme rulman', 'Deneme kayış'], ['2026-10-20']]);
      assert.equal(t.teklifler.length, 1);
      const q = t.teklifler[0]!;
      assert.deepEqual([q.tedarikciAdi, q.terminGun, q.fiyatlar, q.iskontoYuzdesi, q.nakliye, q.digerMasraf, q.ilkToplam, q.kur, q.notlar], ['Deneme Tedarik A', 7, [], null, null, null, null, null, '']);
      assert.deepEqual([t.karar?.gerekce, t.karar?.sabitKurlar, t.senaryolar, t.onaylar.map((o) => o.notlar)], ['', [], [], ['']]);
    }
    // Aynı talep satın almacıda dolu.
    const s = bul(await acilis(c.sa), siparisli.id);
    assert.deepEqual([s.teklifler[0]!.fiyatlar.map((f) => f.birimFiyat), s.teklifler[0]!.iskontoYuzdesi, s.karar?.gerekce, s.onaylar[0]!.notlar],
      [['1234.5', '1234.5'], '3', 'Deneme gizli karar gerekçesi 888', 'Deneme gizli onay notu 777']);
  });

  test('ayarlarda bütçe ve onay limiti fiyat görende dolu, planlamada yok', async () => {
    const sa = (await acilis(c.sa)).ayarlar;
    assert.deepEqual(sa.birimler.map((b) => [b.ad, b.yillikButce]), [['Deneme birim', '5000.00']]);
    assert.ok(sa.onayLimitleri.length > 0);
    for (const cerez of [c.plan, c.planp]) {
      const p = (await acilis(cerez)).ayarlar;
      assert.deepEqual(p.birimler.map((b) => [b.ad, b.yillikButce]), [['Deneme birim', null]]);
      assert.deepEqual(p.onayLimitleri, []);
    }
  });

  test('tüm fiyat uçları: planlama 403, fiyat gören 200 (karşılaştırma, bütçe, analiz, kg fiyatı ailesi, teklif PDF ekleri)', async () => {
    const yollar = [
      `/satin-alma-talepleri/${siparisli.id}/degerlendirme`, '/satin-alma-butce-kullanimi?yil=2026', '/satin-alma-analiz',
      '/satin-alma-kg-fiyatlari', '/satin-alma-kg-fiyatlari/gecmis?kalite=DENEME', '/satin-alma-kg-fiyatlari/malzemeler?nolar=1',
      `/satin-alma-talepleri/${siparisli.id}/teklifler/${siparisli.teklifler[0]!.id}/ekler`,
    ];
    for (const yol of yollar) {
      for (const cerez of [c.plan, c.planp]) assert.equal((await istek(cerez, 'GET', yol)).statusCode, 403, `${yol} planlama`);
      for (const cerez of [c.sa, c.mudur, c.muh, c.yonetici]) assert.equal((await istek(cerez, 'GET', yol)).statusCode, 200, `${yol} fiyat gören`);
    }
    const d = tamam<DegerlendirmeCevabi>(await istek(c.sa, 'GET', `/satin-alma-talepleri/${siparisli.id}/degerlendirme`));
    assert.ok(Number(d.teklifler[0]!.toplam) > 0 && d.karar !== null);
    const b = tamam<ButceKullanimiCevabi>(await istek(c.sa, 'GET', '/satin-alma-butce-kullanimi?yil=2026')).birimler;
    assert.ok(b.length > 0);
  });

  test('sipariş takibi: planlama ödeme planı tutarını görmez, sipariş satırlarını görür; satın alma planı tutarlarıyla görür', async () => {
    const a = siparisli.karar!.siparisler[0]!.teklifId;
    const sa = tamam<SiparisTakibiCevabi>(await istek(c.sa, 'GET', `/satin-alma-talepleri/${siparisli.id}/siparis-takibi`)).siparisler.find((x) => x.teklifId === a)!;
    assert.ok(sa.odemePlani.length > 0 && sa.odemePlani.every((x) => Number(x.tutar) > 0), 'plan tekliften kurulmuş olmalı');
    for (const cerez of [c.plan, c.planp]) {
      const p = tamam<SiparisTakibiCevabi>(await istek(cerez, 'GET', `/satin-alma-talepleri/${siparisli.id}/siparis-takibi`)).siparisler.find((x) => x.teklifId === a)!;
      assert.deepEqual([p.odemePlani, p.satirIdleri.length], [[], sa.satirIdleri.length]);
    }
  });

  test('ana sayfa özeti: açık sipariş tutarı fiyat görende dolu, planlama yalnız sayıyı görür', async () => {
    const sa = tamam<SatinAlmaOzetiCevabi>(await istek(c.sa, 'GET', '/satin-alma/ozet'));
    assert.ok(Number(sa.acikSiparisTutari) > 0);
    for (const cerez of [c.plan, c.planp]) {
      const p = tamam<SatinAlmaOzetiCevabi>(await istek(cerez, 'GET', '/satin-alma/ozet'));
      assert.deepEqual([p.acikSiparisTutari, (p.acikSiparis ?? 0) > 0], [null, true]);
    }
  });

  test('planlama kendi taslağını fiyatsız görünümden kaydeder; teklif ekleyemez ve gizli fiyatı değiştiremez', async () => {
    const goruntu = bul(await acilis(c.plan), taslak.id);
    const kayit = tamam<Talep>(await kaydet(c.plan, { ...govde(goruntu as unknown as Talep), baslik: 'Deneme planlama taslağı düzeltildi' }));
    assert.equal(kayit.baslik, 'Deneme planlama taslağı düzeltildi');
    const sizdirma = { ...govde(kayit), teklifler: [teklif(kayit.kalemler)] };
    assert.equal((await kaydet(c.plan, sizdirma)).statusCode, 403);
    // Fiyatsız görünümü olduğu gibi geri gönderen planlama, siparişteki gizli fiyatı sıfırlayamaz (başkasının talebini zaten düzenleyemez).
    // Ekran fiyatsız görünümü geri gönderirken boş alanları sıfır yazar (tasiyici); sunucu yine de başkasının talebindeki değişikliği reddeder.
    const siparisGorunumu = bul(await acilis(c.plan), siparisli.id);
    const sifirli = { ...govde(siparisGorunumu as unknown as Talep), notlar: 'Deneme izinsiz',
      teklifler: siparisGorunumu.teklifler.map((q) => ({ ...q, iskontoYuzdesi: '0', nakliye: '0', digerMasraf: '0' })) };
    assert.equal((await kaydet(c.plan, sifirli)).statusCode, 403);
    const sonra = bul(await acilis(c.sa), siparisli.id);
    assert.deepEqual(sonra.teklifler[0]!.fiyatlar.map((f) => f.birimFiyat), ['1234.5', '1234.5']);
  });

  test('talaş satış fiyatı yalnız finans.maliyet-oku\'ya gelir: satın alma rolleri null, muhasebe/finans dolu', async () => {
    const g = (await vt().tx((db) => db.tek<{ g: string }>('SELECT current_date::text AS g')))!.g;
    const kimlik = 'fk-kalite-1';
    await ortam!.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('FKKG-', 0) ON CONFLICT (onek) DO NOTHING");
    const no = (await ortam!.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'FKKG-', 9001, 'aktif', $2, $3, $3) RETURNING no`,
      [kimlik, JSON.stringify({ id: kimlik, grade: 'DENEME-FK', form: 'cubuk', com: { ad: 'Deneme FK', birim: 'kg' } }), yoneticiId],
    ))!.no;
    tamam(await istek(c.sa, 'POST', '/satin-alma-kg-fiyatlari/ekle', { satirlar: [{ kaliteKodu: 'DENEME-FK', form: 'cubuk', kgFiyati: '100', talasKgFiyati: '30', paraBirimi: 'TRY', gecerlilik: g, aciklama: '' }] }));
    const liste = async (cerez: string) => tamam<KgFiyatlariCevabi>(await istek(cerez, 'GET', '/satin-alma-kg-fiyatlari')).fiyatlar.find((f) => f.kaliteKodu === 'DENEME-FK')!;
    const gecmis = async (cerez: string) => tamam<KgFiyatiGecmisiCevabi>(await istek(cerez, 'GET', '/satin-alma-kg-fiyatlari/gecmis?kalite=DENEME-FK&form=cubuk')).girisler[0]!;
    const malzeme = async (cerez: string) => tamam<MalzemeKgFiyatlariCevabi>(await istek(cerez, 'GET', `/satin-alma-kg-fiyatlari/malzemeler?nolar=${String(no)}`)).malzemeler[0]!;
    for (const cerez of [c.sa, c.samuduru]) {
      const [l, h, m] = [await liste(cerez), await gecmis(cerez), await malzeme(cerez)];
      assert.deepEqual([Number(l.kgFiyati), l.talasKgFiyati, l.tryTalasKgFiyati, h.talasKgFiyati, h.tryTalasKgFiyati, m.talasKgFiyati, m.tryTalasKgFiyati], [100, null, null, null, null, null, null], 'satın alma talaşı görmez');
    }
    // finans.maliyet-oku olan: muhasebe/finans ve yönetici talaşı görür; kg fiyatı dahil dolu.
    for (const cerez of [c.muh, c.mudur, c.yonetici]) {
      const [l, h, m] = [await liste(cerez), await gecmis(cerez), await malzeme(cerez)];
      assert.deepEqual([Number(l.talasKgFiyati), Number(h.talasKgFiyati), Number(m.talasKgFiyati)], [30, 30, 30]);
    }
  });

  // Yetkisiz cevap JSON olarak taranır: fiyat, tutar, kg fiyatı, bütçe ve değer adlı alanlarda dolu (null olmayan) sayı ya da metin kalmaz.
  const FIYAT_ALANI = /fiyat|tutar|kgFiyat|butce|deger/i;
  // İzinli istisnalar (kapı, fiyat değil): uyarı eşiği ayarı yüzdedir; sıfırlayan değil, "aşağı" yönlü eşik tutar taşımaz.
  const IZINLI = new Set(['fiyatUyariYuzdesi']);
  // Malzeme kartının özellik çifti ({ ad, deger }): "deger" fiyat değil, kalite ya da ölçü metnidir.
  const IZINLI_YOL = /\.(ayrinti|tedarikciye)\[\d+\]\.deger$/;
  function doluFiyatAlanlari(deger: unknown, yol = ''): string[] {
    if (Array.isArray(deger)) return deger.flatMap((x, i) => doluFiyatAlanlari(x, `${yol}[${String(i)}]`));
    if (deger === null || typeof deger !== 'object') return [];
    return Object.entries(deger).flatMap(([ad, v]) => {
      const tam = `${yol}.${ad}`;
      if (v !== null && typeof v === 'object') return doluFiyatAlanlari(v, tam);
      return FIYAT_ALANI.test(ad) && !IZINLI.has(ad) && !IZINLI_YOL.test(tam) && v !== null && v !== '' && v !== false ? [`${tam}=${String(v)}`] : [];
    });
  }

  test('tarama: planlamanın okuyabildiği bütün satın alma cevaplarında dolu fiyat alanı kalmaz; satın almacıda aynı cevaplar dolu (tarayıcı kör değil)', async () => {
    const yollar = [
      '/satin-alma-acilis', '/satin-alma/ozet', `/satin-alma-talepleri/${siparisli.id}/siparis-takibi`, `/satin-alma-talepleri/${siparisli.id}/kart-ayrintilari`,
      '/satin-alma-dis-operasyonlar', '/satin-alma-onayli-liste', '/satin-alma-tedarik-terminleri', '/satin-alma-menu-sayaclari', '/satin-alma-fason-sureleri?sonGun=90',
      '/satin-alma-taleplerim', '/satin-alma-on-talepleri', '/satin-alma-acik-emirler', '/satin-alma-talepleri/proje-secenekleri',
    ];
    let dolu = 0;
    for (const yol of yollar) {
      const r = await istek(c.plan, 'GET', yol);
      assert.equal(r.statusCode, 200, `${yol}: ${r.body.slice(0, 200)}`);
      assert.deepEqual(doluFiyatAlanlari(r.json()), [], `${yol} planlamada fiyat alanı sızdırıyor`);
      dolu += doluFiyatAlanlari((await istek(c.sa, 'GET', yol)).json()).length;
    }
    assert.ok(dolu > 0, 'satın almacıda en az bir dolu fiyat alanı bulunmalı');
    const duz = JSON.stringify((await istek(c.plan, 'GET', '/satin-alma-acilis')).json());
    assert.doesNotMatch(duz, /1234\.5|gizli karar|gizli onay|gizli teklif/);
  });
});
