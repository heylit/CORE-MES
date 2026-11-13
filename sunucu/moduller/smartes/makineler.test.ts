import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isiBirKezCalistir } from '#cekirdek/zamanlayici.ts';
import { SMARTES_AYARLARI } from '#paylasilan/ayarlar/smartes.ts';
import { canliMakineAyrintisiCevabi, canliMakinelerCevabi, makineBulgulariCevabi } from '#paylasilan/sozlesme/smartes.ts';
import type { CanliMakinelerCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { VARSAYILAN_AD_ALANI } from './ayar.ts';
import { isler } from './isler.ts';
import { smartesIstemcisiKur } from './istemci.ts';
import { MAKINE_TUR_TAVANI_MS } from './kurallar.ts';
import { sahteSmartesAc } from './sahte-smartes.ts';
import type { SahteCevap, SahteSmartes } from './sahte-smartes.ts';
import { canliMakineAyrintisi, canliMakineler, ilerlemeTuru, makineBulgulari, makineTuru, yeniMakineBellegi } from './servis.ts';
import type { MakineBellegi } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const tablo = (satirlar: Record<string, string>[]): SahteCevap => ({ tur: 'tablo', satirlar });
const YAZAN_METOT = /(SetIsErp|SetErpOkRed|Delete|CreateUpdate|Create)$/;

describe('SmartES canlı makine panosu (kart 3176, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let sahte: SahteSmartes;
  let yonetici = '';
  let okuyucu = '';
  let yetkisiz = '';
  let sayac = 0;
  let simdi = Date.parse('2026-11-10T09:00:00Z');
  let bellek: MakineBellegi;
  // Makine kimliğine göre sahte SmartES'in o anki cevabı.
  let bilgiler: Map<string, Record<string, string>>;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = yonetici) =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c }, ...(govde === undefined ? {} : { payload: govde as object }) });
  const ayar = async (anahtar: string, deger: boolean) => {
    const c = await istek('POST', `/ayarlar/${anahtar}/degistir`, { deger });
    assert.equal(c.statusCode, 200, c.body);
  };
  const ortamKur = (istemciVar = true) => ({
    istemci: istemciVar
      ? smartesIstemcisiKur({ adres: sahte.adres, adAlani: VARSAYILAN_AD_ALANI }, { bekle: async () => {}, istekSuresiMs: 5000, listeSuresiMs: 5000, anlikSuresiMs: 300 })
      : null,
    saat: () => new Date(simdi),
  });
  const tur = (sayaci?: () => number) => makineTuru(vt(), ortamKur(), bellek, sayaci);
  async function giris(kullaniciAdi: string): Promise<string> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function rolluKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const id = await vt().tx((db) => yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA }));
    const rol = kullaniciAdi.replace(/-/g, '_');
    await vt().sorgu('INSERT INTO rol (kod, ad) VALUES ($1, $1)', [rol]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) SELECT id, $2 FROM rol WHERE kod = $1', [rol, islem]);
    await vt().sorgu('UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = $2) WHERE kisi_id = $1', [id, rol]);
    return giris(kullaniciAdi);
  }
  const say = async (tablosu: string) => (await vt().tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${tablosu}`))?.n;
  const cagrilar = (metot: string) => sahte.cagrilar.filter((c) => c.metot === metot);
  // Uç sunucunun ortam istemcisini kullanır (testte adres yok); içerik servisten, sözleşme şemasından geçirilerek okunur.
  const pano = async (): Promise<CanliMakinelerCevabi> =>
    canliMakinelerCevabi.parse(await vt().tx((db) => canliMakineler(db, ortamKur().istemci, new Date(simdi))));
  const bilgi = (kod: string, ek: Record<string, string> = {}): Record<string, string> => ({
    KOD: kod, AD: `ORN ${kod}`, CNCSTATE: 'ORN-DURUM-1', PARTS1: '12', PARTS2: '3400', FSPD: '1200', FOVR: '100', SLD: '45', SOVR: '90', SSPD: '2400',
    PROGNO: 'O1001', PROGCOMMENT: 'ORN-PROGRAM', ACTMOD: 'AUTO', ALARMNO: '0', TOOLNUM: '4', ...ek,
  });

  before(async () => {
    ortam = await testVeritabaniKur('smmak');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Makine', kullaniciAdi: 'mk-yonetici', parola: PAROLA }));
    yonetici = await giris('mk-yonetici');
    okuyucu = await rolluKisi('mk-okuyucu', ['sayfa.smartes']);
    yetkisiz = await rolluKisi('mk-yetkisiz', ['sayfa.malzemeler']);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    sahte = await sahteSmartesAc();
    simdi += 24 * 3_600_000;
    bellek = yeniMakineBellegi();
    for (const t of ['smartes_makine_ornegi', 'smartes_makine_durumu', 'smartes_makine_durum_degisimi', 'smartes_makine_okuma', 'smartes_is_emri_ilerleme', 'smartes_ilerleme_okuma']) {
      await vt().sorgu(`DELETE FROM ${t}`);
    }
    await ayar('smartes.baglanti', true);
    await ayar('smartes.makine-okumasi', true);
    bilgiler = new Map([['1', bilgi('ORN-M01')], ['2', bilgi('ORN-M02')], ['3', bilgi('ORN-M03')]]);
    sahte.isleyiciler.set('ActiveMachinesList', () => tablo([{ ID: '1', KOD: 'ORN-M01' }, { ID: '2', KOD: 'ORN-M02' }, { ID: '3', KOD: 'ORN-M03' }]));
    sahte.isleyiciler.set('AllMachineInformationList', (p) => {
      const b = bilgiler.get(p['MachineID'] ?? '');
      return b === undefined ? tablo([]) : tablo([b]);
    });
  });
  afterEach(async () => { await sahte.kapat(); });

  test('SME-34: anahtar varsayılan kapalıdır; anahtar ya da bağlantı kapalıyken ve adres yokken istek gitmez, hiçbir şey yazılmaz', async () => {
    assert.equal(SMARTES_AYARLARI['smartes.makine-okumasi'].varsayilan, false);
    await ayar('smartes.makine-okumasi', false);
    assert.deepEqual(await tur(), { tur: 'akis-kapali' });
    assert.deepEqual(await ilerlemeTuru(vt(), ortamKur()), { tur: 'akis-kapali' });
    for (const is of isler.filter((i) => /smartes-(makine|ilerleme)-okumasi/.test(i.ad))) assert.equal(await isiBirKezCalistir(vt(), is), 'bekliyor', is.ad);
    await ayar('smartes.makine-okumasi', true);
    await ayar('smartes.baglanti', false);
    assert.deepEqual(await tur(), { tur: 'kapali' });
    await ayar('smartes.baglanti', true);
    assert.deepEqual(await makineTuru(vt(), ortamKur(false), bellek), { tur: 'ortam-degiskeni-yok' });
    assert.equal(sahte.cagrilar.length + sahte.getIstekleri, 0);
    assert.equal(await say('smartes_makine_durumu'), 0);
    assert.equal(await say('smartes_makine_okuma'), 0);

    await ayar('smartes.makine-okumasi', false);
    const kapali = await pano();
    assert.equal(kapali.okumaAcik, false);
    assert.deepEqual(kapali.makineler, []);
  });

  test('SME-34: makine listesi bir kez, her makine kendi kimliğiyle tek istekle okunur; yalnız okuma metodu çağrılır; son okuma üstüne yazılır', async () => {
    assert.deepEqual(await tur(), { tur: 'islendi', okunan: 3, makineSayisi: 3, kesildi: false, hata: null });
    assert.equal(cagrilar('ActiveMachinesList').length, 1);
    assert.deepEqual(cagrilar('AllMachineInformationList').map((c) => c.parametreler['MachineID']), ['1', '2', '3']);
    assert.deepEqual(sahte.cagrilar.map((c) => c.metot).filter((m) => YAZAN_METOT.test(m)), []);
    assert.equal(await say('smartes_makine_durumu'), 3);

    simdi += 60_000;
    bilgiler.set('1', bilgi('ORN-M01', { PARTS1: '13', SLD: '61' }));
    assert.equal((await tur()).tur, 'islendi');
    // Makine listesi saat dolmadan yeniden istenmez.
    assert.equal(cagrilar('ActiveMachinesList').length, 1);
    assert.equal(await say('smartes_makine_durumu'), 3);
    const m = await vt().tek<{ sayac: number; spindle_yuku: number; okundu: Date; durum_baslangic: Date }>(
      "SELECT sayac, spindle_yuku, okundu, durum_baslangic FROM smartes_makine_durumu WHERE makine_kodu = 'ORN-M01'");
    assert.equal(m?.sayac, 13);
    assert.equal(m?.spindle_yuku, 61);
    assert.equal(m?.okundu.getTime(), simdi);
    // Durum değişmedi: başlangıcı ilk okumanın zamanıdır, yeni değişim satırı yoktur.
    assert.equal(m?.durum_baslangic.getTime(), simdi - 60_000);
    assert.equal(await say('smartes_makine_durum_degisimi'), 3);

    simdi += 3_600_000;
    await tur();
    assert.equal(cagrilar('ActiveMachinesList').length, 2);
  });

  test('SME-34: karşılığı bilinmeyen durum kodu "bilinmiyor" kalır ve ham haliyle saklanır; alarm alanı doluysa durum alarmdır; değişim yalnız durum değişince yazılır', async () => {
    await tur();
    const ilk = (await pano()).makineler.find((x) => x.makineKodu === 'ORN-M01');
    assert.equal(ilk?.durum, 'bilinmiyor');
    assert.equal(ilk?.durumKodu, 'ORN-DURUM-1');
    assert.equal(ilk?.alarm, null);

    simdi += 60_000;
    bilgiler.set('1', bilgi('ORN-M01', { ALARMNO: '1012', ALARMTEXT: 'ORN alarm metni' }));
    await tur();
    simdi += 60_000;
    await tur();
    simdi += 60_000;
    bilgiler.set('1', bilgi('ORN-M01', { CNCSTATE: 'ORN-DURUM-2' }));
    await tur();

    const degisimler = await vt().sorgu<{ eski: string | null; yeni: string; aciklama: string | null }>(
      "SELECT eski, yeni, aciklama FROM smartes_makine_durum_degisimi WHERE makine_kodu = 'ORN-M01' ORDER BY zaman, id");
    assert.deepEqual(degisimler, [
      { eski: null, yeni: 'bilinmiyor', aciklama: 'ORN-DURUM-1' },
      { eski: 'bilinmiyor', yeni: 'alarm', aciklama: '1012 ORN alarm metni' },
      { eski: 'alarm', yeni: 'bilinmiyor', aciklama: 'ORN-DURUM-2' },
    ]);
    const p = await pano();
    const m = p.makineler.find((x) => x.makineKodu === 'ORN-M01');
    assert.equal(m?.durum, 'bilinmiyor');
    assert.equal(m?.durumKodu, 'ORN-DURUM-2');
    assert.equal(Date.parse(m?.durumBaslangic ?? ''), simdi);
    // Bugünkü şerit: bilinmiyor, alarm, bilinmiyor; sonuncusu açık.
    assert.deepEqual(m?.bugun.map((d) => [d.durum, d.bitis === null]), [['bilinmiyor', false], ['alarm', false], ['bilinmiyor', true]]);
    assert.equal(p.aralikSaniye, 60);
    assert.equal(Date.parse(p.sonOkuma ?? ''), simdi);
    // Eşlenmemiş makinede CORE istasyonu ve çalışan iş boştur.
    assert.equal(m?.istasyonKodu, null);
    assert.equal(m?.calisanIs, null);

    const ayrinti = canliMakineAyrintisiCevabi.parse(await vt().tx((db) => canliMakineAyrintisi(db, 'ORN-M01', new Date(simdi))));
    const a = await istek('GET', '/smartes/makineler/ORN-M01', undefined, okuyucu);
    assert.equal(a.statusCode, 200, a.body);
    // Adres tanımlı değilken uç kayıt göstermez, bağlantı durumunu söyler.
    const uc = await istek('GET', '/smartes/makineler', undefined, okuyucu);
    assert.equal(uc.statusCode, 200, uc.body);
    assert.deepEqual([(uc.json() as CanliMakinelerCevabi).baglanti, (uc.json() as CanliMakinelerCevabi).makineler.length], ['ortam-degiskeni-yok', 0]);
    assert.equal(ayrinti.sayacToplam, 3400);
    assert.equal(ayrinti.eksenHizi, 1200);
    assert.equal(ayrinti.eksenOrani, 100);
    assert.deepEqual(ayrinti.spindle, { hiz: 2400, yuk: 45, oran: 90 });
    assert.equal(ayrinti.takimCebi, 4);
    assert.deepEqual(ayrinti.degisimler.map((d) => d.yeni), ['bilinmiyor', 'alarm', 'bilinmiyor']);
    assert.equal(ayrinti.degisimler[0]?.aciklama, 'ORN-DURUM-2');

    assert.equal((await istek('GET', '/smartes/makineler/ORN-YOK')).statusCode, 404);
    assert.equal((await istek('GET', '/smartes/makineler', undefined, yetkisiz)).statusCode, 403);
    assert.equal((await istek('GET', '/smartes/makineler/ORN-M01', undefined, yetkisiz)).statusCode, 403);
  });

  test('SME-34: eşlenmiş makinede CORE istasyonu yazılır', async () => {
    const im = await istek('POST', '/is-merkezleri', { kod: `MKM${(sayac += 1)}`, ad: 'Deneme merkezi' });
    const ist = await istek('POST', '/istasyonlar', { kod: 'MKI1', ad: 'Deneme istasyonu', isMerkeziId: (im.json() as { id: number }).id, tip: 'talasli' });
    assert.equal(ist.statusCode, 200, ist.body);
    const makineId = (await ortam!.sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id',
      ['MKT1', 'Deneme tezgahı', (ist.json() as { id: number }).id]))!.id;
    assert.equal((await istek('POST', '/smartes/eslemeler/ata', { tur: 'makine', tmiId: makineId, smartesKod: 'ORN-M02', surum: null })).statusCode, 200);
    await tur();
    const m = (await pano()).makineler.find((x) => x.makineKodu === 'ORN-M02');
    assert.equal(m?.istasyonKodu, 'MKI1');
    assert.equal(m?.istasyonAdi, 'Deneme istasyonu');
    assert.equal(m?.calisanIs, null);
  });

  test('SME-34: süre tavanı aşılınca tur kesilir ve sonraki tur kaldığı makineden sürer', async () => {
    // Sayaç her sorulduğunda tavanın yarısı kadar ilerler: ilk makineden sonra tavan aşılır.
    let t = 0;
    const hizli = () => { t += MAKINE_TUR_TAVANI_MS * 0.6; return t; };
    const ilk = await tur(hizli);
    assert.equal(ilk.tur, 'islendi');
    assert.equal(ilk.tur === 'islendi' && ilk.kesildi, true);
    assert.deepEqual(cagrilar('AllMachineInformationList').map((c) => c.parametreler['MachineID']), ['1']);
    const iz = await vt().tek<{ okunan: number; makine_sayisi: number; son_sonuc: string }>('SELECT okunan, makine_sayisi, son_sonuc FROM smartes_makine_okuma');
    assert.deepEqual(iz, { okunan: 1, makine_sayisi: 3, son_sonuc: 'tamam' });

    simdi += 60_000;
    assert.deepEqual(await tur(), { tur: 'islendi', okunan: 3, makineSayisi: 3, kesildi: false, hata: null });
    assert.deepEqual(cagrilar('AllMachineInformationList').map((c) => c.parametreler['MachineID']), ['1', '2', '3', '1']);
  });

  test('SME-34: cevap vermeyen makinede tur kesilir, yinelenmez; eski kayıt yerinde kalır ve sonraki tur ondan sonraki makineden başlar', async () => {
    await tur();
    simdi += 60_000;
    sahte.isleyiciler.set('AllMachineInformationList', (p) => (p['MachineID'] === '2' ? { tur: 'cevapsiz' } : tablo([bilgiler.get(p['MachineID'] ?? '') ?? {}])));
    const r = await tur();
    assert.equal(r.tur === 'islendi' && r.kesildi, true);
    assert.equal(r.tur === 'islendi' && r.okunan, 1);
    assert.match(r.tur === 'islendi' ? r.hata ?? '' : '', /cevap vermedi/);
    // Makine 2 bir kez denendi; makine 3 bu turda okunmadı.
    assert.deepEqual(cagrilar('AllMachineInformationList').slice(3).map((c) => c.parametreler['MachineID']), ['1', '2']);
    const eski = await vt().tek<{ okundu: Date }>("SELECT okundu FROM smartes_makine_durumu WHERE makine_kodu = 'ORN-M02'");
    assert.equal(eski?.okundu.getTime(), simdi - 60_000);
    const iz = await vt().tek<{ son_sonuc: string; son_hata: string | null; son_basarili: Date | null }>('SELECT son_sonuc, son_hata, son_basarili FROM smartes_makine_okuma');
    assert.equal(iz?.son_sonuc, 'hata');
    assert.equal(iz?.son_basarili?.getTime(), simdi);

    simdi += 60_000;
    await tur();
    assert.deepEqual(cagrilar('AllMachineInformationList').slice(5).map((c) => c.parametreler['MachineID']), ['3', '1', '2']);
  });

  test('SME-34: makine listesi okunamazsa hata izde saklanır, kayıtlar değişmez', async () => {
    sahte.isleyiciler.set('ActiveMachinesList', () => ({ tur: 'fault', ileti: 'ORN hata' }));
    const r = await tur();
    assert.equal(r.tur === 'islendi' && r.okunan, 0);
    assert.equal(cagrilar('AllMachineInformationList').length, 0);
    const iz = await vt().tek<{ son_sonuc: string; son_basarili: Date | null }>('SELECT son_sonuc, son_basarili FROM smartes_makine_okuma');
    assert.deepEqual(iz, { son_sonuc: 'hata', son_basarili: null });
    assert.equal((await pano()).destekleniyor, false);
  });

  test('SME-34: iş emri ilerlemesi beş dakikada bir, tahmini bitiş istenerek okunur; aralık dolmadan yeniden istenmez', async () => {
    sahte.isleyiciler.set('WorkordersList', () => tablo([
      { WORKORDER_NO: 'ORN-UE-1-10', COMPLETED_PERCENTAGE_BY_PIECE: '37,50', ESTIMATED_END_DATETIME: '2026-11-20T16:30:00' },
      { WORKORDER_NO: 'ORN-UE-2-20', COMPLETED_PERCENTAGE_BY_PIECE: '', ESTIMATED_END_DATETIME: '' },
      { COMPLETED_PERCENTAGE_BY_PIECE: '10' },
    ]));
    assert.deepEqual(await ilerlemeTuru(vt(), ortamKur()), { tur: 'islendi', okunan: 2, hata: null });
    const c = cagrilar('WorkordersList')[0];
    assert.equal(c?.parametreler['IncludeEstimatedEndDateTime'], 'true');
    const satirlar = await vt().sorgu<{ is_emri_no: string; yuzde: number | null; bitis: Date | null }>(
      'SELECT is_emri_no, tamamlanan_yuzde::float8 AS yuzde, tahmini_bitis AS bitis FROM smartes_is_emri_ilerleme ORDER BY is_emri_no');
    assert.equal(satirlar.length, 2);
    assert.equal(satirlar[0]?.yuzde, 37.5);
    assert.ok(satirlar[0]?.bitis instanceof Date);
    assert.deepEqual([satirlar[1]?.yuzde, satirlar[1]?.bitis], [null, null]);

    simdi += 60_000;
    assert.deepEqual(await ilerlemeTuru(vt(), ortamKur()), { tur: 'erken' });
    assert.equal(cagrilar('WorkordersList').length, 1);
    simdi += 5 * 60_000;
    assert.equal((await ilerlemeTuru(vt(), ortamKur())).tur, 'islendi');
    assert.equal(cagrilar('WorkordersList').length, 2);
    assert.deepEqual(sahte.cagrilar.map((x) => x.metot).filter((m) => YAZAN_METOT.test(m)), []);
  });
  test('3192 D1: her okuma örnek olarak birikir; bulgular sayım farkını ve tekrar eden alarmı hesabıyla verir; henüz hesaplanmayan kutu veri yok der', async () => {
    const bulgular = async () => makineBulgulariCevabi.parse(await vt().tx((db) => makineBulgulari(db, ortamKur().istemci, new Date(simdi))));
    await tur();
    simdi += 60_000;
    bilgiler.set('1', bilgi('ORN-M01', { PARTS1: '15', PARTS2: '3403' }));
    await tur();
    assert.equal(await say('smartes_makine_ornegi'), 6, 'makine başına her okuma bir örnek; silinmez');
    const no = `ORN-3192-${simdi}`;
    await vt().sorgu(
      `INSERT INTO smartes_is_emri_durumu (smartes_id, is_emri_no, makine_kodu, saglam, red, makine_saglam, makine_red, ham, ilk_okuma, son_okuma)
       VALUES ($1, $2, 'ORN-M01', 38, 2, 52, 0, '{}', $3, $3)`, [simdi % 1_000_000_000, no, new Date(simdi)]);
    // Daha yeni ama farkı küçük satır: eğri yine en büyük farklı makineyi gösterir.
    await vt().sorgu(
      `INSERT INTO smartes_is_emri_durumu (smartes_id, is_emri_no, makine_kodu, saglam, red, makine_saglam, makine_red, ham, ilk_okuma, son_okuma)
       VALUES ($1, $2, 'ORN-M02', 20, 0, 25, 0, '{}', $3, $3)`, [simdi % 1_000_000_000 + 100, `${no}-B`, new Date(simdi + 1000)]);
    for (const gunOnce of [1, 2, 3]) {
      await vt().sorgu(
        `INSERT INTO smartes_alarm (smartes_id, makine_kodu, alarm_kodu, aciklama, baslangic, ham, ilk_okuma, son_okuma)
         VALUES ($1, 'ORN-M02', '1012', 'ORN Hidrolik', $2, '{}', $2, $2)`, [simdi % 1_000_000_000 + gunOnce, new Date(simdi - gunOnce * 86_400_000)]);
    }
    const b = await bulgular();
    assert.equal(b.okumaAcik, true);
    assert.equal(b.kutular.length, 10);
    // Durum kodları henüz bilinmiyor: çalışan ve nedensiz duruş sıfır değil, veri yok.
    assert.equal(b.kutular.find((k) => k.tur === 'durum')?.deger, null);
    assert.equal(b.kutular.find((k) => k.tur === 'durus')?.deger, null);
    assert.equal(b.kutular.find((k) => k.tur === 'sayim')?.alt, 'en büyük fark 12 adet');
    for (const tur of ['program', 'cevrim', 'oee', 'oran', 'yuk'] as const) assert.equal(b.kutular.find((k) => k.tur === tur)?.deger, null, tur);
    const sayim = b.bulgular.find((x) => x.tur === 'sayim' && x.makineKodu === 'ORN-M01');
    assert.equal(b.bulgular.filter((x) => x.tur === 'sayim').length, 2);
    assert.match(sayim?.hesap ?? '', /fark 12 \(tolerans 2\)/);
    const alarm = b.bulgular.find((x) => x.tur === 'alarm');
    assert.equal(alarm?.ton, 'uyari');
    assert.match(alarm?.baslik ?? '', /7 günde 3 kez/);
    assert.equal(b.karne.find((k) => k.makineKodu === 'ORN-M01')?.hucreler.sayim.metin, '52 / 40');
    const egri = b.grafikler?.sayim;
    assert.equal(egri?.makineKodu, 'ORN-M01');
    assert.equal(egri?.seriler.length, 1, 'CORE eşlemesi yok: yalnız makine serisi');
    assert.equal(egri?.seriler[0]?.degerler.filter((d) => d !== null).at(-1), 3);
    assert.equal((await istek('GET', '/smartes/makine-bulgulari', undefined, okuyucu)).statusCode, 200);
    assert.equal((await istek('GET', '/smartes/makine-bulgulari', undefined, yetkisiz)).statusCode, 403);

    await ayar('smartes.makine-okumasi', false);
    assert.deepEqual((await bulgular()).kutular, []);
  });
});
