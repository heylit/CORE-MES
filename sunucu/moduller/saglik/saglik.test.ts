import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { ayarOku } from '#cekirdek/ayar.ts';
import type { GocAyari } from '#cekirdek/ayar.ts';
import type { Veritabani } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uclariKaydet } from '#cekirdek/uc.ts';
import { hataYonetiminiKur, uygulamaKur } from '#cekirdek/uygulama.ts';
import { isTanimi, zamanlayiciKur } from '#cekirdek/zamanlayici.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { BEKCI_GOREV_ADI, YOKLAMA_SURE_SINIRI_MS, otomatikAcilisCoz } from './kurallar.ts';
import type { GorevSorgusu } from './kurallar.ts';
import {
  MetrikToplayici, ayrintiTopla, gitCommitOku, olayDongusuOlceri, onbellekliOkuyucu, onbellekliOtomatikAcilis, zamanlayiciGoreviSorgula,
} from './servis.ts';
import type { AyrintiGirdisi, MetrikKaynagi } from './servis.ts';
import { vtIstatistigiOku } from './sorgular.ts';
import { saglikUclari } from './uclar.ts';
import type { SaglikKaynagi } from './uclar.ts';

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));

const PAROLA = 'dogru-parola-1';
const IC_AYRINTI = 'iç ayrıntı';
const KIMLIK_YOK_GOVDESI = { kod: 'VERITABANI_YOK', mesaj: 'Veritabanına ulaşılamıyor, kimlik doğrulanamadı.' };

function bozukVt(): Veritabani {
  const hata = async (): Promise<never> => {
    throw new Error(`baglanti reddedildi: ${IC_AYRINTI}`);
  };
  return { sorgu: hata, tek: hata, tx: hata, okumaTx: hata, kapat: async () => undefined };
}

// Gerçek veritabanını sarar: önce gerçek girişle çerez alınır, sonra veritabanı erişilmez kılınır.
function kesilebilirVt(asil: Veritabani): { vt: Veritabani; kes: (kesik: boolean) => void } {
  let kesik = false;
  // Kapalı porta bağlanan sürücünün verdiği hatanın biçimi: ağ kodu taşır.
  const reddet = (): Error => Object.assign(new Error(`connect ECONNREFUSED ${IC_AYRINTI}`), { code: 'ECONNREFUSED' });
  const gec = <T>(is: () => Promise<T>): Promise<T> => (kesik ? Promise.reject(reddet()) : is());
  const vt: Veritabani = {
    sorgu: <T>(sql: string, parametreler?: readonly unknown[]) => gec(() => asil.sorgu<T>(sql, parametreler)),
    tek: <T>(sql: string, parametreler?: readonly unknown[]) => gec(() => asil.tek<T>(sql, parametreler)),
    tx: (is) => gec(() => asil.tx(is)),
    okumaTx: (is) => gec(() => asil.okumaTx(is)),
    kapat: () => asil.kapat(),
  };
  return { vt, kes: (yeni) => { kesik = yeni; } };
}

const girdi = (git: string | null, ortamCommit: string | null, yoklamaSureSiniriMs?: number): AyrintiGirdisi => ({
  gitOkuyucu: async () => git,
  ortamCommit,
  ortam: 'test',
  calismaSuresiSn: 1,
  isDurumlari: () => [],
  ...(yoklamaSureSiniriMs === undefined ? {} : { yoklamaSureSiniriMs }),
});

function dizgeler(deger: unknown): string[] {
  if (typeof deger === 'string') return [deger];
  if (Array.isArray(deger)) return deger.flatMap(dizgeler);
  if (deger !== null && typeof deger === 'object') return Object.values(deger).flatMap(dizgeler);
  return [];
}

