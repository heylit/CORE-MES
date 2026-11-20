import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type {
  Firma, FirmaCevabi, FirmaListesiCevabi, LogoCariAramaCevabi, LogoCariCevabi, LogoCariGeriAlCevabi, LogoCariKartlariCevabi, LogoCariListeCevabi,
  LogoCariSonIslemCevabi, LogoCariTopluCevabi, LogoCariTopluGovdesi, LogodanFirmaAlGovdesi,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { firmaPasifEngeli as finansFirmaPasifEngeli } from '../finans/disari.ts';
import { firmaPasifEngeliKaydet, logoCariAynasiKaydet, logoCariCozuculeriKaydet } from './disari.ts';
import type { LogoCariBilgisi, LogoCariSonucu } from './disari.ts';
import { LOGO_CARI_BELLEK_MS } from './kurallar.ts';
import { firmaKoduVarMi } from './sorgular.ts';
import { firmaNoKoddan, logoCariSaatiKur } from './servis.ts';

// 2118 (2118-1 a, 2118-2 a, 2118-3 a). Cariler uydurmadır; gerçek ad, kod ya da vergi numarası yoktur. Logo köprüsü yerine sahte
// çözücü vardır: yalnız okuma çağrısı alır; komutların köprüye hiç gitmediği çağrı sayısıyla denetlenir.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

const cari = (kod: string, ek: Partial<LogoCariBilgisi> = {}): LogoCariBilgisi => ({
  logoKayitNo: 1, kod, ad: `Deneme Cari ${kod}`, kartTuru: 1, vergiNo: null, tcKimlikNo: null, vergiDairesi: null, adres: null, ilce: null,
  il: null, postaKodu: null, telefon: null, ePosta: null, aktif: true, ...ek,
});

describe('Logo\'dan cari arama ve alma (gerçek PostgreSQL, sahte köprü)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  let logodakiler: LogoCariBilgisi[] = [];
  let aramaSonucu: LogoCariSonucu<LogoCariBilgisi[]> | null = null;
  const cagrilar: string[] = [];
  let simdi = Date.now();

  async function istek<T = unknown>(kim: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() };
    if (kim !== null) basliklar['cookie'] = cerez.get(kim) ?? '';
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const ara = (kim: string, q: string) => istek<LogoCariAramaCevabi>(kim, 'GET', `/musteri-tedarikci/logo-cari/ara?q=${encodeURIComponent(q)}`);
  const oku = (kim: string, kod: string) => istek<LogoCariCevabi>(kim, 'GET', `/musteri-tedarikci/logo-cari?kod=${encodeURIComponent(kod)}`);
  const al = (kim: string, govde: LogodanFirmaAlGovdesi) => istek<FirmaCevabi>(kim, 'POST', '/musteri-tedarikci/logo-cari/al', govde);
  const bagla = (kim: string, id: number, logoKodu: string, surum: number) =>
    istek<FirmaCevabi>(kim, 'POST', `/musteri-tedarikci/firmalar/${id}/logo-bagla`, { logoKodu, surum });
  const toplu = (kim: string, govde: LogoCariTopluGovdesi) => istek<LogoCariTopluCevabi>(kim, 'POST', '/musteri-tedarikci/logo-cari/toplu', govde);
  async function firmaKur(ek: Record<string, unknown>): Promise<Firma> {
    const c = await istek<FirmaCevabi>('yazan', 'POST', '/musteri-tedarikci/firmalar/ekle', { tur: 'musteri', ...ek });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.firma;
  }
  const firmaSayisi = async (): Promise<number> => (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM musteri_tedarikci_firma'))?.n ?? -1;

  async function girisliKisi(kullaniciAdi: string, rolKodu: string, islemler: string[]): Promise<void> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [rolKodu]);
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol kurulamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, islem]);
    await vt().tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, kisi, rol.id);
      await rolAl(db, yoneticiId, kisi, yoneticiRolu.id);
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  before(async () => {
    ortam = await testVeritabaniKur('mtlogocari');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await girisliKisi('okuyan', 'gecici_lc_oku', ['sayfa.finans', 'musteri-tedarikci.oku']);
    await girisliKisi('yazan', 'gecici_lc_yaz', ['sayfa.finans', 'musteri-tedarikci.oku', 'musteri-tedarikci.yaz']);
    await girisliKisi('yazan2', 'gecici_lc_yaz2', ['sayfa.finans', 'musteri-tedarikci.oku', 'musteri-tedarikci.yaz']);
    logoCariSaatiKur(() => simdi);
  });
  beforeEach(() => {
    cagrilar.length = 0;
    aramaSonucu = null;
    logoCariCozuculeriKaydet({
      ara: async (_db, metin) => {
        cagrilar.push(`ara:${metin}`);
        return aramaSonucu ?? { tur: 'tamam', veri: logodakiler.filter((c) => c.kod.includes(metin) || (c.ad ?? '').includes(metin)) };
      },
      oku: async (_db, kod) => {
        cagrilar.push(`oku:${kod}`);
        return { tur: 'tamam', veri: logodakiler.find((c) => c.kod === kod) ?? null };
      },
    });
  });
  after(async () => {
    logoCariCozuculeriKaydet(null);
    logoCariAynasiKaydet(null);
    logoCariSaatiKur(null);
    await ortam?.kaldir();
  });

  test('LCA-1 yetki (2118-3 a): firma yazamayan arayamaz ve alamaz; köprüye istek gitmez', async () => {
    logodakiler = [cari('LCA1.001', { logoKayitNo: 101 })];
    assert.equal((await ara('okuyan', 'LCA1')).durum, 403);
    assert.equal((await oku('okuyan', 'LCA1.001')).durum, 403);
    assert.equal((await istek(null, 'GET', '/musteri-tedarikci/logo-cari/ara?q=LCA1')).durum, 401);
    const once = await firmaSayisi();
    assert.equal((await al('okuyan', { logoKodu: 'LCA1.001', ad: 'x', tur: 'musteri' })).durum, 403);
    assert.equal(await firmaSayisi(), once);
    assert.deepEqual(cagrilar, []);
    assert.equal((await ara('yazan', 'LCA1')).durum, 200);
  });

  test('LCA-2 Logo kapalıysa ya da çözücü bağlı değilse arama hata değil durum döner', async () => {
    aramaSonucu = { tur: 'kapali', ileti: 'Logo\'dan cari arama kapalı.' };
    const k = await ara('yazan', 'LCA2');
    assert.equal(k.durum, 200);
    assert.deepEqual(k.govde, { durum: 'kapali', ileti: 'Logo\'dan cari arama kapalı.', cariler: [] });
    logoCariCozuculeriKaydet(null);
    const b = await ara('yazan', 'LCA2');
    assert.equal(b.govde.durum, 'kapali');
    assert.equal((await oku('yazan', 'LCA2')).govde.durum, 'kapali');
    assert.equal((await ara('yazan', 'ab')).durum, 400);
  });

  test('LCA-3 eşleşme sırası kayıt no, cari kodu, kod, vergi no; öneri Logo kodunu ve türünü taşır', async () => {
    const kayitli = await firmaKur({ ad: 'LCA3 Kayıtlı', kod: 'LCA3.K' });
    await vt().sorgu('UPDATE musteri_tedarikci_firma SET logo_kayit_no = 301, logo_cari_kodu = $2 WHERE id = $1', [kayitli.id, 'LCA3.K']);
    const cariKodlu = await firmaKur({ ad: 'LCA3 Cari Kodlu', kod: 'LCA3.X', logoCariKodu: 'LCA3.C' });
    const kodlu = await firmaKur({ ad: 'LCA3 Kodlu', kod: 'lca3.d' });
    const vergili = await firmaKur({ ad: 'LCA3 Vergili', kod: 'LCA3.Y', vergiNo: '3000000301' });
    logodakiler = [
      cari('LCA3.K-BASKA', { logoKayitNo: 301 }),
      cari('LCA3.C', { logoKayitNo: 302, kartTuru: 2 }),
      cari('LCA3.D', { logoKayitNo: 303, kartTuru: 3 }),
      cari('LCA3.V', { logoKayitNo: 304, vergiNo: '3000000301', kartTuru: 9 }),
      cari('LCA3.YENI', { logoKayitNo: 305, vergiNo: '12', ePosta: 'gecersiz', ad: null }),
    ];
    const c = await ara('yazan', 'LCA3');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const s = new Map(c.govde.cariler.map((x) => [x.kod, x]));
    assert.deepEqual([s.get('LCA3.K-BASKA')?.eslesme?.neden, s.get('LCA3.K-BASKA')?.eslesme?.firmaId], ['kayit-no', kayitli.id]);
    assert.equal(s.get('LCA3.K-BASKA')?.eslesme?.baglanabilir, false);
    assert.deepEqual([s.get('LCA3.C')?.eslesme?.neden, s.get('LCA3.C')?.eslesme?.firmaId, s.get('LCA3.C')?.eslesme?.baglanabilir], ['cari-kodu', cariKodlu.id, true]);
    assert.deepEqual([s.get('LCA3.D')?.eslesme?.neden, s.get('LCA3.D')?.eslesme?.firmaId], ['kod', kodlu.id]);
    assert.deepEqual([s.get('LCA3.V')?.eslesme?.neden, s.get('LCA3.V')?.eslesme?.firmaId], ['vergi-no', vergili.id]);
    const yeni = s.get('LCA3.YENI');
    assert.equal(yeni?.eslesme, null);
    assert.equal(yeni?.alinamaz, null);
    assert.deepEqual(
      [yeni?.oneri.kod, yeni?.oneri.logoCariKodu, yeni?.oneri.ad, yeni?.oneri.tur, yeni?.oneri.vergiNo, yeni?.oneri.ePosta],
      ['LCA3.YENI', 'LCA3.YENI', 'LCA3.YENI', 'musteri', null, null],
    );
    assert.deepEqual([s.get('LCA3.C')?.oneri.tur, s.get('LCA3.D')?.oneri.tur, s.get('LCA3.V')?.oneri.tur], ['tedarikci', 'ikisi', 'ikisi']);
  });

  test('LCA-4 alma: kod ve Logo cari kodu Logo kodudur, Logo kaydı yazılır; aynı cari ikinci kez alınmaz; komut köprüye gitmez', async () => {
    logodakiler = [cari('LCA4.001', { logoKayitNo: 401, vergiNo: '4000000401', il: 'Deneme İl' })];
    const a = await ara('yazan', 'LCA4');
    const o = a.govde.cariler[0]!.oneri;
    cagrilar.length = 0;
    const c = await al('yazan', { ...o, kod: 'BASKA-KOD', logoCariKodu: 'BASKA', logoKodu: 'lca4.001', tur: 'tedarikci', vadeGunu: 30 });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const f = c.govde.firma;
    assert.deepEqual(
      [f.kod, f.logoCariKodu, f.logoKayitNo, f.logoGonderimDurumu, f.tur, f.vadeGunu, f.vergiNo, f.il],
      ['LCA4.001', 'LCA4.001', 401, 'gonderildi', 'tedarikci', 30, '4000000401', 'Deneme İl'],
    );
    assert.deepEqual(cagrilar, []);
    const once = await firmaSayisi();
    const ikinci = await al('yazan', { ...o, logoKodu: 'LCA4.001' });
    assert.equal(ikinci.durum, 409);
    assert.equal(await firmaSayisi(), once);
    // Bağlı firmanın kodu ve Logo cari kodu kilitlidir (MT-5).
    const g = await istek('yazan', 'POST', `/musteri-tedarikci/firmalar/${f.id}/guncelle`, { ...o, kod: 'LCA4.DEGISTI', surum: f.surum });
    assert.equal(g.durum, 422);
  });

  test('LCA-5 alma yalnız aynı kişinin geçerli okumasıyla: okumasız, başkasının okumasıyla ve süresi dolunca 409', async () => {
    logodakiler = [cari('LCA5.001', { logoKayitNo: 501 })];
    const govde = { logoKodu: 'LCA5.001', ad: 'LCA5', tur: 'musteri' as const };
    assert.equal((await al('yazan', govde)).durum, 409);
    await ara('yazan2', 'LCA5');
    assert.equal((await al('yazan', govde)).durum, 409);
    assert.equal((await oku('yazan', 'LCA5.001')).govde.cari?.kod, 'LCA5.001');
    simdi += LOGO_CARI_BELLEK_MS;
    assert.equal((await al('yazan', govde)).durum, 409);
    await ara('yazan', 'LCA5');
    assert.equal((await al('yazan', govde)).durum, 200);
  });

  test('LCA-6 bağlama Logo alanlarını ve kodu yazar (3473), öteki alanlar kalır; bağlı, başka cari kodlu ve eski sürümlü firma bağlanmaz', async () => {
    const f = await firmaKur({ ad: 'LCA6 Firma', kod: 'LCA6.TMI', il: 'TMI İli' });
    const farkli = await firmaKur({ ad: 'LCA6 Farklı', logoCariKodu: 'LCA6.FARKLI' });
    logodakiler = [cari('LCA6.001', { logoKayitNo: 601, il: 'Logo İli', ad: 'Logo Adı' })];
    await ara('yazan', 'LCA6');
    cagrilar.length = 0;
    assert.equal((await bagla('yazan', f.id, 'LCA6.001', f.surum + 5)).durum, 409);
    assert.equal((await bagla('okuyan', f.id, 'LCA6.001', f.surum)).durum, 403);
    const c = await bagla('yazan', f.id, 'LCA6.001', f.surum);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const b = c.govde.firma;
    assert.deepEqual(
      [b.kod, b.eskiKod, b.ad, b.il, b.logoCariKodu, b.logoKayitNo, b.logoGonderimDurumu, b.surum],
      ['LCA6.001', 'LCA6.TMI', 'LCA6 Firma', 'TMI İli', 'LCA6.001', 601, 'gonderildi', f.surum + 1],
    );
    assert.equal((await bagla('yazan', b.id, 'LCA6.001', b.surum)).durum, 422);
    assert.equal((await bagla('yazan', farkli.id, 'LCA6.001', farkli.surum)).durum, 422);
    assert.deepEqual(cagrilar, []);
    // Liste satırı bağı kayıt numarasıyla taşır (3065): cari kodu elle yazılmış ama bağlanmamış firma bağlı görünmez.
    const liste = await istek<FirmaListesiCevabi>('okuyan', 'GET', '/musteri-tedarikci/firmalar?ara=LCA6');
    assert.equal(liste.durum, 200, JSON.stringify(liste.govde));
    const satirlar = new Map(liste.govde.satirlar.map((r) => [r.id, r]));
    assert.deepEqual([satirlar.get(b.id)?.logoKayitNo, satirlar.get(b.id)?.logoCariKodu], [601, 'LCA6.001']);
    assert.deepEqual([satirlar.get(farkli.id)?.logoKayitNo, satirlar.get(farkli.id)?.logoCariKodu], [null, 'LCA6.FARKLI']);
  });

  test('LCA-7 kodu TMI\'ye sığmayan cari listede "alınamaz" görünür ve alınmaz', async () => {
    const uzun = `LCA7.${'X'.repeat(40)}`;
    logodakiler = [cari(uzun, { logoKayitNo: 701 })];
    const a = await ara('yazan', 'LCA7');
    assert.match(a.govde.cariler[0]?.alinamaz ?? '', /1-40/);
    const once = await firmaSayisi();
    assert.equal((await al('yazan', { logoKodu: uzun.slice(0, 40), ad: 'x', tur: 'musteri' })).durum, 409);
    assert.equal(await firmaSayisi(), once);
  });

  // 3343: Logo geçişi cariler sekmesi.
  test('LCA-8 toplu: her cari ayrı işlenir; reddedilen satır geri alınır, ötekiler kalır; komut köprüye gitmez', async () => {
    const baglanacak = await firmaKur({ kod: 'LCA8.001', ad: 'LCA8 Firma' });
    const eskiyen = await firmaKur({ kod: 'LCA8.002', ad: 'LCA8 Eski' });
    const uzun = `LCA8.${'X'.repeat(40)}`;
    logodakiler = [
      cari('LCA8.001', { logoKayitNo: 801 }),
      cari('LCA8.002', { logoKayitNo: 802 }),
      cari('LCA8.003', { logoKayitNo: 803, kartTuru: 2, il: 'Deneme İli', ad: 'LCA8 Yeni' }),
      cari('LCA8.004', { logoKayitNo: 804, kartTuru: 3 }),
      cari(uzun, { logoKayitNo: 805 }),
    ];
    await ara('yazan', 'LCA8');
    cagrilar.length = 0;
    const once = await firmaSayisi();
    const c = await toplu('yazan', {
      bagla: [
        { logoKodu: 'LCA8.001', firmaId: baglanacak.id, surum: baglanacak.surum },
        { logoKodu: 'LCA8.002', firmaId: eskiyen.id, surum: eskiyen.surum + 3 },
      ],
      al: [{ logoKodu: 'LCA8.003' }, { logoKodu: 'LCA8.004' }, { logoKodu: uzun.slice(0, 40) }],
    });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const s = c.govde.sonuclar;
    assert.deepEqual(s.map((r) => [r.logoKodu, r.islem, r.tamam]), [
      ['LCA8.001', 'bagla', true], ['LCA8.002', 'bagla', false], ['LCA8.003', 'al', true], ['LCA8.004', 'al', true], [uzun.slice(0, 40), 'al', false],
    ]);
    assert.deepEqual(s.map((r) => r.ileti === null), [true, false, true, true, false]);
    assert.equal(s[0]?.firma?.id, baglanacak.id);
    assert.equal(await firmaSayisi(), once + 2);
    assert.deepEqual(cagrilar, []);
    const yeni = await vt().tek<{ kod: string; tur: string; il: string | null; logo_kayit_no: number; logo_cari_kodu: string }>(
      'SELECT kod, tur, il, logo_kayit_no, logo_cari_kodu FROM musteri_tedarikci_firma WHERE id = $1', [s[2]?.firma?.id],
    );
    assert.deepEqual(yeni, { kod: 'LCA8.003', tur: 'tedarikci', il: 'Deneme İli', logo_kayit_no: 803, logo_cari_kodu: 'LCA8.003' });
    const bagli = await vt().tek<{ logo_kayit_no: number | null }>('SELECT logo_kayit_no FROM musteri_tedarikci_firma WHERE id = $1', [eskiyen.id]);
    assert.equal(bagli?.logo_kayit_no, null);
    // Aynı seçim yeniden gönderilirse alınmış cari ikinci kez alınmaz (2118-2 a): satır reddedilir, firma sayısı değişmez.
    const ikinci = await toplu('yazan', { bagla: [], al: [{ logoKodu: 'LCA8.003' }] });
    assert.equal(ikinci.durum, 200, JSON.stringify(ikinci.govde));
    assert.equal(ikinci.govde.sonuclar[0]?.tamam, false);
    assert.match(ikinci.govde.sonuclar[0]?.ileti ?? '', /TMI'de var/);
    assert.equal(await firmaSayisi(), once + 2);
  });

  test('LCA-9 toplu: yetki, boş, yinelenen ve sınırı aşan seçim reddedilir; başkasının aramasıyla alınmaz', async () => {
    logodakiler = [cari('LCA9.001', { logoKayitNo: 901 })];
    await ara('yazan', 'LCA9');
    const once = await firmaSayisi();
    assert.equal((await toplu('okuyan', { bagla: [], al: [{ logoKodu: 'LCA9.001' }] })).durum, 403);
    assert.equal((await toplu('yazan', { bagla: [], al: [] })).durum, 400);
    assert.equal((await toplu('yazan', { bagla: [], al: [{ logoKodu: 'LCA9.001' }, { logoKodu: 'lca9.001' }] })).durum, 400);
    const cok = Array.from({ length: 201 }, (_, i) => ({ logoKodu: `LCA9.${String(i).padStart(3, '0')}` }));
    assert.equal((await toplu('yazan', { bagla: [], al: cok })).durum, 400);
    // Sınır iki dizinin toplamıdır: 101 bağla + 100 al da reddedilir, firma yazılmaz.
    const onceToplam = await firmaSayisi();
    const bagla101 = Array.from({ length: 101 }, (_, i) => ({ logoKodu: `LCA9.B${String(i).padStart(3, '0')}`, firmaId: 1, surum: 1 }));
    const al100 = Array.from({ length: 100 }, (_, i) => ({ logoKodu: `LCA9.A${String(i).padStart(3, '0')}` }));
    assert.equal((await toplu('yazan', { bagla: bagla101, al: al100 })).durum, 400);
    assert.equal(await firmaSayisi(), onceToplam);
    const baskasi = await toplu('yazan2', { bagla: [], al: [{ logoKodu: 'LCA9.001' }] });
    assert.equal(baskasi.durum, 200, JSON.stringify(baskasi.govde));
    assert.equal(baskasi.govde.sonuclar[0]?.tamam, false);
    assert.match(baskasi.govde.sonuclar[0]?.ileti ?? '', /yeniden arayın/);
    assert.equal(await firmaSayisi(), once);
  });

  // 3473: bağlanınca kod Logo cari kodu olur; eski kod geçmişte kalır, aramada ve koddan çözmede bulunur, otomatik numaraya verilmez.
  test('LCA-10 eski kod geçmişte: kartta görünür, listede aranır, koddan firma bulunur, numara olarak dolu sayılır', async () => {
    const f = await firmaKur({ ad: 'LCA10 Firma', kod: 'LCA10.ESKI' });
    logodakiler = [cari('LCA10.LOGO', { logoKayitNo: 1001 })];
    await ara('yazan', 'LCA10');
    const c = await bagla('yazan', f.id, 'LCA10.LOGO', f.surum);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual([c.govde.firma.kod, c.govde.firma.eskiKod], ['LCA10.LOGO', 'LCA10.ESKI']);
    const ayrinti = await istek<FirmaCevabi>('okuyan', 'GET', `/musteri-tedarikci/firmalar/${f.id}`);
    assert.equal(ayrinti.govde.firma.eskiKod, 'LCA10.ESKI');
    const liste = await istek<FirmaListesiCevabi>('okuyan', 'GET', '/musteri-tedarikci/firmalar?ara=10.ESK');
    assert.deepEqual(liste.govde.satirlar.map((r) => r.id), [f.id]);
    const gecmis = await vt().sorgu<{ kod: string; birakan: boolean }>(
      'SELECT kod, birakan_id IS NOT NULL AS birakan FROM musteri_tedarikci_kod_gecmisi WHERE firma_id = $1', [f.id],
    );
    assert.deepEqual(gecmis, [{ kod: 'LCA10.ESKI', birakan: true }]);
    assert.deepEqual(await vt().tx(async (db) => [
      await firmaNoKoddan(db, 'LCA10.ESKI'), await firmaNoKoddan(db, 'LCA10.LOGO'), await firmaKoduVarMi(db, 'lca10.eski'), await firmaNoKoddan(db, 'LCA10.YOK'),
    ]), [f.id, f.id, true, null]);
    // Eski kod sonradan başka firmaya elle verilirse bugünkü kod önce gelir.
    const yeni = await firmaKur({ ad: 'LCA10 Yeni', kod: 'LCA10.ESKI' });
    assert.equal(await vt().tx((db) => firmaNoKoddan(db, 'LCA10.ESKI')), yeni.id);
  });

  test('LCA-11 kodu Logo kodundan aynı olan firma geçmiş yazmaz; Logo kodu başka firmanın koduysa bağlanmaz, ileti iki firmayı adlandırır', async () => {
    const ayni = await firmaKur({ ad: 'LCA11 Aynı', kod: 'LCA11.001' });
    const hedef = await firmaKur({ ad: 'LCA11 Hedef', kod: 'LCA11.H' });
    const sahip = await firmaKur({ ad: 'LCA11 Sahip', kod: 'LCA11.002' });
    logodakiler = [cari('LCA11.001', { logoKayitNo: 1101 }), cari('LCA11.002', { logoKayitNo: 1102 })];
    await ara('yazan', 'LCA11');
    const a = await bagla('yazan', ayni.id, 'LCA11.001', ayni.surum);
    assert.equal(a.durum, 200, JSON.stringify(a.govde));
    assert.deepEqual([a.govde.firma.kod, a.govde.firma.eskiKod], ['LCA11.001', null]);
    const r = await bagla('yazan', hedef.id, 'LCA11.002', hedef.surum);
    assert.equal(r.durum, 422);
    assert.match(JSON.stringify(r.govde), /LCA11\.002 LCA11 Sahip/);
    const sonra = await vt().tek<{ kod: string; logo_kayit_no: number | null }>('SELECT kod, logo_kayit_no FROM musteri_tedarikci_firma WHERE id = $1', [hedef.id]);
    assert.deepEqual(sonra, { kod: 'LCA11.H', logo_kayit_no: null });
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM musteri_tedarikci_kod_gecmisi WHERE firma_id = ANY($1::int[])', [[ayni.id, hedef.id, sahip.id]]))?.n, 0);
  });

  // 3474-1: tam liste aynadan, ön kontrol okuması, işlem izi ve geri al.
  const liste = (kim: string, sorgu = '') => istek<LogoCariListeCevabi>(kim, 'GET', `/musteri-tedarikci/logo-cari/liste${sorgu}`);
  const kartlar = (kim: string, kodlar: string[]) =>
    istek<LogoCariKartlariCevabi>(kim, 'GET', `/musteri-tedarikci/logo-cari/kartlar?kodlar=${encodeURIComponent(kodlar.join(','))}`);
  const sonIslem = (kim: string) => istek<LogoCariSonIslemCevabi>(kim, 'GET', '/musteri-tedarikci/logo-cari/son-islem');
  const geriAl = (kim: string, islem: string) => istek<LogoCariGeriAlCevabi>(kim, 'POST', '/musteri-tedarikci/logo-cari/geri-al', { islem });
  const logoAlanlari = (id: number, cariKodu: string | null, kayitNo: number | null) =>
    vt().sorgu('UPDATE musteri_tedarikci_firma SET logo_cari_kodu = $2, logo_kayit_no = $3 WHERE id = $1', [id, cariKodu, kayitNo]);

  test('LCA-12 liste aynadan gelir: durum, sayılar, süzgeç, arama ve tümünü seç; Logo\'ya istek gitmez', async () => {
    const uzun = `LCB.${'X'.repeat(40)}`;
    const baglanabilir = await firmaKur({ kod: 'LCB.001', ad: 'LCB Bağlanabilir' });
    const bagli = await firmaKur({ kod: 'LCB.F2', ad: 'LCB Bağlı' });
    await logoAlanlari(bagli.id, 'LCB.002', 1002);
    await firmaKur({ kod: 'LCB.004', ad: 'LCB Aynı kod' });
    const ikinci = await firmaKur({ kod: 'LCB.F4', ad: 'LCB Aynı cari kodu' });
    await logoAlanlari(ikinci.id, 'LCB.004', null);
    logoCariAynasiKaydet(async () => ({
      acik: true, sonOkuma: '2026-11-20T06:00:00.000Z',
      cariler: [
        { kod: 'LCB.001', ad: 'LCB Bir' }, { kod: 'LCB.002', ad: 'LCB İki' }, { kod: 'LCB.003', ad: 'LCB Üç' },
        { kod: 'LCB.004', ad: 'LCB Dört' }, { kod: uzun, ad: 'LCB Uzun' },
      ],
    }));
    assert.equal((await liste('okuyan')).durum, 403);
    const c = await liste('yazan');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(c.govde.sayilar, { tumu: 5, yeni: 1, baglanabilir: 1, bagli: 1, eslesik: 1, alinamaz: 1 });
    assert.deepEqual(c.govde.satirlar.map((s) => [s.kod, s.durum]), [
      ['LCB.001', 'baglanabilir'], ['LCB.002', 'bagli'], ['LCB.003', 'yeni'], ['LCB.004', 'eslesik'], [uzun, 'alinamaz'],
    ]);
    assert.deepEqual(c.govde.satirlar[3]?.adaylar.map((a) => a.neden), ['cari-kodu', 'kod']);
    assert.deepEqual(c.govde.secilebilir, [
      { kod: 'LCB.001', islem: 'bagla', firmaId: baglanabilir.id, surum: baglanabilir.surum },
      { kod: 'LCB.003', islem: 'al', firmaId: null, surum: null },
    ]);
    assert.deepEqual(c.govde.okuma, { acik: true, sonOkuma: '2026-11-20T06:00:00.000Z' });
    const suzulen = await liste('yazan', '?suzgec=yeni');
    assert.deepEqual([suzulen.govde.uyan, suzulen.govde.satirlar.map((s) => s.kod), suzulen.govde.sayilar.tumu], [1, ['LCB.003'], 5]);
    const aranan = await liste('yazan', `?ara=${encodeURIComponent('LCB İKİ')}`);
    assert.deepEqual(aranan.govde.satirlar.map((s) => s.kod), ['LCB.002']);
    assert.equal((await liste('yazan', '?ara=L')).durum, 400);
    assert.deepEqual(cagrilar, []);
    logoCariAynasiKaydet(null);
    const bagsiz = await liste('yazan');
    assert.deepEqual([bagsiz.govde.baglanti, bagsiz.govde.satirlar.length], [false, 0]);
  });

  test('LCA-13 ön kontrol okuması: okunan belleğe yazılır, toplu ondan çalışır; okunamayan ayrılır, kapalıysa durur', async () => {
    logodakiler = [cari('LCC.001', { logoKayitNo: 1301, vergiNo: '1111111111' })];
    assert.equal((await kartlar('okuyan', ['LCC.001'])).durum, 403);
    assert.equal((await kartlar('yazan', Array.from({ length: 21 }, (_, i) => `LCC.${i}`))).durum, 400);
    const c = await kartlar('yazan', ['LCC.001', 'LCC.009']);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(c.govde.cariler.map((k) => [k.kod, k.vergiNo]), [['LCC.001', '1111111111']]);
    assert.deepEqual(c.govde.okunamayan.map((o) => o.kod), ['LCC.009']);
    assert.deepEqual(cagrilar, ['oku:LCC.001', 'oku:LCC.009']);
    cagrilar.length = 0;
    const t = await toplu('yazan', { bagla: [], al: [{ logoKodu: 'LCC.001' }] });
    assert.equal(t.govde.sonuclar[0]?.tamam, true, JSON.stringify(t.govde));
    assert.equal(cagrilar.length, 0);
    logoCariCozuculeriKaydet({
      ara: async () => ({ tur: 'tamam', veri: [] }),
      oku: async () => { cagrilar.push('oku'); return { tur: 'kapali', ileti: 'Logo bağlantısı kapalı.' }; },
    });
    const kapali = await kartlar('yazan', ['LCC.002', 'LCC.003']);
    assert.deepEqual([kapali.govde.durum, kapali.govde.cariler.length, cagrilar], ['kapali', 0, ['oku']]);
  });

  test('LCA-14 son toplu işlem izi ve geri al: bağlama çözülür (eski kod geri, geçmiş satırı silinir), açılan firma pasife alınır; değişen ya da eski kodu alınmış firma atlanır', async () => {
    const firma = await firmaKur({ kod: 'LCD.F1', ad: 'LCD Bağlanacak' });
    const firma2 = await firmaKur({ kod: 'LCD.F2', ad: 'LCD Kodu alınacak' });
    logodakiler = [
      cari('LCD.001', { logoKayitNo: 1201 }), cari('LCD.002', { logoKayitNo: 1202 }), cari('LCD.003', { logoKayitNo: 1203 }), cari('LCD.004', { logoKayitNo: 1204 }),
    ];
    await kartlar('yazan', ['LCD.001', 'LCD.002', 'LCD.003', 'LCD.004']);
    const once = await firmaSayisi();
    const t = await toplu('yazan', {
      bagla: [{ logoKodu: 'LCD.001', firmaId: firma.id, surum: firma.surum }, { logoKodu: 'LCD.004', firmaId: firma2.id, surum: firma2.surum }],
      al: [{ logoKodu: 'LCD.002' }, { logoKodu: 'LCD.003' }],
    });
    assert.deepEqual(t.govde.sonuclar.map((s) => s.tamam), [true, true, true, true], JSON.stringify(t.govde));
    const gecmis = (id: number) => vt().sorgu<{ kod: string }>('SELECT kod FROM musteri_tedarikci_kod_gecmisi WHERE firma_id = $1', [id]);
    assert.deepEqual(await gecmis(firma.id), [{ kod: 'LCD.F1' }]);
    const son = await sonIslem('yazan');
    assert.equal(son.govde.islem?.islem, t.govde.islem);
    assert.deepEqual([son.govde.islem?.satirlar.length, son.govde.islem?.geriAlinabilir], [4, true]);
    assert.equal((await sonIslem('yazan2')).govde.islem?.islem === t.govde.islem, false);
    assert.equal((await geriAl('yazan2', t.govde.islem)).durum, 404);
    assert.equal((await geriAl('okuyan', t.govde.islem)).durum, 403);
    const degisen = t.govde.sonuclar[3]!.firma!.id;
    await vt().sorgu('UPDATE musteri_tedarikci_firma SET surum = surum + 1 WHERE id = $1', [degisen]);
    await firmaKur({ kod: 'LCD.F2', ad: 'LCD Eski kodu alan' });
    const g = await geriAl('yazan', t.govde.islem);
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.equal(g.govde.geriAlinan, 2);
    assert.deepEqual(g.govde.atlanan.map((a) => a.logoKodu), ['LCD.004', 'LCD.003']);
    assert.match(g.govde.atlanan[0]?.neden ?? '', /Eski kod LCD\.F2 artık LCD\.F2 LCD Eski kodu alan/);
    assert.equal(await firmaSayisi(), once + 3);
    const durum = await vt().sorgu<{ id: number; kod: string; aktif: boolean; logo_kayit_no: number | null; logo_cari_kodu: string | null }>(
      'SELECT id, kod, aktif, logo_kayit_no, logo_cari_kodu FROM musteri_tedarikci_firma WHERE id = ANY($1::int[]) ORDER BY id',
      [[firma.id, firma2.id, t.govde.sonuclar[2]!.firma!.id, degisen]],
    );
    assert.deepEqual(durum.map((f) => [f.kod, f.aktif, f.logo_kayit_no, f.logo_cari_kodu]), [
      ['LCD.F1', true, null, null], ['LCD.004', true, 1204, 'LCD.004'], ['LCD.002', false, 1202, 'LCD.002'], ['LCD.003', true, 1203, 'LCD.003'],
    ]);
    assert.deepEqual(await gecmis(firma.id), []);
    assert.deepEqual(await gecmis(firma2.id), [{ kod: 'LCD.F2' }]);
    const sonra = await sonIslem('yazan');
    assert.deepEqual(sonra.govde.islem?.satirlar.map((s) => [s.geriAlindi, s.geriIleti !== null]), [[true, false], [false, true], [true, false], [false, true]]);
    assert.equal(sonra.govde.islem?.geriAlinabilir, false);
    const ikinci = await geriAl('yazan', t.govde.islem);
    assert.deepEqual([ikinci.govde.geriAlinan, ikinci.govde.atlanan.length], [0, 2]);
  });

  test('LCA-16 geri al yalnız son işlemi çözer; kodsuz firmada kod yeniden boşalır, gönderim durumu önceki değere döner; pasife alma engeli olan firma atlanır, aktif kalır', async () => {
    const ilk = await firmaKur({ kod: 'LCF.F1', ad: 'LCF Önceki işlem' });
    // Ekleme kodu otomatik verir; kodu boş eski kayıt (göçten ya da eski düzenden kalan) elle kurulur.
    const yeni = await firmaKur({ kod: null, ad: 'LCF Kodsuz' });
    const kodsuz = { id: yeni.id, surum: (await vt().tek<{ surum: number }>('UPDATE musteri_tedarikci_firma SET kod = NULL, surum = surum + 1 WHERE id = $1 RETURNING surum', [yeni.id]))!.surum };
    logodakiler = [cari('LCF.001', { logoKayitNo: 1601 }), cari('LCF.002', { logoKayitNo: 1602 }), cari('LCF.003', { logoKayitNo: 1603 })];
    await kartlar('yazan', ['LCF.001', 'LCF.002', 'LCF.003']);
    const t0 = await toplu('yazan', { bagla: [{ logoKodu: 'LCF.001', firmaId: ilk.id, surum: ilk.surum }], al: [] });
    assert.equal(t0.govde.sonuclar[0]?.tamam, true, JSON.stringify(t0.govde));
    const gonderim = (id: number) => vt().tek<{ d: string | null }>('SELECT logo_gonderim_durumu AS d FROM musteri_tedarikci_firma WHERE id = $1', [id]);
    const onceGonderim = (await gonderim(kodsuz.id))?.d ?? null;
    const t1 = await toplu('yazan', { bagla: [{ logoKodu: 'LCF.002', firmaId: kodsuz.id, surum: kodsuz.surum }], al: [{ logoKodu: 'LCF.003' }] });
    assert.deepEqual(t1.govde.sonuclar.map((x) => x.tamam), [true, true], JSON.stringify(t1.govde));
    assert.equal((await gonderim(kodsuz.id))?.d, 'gonderildi');
    const engelli = t1.govde.sonuclar[1]!.firma!.id;
    firmaPasifEngeliKaydet(async (db, id, k) => (id === engelli ? 'ORN açık finans kaydı var.' : finansFirmaPasifEngeli(db, id, k)));
    try {
      const g = await geriAl('yazan', t1.govde.islem);
      assert.equal(g.durum, 200, JSON.stringify(g.govde));
      assert.deepEqual([g.govde.geriAlinan, g.govde.atlanan.map((a) => [a.logoKodu, a.neden])], [1, [['LCF.003', 'ORN açık finans kaydı var.']]]);
    } finally {
      firmaPasifEngeliKaydet(finansFirmaPasifEngeli);
    }
    const durum = await vt().sorgu<{ id: number; kod: string | null; aktif: boolean; logo_kayit_no: number | null; logo_gonderim_durumu: string | null }>(
      'SELECT id, kod, aktif, logo_kayit_no, logo_gonderim_durumu FROM musteri_tedarikci_firma WHERE id = ANY($1::int[]) ORDER BY id',
      [[ilk.id, kodsuz.id, engelli]],
    );
    assert.deepEqual(durum.map((f) => [f.kod, f.aktif, f.logo_kayit_no, f.logo_gonderim_durumu]), [
      ['LCF.001', true, 1601, 'gonderildi'], [null, true, null, onceGonderim], ['LCF.003', true, 1603, 'gonderildi'],
    ]);
  });

  test('LCA-15 iz tablosu kısıtları: başarılı satır firmasız, reddedilen satır nedensiz, bağlama öncesiz yazılmaz', async () => {
    const kisi = (await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'yazan'"))!.id;
    const firma = await firmaKur({ kod: 'LCE.F1', ad: 'LCE Firma' });
    const yaz = (sira: number, tur: string, tamam: boolean, firmaId: number | null, ileti: string | null, onceki: string | null) => vt().sorgu(
      `INSERT INTO musteri_tedarikci_logo_gecis_izi (islem, sira, tur, logo_kodu, tamam, firma_id, ileti, firma_surumu, onceki, kisi_id)
       VALUES ('00000000-0000-4000-8000-0000000000e1', $1, $2, 'LCE.001', $3, $4, $5, $6, $7::jsonb, $8)`,
      [sira, tur, tamam, firmaId, ileti, firmaId === null ? null : 1, onceki, kisi],
    );
    await assert.rejects(yaz(0, 'al', true, null, null, null), /musteri_tedarikci_logo_gecis_izi_butun/);
    await assert.rejects(yaz(0, 'al', false, null, null, null), /musteri_tedarikci_logo_gecis_izi_butun/);
    await assert.rejects(yaz(0, 'bagla', true, firma.id, null, null), /musteri_tedarikci_logo_gecis_izi_onceki/);
    await assert.rejects(yaz(0, 'al', true, firma.id, null, '{}'), /musteri_tedarikci_logo_gecis_izi_onceki/);
    await assert.rejects(yaz(0, 'sil', false, null, 'x', null), /musteri_tedarikci_logo_gecis_izi_tur/);
    await yaz(0, 'al', true, firma.id, null, null);
    await yaz(1, 'al', false, null, 'Reddedildi.', null);
    await assert.rejects(yaz(1, 'al', false, null, 'Yine.', null), /musteri_tedarikci_logo_gecis_izi_satir/);
  });
});
