import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, mock, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from './cekirdek/test-vt.ts';
import type { TestVeritabani } from './cekirdek/test-vt.ts';
import { uygulamaKur } from './cekirdek/uygulama.ts';
import { isiBirKezCalistir, modulIsleriniKesfet } from './cekirdek/zamanlayici.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '../paylasilan/istek-kimligi.ts';
import { denetimYaz } from './moduller/denetim/disari.ts';
import { tekrarDeposu } from './moduller/istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from './moduller/kisiler/disari.ts';
import { kimlikCozucu } from './moduller/oturum/disari.ts';

// Modüller arası akış sağlığı (2026-10-19 bağımsız denetimi, bölüm 2): firma -> kart -> rota -> sipariş -> proje -> emir -> satın alma ve
// stok -> plan -> Arkon -> kalite -> sevkiyat -> finans -> iz, göçün verdiği gerçek rollerle. Her rol ayrı kişidir; veriler uydurmadır.
// Bilinen kusurlar atlanmaz: bugünkü değerle sabitlenir; düzelince test kırılır ve satır doğru değerle olağan assert'e çevrilir.
const PAROLA = 'dogru-parola-1';
const MAMUL_ADET = 10;
const HAMMADDE_KABUL = 50;

interface Cevap<T> { durum: number; govde: T }
interface Hata { kod?: string; mesaj?: string }
interface Liste<T> { satirlar: T[] }
interface Kart { kimlik: string; no: number; kayit: { onay: { durum: string } } }
interface IsEmri { id: number; sira: number; opNo: number; durum: string; saglamAdet: number | null; kaynak: { tur: string } | null }
interface AdimliEmir { emir: { emirNo: string; durum: string; projeId: number | null; siparisSatiriId: number | null; isEmirleri: IsEmri[] } }
interface Parti { id: number; lotNo: string; tedarikciPartiNo: string | null; eldeki: string; uretimEmriId: number | null }
interface Hareket {
  tur: string; malzemeId: number; miktar: string; partiEtiketi: string | null; girisKaynagi: string | null; kaynakKonumKod: string | null; hedefKonumKod: string | null;
}
interface Bakiye { konumId: number; konumKod: string; miktar: string; kaliteDurumu?: string }
interface MalzemeAyrintisi { satir: { toplam: string }; bakiyeler: Bakiye[] }
interface ProjeMaliyet {
  fiyatGorunur: boolean; gelir: number | string | null; gerceklesen: number | string | null; katkiPayi: number | string | null;
  kalemler: { kalem: string; plan: number | null; gerceklesen: number | null }[];
}
interface PlanCevabi {
  taslak: { surum: number } | null; gostergeler: { maliyetTl: number | null };
  emirler: { uretimEmriId: number }[]; yerlesimler: { uretimEmriId: number }[];
}
interface Yansima { sonuc: string; neden: string | null; kayit: { cid: string } }

// Denetimin bulduğu kusuru bugünkü hâliyle sabitler. Davranış değişirse (düzeltme ya da yeni bozulma) test kırılır ve ileti ne yapılacağını söyler.
function bilinenKusur(bulguNo: number | string, bugunku: unknown, gercek: unknown, dogrusu?: unknown): void {
  const yaz = (d: unknown): string => JSON.stringify(d) ?? String(d);
  const dogru = dogrusu === undefined ? 'dogru deger kullanici kararini bekliyor' : yaz(dogrusu);
  assert.deepEqual(gercek, bugunku,
    `Denetim bulgusu #${bulguNo} degisti: bugun ${yaz(bugunku)} bekleniyordu, ${yaz(gercek)} geldi. Duzelttiysen bu satiri dogru degerle (${dogru}) normal assert'e cevir.`);
}

