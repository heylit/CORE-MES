import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Firma, FirmaCevabi, FirmaListesiCevabi, LogoCariAramaCevabi, LogoCariCevabi, LogodanFirmaAlGovdesi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { logoCariCozuculeriKaydet } from './disari.ts';
import type { LogoCariBilgisi, LogoCariSonucu } from './disari.ts';
import { LOGO_CARI_BELLEK_MS } from './kurallar.ts';
import { logoCariSaatiKur } from './servis.ts';

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

  test('LCA-6 bağlama yalnız Logo alanlarını yazar; bağlı, başka cari kodlu ve eski sürümlü firma bağlanmaz', async () => {
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
    assert.deepEqual([b.kod, b.ad, b.il, b.logoCariKodu, b.logoKayitNo, b.logoGonderimDurumu, b.surum], ['LCA6.TMI', 'LCA6 Firma', 'TMI İli', 'LCA6.001', 601, 'gonderildi', f.surum + 1]);
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
});
