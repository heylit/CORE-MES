import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { logoBaglamaSirasi } from '../siparisler/disari.ts';
import { kararlariSifirla, logoKontrol, logoKontrolluGonder } from './kontrollu-gonder.ts';
import { kopruIstemcisiKur, type KopruIstemcisi } from './kopru.ts';
import { BELGE_ARAMA_SONUC_SINIRI, kontrolEdilebilirMi, kontrolKarari, kontrolSinifi, SONUCU_BILINMIYOR } from './kurallar.ts';
import type { LogoBelgeBulgusuHam } from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { tekKayitBelleginiSifirla, tekKayitOku, tekKayitYaz } from './tek-kayit.ts';

// 3626: sonucu bilinmeyen belgeyi önce Logo'da arayıp gönderme ve okumada tek kayıt. Köprü sahte, Logo'ya yazma yok; veri uydurmadır (ORN-).
const PAROLA = 'dogru-parola-1';

const bulgu = (o: Partial<LogoBelgeBulgusuHam>): LogoBelgeBulgusuHam => ({
  logoKayitNo: 1, no: 'ORN-1', belgeNo: null, tarih: null, cariKodu: null, cariAdi: null, projeKodu: null, projeAdi: null, aciklama: null, tutar: null,
  dovizTuru: null, iptal: false, satirlar: [], satirSayisi: 0, ...o,
});

describe('Sonucu bilinmeyen belge kuralları (3626, saf)', () => {
  test('KG-1 yalnız tam eşit numara sayılır; benzer numara "yok"tur; sınıra dayanan arama "yok" demez; birden çok ya da iptal kayıt bulundu sayılmaz', () => {
    assert.equal(kontrolKarari('ORN-TK-1', []).karar, 'yok');
    assert.equal(kontrolKarari('ORN-TK-1', [bulgu({ no: 'ORN-TK-10' }), bulgu({ no: 'ORN-TK-1A', logoKayitNo: 2 })]).karar, 'yok', 'numarayı parça olarak içeren kayıt eşleşmez');
    const k = kontrolKarari('orn-tk-1', [bulgu({ no: 'ORN-TK-1', logoKayitNo: 7 })]);
    assert.deepEqual([k.karar, k.karar === 'bulundu' ? k.bulgu.logoKayitNo : null], ['bulundu', 7], 'büyük küçük harf ayrımı yok');
    const sinir = Array.from({ length: BELGE_ARAMA_SONUC_SINIRI }, (_, i) => bulgu({ no: `ORN-TK-1${String(i)}`, logoKayitNo: i + 1 }));
    assert.equal(kontrolKarari('ORN-TK-1', sinir).karar, 'yapilamadi', 'sonuç sınıra dayandıysa yokluk söylenemez');
    assert.equal(kontrolKarari('ORN-TK-1', [bulgu({ no: 'ORN-TK-1' }), bulgu({ no: 'ORN-TK-1', logoKayitNo: 2 })]).karar, 'yapilamadi');
    assert.equal(kontrolKarari('ORN-TK-1', [bulgu({ no: 'ORN-TK-1', iptal: true })]).karar, 'yapilamadi');
  });

  test('KG-2 kontrol yalnız Logo\'da aranabilen belge türünde ve belirsiz ya da "sonucu bilinmiyor" satırında açılır', () => {
    const g = (belgeTuru: string, sonSonuc: Parameters<typeof kontrolEdilebilirMi>[0]['sonSonuc'], sonHata: string | null = null, islem = 'gonder') => ({ belgeTuru, islem, sonSonuc, sonHata });
    assert.equal(kontrolEdilebilirMi(g('talep', 'belirsiz')), true);
    assert.equal(kontrolEdilebilirMi(g('siparisler-teklifi', 'reddedildi', `${SONUCU_BILINMIYOR} CORE'a yazılamadı.`)), true);
    assert.equal(kontrolEdilebilirMi(g('talep', 'reddedildi', 'Logo reddetti: cari yok')), false, 'gerçek ret kontrol istemez');
    assert.equal(kontrolEdilebilirMi(g('talep', 'ulasilamadi')), false);
    assert.equal(kontrolEdilebilirMi(g('talep', 'gonderildi')), false);
    assert.equal(kontrolEdilebilirMi(g('malzeme', 'belirsiz')), false, 'kendiliğinden önce "var mı" okunur');
    assert.equal(kontrolEdilebilirMi(g('sarf-fisi', 'belirsiz')), false, 'fişte numarayla bulma yolu yok');
    assert.equal(kontrolEdilebilirMi(g('talep', 'belirsiz', null, 'pasif')), false);
    assert.deepEqual(['talep', 'malzeme', 'proje', 'siparis', 'hizmet', 'sarf-fisi'].map(kontrolSinifi), ['ara', 'kendiliginden', 'kendiliginden', 'kendiliginden', 'yok', 'yok']);
  });
});

