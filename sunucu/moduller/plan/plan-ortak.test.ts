import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { KuyrukYazCevabi, PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import type { AdimGirdisi, KomutCevabi, RevizyonAyrintisi, SeceneklerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';

export const PAROLA = 'dogru-parola-1';

interface Rol { id: number; ad: string }
type Cerez = string;

// Plan testlerinin ortak kurulumu: her test dosyası kendi test veritabanını açar, böylece dosyalar ayrı parçalarda koşar ve
// önceki dosyanın açtığı iş emirleri sonraki dosyanın öneri süresine eklenmez. describe içinde çağrılır; before ve after'ı kaydeder.
// Kendi testi yoktur; adı .test.ts'tir çünkü kurulumun SQL'i sınır denetiminde yalnız test dosyasında serbesttir.
export function planTestOrtami() {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let denemeProjeId = 0;
  const c: Record<'yonetici' | 'kartOnaycisi' | 'planlama' | 'planlama2' | 'mudur' | 'kalite' | 'cam' | 'operator', Cerez> = {
    yonetici: '', kartOnaycisi: '', planlama: '', planlama2: '', mudur: '', kalite: '', cam: '', operator: '',
  };
  let tipler: SeceneklerCevabi['operasyonTipleri'] = [];
  let istasyonA = 0;
  let istasyonB = 0;
  let makineA = 0;
  let makineB = 0;
  let operatorId = 0;
  let merkezId = 0;
  let tamGun: number[] = [];
  // Onaya giden rotanın ilk adımında giren olmalı (#1372): örnek adımlar bu hammaddeyi tüketir.
  let ortakHammadde = 0;
  let sayac = 0;

  // Merkeze tam gün vardiya (650 a: tezgâh kendi merkezinin haftasıyla çalışır; vardiyasız merkezin işi yerleşmez, 168 b).
  const tamGunVer = async (merkez: number): Promise<void> => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    await ortam.sahip.sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) SELECT $1, g, v FROM generate_series(1, 7) g, unnest($2::int[]) v', [merkez, tamGun]);
  };
  const tamGunMerkezi = async (kod: string, ad: string): Promise<number> => {
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod, ad, aciklama: null });
    await tamGunVer(merkez.id);
    return merkez.id;
  };
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  // Her yazma isteği yeni bir istek kimliği taşır (tekrar korumalı uçlar onu ister); tekrar testi kimliği kendisi verir.
  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, kimlik: string | null = randomUUID()) =>
    app.inject({
      method: yontem, url: `/api${url}`, payload: payload as object | undefined,
      headers: { cookie: cerez, ...(yontem === 'POST' && kimlik !== null ? { [ISTEK_KIMLIGI_BASLIGI]: kimlik } : {}) },
    });

  async function tamam<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown): Promise<T> {
    const cevap = await istek(cerez, yontem, url, payload);
    assert.equal(cevap.statusCode, 200, `${yontem} ${url}: ${cevap.body}`);
    return cevap.json();
  }

  async function kisiEkle(kullaniciAdi: string, rolId: number): Promise<void> {
    await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, id, rolId);
      for (const rol of kisi.roller) if (rol.id !== rolId) await rolAl(db, yoneticiId, id, rol.id);
    });
  }

  // Kart malzemeler modülünün kendi uçlarıyla açılır ve onaylanır (dört göz ayarı testte kapalı). Kartın sayı kimliği (`no`)
  // test kurulumunda veritabanından okunur: malzemeler modülü bugün onu uçta vermiyor.
  const kartZorunlulari = (tur: string, sira: number): Record<string, unknown> => ({
    hammadde: { grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 + sira } },
    mamul: { g: { ad: `Deneme mamul ${sira}` } },
    yarimamul: { g: { ad: `Deneme yarimamul ${sira}`, tip: 'Talaşlı işlenmiş parça' } },
    ticari_mal: { g: { ad: `Deneme ticari_mal ${sira}` } },
    hizmet: { g: { kat: 'fason', yon: 'Alınan', cesit: 'Talaşlı imalat' } },
  } as Record<string, Record<string, unknown>>)[tur] ?? {};
  async function kartAc(tur: 'mamul' | 'yarimamul' | 'hammadde', durum: 'aktif' | 'taslak' = 'aktif'): Promise<number> {
    const kimlik = `rt${++sayac}`;
    // Kart, malzeme sihirbazının zorunlu alanlarıyla açılır (malzemeler B11): hammaddede aile, kalite ve kart başına ayrı ölçü.
    const zorunlu = kartZorunlulari(tur, sayac);
    const kod = `${tur === 'hammadde' ? 'HM' : tur === 'mamul' ? 'MM' : 'YM'}-RTA-00001`;
    const govde = (d: string, surum: number | null) => ({
      kayit: { id: kimlik, tur, fam: 'metal', com: { kod, ad: `Deneme ${tur} ${sayac}`, birim: 'adet' }, onay: { durum: d }, ...zorunlu },
      ozet: { stok_kodu: kod, tur, onay_durumu: d, benzersiz_anahtar: `${tur}|${kimlik}`, mukerrer_gerekcesi: null },
      surum,
    });
    const r = await tamam<{ surum: number }>(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('taslak', null));
    if (durum === 'aktif') {
      const g = await tamam<{ surum: number }>(c.yonetici, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('onayda', r.surum));
      await tamam(c.kartOnaycisi, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, govde('aktif', g.surum));
    }
    const satir = await vt().tx((db) => db.tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]));
    return satir!.no;
  }
  const mamulAc = (): Promise<number> => kartAc('mamul');
  const hammaddeAc = (): Promise<number> => kartAc('hammadde');

  const tip = (kod: string): number => {
    const t = tipler.find((x) => x.kod === kod);
    if (!t) throw new Error(`Operasyon tipi yok: ${kod}`);
    return t.id;
  };

  const yeniAdim = (p: Partial<AdimGirdisi> = {}): AdimGirdisi => ({
    opNo: null, operasyonTipiId: tip('TRN'), ad: 'Deneme adım', kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 30, birimSureDk: 2,
    bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true,
    adaylar: [], bilesenler: ortakHammadde ? [{ malzemeId: ortakHammadde, miktar: 1, fireYuzde: 0 }] : [], yanUrunler: [], ...p,
  });

  // Ayrıntıdan kaydet gövdesine: ekran da aynı dönüşümü yapar.
  const govdeye = (a: RevizyonAyrintisi['adimlar'][number]): AdimGirdisi => ({
    opNo: a.opNo, operasyonTipiId: a.operasyonTipi.id, ad: a.ad, kaynak: a.kaynak ? { tur: a.kaynak.tur, id: a.kaynak.id } : null,
    ayarSuresiDk: a.ayarSuresiDk === null ? null : Number(a.ayarSuresiDk), birimSureDk: a.birimSureDk === null ? null : Number(a.birimSureDk),
    bagimlilik: a.bagimlilik, devirAdedi: a.devirAdedi, firePayiYuzde: Number(a.firePayiYuzde), makineKullanimi: a.makineKullanimi,
    enKucukParca: a.enKucukParca, yenidenAyar: a.yenidenAyar,
    adaylar: a.adaylar.map((x) => ({ kaynak: { tur: x.kaynak.tur, id: x.kaynak.id }, ayarSuresiDk: x.ayarSuresiDk === null ? null : Number(x.ayarSuresiDk), birimSureDk: x.birimSureDk === null ? null : Number(x.birimSureDk) })),
    bilesenler: a.bilesenler.map((b) => ({ malzemeId: b.malzeme.id, miktar: Number(b.miktar), fireYuzde: Number(b.fireYuzde) })),
    yanUrunler: a.yanUrunler.map((y) => ({ malzemeId: y.malzeme.id, miktar: Number(y.miktar) })),
  });

  const ayrinti = (id: number, cerez = c.planlama) => tamam<RevizyonAyrintisi>(cerez, 'GET', `/rota/revizyonlar/${id}`);
  const taslakAc = (urun: number, kaynak: Record<string, unknown> = { tur: 'bos' }, cerez = c.planlama) =>
    istek(cerez, 'POST', `/rota/urunler/${urun}/taslak-ac`, { kaynak });
  const kaydet = (id: number, surum: number, adimlar: AdimGirdisi[], cerez = c.planlama, aciklama: string | null = null) =>
    istek(cerez, 'POST', `/rota/revizyonlar/${id}/kaydet`, { surum, aciklama, adimlar });
  const komut = (id: number, ad: string, govde: Record<string, unknown>, cerez: Cerez) => istek(cerez, 'POST', `/rota/revizyonlar/${id}/${ad}`, govde);

  // Taslak açar, adımları kaydeder, onaya gönderir, müdüre onaylatıp yürürlüğe alır.
  async function yururlugeAlinmisRota(urun: number, adimlar: AdimGirdisi[]): Promise<number> {
    const ac = await taslakAc(urun);
    assert.equal(ac.statusCode, 200, ac.body);
    const { id } = ac.json<KomutCevabi>();
    const k = await kaydet(id, 1, adimlar);
    assert.equal(k.statusCode, 200, k.body);
    const g = await komut(id, 'onaya-gonder', { surum: k.json<KomutCevabi>().surum }, c.planlama);
    assert.equal(g.statusCode, 200, g.body);
    const o = await komut(id, 'onayla', { surum: g.json<KomutCevabi>().surum, yururlugeAl: true }, c.mudur);
    assert.equal(o.statusCode, 200, o.body);
    return id;
  }

  before(async () => {
    ortam = await testVeritabaniKur('plan');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('PLAN.DENEME', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    c.yonetici = await girisCerezi('yonetici');
    // Rol x işlem satırları teslimle girmez (şartname): önerilen dağılım test veritabanına burada yazılır (UYGULA.md'deki öneri göçüyle aynı).
    await ortam.vt.tx((db) => db.sorgu(
      `INSERT INTO rol_islemi (rol_id, islem)
       SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem FROM (VALUES
         ('planlama_proje', 'rota.yaz'), ('planlama_proje', 'rota.talimat-yaz'), ('planlama_proje', 'rota.emre-kopyala'),
         ('mudur', 'rota.onayla'), ('cam', 'rota.talimat-yaz'),
         ('planlama_proje', 'plan.yaz'), ('planlama_proje', 'plan.kilitle'), ('planlama_proje', 'plan.studyo'), ('planlama_proje', 'plan.canliya-al'),
         ('mudur', 'plan.kilitle'), ('mudur', 'plan.studyo'), ('mudur', 'plan.canliya-al'),
         -- Önizleme iki işlemden birini ister; tek işlemle kabul bu iki rolle ölçülür.
         ('kalite', 'rota.emre-kopyala'), ('cam', 'plan.yaz'),
         -- Kapalı gün canlıya vardiya yazma da ister: kalitede plan.canliya-al var, vardiya.yaz yok.
         ('kalite', 'plan.canliya-al')) AS m (kod, islem)
       ON CONFLICT DO NOTHING`,
    ));
    // Malzeme kartını açan onaylayamaz (malzemeler modülünün kuralı): kartı ikinci bir yönetici onaylar.
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kart Onaycısı', kullaniciAdi: 'kartonay', parola: PAROLA }));
    c.kartOnaycisi = await girisCerezi('kartonay');
    const roller = ((await istek(c.yonetici, 'GET', '/roller')).json() as { roller: Rol[] }).roller;
    const rol = (ad: string): number => {
      const r = roller.find((x) => x.ad === ad);
      if (!r) throw new Error(`Rol yok: ${ad}`);
      return r.id;
    };
    const kullanicilar = [['planlama', 'Planlama ve Proje'], ['planlama2', 'Planlama ve Proje'], ['mudur', 'Müdür'], ['kalite', 'Kalite'], ['cam', 'CAM'], ['operator', 'Operatör']] as const;
    for (const [ad, rolAdi] of kullanicilar) {
      await kisiEkle(ad, rol(rolAdi));
      c[ad] = await girisCerezi(ad);
    }
    tipler = (await tamam<SeceneklerCevabi>(c.operator, 'GET', '/rota/secenekler')).operasyonTipleri;
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'RT-IM', ad: 'Deneme merkez', aciklama: null });
    istasyonA = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-A', ad: 'Deneme A', isMerkeziId: merkez.id })).id;
    istasyonB = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'RT-B', ad: 'Deneme B', isMerkeziId: merkez.id })).id;
    makineA = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MA', ad: 'Deneme makine A', istasyonId: istasyonA })).id;
    makineB = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'RT-MB', ad: 'Deneme makine B', istasyonId: istasyonB })).id;
    operatorId = (await vt().tx((db) => db.tek<{ id: number }>("SELECT id FROM kisi WHERE ad = 'Deneme operator'")))!.id;
    // ADR 0018: plan sunucu motoruyla dizilir. Motor vardiyası tanımsız tezgâha yer vermez (168 b, 650 a: tezgâh kendi merkezinin haftasıyla)
    // ve planlama sayfasının çalışma kaydı olmadan çözmez (409): merkez her gün tam gün çalışır (Motor A'nın takvimsiz varsayımı), kayıt boştur
    // (vardiya, tezgâh ve emir canlıdan). Tam gün iki yarımdır: vardiyanın başı ve sonu aynı saat olamaz.
    tamGun = (await ortam.sahip.sorgu<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('RT gun ilk yari', '00:00', '12:00'), ('RT gun son yari', '12:00', '00:00') RETURNING id")).map((x) => x.id);
    await tamGunVer(merkez.id);
    merkezId = merkez.id;
    await tamam(c.yonetici, 'POST', '/plan/planlama-kayitlari/yaz', {
      anahtar: PLANLAMA_ANAHTARI, bicim: 'json', beklenenSurum: null,
      deger: {
        surum: 2, rrSavedAt: null, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
        w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
        D: { meta: { ad: 'Deneme', baslangic: tesisGunu(Date.now()) }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [],
          tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
      },
    });
    ortakHammadde = await hammaddeAc();
  });

  after(async () => { await ortam?.kaldir(); });

  // Rota yürürlüğe alınır ve emre kopyalanır (uretim-emirleri): her adımı bir iş emri olur.
  async function isEmirleriAc(adimlar: AdimGirdisi[], adet = 10, teslim: string | null = null, ek: Record<string, unknown> = {}): Promise<number[]> {
    const urun = await mamulAc();
    const id = await yururlugeAlinmisRota(urun, adimlar);
    return (await tamam<{ isEmriIdleri: number[] }>(c.planlama, 'POST', `/rota/revizyonlar/${id}/emre-kopyala`, { projeId: denemeProjeId, adet, teslim, ...ek })).isEmriIdleri;
  }
  const isEmriDurumu = (id: number, durum: 'bekliyor' | 'calisiyor') => vt().tx((db) => db.sorgu(
    'UPDATE uretim_emirleri_is_emri SET durum = $2, baslama = CASE WHEN $2 = \'calisiyor\' THEN now() END WHERE id = $1', [id, durum]));
  const isEmriMakinesi = async (id: number) =>
    (await vt().tx((db) => db.tek<{ makine_id: number | null }>('SELECT makine_id FROM uretim_emirleri_is_emri WHERE id = $1', [id])))?.makine_id;
  const planOku = (taslak?: number, cerez = c.planlama) => tamam<PlanCevabi>(cerez, 'GET', `/plan${taslak ? `?taslak=${taslak}` : ''}`);
  const yer = (p: PlanCevabi, isEmriId: number) => p.yerlesimler.find((y) => y.isEmriId === isEmriId)!;
  const tg = (p: PlanCevabi) => ({ id: p.taslak!.id, surum: p.taslak!.surum });
  // Yeni taslak açıp motora önerdirir (P6: canlıdayken yapılan işlem kullanıcıya taslak açar).
  // Planlama sayfasının "Planı kur"u (ADR 0018): kaldırılan Motor A önerisinin (/plan/oner) yerini tutar. Canlıda yerleşmiş, yerinden
  // oynayabilen (planlı, kilitsiz, dondurulmamış, bölünmemiş) işler kendi makinesinde başlangıç sırasıyla, yerleşmemiş işler rotadaki makinede
  // arkalarından kuyruğa yazılır; saatleri sunucu motoru verir, yeni taslak açılır. Taslak (cevabı ya da kimliği) verilirse plan ondan okunur
  // ve ona yazılır. Elle sıra ve elle seçilen makine işaretiyle gider (sayfa da öyle gönderir).
  const taslaktaOner = async (cerez = c.planlama, taslak?: PlanCevabi | number): Promise<PlanCevabi> => {
    const id = typeof taslak === 'number' ? taslak : taslak?.taslak?.id;
    const canli = id === undefined ? await tamam<PlanCevabi>(cerez, 'GET', '/plan') : await tamam<PlanCevabi>(cerez, 'GET', `/plan?taslak=${String(id)}`);
    type Satir = { emirNo: string; opNo: number; elleSira?: number | null; elleKaynak?: boolean };
    const kuyruk = new Map<number, Satir[]>();
    // Kullanımda olmayan (arıza, pasif) makineye iş yazılmaz; sayfa da onu kuyruğa koymaz.
    const aktif = new Set(canli.kaynaklar.filter((x) => x.tur === 'makine' && x.aktif).map((x) => x.id));
    const ekle = (makineId: number, y: Satir) => aktif.has(makineId) && kuyruk.set(makineId, [...(kuyruk.get(makineId) ?? []), y]);
    const oynar = canli.yerlesimler.filter((y) => y.durum === 'planli' && !y.kilitli && !y.dondurulmus && !y.parcalar?.length && y.kaynak.tur === 'makine');
    for (const y of oynar.sort((a, b) => Date.parse(a.baslangic) - Date.parse(b.baslangic))) ekle(y.kaynak.id, y);
    for (const y of canli.yerlesmemis) if (y.kaynak?.tur === 'makine' && y.durum === 'planli' && !y.bolme) ekle(y.kaynak.id, y);
    if (kuyruk.size === 0) throw new Error('Planı kur: kuyruğa yazılacak iş yok.');
    // Elle sıralı iş kuyruktaki yerini (elle sıra numarasını) korur; ötekiler başlangıç sırasıyla aradaki yerleri doldurur.
    const dizi = (l: Satir[]) => {
      const elle = l.filter((y) => y.elleSira != null).sort((a, b) => a.elleSira! - b.elleSira!);
      const diger = l.filter((y) => y.elleSira == null);
      const r: Satir[] = [];
      while (elle.length || diger.length) r.push(elle.length && (elle[0]!.elleSira! <= r.length + 1 || !diger.length) ? elle.shift()! : diger.shift()!);
      return r.map((y) => ({ emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: y.elleSira != null, ...(y.elleKaynak ? { elleKaynak: true } : {}) }));
    };
    const k = await tamam<KuyrukYazCevabi>(cerez, 'POST', '/plan/kuyruklari-yaz', {
      kuyruklar: [...kuyruk].map(([id, isler]) => ({ kaynak: { tur: 'makine', id }, baslangic: new Date().toISOString(), isler: dizi(isler) })), planSurumu: canli.surum,
      ...(canli.taslak ? { taslak: tg(canli) } : {}),
    });
    return tamam<PlanCevabi>(cerez, 'GET', `/plan?taslak=${k.taslak}`);
  };
  // Taslağa yazma denetimi (sahiplik, sürüm, onaydaki taslak): kaldırılan /plan/oner yerine tek işlik kuyruk yazımı.
  const taslagaYaz = async (cerez: string, taslak: { id: number; surum: number }, isEmriId: number) => {
    const p = await tamam<PlanCevabi>(c.planlama, 'GET', `/plan?taslak=${String(taslak.id)}`);
    const y = p.yerlesimler.find((x) => x.isEmriId === isEmriId) ?? p.yerlesmemis.find((x) => x.isEmriId === isEmriId)!;
    const kaynak = y.kaynak ?? { tur: 'makine' as const, id: makineA };
    return istek(cerez, 'POST', '/plan/kuyruklari-yaz', { taslak, kuyruklar: [{ kaynak, baslangic: new Date().toISOString(), isler: [{ emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: false }] }] });
  };
  const isEmriKomutu = (p: PlanCevabi, isEmriId: number, ad: string, govde: Record<string, unknown> = {}, cerez = c.planlama) =>
    istek(cerez, 'POST', `/plan/is-emirleri/${isEmriId}/${ad}`, { taslak: tg(p), ...govde });

  // İlkel değerler before'dan sonra dolar: test dosyası kendi before'unda okur.
  const durum = () => ({ ortam, app, yoneticiId, denemeProjeId, istasyonA, istasyonB, makineA, makineB, operatorId, merkezId, tamGun });
  return { c, vt, girisCerezi, istek, tamam, kisiEkle, kartAc, mamulAc, hammaddeAc, tip, yeniAdim, govdeye, ayrinti, taslakAc, kaydet, komut, yururlugeAlinmisRota, isEmirleriAc, isEmriDurumu, isEmriMakinesi, planOku, yer, tg, taslaktaOner, isEmriKomutu, taslagaYaz, tamGunVer, tamGunMerkezi, durum };
}
