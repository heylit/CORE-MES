import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { hazirlikGorevleri, hazirlikGorevleriAc } from '../projeler/disari.ts';
import { hazirligiKapananEmirler, uretimEmriAc } from './disari.ts';
import { hazirlikCozucusuKaydet } from './hazirlik.ts';
import { gorevinSistemHali, hazirligiKapatanEmir } from './kurallar.ts';
import { EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { butunOlaylariVeEskiKademeleriAc } from '../bildirim/disari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// 3396 Risk K-A: hangi emir durumu hazırlık görevini kapatır.
describe('uretim-emirleri hazırlığı kapatan emir (3396)', () => {
  test('bitti, iptal ve olmayan emir kapatır; taslak, planlı, başlamış sürer', () => {
    assert.deepEqual(EMIR_DURUMLARI.filter((d) => hazirligiKapatanEmir(d)), ['bitti', 'iptal']);
    assert.equal(hazirligiKapatanEmir(undefined), true);
  });
});

// 3396 a: şablonun hazırlık kalemi emir ya da iş emri başına görev doğurur; kapalı madde doğurmaz; ikinci kez uygulanınca çoğalmaz.
describe('uretim-emirleri hazırlık görevi (3396, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let emirProjesi = 0;
  let sablonId = 0;
  let planlamaRolId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let makineId = 0;
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
  async function istek<T = unknown>(ad: string, yol: string, govde: unknown): Promise<Cevap<T>> {
    const c = await app.inject({
      method: 'POST', url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde as object,
    });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function kisiEkle(kullaniciAdi: string, rolKodu: string, ekIslem: string | null = null): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    if (ekIslem !== null) await o().sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rol.id, ekIslem]);
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
  const adim = (sira: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  // Emir projesiz açılamaz: "başka proje" durumunda emir şablonsuz bir projededir, görevler hazırlık projesinde açılır.
  const emirAc = (proje: number | null) => o().vt.tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
    malzemeNo: urunNo, adet: 3, teslim: null, kaynakRotaRevizyonId: rev, projeId: proje ?? emirProjesi, isEmirleri: [adim(1), adim(2)],
  }));
  // 3458-2 a: şablon projeye yalnız Projeler > Görevleri dağıt ile uygulanır; hazırlık görevlerini de o açar.
  const projeDagit = (proje: number, sablon: number) => istek<{ projeGorevi: number; hazirlikGorevi: number }>('mudur', `/projeler/${String(proje)}/dagit`, { sablonId: sablon });
  const gorevler = (emirId: number) => o().vt.okumaTx((db) => hazirlikGorevleri(db, [emirId]));
  const ozet = async (emirId: number) => (await gorevler(emirId)).map((g) => `${g.madde}:${g.isEmriId === null ? 'emir' : 'ie'}`).sort();

  before(async () => {
    ortam = await testVeritabaniKur('uretim_hazirlik_gorevi');
    // 3478: olaylar varsayılan kapalıdır; bu dosya 3478'den önceki gibi açık olaylarla çalışır.
    await ortam.vt.tx((db) => butunOlaylariVeEskiKademeleriAc(db, null));
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const yeniProje = async (kod: string) => (await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ($1, 'Deneme proje', $2) RETURNING id", [kod, yoneticiId]))!.id;
    projeId = await yeniProje('UE.HZG');
    emirProjesi = await yeniProje('UE.HZE');
    await kisiEkle('planlama_proje', 'planlama_proje');
    // Hazırlık dağıtma işlemi olmayan rol (3396-4 a: planlama artık dağıtır).
    await kisiEkle('yetkisiz', 'cam');
    // Emrin sistem hâli yalnız adımlı emri okuyana gider; satış projeyi okur, emri okumaz (yetki matrisi).
    await kisiEkle('okur', 'satis');
    await kisiEkle('dagitici', 'kalite', 'projeler.hazirlik-dagit');
    // Görevleri dağıtan kişi atanan rolün üyesi olmasın: kişi kendine zil almaz.
    await kisiEkle('mudur', 'mudur');
    planlamaRolId = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'planlama_proje'"))!.id;
    await ortam.sahip.sorgu("INSERT INTO uretim_emirleri_hazirlik_maddesi (kod, ad, kisa, sira, sistem) VALUES ('ozel-a', 'Boya onayı', 'Boya', 130, false)");
    await ortam.sahip.sorgu("UPDATE uretim_emirleri_hazirlik_maddesi SET acik = false WHERE kod = 'malzeme'");
    sablonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_gorev_sablonu (ad, olusturan_id) VALUES ('Hazırlık', $1) RETURNING id", [yoneticiId]))!.id;
    const kalem = (sira: number, ad: string, madde: string | null) => ortam!.sahip.sorgu(
      `INSERT INTO projeler_gorev_sablon_kalemi (sablon_id, sira, ad, dayanak, gun, sure_gun, yapan_rol_id, hazirlik_maddesi)
       VALUES ($1, $2, $3, 'baslangic', 0, 2, $4, $5)`, [sablonId, sira, ad, planlamaRolId, madde]);
    await kalem(0, 'Başlangıç toplantısı', null);
    await kalem(1, 'CNC programı', 'cnc');
    await kalem(2, 'Çizim onayı', 'cizim');
    await kalem(3, 'Malzeme', 'malzeme');
    await kalem(4, 'Boya onayı', 'ozel-a');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('HZG-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HZG-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('hzg-dnm-1', 'mamul', 'HZG-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'hzg-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('HZGM', 'Deneme Merkezi') RETURNING id");
    const istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('HZGI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('HZG1', 'Tezgah', $1) RETURNING id", [istasyonId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetkisiz kişi hazırlık projesi kuramaz (403)', async () => {
    const { uretimEmriId } = await emirAc(null);
    assert.equal((await istek('yetkisiz', `/adimli-emirler/${String(uretimEmriId)}/hazirlik-projesi`, { projeId, sablonId })).durum, 403);
  });

  test('şablonla kurulunca: CNC ve özel madde iş emri başına, çizim emir başına; kapalı malzeme yok; tekrarı çoğalmaz', async () => {
    const { uretimEmriId } = await emirAc(null);
    const yol = `/adimli-emirler/${String(uretimEmriId)}/hazirlik-projesi`;
    assert.equal((await istek('dagitici', yol, { projeId, sablonId })).durum, 400, 'dağıtılmamış şablon hazırlıktan uygulanmaz');
    const pd = await projeDagit(projeId, sablonId);
    assert.equal(pd.durum, 200, JSON.stringify(pd.govde));
    assert.deepEqual([pd.govde.projeGorevi, pd.govde.hazirlikGorevi], [1, 0], 'projeye bağlı emir yok; hazırlık görevi emir bağlanınca açılır');
    const c = await istek<{ eklenen: number }>('dagitici', yol, { projeId, sablonId });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.eklenen, 5);
    assert.deepEqual(await ozet(uretimEmriId), ['cizim:emir', 'cnc:ie', 'cnc:ie', 'ozel-a:ie', 'ozel-a:ie']);
    const normal = await o().sahip.sorgu<{ ad: string }>('SELECT ad FROM projeler_gorev WHERE proje_id = $1 AND hazirlik_maddesi IS NULL', [projeId]);
    assert.deepEqual(normal.map((x) => x.ad), ['Başlangıç toplantısı'], 'hazırlık dışı kalem bir kez proje görevi olur');
    const tekrar = await istek<{ eklenen: number }>('dagitici', yol, { projeId, sablonId });
    assert.equal(tekrar.govde.eklenen, 0);
    assert.equal((await gorevler(uretimEmriId)).length, 5);
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM projeler_proje_sablonu WHERE proje_id = $1', [projeId]))?.n, 1);
  });

  test('iptal edilen görevin yerine yenisi açılabilir; emir açılınca projedeki şablonun görevleri kendiliğinden doğar', async () => {
    const { uretimEmriId } = await emirAc(projeId);
    assert.deepEqual(await ozet(uretimEmriId), ['cizim:emir', 'cnc:ie', 'cnc:ie', 'ozel-a:ie', 'ozel-a:ie']);
    const cizim = (await gorevler(uretimEmriId)).find((g) => g.madde === 'cizim');
    await o().sahip.sorgu("UPDATE projeler_gorev SET durum = 'iptal' WHERE id = $1", [cizim?.id]);
    const c = await istek<{ eklenen: number }>('dagitici', `/adimli-emirler/${String(uretimEmriId)}/hazirlik-projesi`, { projeId, sablonId: null });
    assert.equal(c.govde.eklenen, 1);
    await assert.rejects(o().sahip.sorgu(
      `INSERT INTO projeler_gorev (proje_id, ad, plan_baslangic, plan_bitis, olusturan_id, hazirlik_maddesi, hazirlik_emri_id)
       VALUES ($1, 'Çift', current_date, current_date, $2, 'cizim', $3)`, [projeId, yoneticiId, uretimEmriId]), /hazirlik_tekil/);
    await assert.rejects(o().sahip.sorgu(
      `INSERT INTO projeler_gorev (proje_id, ad, plan_baslangic, plan_bitis, olusturan_id, hazirlik_emri_id)
       VALUES ($1, 'Yarım', current_date, current_date, $2, $3)`, [projeId, yoneticiId, uretimEmriId]), /hazirlik_butun/);
  });

  test('pencere seçenekleri: şablonla kaç görev doğacağı açık maddeye ve iş emri sayısına göredir; yetkisize 403', async () => {
    const { uretimEmriId } = await emirAc(null);
    const yol = `/api/adimli-emirler/${String(uretimEmriId)}/hazirlik-projesi`;
    assert.equal((await app.inject({ method: 'GET', url: yol, headers: { cookie: cerezler.get('yetkisiz') ?? '' } })).statusCode, 403);
    const c = await app.inject({ method: 'GET', url: yol, headers: { cookie: cerezler.get('dagitici') ?? '' } });
    assert.equal(c.statusCode, 200, c.body);
    const v = c.json<{ emirProjeId: number; acikGorev: number; sablonlar: { id: number; dogacak: number; ozet: string }[]; projeler: { id: number }[] }>();
    assert.equal(v.emirProjeId, emirProjesi);
    assert.equal(v.acikGorev, 0);
    const sb = v.sablonlar.find((x) => x.id === sablonId);
    assert.equal(sb?.dogacak, 5);
    assert.match(sb?.ozet ?? '', /^2 iş emri × \(CNC kurulumu, Boya onayı\) ve emir başına Çizim/);
    assert.ok(v.projeler.some((x) => x.id === projeId));
  });

  test('Proje > Hazırlık: deneme hiçbir şey yazmaz ve alıcıyı rol üye sayısıyla verir; dağıt aynı sayıda görev açar; matris hücreleri görevden', async () => {
    const dagitProjesi = (await o().sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.HZD', 'Dağıt', $1) RETURNING id", [yoneticiId]))!.id;
    const a = await emirAc(dagitProjesi);
    const b = await emirAc(dagitProjesi);
    const dagit = (deneme: boolean) => istek<{ eklenen: number; gorevSayisi: number; toplamKisi: number; alicilar: { tur: string; kisiSayisi: number; gorevler: { madde: string; sayi: number }[] }[] }>(
      'dagitici', '/hazirlik-matrisi/dagit', { projeId: dagitProjesi, sablonId, deneme });
    assert.equal((await istek('yetkisiz', '/hazirlik-matrisi/dagit', { projeId: dagitProjesi, sablonId, deneme: true })).durum, 403);
    const d = await dagit(true);
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.deepEqual([d.govde.eklenen, d.govde.gorevSayisi], [0, 10]);
    assert.equal(d.govde.alicilar.length, 1);
    assert.equal(d.govde.alicilar[0]?.tur, 'rol');
    assert.ok((d.govde.alicilar[0]?.kisiSayisi ?? 0) >= 1);
    assert.equal(d.govde.toplamKisi, d.govde.alicilar[0]?.kisiSayisi);
    assert.equal((await gorevler(a.uretimEmriId)).length, 0, 'deneme görev açmaz');
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM projeler_proje_sablonu WHERE proje_id = $1', [dagitProjesi]))?.n, 0, 'deneme şablon uygulamaz');
    assert.equal((await dagit(false)).durum, 400, 'dağıtılmamış şablon hazırlıktan açılmaz');
    const g = await projeDagit(dagitProjesi, sablonId);
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.equal(g.govde.hazirlikGorevi, 10, 'Görevleri dağıt denemenin saydığı kadar hazırlık görevi açar');
    assert.equal((await dagit(false)).govde.eklenen, 0);
    assert.equal((await dagit(true)).govde.gorevSayisi, 0, 'dağıtılmış görev yeniden sayılmaz');

    const m = await app.inject({ method: 'GET', url: `/api/hazirlik-matrisi?projeId=${String(dagitProjesi)}`, headers: { cookie: cerezler.get('dagitici') ?? '' } });
    assert.equal(m.statusCode, 200, m.body);
    const v = m.json<{ dagitir: boolean; maddeler: { kod: string }[]; emirler: { id: number; isEmirleri: unknown[] }[]; gorevler: { id: number; madde: string; emriId: number; yapan: { tur: string } | null; surum: number }[] }>();
    assert.equal(v.dagitir, true);
    assert.deepEqual(v.maddeler.map((x) => x.kod), ['cnc', 'cizim', 'ozel-a']);
    assert.deepEqual(v.emirler.map((e) => e.id), [a.uretimEmriId, b.uretimEmriId]);
    assert.equal(v.gorevler.length, 10);
    assert.ok(v.gorevler.every((x) => x.yapan?.tur === 'rol'));

    const hedef = v.gorevler.find((x) => x.madde === 'cizim' && x.emriId === b.uretimEmriId)!;
    const ata = (govde: unknown, ad = 'dagitici') => istek<{ surum: number }>(ad, `/projeler/gorevler/${String(hedef.id)}/hazirlik-ata`, govde);
    assert.equal((await ata({ sorumluKisiId: kim('planlama_proje').id, yapanRolId: null, surum: hedef.surum }, 'yetkisiz')).durum, 403);
    assert.equal((await ata({ sorumluKisiId: kim('planlama_proje').id, yapanRolId: planlamaRolId, surum: hedef.surum })).durum, 400);
    const atandi = await ata({ sorumluKisiId: kim('planlama_proje').id, yapanRolId: null, surum: hedef.surum });
    assert.equal(atandi.durum, 200, JSON.stringify(atandi.govde));
    assert.equal((await ata({ sorumluKisiId: null, yapanRolId: planlamaRolId, surum: hedef.surum })).durum, 409, 'eski sürüm');
    const sonra = (await gorevler(b.uretimEmriId)).find((x) => x.id === hedef.id);
    assert.deepEqual([sonra?.sorumluKisiId, sonra?.yapanRolId], [kim('planlama_proje').id, null]);
  });

  // 3430 a: hücre görevin hâlinin yanında maddenin sistemdeki hâlini taşır; görev bitse de madde eksik kalabilir.
  test('matris görevin yanında maddenin sistem hâlini verir: iş emri satırından, emir genelinden; özel maddede null', async () => {
    const proje = (await o().sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.HZS', 'Sistem', $1) RETURNING id", [yoneticiId]))!.id;
    const a = await emirAc(proje);
    const [ie1, ie2] = a.isEmriIdleri;
    assert.equal((await projeDagit(proje, sablonId)).durum, 200);
    await o().sahip.sorgu("UPDATE projeler_gorev SET durum = 'bitti', ilerleme = 100, gercek_baslangic = CURRENT_DATE, gercek_bitis = CURRENT_DATE WHERE hazirlik_emri_id = $1 AND hazirlik_maddesi = 'cnc'", [a.uretimEmriId]);
    const onceki = hazirlikCozucusuKaydet('cnc', async (_db, idler) => new Map(idler.filter((x) => x === ie1).map((x) => [x, { durum: 'tamam', secildi: true }] as const)));
    try {
      const m = await app.inject({ method: 'GET', url: `/api/hazirlik-matrisi?projeId=${String(proje)}`, headers: { cookie: cerezler.get('dagitici') ?? '' } });
      assert.equal(m.statusCode, 200, m.body);
      const v = m.json<{ gorevler: { madde: string; isEmriId: number | null; durum: string; sistem: string | null }[] }>();
      const hal = (madde: string, isEmriId: number | null) => v.gorevler.find((g) => g.madde === madde && g.isEmriId === isEmriId);
      assert.deepEqual([hal('cnc', ie1!)?.durum, hal('cnc', ie1!)?.sistem], ['bitti', 'tamam']);
      assert.deepEqual([hal('cnc', ie2!)?.durum, hal('cnc', ie2!)?.sistem], ['bitti', 'bilinmiyor'], 'çözücünün bilmediği iş emri: görev bitti, sistem bilinmiyor');
      assert.ok(hal('cizim', null)?.sistem !== null, 'emir geneli madde emrin hâlinden');
      assert.ok(v.gorevler.filter((g) => g.madde.startsWith('ozel-')).every((g) => g.sistem === null), 'özel maddenin sistem hâli yok');
      const okur = await app.inject({ method: 'GET', url: `/api/hazirlik-matrisi?projeId=${String(proje)}`, headers: { cookie: cerezler.get('okur') ?? '' } });
      assert.equal(okur.statusCode, 200, okur.body);
      const ov = okur.json<{ gorevler: { sistem: string | null }[] }>();
      assert.ok(ov.gorevler.length > 0 && ov.gorevler.every((g) => g.sistem === null), 'emri okuyamayana sistem hâli gitmez');
      const y = await app.inject({ method: 'GET', url: `/api/projeler/${String(proje)}/yonetim`, headers: { cookie: cerezler.get('okur') ?? '' } });
      assert.equal(y.statusCode, 200, y.body);
      const tur = y.json<{ gorevler: { hazirlikMaddesi: string | null }[] }>().gorevler.map((g) => g.hazirlikMaddesi);
      assert.ok(tur.includes('cnc') && tur.includes('cizim'), 'proje görev listesinde hazırlık görevi maddesiyle gelir');
    } finally {
      hazirlikCozucusuKaydet('cnc', onceki);
    }
  });

  test('gorevinSistemHali: iş emri satırı önce, yoksa emir geneli; okunamayan emirde null', () => {
    const h = {
      maddeler: [{ madde: 'cnc' as const, durum: 'eksik' as const, muafTutulur: true, isEmriDuzeyi: true }, { madde: 'cizim' as const, durum: 'tamam' as const, muafTutulur: true, isEmriDuzeyi: false }],
      muafiyetler: [],
      isEmirleri: [{ isEmriId: 5, opNo: 10, ad: 'Torna', bitti: false, maddeler: [{ madde: 'cnc' as const, durum: 'tamam' as const }] }],
    };
    assert.equal(gorevinSistemHali(h, 'cnc', 5), 'tamam');
    assert.equal(gorevinSistemHali(h, 'cnc', null), 'eksik');
    assert.equal(gorevinSistemHali(h, 'cizim', 5), 'tamam', 'iş emri satırında olmayan madde emir geneline düşer');
    assert.equal(gorevinSistemHali(h, 'ozel-a', 5), null);
    assert.equal(gorevinSistemHali(undefined, 'cnc', 5), null);
  });

  test('kapalı projeye kurulmaz; şablonsuz projede açılan emir görev doğurmaz', async () => {
    const { uretimEmriId } = await emirAc(null);
    await o().sahip.sorgu("UPDATE projeler_proje SET durum = 'tamamlandi' WHERE kod = 'UE.HZG'");
    try {
      assert.equal((await istek('dagitici', `/adimli-emirler/${String(uretimEmriId)}/hazirlik-projesi`, { projeId, sablonId })).durum, 400);
    } finally {
      await o().sahip.sorgu("UPDATE projeler_proje SET durum = 'aktif' WHERE kod = 'UE.HZG'");
    }
    const e = await emirAc(null);
    assert.equal((await gorevler(e.uretimEmriId)).length, 0);
  });
  // --- Test incelemesi T7, T8 (3396) ---
  const yeniProje = async (kod: string) => (await o().sahip.tek<{ id: number }>(
    "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ($1, 'Deneme proje', $2) RETURNING id", [kod, yoneticiId]))!.id;
  const yeniSablon = async (ad: string, kalemler: readonly { madde: string | null; rol?: boolean; dayanak?: 'baslangic' | 'termin'; gun?: number }[]) => {
    const id = (await o().sahip.tek<{ id: number }>('INSERT INTO projeler_gorev_sablonu (ad, olusturan_id) VALUES ($1, $2) RETURNING id', [ad, yoneticiId]))!.id;
    for (const [i, k] of kalemler.entries()) {
      await o().sahip.sorgu(
        `INSERT INTO projeler_gorev_sablon_kalemi (sablon_id, sira, ad, dayanak, gun, sure_gun, yapan_rol_id, hazirlik_maddesi)
         VALUES ($1, $2, $3, $4, $5, 2, $6, $7)`, [id, i, `Kalem ${String(i)}`, k.dayanak ?? 'baslangic', k.gun ?? 0, k.rol === false ? null : planlamaRolId, k.madde]);
    }
    return id;
  };
  type Dagit = { eklenen: number; gorevSayisi: number; toplamKisi: number; atanmamis: number };
  const dagitIstek = (proje: number, sablon: number | null, deneme: boolean) => istek<Dagit>('dagitici', '/hazirlik-matrisi/dagit', { projeId: proje, sablonId: sablon, deneme });
  const atamaZili = async (kisiId: number, proje: number) => (await o().sahip.tek<{ n: number }>(
    "SELECT count(*)::int AS n FROM bildirim_kaydi WHERE kisi_id = $1 AND tur = 'projeler.gorev-atandi' AND tekil_anahtar = $2", [kisiId, `projeler.gorev-atandi:proje-${String(proje)}`]))?.n;

  test('T7 dağıtım engelleri: kapalı projede 400 ve dagitir false; kapalı emir atlanır; kapalı emre hazırlık projesi 409', async () => {
    const proje = await yeniProje('UE.HZK');
    const acik = await emirAc(proje);
    const kapali = await emirAc(proje);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [kapali.uretimEmriId]);
    const d = await projeDagit(proje, sablonId);
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.equal(d.govde.hazirlikGorevi, 5, 'yalnız açık emir');
    assert.equal((await gorevler(acik.uretimEmriId)).length, 5);
    assert.equal((await gorevler(kapali.uretimEmriId)).length, 0, 'kapalı emre görev açılmaz');
    assert.equal((await istek('dagitici', `/adimli-emirler/${String(kapali.uretimEmriId)}/hazirlik-projesi`, { projeId: proje, sablonId })).durum, 409);
    const matris = async () => (await app.inject({ method: 'GET', url: `/api/hazirlik-matrisi?projeId=${String(proje)}`, headers: { cookie: cerezler.get('dagitici') ?? '' } })).json<{ dagitir: boolean }>();
    assert.equal((await matris()).dagitir, true);
    await o().sahip.sorgu("UPDATE projeler_proje SET durum = 'tamamlandi' WHERE id = $1", [proje]);
    assert.equal((await matris()).dagitir, false, 'kapalı projede dağıt düğmesi yok');
    assert.equal((await dagitIstek(proje, sablonId, true)).durum, 400);
  });

  test('T7 durduran madde kısıtı aşılıp kapatılsa da görev doğar; atanmamış ve toplam kişi doğru sayılır', async () => {
    const proje = await yeniProje('UE.HZA');
    await emirAc(proje);
    const sablon = await yeniSablon('Atanmamış', [{ madde: 'cnc' }, { madde: 'ozel-a', rol: false }, { madde: 'cizim', rol: false }]);
    const d = await dagitIstek(proje, sablon, true);
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.deepEqual([d.govde.gorevSayisi, d.govde.atanmamis], [5, 3], 'cnc 2 iş emri rolde; ozel-a 2 ve çizim 1 atanmamış');
    assert.equal(d.govde.toplamKisi, 1, 'toplam kişi rolün tek üyesi; atanmamış görev kişi saymaz');
    await o().sahip.sorgu('ALTER TABLE uretim_emirleri_hazirlik_maddesi DROP CONSTRAINT uretim_emirleri_hazirlik_maddesi_durduran_kilit');
    try {
      await o().sahip.sorgu("UPDATE uretim_emirleri_hazirlik_maddesi SET acik = false WHERE kod = 'cnc'");
      assert.equal((await dagitIstek(proje, sablon, true)).govde.gorevSayisi, 5, 'durduran madde kapatılamaz sayılır');
    } finally {
      await o().sahip.sorgu("UPDATE uretim_emirleri_hazirlik_maddesi SET acik = true WHERE kod = 'cnc'");
      await o().sahip.sorgu('ALTER TABLE uretim_emirleri_hazirlik_maddesi ADD CONSTRAINT uretim_emirleri_hazirlik_maddesi_durduran_kilit CHECK (NOT durduran OR acik)');
    }
  });

  test('T8 açma: deneme zil çalmaz, dağıt çalar; aynı madde iki kalemde tek görev; iş emirsiz emirde iş emri maddesi emir başına; son gün emrin teslimine göre', async () => {
    const proje = await yeniProje('UE.HZB');
    await emirAc(proje);
    const sablon = await yeniSablon('Çift', [{ madde: 'cnc' }, { madde: 'cnc' }]);
    const uye = kim('planlama_proje').id;
    const d = await dagitIstek(proje, sablon, true);
    assert.equal(d.govde.gorevSayisi, 2, 'iki CNC kalemi aynı iş emrinde bir kez sayılır');
    assert.equal(await atamaZili(uye, proje), 0, 'deneme bildirim göndermez');
    assert.equal((await projeDagit(proje, sablon)).govde.hazirlikGorevi, 2);
    assert.equal(await atamaZili(uye, proje), 1, 'dağıt atama zilini çalar');

    const termin = await yeniSablon('Termin', [{ madde: 'cnc', dayanak: 'termin', gun: -3 }]);
    const p2 = await yeniProje('UE.HZT');
    const t = await o().sahip.tek<{ teslim: string; bitis: string; bitis2: string }>(
      "SELECT (current_date + 40)::text AS teslim, (current_date + 90)::text AS bitis, (current_date + 38)::text AS bitis2");
    await o().sahip.sorgu('UPDATE projeler_proje SET bitis = $2 WHERE id = $1', [p2, t!.bitis]);
    assert.equal((await projeDagit(p2, termin)).govde.hazirlikGorevi, 0, 'projeye bağlı emir yok');
    const r = await o().vt.tx((db) => hazirlikGorevleriAc(db, yoneticiId, {
      projeId: p2, sablonId: termin, hedefler: [{ emriId: 990001, emirNo: 'ORN-UE-9', isEmirleri: [] }],
      maddeler: new Map([['cnc', { ad: 'CNC kurulumu', isEmriDuzeyi: true }]]), tarih: { baslangic: null, bitis: t!.teslim },
    }));
    assert.equal(r.eklenen, 1, 'iş emri yoksa iş emri maddesi emir başına bir görev');
    const g = await o().sahip.tek<{ is_emri: number | null; plan_bitis: string }>(
      'SELECT hazirlik_is_emri_id AS is_emri, plan_bitis::text AS plan_bitis FROM projeler_gorev WHERE hazirlik_emri_id = 990001');
    assert.deepEqual([g?.is_emri, g?.plan_bitis], [null, t!.bitis2], 'termin dayanağı emrin teslimi (teslim - 3 + 2 - 1), proje bitişi değil');
  });

  test('T10 kablolamanın verdiği çözücü: iptal edilen ve olmayan emir kapalı, açık emir değil', async () => {
    const acik = await emirAc(null);
    const iptal = await emirAc(null);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [iptal.uretimEmriId]);
    const k = await o().vt.okumaTx((db) => hazirligiKapananEmirler(db, [acik.uretimEmriId, iptal.uretimEmriId, 990777]));
    assert.deepEqual([...k].sort((a, b) => a - b), [iptal.uretimEmriId, 990777].sort((a, b) => a - b));
  });

  test('T8 atama: kontrolde görev atanmaz (400); hazırlık dışı görev 404; atanan kişiye zil gider', async () => {
    const proje = await yeniProje('UE.HZC');
    const e = await emirAc(proje);
    assert.equal((await projeDagit(proje, sablonId)).durum, 200);
    const [birinci, ikinci] = await gorevler(e.uretimEmriId);
    await kisiEkle('atanan', 'cam');
    const ata = (id: number, surum: number) => istek(
      'dagitici', `/projeler/gorevler/${String(id)}/hazirlik-ata`, { sorumluKisiId: kim('atanan').id, yapanRolId: null, surum });
    assert.equal((await ata(birinci!.id, birinci!.surum)).durum, 200);
    // 3478: tek görev ataması görevin anahtarıyla yazılır.
    const gorevZili = async (kisiId: number, gorevId: number) => (await o().sahip.tek<{ n: number }>(
      "SELECT count(*)::int AS n FROM bildirim_kaydi WHERE kisi_id = $1 AND tekil_anahtar = $2", [kisiId, `projeler.gorev-atandi:gorev-${String(gorevId)}`]))?.n;
    assert.equal(await gorevZili(kim('atanan').id, birinci!.id), 1);
    await o().sahip.sorgu("UPDATE projeler_gorev SET durum = 'kontrolde', kontrol_kisi_id = $2 WHERE id = $1", [ikinci!.id, yoneticiId]);
    assert.equal((await ata(ikinci!.id, ikinci!.surum)).durum, 400);
    const normal = (await o().sahip.tek<{ id: number; surum: number }>('SELECT id, surum FROM projeler_gorev WHERE proje_id = $1 AND hazirlik_maddesi IS NULL', [proje]))!;
    assert.equal((await ata(normal.id, normal.surum)).durum, 404);
  });
});
