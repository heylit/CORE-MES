import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isiBirKezCalistir } from '#cekirdek/zamanlayici.ts';
import type { EslemelerCevabi, GelenAdlarCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { VARSAYILAN_AD_ALANI } from './ayar.ts';
import { isler } from './isler.ts';
import { smartesIstemcisiKur } from './istemci.ts';
import { LISTE_METOTLARI, LISTE_TURLERI } from './kurallar.ts';
import { sahteSmartesAc } from './sahte-smartes.ts';
import type { SahteCevap, SahteSmartes } from './sahte-smartes.ts';
import { listeTuru } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const tablo = (satirlar: Record<string, string>[]): SahteCevap => ({ tur: 'tablo', satirlar });
// SmartES'te yazma, işaretleme ya da silme anlamına gelen her metot: liste okuması hiçbirini çağıramaz.
const YAZAN_METOT = /(SetIsErp|SetErpOkRed|Delete|CreateUpdate|Create)$/;

describe('SmartES listeleri ve eşleme önerileri (kart 3174, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let sahte: SahteSmartes;
  let yonetici = '';
  let okuyucu = '';
  let sayac = 0;
  let simdi = Date.parse('2026-11-13T08:00:00Z');

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = yonetici) =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c }, ...(govde === undefined ? {} : { payload: govde as object }) });
  const baglanti = async (acik: boolean) => {
    const c = await istek('POST', '/ayarlar/smartes.baglanti/degistir', { deger: acik });
    assert.equal(c.statusCode, 200, c.body);
  };
  const ortamKur = (istemciVar = true) => ({
    istemci: istemciVar
      ? smartesIstemcisiKur({ adres: sahte.adres, adAlani: VARSAYILAN_AD_ALANI }, { bekle: async () => {}, istekSuresiMs: 5000, listeSuresiMs: 5000 })
      : null,
    saat: () => new Date(simdi),
  });
  const metotlar = () => sahte.cagrilar.map((c) => c.metot);
  async function giris(kullaniciAdi: string): Promise<string> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function istasyonAc(kod: string, ad: string): Promise<number> {
    const im = await istek('POST', '/is-merkezleri', { kod: `LM${(sayac += 1)}`, ad: 'Liste merkezi' });
    const ist = await istek('POST', '/istasyonlar', { kod, ad, isMerkeziId: (im.json() as { id: number }).id, tip: 'talasli' });
    assert.equal(ist.statusCode, 200, ist.body);
    return (ist.json() as { id: number }).id;
  }
  const eslemeler = async (tur = 'istasyon', c = yonetici): Promise<EslemelerCevabi> => {
    const r = await istek('GET', `/smartes/eslemeler?tur=${tur}`, undefined, c);
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const gelenAdlar = async (tur: 'fire' | 'durus', c = yonetici): Promise<GelenAdlarCevabi> => {
    const r = await istek('GET', `/smartes/gelen-adlar?tur=${tur}`, undefined, c);
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const fireListesi = (satirlar: Record<string, string>[]) => { sahte.isleyiciler.set('RejectsList', () => tablo(satirlar)); };
  // Zorla okuma aynı listeyi dakikada bir kez ister; testte her okuma bir dakikadan sonra yapılır.
  const oku = async (turler: readonly (typeof LISTE_TURLERI)[number][], zorla = true) => {
    simdi += 61_000;
    return listeTuru(vt(), ortamKur(), { turler, zorla });
  };
  const fireKaydi = (id: number, ad: string, zaman: string) => vt().sorgu(
    `INSERT INTO smartes_red (smartes_id, neden_kodu, zaman, ham, ilk_okuma, son_okuma) VALUES ($1, $2, $3, '{}'::jsonb, now(), now())`, [id, ad, zaman]);

  before(async () => {
    ortam = await testVeritabaniKur('smlis');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Liste', kullaniciAdi: 'sl-yonetici', parola: PAROLA }));
    yonetici = await giris('sl-yonetici');
    const id = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Okuyucu', kullaniciAdi: 'sl-okuyucu', parola: PAROLA }));
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('sl_okuyucu', 'sl_okuyucu')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.smartes' FROM rol WHERE kod = 'sl_okuyucu'");
    await vt().sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'sl_okuyucu') WHERE kisi_id = $1", [id]);
    okuyucu = await giris('sl-okuyucu');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    sahte = await sahteSmartesAc();
    simdi += 48 * 3_600_000;
    for (const t of ['smartes_liste_kaydi', 'smartes_liste_okuma', 'smartes_ad_esleme', 'smartes_esleme', 'smartes_red', 'smartes_durus']) await vt().sorgu(`DELETE FROM ${t}`);
    await baglanti(true);
  });
  afterEach(async () => { await sahte.kapat(); });

  test('SME-30: bağlantı kapalıyken ya da adres yokken liste istenmez; iş "bekliyor" döner', async () => {
    await baglanti(false);
    assert.deepEqual(await oku(LISTE_TURLERI), { tur: 'kapali' });
    const is = isler.find((i) => i.ad === 'smartes-liste-okumasi');
    assert.ok(is);
    assert.equal(await isiBirKezCalistir(vt(), is), 'bekliyor');
    assert.equal((await istek('GET', '/smartes/listeler/oku')).statusCode, 409);
    await baglanti(true);
    assert.deepEqual(await listeTuru(vt(), ortamKur(false), { zorla: true }), { tur: 'ortam-degiskeni-yok' });
    assert.equal(sahte.cagrilar.length + sahte.getIstekleri, 0);
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM smartes_liste_okuma'))?.n, 0);
  });

  test('SME-30: beş liste belgedeki metot ve süzgeçlerle okunur, yalnız okuma metodu çağrılır; günlük aralık dolmadan yeniden okunmaz', async () => {
    sahte.isleyiciler.set('WorkStationList', () => tablo([{ ID: '1', CODE: 'ORN-T1', NAME: 'ORN torna', ISPASSIVE: 'false' }]));
    sahte.isleyiciler.set('ActiveMachinesList', () => tablo([{ ID: '5', KOD: 'ORN-M1', AD: 'ORN makine' }]));
    sahte.isleyiciler.set('OperationList', () => tablo([
      { ID: '1', CODE: 'ORN-OP', NAME: 'ORN tornalama', WORKSTATION_INFORMATION: 'ORN-T1' },
      { ID: '2', CODE: 'ORN-OP', NAME: 'ORN tornalama', WORKSTATION_INFORMATION: 'ORN-T2' },
    ]));
    fireListesi([{ ID: '7', NAME: 'ORN ölçü dışı', GROUP_INFORMATION: 'ORN grup', ISOPERATOR_WELDED: 'true', ISPASSIVE: 'false' }, { ID: '8' }]);
    sahte.isleyiciler.set('DownTimeList', () => tablo([{ ID: '3', NAME: 'ORN arıza' }]));

    assert.deepEqual(await listeTuru(vt(), ortamKur()), { tur: 'islendi', okunan: [...LISTE_TURLERI], hatali: [] });
    assert.deepEqual(metotlar(), LISTE_TURLERI.map((t) => LISTE_METOTLARI[t]));
    assert.deepEqual(metotlar().filter((m) => YAZAN_METOT.test(m)), []);
    assert.deepEqual(sahte.cagrilar.find((c) => c.metot === 'OperationList')?.parametreler,
      { WorkstationCode: '', WorkstationName: '', OperationCode: '', OperationName: '' });
    const satirlar = await vt().sorgu<{ tur: string; anahtar: string; ad: string | null; var: boolean }>(
      'SELECT tur, anahtar, ad, var FROM smartes_liste_kaydi ORDER BY tur, anahtar');
    assert.deepEqual(satirlar.map((x) => `${x.tur}/${x.anahtar}`),
      ['durus/id:3', 'fire/id:7', 'istasyon/kod:ORN-T1', 'makine/kod:ORN-M1', 'operasyon/kod:ORN-OP'], 'adsız fire satırı ve yinelenen operasyon kodu yazılmadı');

    // Aralık dolmadan iş listeyi yeniden istemez; bir gün sonra ister.
    sahte.cagrilar.length = 0;
    assert.deepEqual(await listeTuru(vt(), ortamKur()), { tur: 'islendi', okunan: [], hatali: [] });
    assert.equal(sahte.cagrilar.length, 0);
    simdi += 24 * 3_600_000;
    assert.equal((await listeTuru(vt(), ortamKur())).tur, 'islendi');
    assert.equal(sahte.cagrilar.length, LISTE_TURLERI.length);
  });

  test('SME-30: "Şimdi oku" art arda basılınca aynı liste bir dakika dolmadan SmartES’ten yeniden istenmez', async () => {
    fireListesi([{ ID: '7', NAME: 'ORN ölçü dışı' }]);
    assert.deepEqual(await oku(['fire']), { tur: 'islendi', okunan: ['fire'], hatali: [] });
    simdi += 59_000;
    assert.deepEqual(await listeTuru(vt(), ortamKur(), { turler: ['fire'], zorla: true }), { tur: 'islendi', okunan: [], hatali: [] });
    assert.equal(sahte.cagrilar.length, 1);
    simdi += 1_000;
    assert.deepEqual(await listeTuru(vt(), ortamKur(), { turler: ['fire'], zorla: true }), { tur: 'islendi', okunan: ['fire'], hatali: [] });
    assert.equal(sahte.cagrilar.length, 2);
  });

  test('SME-30: okunamayan liste eski haliyle kalır ve hatası saklanır; boş cevap kimseyi "yok" yapmaz; listeden çıkan satır silinmez', async () => {
    fireListesi([{ ID: '7', NAME: 'ORN ölçü dışı' }, { ID: '9', NAME: 'ORN çapak' }]);
    await oku(['fire']);
    sahte.isleyiciler.set('RejectsList', () => ({ tur: 'fault', ileti: 'ORN hata' }));
    assert.deepEqual(await oku(['fire']), { tur: 'islendi', okunan: [], hatali: ['fire'] });
    let g = await gelenAdlar('fire');
    assert.equal(g.satirlar.length, 2);
    assert.match(g.sonHata ?? '', /ORN hata/);
    assert.notEqual(g.sonOkuma, null);

    // Alan adı tutmayan cevap listeyi bozmaz.
    fireListesi([{ BASKA: 'x' }]);
    assert.deepEqual(await oku(['fire']), { tur: 'islendi', okunan: [], hatali: ['fire'] });
    fireListesi([]);
    assert.deepEqual(await oku(['fire']), { tur: 'islendi', okunan: ['fire'], hatali: [] });
    assert.equal((await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM smartes_liste_kaydi WHERE tur = 'fire' AND var"))?.n, 2);

    fireListesi([{ ID: '7', NAME: 'ORN ölçü dışı' }]);
    await oku(['fire']);
    assert.deepEqual(await vt().sorgu("SELECT anahtar, var FROM smartes_liste_kaydi WHERE tur = 'fire' ORDER BY anahtar"),
      [{ anahtar: 'id:7', var: true }, { anahtar: 'id:9', var: false }]);
    g = await gelenAdlar('fire');
    assert.deepEqual(g.satirlar.map((x) => x.anahtar), ['id:7'], 'eşlenmemiş ve bekleyeni olmayan ad listeden çıkınca gösterilmez');
    assert.equal(g.sonHata, null);
  });

  test('SME-31: kod eşlemesinde SmartES listesi ve öneriler gelir; onay yalnız hâlâ geçerli öneriyi yazar', async () => {
    const ayniKod = await istasyonAc('ORN-A1', 'Birinci alan');
    const ayniAd = await istasyonAc('ORN-A2', 'ORN Taşlama Hücresi');
    const benzer = await istasyonAc('ORN-A3', 'ORN freze merkezi');
    const yok = await istasyonAc('ORN-A4', 'Karşılığı olmayan');
    // Liste okunmadan önce: liste null, öneri yok; kod elle girilir.
    const once = await eslemeler();
    assert.equal(once.smartesListesi, null);
    assert.deepEqual(once.satirlar.map((x) => x.oneri), once.satirlar.map(() => null));

    sahte.isleyiciler.set('WorkStationList', () => tablo([
      { ID: '1', CODE: 'orn-a1', NAME: 'Başka ad' },
      { ID: '2', CODE: 'WS-2', NAME: 'orn taslama hucresi' },
      { ID: '3', CODE: 'WS-3', NAME: 'ORN freze merkezleri' },
      { ID: '4', CODE: 'WS-4', NAME: 'ORN pasif', ISPASSIVE: 'true' },
    ]));
    assert.equal((await istek('GET', '/smartes/listeler/oku', undefined, okuyucu)).statusCode, 403);
    // Uç sunucunun kendi adresiyle okur (testte adres yok: 409); okuma burada sahte SmartES'e servis işleviyle yapılır.
    assert.equal((await istek('GET', '/smartes/listeler/oku')).statusCode, 409);
    assert.deepEqual(await oku(['istasyon']), { tur: 'islendi', okunan: ['istasyon'], hatali: [] });

    const sonra = await eslemeler('istasyon', okuyucu);
    assert.deepEqual(sonra.smartesListesi?.map((x) => x.kod).sort(), ['WS-2', 'WS-3', 'orn-a1'], 'pasif kod seçilemez');
    const oneri = (id: number) => sonra.satirlar.find((x) => x.tmiId === id)?.oneri ?? null;
    assert.deepEqual(oneri(ayniKod), { kod: 'orn-a1', ad: 'Başka ad', gerekce: 'ayni-kod' });
    assert.deepEqual(oneri(ayniAd), { kod: 'WS-2', ad: 'orn taslama hucresi', gerekce: 'ayni-ad' });
    assert.equal(oneri(benzer)?.gerekce, 'benzer-ad');
    assert.equal(oneri(yok), null);

    const onayla = (satirlar: object[], c = yonetici) => istek('POST', '/smartes/eslemeler/onerileri-onayla', { tur: 'istasyon', satirlar }, c);
    assert.equal((await onayla([{ tmiId: ayniKod, smartesKod: 'orn-a1' }], okuyucu)).statusCode, 403);
    // Öneri olmayan kod bu uçtan yazılamaz; önerisi olmayan kayıt atlanır.
    const r = await onayla([{ tmiId: ayniKod, smartesKod: 'orn-a1' }, { tmiId: ayniAd, smartesKod: 'WS-3' }, { tmiId: yok, smartesKod: 'WS-2' }]);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json(), { yazilan: 1, atlanan: 2 });
    // Yinelenen onay yazmaz: kayıt artık eşli.
    assert.deepEqual((await onayla([{ tmiId: ayniKod, smartesKod: 'orn-a1' }])).json(), { yazilan: 0, atlanan: 1 });
    const son = await eslemeler();
    assert.equal(son.satirlar.find((x) => x.tmiId === ayniKod)?.smartesKod, 'orn-a1');
    assert.equal(son.satirlar.find((x) => x.tmiId === ayniKod)?.oneri, null);
    assert.equal(son.satirlar.find((x) => x.tmiId === ayniAd)?.smartesKod, null);
  });

  test('SME-31: fire adı eşlemesi: öneri, bekleyen kayıt sayısı, sonuç zorunluluğu, sürüm, kaldırma ve "artık yok" uyarısı', async () => {
    fireListesi([
      { ID: '7', NAME: 'ölçü dışı', GROUP_INFORMATION: 'ORN grup', ISOPERATOR_WELDED: 'true' },
      { ID: '9', NAME: 'ORN bilinmeyen fire' },
    ]);
    await oku(['fire']);
    await fireKaydi(1, 'Ölçü Dışı', '2026-11-10T08:00:00Z');
    await fireKaydi(2, 'ölçü dışı', '2026-11-11T08:00:00Z');
    await fireKaydi(3, 'ORN listede olmayan', '2026-11-12T08:00:00Z');

    const g = await gelenAdlar('fire', okuyucu);
    assert.equal(g.islemeBagli, false);
    const olcu = g.satirlar.find((x) => x.anahtar === 'id:7');
    assert.ok(olcu);
    assert.equal(olcu.durum, 'eslenmedi');
    assert.equal(olcu.bekleyen, 2, 'kayıt adı büyük/küçük harf ayırmadan listeye bağlanır');
    assert.equal(olcu.oneri?.kod, 'H-01');
    assert.equal(olcu.operatorKaynakli, true);
    const listeDisi = g.satirlar.find((x) => x.anahtar === 'ad:ORN listede olmayan');
    assert.equal(listeDisi?.bekleyen, 1, 'listede olmayan adla gelen kayıt kendi satırını açar');
    assert.equal(g.satirlar.find((x) => x.anahtar === 'id:9')?.oneri, null);

    const esle = (govde: object, c = yonetici) => istek('POST', '/smartes/gelen-adlar/esle', { tur: 'fire', ...govde }, c);
    const nedenId = olcu.oneri?.id ?? 0;
    assert.equal((await esle({ anahtar: 'id:7', nedenId, sonuc: 'hatali', surum: null }, okuyucu)).statusCode, 403);
    assert.equal((await esle({ anahtar: 'id:7', nedenId, sonuc: null, surum: null })).statusCode, 400, 'firede sonuç zorunlu');
    assert.equal((await esle({ anahtar: 'id:404', nedenId, sonuc: 'hatali', surum: null })).statusCode, 404);
    assert.equal((await esle({ anahtar: 'id:7', nedenId: 999_999, sonuc: 'hatali', surum: null })).statusCode, 404);
    const ilk = await esle({ anahtar: 'id:7', nedenId, sonuc: 'hatali', surum: null });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const eslenen = (ilk.json() as GelenAdlarCevabi).satirlar.find((x) => x.anahtar === 'id:7');
    assert.deepEqual([eslenen?.durum, eslenen?.neden?.kod, eslenen?.sonuc, eslenen?.bekleyen, eslenen?.surum], ['eslendi', 'H-01', 'hatali', 0, 1]);
    // Sürümsüz ikinci yazma ve eski sürüm reddedilir; değişiklik sürümü artırır.
    assert.equal((await esle({ anahtar: 'id:7', nedenId, sonuc: 'hurda', surum: null })).statusCode, 409);
    const degisti = await esle({ anahtar: 'id:7', nedenId, sonuc: 'hurda', surum: 1 });
    assert.equal((degisti.json() as GelenAdlarCevabi).satirlar.find((x) => x.anahtar === 'id:7')?.surum, 2);
    assert.equal((await esle({ anahtar: 'id:7', nedenId, sonuc: 'hatali', surum: 1 })).statusCode, 409);
    // Listede olmayan ad da eşlenir (adla tutulur).
    assert.equal((await esle({ anahtar: 'ad:ORN listede olmayan', nedenId, sonuc: 'hurda', surum: null })).statusCode, 200);

    // Eşlenmiş ad SmartES listesinden çıkınca "yok" olur, menüde sayılır; kaldırınca düşer.
    fireListesi([{ ID: '9', NAME: 'ORN bilinmeyen fire' }, { ID: '10', NAME: 'ORN yeni ad' }]);
    simdi += 3_600_000;
    await oku(['fire']);
    const sonra = await gelenAdlar('fire');
    assert.equal(sonra.satirlar.find((x) => x.anahtar === 'id:7')?.durum, 'yok');
    assert.equal(sonra.satirlar.find((x) => x.anahtar === 'id:10')?.durum, 'yeni');
    assert.equal(sonra.satirlar.find((x) => x.anahtar === 'id:9')?.durum, 'eslenmedi');
    assert.equal(sonra.satirlar.find((x) => x.anahtar === 'ad:ORN listede olmayan')?.durum, 'eslendi');
    assert.equal((await istek('GET', '/smartes/menu-sayaclari')).json().eslemeler, 2);
    const kaldir = (surum: number, c = yonetici) => istek('POST', '/smartes/gelen-adlar/kaldir', { tur: 'fire', anahtar: 'id:7', surum }, c);
    assert.equal((await kaldir(2, okuyucu)).statusCode, 403);
    assert.equal((await kaldir(1)).statusCode, 409);
    const kalkti = await kaldir(2);
    assert.equal(kalkti.statusCode, 200, kalkti.body);
    assert.equal((kalkti.json() as GelenAdlarCevabi).satirlar.find((x) => x.anahtar === 'id:7')?.durum, 'eslenmedi', 'bekleyen kaydı olduğu için satır kalır');
    assert.equal((await kaldir(2)).statusCode, 404);
    assert.equal((await istek('GET', '/smartes/menu-sayaclari')).json().eslemeler, 1);
  });

  test('SME-31: duruş adı önerileri toplu onaylanır; duruşta sonuç yazılmaz, geçersiz öneri atlanır', async () => {
    sahte.isleyiciler.set('DownTimeList', () => tablo([
      { ID: '1', NAME: 'Mekanik Arıza' }, { ID: '2', NAME: 'malzeme bekleniyor' }, { ID: '3', NAME: 'ORN karşılıksız duruş' },
    ]));
    await oku(['durus']);
    const g = await gelenAdlar('durus');
    const onerili = g.satirlar.filter((x) => x.oneri !== null);
    assert.deepEqual(onerili.map((x) => x.oneri?.kod).sort(), ['D-01', 'D-02']);
    const onayla = (satirlar: object[], c = yonetici) => istek('POST', '/smartes/gelen-adlar/onerileri-onayla', { tur: 'durus', satirlar }, c);
    assert.equal((await onayla([{ anahtar: 'id:1', nedenId: 1 }], okuyucu)).statusCode, 403);
    const r = await onayla([
      ...onerili.map((x) => ({ anahtar: x.anahtar, nedenId: x.oneri?.id ?? 0 })),
      { anahtar: 'id:3', nedenId: onerili[0]?.oneri?.id ?? 0 },
    ]);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json(), { yazilan: 2, atlanan: 1 });
    assert.deepEqual(await vt().sorgu("SELECT anahtar, sonuc FROM smartes_ad_esleme WHERE tur = 'durus' ORDER BY anahtar"),
      [{ anahtar: 'id:1', sonuc: null }, { anahtar: 'id:2', sonuc: null }]);
    assert.deepEqual((await onayla(onerili.map((x) => ({ anahtar: x.anahtar, nedenId: x.oneri?.id ?? 0 })))).json(), { yazilan: 0, atlanan: 2 });
  });
});