describe('Logo\'da kontrol et ve gönder, sahte köprüyle (3626; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kopru: SahteKopru;
  let yoneticiId = 0;
  let teklifId = 0;
  let teklifSirasi = 0;
  let teklifNo = '';
  let talepSayiId = 0;
  let talepNo = '';
  let yonetici = '';
  let gormeyen = '';
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const k = () => kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: 5000 });
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  async function yaz<T>(yol: string, govde: unknown): Promise<T> {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: yonetici, 'istek-kimligi': randomUUID() }, payload: govde as object });
    assert.equal(c.statusCode, 200, `${yol}: ${c.body}`);
    return c.json() as T;
  }
  const ayar = async (anahtar: string, deger: boolean): Promise<void> => {
    await yaz(`/ayarlar/${anahtar}/degistir`, { deger });
  };
  const satir = (tur: string, no: number) => vt().tek<{ sonuc: string | null; niyet: Date | null; sonraki: Date | null; kayit: string | null; deneme: number; hata: string | null }>(
    'SELECT son_sonuc AS sonuc, niyet_zamani AS niyet, sonraki_deneme AS sonraki, logo_kayit_no AS kayit, deneme_sayisi AS deneme, son_hata AS hata FROM logo_giden WHERE belge_turu = $1 AND belge_no = $2', [tur, no]);
  const giden = (tur: string, no: number, sonuc: string, ek: { hata?: string | null; once?: string } = {}) => {
    const basari = sonuc === 'gonderildi';
    return vt().sorgu(
      `INSERT INTO logo_giden (belge_turu, belge_no, niyet_zamani, deneme_sayisi, ardisik_hata, son_deneme, son_sonuc, son_hata, logo_kayit_no, sonraki_deneme)
       VALUES ($1, $2, ${basari ? 'NULL' : "now() - interval '10 minutes'"}, 1, 1, now() - ($4::text)::interval, $3, $5, $6, ${sonuc === 'belirsiz' ? "now() - interval '5 minutes'" : 'NULL'})`,
      [tur, no, sonuc, ek.once ?? '10 minutes', basari ? null : ek.hata ?? 'Deneme hatası', basari ? '5' : null]);
  };
  const belgeler = (): Record<string, unknown>[] => kopru.logoBelgeleri;
  const yazmaIstegi = () => kopru.istekler.filter((i) => i.yontem !== 'GET');

  before(async () => {
    ortam = await testVeritabaniKur('logokontrollu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'kg-yonetici', parola: PAROLA }));
    const kisi = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Gormeyen', kullaniciAdi: 'kg-gormeyen', parola: PAROLA }));
    const rol = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('kg_gormeyen', 'Gormeyen') RETURNING id");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'saglik.ayrinti-oku')", [rol!.id]);
    await vt().sorgu('UPDATE kisi_rolu SET rol_id = $1 WHERE kisi_id = $2', [rol!.id, kisi]);
    yonetici = await giris('kg-yonetici');
    gormeyen = await giris('kg-gormeyen');
    const { sahip } = ortam;
    // Talep: giden kutusunun belge numarası talebin sayı kimliğidir.
    talepNo = 'TL-ORN-KG-1';
    talepSayiId = (await sahip.tek<{ sayi: number }>(
      `INSERT INTO satin_alma_talep (id, no, baslik, talep_eden_kisi_id, acan_kisi_id) VALUES ($1, $2, 'ORN talep', $3, $3) RETURNING sayi_id AS sayi`,
      [randomUUID(), talepNo, yoneticiId]))!.sayi;
    // Satış teklifi ve Logo sırası (belge-ara.test.ts kurulumu).
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KG-', 0) ON CONFLICT DO NOTHING");
    const mamul = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kg-1', 'mamul', 'KG-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'kg-1', com: { ad: 'ORN mamul', birim: 'adet' } }), yoneticiId]))!.no;
    const firmaId = (await yaz<{ firma: { id: number } }>('/musteri-tedarikci/firmalar/ekle', { ad: 'ORN kontrol firma', tur: 'musteri', logoCariKodu: 'ORN-C-2001' })).firma.id;
    const t = await yaz<{ id: number; surum: number; satirlar: { id: number }[] }>('/siparisler/teklifler/ekle', {
      firmaId, baslik: 'ORN kontrol', istenenTarih: null, aciklama: null, satirlar: [{ malzemeNo: mamul, tanim: 'ORN parça', miktar: '3' }],
    });
    await yaz(`/siparisler/teklifler/${String(t.id)}/surum-ver`, { surum: t.surum, fiyatlar: [{ satirId: t.satirlar[0]!.id, birimFiyat: '50' }], iskontoOrani: '0' });
    teklifId = t.id;
    teklifSirasi = (await sahip.tek<{ id: number }>("SELECT id FROM siparisler_logo_gonderim WHERE tur = 'teklif' AND teklif_id = $1", [teklifId]))!.id;
    teklifNo = (await vt().tx((db) => logoBaglamaSirasi(db, 'teklif', teklifId)))!.no;
    await ayar('logo.baglanti', true);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    kopru = await sahteKopruAc();
    kararlariSifirla();
    tekKayitBelleginiSifirla();
    await vt().sorgu('DELETE FROM logo_giden');
    await ayar('logo.belge-aramasi', true);
  });
  afterEach(async () => { await kopru.kapat(); });

  test('KG-3 talep: Logo\'da yoksa sıraya girer (eski niyet silinir, deneme geçmişi kalır); köprüye yalnız arama GET\'i gider, yazma yok', async () => {
    await giden('talep', talepSayiId, 'belirsiz', { hata: 'Köprü bağlantısı koptu; işlenip işlenmediği bilinmiyor.' });
    belgeler().push({ type: 'demand', logicalRef: 31, number: 'TL-ORN-KG-10', arpCode: null });
    const kontrol = await logoKontrol(vt(), k(), yoneticiId, { belge: 'talep', no: talepSayiId, islem: 'gonder' });
    assert.deepEqual([kontrol.karar, kontrol.logoKayitNo], ['yok', null], 'numarasını parça olarak içeren başka talep eşleşmez');
    assert.deepEqual([...new Set(kopru.istekler.map((i) => i.yol))], ['/api/Document/search']);
    assert.equal((await satir('talep', talepSayiId))?.niyet !== null, true, 'kontrol hiçbir şey yazmaz');
    const r = await vt().tx((db) => logoKontrolluGonder(db, k(), yoneticiId, { belge: 'talep', no: talepSayiId, islem: 'gonder' }, new Date()));
    assert.equal(r.sonuc, 'gonderime-alindi');
    const s = await satir('talep', talepSayiId);
    assert.equal(s?.niyet, null, 'eski niyet silinir: tur yeni niyet yazıp gönderir');
    assert.ok(s?.sonraki !== null && s.sonraki.getTime() <= Date.now(), 'sonraki deneme şimdi');
    assert.equal(s?.deneme, 1, 'deneme geçmişi kalır');
    assert.deepEqual(yazmaIstegi(), [], 'Logo\'ya yazma isteği yok');
    const ikinci = await vt().tx((db) => logoKontrolluGonder(db, k(), yoneticiId, { belge: 'talep', no: talepSayiId, islem: 'gonder' }, new Date()));
    assert.equal(ikinci.sonuc, 'degisti', 'karar bir kez uygulanır');
  });

  test('KG-3b onayda göndermeden hemen önce yeniden aranır: arada Logo\'ya girilen belge gönderilmez, köprü yanıtsızsa da belgeye dokunulmaz', async () => {
    await giden('talep', talepSayiId, 'belirsiz');
    const kimlik = { belge: 'talep', no: talepSayiId, islem: 'gonder' as const };
    assert.equal((await logoKontrol(vt(), k(), yoneticiId, kimlik)).karar, 'yok');
    belgeler().push({ type: 'demand', logicalRef: 32, number: talepNo, arpCode: null });
    const r = await vt().tx((db) => logoKontrolluGonder(db, k(), yoneticiId, kimlik, new Date()));
    assert.equal(r.sonuc, 'degisti');
    assert.match(r.ileti, /bu arada belge çıktı.*gönderilmedi/);
    const s = await satir('talep', talepSayiId);
    assert.ok(s?.niyet !== null && (s?.sonraki?.getTime() ?? 0) < Date.now() - 4 * 60_000, 'satıra dokunulmadı: niyet duruyor, sonraki deneme şimdiye çekilmedi');
    assert.deepEqual(yazmaIstegi(), []);
    belgeler().length = 0;
    assert.equal((await logoKontrol(vt(), k(), yoneticiId, kimlik)).karar, 'yok');
    kopru.senaryo = 'yetkisiz';
    const y = await vt().tx((db) => logoKontrolluGonder(db, k(), yoneticiId, kimlik, new Date()));
    kopru.senaryo = 'basari';
    assert.equal(y.sonuc, 'degisti');
    assert.match(y.ileti, /yeniden sorulamadı/);
    assert.equal((await satir('talep', talepSayiId))?.niyet !== null, true, 'satıra dokunulmadı');
    // Yardımcı yanıt vermezse onay sunucu hatasına düşmez: kısa sürede "yanıt vermedi" döner, belgeye dokunulmaz.
    assert.equal((await logoKontrol(vt(), k(), yoneticiId, kimlik)).karar, 'yok');
    const askida = { ...k(), belgeAra: () => new Promise<never>(() => undefined) } as unknown as KopruIstemcisi;
    const t0 = Date.now();
    const z = await vt().tx((db) => logoKontrolluGonder(db, askida, yoneticiId, kimlik, new Date(), 50));
    assert.ok(Date.now() - t0 < 2000);
    assert.equal(z.sonuc, 'degisti');
    assert.match(z.ileti, /Logo yanıt vermedi/);
    assert.equal((await satir('talep', talepSayiId))?.niyet !== null, true, 'satıra dokunulmadı');
  });

  test('KG-4 kalkanın "sonucu bilinmiyor" reddi (durdu görünen satır) de kontrol edilir; gerçek ret kontrol istemez', async () => {
    await giden('talep', talepSayiId, 'reddedildi', { hata: `${SONUCU_BILINMIYOR} CORE'a yazılamadı.` });
    const kontrol = await logoKontrol(vt(), k(), yoneticiId, { belge: 'talep', no: talepSayiId, islem: 'gonder' });
    assert.equal(kontrol.karar, 'yok');
    assert.equal((await vt().tx((db) => logoKontrolluGonder(db, k(), yoneticiId, { belge: 'talep', no: talepSayiId, islem: 'gonder' }, new Date()))).sonuc, 'gonderime-alindi');
    assert.notEqual((await satir('talep', talepSayiId))?.sonraki, null);
    await vt().sorgu('DELETE FROM logo_giden');
    await giden('talep', talepSayiId, 'reddedildi', { hata: 'Logo reddetti: cari yok' });
    const ret = await logoKontrol(vt(), k(), yoneticiId, { belge: 'talep', no: talepSayiId, islem: 'gonder' });
    assert.equal(ret.karar, 'yapilamadi');
    assert.match(ret.ileti, /belirsiz değil/);
  });

  test('KG-5 talep Logo\'da bulunursa gönderilmez; satır eşlemesi olmadığı için bağlanmaz ve belgeye dokunulmaz', async () => {
    await giden('talep', talepSayiId, 'belirsiz');
    belgeler().push({ type: 'demand', logicalRef: 32, number: talepNo, arpCode: null });
    const kontrol = await logoKontrol(vt(), k(), yoneticiId, { belge: 'talep', no: talepSayiId, islem: 'gonder' });
    assert.equal(kontrol.karar, 'yapilamadi');
    assert.match(kontrol.ileti, /Logo'da var \(kayıt 32\).*eşlenemediği/);
    const r = await vt().tx((db) => logoKontrolluGonder(db, k(), yoneticiId, { belge: 'talep', no: talepSayiId, islem: 'gonder' }, new Date()));
    assert.equal(r.sonuc, 'degisti');
    const s = await satir('talep', talepSayiId);
    assert.deepEqual([s?.sonuc, s?.kayit], ['belirsiz', null]);
    assert.deepEqual(yazmaIstegi(), []);
  });

  test('KG-6 satış teklifi Logo\'da bulunursa eşlenir ve gönderilmez; başka cari, iptal ve başka belgeye bağlı kayıt eşlenmez', async () => {
    await giden('siparisler-teklifi', teklifSirasi, 'belirsiz');
    belgeler().push({ type: 'salesOffer', logicalRef: 77, number: teklifNo, arpCode: 'ORN-C-9999' });
    const farkli = await logoKontrol(vt(), k(), yoneticiId, { belge: 'siparisler-teklifi', no: teklifSirasi, islem: 'gonder' });
    assert.equal(farkli.karar, 'yapilamadi');
    assert.match(farkli.ileti, /Cari farklı/);
    belgeler().length = 0;
    belgeler().push({ type: 'salesOffer', logicalRef: 77, number: teklifNo, arpCode: 'ORN-C-2001', cancelled: true });
    assert.equal((await logoKontrol(vt(), k(), yoneticiId, { belge: 'siparisler-teklifi', no: teklifSirasi, islem: 'gonder' })).karar, 'yapilamadi');
    belgeler().length = 0;
    belgeler().push({ type: 'salesOffer', logicalRef: 77, number: teklifNo, arpCode: 'ORN-C-2001' });
    await vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no, son_deneme, son_sonuc, logo_kayit_no) VALUES ('siparisler-teklifi', $1, now(), 'gonderildi', '77')`, [teklifSirasi + 900]);
    const bagli = await logoKontrol(vt(), k(), yoneticiId, { belge: 'siparisler-teklifi', no: teklifSirasi, islem: 'gonder' });
    assert.equal(bagli.karar, 'yapilamadi');
    assert.match(bagli.ileti, /Başka bir CORE belgesine bağlı/);
    await vt().sorgu('DELETE FROM logo_giden WHERE belge_no = $1', [teklifSirasi + 900]);
    const bul = await logoKontrol(vt(), k(), yoneticiId, { belge: 'siparisler-teklifi', no: teklifSirasi, islem: 'gonder' });
    assert.deepEqual([bul.karar, bul.logoKayitNo], ['bulundu', '77']);
    const onceki = kopru.istekler.length;
    const r = await vt().tx((db) => logoKontrolluGonder(db, k(), yoneticiId, { belge: 'siparisler-teklifi', no: teklifSirasi, islem: 'gonder' }, new Date()));
    assert.deepEqual([r.sonuc, r.logoKayitNo], ['eslendi', '77']);
    assert.equal(kopru.istekler.length, onceki, 'eşlemede köprüye hiç istek gitmez');
    assert.deepEqual(yazmaIstegi(), [], 'Logo\'ya ekleme isteği yok');
    const s = await satir('siparisler-teklifi', teklifSirasi);
    assert.deepEqual([s?.sonuc, s?.kayit, s?.niyet, s?.sonraki], ['zaten-vardi', '77', null, null]);
    const sira = await ortam!.sahip.tek<{ durum: string; kayit: string | null }>('SELECT durum, logo_kayit_no AS kayit FROM siparisler_logo_gonderim WHERE id = $1', [teklifSirasi]);
    assert.deepEqual([sira?.durum, sira?.kayit], ['gonderildi', '77'], 'Siparişler\'in Logo sırası da gönderildi olur');
  });

  test('KG-7 kontrol yapılamayınca belgeye dokunulmaz: arama kapalı, köprü yok, yardımcı yanıtsız, 365 günden eski, belirsiz olmayan, kendiliğinden yinelenen ve numarasız tür', async () => {
    await giden('talep', talepSayiId, 'belirsiz');
    const kimlik = { belge: 'talep', no: talepSayiId, islem: 'gonder' as const };
    await ayar('logo.belge-aramasi', false);
    const kapali = await logoKontrol(vt(), k(), yoneticiId, kimlik);
    assert.equal(kapali.karar, 'yapilamadi');
    assert.match(kapali.ileti, /belge araması/);
    assert.equal(kopru.istekler.length, 0, 'ayar kapalıyken köprüye istek yok');
    await ayar('logo.belge-aramasi', true);
    assert.match((await logoKontrol(vt(), null, yoneticiId, kimlik)).ileti, /tanımlı değil/);
    kopru.senaryo = 'yetkisiz';
    const yanitsiz = await logoKontrol(vt(), k(), yoneticiId, kimlik);
    assert.equal(yanitsiz.karar, 'yapilamadi');
    assert.match(yanitsiz.ileti, /sorulamadı/);
    kopru.senaryo = 'basari';
    await vt().sorgu("UPDATE logo_giden SET son_deneme = now() - interval '1 minute' WHERE belge_turu = 'talep'");
    const onceki = kopru.istekler.length;
    assert.match((await logoKontrol(vt(), k(), yoneticiId, kimlik)).ileti, /Son deneme yeni.*dakika sonra yeniden kontrol edin/);
    assert.equal(kopru.istekler.length, onceki, 'bekleme dolmadan köprüye sorulmaz (Logo hâlâ işliyor olabilir)');
    await vt().sorgu("UPDATE logo_giden SET son_deneme = now() - interval '400 days' WHERE belge_turu = 'talep'");
    assert.match((await logoKontrol(vt(), k(), yoneticiId, kimlik)).ileti, /365 günden eski/);
    await vt().sorgu('DELETE FROM logo_giden');
    await giden('malzeme', 5, 'belirsiz');
    assert.match((await logoKontrol(vt(), k(), yoneticiId, { belge: 'malzeme', no: 5, islem: 'gonder' })).ileti, /kendiliğinden yeniden denenir/);
    await giden('talep', 6, 'gonderildi');
    assert.match((await logoKontrol(vt(), k(), yoneticiId, { belge: 'talep', no: 6, islem: 'gonder' })).ileti, /belirsiz değil/);
    await vt().sorgu(`INSERT INTO logo_malzeme_fisi_giden (belge_turu, belge_no, bekleyen_degisiklik, deneme_sayisi, ardisik_hata, son_deneme, son_sonuc, son_hata, sonraki_deneme)
      VALUES ('sarf-fisi', 7, 1, 1, 1, now(), 'belirsiz', 'x', now())`);
    assert.match((await logoKontrol(vt(), k(), yoneticiId, { belge: 'sarf-fisi', no: 7, islem: 'gonder' })).ileti, /numarayla kontrol yolu yok/);
    assert.equal((await logoKontrol(vt(), k(), yoneticiId, { belge: 'talep', no: 999, islem: 'gonder' })).karar, 'yapilamadi', 'giden kutusunda olmayan belge');
    assert.deepEqual(yazmaIstegi(), []);
    const s = await satir('malzeme', 5);
    assert.equal(s?.sonuc, 'belirsiz', 'hiçbir satır değişmedi');
  });

  test('KG-8 karar yoksa, eskidiyse ya da arada satır değiştiyse uygulanmaz; başkasının kararı kullanılmaz', async () => {
    await giden('talep', talepSayiId, 'belirsiz');
    const kimlik = { belge: 'talep', no: talepSayiId, islem: 'gonder' as const };
    const dene = (kisi: number, an = new Date()) => vt().tx((db) => logoKontrolluGonder(db, k(), kisi, kimlik, an));
    assert.equal((await dene(yoneticiId)).sonuc, 'degisti', 'önce kontrol gerekir');
    assert.equal((await logoKontrol(vt(), k(), yoneticiId, kimlik)).karar, 'yok');
    assert.equal((await dene(yoneticiId + 1)).sonuc, 'degisti', 'karar kontrolü isteyen kişinindir');
    assert.equal((await dene(yoneticiId, new Date(Date.now() + 3 * 60_000))).sonuc, 'degisti', 'karar iki dakikada eskir');
    assert.equal((await logoKontrol(vt(), k(), yoneticiId, kimlik)).karar, 'yok');
    await vt().sorgu("UPDATE logo_giden SET son_sonuc = 'gonderildi', logo_kayit_no = '5', son_hata = NULL, niyet_zamani = NULL, sonraki_deneme = NULL WHERE belge_turu = 'talep'");
    const r = await dene(yoneticiId);
    assert.equal(r.sonuc, 'degisti', 'arada tur sonuç yazdıysa dokunulmaz');
    assert.deepEqual([(await satir('talep', talepSayiId))?.sonuc, (await satir('talep', talepSayiId))?.sonraki], ['gonderildi', null]);
  });

  test('KG-9 uç: yetkisiz 403; gönderme kararsız "degisti" döner ve denetim kaydı yazar; kontrol köprü yokken yapılamadı der', async () => {
    await giden('talep', talepSayiId, 'belirsiz');
    const sorgu = `belge=talep&no=${String(talepSayiId)}`;
    const oku = (cerez: string) => app.inject({ method: 'GET', url: `/api/logo/giden/kontrol?${sorgu}`, headers: { cookie: cerez } });
    const gonder = (cerez: string) => app.inject({
      method: 'POST', url: '/api/logo/giden/kontrollu-gonder', headers: { cookie: cerez, 'istek-kimligi': randomUUID() }, payload: { belge: 'talep', no: talepSayiId },
    });
    assert.equal((await oku(gormeyen)).statusCode, 403);
    assert.equal((await gonder(gormeyen)).statusCode, 403);
    const g = await oku(yonetici);
    assert.equal(g.statusCode, 200, g.body);
    assert.equal(g.json<{ karar: string }>().karar, 'yapilamadi', 'testte ortam köprüsü yoktur');
    const p = await gonder(yonetici);
    assert.equal(p.statusCode, 200, p.body);
    assert.equal(p.json<{ sonuc: string }>().sonuc, 'degisti');
    assert.equal((await app.inject({ method: 'GET', url: '/api/logo/giden/kontrol?belge=talep', headers: { cookie: yonetici } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'GET', url: '/api/logo/giden/kontrol?belge=yok&no=1', headers: { cookie: yonetici } })).statusCode, 422);
    const iz = await vt().tek<{ sayi: number }>("SELECT count(*)::int AS sayi FROM denetim_kaydi WHERE yol = '/logo/giden/kontrollu-gonder' AND kisi_id = $1", [yoneticiId]);
    assert.equal(iz?.sayi, 1, 'kim ve ne zaman denetim kaydında');
    const izleme = (await app.inject({ method: 'GET', url: '/api/logo/giden', headers: { cookie: yonetici } })).json<{ belgeler: { belge: string; kontrolEdilebilir: boolean; neYapmali: string }[] }>();
    const b = izleme.belgeler.find((x) => x.belge === 'talep');
    assert.equal(b?.kontrolEdilebilir, true);
    assert.match(b?.neYapmali ?? '', /kontrol et ve gönder/);
  });
});

describe('Okumada tek kayıt, sahte köprüyle (3626; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kopru: SahteKopru;
  let yonetici = '';
  let yoneticiId = 0;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const k = () => kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: 5000 });
  const ayar = async (anahtar: string, deger: boolean): Promise<void> => {
    const c = await app.inject({ method: 'POST', url: `/api/ayarlar/${anahtar}/degistir`, headers: { cookie: yonetici, 'istek-kimligi': randomUUID() }, payload: { deger } });
    assert.equal(c.statusCode, 200, c.body);
  };
  const say = async (tablo: string): Promise<number> => (await vt().tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${tablo}`))!.n;

  before(async () => {
    ortam = await testVeritabaniKur('logotekkayit');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'tk-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'tk-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await ayar('logo.baglanti', true);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    kopru = await sahteKopruAc();
    tekKayitBelleginiSifirla();
    for (const t of ['logo_malzeme_karti', 'logo_fatura', 'logo_fatura_okuma', 'logo_giden', 'logo_siparis_no']) await vt().sorgu(`DELETE FROM ${t}`);
    await ayar('logo.malzeme-okumasi', true);
    await ayar('logo.fatura-okumasi', true);
  });
  afterEach(async () => { await kopru.kapat(); });

  test('TK-1 malzeme kartı: bulunursa aynaya yazılır, tam kod eşleşir; Logo\'da yoksa aynadaki kopya silinmez; kapalıyken istek yok', async () => {
    kopru.logoKartlari.push({ logicalRef: 11, code: 'ORN-MLZ-1', name: 'ORN mil' }, { logicalRef: 12, code: 'ORN-MLZ-10', name: 'ORN mil uzun' });
    await ayar('logo.malzeme-okumasi', false);
    await assert.rejects(tekKayitOku(vt(), k(), yoneticiId, 'malzeme-karti', 'ORN-MLZ-1'), /kapalı/);
    assert.equal(kopru.istekler.length, 0, 'akış kapalıyken köprüye istek yok');
    await ayar('logo.malzeme-okumasi', true);
    const o = await tekKayitOku(vt(), k(), yoneticiId, 'malzeme-karti', 'orn-mlz-1');
    assert.deepEqual([o.sonuc], ['okundu']);
    assert.equal(await say('logo_malzeme_karti'), 0, 'okuma hiçbir şey yazmaz');
    const y = await vt().tx((db) => tekKayitYaz(db, yoneticiId, 'malzeme-karti', 'orn-mlz-1', new Date()));
    assert.equal(y.sonuc, 'okundu');
    assert.match(y.ileti, /ORN-MLZ-1.*aynaya yeni eklendi/);
    const kayit = await vt().sorgu<{ kod: string; ad: string }>('SELECT kod, ad FROM logo_malzeme_karti');
    assert.deepEqual(kayit, [{ kod: 'ORN-MLZ-1', ad: 'ORN mil' }], 'ORN-MLZ-10 gelmez: yalnız tam kod');
    assert.deepEqual(kopru.istekler.filter((i) => i.yontem !== 'GET'), []);
    const yok = await tekKayitOku(vt(), k(), yoneticiId, 'malzeme-karti', 'ORN-MLZ-99');
    assert.equal(yok.sonuc, 'logoda-yok');
    assert.equal(await say('logo_malzeme_karti'), 1, 'Logo\'da yok diye aynadaki kopya silinmez');
    assert.equal((await vt().tx((db) => tekKayitYaz(db, yoneticiId, 'malzeme-karti', 'ORN-MLZ-99', new Date()))).sonuc, 'okunamadi', 'okunmamış kayıt yazılmaz');
    const gunluk = await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM logo_akis_gunlugu WHERE akis = 'malzeme-karti'");
    assert.equal(gunluk?.n, 1, 'yazılan okuma akış günlüğünde');
  });

  test('TK-2 fatura: yalnız Logo\'ya giden siparişin faturası okunur ve yazılır; Logo\'da yoksa kopya silinmez; başka akış reddedilir', async () => {
    await vt().sorgu("INSERT INTO logo_giden (belge_turu, belge_no, deneme_sayisi, son_deneme, son_sonuc, logo_kayit_no) VALUES ('siparis', 1, 1, now(), 'gonderildi', '501')");
    await vt().sorgu("INSERT INTO logo_siparis_no (belge_no, siparis_no) VALUES (1, 'SP-ORN-1')");
    kopru.faturalar.set('SP-ORN-1', [{ logicalRef: 901, number: 'FT-ORN-1' }]);
    const gitmemis = await tekKayitOku(vt(), k(), yoneticiId, 'fatura', 'SP-ORN-2');
    assert.equal(gitmemis.sonuc, 'okunamadi');
    assert.equal(kopru.istekler.length, 0, 'Logo\'ya gitmemiş siparişte köprüye sorulmaz');
    const o = await tekKayitOku(vt(), k(), yoneticiId, 'fatura', 'SP-ORN-1');
    assert.equal(o.sonuc, 'okundu');
    assert.equal(await say('logo_fatura'), 0);
    const fy = await vt().tx((db) => tekKayitYaz(db, yoneticiId, 'fatura', 'SP-ORN-1', new Date()));
    assert.equal(fy.sonuc, 'okundu');
    assert.match(fy.ileti, /1 fatura okundu; aynada 1 yeni/);
    assert.deepEqual((await vt().sorgu<{ fatura_no: string }>('SELECT fatura_no FROM logo_fatura')).map((f) => f.fatura_no), ['FT-ORN-1']);
    kopru.faturalar.delete('SP-ORN-1');
    assert.equal((await tekKayitOku(vt(), k(), yoneticiId, 'fatura', 'SP-ORN-1')).sonuc, 'logoda-yok');
    assert.equal(await say('logo_fatura'), 1, 'kopya silinmez');
    await assert.rejects(tekKayitOku(vt(), k(), yoneticiId, 'irsaliye', 'ORN-IRS-1'), /tek kayıt okunamaz/);
  });

  test('TK-3 uç: yetkisiz 403, kısa kod 400; dakikada en çok 10 okuma; yazma kararı olmayan istekte okunamadi', async () => {
    const gormeyenKisi = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Gormeyen', kullaniciAdi: 'tk-gormeyen', parola: PAROLA }));
    const rol = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('tk_gormeyen', 'Gormeyen') RETURNING id");
    await vt().sorgu('UPDATE kisi_rolu SET rol_id = $1 WHERE kisi_id = $2', [rol!.id, gormeyenKisi]);
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'tk-gormeyen', parola: PAROLA } });
    const gormeyen = String(c.headers['set-cookie']).split(';')[0] ?? '';
    const get = (cerez: string, kod: string) => app.inject({ method: 'GET', url: `/api/logo/yonetim/akislar/malzeme-karti/kayit?kod=${kod}`, headers: { cookie: cerez } });
    assert.equal((await get(gormeyen, 'ORN-MLZ-1')).statusCode, 403);
    assert.equal((await get(yonetici, 'ab')).statusCode, 400);
    const post = await app.inject({
      method: 'POST', url: '/api/logo/yonetim/akislar/malzeme-karti/kayit-yaz', headers: { cookie: yonetici, 'istek-kimligi': randomUUID() }, payload: { kod: 'ORN-MLZ-1' },
    });
    assert.equal(post.statusCode, 200, post.body);
    assert.equal(post.json<{ sonuc: string }>().sonuc, 'okunamadi');
    kopru.logoKartlari.push({ logicalRef: 11, code: 'ORN-MLZ-1', name: 'ORN mil' });
    for (let i = 0; i < 10; i += 1) assert.equal((await tekKayitOku(vt(), k(), yoneticiId, 'malzeme-karti', 'ORN-MLZ-1')).sonuc, 'okundu');
    await assert.rejects(tekKayitOku(vt(), k(), yoneticiId, 'malzeme-karti', 'ORN-MLZ-1'), /Dakikada en çok 10/);
  });
});