describe('akış sağlığı: modüller arası uçtan uca senaryo, gerçek rollerle (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerez = new Map<string, string>();
  const kisiId = new Map<string, number>();
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function istek<T>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerez.get(kim) ?? '' };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const oku = <T = Hata>(kim: string, yol: string) => istek<T>(kim, 'GET', yol);
  const yaz = <T = Hata>(kim: string, yol: string, govde: unknown) => istek<T>(kim, 'POST', yol, govde);
  const tamam = <T>(c: Cevap<T>): T => { assert.equal(c.durum, 200, JSON.stringify(c.govde)); return c.govde; };
  const yasak = (c: Cevap<unknown>, mesaj?: RegExp): void => {
    assert.equal(c.durum, 403, JSON.stringify(c.govde));
    assert.equal((c.govde as Hata).kod, 'YETKI_YOK');
    if (mesaj) assert.match((c.govde as Hata).mesaj ?? '', mesaj);
  };
  const malzeme = async (id: number): Promise<MalzemeAyrintisi> => tamam(await oku<MalzemeAyrintisi>('depo', `/stok/malzemeler/${id}`));
  const toplam = async (id: number): Promise<number> => Number((await malzeme(id)).satir.toplam);

  // Göçün açtığı rol; yönetici rolü alınır, kişi yalnız o rolün işlemlerini taşır.
  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yr = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yr) throw new Error(`rol yok: ${rolKodu}`);
    const id = await vt().tx(async (db) => {
      const k = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, k, rol.id);
      await rolAl(db, yoneticiId, k, yr.id);
      return k;
    });
    kisiId.set(kullaniciAdi, id);
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, `giriş ${kullaniciAdi}`);
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  // Adımlar arasında taşınan kimlikler.
  const S = {
    bugun: '', ileri: '', musteri: 0, tedarikci: 0, hm: 0, mm: 0, rev: 0, sip: 0, sipSatir: 0, proje: 0, emir: 0, emirNo: '',
    ie: [] as number[], ist: [] as { id: number; kod: string }[], mak: [] as number[], talep: '', saSatir: 0, hmParti: 0, mmParti: 0, mmKonum: 0, sevkIs: 0,
  };

  before(async () => {
    ortam = await testVeritabaniKur('akissagligi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    for (const [ad, rol] of [['planlama', 'planlama_proje'], ['mudur', 'mudur'], ['kalite', 'kalite'], ['depo', 'depo'], ['satinalma', 'satin_alma'],
      ['muhasebe', 'muhasebe_finans'], ['sevkiyat', 'sevkiyat'], ['operator', 'operator']] as const) await rolluKisi(ad, rol);
    const g = await vt().tek<{ bugun: string; ileri: string }>("SELECT current_date::text AS bugun, (current_date + 30)::text AS ileri");
    if (!g) throw new Error('tarih okunamadı');
    S.bugun = g.bugun;
    S.ileri = g.ileri;
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('1 firma: planlama, muhasebe ve satın alma açar; müdür, depo, sevkiyat ve operatör açamaz', async () => {
    for (const kim of ['planlama', 'muhasebe', 'satinalma']) {
      const c = tamam(await yaz<{ firma: { id: number } }>(kim, '/musteri-tedarikci/firmalar/ekle', { ad: `Deneme Firma ${kim}`, tur: 'musteri' }));
      assert.ok(c.firma.id > 0);
    }
    for (const kim of ['mudur', 'depo', 'sevkiyat', 'operator']) yasak(await yaz(kim, '/musteri-tedarikci/firmalar/ekle', { ad: `Deneme Firma ${kim}`, tur: 'musteri' }));
    const m = tamam(await yaz<{ firma: { id: number; tur: string } }>('planlama', '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Musteri AS', tur: 'musteri' }));
    assert.equal(m.firma.tur, 'musteri');
    S.musteri = m.firma.id;
    const t = tamam(await yaz<{ firma: { id: number; tur: string } }>('satinalma', '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Tedarikci Ltd', tur: 'tedarikci' }));
    assert.equal(t.firma.tur, 'tedarikci');
    S.tedarikci = t.firma.id;
  });

  test('2 malzeme kartı: planlama yazar ve onaya gönderir, kendi onayı 403, kalite onaylar', async () => {
    const kartAc = async (kimlik: string, tur: 'hammadde' | 'mamul', kod: string, ad: string, ops?: unknown[]): Promise<number> => {
      const govde = (durum: string, surum: number | null) => ({
        // Malzeme sihirbazının zorunlu alanları (malzemeler B11): hammaddede aile, kalite ve ölçü; mamulde ad.
        kayit: {
          id: kimlik, tur, fam: 'metal', com: { kod, ad, birim: 'adet' }, ...(ops ? { ops } : {}), onay: { durum },
          ...(tur === 'hammadde' ? { grade: 'S235', form: 'cubuk', dims: { d: 50, l: 6000 } } : { g: { ad } }),
        },
        ozet: { stok_kodu: kod, tur, onay_durumu: durum, benzersiz_anahtar: `${tur}|deneme|${kimlik}`, mukerrer_gerekcesi: null }, surum,
      });
      const yol = `/malzeme-katalogu-kartlari/${kimlik}/kaydet`;
      const a = tamam(await yaz<{ stok_kodu: string; surum: number }>('planlama', yol, govde('taslak', null)));
      assert.equal(a.stok_kodu, kod);
      const b = tamam(await yaz<{ surum: number }>('planlama', yol, govde('onayda', a.surum)));
      assert.ok(b.surum > a.surum);
      yasak(await yaz('planlama', yol, govde('aktif', b.surum)), /onay yetkisi/);
      const c = tamam(await yaz<{ surum: number }>('kalite', yol, govde('aktif', b.surum)));
      assert.ok(c.surum > b.surum);
      const satir = tamam(await oku<Liste<Kart>>('planlama', '/malzeme-katalogu-kartlari?sayfaBoyu=500')).satirlar.find((x) => x.kimlik === kimlik);
      assert.ok(satir, `${kimlik} listede yok`);
      assert.equal(satir.kayit.onay.durum, 'aktif');
      return satir.no;
    };
    S.hm = await kartAc('deneme-hm', 'hammadde', 'HM-E2E-00001', 'Deneme celik cubuk');
    S.mm = await kartAc('deneme-mm', 'mamul', 'MM-E2E-00001', 'Deneme flans', [{ no: 10, kod: 'TRN', ad: 'Torna (CNC)' }, { no: 20, kod: 'FRZ', ad: 'Freze (CNC)' }]);
    assert.notEqual(S.hm, S.mm);
  });

  test('3 istasyon ve rota: istasyonu müdür açar; karttan iki adımlı rota, planlamanın onayı 403, müdür onaylayıp yürürlüğe alır', async () => {
    yasak(await yaz('planlama', '/is-merkezleri', { kod: 'E2E-IMX', ad: 'Deneme merkez x', aciklama: null }));
    const im = tamam(await yaz<{ id: number }>('mudur', '/is-merkezleri', { kod: 'E2E-IM', ad: 'Deneme merkez', aciklama: null }));
    for (const [i, kod] of ['E2E-TRN', 'E2E-FRZ'].entries()) {
      const ist = tamam(await yaz<{ id: number; kod: string }>('mudur', '/istasyonlar', { kod, ad: `Deneme istasyon ${i + 1}`, isMerkeziId: im.id, tip: 'talasli', uretimAlani: true }));
      assert.equal(ist.kod, kod);
      S.ist.push({ id: ist.id, kod: ist.kod });
      const mk = tamam(await yaz<{ id: number }>('mudur', '/makineler', { kod: `${kod}-M1`, ad: `Deneme tezgah ${i + 1}`, istasyonId: ist.id }));
      S.mak.push(mk.id);
    }

    const sec = tamam(await oku<{ operasyonTipleri: { id: number; kod: string }[] }>('planlama', '/rota/secenekler'));
    const tip = (kod: string): number | undefined => sec.operasyonTipleri.find((t) => t.kod === kod)?.id;
    const ac = tamam(await yaz<{ id: number; durum: string }>('planlama', `/rota/urunler/${S.mm}/taslak-ac`, { kaynak: { tur: 'kart' } }));
    assert.equal(ac.durum, 'taslak');
    S.rev = ac.id;
    const a = tamam(await oku<{ revizyon: { surum: number }; adimlar: { opNo: number; operasyonTipi: { kod: string } | null }[] }>('planlama', `/rota/revizyonlar/${S.rev}`));
    assert.deepEqual(a.adimlar.map((x) => [x.opNo, x.operasyonTipi?.kod]), [[10, 'TRN'], [20, 'FRZ']]);
    const adim = (opNo: number, kod: string, ad: string, makine: number, giren: boolean) => ({
      opNo, operasyonTipiId: tip(kod), ad, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 30, birimSureDk: 3,
      bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true,
      adaylar: [], bilesenler: giren ? [{ malzemeId: S.hm, miktar: 1, fireYuzde: 0 }] : [], yanUrunler: [],
    });
    const k = tamam(await yaz<{ durum: string; surum: number }>('planlama', `/rota/revizyonlar/${S.rev}/kaydet`, {
      surum: a.revizyon.surum, aciklama: 'Deneme rota',
      adimlar: [adim(10, 'TRN', 'Tornalama', S.mak[0] ?? 0, true), adim(20, 'FRZ', 'Frezeleme', S.mak[1] ?? 0, false)],
    }));
    const g = tamam(await yaz<{ durum: string; surum: number }>('planlama', `/rota/revizyonlar/${S.rev}/onaya-gonder`, { surum: k.surum }));
    assert.equal(g.durum, 'onay_bekliyor');
    yasak(await yaz('planlama', `/rota/revizyonlar/${S.rev}/onayla`, { surum: g.surum, yururlugeAl: true }));
    const o = tamam(await yaz<{ durum: string }>('mudur', `/rota/revizyonlar/${S.rev}/onayla`, { surum: g.surum, yururlugeAl: true }));
    assert.equal(o.durum, 'yururlukte');
  });

  test('4 sipariş: planlama fiyat giremez (403), fiyatsız onay 409, planlama onaylayamaz, müdür fiyatı girip onaylar; fiyat planlamadan gizli', async () => {
    const govde = (fiyat: string | null) => ({
      firmaId: S.musteri, musteriSiparisNo: 'MS-DENEME-1', siparisTarihi: S.bugun, termin: S.ileri, kdvOrani: '20', odemeKosulu: null, aciklama: null,
      satirlar: [{ malzemeNo: S.mm, miktar: String(MAMUL_ADET), birimFiyat: fiyat, termin: null, aciklama: null }],
    });
    yasak(await yaz('planlama', '/siparisler/ekle', govde('250')), /Fiyatı yalnız/);
    const s = tamam(await yaz<{ id: number; durum: string; surum: number }>('planlama', '/siparisler/ekle', govde(null)));
    assert.equal(s.durum, 'taslak');
    S.sip = s.id;
    const o1 = await yaz('mudur', `/siparisler/${S.sip}/onayla`, { surum: s.surum });
    assert.equal(o1.durum, 409, JSON.stringify(o1.govde));
    assert.equal(o1.govde.kod, 'CAKISMA');
    yasak(await yaz('planlama', `/siparisler/${S.sip}/onayla`, { surum: s.surum }));
    const cur = tamam(await oku<{ surum: number }>('mudur', `/siparisler/${S.sip}`));
    const gu = tamam(await yaz<{ surum: number; araToplam: string; genelToplam: string }>('mudur', `/siparisler/${S.sip}/guncelle`, { ...govde('250'), surum: cur.surum }));
    assert.deepEqual([Number(gu.araToplam), Number(gu.genelToplam)], [2500, 3000]);
    const o2 = tamam(await yaz<{ durum: string }>('mudur', `/siparisler/${S.sip}/onayla`, { surum: gu.surum }));
    assert.equal(o2.durum, 'onayli');
    const d = tamam(await oku<{ durum: string; araToplam: string | null; satirlar: { id: number }[] }>('mudur', `/siparisler/${S.sip}`));
    assert.equal(d.durum, 'onayli');
    assert.equal(Number(d.araToplam), 2500);
    const satir = d.satirlar[0];
    assert.ok(satir);
    S.sipSatir = satir.id;
    const pl = tamam(await oku<{ araToplam: string | null }>('planlama', `/siparisler/${S.sip}`));
    assert.equal(pl.araToplam, null);
  });

  test('5 proje: siparişten açılır, firma ve sipariş siparişten gelir', async () => {
    type Proje = { id: number; durum: string; firmaId: number | null; siparisId: number | null };
    const p = tamam(await yaz<Proje>('planlama', `/projeler/siparisten/${S.sip}/ac`, { kod: 'E2E.P1', ad: 'Deneme proje', baslangic: S.bugun, bitis: S.ileri, aciklama: null }));
    S.proje = p.id;
    assert.deepEqual([p.durum, p.firmaId, p.siparisId], ['aktif', S.musteri, S.sip]);
    const r = tamam(await oku<Proje>('planlama', `/projeler/${S.proje}`));
    assert.deepEqual([r.firmaId, r.siparisId], [S.musteri, S.sip]);
  });

  test('6 emir: rotadan proje ve sipariş satırına bağlı emir, iki iş emri', async () => {
    const sec = tamam(await oku<{ projeZorunlu: boolean; projeler: { id: number; satirlar: { id: number }[] }[] }>('planlama', `/adimli-emirler/acilis-secenekleri?malzemeNo=${S.mm}`));
    assert.ok(sec.projeler.find((p) => p.id === S.proje)?.satirlar.some((x) => x.id === S.sipSatir), 'proje ve sipariş satırı açılış seçeneklerinde yok');
    const e = tamam(await yaz<{ uretimEmriId: number; isEmriIdleri: number[] }>('planlama', `/rota/revizyonlar/${S.rev}/emre-kopyala`,
      { adet: MAMUL_ADET, teslim: S.ileri, projeId: S.proje, siparisSatiriId: S.sipSatir, stoktanRezerve: false }));
    assert.equal(e.isEmriIdleri.length, 2);
    S.emir = e.uretimEmriId;
    const em = tamam(await oku<AdimliEmir>('planlama', `/adimli-emirler/${S.emir}`)).emir;
    assert.equal(em.durum, 'planli');
    assert.deepEqual([em.projeId, em.siparisSatiriId], [S.proje, S.sipSatir]);
    assert.match(em.emirNo, /^E2E\.P1-MM-E2E-00001-/);
    const ie = [...em.isEmirleri].sort((x, y) => x.sira - y.sira);
    assert.deepEqual(ie.map((x) => [x.opNo, x.durum, x.kaynak?.tur]), [[10, 'bekliyor', 'makine'], [20, 'bekliyor', 'makine']]);
    S.ie = ie.map((x) => x.id);
    S.emirNo = em.emirNo;
  });

  test('7 satın alma ve stok: dört göz onay, mal kabulde lot ve tedarikçi partisi, emre sarf', async () => {
    const acilis = tamam(await oku<{ ayarlar: { agirliklar: unknown; surum: number } }>('satinalma', '/satin-alma-acilis'));
    tamam(await yaz('satinalma', '/satin-alma-ayarlari/kaydet', {
      sirket: '', agirliklar: acilis.ayarlar.agirliklar, gecerlilikGun: 15, enAzTeklif: 1, fiyatUyariYuzdesi: '10',
      kurlar: [{ paraBirimi: 'TRY', aylikFaizYuzdesi: '0' }], kategoriler: [], birimler: [], onayLimitleri: [], surum: acilis.ayarlar.surum,
    }));
    const td = tamam(await yaz<{ firmaId: number }>('satinalma', '/satin-alma-tedarikcileri/kaydet',
      { firmaId: S.tedarikci, durum: 'onayli', puan: 4, notlar: '', kategoriler: [], degerlendirmeler: [], surum: null }));
    assert.equal(td.firmaId, S.tedarikci);
    const kat = tamam(await yaz<{ id: string; kod: string }>('satinalma', '/satin-alma-katalogu/kaydet',
      { id: randomUUID(), malzemeNo: S.hm, ozellik: '', notlar: '', takmaAdlari: [], surum: null }));
    assert.equal(kat.kod, 'HM-E2E-00001');

    type Talep = Record<string, unknown> & { id: string; durum: string; uretimEmriId: number | null; onaylar: unknown[]; karar: Record<string, unknown> | null };
    const kalemId = randomUUID();
    const t = tamam(await yaz<Talep>('planlama', '/satin-alma-talepleri/ac', {
      id: randomUUID(), baslik: 'Deneme hammadde talebi', birim: null, talepEdenKisiId: null, oncelik: 'normal', ihtiyacTarihi: S.ileri, notlar: '', durum: 'taslak',
      iptalNedeni: '', agirliklar: null, kalemler: [{ id: kalemId, katalogId: kat.id, ad: 'Deneme celik cubuk', ozellik: '', miktar: String(HAMMADDE_KABUL), birim: 'adet', kategori: '' }],
      teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, metin: 'Talep açıldı' }], senaryolar: [],
      uretimEmriId: S.emir,
    }));
    assert.deepEqual([t.durum, t.uretimEmriId], ['taslak', S.emir]);
    S.talep = t.id;
    // Okuma alanları kayıt gövdesine geri gönderilmez.
    const govde = (x: Talep): Record<string, unknown> => { const { no: _n, talepEdenAdi: _a, acanKisiId: _k, olusturma: _o, guncelleme: _g, ...g } = x; return g; };
    const teklif = {
      id: randomUUID(), firmaId: S.tedarikci, tedarikciAdi: 'Deneme Tedarikci Ltd', teklifTarihi: S.bugun, gecerlilik: null, paraBirimi: 'TRY', kur: null,
      iskontoYuzdesi: '0', nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7, vadeGun: 30, avansYuzdesi: '0', garantiAy: null,
      teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0, fiyatlar: [{ kalemId, birimFiyat: '40' }],
    };
    const kaydet = (kim: string, x: Record<string, unknown>) => yaz<Talep>(kim, `/satin-alma-talepleri/${S.talep}/kaydet`, x);
    const deg = tamam(await kaydet('satinalma', { ...govde(t), durum: 'degerlendirme', teklifler: [teklif] }));
    assert.equal(deg.durum, 'degerlendirme');
    const karar = { mod: 'tek', teklifId: teklif.id, bolunme: [], gerekce: '', kararVerenKisiId: kisiId.get('satinalma'), kararTarihi: S.bugun, ogrenilenler: '', sabitKurlar: [], siparisler: [] };
    const ond = tamam(await kaydet('satinalma', { ...govde(deg), durum: 'onayda', teklifler: [teklif], karar }));
    assert.equal(ond.durum, 'onayda');
    const onayKaydi = { id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay', dortGozsuz: false, notlar: '' };
    yasak(await kaydet('satinalma', { ...govde(ond), onaylar: [onayKaydi] }));
    const on = tamam(await kaydet('mudur', { ...govde(ond), onaylar: [{ ...onayKaydi, id: randomUUID() }] }));
    assert.equal(on.onaylar.length, 1);
    const sv = tamam(await kaydet('satinalma', { ...govde(on), durum: 'siparis_verildi',
      karar: { ...on.karar, siparisler: [{ teklifId: teklif.id, siparisNo: 'E2E-SA-1', siparisTarihi: S.bugun, beklenenTeslim: S.ileri }] } }));
    assert.equal(sv.durum, 'siparis_verildi');
    const tk = tamam(await oku<{ siparisler: { satirIdleri: number[] }[] }>('satinalma', `/satin-alma-talepleri/${S.talep}/siparis-takibi`));
    const saSatir = tk.siparisler[0]?.satirIdleri[0];
    assert.ok(saSatir);
    S.saSatir = saSatir;
    const acik = tamam(await oku<{ satirlar: { id: number; malzemeId: number; miktar: string }[] }>('depo', '/stok/acik-siparis-satirlari'));
    assert.deepEqual(acik.satirlar.filter((x) => x.id === S.saSatir).map((x) => [x.malzemeId, Number(x.miktar)]), [[S.hm, HAMMADDE_KABUL]]);

    const mk = tamam(await yaz<{ belge: { no: string }; hareketIdler: number[] }>('depo', '/stok/mal-kabul', {
      tur: 'satin_alma', irsaliyeNo: 'IRS-E2E-1',
      satirlar: [{ malzemeId: S.hm, miktar: String(HAMMADDE_KABUL), siparisSatirId: S.saSatir, parti: { tedarikciPartiNo: 'TP-DENEME-1', dokumNo: 'DK-1', sertifikaNo: null } }],
    }));
    assert.equal(mk.hareketIdler.length, 1);
    const partiler = tamam(await oku<Liste<Parti>>('depo', `/stok/partiler?malzemeId=${S.hm}`)).satirlar;
    assert.deepEqual(partiler.map((p) => [p.tedarikciPartiNo, Number(p.eldeki), p.uretimEmriId]), [['TP-DENEME-1', HAMMADDE_KABUL, null]]);
    S.hmParti = partiler[0]?.id ?? 0;
    const talep = tamam(await oku<{ talepler: { id: string; durum: string; karar: { siparisler: { teslimDurumu?: string }[] } | null }[] }>('satinalma', '/satin-alma-acilis'))
      .talepler.find((x) => x.id === S.talep);
    assert.deepEqual([talep?.durum, talep?.karar?.siparisler[0]?.teslimDurumu], ['teslim_alindi', 'tamam']);

    const hm = await malzeme(S.hm);
    assert.equal(Number(hm.satir.toplam), HAMMADDE_KABUL);
    const konum = hm.bakiyeler.find((b) => Number(b.miktar) > 0);
    assert.ok(konum);
    tamam(await yaz('depo', '/stok/cikis', { malzemeId: S.hm, konumId: konum.konumId, partiId: S.hmParti, miktar: '10', cikisNedeni: 'uretime_sarf', uretimEmriId: S.emir, aciklama: null }));
    const h = tamam(await oku<Liste<Hareket>>('depo', `/stok/hareketler?uretimEmriId=${S.emir}`)).satirlar;
    assert.deepEqual(h.map((x) => [x.tur, x.malzemeId, Number(x.miktar)]), [['cikis', S.hm, 10]]);
    assert.match(h[0]?.partiEtiketi ?? '', /TP-DENEME-1/);
  });

  test('8 plan: öner, oku, canlıya al; plan maliyet göstergesi rol başına', async () => {
    // Plan "şimdi"den yerleştirir; saat sabitlenir (plan.test.ts kalıbı): bugünden sonraki ilk hafta içi günün 10:00'u (tesis saati, +03:00).
    // Gün veritabanının bugününden türetilir; sipariş ve emir tarihleri de oradan geldiği için teslim her koşuda 30 gün ileridedir.
    const gun = new Date(`${S.bugun}T00:00:00Z`);
    do gun.setUTCDate(gun.getUTCDate() + 1); while (gun.getUTCDay() === 0 || gun.getUTCDay() === 6);
    mock.timers.enable({ apis: ['Date'], now: Date.parse(`${gun.toISOString().slice(0, 10)}T10:00:00+03:00`) });
    try { await planAdimi(); } finally { mock.timers.reset(); }
  });

  async function planAdimi(): Promise<void> {
    const o = tamam(await yaz<{ taslak: { id: number; surum: number } | null; yerlesimler: { uretimEmriId: number }[]; yerlesmemis: unknown[] }>('planlama', '/plan/oner', { taslak: null }));
    assert.ok(o.taslak);
    assert.deepEqual(o.yerlesmemis, []);
    assert.equal(o.yerlesimler.filter((x) => x.uretimEmriId === S.emir).length, 2);
    const pl = tamam(await oku<PlanCevabi>('planlama', `/plan?taslak=${o.taslak.id}`));
    assert.ok(pl.emirler.some((x) => x.uretimEmriId === S.emir));
    assert.equal(pl.yerlesimler.filter((x) => x.uretimEmriId === S.emir).length, 2);
    const pm = tamam(await oku<PlanCevabi>('mudur', `/plan?taslak=${o.taslak.id}`));
    assert.ok(pm.emirler.some((x) => x.uretimEmriId === S.emir));
    // Denetim bölüm 2, adım 8: maliyet göstergesi planlamacıda null, müdürde 0 (iki rol aynı planı farklı anlatıyor).
    bilinenKusur('adim-8', { planlama: null, mudur: 0 }, { planlama: pl.gostergeler.maliyetTl, mudur: pm.gostergeler.maliyetTl });
    tamam(await oku('planlama', '/plan'));
    const car = tamam(await oku<{ siparisId: number }>('planlama', `/plan/siparisler/${S.sip}/carpan`));
    assert.equal(car.siparisId, S.sip);
    tamam(await oku('mudur', '/plan/bedel-ayari'));
    // Canlıya yalnız onaydaki taslak alınır; dört göz varsayılan kapalı, gönderen kendisi onaylar.
    const gonderilen = tamam(await yaz<{ senaryolar: { id: number; durum: string; surum: number }[] }>('planlama', `/plan/senaryolar/${o.taslak.id}/onaya-gonder`,
      { surum: pl.taslak?.surum ?? o.taslak.surum })).senaryolar.find((x) => x.id === o.taslak!.id)!;
    assert.equal(gonderilen.durum, 'onayda');
    const ca = tamam(await yaz<{ canli: { emirSayisi: number; isEmriSayisi: number; yerlesen: number } }>('planlama', `/plan/senaryolar/${o.taslak.id}/canliya-al`,
      { surum: gonderilen.surum, cakismalariKabul: true }));
    assert.deepEqual([ca.canli.emirSayisi, ca.canli.isEmriSayisi, ca.canli.yerlesen], [1, 2, 2]);
  }

  test('9 Arkon: operatör iki adımı yürütür, emir biter, mamul partisi emre bağlı girer', async () => {
    // Saat sabitlenmez: Arkon kilit bekleme bütçesini Date.now() ile sayar, donmuş saatte bekleme bitmez. Doğrulananlar saatten
    // bağımsızdır (ret nedeni, yazılan kayıtlar, emir ve adım durumları, adetler, hareketler); vardiya ya da saat dilimi aranmaz.
    const ekle = (tur: string, satir: Record<string, unknown>) =>
      yaz<{ eklenen: number; reddedilen: { cid: string; ileti: string }[] }>('operator', `/arkon/kayitlar/${tur}/ekle`, { satirlar: [satir], kaynak: 'y1' });
    const pk = tamam(await oku<{ belgeler: { kimlik: string }[] }>('operator', '/arkon/belgeler/pkgs'));
    assert.deepEqual(pk.belgeler.map((b) => b.kimlik).sort(), S.ie.map((id) => `tmi-ie-${id}`).sort());
    // Göçten gelen operatör rolü yetkinlik kaydı olmadan iş başlatamaz; kurulum adımı olarak müdür istasyon yetkinliğini verir.
    tamam(await ekle('events', { cid: 'deneme-0', pkgId: `tmi-ie-${S.ie[0]}`, state: 'running', machine: S.ist[0]?.kod }));
    // Yansıma listesi yalnız yazılamayanları (reddedilen, eşlenemeyen, bekleyen, hatalı) gösterir; gizlenen türler dahil okunur.
    const sorunlular = async (): Promise<Yansima[]> => tamam(await oku<Liste<Yansima>>('mudur', '/arkon/tmi-yansimalari?sayfaBoyu=100&gizlenenler=true')).satirlar;
    const ret = (await sorunlular()).find((y) => y.kayit.cid === 'deneme-0');
    assert.equal(ret?.sonuc, 'reddedildi');
    assert.match(ret?.neden ?? '', /yetkinlik kaydınız yok/);
    tamam(await yaz('mudur', `/kisi-yetkinlikleri/${kisiId.get('operator')}/belirle`, { istasyonIdleri: S.ist.map((x) => x.id) }));
    let n = 0;
    for (const [i, ie] of S.ie.entries()) {
      const machine = S.ist[i]?.kod;
      const satirlar: [string, Record<string, unknown>][] = [
        ['events', { cid: `deneme-${(n += 1)}`, pkgId: `tmi-ie-${ie}`, state: 'running', machine }],
        ['counts', { cid: `deneme-${(n += 1)}`, pkgId: `tmi-ie-${ie}`, kind: 'good', delta: MAMUL_ADET, machine }],
        ['events', { cid: `deneme-${(n += 1)}`, pkgId: `tmi-ie-${ie}`, state: 'done', machine }],
      ];
      for (const [tur, s] of satirlar) {
        const c = tamam(await ekle(tur, s));
        assert.deepEqual(c.reddedilen, [], `${tur} ${String(s['cid'])}`);
      }
      // İlk parça onayına kadar sağlam kararda bekler ve sonraki adıma geçmez (327 a); onayı kalite verir.
      if (i === 0) tamam(await yaz('kalite', `/kalite-merkezi/ilk-parca/${S.emir}/karar`, { karar: 'onay' }));
    }
    assert.deepEqual((await sorunlular()).map((y) => y.kayit.cid), ['deneme-0']);

    const em = tamam(await oku<AdimliEmir>('mudur', `/adimli-emirler/${S.emir}`)).emir;
    assert.equal(em.durum, 'bitti');
    assert.deepEqual([...em.isEmirleri].sort((x, y) => x.sira - y.sira).map((x) => [x.opNo, x.durum, x.saglamAdet]), [[10, 'tamam', MAMUL_ADET], [20, 'tamam', MAMUL_ADET]]);
    const u = tamam(await oku<{ emir: { durum: string } }>('mudur', `/uretim-emirleri/${S.emir}`));
    assert.equal(u.emir.durum, 'bitti');
    const partiler = tamam(await oku<Liste<Parti>>('depo', `/stok/partiler?malzemeId=${S.mm}`)).satirlar;
    assert.deepEqual(partiler.map((p) => [Number(p.eldeki), p.uretimEmriId]), [[MAMUL_ADET, S.emir]]);
    S.mmParti = partiler[0]?.id ?? 0;
    const mm = await malzeme(S.mm);
    const dolu = mm.bakiyeler.filter((b) => Number(b.miktar) !== 0);
    assert.deepEqual(dolu.map((b) => Number(b.miktar)), [MAMUL_ADET]);
    S.mmKonum = dolu[0]?.konumId ?? 0;
    const h = tamam(await oku<Liste<Hareket>>('depo', `/stok/hareketler?uretimEmriId=${S.emir}`)).satirlar;
    assert.deepEqual(h.filter((x) => x.malzemeId === S.mm).map((x) => [x.tur, Number(x.miktar), x.girisKaynagi]), [['giris', MAMUL_ADET, 'uretim']]);
    // Elle sarf edilen hammaddeyi sayım bir kez daha düşmez (bulgu 1).
    assert.deepEqual(h.filter((x) => x.malzemeId === S.hm && x.tur === 'cikis').map((x) => Number(x.miktar)), [10]);
  });

  test('10 kalite: karar bekleyen parça sevke çıkamaz; ilk parça onaylı mamul serbest girer', async () => {
    const oz = tamam(await oku<{ acikUygunsuzluk: number }>('kalite', '/kalite-merkezi/ozet'));
    assert.equal(oz.acikUygunsuzluk, 0);
    tamam(await oku('kalite', '/kalite-merkezi/degisiklikler'));
    // Bulgu 12 kapandı (327 a): ilk parça kararı istenir; 9'da onaylandığı için bütün mamul serbest.
    const kaliteler = (await malzeme(S.mm)).bakiyeler.filter((b) => Number(b.miktar) !== 0).map((b) => b.kaliteDurumu);
    assert.deepEqual(kaliteler, ['serbest']);
    const c = await yaz('depo', '/stok/cikis', { malzemeId: S.mm, konumId: S.mmKonum, miktar: '1', cikisNedeni: 'sevk', kaliteDurumu: 'karar_bekliyor', aciklama: null });
    assert.equal(c.durum, 422, JSON.stringify(c.govde));
    assert.equal(c.govde.kod, 'GECERSIZ');
    assert.match(c.govde.mesaj ?? '', /Karar bekleyen/);
  });

  test('11 sevkiyat: bekleyen işe çevrilir; teslimde mamul müşterinin Yolda konumundan stoktan düşer (bulgu 3)', async () => {
    const bek = tamam(await oku<{ bekleyenler: { id: number; uretimEmriId: number | null; firmaId: number | null; adet: string }[] }>('sevkiyat', '/sevkiyat/bekleyenler'))
      .bekleyenler.find((x) => x.uretimEmriId === S.emir);
    assert.ok(bek, 'emir için bekleyen yok');
    assert.equal(Number(bek.adet), MAMUL_ADET);
    bilinenKusur(3, null, bek.firmaId, S.musteri);
    const n = tamam(await yaz<{ nokta: { id: number; firmaId: number | null } }>('sevkiyat', '/sevkiyat/noktalar/ekle',
      { ad: 'Deneme Musteri AS', tur: 'musteri', enlem: 40.9, boylam: 29.2, adres: null, durakSuresiDakika: 15, firmaId: S.musteri }));
    assert.equal(n.nokta.firmaId, S.musteri);
    const once = await toplam(S.mm);
    assert.equal(once, MAMUL_ADET);
    const is = tamam(await yaz<{ is: { id: number; birakisNoktasiId: number | null } }>('sevkiyat', `/sevkiyat/bekleyenler/${bek.id}/ise-cevir`, {
      tarih: S.bugun, tur: 'teslimat', alisNoktasiId: null, birakisNoktasiId: n.nokta.id, agirlikKilogram: 12, paletSayisi: 1, durakSuresiDakika: null,
      alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null, belgeNo: 'IRS-SEVK-1', aciklama: null, sabitAracId: null,
    }));
    assert.equal(is.is.birakisNoktasiId, n.nokta.id);
    S.sevkIs = is.is.id;
    tamam(await yaz('sevkiyat', `/sevkiyat/isler/${is.is.id}/durum`, { durum: 'tamamlandi', tarih: S.bugun, not: null }));
    // 235 a: planlandıdan doğrudan teslim iki adımdır: istasyondan müşterinin Yolda konumuna taşıma, oradan sevk çıkışı.
    assert.equal(await toplam(S.mm), 0);
    const h = tamam(await oku<Liste<Hareket>>('depo', `/stok/hareketler?uretimEmriId=${S.emir}`)).satirlar.filter((x) => x.malzemeId === S.mm);
    assert.deepEqual(h.map((x) => [x.tur, Number(x.miktar)]).sort(), [['cikis', MAMUL_ADET], ['giris', MAMUL_ADET], ['transfer', MAMUL_ADET]]);
    const tasima = h.find((x) => x.tur === 'transfer');
    const yolda = tamam(await oku<Liste<{ kod: string; firmaId?: number | null }>>('depo', '/stok/konumlar?tur=yolda&sayfaBoyu=100')).satirlar;
    assert.deepEqual(yolda.map((k) => k.kod), [tasima?.hedefKonumKod]);
    assert.equal(h.find((x) => x.tur === 'cikis')?.kaynakKonumKod, tasima?.hedefKonumKod);
  });

  test('12 finans ve proje maliyeti: fatura, maliyet rol başına, dondurma (bulgu 11)', async () => {
    const f = tamam(await yaz<{ belge: Record<string, unknown> & { id: number; toplam: string } }>('muhasebe', '/finans/belgeler/ekle', {
      yon: 'gelir', kategori: 'urun_satisi', firmaId: S.musteri, belgeNo: 'SF-E2E-1', aciklama: 'Deneme satis', belgeTarihi: S.bugun, vade: S.ileri,
      tutar: 2500, kdvOrani: 20, siparisId: S.sip, sevkiyatIsiId: S.sevkIs,
    }));
    assert.equal(Number(f.belge.toplam), 3000);
    // 260 a: fatura siparişe ve sevkiyat işine bağlı kalır.
    assert.deepEqual([f.belge.siparisId, f.belge.sevkiyatIsiId], [S.sip, S.sevkIs]);

    const muh = tamam(await oku<ProjeMaliyet>('muhasebe', `/proje-maliyet/${S.proje}`));
    // Muhasebe faturayı siparişle karşılaştırmak için fiyatı görür (195 a); katkı payı müdürde olduğu gibi henüz yok.
    assert.deepEqual([muh.fiyatGorunur, Number(muh.gelir), muh.katkiPayi], [true, 2500, null]);
    const mud = tamam(await oku<ProjeMaliyet>('mudur', `/proje-maliyet/${S.proje}`));
    assert.equal(mud.fiyatGorunur, true);
    assert.equal(Number(mud.gelir), 2500);
    assert.deepEqual(mud.kalemler.filter((k) => k.gerceklesen !== null).map((k) => k.kalem), ['fason']);
    // Kalemler eksikken katkı payı hesaplanmaz (veri yoksa null).
    assert.equal(mud.katkiPayi, null);
    yasak(await oku('planlama', `/proje-maliyet/${S.proje}`));
    // Dondurma ucu yok (kart 236 a): biten iş emirlerini zamanlanmış sunucu işi deftere yazar; tur burada bir kez koşturulur.
    const defter = (await modulIsleriniKesfet()).find((i) => i.ad === 'proje-maliyet-defteri');
    assert.ok(defter, 'proje-maliyet-defteri işi yok');
    assert.equal(await isiBirKezCalistir(vt(), defter), 'tamam');
    const sonra = tamam(await oku<ProjeMaliyet>('mudur', `/proje-maliyet/${S.proje}`));
    assert.equal(Number(sonra.gelir), 2500);
    assert.deepEqual(sonra.kalemler, mud.kalemler);
  });

  test('13 izlenebilirlik: mamul lotu emre, emir hammadde lotuna iner; ileri iz sevke ve müşteriye çıkar (bulgu 40)', async () => {
    type Iz = { parti: Parti; emirler: number[]; hareketler: Hareket[]; sevkler: { emirId: number; isId: number; firmaId: number | null }[] };
    const mamul = tamam(await oku<Iz>('depo', `/stok/partiler/${S.mmParti}/iz`));
    assert.deepEqual(mamul.emirler, [S.emir]);
    assert.deepEqual(mamul.hareketler.map((x) => [x.tur, Number(x.miktar), x.girisKaynagi]), [['giris', MAMUL_ADET, 'uretim'], ['transfer', MAMUL_ADET, null], ['cikis', MAMUL_ADET, null]]);
    assert.deepEqual(Object.keys(mamul).sort(), ['ciktilar', 'emirler', 'hareketler', 'kartlar', 'parti', 'sevkCikislari', 'sevkler']);
    assert.deepEqual(mamul.sevkler.map((x) => [x.emirId, x.isId, x.firmaId]), [[S.emir, S.sevkIs, S.musteri]]);
    const ham = tamam(await oku<Iz>('depo', `/stok/partiler/${S.hmParti}/iz`));
    assert.equal(ham.parti.tedarikciPartiNo, 'TP-DENEME-1');
    assert.deepEqual(ham.emirler, [S.emir]);
    assert.deepEqual(ham.hareketler.map((x) => [x.tur, Number(x.miktar)]), [['giris', HAMMADDE_KABUL], ['cikis', 10]]);
    // Reçete 1/adet, 10 parça: elle sarf tek düşümdür, sayım ikinci kez düşmez (bulgu 1).
    assert.equal(await toplam(S.hm), HAMMADDE_KABUL - MAMUL_ADET);
    const ak = tamam(await oku<{ emir: { id: number; durum: string } }>('mudur', `/akis/emirler/${S.emir}`));
    assert.deepEqual([ak.emir.id, ak.emir.durum], [S.emir, 'bitti']);
    const sv = tamam(await oku<{ sonuclar: unknown[] }>('sevkiyat', `/sevkiyat/arama?metin=${encodeURIComponent(S.emirNo)}`));
    bilinenKusur(40, [], sv.sonuclar);
  });

  test('14 geciken sipariş: plan bedeli sipariş termininden işler, emrin teslimi ertelese de; müşteri sınıfı çarpanı bedele girer', async () => {
    // Akışın parasal ucu (değerlendirme süreç 2): sipariş satırı bağı yoksa plan bedeli hiç çalışmaz. Emir teslimi 30 gün ileride, sipariş
    // termini bugün; plan yarından başladığı için emir siparişe göre gecikir ve bedel yalnız siparişten gelebilir (284 a).
    const f = tamam(await yaz<{ firma: { id: number; surum: number } }>('planlama', '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme Gec Musteri AS', tur: 'musteri' }));
    const govde = (fiyat: string | null) => ({
      firmaId: f.firma.id, musteriSiparisNo: 'MS-DENEME-2', siparisTarihi: S.bugun, termin: S.bugun, kdvOrani: '20', odemeKosulu: null, aciklama: null,
      satirlar: [{ malzemeNo: S.mm, miktar: String(MAMUL_ADET), birimFiyat: fiyat, termin: null, aciklama: null }],
    });
    const s = tamam(await yaz<{ id: number; surum: number }>('planlama', '/siparisler/ekle', govde(null)));
    const gu = tamam(await yaz<{ surum: number }>('mudur', `/siparisler/${s.id}/guncelle`, { ...govde('250'), surum: s.surum }));
    tamam(await yaz('mudur', `/siparisler/${s.id}/onayla`, { surum: gu.surum }));
    const satir = tamam(await oku<{ satirlar: { id: number }[] }>('mudur', `/siparisler/${s.id}`)).satirlar[0];
    assert.ok(satir);
    const p = tamam(await yaz<{ id: number }>('planlama', `/projeler/siparisten/${s.id}/ac`, { kod: 'E2E.P2', ad: 'Deneme gec proje', baslangic: S.bugun, bitis: S.ileri, aciklama: null }));
    const e = tamam(await yaz<{ uretimEmriId: number }>('planlama', `/rota/revizyonlar/${S.rev}/emre-kopyala`,
      { adet: MAMUL_ADET, teslim: S.ileri, projeId: p.id, siparisSatiriId: satir.id, stoktanRezerve: false }));

    const gun = new Date(`${S.bugun}T00:00:00Z`);
    do gun.setUTCDate(gun.getUTCDate() + 1); while (gun.getUTCDay() === 0 || gun.getUTCDay() === 6);
    mock.timers.enable({ apis: ['Date'], now: Date.parse(`${gun.toISOString().slice(0, 10)}T10:00:00+03:00`) });
    try {
      const o = tamam(await yaz<{ taslak: { id: number } | null; yerlesimler: { uretimEmriId: number }[] }>('planlama', '/plan/oner', { taslak: null }));
      assert.ok(o.taslak);
      // Birinci emir bitti; planda yalnız bu emrin iki işi var.
      assert.deepEqual([...new Set(o.yerlesimler.map((x) => x.uretimEmriId))], [e.uretimEmriId]);
      const maliyet = async (): Promise<number | null> => tamam(await oku<PlanCevabi>('mudur', `/plan?taslak=${o.taslak?.id}`)).gostergeler.maliyetTl;
      const sinifsiz = await maliyet();
      assert.ok(sinifsiz !== null && sinifsiz > 0, `geciken siparişin plan bedeli ${String(sinifsiz)}`);
      // 265 a: A sınıfı müşteri çarpanı 1,5 (göçün varsayılanı); sınıfı Müşteri-Tedarikçi yazar, plan kablolamadan okur (#2036).
      tamam(await yaz('planlama', `/musteri-tedarikci/firmalar/${f.firma.id}/guncelle`,
        { ad: 'Deneme Gec Musteri AS', tur: 'musteri', musteriSinifi: 'A', surum: f.firma.surum }));
      const aSinifi = await maliyet();
      assert.ok(aSinifi !== null);
      assert.ok(Math.abs(aSinifi - sinifsiz * 1.5) <= 0.01 * sinifsiz, `A sınıfı bedel ${aSinifi}, sınıfsız ${sinifsiz}`);
    } finally { mock.timers.reset(); }
  });
});