// JSON ayrıştırılır; bütün dizge değerlerinde bağlantı bilgisi ve yığın izi aranır.
function sizintiDenetle(govde: string, { pg, goc }: GocAyari): void {
  const degerler = dizgeler(JSON.parse(govde));
  const yasak = [pg.parola, pg.kullanici, goc.parola, goc.kullanici, pg.host, pg.veritabani, `:${pg.port}`];
  for (const deger of degerler) {
    for (const y of yasak) assert.equal(deger.includes(y), false, 'cevap bağlantı bilgisi taşıyor');
    assert.equal(/postgres(ql)?:\/\//i.test(deger), false, 'cevap bağlantı dizesi taşıyor');
    assert.equal(/\n\s+at |\sat .*:\d+:\d+/.test(deger), false, 'cevap yığın izi taşıyor');
  }
}

const SAHTE: GocAyari = {
  pg: {
    host: 'h-ornek',
    port: 5999,
    kullanici: 'k-ornek',
    parola: 'p-ornek',
    veritabani: 'v-ornek',
    baglantiSureMs: 5000,
    sorguSureMs: 20000,
    okumaSureMs: 20000,
    havuzBoyutu: 10,
    kilitSureMs: 5000,
    bosTxSureMs: 30000,
  },
  goc: { kullanici: 'g-ornek', parola: 'gizli-goc' },
};

function asiliVt(): Veritabani {
  const asili = (): Promise<never> => new Promise(() => undefined);
  return { sorgu: asili, tek: asili, tx: asili, okumaTx: asili, kapat: async () => undefined };
}

test('sızıntı denetimi gerçekten kırmızı olabilir: bilinen sızıntılı gövdeler fırlatır, temiz gövde geçer', () => {
  sizintiDenetle(JSON.stringify({ durum: 'ok' }), SAHTE);
  const sizintilar = [
    { mesaj: 'parola p-ornek' },
    { mesaj: 'parola gizli-goc' },
    { mesaj: 'rol g-ornek' },
    { mesaj: 'host h-ornek' },
    { ic: ['db v-ornek'] },
    { mesaj: 'baglanti 10.0.0.1:5999' },
    { hata: 'Error: x\n    at isle (/uygulama/servis.ts:10:5)' },
    { hata: 'Error: x at isle (/uygulama/servis.ts:10:5)' },
    { mesaj: 'postgres://k:p@h/db' },
  ];
  for (const s of sizintilar) assert.throws(() => { sizintiDenetle(JSON.stringify(s), SAHTE); }, /cevap/);
});

test('asılı veritabanı: süre sınırı dolunca /saglik 503 hata; ayrıntıda gecikme ve son göç null', async () => {
  const asili = asiliVt();
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(app, saglikUclari(30), { vt: asili, kimlik: kimlikCozucu(asili) });
  const baslangic = performance.now();
  const cevap = await app.inject({ method: 'GET', url: '/api/saglik' });
  assert.equal(cevap.statusCode, 503);
  assert.deepEqual(cevap.json(), { durum: 'hata' });
  for (const vt of [asili, bozukVt()]) {
    const { bellek, ...ayrinti } = await ayrintiTopla(vt, girdi('a'.repeat(40), null, 30));
    assert.deepEqual(ayrinti, {
      veritabaniGecikmeMs: null, sonGoc: null, commit: 'a'.repeat(40), yayin: null, calismaSuresiSn: 1, ortam: 'test', isler: [], yedekDiski: null, veritabaniDiski: null,
      uyarilar: [{ tur: 'yedek', ileti: 'Yedek durumu okunamadı.' }], olayDongusuGecikmeMs: null, vtBaglantiSayisi: null, otomatikAcilis: null,
    });
    assert.equal(Number.isInteger(bellek?.rssBayt), true);
  }
  assert.equal(performance.now() - baslangic < 2000, true);
  // Sağlıklı veritabanında aynı kısa sınır ok döner: süre sınırı her şeyi reddetmez.
  const saglikliVt = sahteSaglikliVt();
  const saglikli = Fastify();
  hataYonetiminiKur(saglikli);
  uclariKaydet(saglikli, saglikUclari(30), { vt: saglikliVt, kimlik: kimlikCozucu(saglikliVt) });
  assert.equal((await saglikli.inject({ method: 'GET', url: '/api/saglik' })).statusCode, 200);
  assert.equal(Number.isInteger((await ayrintiTopla(saglikliVt, girdi(null, null, 30))).veritabaniGecikmeMs), true);
});

function sahteSaglikliVt(): Veritabani {
  const vt: Veritabani = {
    sorgu: async <T>(): Promise<T[]> => [],
    tek: async <T>(): Promise<T | null> => null,
    tx: async (is) => is(vt),
    okumaTx: async (is) => is(vt),
    kapat: async () => undefined,
  };
  return vt;
}

test('olay döngüsü ölçeri: ilk okumada ölçüm başlar ve null; sonra örnekten 99. yüzdelik, her okumada sıfırlanır', async () => {
  const olc = olayDongusuOlceri();
  assert.equal(olc(), null);
  await new Promise((coz) => setTimeout(coz, 120));
  const deger = olc();
  assert.equal(typeof deger === 'number' && deger >= 0, true);
  assert.equal(olc(), null);
});

test('git okuyucu: gerçek depoda git rev-parse HEAD ile eşit, depo olmayan klasörde null', async () => {
  const beklenen = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(await gitCommitOku(), beklenen);
  const klasor = await mkdtemp(join(tmpdir(), 'saglik-git-'));
  try {
    assert.equal(await gitCommitOku(klasor), null);
  } finally {
    await rm(klasor, { recursive: true, force: true });
  }
});

test('git önbelleği ilk sonucu saklar: başarı da başarısızlık da yeniden okunmaz', async () => {
  for (const sonuc of ['c'.repeat(40), null]) {
    let cagri = 0;
    const oku = onbellekliOkuyucu(async () => { cagri += 1; return sonuc; });
    for (let i = 0; i < 3; i += 1) assert.equal(await oku(), sonuc);
    assert.equal(cagri, 1, String(sonuc));
  }
});

const gorevXml = (govde: string): Buffer => Buffer.from(`<?xml version="1.0" encoding="UTF-16"?>\r\n<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">${govde}</Task>`, 'utf16le');
const ACIK_AYARLAR = '<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><IdleSettings><StopOnIdleEnd>true</StopOnIdleEnd></IdleSettings><Enabled>true</Enabled></Settings>';
const BASLANGIC = '<Triggers><BootTrigger><Enabled>true</Enabled><Delay>PT1M</Delay></BootTrigger></Triggers>';

test('otomatik açılış: açık görev ve Başlangıçta tetikleyicisi kurulu; kapalı görev ya da kapalı/eksik tetikleyici kapalı', () => {
  const coz = (sorgu: GorevSorgusu) => otomatikAcilisCoz(sorgu, BEKCI_GOREV_ADI).durum;
  assert.equal(coz({ tur: 'var', xml: gorevXml(BASLANGIC + ACIK_AYARLAR) }), 'kurulu');
  assert.equal(coz({ tur: 'var', xml: Buffer.from(`<Task>${BASLANGIC}<Settings></Settings></Task>`, 'latin1') }), 'kurulu');
  assert.equal(coz({ tur: 'var', xml: gorevXml(BASLANGIC + ACIK_AYARLAR.replace('<Enabled>true', '<Enabled>false')) }), 'kapali');
  assert.equal(coz({ tur: 'var', xml: gorevXml(BASLANGIC.replace('<Enabled>true', '<Enabled>false') + ACIK_AYARLAR) }), 'kapali');
  assert.equal(coz({ tur: 'var', xml: gorevXml('<Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>' + ACIK_AYARLAR) }), 'kapali');
});

test('otomatik açılış: görev yok kurulu değil; okunamayan sorgu ya da görev olmayan çıktı bilinmiyor; görev adı taşınır', () => {
  assert.deepEqual(otomatikAcilisCoz({ tur: 'yok' }, BEKCI_GOREV_ADI), { durum: 'kurulu-degil', gorevAdi: 'TMIV2 Bekci' });
  assert.equal(otomatikAcilisCoz({ tur: 'okunamadi' }, BEKCI_GOREV_ADI).durum, 'bilinmiyor');
  assert.equal(otomatikAcilisCoz({ tur: 'var', xml: Buffer.from('ERROR', 'latin1') }, BEKCI_GOREV_ADI).durum, 'bilinmiyor');
});

test('otomatik açılış: Windows klasörü bilinmiyorsa süreç açılmaz, bilinmiyor', async () => {
  assert.deepEqual(await zamanlayiciGoreviSorgula(BEKCI_GOREV_ADI, {}), { tur: 'okunamadi' });
});

test('otomatik açılış: sonuç süre boyunca saklanır, süre dolunca ve hata olunca yeniden sorulur; hata bilinmiyor olur', async () => {
  let an = 0;
  const sorulan: string[] = [];
  let sonraki: () => Promise<GorevSorgusu> = async () => ({ tur: 'yok' });
  const oku = onbellekliOtomatikAcilis(async (ad) => { sorulan.push(ad); return sonraki(); }, () => an, 1000);
  assert.equal((await oku())?.durum, 'kurulu-degil');
  an = 999;
  assert.equal((await oku())?.durum, 'kurulu-degil');
  assert.deepEqual(sorulan, ['TMIV2 Bekci']);
  an = 1000;
  sonraki = async () => { throw new Error('beklenmeyen'); };
  assert.equal((await oku())?.durum, 'bilinmiyor');
  assert.equal(sorulan.length, 2);
});

test('metrik toplayıcı: ilk tur taban alır; sonraki tur aradaki istek, havuz reddi, işlemci ve belleği yazar; pencere sınırlıdır', () => {
  let an = 1_000_000;
  let istekler: ReturnType<MetrikKaynagi['istekSayaclari']> = [];
  let mesgulToplam = 4;
  let cpuUs = 0;
  let makine = { bosta: 0, toplam: 0 };
  const kaynak: MetrikKaynagi = {
    simdi: () => an,
    istekSayaclari: () => istekler,
    havuz: () => ({ boyut: 30, kullanimda: 3, bekleyen: 1, mesgulToplam }),
    surecIslemci: () => ({ user: cpuUs, system: 0 }),
    makineIslemci: () => makine,
    cekirdekSayisi: () => 4,
    bellek: () => ({ rss: 100, heapUsed: 50 }),
    makineBellek: () => ({ bos: 10, toplam: 20 }),
    olayDongusu: () => 12.5,
  };
  const t = new MetrikToplayici(kaynak);
  assert.equal(t.tur(), null);
  assert.deepEqual(t.dakikalar(), []);
  an += 60_000;
  istekler = [{ yontem: 'GET', yol: '/a', sinif: '2xx', sayi: 120, toplamMs: 1200, kovalar: [120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], mesgul: 0 }];
  mesgulToplam = 6;
  cpuUs = 24_000_000;
  makine = { bosta: 750, toplam: 1000 };
  const d = t.tur();
  assert.ok(d !== null);
  assert.equal(d.aralikSn, 60);
  assert.equal(d.istek.sayi, 120);
  assert.equal(d.istek.saniyede, 2);
  assert.equal(d.istek.p95Ms, 25);
  assert.deepEqual(d.havuz, { boyut: 30, kullanimda: 3, bekleyen: 1, mesgul: 2 });
  assert.equal(d.surecIslemciYuzde, 10);
  assert.equal(d.makineIslemciYuzde, 25);
  assert.equal(d.olayDongusuP99Ms, 12.5);
  assert.equal(d.veritabani, null);
  // Veritabanı ölçüsü iki turda da okunursa fark yazılır; bir tur okunamazsa o ve sonraki dakika boş kalır.
  const vt = (islem: number) => ({
    boyutBayt: 1, xidYasi: 1, islem, geriAlma: 0, deadlock: 0, blokIsabet: 0, blokOkuma: 0, geciciBayt: 0,
    baglanti: { toplam: 1, aktif: 1, bosta: 0, bosTx: 0, kilitBekleyen: 0, gorunmeyen: 0 }, enUzunTxSn: null,
  });
  an += 60_000;
  assert.equal(t.tur(vt(100))?.veritabani, null);
  an += 60_000;
  assert.equal(t.tur(vt(160))?.veritabani?.saniyedeIslem, 1);
  an += 60_000;
  assert.equal(t.tur(null)?.veritabani, null);
  an += 60_000;
  assert.equal(t.tur(vt(200))?.veritabani, null);
  for (let i = 0; i < 70; i += 1) {
    an += 60_000;
    t.tur();
  }
  assert.equal(t.dakikalar().length, 60);
  assert.equal(t.dakikalar().at(-1)?.istek.sayi, 0);
  assert.equal(t.dakikalar().at(-1)?.istek.p95Ms, null);
});

describe('sağlık (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let baglanti: ReturnType<typeof kesilebilirVt>;
  let yoneticiCerezi: string;
  let operatorCerezi: string;
  let izleyenCerezi: string;

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  const sizdirmaYok = (govde: string): void => { sizintiDenetle(govde, acik().ayar); };

  const girisYap = async (kullaniciAdi: string) => {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return { kullanici: cevap.json().kullanici, cerez: String(cevap.headers['set-cookie'] ?? '').split(';')[0] ?? '' };
  };

  const ayrintiIste = (hedef: FastifyInstance, cerez?: string) =>
    hedef.inject({ method: 'GET', url: '/api/saglik/ayrinti', ...(cerez === undefined ? {} : { headers: { cookie: cerez } }) });

  // Kendi kaynağıyla kurulan sağlık uçları; kimlik aynı veritabanındaki gerçek oturumdan çözülür.
  const kaynakliUygulama = (kaynak: SaglikKaynagi): FastifyInstance => {
    const hedef = Fastify();
    hataYonetiminiKur(hedef);
    uclariKaydet(hedef, saglikUclari(YOKLAMA_SURE_SINIRI_MS, kaynak), { vt: acik().vt, kimlik: kimlikCozucu(acik().vt) });
    return hedef;
  };

  before(async () => {
    ortam = await testVeritabaniKur('saglik');
    const asil = ortam.vt;
    baglanti = kesilebilirVt(asil);
    app = await uygulamaKur({ vt: baglanti.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(baglanti.vt) });
    await asil.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const rolunuDegistir = async (kullaniciAdi: string, rolKodu: string): Promise<void> => {
      const id = await asil.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi, parola: PAROLA }));
      await asil.sorgu('UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = $2) WHERE kisi_id = $1', [id, rolKodu]);
    };
    await asil.sorgu("INSERT INTO rol (kod, ad) VALUES ('izleyen', 'İzleyen')");
    await asil.sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'saglik.ayrinti-oku' FROM rol WHERE kod = 'izleyen'");
    await asil.sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'kisiler.oku' FROM rol WHERE kod = 'operator'");
    await rolunuDegistir('operator', 'operator');
    await rolunuDegistir('izleyen', 'izleyen');
    yoneticiCerezi = (await girisYap('yonetici')).cerez;
    const operator = await girisYap('operator');
    const izleyen = await girisYap('izleyen');
    // Reddin nedeni işlemin olmamasıdır: başka veri işlemi de sayfa işlemi de bu ucu açmaz.
    // Kabulün nedeni işlemin olmasıdır: yönetici olmayan rol de aynı işlemle girer.
    assert.deepEqual([...operator.kullanici.islemler].sort(), [
      'arkon.operator', 'idari-isler.arac-talebi-ac', 'idari-isler.talep-ac', 'ik.bordro-gordum', 'ik.izin-talep', 'kisiler.oku', 'mesaj.oku', 'mesaj.yaz',
      'sayfa.idari-isler', 'sayfa.ik-islemlerim', 'sayfa.kuyruk', 'sayfa.mesaj', 'sayfa.terminal', 'sayfa.uretim-terminali', 'stok.istek', 'terminal.uret', 'uretim-emirleri.ara-istasyon',
    ]);
    assert.deepEqual(izleyen.kullanici.islemler, ['saglik.ayrinti-oku']);
    operatorCerezi = operator.cerez;
    izleyenCerezi = izleyen.cerez;
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('/saglik sağlıklıyken 200 ve yalnız durum alanı', async () => {
    const cevap = await app.inject({ method: 'GET', url: '/api/saglik' });
    assert.equal(cevap.statusCode, 200);
    assert.deepEqual(cevap.json(), { durum: 'ok' });
    assert.deepEqual(Object.keys(cevap.json()), ['durum']);
    sizdirmaYok(cevap.body);
  });

  test('/saglik/ayrinti: kimliksiz 401, işlemi olmayan 403, işlemi olan 200; veritabanı durumu taşımaz', async () => {
    assert.equal((await ayrintiIste(app)).statusCode, 401);
    assert.equal((await ayrintiIste(app, operatorCerezi)).statusCode, 403);
    assert.equal((await ayrintiIste(app, izleyenCerezi)).statusCode, 200);

    const kabul = await ayrintiIste(app, yoneticiCerezi);
    assert.equal(kabul.statusCode, 200);
    const govde = kabul.json();
    assert.deepEqual(Object.keys(govde).sort(), [
      'bellek', 'calismaSuresiSn', 'commit', 'isler', 'olayDongusuGecikmeMs', 'ortam', 'otomatikAcilis', 'sonGoc', 'uyarilar', 'veritabaniDiski', 'veritabaniGecikmeMs',
      'vtBaglantiSayisi', 'yayin', 'yedekDiski',
    ]);
    assert.equal(Number.isInteger(govde.veritabaniGecikmeMs) && govde.veritabaniGecikmeMs >= 0, true);
    assert.equal(Number.isInteger(govde.calismaSuresiSn) && govde.calismaSuresiSn >= 0, true);
    assert.equal(govde.ortam, ayarOku().ortam);
    sizdirmaYok(kabul.body);
  });

  test('/saglik/ayrinti bellek, olay döngüsü gecikmesi ve veritabanı bağlantı sayısı ölçülür', async () => {
    const ilk = (await ayrintiIste(app, yoneticiCerezi)).json();
    assert.equal(Number.isInteger(ilk.bellek.rssBayt) && ilk.bellek.rssBayt > 0, true);
    assert.equal(Number.isInteger(ilk.bellek.yiginBayt) && ilk.bellek.yiginBayt > 0, true);
    assert.equal(Number.isInteger(ilk.vtBaglantiSayisi) && ilk.vtBaglantiSayisi >= 1, true);
    await new Promise((coz) => setTimeout(coz, 120));
    const ikinci = (await ayrintiIste(app, yoneticiCerezi)).json();
    assert.equal(typeof ikinci.olayDongusuGecikmeMs === 'number' && ikinci.olayDongusuGecikmeMs >= 0, true);
  });

  test('/saglik/metrikler: kimliksiz 401, işlemi olmayan 403, işlemi olan toplayıcının dakikalarını görür', async () => {
    const dakika = {
      an: '2026-11-01T10:00:00.000Z', aralikSn: 60,
      istek: { sayi: 6, saniyede: 0.1, p50Ms: 25, p95Ms: 100, p99Ms: 100, istemciHatasi: 1, sunucuHatasi: 0, mesgul: 0 },
      uclar: [], havuz: { boyut: 30, kullanimda: 2, bekleyen: 0, mesgul: 0 },
      surecIslemciYuzde: 3.5, makineIslemciYuzde: null,
      bellek: { rssBayt: 1, yiginBayt: 1, makineBosBayt: 1, makineToplamBayt: 2 }, olayDongusuP99Ms: null, veritabani: null,
    };
    const hedef = kaynakliUygulama({ ayarOku, gitOku: () => Promise.resolve(null), metrikler: { dakikalar: () => [dakika] } });
    const iste = (cerez?: string) => hedef.inject({ method: 'GET', url: '/api/saglik/metrikler', ...(cerez === undefined ? {} : { headers: { cookie: cerez } }) });
    assert.equal((await iste()).statusCode, 401);
    assert.equal((await iste(operatorCerezi)).statusCode, 403);
    const kabul = await iste(izleyenCerezi);
    assert.equal(kabul.statusCode, 200);
    assert.deepEqual(kabul.json(), { dakikalar: [dakika] });
    sizdirmaYok(kabul.body);
    // Süreç toplayıcısı: ilk turdan önce boş liste, uydurulmuş dakika yok.
    const surec = await app.inject({ method: 'GET', url: '/api/saglik/metrikler', headers: { cookie: yoneticiCerezi } });
    assert.equal(surec.statusCode, 200);
    assert.ok(Array.isArray(surec.json().dakikalar));
  });

  test('veritabanı ölçüsü: uygulama kullanıcısı ek yetki olmadan okur; sayaçlar azalmaz, kendi bağlantısı en uzun işlem sayılmaz', async () => {
    const ilk = await acik().vt.tx((db) => vtIstatistigiOku(db));
    assert.ok(ilk !== null);
    assert.equal(ilk.boyutBayt > 0, true);
    assert.equal(Number.isInteger(ilk.xidYasi) && (ilk.xidYasi ?? -1) >= 0, true);
    assert.equal(ilk.baglanti.toplam >= 1 && ilk.baglanti.aktif >= 1, true);
    // Aynı rolün bağlantıları görünür; görünmeyen yalnız başka rolün oturumudur.
    assert.equal(ilk.baglanti.gorunmeyen, 0);
    for (let i = 0; i < 3; i += 1) await acik().vt.tx((db) => db.sorgu('SELECT 1'));
    const ikinci = await acik().vt.tx((db) => vtIstatistigiOku(db));
    assert.ok(ikinci !== null);
    // Diğer bağlantıların sayacı PostgreSQL'e gecikmeli yazılır (en çok ~1 sn); kesin artış beklenmez, azalma da olmaz.
    assert.equal(ikinci.islem >= ilk.islem, true);
    assert.equal(ikinci.enUzunTxSn === null || ikinci.enUzunTxSn < 60, true);
  });

  test('son göç: göç klasöründeki son dosyanın adıyla eşleşir', async () => {
    const adlar = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const beklenen = adlar.at(-1);
    assert.notEqual(beklenen, undefined);
    assert.equal((await ayrintiIste(app, yoneticiCerezi)).json().sonGoc, beklenen);
  });

  test('veritabanı yokken: /saglik 503 hata; çerezli istek 503 ve kimlik doğrulanamadı iletisi; iç ayrıntı sızmaz', async () => {
    baglanti.kes(true);
    try {
      const saglik = await app.inject({ method: 'GET', url: '/api/saglik' });
      assert.equal(saglik.statusCode, 503);
      assert.deepEqual(saglik.json(), { durum: 'hata' });
      // Çerezli istekte kimlik çözülemez; sağlık ucu yine kendi gövdesini döner.
      const cerezli = await app.inject({ method: 'GET', url: '/api/saglik', headers: { cookie: yoneticiCerezi } });
      assert.equal(cerezli.statusCode, 503);
      assert.deepEqual(cerezli.json(), { durum: 'hata' });

      // Kimliği çözülemeyen istek yöneticinin de olsa operatörün de olsa aynı cevabı alır: 403 kararı verilemez.
      for (const cerez of [yoneticiCerezi, operatorCerezi]) {
        const cevap = await ayrintiIste(app, cerez);
        assert.equal(cevap.statusCode, 503);
        assert.deepEqual(cevap.json(), KIMLIK_YOK_GOVDESI);
      }
      // Çerezsiz istekte çözülecek kimlik yoktur; veritabanına gidilmez.
      const kimliksiz = await ayrintiIste(app);
      assert.equal(kimliksiz.statusCode, 401);

      for (const cevap of [saglik, await ayrintiIste(app, yoneticiCerezi), kimliksiz]) {
        assert.equal(cevap.body.includes(IC_AYRINTI), false);
        sizdirmaYok(cevap.body);
      }
    } finally {
      baglanti.kes(false);
    }
    assert.equal((await ayrintiIste(app, yoneticiCerezi)).statusCode, 200);
    assert.equal((await ayrintiIste(app, operatorCerezi)).statusCode, 403);
    assert.deepEqual((await app.inject({ method: 'GET', url: '/api/saglik' })).json(), { durum: 'ok' });
  });

  test('/saglik/ayrinti art arda isteklerde ortam ayarını ve çalışan commit bilgisini birer kez okur', async () => {
    let ayarSayisi = 0;
    let gitSayisi = 0;
    const hedef = kaynakliUygulama({
      ayarOku: () => { ayarSayisi += 1; return { commit: 'ortamdan', ortam: 'test' }; },
      gitOku: async () => { gitSayisi += 1; return 'e'.repeat(40); },
    });
    // Açılışta okunmaz: ilk isteğe dek sayaçlar sıfırdır.
    assert.deepEqual({ ayarSayisi, gitSayisi }, { ayarSayisi: 0, gitSayisi: 0 });
    for (let i = 0; i < 3; i += 1) {
      const cevap = await ayrintiIste(hedef, yoneticiCerezi);
      assert.equal(cevap.statusCode, 200, cevap.body);
      assert.equal(cevap.json().commit, 'e'.repeat(40));
      assert.equal(cevap.json().ortam, 'test');
    }
    assert.deepEqual({ ayarSayisi, gitSayisi }, { ayarSayisi: 1, gitSayisi: 1 });
  });

  test('/saglik/ayrinti boş disk: yedek ve veritabanı klasörünün diski okunur; klasör verilmemişse ya da okunamazsa null, uydurulmaz', async () => {
    const GB = 1024 ** 3;
    const okunan: string[] = [];
    const disk = async (dizin: string) => {
      okunan.push(dizin);
      if (dizin === '/yedek') return { bos: 4 * GB, toplam: 100 * GB };
      if (dizin === '/pg-veri') return { bos: 50 * GB, toplam: 100 * GB };
      return null;
    };
    const kur = (yedek: string | null, veritabani: string | null) => kaynakliUygulama({
      ayarOku: () => ({ commit: null, ortam: 'test' }),
      gitOku: async () => null,
      diskDizinleri: async () => ({ yedek, veritabani }),
      diskOku: disk,
    });
    const dolu = (await ayrintiIste(kur('/yedek', '/pg-veri'), yoneticiCerezi)).json();
    assert.deepEqual(dolu.yedekDiski, { bosBayt: 4 * GB, toplamBayt: 100 * GB, az: true });
    assert.deepEqual(dolu.veritabaniDiski, { bosBayt: 50 * GB, toplamBayt: 100 * GB, az: false });
    const bos = (await ayrintiIste(kur(null, '/okunamayan'), yoneticiCerezi)).json();
    assert.deepEqual({ yedek: bos.yedekDiski, veritabani: bos.veritabaniDiski }, { yedek: null, veritabani: null });
    assert.deepEqual(okunan, ['/yedek', '/pg-veri', '/okunamayan']);
  });

  test('/saglik/ayrinti uyarılar: yedek, iş ve disk uyarıları sunucuda hesaplanır; yedek dosyasının zamanı yedek listesinden okunur', async () => {
    const GB = 1024 ** 3;
    const simdi = Date.now();
    const hedef = kaynakliUygulama({
      ayarOku: () => ({ commit: null, ortam: 'test' }),
      gitOku: async () => null,
      isDurumlari: () => [
        { ad: 'saglam', aralikMs: 60_000, sonBaslama: new Date(simdi - 1000), sonBitis: new Date(simdi - 500), sonSonuc: 'tamam', sonHata: null, sonNeden: null, sonSaglikliBitis: new Date(simdi - 500) },
        { ad: 'bozuk', aralikMs: 60_000, sonBaslama: new Date(simdi - 1000), sonBitis: new Date(simdi - 500), sonSonuc: 'hata', sonHata: 'Veritabanı hatası 23514', sonNeden: null, sonSaglikliBitis: null },
      ],
      diskDizinleri: async () => ({ yedek: '/yedek', veritabani: null }),
      diskOku: async () => ({ bos: 2 * GB, toplam: 100 * GB }),
      yedekOku: async () => ({ durum: 'acik', sonYedek: new Date(simdi - 30 * 3_600_000) }),
    });
    const cevap = await ayrintiIste(hedef, izleyenCerezi);
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.deepEqual(cevap.json().uyarilar, [
      { tur: 'yedek', ileti: 'Son yedek 30 saat önce alındı.' },
      { tur: 'is', ileti: 'bozuk işi son turda hata verdi (Veritabanı hatası 23514).' },
      { tur: 'disk', ileti: 'Yedek diskinde 2,0 GB boş yer kaldı.' },
    ]);
  });

  test('/saglik/ayrinti git başarısızken de onu bir kez dener; commit ortam değerinden gelir', async () => {
    let gitSayisi = 0;
    const hedef = kaynakliUygulama({
      ayarOku: () => ({ commit: 'ortamdan', ortam: 'test' }),
      gitOku: async () => { gitSayisi += 1; return null; },
    });
    for (let i = 0; i < 3; i += 1) {
      const cevap = await ayrintiIste(hedef, yoneticiCerezi);
      assert.equal(cevap.statusCode, 200, cevap.body);
      assert.equal(cevap.json().commit, 'ortamdan');
    }
    assert.equal(gitSayisi, 1);
  });

  test('/saglik/ayrinti otomatik açılış: sorgu kaynağı yoksa null; varsa durum ve görev adı, sorgu ardışık isteklerde bir kez', async () => {
    const yok = kaynakliUygulama({ ayarOku: () => ({ commit: null, ortam: 'test' }), gitOku: async () => null });
    assert.equal((await ayrintiIste(yok, yoneticiCerezi)).json().otomatikAcilis, null);
    let sorgu = 0;
    const hedef = kaynakliUygulama({
      ayarOku: () => ({ commit: null, ortam: 'test' }),
      gitOku: async () => null,
      gorevSorgula: async () => { sorgu += 1; return { tur: 'var', xml: gorevXml(BASLANGIC + ACIK_AYARLAR) }; },
    });
    for (let i = 0; i < 2; i += 1) {
      const cevap = await ayrintiIste(hedef, izleyenCerezi);
      assert.equal(cevap.statusCode, 200, cevap.body);
      assert.deepEqual(cevap.json().otomatikAcilis, { durum: 'kurulu', gorevAdi: 'TMIV2 Bekci' });
    }
    assert.equal(sorgu, 1);
    assert.equal((await ayrintiIste(hedef, operatorCerezi)).statusCode, 403);
  });

  test('/saglik/ayrinti iş durumları: işlemi olan zamanları ISO metin olarak görür, hiç koşmamış iş null taşır; işlemsiz kullanıcı 403', async () => {
    const hedef = kaynakliUygulama({
      ayarOku: () => ({ commit: null, ortam: 'test' }),
      gitOku: async () => null,
      isDurumlari: () => [
        { ad: 'koşan', aralikMs: 60_000, sonBaslama: new Date('2026-10-08T09:00:00Z'), sonBitis: new Date('2026-10-08T09:00:01.250Z'), sonSonuc: 'hata', sonHata: 'Veritabanı hatası 23514', sonNeden: null, sonSaglikliBitis: null },
        { ad: 'yeni', aralikMs: 60_000, sonBaslama: null, sonBitis: null, sonSonuc: null, sonHata: null, sonNeden: null, sonSaglikliBitis: null },
        { ad: 'bekleyen', aralikMs: 60_000, sonBaslama: new Date('2026-10-08T09:00:00Z'), sonBitis: new Date('2026-10-08T09:00:00.010Z'), sonSonuc: 'bekliyor', sonHata: null, sonNeden: 'Logo bağlantısı kapalı', sonSaglikliBitis: new Date('2026-10-08T09:00:00.010Z') },
      ],
    });
    const cevap = await ayrintiIste(hedef, izleyenCerezi);
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.deepEqual(cevap.json().isler, [
      { ad: 'koşan', sonBaslama: '2026-10-08T09:00:00.000Z', sonBitis: '2026-10-08T09:00:01.250Z', sonSonuc: 'hata', sonHata: 'Veritabanı hatası 23514', sonNeden: null },
      { ad: 'yeni', sonBaslama: null, sonBitis: null, sonSonuc: null, sonHata: null, sonNeden: null },
      { ad: 'bekleyen', sonBaslama: '2026-10-08T09:00:00.000Z', sonBitis: '2026-10-08T09:00:00.010Z', sonSonuc: 'bekliyor', sonHata: null, sonNeden: 'Logo bağlantısı kapalı' },
    ]);
    assert.equal((await ayrintiIste(hedef, operatorCerezi)).statusCode, 403);
  });

  test('/saglik/ayrinti süreçte başlatılmış zamanlayıcının işlerini gösterir; zamanlayıcı yokken liste boştur', async () => {
    assert.deepEqual((await ayrintiIste(app, yoneticiCerezi)).json().isler, []);
    const zamanlayici = zamanlayiciKur({
      vt: acik().vt,
      gunluk: { error: () => undefined, warn: () => undefined },
      isler: [isTanimi({ ad: 'saglik-deneme', aralikMs: 60_000, calis: async () => undefined })],
    });
    zamanlayici.baslat();
    try {
      assert.deepEqual((await ayrintiIste(app, yoneticiCerezi)).json().isler, [
        { ad: 'saglik-deneme', sonBaslama: null, sonBitis: null, sonSonuc: null, sonHata: null, sonNeden: null },
      ]);
    } finally {
      await zamanlayici.durdur(100);
    }
    assert.deepEqual((await ayrintiIste(app, yoneticiCerezi)).json().isler, []);
  });

  test('yayın: kaynak verince onun değeri; okunamaz ya da asılı kalırsa null', async () => {
    const al = async (yayinOku: () => Promise<string | null>) =>
      (await ayrintiTopla(acik().vt, { ...girdi(null, null, 30), yayinOku })).yayin;
    assert.equal(await al(async () => '2026.11.01-1'), '2026.11.01-1');
    assert.equal(await al(async () => null), null);
    assert.equal(await al(() => Promise.reject(new Error('okunamadı'))), null);
    assert.equal(await al(() => new Promise(() => undefined)), null);
    const hedef = kaynakliUygulama({ ayarOku, gitOku: async () => null, yayinOku: async () => '2026.11.01-2' });
    try {
      assert.equal((await ayrintiIste(hedef, yoneticiCerezi)).json().yayin, '2026.11.01-2');
    } finally {
      await hedef.close();
    }
  });

  test('commit: git değer verince o; git yoksa ortam değeri; ikisi de yoksa null', async () => {
    const GIT = 'b'.repeat(40);
    const al = async (git: string | null, ortamCommit: string | null) =>
      (await ayrintiTopla(acik().vt, girdi(git, ortamCommit))).commit;
    assert.equal(await al(GIT, 'ortamdan'), GIT);
    assert.equal(await al(null, 'ortamdan'), 'ortamdan');
    assert.equal(await al(null, null), null);
  });
});
