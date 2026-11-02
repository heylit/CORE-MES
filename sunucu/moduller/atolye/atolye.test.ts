import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type {
  AramaCevabi, MerkezKrokileriCevabi, FabrikaCevabi, FabrikaKayitCevabi, GozlerCevabi, IhlalAyrintisi, KayitCevabi, Kroki, KrokiCevabi, Model, ModelParcaCevabi, ModellerCevabi, KalemGorunumleriCevabi, GozKalemi, GozKalemleriCevabi, RotaCevabi, SalonOzeti,
  SalonlarCevabi,
  MalzemeModelleriCevabi, YerlesmemisIstasyonlarCevabi, MerkezModeliBaglaCevabi, MerkezModelleriCevabi, SurumCakismasi, YerlesimCevabi, YerlesimGovdesi,
} from '#paylasilan/sozlesme/atolye.ts';
import { MODEL_PARCA_BAYT } from '#paylasilan/sozlesme/atolye.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { kaydaBagla, kaydaBagliBelgeler } from '../belge-merkezi/disari.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { istasyonYerleri } from './disari.ts';
import { uclar } from './uclar.ts';

const PAROLA = 'dogru-parola-1';

interface Cevap<T = unknown> { durum: number; govde: T }
interface HataGovdesi { kod: string; mesaj: string; ayrinti?: unknown }

describe('atolye (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let operator = '';
  let planlamaci = '';
  let gorur = '';
  let muhasebeci = '';
  let yoneticiId = 0;
  let isMerkeziId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function istek<T = unknown>(cerez: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem,
      url: `/api${yol}`,
      ...(cerez ? { headers: { cookie: cerez } } : {}),
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }
  const yaz = <T = unknown>(yol: string, govde?: unknown) => istek<T>(yonetici, 'POST', yol, govde);
  const oku = <T = unknown>(yol: string) => istek<T>(yonetici, 'GET', yol);

  let sayac = 0;
  const yeniKod = (onek: string): string => `${onek}${(sayac += 1)}`;
  const ilkGoz = async (rafId: number, bolme = 1, kat = 1): Promise<number> =>
    (await vt().tek<{ id: number }>('SELECT id FROM atolye_goz WHERE raf_id = $1 AND bolme = $2 AND kat = $3 ORDER BY goz LIMIT 1', [rafId, bolme, kat]))?.id ?? 0;

  async function istasyonKur(ek: Record<string, unknown> = {}): Promise<{ id: number; kod: string; surum: number }> {
    const c = await yaz<{ id: number; kod: string; surum: number }>('/istasyonlar', { kod: yeniKod('CNC-'), ad: 'Deneme Tezgahı', isMerkeziId, ...ek });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde;
  }

  async function salonKur(ek: Record<string, unknown> = {}): Promise<SalonOzeti> {
    const c = await yaz<SalonOzeti>('/atolye/salonlar', { kod: yeniKod('SALON'), ad: 'Deneme Salonu', genislik: 40, derinlik: 24, hucreBoyu: 4, ...ek });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde;
  }

  const bosYerlesim = (s: SalonOzeti, ek: Partial<YerlesimGovdesi> = {}): YerlesimGovdesi => ({
    surum: s.surum,
    salon: { kod: s.kod, ad: s.ad, genislik: Number(s.genislik), derinlik: Number(s.derinlik), hucreBoyu: Number(s.hucreBoyu), giris: null },
    istasyonYerleri: [],
    raflar: [],
    alanlar: [],
    duvarlar: [],
    ...ek,
  });

  const raf = (ek: Record<string, unknown> = {}) => ({
    id: null as number | null, kod: yeniKod('R'), ad: 'Palet rafı', tur: 'palet' as const, bolmeSayisi: 3, katSayisi: 4, gozSayisi: 2,
    bolmeGenisligi: 2.7, derinlik: 1.1, yukseklik: 5, x: 10, z: 3, donus: 0, aktif: true, ...ek,
  });

  const kaydet = (salonId: number, govde: YerlesimGovdesi, cerez = yonetici) =>
    istek<KayitCevabi & HataGovdesi>(cerez, 'POST', `/atolye/salonlar/${salonId}/yerlesim-kaydet`, govde);

  async function girisliKisiEkle(kullaniciAdi: string, rolId: number): Promise<number> {
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!yoneticiRolu) throw new Error('yönetici rolü yok');
    return vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, id, rolId);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
      return id;
    });
  }

  // En küçük geçerli GLB 2.0: başlık, JSON parçası ve isteğe bağlı BIN parçası (sıfır dolgu; büyük dosyada çok parça).
  function glb(binBoyu = 0): Buffer {
    const metin = Buffer.from(JSON.stringify({ asset: { version: '2.0' } }));
    const json = Buffer.concat([metin, Buffer.alloc((4 - (metin.length % 4)) % 4, 0x20)]);
    const bin = Buffer.alloc(binBoyu + ((4 - (binBoyu % 4)) % 4));
    const parca = (tur: number, veri: Buffer) => {
      const b = Buffer.alloc(8);
      b.writeUInt32LE(veri.length, 0);
      b.writeUInt32LE(tur, 4);
      return Buffer.concat([b, veri]);
    };
    const govde = Buffer.concat([parca(0x4e4f534a, json), ...(binBoyu > 0 ? [parca(0x004e4942, bin)] : [])]);
    const bas = Buffer.alloc(12);
    bas.write('glTF', 0, 'ascii');
    bas.writeUInt32LE(2, 4);
    bas.writeUInt32LE(12 + govde.length, 8);
    return Buffer.concat([bas, govde]);
  }
  const ozet = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const parcala = (b: Buffer): Buffer[] => {
    const p: Buffer[] = [];
    for (let i = 0; i < b.length; i += MODEL_PARCA_BAYT) p.push(b.subarray(i, i + MODEL_PARCA_BAYT));
    return p;
  };
  const modelBaslat = (dosya: Buffer, ek: Record<string, unknown> = {}, cerez = yonetici) =>
    istek<Model & HataGovdesi>(cerez, 'POST', '/atolye/modeller', {
      ad: 'Deneme modeli', birim: 'mm', yukari: 'z', donus: 0, sigdir: true, kaynakBicim: 'step',
      boyutBayt: dosya.length, ozet: ozet(dosya), ucgenSayisi: 12, ...ek,
    });
  async function modelYukle(dosya: Buffer): Promise<Model> {
    const m = await modelBaslat(dosya);
    assert.equal(m.durum, 200, JSON.stringify(m.govde));
    for (const [sira, p] of parcala(dosya).entries()) {
      const c = await yaz(`/atolye/modeller/${m.govde.id}/parca-yaz`, { sira, veri: p.toString('base64') });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
    }
    const t = await yaz<Model>(`/atolye/modeller/${m.govde.id}/tamamla`);
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    return t.govde;
  }

  // Uydurma PDF (sunucu yalnız imzayı, boyu ve özeti denetler; içerik okunmaz). Büyük dosyada çok parça.
  const pdf = (dolgu = 0): Buffer => Buffer.concat([Buffer.from('%PDF-1.4\n% uydurma kroki\n'), Buffer.alloc(dolgu, 0x20), Buffer.from('\n%%EOF\n')]);
  const krokiBaslat = (salonId: number, dosya: Buffer, ek: Record<string, unknown> = {}, cerez = yonetici) =>
    istek<Kroki & HataGovdesi>(cerez, 'POST', `/atolye/salonlar/${salonId}/kroki`, { ad: 'Deneme krokisi', boyutBayt: dosya.length, ozet: ozet(dosya), sayfa: 1, ...ek });
  async function krokiYukle(salonId: number, dosya: Buffer): Promise<Kroki> {
    assert.equal((await krokiBaslat(salonId, dosya)).durum, 200);
    for (const [sira, p] of parcala(dosya).entries()) {
      const c = await yaz(`/atolye/salonlar/${salonId}/kroki/parca-yaz`, { sira, veri: p.toString('base64') });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
    }
    const t = await yaz<Kroki>(`/atolye/salonlar/${salonId}/kroki/tamamla`);
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    return t.govde;
  }


  // Çizim Merkezi'nde yayında kroki belgesi (merkezin kendi uçlarıyla; atölye testi merkez tablolarına yazmaz).
  async function merkezKomutu<T>(yol: string, govde: unknown): Promise<Cevap<T>> {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: yonetici, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
    return { durum: c.statusCode, govde: c.json() as T };
  }
  interface MerkezBelgesi { id: number; surum: number; revizyonlar: { id: number; harf: string }[] }
  async function merkezDosyasi(icerik: Buffer): Promise<string> {
    const o = ozet(icerik);
    const parcalar = parcala(icerik);
    for (const [sira, p] of parcalar.entries()) {
      const c = await merkezKomutu(`/dosyalar/${o}/parca`, { sira, toplam: parcalar.length, veri: p.toString('base64') });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
    }
    return o;
  }
  async function merkezKrokisiAc(icerik: Buffer, ad = 'Merkez krokisi'): Promise<number> {
    const b = await merkezKomutu<MerkezBelgesi>('/cizimler', { ad, tur: 'kroki', ozet: await merkezDosyasi(icerik), dosyaAdi: 'kroki.pdf' });
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    const y = await merkezKomutu(`/cizimler/${b.govde.id}/revizyonlar/${b.govde.revizyonlar[0]?.id}/yayinla`, { surum: b.govde.surum });
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    return b.govde.id;
  }
  async function merkezRevizyonYayinla(belgeId: number, icerik: Buffer): Promise<void> {
    const b = (await oku<MerkezBelgesi>(`/cizimler/${belgeId}`)).govde;
    const r = await merkezKomutu<MerkezBelgesi>(`/cizimler/${belgeId}/revizyon-ekle`, { ozet: await merkezDosyasi(icerik), dosyaAdi: 'kroki-b.pdf', surum: b.surum });
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    const yeni = r.govde.revizyonlar.find((x) => x.harf === 'B');
    assert.equal((await merkezKomutu(`/cizimler/${belgeId}/revizyonlar/${yeni?.id}/yayinla`, { surum: r.govde.surum })).durum, 200);
  }

  const ihlalKurallari = (c: Cevap<HataGovdesi>): string[] => ((c.govde.ayrinti as IhlalAyrintisi | undefined)?.ihlaller ?? []).map((i) => i.kural);

  before(async () => {
    ortam = await testVeritabaniKur('atolye');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const operatorRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'");
    // Hiçbir göç bir role atolye.yaz vermiyor (çekirdek isteği): bayraksız yazan için geçici rol kurulur.
    const yazanRol = await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_atolye', 'Geçici Atölye') RETURNING id");
    if (!operatorRolu || !yazanRol) throw new Error('rol kurulamadı');
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'atolye.yaz')", [yazanRol.id]);
    await girisliKisiEkle('operator1', operatorRolu.id);
    await girisliKisiEkle('planlamaci1', yazanRol.id);
    // Okuma sayfa yetkisiyle açılır: yalnız sayfa.atolye taşıyan rol ve sayfası olmayan bir yerleşik rol.
    const gorenRol = await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('gecici_atolye_goren', 'Geçici Atölye Gören') RETURNING id");
    const muhasebeRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'muhasebe_finans'");
    if (!gorenRol || !muhasebeRolu) throw new Error('rol kurulamadı');
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'sayfa.atolye')", [gorenRol.id]);
    await girisliKisiEkle('atolyegoren1', gorenRol.id);
    await girisliKisiEkle('muhasebeci1', muhasebeRolu.id);
    yonetici = await girisCerezi('yonetici');
    operator = await girisCerezi('operator1');
    planlamaci = await girisCerezi('planlamaci1');
    gorur = await girisCerezi('atolyegoren1');
    muhasebeci = await girisCerezi('muhasebeci1');
    const im = await yaz<{ id: number }>('/is-merkezleri', { kod: 'IM-ATOLYE', ad: 'Deneme Merkezi' });
    isMerkeziId = im.govde.id;
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('yetki: okuma uçları sayfa.atolye ya da atolye.yaz ister; her yazma ucu atolye.yaz ister, işlemi olmayan 403 alır ve kayıt değişmez', async () => {
    const s = await salonKur();
    const r = await kaydet(s.id, bosYerlesim(s, { raflar: [raf()] }));
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    const rafId = r.govde.raflar[0]?.id ?? 0;
    const okumalar = ['/atolye/salonlar', `/atolye/salonlar/${s.id}`, '/atolye/arama?metin=R', `/atolye/raflar/${rafId}/gozler`, `/atolye/salonlar/${s.id}/rota?basX=1&basZ=1&hedefX=5&hedefZ=5`];
    for (const yol of okumalar) {
      assert.equal((await istek(null, 'GET', yol)).durum, 401, yol);
      assert.equal((await istek(muhasebeci, 'GET', yol)).durum, 403, yol);
      assert.equal((await istek(gorur, 'GET', yol)).durum, 200, yol);
      assert.equal((await istek(planlamaci, 'GET', yol)).durum, 200, yol);
    }

    for (const yol of ['/atolye/modeller', '/atolye/kalem-gorunumleri', '/atolye/goz-kalemleri', `/atolye/goz-kalemleri?salonId=${s.id}`, `/atolye/salonlar/${s.id}/kroki`, '/atolye/fabrika', '/atolye/fabrika/kroki']) {
      assert.equal((await istek(null, 'GET', yol)).durum, 401, yol);
      assert.equal((await istek(muhasebeci, 'GET', yol)).durum, 403, yol);
      assert.equal((await istek(gorur, 'GET', yol)).durum, 200, yol);
      assert.equal((await istek(planlamaci, 'GET', yol)).durum, 200, yol);
    }
    const dosya = glb();
    const krokiDosyasi = pdf();
    const yetkiBelgesi = await merkezKrokisiAc(pdf(3), 'Yetki merkez krokisi');
    const krokiSurumu = async () => (await oku<KrokiCevabi>(`/atolye/salonlar/${s.id}/kroki`)).govde.kroki?.surum ?? 0;
    const fabrikaKrokiSurumu = async () => (await oku<KrokiCevabi>('/atolye/fabrika/kroki')).govde.kroki?.surum ?? 0;
    const fabrikaGovdesi = async () => {
      const b = (await oku<FabrikaCevabi>('/atolye/fabrika')).govde.bolumler.find((x) => x.salon.id === s.id);
      if (!b) throw new Error('bölüm yok');
      return {
        bolumler: [{
          salonId: s.id, fabrika: { x: Number(b.salon.fabrika.x), z: Number(b.salon.fabrika.z), donus: Number(b.salon.fabrika.donus) },
          yerlesim: bosYerlesim({ ...s, surum: b.salon.surum }, { raflar: b.raflar.map((x) => ({ ...raf(), id: x.id, kod: x.kod })) }),
        }],
      };
    };
    const yuklenen = (await modelBaslat(dosya)).govde;
    const silinecek = (await modelBaslat(dosya)).govde;
    const modelSurumu = async () => (await oku<ModellerCevabi>('/atolye/modeller')).govde.modeller.find((m) => m.id === yuklenen.id)?.surum ?? 0;

    const yerliIstasyon = await istasyonKur();
    const ms = await salonKur();
    assert.equal((await kaydet(ms.id, bosYerlesim(ms, { istasyonYerleri: [{ istasyonId: yerliIstasyon.id, x: 5, z: 5, donus: 0, genislik: 3, derinlik: 2 }] }))).durum, 200);
    const guncel = (await oku<YerlesimCevabi>(`/atolye/salonlar/${s.id}`)).govde;
    const yazilar: { uc: string; yol: string; govde: () => unknown | Promise<unknown> }[] = [
      { uc: '/atolye/salonlar', yol: '/atolye/salonlar', govde: () => ({ kod: yeniKod('YT'), ad: 'Yetki', genislik: 10, derinlik: 10, hucreBoyu: 2 }) },
      {
        uc: '/atolye/salonlar/:id/yerlesim-kaydet', yol: `/atolye/salonlar/${s.id}/yerlesim-kaydet`,
        govde: () => bosYerlesim({ ...s, surum: guncel.salon.surum }, { raflar: guncel.raflar.map((x) => ({ ...raf(), id: x.id, kod: x.kod })) }),
      },
      {
        uc: '/atolye/salonlar/:id/hucre-ata', yol: `/atolye/salonlar/${s.id}/hucre-ata`,
        govde: async () => ({ surum: (await oku<YerlesimCevabi>(`/atolye/salonlar/${s.id}`)).govde.salon.surum, hucre: 'A1', atama: { tur: 'alan', alanTuru: 'hurda' } }),
      },
      {
        uc: '/atolye/modeller', yol: '/atolye/modeller',
        govde: () => ({ ad: 'Yetki', birim: 'm', yukari: 'y', donus: 0, sigdir: true, kaynakBicim: 'glb', boyutBayt: dosya.length, ozet: ozet(dosya), ucgenSayisi: 0 }),
      },
      { uc: '/atolye/modeller/:id/parca-yaz', yol: `/atolye/modeller/${yuklenen.id}/parca-yaz`, govde: () => ({ sira: 0, veri: dosya.toString('base64') }) },
      { uc: '/atolye/modeller/:id/tamamla', yol: `/atolye/modeller/${yuklenen.id}/tamamla`, govde: () => undefined },
      {
        uc: '/atolye/modeller/:id/ayarla', yol: `/atolye/modeller/${yuklenen.id}/ayarla`,
        govde: async () => ({ surum: await modelSurumu(), ad: 'Yeni ad', birim: 'cm', yukari: 'y', donus: 90, sigdir: false }),
      },
      { uc: '/atolye/modeller/:id/sil', yol: `/atolye/modeller/${silinecek.id}/sil`, govde: () => undefined },
      { uc: '/atolye/kalem-gorunumleri/yaz', yol: '/atolye/kalem-gorunumleri/yaz', govde: () => ({ kod: 'YETKI-K', modelId: yuklenen.id, ambalaj: 'koli', rafta: 'model' }) },
      { uc: '/atolye/kalem-gorunumleri/sil', yol: '/atolye/kalem-gorunumleri/sil', govde: () => ({ kod: 'YETKI-K' }) },
      { uc: '/atolye/goz-kalemleri/yaz', yol: '/atolye/goz-kalemleri/yaz', govde: async () => ({ gozId: await ilkGoz(rafId), kod: 'YETKI-G', ad: 'Yetki', doluluk: 10 }) },
      {
        uc: '/atolye/goz-kalemleri/sil', yol: '/atolye/goz-kalemleri/sil',
        govde: async () => ({ id: (await oku<GozKalemleriCevabi>(`/atolye/goz-kalemleri?salonId=${s.id}`)).govde.kalemler[0]?.id ?? 999999 }),
      },
      {
        uc: '/atolye/salonlar/:id/kroki', yol: `/atolye/salonlar/${s.id}/kroki`,
        govde: () => ({ ad: 'Yetki krokisi', boyutBayt: krokiDosyasi.length, ozet: ozet(krokiDosyasi), sayfa: 1 }),
      },
      { uc: '/atolye/salonlar/:id/kroki/parca-yaz', yol: `/atolye/salonlar/${s.id}/kroki/parca-yaz`, govde: () => ({ sira: 0, veri: krokiDosyasi.toString('base64') }) },
      { uc: '/atolye/salonlar/:id/kroki/tamamla', yol: `/atolye/salonlar/${s.id}/kroki/tamamla`, govde: () => undefined },
      {
        uc: '/atolye/salonlar/:id/kroki/hizala', yol: `/atolye/salonlar/${s.id}/kroki/hizala`,
        govde: async () => ({ surum: await krokiSurumu(), sayfa: 1, olcek: 0.0353, donus: 0, x: 0, z: 0 }),
      },
      { uc: '/atolye/salonlar/:id/kroki/sil', yol: `/atolye/salonlar/${s.id}/kroki/sil`, govde: () => undefined },
      { uc: '/atolye/salonlar/:id/kroki/merkezden', yol: `/atolye/salonlar/${s.id}/kroki/merkezden`, govde: () => ({ belgeId: yetkiBelgesi }) },
      { uc: '/atolye/istasyonlar/:id/merkez-modeli-bagla', yol: `/atolye/istasyonlar/${yerliIstasyon.id}/merkez-modeli-bagla`, govde: () => ({ belgeId: null, beklenen: null }) },
      { uc: '/atolye/fabrika/kaydet', yol: '/atolye/fabrika/kaydet', govde: fabrikaGovdesi },
      { uc: '/atolye/fabrika/kroki', yol: '/atolye/fabrika/kroki', govde: () => ({ ad: 'Fabrika', boyutBayt: krokiDosyasi.length, ozet: ozet(krokiDosyasi), sayfa: 1 }) },
      { uc: '/atolye/fabrika/kroki/parca-yaz', yol: '/atolye/fabrika/kroki/parca-yaz', govde: () => ({ sira: 0, veri: krokiDosyasi.toString('base64') }) },
      { uc: '/atolye/fabrika/kroki/tamamla', yol: '/atolye/fabrika/kroki/tamamla', govde: () => undefined },
      { uc: '/atolye/fabrika/kroki/hizala', yol: '/atolye/fabrika/kroki/hizala', govde: async () => ({ surum: await fabrikaKrokiSurumu(), sayfa: 1, olcek: 0.0353, donus: 0, x: 0, z: 0 }) },
      { uc: '/atolye/fabrika/kroki/sil', yol: '/atolye/fabrika/kroki/sil', govde: () => undefined },
    ];
    assert.deepEqual(yazilar.map((y) => y.uc).sort(), uclar.filter((u) => u.yontem !== 'GET').map((u) => u.yol).sort());
    const durum = async () => ({
      salonlar: (await oku('/atolye/salonlar')).govde, yerlesim: (await oku(`/atolye/salonlar/${s.id}`)).govde, modeller: (await oku('/atolye/modeller')).govde,
      parca: (await vt().tek('SELECT count(*)::int AS n FROM atolye_model_parca'))?.valueOf(),
      kalemler: (await oku('/atolye/kalem-gorunumleri')).govde,
      gozKalemleri: (await oku('/atolye/goz-kalemleri')).govde,
      kroki: (await oku(`/atolye/salonlar/${s.id}/kroki`)).govde,
      krokiParca: (await vt().tek('SELECT count(*)::int AS n FROM atolye_kroki_parca'))?.valueOf(),
      fabrikaKroki: (await oku('/atolye/fabrika/kroki')).govde,
    });
    for (const { uc, yol, govde } of yazilar) {
      const once = await durum();
      assert.equal((await istek(null, 'POST', yol, await govde())).durum, 401, uc);
      const red = await istek<HataGovdesi>(operator, 'POST', yol, await govde());
      assert.equal(red.durum, 403, uc);
      assert.equal(red.govde.kod, 'YETKI_YOK', uc);
      assert.deepEqual(await durum(), once, uc);
      const kabul = await istek(planlamaci, 'POST', yol, await govde());
      assert.ok([200, 204].includes(kabul.durum), `${uc}: ${kabul.durum} ${JSON.stringify(kabul.govde)}`);
    }
  });

  test('ATL-01 salon ölçüsü ve hücre boyu sınırda kabul, dışında red; veritabanı da reddeder', async () => {
    assert.equal((await yaz('/atolye/salonlar', { kod: yeniKod('S'), ad: 'Sınır', genislik: 5, derinlik: 500, hucreBoyu: 1 })).durum, 200);
    assert.equal((await yaz('/atolye/salonlar', { kod: yeniKod('S'), ad: 'Büyük', genislik: 501, derinlik: 20, hucreBoyu: 4 })).durum, 400);
    assert.equal((await yaz('/atolye/salonlar', { kod: yeniKod('S'), ad: 'Hücre', genislik: 20, derinlik: 20, hucreBoyu: 0.5 })).durum, 400);
    await assert.rejects(
      vt().sorgu("INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, kaydeden_kisi_id) VALUES ('ZZ', 'Z', 600, 10, 4, $1)", [yoneticiId]),
      (h: { constraint?: string }) => h.constraint === 'atolye_salon_olcusu',
    );
    await assert.rejects(
      vt().sorgu("INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, kaydeden_kisi_id) VALUES ('ZZ', 'Z', 20, 10, 60, $1)", [yoneticiId]),
      (h: { constraint?: string }) => h.constraint === 'atolye_salon_hucre_boyu',
    );
  });

  test('salon kodu büyük harfe çevrilir ve tektir', async () => {
    const kod = yeniKod('kucuk');
    const c = await yaz<SalonOzeti>('/atolye/salonlar', { kod, ad: 'Küçük', genislik: 10, derinlik: 10, hucreBoyu: 2 });
    assert.equal(c.govde.kod, kod.toUpperCase());
    const tekrar = await yaz<HataGovdesi>('/atolye/salonlar', { kod: kod.toUpperCase(), ad: 'Tekrar', genislik: 10, derinlik: 10, hucreBoyu: 2 });
    assert.equal(tekrar.durum, 409);
  });

  test('yerleşim kaydı: istasyon, raf, oda, duvar ve giriş yazılır; hücre, makine, kaydeden ve gözler döner', async () => {
    const s = await salonKur();
    const ist = await istasyonKur();
    await yaz('/makineler', { kod: yeniKod('MK-'), ad: 'Dik İşleme', tur: 'dik isleme', markaModel: 'Deneme 500', istasyonId: ist.id });
    const govde = bosYerlesim(s, {
      salon: { ...bosYerlesim(s).salon, giris: { x: 1, z: 12 } },
      istasyonYerleri: [{ istasyonId: ist.id, x: 6.123, z: 9, donus: -90, genislik: 3, derinlik: 2 }],
      raflar: [raf({ kod: 'r9' })],
      alanlar: [
        { tur: 'oda', ad: 'Kalite odası', x: 30, z: 18, donus: 0, genislik: 8, derinlik: 6, kapi: { kenar: 'on', ofset: -1, genislik: 1.2 } },
        { tur: 'yuruyus_yolu', ad: 'Ana yol', x: 20, z: 12, donus: 0, genislik: 40, derinlik: 2.5, kapi: null },
      ],
      duvarlar: [{ basX: 0.5, basZ: 22, sonX: 15, sonZ: 22, kalinlik: 0.2, cam: true }],
    });
    const c = await kaydet(s.id, govde);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    // Başka modüle açılan yer okuması: bölüm verilirse yalnız o bölüm; ondalıklar yerleşim cevabındaki gibi metin.
    assert.deepEqual(await istasyonYerleri(vt(), s.id), [{ istasyonId: ist.id, salonId: s.id, x: '6.12', z: '9.00' }]);
    assert.ok((await istasyonYerleri(vt())).some((x) => x.istasyonId === ist.id && x.salonId === s.id));
    const y = c.govde;
    assert.equal(y.salon.surum, s.surum + 1);
    assert.equal(y.salon.kaydeden.ad, 'Deneme Yönetici');
    assert.deepEqual(y.salon.giris, { x: '1.00', z: '12.00' });
    assert.deepEqual(y.salon.sutunlar.at(-1), 'J');
    const yer = y.istasyonYerleri[0];
    assert.equal(yer?.kod, ist.kod);
    assert.equal(yer?.x, '6.12');
    assert.equal(yer?.donus, '270.0');
    assert.equal(yer?.hucre, 'B3');
    assert.equal(yer?.makineler[0]?.markaModel, 'Deneme 500');
    assert.equal(y.raflar[0]?.kod, 'R9');
    assert.equal(y.raflar[0]?.genislik, '8.10');
    assert.equal(y.alanlar.find((a) => a.tur === 'oda')?.kapi?.kenar, 'on');
    assert.equal(y.duvarlar[0]?.cam, true);
    assert.deepEqual(y.uyarilar.map((u) => u.kural), []);
    const gozler = await oku<GozlerCevabi>(`/atolye/raflar/${y.raflar[0]?.id ?? 0}/gozler`);
    assert.equal(gozler.govde.toplam, 24);
    assert.equal(gozler.govde.satirlar[0]?.adres, 'R9-01-1-1');
    // Okuma aynı yerleşimi döner.
    const okunan = (await oku<YerlesimCevabi>(`/atolye/salonlar/${s.id}`)).govde;
    const { uyarilar: _uyarilar, ...kaydedilen } = y;
    assert.deepEqual(okunan, kaydedilen);
  });

  test('ATL-16 eski sürümden gelen kayıt 409 alır; ayrıntı kimin ne zaman kaydettiğini söyler', async () => {
    const s = await salonKur();
    assert.equal((await kaydet(s.id, bosYerlesim(s), planlamaci)).durum, 200);
    const eski = await kaydet(s.id, bosYerlesim(s));
    assert.equal(eski.durum, 409);
    const ayrinti = eski.govde.ayrinti as SurumCakismasi;
    assert.equal(ayrinti.guncelSurum, s.surum + 1);
    assert.equal(ayrinti.kaydeden.ad, 'Deneme planlamaci1');
    // Veritabanı da sürümü yalnız birer artırır.
    await assert.rejects(
      vt().sorgu('UPDATE atolye_salon SET surum = surum + 2 WHERE id = $1', [s.id]),
      (h: { constraint?: string }) => h.constraint === 'atolye_salon_surum_sirasi',
    );
  });

  test('ATL-07 çakışan öğe 422 alır ve hiçbir şey yazılmaz; öğe anahtarları döner', async () => {
    const s = await salonKur();
    const a = await istasyonKur();
    const b = await istasyonKur();
    const c = await kaydet(s.id, bosYerlesim(s, {
      istasyonYerleri: [
        { istasyonId: a.id, x: 5, z: 5, donus: 0, genislik: 3, derinlik: 2 },
        { istasyonId: b.id, x: 6, z: 5, donus: 0, genislik: 3, derinlik: 2 },
      ],
    }));
    assert.equal(c.durum, 422);
    assert.deepEqual(ihlalKurallari(c), ['ATL-07']);
    assert.deepEqual((c.govde.ayrinti as IhlalAyrintisi).ihlaller[0]?.ogeler.sort(), [`istasyon:${a.id}`, `istasyon:${b.id}`].sort());
    const okunan = (await oku<YerlesimCevabi>(`/atolye/salonlar/${s.id}`)).govde;
    assert.equal(okunan.istasyonYerleri.length, 0);
    assert.equal(okunan.salon.surum, s.surum);
  });

  test('ATL-06 salonun dışına taşan öğe reddedilir; veritabanı da (işlem sonunda) reddeder', async () => {
    const s = await salonKur({ genislik: 20, derinlik: 10 });
    const ist = await istasyonKur();
    const c = await kaydet(s.id, bosYerlesim(s, { istasyonYerleri: [{ istasyonId: ist.id, x: 19.5, z: 5, donus: 0, genislik: 3, derinlik: 2 }] }));
    assert.deepEqual(ihlalKurallari(c), ['ATL-06']);
    assert.equal((await kaydet(s.id, bosYerlesim(s, { istasyonYerleri: [{ istasyonId: ist.id, x: 10, z: 5, donus: 0, genislik: 3, derinlik: 2 }] }))).durum, 200);
    await assert.rejects(
      vt().tx((db) => db.sorgu('UPDATE atolye_istasyon_yeri SET x = 19.9 WHERE istasyon_id = $1', [ist.id])),
      (h: { constraint?: string }) => h.constraint === 'atolye_salon_icinde',
    );
    // ATL-08: öğesi dışarıda kalacak salon küçültülemez (kural ve veritabanı).
    const kucuk = await kaydet(s.id, bosYerlesim({ ...s, surum: s.surum + 1, genislik: '8.00' }, {
      istasyonYerleri: [{ istasyonId: ist.id, x: 10, z: 5, donus: 0, genislik: 3, derinlik: 2 }],
    }));
    assert.deepEqual(ihlalKurallari(kucuk), ['ATL-06']);
    await assert.rejects(
      vt().tx((db) => db.sorgu('UPDATE atolye_salon SET genislik = 8, surum = surum + 1 WHERE id = $1', [s.id])),
      (h: { constraint?: string }) => h.constraint === 'atolye_salon_icinde',
    );
  });

  test('ATL-04, ATL-05, ATL-17: istasyonun tek yeri; pasif istasyon yeni yerleştirilmez, yerleşik pasifin yeri kalır ve aramada çıkmaz', async () => {
    const s1 = await salonKur();
    const s2 = await salonKur();
    const ist = await istasyonKur();
    const yerGovdesi = { istasyonId: ist.id, x: 5, z: 5, donus: 0, genislik: 3, derinlik: 2 };
    assert.equal((await kaydet(s1.id, bosYerlesim(s1, { istasyonYerleri: [yerGovdesi] }))).durum, 200);
    assert.deepEqual(ihlalKurallari(await kaydet(s2.id, bosYerlesim(s2, { istasyonYerleri: [yerGovdesi] }))), ['ATL-04']);
    await assert.rejects(
      vt().sorgu('INSERT INTO atolye_istasyon_yeri (istasyon_id, salon_id, x, z, donus, genislik, derinlik) VALUES ($1, $2, 5, 5, 0, 3, 2)', [ist.id, s2.id]),
      (h: { code?: string }) => h.code === '23505',
    );

    const pasif = await istasyonKur({ aktif: false });
    assert.deepEqual(ihlalKurallari(await kaydet(s2.id, bosYerlesim(s2, { istasyonYerleri: [{ ...yerGovdesi, istasyonId: pasif.id }] }))), ['ATL-05']);
    assert.deepEqual(ihlalKurallari(await kaydet(s2.id, bosYerlesim(s2, { istasyonYerleri: [{ ...yerGovdesi, istasyonId: 999999 }] }))), ['ATL-05']);

    assert.equal((await yaz(`/istasyonlar/${ist.id}/guncelle`, { kod: ist.kod, ad: 'Deneme Tezgahı', isMerkeziId, aktif: false, surum: ist.surum })).durum, 200);
    const yeniden = await kaydet(s1.id, bosYerlesim({ ...s1, surum: s1.surum + 1 }, { istasyonYerleri: [{ ...yerGovdesi, x: 8 }] }));
    assert.equal(yeniden.durum, 200, JSON.stringify(yeniden.govde));
    assert.equal(yeniden.govde.istasyonYerleri[0]?.aktif, false);
    const arama = await oku<AramaCevabi>(`/atolye/arama?metin=${encodeURIComponent(ist.kod)}`);
    assert.equal(arama.govde.sonuclar.some((r) => r.tur === 'istasyon' && r.kimlik === ist.id), false);
  });

  test('ATL-09 raf kodu bütün salonlarda tektir; aynı kayıtta iki raf kodlarını değişebilir', async () => {
    const s1 = await salonKur();
    const s2 = await salonKur();
    const kod = yeniKod('Q');
    assert.equal((await kaydet(s1.id, bosYerlesim(s1, { raflar: [raf({ kod })] }))).durum, 200);
    const tekrar = await kaydet(s2.id, bosYerlesim(s2, { raflar: [raf({ kod: kod.toLowerCase() })] }));
    assert.equal(tekrar.durum, 409);
    assert.match(tekrar.govde.mesaj, new RegExp(kod));
    await assert.rejects(
      vt().sorgu("INSERT INTO atolye_raf (salon_id, kod, ad, tur, bolme_sayisi, kat_sayisi, goz_sayisi, bolme_genisligi, derinlik, yukseklik, x, z, donus) VALUES ($1, 'R-1', 'x', 'palet', 1, 1, 1, 1, 1, 1, 5, 5, 0)", [s2.id]),
      (h: { constraint?: string }) => h.constraint === 'atolye_raf_kod_bicimi',
    );

    const s3 = await salonKur();
    const ilk = await kaydet(s3.id, bosYerlesim(s3, { raflar: [raf({ kod: 'XA' }), raf({ kod: 'XB', z: 10 })] }));
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    const [a, b] = ilk.govde.raflar;
    const takas = await kaydet(s3.id, bosYerlesim({ ...s3, surum: s3.surum + 1 }, {
      raflar: [raf({ id: a?.id, kod: 'XB', z: 3 }), raf({ id: b?.id, kod: 'XA', z: 10 })],
    }));
    assert.equal(takas.durum, 200, JSON.stringify(takas.govde));
    assert.deepEqual(takas.govde.raflar.map((r) => [r.id, r.kod]).sort(), [[a?.id, 'XB'], [b?.id, 'XA']].sort());
  });

  test('ATL-10 ve ATL-11: raf sayı sınırları veritabanında da korunur; göz rafın ölçüsünü aşmaz', async () => {
    const s = await salonKur();
    const c = await kaydet(s.id, bosYerlesim(s, { raflar: [raf({ kod: yeniKod('G'), bolmeSayisi: 2, katSayisi: 2, gozSayisi: 1 })] }));
    const rafId = c.govde.raflar[0]?.id ?? 0;
    assert.equal((await kaydet(s.id, bosYerlesim({ ...s, surum: s.surum + 1 }, { raflar: [raf({ id: rafId, kod: 'GG', bolmeSayisi: 100 })] }))).durum, 400);
    await assert.rejects(
      vt().sorgu('UPDATE atolye_raf SET kat_sayisi = 11 WHERE id = $1', [rafId]),
      (h: { constraint?: string }) => h.constraint === 'atolye_raf_sayilari',
    );
    await assert.rejects(
      vt().tx((db) => db.sorgu('INSERT INTO atolye_goz (raf_id, bolme, kat, goz) VALUES ($1, 3, 1, 1)', [rafId])),
      (h: { constraint?: string }) => h.constraint === 'atolye_goz_rafta',
    );
  });

  test('ATL-33 kat kat net ölçü kaydedilir ve geri döner; tutarsız ölçü kurala, eksik dizi kısıta takılır', async () => {
    const s = await salonKur();
    const net = { katSayisi: 3, katYukseklikleri: [1.6, 1.4, 1.2], gozGenisligi: 1.25, gozDerinligi: 1.05 };
    const c = await kaydet(s.id, bosYerlesim(s, { raflar: [raf({ kod: yeniKod('N'), ...net })] }));
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const r = c.govde.raflar[0];
    assert.deepEqual([r?.katYukseklikleri, r?.gozGenisligi, r?.gozDerinligi], [['1.60', '1.40', '1.20'], '1.25', '1.05']);

    const s2 = await salonKur();
    const red = await kaydet(s2.id, bosYerlesim(s2, { raflar: [raf({ kod: yeniKod('N'), ...net, katYukseklikleri: [1.6, 1.4] })] }));
    assert.equal(red.durum, 422);
    assert.deepEqual(ihlalKurallari(red), ['ATL-33']);
    const genis = await kaydet(s2.id, bosYerlesim(s2, { raflar: [raf({ kod: yeniKod('N'), ...net, gozGenisligi: 1.5 })] }));
    assert.deepEqual([genis.durum, ihlalKurallari(genis)], [422, ['ATL-33']]);

    await assert.rejects(
      vt().sorgu("UPDATE atolye_raf SET kat_yukseklikleri = '{1,1}' WHERE id = $1", [r?.id]),
      (h: { constraint?: string }) => h.constraint === 'atolye_raf_kat_yukseklikleri',
    );
  });

  test('ATL-12 raf küçülünce dışarıda kalan gözler silinir; bağlı kayıt varsa komut reddedilir', async () => {
    const s = await salonKur();
    const kod = yeniKod('K');
    const c = await kaydet(s.id, bosYerlesim(s, { raflar: [raf({ kod, bolmeSayisi: 3, katSayisi: 2, gozSayisi: 1 })] }));
    const rafId = c.govde.raflar[0]?.id ?? 0;
    assert.equal((await oku<GozlerCevabi>(`/atolye/raflar/${rafId}/gozler`)).govde.toplam, 6);
    const bolme2 = (await oku<GozlerCevabi>(`/atolye/raflar/${rafId}/gozler?bolme=2`)).govde;
    assert.deepEqual([bolme2.toplam, bolme2.satirlar.map((g) => g.adres)], [2, [`${kod}-02-1-1`, `${kod}-02-2-1`]]);
    const kucul = await kaydet(s.id, bosYerlesim({ ...s, surum: s.surum + 1 }, { raflar: [raf({ id: rafId, kod, bolmeSayisi: 2, katSayisi: 2, gozSayisi: 1 })] }));
    assert.equal(kucul.durum, 200, JSON.stringify(kucul.govde));
    assert.equal((await oku<GozlerCevabi>(`/atolye/raflar/${rafId}/gozler`)).govde.toplam, 4);

    // Göze bağlanacak ileriki kayıt (stok) yerine fikstür tablosu: yalnız sahibin kimliğiyle kurulur.
    if (!ortam) throw new Error('ortam yok');
    await ortam.sahip.sorgu('CREATE TABLE deneme_goz_bagi (goz_id int NOT NULL REFERENCES atolye_goz)');
    const goz = await vt().tek<{ id: number }>('SELECT id FROM atolye_goz WHERE raf_id = $1 AND bolme = 2 AND kat = 2', [rafId]);
    await ortam.sahip.sorgu('INSERT INTO deneme_goz_bagi (goz_id) VALUES ($1)', [goz?.id]);
    const red = await kaydet(s.id, bosYerlesim({ ...s, surum: s.surum + 2 }, { raflar: [raf({ id: rafId, kod, bolmeSayisi: 1, katSayisi: 2, gozSayisi: 1 })] }));
    assert.equal(red.durum, 409);
    assert.equal(red.govde.kod, 'BAGIMLI_KAYIT');
    assert.equal((await oku<GozlerCevabi>(`/atolye/raflar/${rafId}/gozler`)).govde.toplam, 4);
  });

  test('ATL-13 raf silinmez, pasife alınır; pasif raf aramada çıkmaz; veritabanı da silmeyi reddeder', async () => {
    const s = await salonKur();
    const kod = yeniKod('P');
    const c = await kaydet(s.id, bosYerlesim(s, { raflar: [raf({ kod })] }));
    const rafId = c.govde.raflar[0]?.id ?? 0;
    assert.deepEqual(ihlalKurallari(await kaydet(s.id, bosYerlesim({ ...s, surum: s.surum + 1 }))), ['ATL-13']);
    assert.equal((await oku<AramaCevabi>(`/atolye/arama?metin=${kod}`)).govde.sonuclar.length, 1);
    const pasif = await kaydet(s.id, bosYerlesim({ ...s, surum: s.surum + 1 }, { raflar: [raf({ id: rafId, kod, aktif: false })] }));
    assert.equal(pasif.durum, 200);
    assert.equal(pasif.govde.raflar[0]?.aktif, false);
    assert.equal((await oku<AramaCevabi>(`/atolye/arama?metin=${kod}`)).govde.sonuclar.length, 0);
    await assert.rejects(
      vt().sorgu('DELETE FROM atolye_raf WHERE id = $1', [rafId]),
      (h: { constraint?: string }) => h.constraint === 'atolye_raf_silinmez',
    );
  });

  test('ATL-14, ATL-15: arama tam göz adresini öne alır, Türkçe harf ayırmaz; sonuç salon ve hücreyi taşır', async () => {
    const s = await salonKur();
    const kod = yeniKod('M');
    const c = await kaydet(s.id, bosYerlesim(s, {
      raflar: [raf({ kod, x: 10, z: 3 })],
      alanlar: [{ tur: 'karantina', ad: 'Şüpheli Ürün Alanı', x: 30, z: 20, donus: 0, genislik: 4, derinlik: 3, kapi: null }],
    }));
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const tam = await oku<AramaCevabi>(`/atolye/arama?metin=${kod.toLowerCase()}-02-3-1`);
    assert.equal(tam.govde.sonuclar[0]?.tur, 'goz');
    assert.equal(tam.govde.sonuclar[0]?.etiket, `${kod}-02-3-1`);
    assert.equal(tam.govde.sonuclar[0]?.salon.kod, s.kod);
    assert.equal(tam.govde.sonuclar[0]?.hucre, 'C1');
    const bolme = await oku<AramaCevabi>(`/atolye/arama?metin=${kod}-03&salonId=${s.id}`);
    assert.equal(bolme.govde.sonuclar.filter((r) => r.tur === 'goz').length, 8);
    const turkce = await oku<AramaCevabi>('/atolye/arama?metin=supheli');
    assert.equal(turkce.govde.sonuclar[0]?.etiket, 'Şüpheli Ürün Alanı');
    assert.equal(turkce.govde.sonuclar[0]?.hucre, 'H6');
    assert.equal((await oku('/atolye/arama?metin=')).durum, 400);
  });

  test('ATL-20 rota girişten başlar, katı öğeden geçmez; giriş yoksa ve başlangıç verilmezse null', async () => {
    const s = await salonKur({ genislik: 20, derinlik: 12 });
    const ist = await istasyonKur();
    const govde = bosYerlesim(s, {
      salon: { ...bosYerlesim(s).salon, giris: { x: 1, z: 6 } },
      istasyonYerleri: [{ istasyonId: ist.id, x: 10, z: 6, donus: 0, genislik: 2, derinlik: 8 }],
    });
    assert.equal((await kaydet(s.id, { ...govde, salon: { ...govde.salon, giris: null } })).durum, 200);
    assert.equal((await oku<RotaCevabi>(`/atolye/salonlar/${s.id}/rota?hedefX=18&hedefZ=6`)).govde.rota, null);
    assert.equal((await kaydet(s.id, { ...govde, surum: s.surum + 1 })).durum, 200);
    const r = (await oku<RotaCevabi>(`/atolye/salonlar/${s.id}/rota?hedefX=18&hedefZ=6`)).govde.rota;
    assert.ok(r);
    assert.deepEqual(r.noktalar[0], { x: 1.25, z: 6.25 });
    assert.ok(r.noktalar.some((n) => n.z < 1.8 || n.z > 10.2), 'rota istasyonun etrafından dolaşmalı');
    assert.equal((await oku(`/atolye/salonlar/${s.id}/rota?basX=1&hedefX=18&hedefZ=6`)).durum, 400);
    assert.equal((await oku('/atolye/salonlar/999999/rota?hedefX=1&hedefZ=1')).durum, 404);
    // Salon dışındaki hedef ya da başlangıç kenara kadar yürütülmez: 422 ve nedeni.
    const disari = await oku<{ mesaj: string }>(`/atolye/salonlar/${s.id}/rota?hedefX=500&hedefZ=6`);
    assert.equal(disari.durum, 422);
    assert.match(disari.govde.mesaj, /Hedef noktası bu bölümün dışında/);
    assert.equal((await oku(`/atolye/salonlar/${s.id}/rota?basX=-50&basZ=1&hedefX=18&hedefZ=6`)).durum, 422);
  });

  test('ATL-21 kapı yalnız odada olur ve kenarın içinde kalır (kural ve veritabanı)', async () => {
    const s = await salonKur();
    const c = await kaydet(s.id, bosYerlesim(s, {
      alanlar: [{ tur: 'bolge', ad: 'Bölge', x: 10, z: 10, donus: 0, genislik: 4, derinlik: 3, kapi: { kenar: 'on', ofset: 0, genislik: 1 } }],
    }));
    assert.deepEqual(ihlalKurallari(c), ['ATL-21']);
    await assert.rejects(
      vt().sorgu("INSERT INTO atolye_alan (salon_id, tur, ad, x, z, donus, genislik, derinlik, kapi_kenari, kapi_ofseti, kapi_genisligi) VALUES ($1, 'oda', 'O', 10, 10, 0, 4, 3, 'on', 1.8, 1)", [s.id]),
      (h: { constraint?: string }) => h.constraint === 'atolye_alan_kapi_kenarda',
    );
  });

  test('ATL-34 geçişler türüyle yazılır ve döner; kenardan taşan ve üst üste binen reddedilir; geçiş gönderilmeyen kayıt geçişleri korur; veritabanı türü denetler', async () => {
    const s = await salonKur();
    const gecisler = [
      { tur: 'kepenk' as const, kenar: 'arka' as const, ofset: -5.004, genislik: 4 },
      { tur: 'acik' as const, kenar: 'sag' as const, ofset: 0, genislik: 3 },
      { tur: 'kapi' as const, kenar: 'arka' as const, ofset: 10, genislik: 1 },
    ];
    const c = await kaydet(s.id, bosYerlesim(s, { gecisler }));
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(c.govde.gecisler.map(({ id: _i, ...g }) => g), [
      { tur: 'kepenk', kenar: 'arka', ofset: '-5.00', genislik: '4.00' },
      { tur: 'acik', kenar: 'sag', ofset: '0.00', genislik: '3.00' },
      { tur: 'kapi', kenar: 'arka', ofset: '10.00', genislik: '1.00' },
    ]);

    // Geçiş gönderilmezse kayıtlı geçişler kalır.
    const c2 = await kaydet(s.id, bosYerlesim({ ...s, surum: c.govde.salon.surum }));
    assert.equal(c2.durum, 200, JSON.stringify(c2.govde));
    assert.equal(c2.govde.gecisler.length, 3);

    // Sağ kenar 24 m: ofset 11 + 1,5 taşar; arka kenarda iki geçiş üst üste.
    const red = await kaydet(s.id, bosYerlesim({ ...s, surum: c2.govde.salon.surum }, {
      gecisler: [
        { tur: 'acik', kenar: 'sag', ofset: 11, genislik: 3 },
        { tur: 'kepenk', kenar: 'arka', ofset: 0, genislik: 4 },
        { tur: 'yangin_kapisi', kenar: 'arka', ofset: 1.5, genislik: 1.2 },
      ],
    }));
    assert.deepEqual(ihlalKurallari(red), ['ATL-34', 'ATL-34']);
    assert.deepEqual((red.govde.ayrinti as IhlalAyrintisi).ihlaller.map((b) => b.ogeler), [['gecis:0'], ['gecis:1', 'gecis:2']]);

    // Bölüm küçülünce kayıtlı geçiş kenardan taşarsa (geçiş gönderilmese de) reddedilir.
    const kucuk = await kaydet(s.id, bosYerlesim({ ...s, surum: c2.govde.salon.surum, genislik: '20.00' }));
    assert.deepEqual(ihlalKurallari(kucuk), ['ATL-34']);

    const bos = await kaydet(s.id, bosYerlesim({ ...s, surum: c2.govde.salon.surum }, { gecisler: [] }));
    assert.equal(bos.durum, 200, JSON.stringify(bos.govde));
    assert.deepEqual(bos.govde.gecisler, []);

    await assert.rejects(
      vt().sorgu("INSERT INTO atolye_gecis (salon_id, tur, kenar, ofset, genislik) VALUES ($1, 'pencere', 'on', 0, 2)", [s.id]),
      (h: { constraint?: string }) => h.constraint === 'atolye_gecis_turu',
    );
  });

  test('alan kimliği kayıtta korunur (stok konumu alana bağlıdır); kimliksiz eklenir, listede olmayan silinir; aynı kimlik iki kez reddedilir; raf 10 kat olabilir', async () => {
    const s = await salonKur();
    const kabul = { tur: 'kabul' as const, ad: 'Mal kabul alanı', x: 20, z: 12, donus: 0, genislik: 6, derinlik: 4, kapi: null };
    const zemin = { tur: 'depo_zemini' as const, ad: 'Depo zemini', x: 30, z: 12, donus: 0, genislik: 4, derinlik: 3, kapi: null };
    const onRaf = raf({ katSayisi: 10 });
    const c = await kaydet(s.id, bosYerlesim(s, { alanlar: [kabul, zemin], raflar: [onRaf] }));
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const [a1, a2] = c.govde.alanlar;
    assert.ok(a1 && a2);
    assert.equal(c.govde.raflar[0]?.katSayisi, 10);

    // Birinci alan taşınır, ikincisi kaldırılır, yeni alan eklenir: birincinin kimliği aynı kalır.
    const c2 = await kaydet(s.id, bosYerlesim({ ...s, surum: c.govde.salon.surum }, {
      alanlar: [{ ...kabul, id: a1.id, x: 22 }, { ...kabul, ad: 'İkinci kabul', z: 18 }],
      raflar: [{ ...onRaf, id: c.govde.raflar[0]?.id ?? null }],
    }));
    assert.equal(c2.durum, 200, JSON.stringify(c2.govde));
    assert.deepEqual(c2.govde.alanlar.map((a) => [a.id === a1.id, a.ad, a.x]), [[true, 'Mal kabul alanı', '22.00'], [false, 'İkinci kabul', '20.00']]);
    assert.equal(c2.govde.alanlar.some((a) => a.id === a2.id), false);

    const iki = await kaydet(s.id, bosYerlesim({ ...s, surum: c2.govde.salon.surum }, {
      alanlar: [{ ...kabul, id: a1.id }, { ...zemin, id: a1.id }],
      raflar: [{ ...onRaf, id: c.govde.raflar[0]?.id ?? null }],
    }));
    assert.equal(iki.durum, 422, JSON.stringify(iki.govde));
    assert.equal(iki.govde.mesaj, 'Bir alan kayıtta iki kez geçiyor.');
  });

  test('ATL-23 kayıt denetim kaydına düşer; salon listesi sürümle döner', async () => {
    const s = await salonKur();
    assert.equal((await kaydet(s.id, bosYerlesim(s))).durum, 200);
    const iz = await vt().tek<{ sayi: number }>(
      "SELECT count(*)::int AS sayi FROM denetim_kaydi WHERE yol = '/atolye/salonlar/:id/yerlesim-kaydet' AND kisi_id = $1",
      [yoneticiId],
    );
    assert.ok((iz?.sayi ?? 0) >= 1);
    const liste = await oku<SalonlarCevabi>('/atolye/salonlar');
    assert.equal(liste.govde.salonlar.find((x) => x.id === s.id)?.surum, s.surum + 1);
    assert.equal((await oku('/atolye/salonlar/999999')).durum, 404);
  });

  test('ATL-25 model parça parça yüklenir; sıra, parça boyu, eksik parça, bozuk dosya ve özet reddedilir; veritabanı da reddeder', async () => {
    const dosya = glb(MODEL_PARCA_BAYT + 1000);
    const parcalar = parcala(dosya);
    assert.equal(parcalar.length, 2);
    assert.equal((await modelBaslat(dosya, { boyutBayt: 10 })).durum, 400);
    assert.equal((await modelBaslat(dosya, { ozet: 'abc' })).durum, 400);
    const m = (await modelBaslat(dosya)).govde;
    assert.equal(m.parcaSayisi, 2);
    assert.equal(m.tamam, false);
    const yol = `/atolye/modeller/${m.id}`;
    assert.equal((await yaz(`${yol}/parca-yaz`, { sira: 2, veri: 'AAAA' })).durum, 422);
    assert.equal((await yaz(`${yol}/parca-yaz`, { sira: 1, veri: 'AAAA' })).durum, 422, 'son parça boyu');
    assert.equal((await yaz(`${yol}/parca-yaz`, { sira: 0, veri: parcalar[1]?.toString('base64') })).durum, 422, 'ilk parça tam boy olmalı');
    assert.equal((await yaz(`${yol}/parca-yaz`, { sira: 0, veri: parcalar[0]?.toString('base64') })).durum, 200);
    const eksik = await yaz<HataGovdesi>(`${yol}/tamamla`);
    assert.equal(eksik.durum, 422);
    assert.match(eksik.govde.mesaj, /eksik/);
    assert.equal((await oku(`${yol}/parcalar/0`)).durum, 404, 'tamamlanmamış model okunmaz');
    // Bozuk ikinci parça: boyu doğru, içeriği farklı -> özet tutmaz.
    const bozuk = Buffer.from(parcalar[1] ?? Buffer.alloc(0));
    bozuk[bozuk.length - 1] = 7;
    assert.equal((await yaz(`${yol}/parca-yaz`, { sira: 1, veri: bozuk.toString('base64') })).durum, 200);
    const ozetsiz = await yaz<HataGovdesi>(`${yol}/tamamla`);
    assert.equal(ozetsiz.durum, 422);
    assert.match(ozetsiz.govde.mesaj, /özeti/);
    await assert.rejects(
      vt().sorgu('UPDATE atolye_model SET tamam = true, surum = surum + 1 WHERE id = $1', [m.id]),
      (h: { constraint?: string }) => h.constraint === 'atolye_model_dosyasi',
    );
    // Aynı sıra yeniden gönderilince üzerine yazılır (kopan bağlantı).
    assert.equal((await yaz(`${yol}/parca-yaz`, { sira: 1, veri: parcalar[1]?.toString('base64') })).durum, 200);
    const tamam = await yaz<Model>(`${yol}/tamamla`);
    assert.equal(tamam.durum, 200, JSON.stringify(tamam.govde));
    assert.equal(tamam.govde.tamam, true);
    const geri = await Promise.all([0, 1].map(async (i) => Buffer.from((await oku<ModelParcaCevabi>(`${yol}/parcalar/${i}`)).govde.veri, 'base64')));
    assert.ok(Buffer.concat(geri).equals(dosya));
    assert.equal((await oku(`${yol}/parcalar/2`)).durum, 404);

    // GLB olmayan dosya: özet tutsa da başlık tutmaz.
    const sahte = Buffer.from('solid deneme\nendsolid deneme\n');
    const s2 = (await modelBaslat(sahte)).govde;
    assert.equal((await yaz(`/atolye/modeller/${s2.id}/parca-yaz`, { sira: 0, veri: sahte.toString('base64') })).durum, 200);
    const glbDegil = await yaz<HataGovdesi>(`/atolye/modeller/${s2.id}/tamamla`);
    assert.equal(glbDegil.durum, 422);
    assert.match(glbDegil.govde.mesaj, /GLB/);
  });

  test('ATL-26 tamamlanmış modelin dosyası değişmez; ayarı sürümle değişir, eski sürüm 409 alır', async () => {
    const m = await modelYukle(glb());
    const yol = `/atolye/modeller/${m.id}`;
    const ikinci = await yaz<HataGovdesi>(`${yol}/parca-yaz`, { sira: 0, veri: glb().toString('base64') });
    assert.equal(ikinci.durum, 409);
    await assert.rejects(
      vt().sorgu("UPDATE atolye_model_parca SET veri = '\\x00'::bytea WHERE model_id = $1", [m.id]),
      (h: { constraint?: string }) => h.constraint === 'atolye_model_degismez',
    );
    await assert.rejects(
      vt().sorgu('UPDATE atolye_model SET boyut_bayt = boyut_bayt + 4, surum = surum + 1 WHERE id = $1', [m.id]),
      (h: { constraint?: string }) => ['atolye_model_degismez', 'atolye_model_parca_sayisi'].includes(h.constraint ?? ''),
    );
    const ayar = { ad: 'Dik işleme modeli', birim: 'cm' as const, yukari: 'y' as const, donus: -90, sigdir: false };
    const a = await yaz<Model>(`${yol}/ayarla`, { surum: m.surum, ...ayar });
    assert.equal(a.durum, 200, JSON.stringify(a.govde));
    assert.equal(a.govde.donus, '270.0');
    assert.equal(a.govde.birim, 'cm');
    assert.equal(a.govde.surum, m.surum + 1);
    assert.equal((await yaz(`${yol}/ayarla`, { surum: m.surum, ...ayar })).durum, 409);
  });

  test('ATL-24 istasyona yalnız tamamlanmış model atanır; yerleşim modeli ve ayarını döner; ATL-27 kullanılan model silinmez', async () => {
    const s = await salonKur();
    const ist = await istasyonKur();
    const yarim = (await modelBaslat(glb())).govde;
    const tam = await modelYukle(glb(100));
    const yer = (modelId: number | null) => ({ istasyonId: ist.id, x: 5, z: 5, donus: 0, genislik: 3, derinlik: 2, modelId });
    const red = await kaydet(s.id, bosYerlesim(s, { istasyonYerleri: [yer(yarim.id)] }));
    assert.equal(red.durum, 422, JSON.stringify(red.govde));
    assert.deepEqual(ihlalKurallari(red), ['ATL-24']);
    const kabul = await kaydet(s.id, bosYerlesim(s, { istasyonYerleri: [yer(tam.id)] }));
    assert.equal(kabul.durum, 200, JSON.stringify(kabul.govde));
    const model = kabul.govde.istasyonYerleri[0]?.model;
    assert.equal(model?.id, tam.id);
    assert.equal(model?.birim, 'mm');
    assert.equal(model?.yukari, 'z');
    assert.equal(model?.parcaSayisi, 1);
    await assert.rejects(
      vt().sorgu('UPDATE atolye_istasyon_yeri SET model_id = $1 WHERE istasyon_id = $2', [yarim.id, ist.id]),
      (h: { constraint?: string }) => h.constraint === 'atolye_istasyon_modeli',
    );
    const liste = (await oku<ModellerCevabi>('/atolye/modeller')).govde.modeller;
    assert.equal(liste.find((m) => m.id === tam.id)?.kullanim, 1);
    const silRed = await yaz<HataGovdesi>(`/atolye/modeller/${tam.id}/sil`);
    assert.equal(silRed.durum, 409);
    assert.equal(silRed.govde.kod, 'BAGIMLI_KAYIT');
    await assert.rejects(vt().sorgu('DELETE FROM atolye_model WHERE id = $1', [tam.id]), (h: { code?: string }) => h.code === '23503');
    // Model kaldırılınca (modelId verilmeden) istasyon tipinden çizilir; model artık silinebilir.
    const guncel = (await oku<YerlesimCevabi>(`/atolye/salonlar/${s.id}`)).govde;
    const { modelId: _m, ...modelsiz } = yer(null);
    const kaldir = await kaydet(s.id, bosYerlesim({ ...s, surum: guncel.salon.surum }, { istasyonYerleri: [modelsiz] }));
    assert.equal(kaldir.durum, 200, JSON.stringify(kaldir.govde));
    assert.equal(kaldir.govde.istasyonYerleri[0]?.model, null);
    assert.equal((await yaz(`/atolye/modeller/${tam.id}/sil`)).durum, 204);
    assert.equal((await yaz(`/atolye/modeller/${yarim.id}/sil`)).durum, 204, 'yarım yükleme silinir, parçaları da');
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM atolye_model_parca WHERE model_id = ANY($1::int[])', [[tam.id, yarim.id]]))?.n, 0);
  });
  test('ATL-28 koda tek görünüm bağlanır; boşluk ve harf büyüklüğü ayırmaz; model tamamlanmış olmalı; rafta model gösterimi model ister; bağlı model silinmez', async () => {
    const tam = await modelYukle(glb(120));
    const diger = await modelYukle(glb(140));
    const yarim = (await modelBaslat(glb())).govde;
    const kod = yeniKod('pr ç');
    const yazK = (govde: Record<string, unknown>) => yaz<KalemGorunumleriCevabi>('/atolye/kalem-gorunumleri/yaz', govde);
    const bul = (c: KalemGorunumleriCevabi) => c.kalemler.filter((k) => k.kod.replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR') === kod.toLocaleUpperCase('tr-TR'));
    assert.equal((await yazK({ kod, modelId: yarim.id, ambalaj: 'otomatik', rafta: 'paket' })).durum, 422, 'tamamlanmamış model bağlanmaz');
    assert.equal((await yazK({ kod, modelId: 999999, ambalaj: 'otomatik', rafta: 'paket' })).durum, 404);
    assert.equal((await yazK({ kod: '   ', modelId: tam.id, ambalaj: 'otomatik', rafta: 'paket' })).durum, 400);
    assert.equal((await yazK({ kod, modelId: null, ambalaj: 'koli', rafta: 'model' })).durum, 400, 'rafta model gösterimi model ister');
    assert.equal((await yazK({ kod, modelId: null, ambalaj: 'otomatik', rafta: 'paket' })).durum, 400, 'boş görünüm yazılmaz');
    assert.equal((await yazK({ kod, modelId: null, ambalaj: 'sandik', rafta: 'paket' })).durum, 400);
    const ilk = await yazK({ kod: `  ${kod}  `, modelId: tam.id, ambalaj: 'otomatik', rafta: 'paket' });
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    assert.equal(bul(ilk.govde)[0]?.model?.id, tam.id);
    // Aynı kod başka yazımla: tek kayıt kalır, görünüm değişir.
    const ikinci = await yazK({ kod: kod.toLocaleUpperCase('tr-TR').replace(' ', '   '), modelId: diger.id, ambalaj: 'kasa', rafta: 'model' });
    assert.equal(ikinci.durum, 200);
    assert.equal(bul(ikinci.govde).length, 1);
    assert.deepEqual({ ...bul(ikinci.govde)[0], kod: '' }, { kod: '', malzeme: null, model: bul(ikinci.govde)[0]?.model ?? null, ambalaj: 'kasa', rafta: 'model' });
    assert.equal(bul(ikinci.govde)[0]?.model?.id, diger.id);
    // Yalnız ambalaj: model olmadan da görünüm olur.
    const paket = await yazK({ kod: yeniKod('MLZ'), modelId: null, ambalaj: 'demet', rafta: 'paket' });
    assert.equal(paket.durum, 200, JSON.stringify(paket.govde));
    const liste = (await oku<ModellerCevabi>('/atolye/modeller')).govde.modeller;
    assert.equal(liste.find((m) => m.id === diger.id)?.kalemKodlari.length, 1);
    const silRed = await yaz<HataGovdesi>(`/atolye/modeller/${diger.id}/sil`);
    assert.equal(silRed.durum, 409);
    assert.equal(silRed.govde.kod, 'BAGIMLI_KAYIT');
    await assert.rejects(vt().sorgu('DELETE FROM atolye_model WHERE id = $1', [diger.id]), (h: { code?: string }) => h.code === '23503');
    await assert.rejects(
      vt().sorgu("INSERT INTO atolye_kalem_gorunumu (kod_anahtari, kod, model_id, kaydeden_kisi_id) VALUES ('X1', 'X1', $1, $2)", [yarim.id, yoneticiId]),
      (h: { constraint?: string }) => h.constraint === 'atolye_kalem_gorunumu_tamam',
    );
    await assert.rejects(
      vt().sorgu("INSERT INTO atolye_kalem_gorunumu (kod_anahtari, kod, ambalaj, rafta, kaydeden_kisi_id) VALUES ('X2', 'X2', 'koli', 'model', $1)", [yoneticiId]),
      (h: { constraint?: string }) => h.constraint === 'atolye_kalem_gorunumu_model',
    );
    await assert.rejects(
      vt().sorgu("INSERT INTO atolye_kalem_gorunumu (kod_anahtari, kod, kaydeden_kisi_id) VALUES ('X3', 'X3', $1)", [yoneticiId]),
      (h: { constraint?: string }) => h.constraint === 'atolye_kalem_gorunumu_bos',
    );
    // Görünüm kaldırılınca model silinebilir.
    assert.equal((await yaz('/atolye/kalem-gorunumleri/sil', { kod })).durum, 200);
    assert.equal((await yaz(`/atolye/modeller/${diger.id}/sil`)).durum, 204);
  });
  test('ATL-29 göze kalem atanır; aynı kalem tek satır; toplam doluluk %100 aşılmaz; pasif rafa atanmaz; atanmış göz raf küçülünce silinmez', async () => {
    const s = await salonKur();
    const kod = yeniKod('G');
    const c = await kaydet(s.id, bosYerlesim(s, { raflar: [raf({ kod, bolmeSayisi: 2, katSayisi: 2, gozSayisi: 1 })] }));
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const rafId = c.govde.raflar[0]?.id ?? 0;
    const goz = await ilkGoz(rafId, 2, 2);
    const yazG = (govde: Record<string, unknown>) => yaz<GozKalemi>('/atolye/goz-kalemleri/yaz', govde);
    assert.equal((await yazG({ gozId: goz, kod: 'MLZ-1', ad: 'Deneme cıvata', doluluk: 0 })).durum, 400);
    assert.equal((await yazG({ gozId: goz, kod: 'MLZ-1', ad: 'Deneme cıvata', doluluk: 101 })).durum, 400);
    assert.equal((await yazG({ gozId: 999999, kod: 'MLZ-1', ad: 'Deneme cıvata', doluluk: 10 })).durum, 404);
    const ilk = await yazG({ gozId: goz, kod: ' mlz-1 ', ad: 'Deneme cıvata', doluluk: 60 });
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    assert.equal(ilk.govde.adres, `${kod}-02-2-1`);
    assert.equal(ilk.govde.raf.id, rafId);
    assert.equal(ilk.govde.salon.id, s.id);
    // Aynı kalem başka yazımla: satır güncellenir, eklenmez.
    const guncel = await yazG({ gozId: goz, kod: 'MLZ-1', ad: 'Deneme cıvata M12', doluluk: 70 });
    assert.equal(guncel.govde.id, ilk.govde.id);
    assert.equal(guncel.govde.doluluk, 70);
    const tasan = await yazG({ gozId: goz, kod: 'MLZ-2', ad: 'Deneme somun', doluluk: 40 });
    assert.equal(tasan.durum, 422);
    assert.match((tasan.govde as unknown as HataGovdesi).mesaj, /%30/);
    assert.equal((await yazG({ gozId: goz, kod: 'MLZ-2', ad: 'Deneme somun', doluluk: 30 })).durum, 200);
    const liste = (await oku<GozKalemleriCevabi>(`/atolye/goz-kalemleri?salonId=${s.id}`)).govde.kalemler;
    assert.deepEqual(liste.map((k) => [k.kod, k.doluluk]), [['MLZ-1', 70], ['MLZ-2', 30]]);
    // Veritabanı da toplamı denetler (işlem sonunda).
    await assert.rejects(
      vt().sorgu("UPDATE atolye_goz_kalemi SET doluluk = 50 WHERE kod_anahtari = 'MLZ-2' AND goz_id = $1", [goz]),
      (h: { constraint?: string }) => h.constraint === 'atolye_goz_dolulugu',
    );
    // ATL-12: atanmış göz raf küçülünce silinmez, komut 409 alır.
    const red = await kaydet(s.id, bosYerlesim({ ...s, surum: s.surum + 1 }, { raflar: [raf({ id: rafId, kod, bolmeSayisi: 1, katSayisi: 2, gozSayisi: 1 })] }));
    assert.equal(red.durum, 409);
    // Pasif rafa kalem konmaz.
    const pasif = await kaydet(s.id, bosYerlesim({ ...s, surum: s.surum + 1 }, { raflar: [raf({ id: rafId, kod, bolmeSayisi: 2, katSayisi: 2, gozSayisi: 1, aktif: false })] }));
    assert.equal(pasif.durum, 200, JSON.stringify(pasif.govde));
    assert.equal((await yazG({ gozId: await ilkGoz(rafId), kod: 'MLZ-3', ad: 'Deneme', doluluk: 10 })).durum, 422);
    assert.equal((await yaz('/atolye/goz-kalemleri/sil', { id: ilk.govde.id })).durum, 204);
    assert.equal((await yaz('/atolye/goz-kalemleri/sil', { id: ilk.govde.id })).durum, 404);
  });
  test('ATL-36 kalem kodu malzeme kartının stok koduyla eşleşirse karta bağlanır; eşleşmeyen kod serbest kalır, kayıt engellenmez', async () => {
    const sahip = ortam!.sahip;
    await sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['ATL-DNM-']);
    const kart = await sahip.tek<{ no: number; stok_kodu: string }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('atl-dnm-1', 'hammadde', 'ATL-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no, stok_kodu`,
      [JSON.stringify({ id: 'atl-dnm-1', com: { ad: 'Deneme çubuk' } }), yoneticiId],
    );
    assert.ok(kart);
    const s = await salonKur();
    const c = await kaydet(s.id, bosYerlesim(s, { raflar: [raf({ kod: yeniKod('M'), bolmeSayisi: 1, katSayisi: 1, gozSayisi: 1 })] }));
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const goz = await ilkGoz(c.govde.raflar[0]?.id ?? 0);
    // Küçük harf ve boşlukla yazılan kod da karta çözülür.
    const eslesen = await yaz<GozKalemi>('/atolye/goz-kalemleri/yaz', { gozId: goz, kod: ` ${kart.stok_kodu.toLowerCase()} `, ad: 'Elle yazılan ad', doluluk: 20 });
    assert.equal(eslesen.durum, 200, JSON.stringify(eslesen.govde));
    assert.deepEqual(eslesen.govde.malzeme, { no: kart.no, stokKodu: kart.stok_kodu, ad: 'Deneme çubuk' });
    const serbest = await yaz<GozKalemi>('/atolye/goz-kalemleri/yaz', { gozId: goz, kod: 'KARTSIZ-1', ad: 'Kartsız kalem', doluluk: 20 });
    assert.equal(serbest.durum, 200, 'eşleşmeyen kod reddedilmez');
    assert.equal(serbest.govde.malzeme, null);
    const liste = (await oku<GozKalemleriCevabi>(`/atolye/goz-kalemleri?salonId=${s.id}`)).govde.kalemler;
    assert.deepEqual(liste.map((k) => [k.kod, k.malzeme?.no ?? null]), [[kart.stok_kodu.toLowerCase(), kart.no], ['KARTSIZ-1', null]]);
    const gorunum = await yaz<KalemGorunumleriCevabi>('/atolye/kalem-gorunumleri/yaz', { kod: kart.stok_kodu, modelId: null, ambalaj: 'demet', rafta: 'paket' });
    assert.equal(gorunum.durum, 200, JSON.stringify(gorunum.govde));
    assert.equal(gorunum.govde.kalemler.find((k) => k.kod === kart.stok_kodu)?.malzeme?.no, kart.no);
    assert.equal(gorunum.govde.kalemler.find((k) => k.kod !== kart.stok_kodu && k.malzeme !== null), undefined, 'öteki kodlar karta bağlanmaz');
  });
  test('ATL-37 makinenin kendi yeri ve modeli: tek yer, aktif makine, salon içinde, çakışma; istasyonu çerçeve olur; gönderilmeyen makine yerleri kalır', async () => {
    const s = await salonKur();
    const ist = await istasyonKur();
    const mk = async (ek: Record<string, unknown> = {}) => {
      const c = await yaz<{ id: number; kod: string }>('/makineler', { kod: yeniKod('MK-'), ad: 'Deneme makinesi', istasyonId: ist.id, ...ek });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return c.govde;
    };
    const m1 = await mk({ markaModel: 'Deneme 500' });
    const m2 = await mk();
    const model = await modelYukle(glb(80));
    const istasyonYeri = { istasyonId: ist.id, x: 10, z: 10, donus: 0, genislik: 6, derinlik: 3 };
    const makineYeri = (makineId: number, x: number, ek: Record<string, unknown> = {}) => ({ makineId, x, z: 10, donus: 0, genislik: 2.5, derinlik: 2.5, ...ek });
    // Makineler kendi istasyonunun alanında durur: istasyon çerçevedir, onunla çakışma sayılmaz.
    const ilk = await kaydet(s.id, bosYerlesim(s, {
      istasyonYerleri: [istasyonYeri],
      makineYerleri: [makineYeri(m1.id, 8.5, { modelId: model.id }), makineYeri(m2.id, 11.5)],
    }));
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    assert.deepEqual(ilk.govde.makineYerleri.map((y) => [y.makineId, y.istasyon?.id, y.model?.id ?? null]), [[m1.id, ist.id, model.id], [m2.id, ist.id, null]]);
    assert.equal(ilk.govde.makineYerleri[0]?.markaModel, 'Deneme 500');
    // Gönderilmeyen makine yerleri kalır.
    const korunan = await kaydet(s.id, bosYerlesim({ ...s, surum: ilk.govde.salon.surum }, { istasyonYerleri: [istasyonYeri] }));
    assert.equal(korunan.durum, 200, JSON.stringify(korunan.govde));
    assert.equal(korunan.govde.makineYerleri.length, 2);
    const surum = korunan.govde.salon.surum;
    const red = async (makineYerleri: unknown[], kural: string, ek: Partial<YerlesimGovdesi> = {}) => {
      const c = await kaydet(s.id, bosYerlesim({ ...s, surum }, { istasyonYerleri: [istasyonYeri], makineYerleri: makineYerleri as YerlesimGovdesi['makineYerleri'], ...ek }));
      assert.equal(c.durum, 422, JSON.stringify(c.govde));
      assert.ok((c.govde as unknown as { ayrinti: IhlalAyrintisi }).ayrinti.ihlaller.some((i) => i.kural === kural), JSON.stringify(c.govde));
    };
    await red([makineYeri(m1.id, 8.5), makineYeri(m1.id, 11.5)], 'ATL-37');
    await red([makineYeri(999999, 8.5)], 'ATL-37');
    await red([makineYeri(m1.id, 39.5)], 'ATL-06');
    await red([makineYeri(m1.id, 8.5), makineYeri(m2.id, 9.5)], 'ATL-07');
    await red([makineYeri(m1.id, 10)], 'ATL-07', { raflar: [raf({ x: 10, z: 10 })] });
    // Pasif makine yeni yerleştirilmez; yerleşik pasif makinenin yeri kalır.
    const m3 = await mk();
    await ortam!.sahip.sorgu('UPDATE makine SET aktif = false WHERE id = ANY($1::int[])', [[m2.id, m3.id]]);
    await red([makineYeri(m1.id, 8.5), makineYeri(m2.id, 11.5), makineYeri(m3.id, 14.5)], 'ATL-37');
    const pasif = await kaydet(s.id, bosYerlesim({ ...s, surum }, { istasyonYerleri: [istasyonYeri], makineYerleri: [makineYeri(m1.id, 8.5), makineYeri(m2.id, 11.5)] }));
    assert.equal(pasif.durum, 200, JSON.stringify(pasif.govde));
    assert.equal(pasif.govde.makineYerleri.find((y) => y.makineId === m2.id)?.aktif, false);
    // Başka salonda yerleşik makine buraya gelmez.
    const s2 = await salonKur();
    const baska = await kaydet(s2.id, bosYerlesim(s2, { makineYerleri: [makineYeri(m1.id, 5)] }));
    assert.equal(baska.durum, 422, JSON.stringify(baska.govde));
    // Boş dizi makine yerlerini kaldırır.
    const bos = await kaydet(s.id, bosYerlesim({ ...s, surum: pasif.govde.salon.surum }, { istasyonYerleri: [istasyonYeri], makineYerleri: [] }));
    assert.equal(bos.durum, 200, JSON.stringify(bos.govde));
    assert.deepEqual(bos.govde.makineYerleri, []);
    // Veritabanı da korur: tamamlanmamış model ve salon dışı yer.
    const yarim = (await modelBaslat(glb())).govde;
    await assert.rejects(
      vt().sorgu('INSERT INTO atolye_makine_yeri (makine_id, salon_id, x, z, donus, genislik, derinlik, model_id) VALUES ($1, $2, 5, 5, 0, 2, 2, $3)', [m1.id, s.id, yarim.id]),
      (h: { constraint?: string }) => h.constraint === 'atolye_makine_modeli',
    );
    await assert.rejects(
      vt().sorgu('INSERT INTO atolye_makine_yeri (makine_id, salon_id, x, z, donus, genislik, derinlik) VALUES ($1, $2, 500, 5, 0, 2, 2)', [m1.id, s.id]),
      (h: { constraint?: string }) => h.constraint === 'atolye_salon_icinde',
    );
  });
  test('ATL-30 salonun krokisi parça parça yüklenir; PDF olmayan, eksik ve bozuk dosya reddedilir; hizalama sürümle yazılır; yeni yükleme eskisinin yerine geçer', async () => {
    const s = await salonKur();
    const yol = `/atolye/salonlar/${s.id}/kroki`;
    assert.deepEqual((await oku<KrokiCevabi>(yol)).govde, { kroki: null });
    assert.equal((await oku('/atolye/salonlar/999999/kroki')).durum, 404);
    const dosya = pdf(MODEL_PARCA_BAYT + 500);
    const parcalar = parcala(dosya);
    assert.equal(parcalar.length, 2);
    assert.equal((await krokiBaslat(s.id, dosya, { ozet: 'abc' })).durum, 400);
    assert.equal((await krokiBaslat(s.id, dosya, { sayfa: 0 })).durum, 400);
    assert.equal((await krokiBaslat(999999, dosya)).durum, 404);
    const k = (await krokiBaslat(s.id, dosya)).govde;
    assert.equal(k.parcaSayisi, 2);
    assert.equal(k.tamam, false);
    assert.equal(k.hizalama, null);
    const hiza = { surum: k.surum, sayfa: 1, olcek: 0.0352778, donus: -90, x: 1.23456, z: 2 };
    assert.equal((await yaz<HataGovdesi>(`${yol}/hizala`, hiza)).durum, 422, 'tamamlanmamış kroki hizalanmaz');
    assert.equal((await yaz(`${yol}/parca-yaz`, { sira: 2, veri: 'AAAA' })).durum, 422);
    assert.equal((await yaz(`${yol}/parca-yaz`, { sira: 0, veri: parcalar[0]?.toString('base64') })).durum, 200);
    const eksik = await yaz<HataGovdesi>(`${yol}/tamamla`);
    assert.equal(eksik.durum, 422);
    assert.match(eksik.govde.mesaj, /eksik/);
    assert.equal((await oku(`${yol}/parcalar/0`)).durum, 404, 'tamamlanmamış kroki okunmaz');
    const bozuk = Buffer.from(parcalar[1] ?? Buffer.alloc(0));
    bozuk[0] = 0x41;
    assert.equal((await yaz(`${yol}/parca-yaz`, { sira: 1, veri: bozuk.toString('base64') })).durum, 200);
    assert.match((await yaz<HataGovdesi>(`${yol}/tamamla`)).govde.mesaj, /özeti/);
    await assert.rejects(
      vt().sorgu('UPDATE atolye_kroki SET tamam = true, surum = surum + 1 WHERE salon_id = $1', [s.id]),
      (h: { constraint?: string }) => h.constraint === 'atolye_kroki_dosyasi',
    );
    assert.equal((await yaz(`${yol}/parca-yaz`, { sira: 1, veri: parcalar[1]?.toString('base64') })).durum, 200);
    const tamam = await yaz<Kroki>(`${yol}/tamamla`);
    assert.equal(tamam.durum, 200, JSON.stringify(tamam.govde));
    assert.equal(tamam.govde.tamam, true);
    const geri = await Promise.all([0, 1].map(async (i) => Buffer.from((await oku<ModelParcaCevabi>(`${yol}/parcalar/${i}`)).govde.veri, 'base64')));
    assert.ok(Buffer.concat(geri).equals(dosya));
    assert.equal((await yaz(`${yol}/parca-yaz`, { sira: 0, veri: parcalar[0]?.toString('base64') })).durum, 409);
    await assert.rejects(
      vt().sorgu("UPDATE atolye_kroki_parca SET veri = '\\x00'::bytea WHERE kroki_id = (SELECT id FROM atolye_kroki WHERE salon_id = $1)", [s.id]),
      (h: { constraint?: string }) => h.constraint === 'atolye_kroki_degismez',
    );

    // Hizalama: eski sürüm 409, sıfır ölçek 400; dönüş [0, 360) içine, konum milimetreye yuvarlanır.
    assert.equal((await yaz(`${yol}/hizala`, { ...hiza, surum: k.surum })).durum, 409);
    assert.equal((await yaz(`${yol}/hizala`, { ...hiza, surum: tamam.govde.surum, olcek: 0 })).durum, 400);
    const h = await yaz<Kroki>(`${yol}/hizala`, { ...hiza, surum: tamam.govde.surum });
    assert.equal(h.durum, 200, JSON.stringify(h.govde));
    assert.deepEqual(h.govde.hizalama, { olcek: '0.0352778000', donus: '270.00', x: '1.235', z: '2.000' });
    assert.equal(h.govde.surum, tamam.govde.surum + 1);
    await assert.rejects(
      vt().sorgu('UPDATE atolye_kroki SET hiza_x = NULL, surum = surum + 1 WHERE salon_id = $1', [s.id]),
      (h2: { constraint?: string }) => h2.constraint === 'atolye_kroki_hizalama_butun',
    );

    // PDF olmayan dosya: özet tutsa da imza tutmaz.
    const sahte = Buffer.from('bu bir pdf degil, uydurma metin');
    assert.equal((await krokiBaslat(s.id, sahte)).durum, 200);
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM atolye_kroki_parca p JOIN atolye_kroki k ON k.id = p.kroki_id WHERE k.salon_id = $1', [s.id]))?.n, 0, 'yeni yükleme eskisini siler');
    assert.equal((await oku<KrokiCevabi>(yol)).govde.kroki?.hizalama, null);
    assert.equal((await yaz(`${yol}/parca-yaz`, { sira: 0, veri: sahte.toString('base64') })).durum, 200);
    const pdfDegil = await yaz<HataGovdesi>(`${yol}/tamamla`);
    assert.equal(pdfDegil.durum, 422);
    assert.match(pdfDegil.govde.mesaj, /PDF/);

    assert.equal((await yaz(`${yol}/sil`)).durum, 204);
    assert.deepEqual((await oku<KrokiCevabi>(yol)).govde, { kroki: null });
    assert.equal((await yaz(`${yol}/sil`)).durum, 404);
    const kucuk = await krokiYukle(s.id, pdf());
    assert.equal(kucuk.parcaSayisi, 1);
  });
  test('ATL-31, ATL-32 fabrika: bölümler fabrika planında yan yana başlar; toplu kayıt yer, raf ve istasyonu bölümler arası taşır; binen bölüm, iki bölümdeki istasyon, kaybolan raf ve eski sürüm reddedilir', async () => {
    const a = await salonKur({ genislik: 20, derinlik: 12 });
    const b = await salonKur({ genislik: 15, derinlik: 12 });
    assert.ok(Number(b.fabrika.x) >= Number(a.fabrika.x) + 20 + 5, 'yeni bölüm öncekilerin sağına');
    const ist = await istasyonKur();
    const ilk = await kaydet(a.id, bosYerlesim(a, {
      raflar: [raf({ x: 5, z: 3 })],
      istasyonYerleri: [{ istasyonId: ist.id, x: 14, z: 8, donus: 0, genislik: 3, derinlik: 2 }],
    }));
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    const rafA = ilk.govde.raflar[0];
    assert.ok(rafA);
    const goz = await ilkGoz(rafA.id);
    assert.equal((await yaz('/atolye/goz-kalemleri/yaz', { gozId: goz, kod: 'DENEME-TASIMA', ad: 'Taşınan kalem', doluluk: 40 })).durum, 200);

    const fab = async () => (await oku<FabrikaCevabi>('/atolye/fabrika')).govde.bolumler;
    const bolum = async (id: number) => {
      const x = (await fab()).find((y) => y.salon.id === id);
      if (!x) throw new Error('bölüm yok');
      return x;
    };
    const govde = (x: Awaited<ReturnType<typeof bolum>>, ek: Partial<YerlesimGovdesi> = {}, konum?: { x: number; z: number; donus: number }) => ({
      salonId: x.salon.id,
      fabrika: konum ?? { x: Number(x.salon.fabrika.x), z: Number(x.salon.fabrika.z), donus: Number(x.salon.fabrika.donus) },
      yerlesim: bosYerlesim({ ...x.salon, surum: x.salon.surum } as SalonOzeti, ek),
    });
    const tumRaf = (x: Awaited<ReturnType<typeof bolum>>) => x.raflar.map((r) => ({ ...raf(), ...r, id: r.id, x: Number(r.x), z: Number(r.z), donus: Number(r.donus), bolmeGenisligi: Number(r.bolmeGenisligi), derinlik: Number(r.derinlik), yukseklik: Number(r.yukseklik), katYukseklikleri: r.katYukseklikleri?.map(Number) ?? null, gozGenisligi: r.gozGenisligi === null ? null : Number(r.gozGenisligi), gozDerinligi: r.gozDerinligi === null ? null : Number(r.gozDerinligi) }));
    const fabrikaKaydet = (bolumler: unknown[]) => yaz<FabrikaKayitCevabi & HataGovdesi>('/atolye/fabrika/kaydet', { bolumler });

    // ATL-31: B, A'nın üstüne konursa iki bölüm de işaretlenir; kenar değmesi serbest.
    const A = await bolum(a.id);
    const B = await bolum(b.id);
    const ust = await fabrikaKaydet([govde(B, {}, { x: Number(A.salon.fabrika.x) + 5, z: Number(A.salon.fabrika.z), donus: 0 })]);
    assert.equal(ust.durum, 422);
    assert.deepEqual(ihlalKurallari(ust), ['ATL-31']);
    assert.deepEqual((ust.govde.ayrinti as IhlalAyrintisi).ihlaller[0]?.ogeler, [`bolum:${b.id}`, `bolum:${a.id}`]);

    // ATL-32: istasyon iki bölümde birden; ATL-13: kayıttaki bölümün rafı hiçbir bölümde değil.
    const ikiYer = await fabrikaKaydet([
      govde(A, { raflar: tumRaf(A), istasyonYerleri: [{ istasyonId: ist.id, x: 14, z: 8, donus: 0, genislik: 3, derinlik: 2 }] }),
      govde(B, { istasyonYerleri: [{ istasyonId: ist.id, x: 4, z: 4, donus: 0, genislik: 3, derinlik: 2 }] }),
    ]);
    assert.equal(ikiYer.durum, 422);
    assert.ok(ihlalKurallari(ikiYer).includes('ATL-32'));
    const kayip = await fabrikaKaydet([govde(A), govde(B)]);
    assert.equal(kayip.durum, 422);
    assert.ok(ihlalKurallari(kayip).includes('ATL-13'));

    // Taşıma: raf (gözü ve kalemiyle) ve istasyon A'dan B'ye, B fabrika planında A'nın altına ve 90° dönük.
    // 90° dönük bölüm sol üst köşesi çevresinde döner: x aralığı [x - derinlik, x].
    const yeniKonum = { x: Number(A.salon.fabrika.x) + 12, z: Number(A.salon.fabrika.z) + 30, donus: 90 };
    const tasima = await fabrikaKaydet([
      govde(A),
      govde(B, { raflar: tumRaf(A).map((r) => ({ ...r, x: 6, z: 2 })), istasyonYerleri: [{ istasyonId: ist.id, x: 10, z: 8, donus: 0, genislik: 3, derinlik: 2 }] }, yeniKonum),
    ]);
    assert.equal(tasima.durum, 200, JSON.stringify(tasima.govde));
    const sonB = tasima.govde.bolumler.find((x) => x.salon.id === b.id);
    const sonA = tasima.govde.bolumler.find((x) => x.salon.id === a.id);
    assert.deepEqual(sonB?.salon.fabrika, { x: yeniKonum.x.toFixed(2), z: yeniKonum.z.toFixed(2), donus: '90.0' });
    assert.equal(sonB?.raflar[0]?.id, rafA.id, 'raf kimliği korunur');
    assert.equal(sonA?.raflar.length, 0);
    assert.equal(sonB?.istasyonYerleri[0]?.istasyonId, ist.id);
    assert.equal(sonA?.istasyonYerleri.length, 0);
    const kalemler = (await oku<GozKalemleriCevabi>(`/atolye/goz-kalemleri?salonId=${b.id}`)).govde.kalemler;
    assert.equal(kalemler[0]?.kod, 'DENEME-TASIMA', 'göz kalemi rafla gider');
    assert.equal(sonA?.salon.surum, A.salon.surum + 1);

    // Eski sürüm 409; hiçbir şey yazılmaz.
    const eski = await fabrikaKaydet([govde(A)]);
    assert.equal(eski.durum, 409);

    // Tek bölüm kaydı da komşuya binmez (ATL-31).
    const sonAcik = await bolum(a.id);
    const buyuk = await kaydet(a.id, { ...bosYerlesim({ ...sonAcik.salon } as SalonOzeti), salon: { ...bosYerlesim({ ...sonAcik.salon } as SalonOzeti).salon, derinlik: 40 } });
    assert.equal(buyuk.durum, 422);
    assert.deepEqual(ihlalKurallari(buyuk), ['ATL-31']);
  });

  test('ATL-30 fabrika krokisi bölüm krokisinden ayrıdır; ikisi birlikte durur, kapsamında tektir', async () => {
    const s = await salonKur();
    const f = pdf(10);
    const b = pdf(20);
    const fk = await (async () => {
      assert.equal((await yaz<Kroki>('/atolye/fabrika/kroki', { ad: 'Fabrika paftası', boyutBayt: f.length, ozet: ozet(f), sayfa: 1 })).durum, 200);
      assert.equal((await yaz('/atolye/fabrika/kroki/parca-yaz', { sira: 0, veri: f.toString('base64') })).durum, 200);
      return (await yaz<Kroki>('/atolye/fabrika/kroki/tamamla')).govde;
    })();
    assert.equal(fk.salonId, null);
    assert.equal(fk.tamam, true);
    const bk = await krokiYukle(s.id, b);
    assert.equal(bk.salonId, s.id);
    const h = await yaz<Kroki>('/atolye/fabrika/kroki/hizala', { surum: fk.surum, sayfa: 1, olcek: 0.0529, donus: 0, x: -5.08, z: -7.94 });
    assert.equal(h.durum, 200);
    assert.equal((await oku<KrokiCevabi>(`/atolye/salonlar/${s.id}/kroki`)).govde.kroki?.hizalama, null, 'bölüm krokisi etkilenmez');
    const geri = Buffer.from((await oku<ModelParcaCevabi>('/atolye/fabrika/kroki/parcalar/0')).govde.veri, 'base64');
    assert.ok(geri.equals(f));
    await assert.rejects(
      vt().sorgu("INSERT INTO atolye_kroki (salon_id, ad, boyut_bayt, parca_sayisi, ozet, kaydeden_kisi_id) VALUES (NULL, 'İkinci', 30, 1, $1, $2)", [ozet(f), yoneticiId]),
      (e: { constraint?: string }) => e.constraint === 'atolye_kroki_kapsam_tek',
    );
    assert.equal((await yaz('/atolye/fabrika/kroki/sil')).durum, 204);
    assert.deepEqual((await oku<KrokiCevabi>('/atolye/fabrika/kroki')).govde, { kroki: null });
    assert.equal((await oku<KrokiCevabi>(`/atolye/salonlar/${s.id}/kroki`)).govde.kroki?.salonId, s.id);
  });

  test('ATL-35 bölüm krokisi Çizim Merkezi\'nden alınır ve belge bölüme bağlanır; yeni revizyon uyarısı ve tazeleme hizalamayı korur; yerel yükleme ve kaldırma bağı çözer', async () => {
    const s = await salonKur();
    const yol = `/atolye/salonlar/${s.id}/kroki`;
    const a = pdf(MODEL_PARCA_BAYT + 100);
    const belge = await merkezKrokisiAc(a, 'Salon A planı');
    const liste = await oku<MerkezKrokileriCevabi>('/atolye/cizim-merkezi/krokiler');
    assert.ok(liste.govde.belgeler.some((b) => b.id === belge && b.harf === 'A' && b.ozet === ozet(a)));
    assert.equal((await istek(gorur, 'GET', '/atolye/cizim-merkezi/krokiler')).durum, 403, 'seçici düzenleyene açık');

    assert.equal((await yaz(`${yol}/merkezden`, { belgeId: 999999 })).durum, 404);
    const k = await yaz<Kroki>(`${yol}/merkezden`, { belgeId: belge });
    assert.equal(k.durum, 200, JSON.stringify(k.govde));
    assert.equal(k.govde.ad, 'Salon A planı');
    assert.equal(k.govde.ozet, ozet(a));
    assert.equal(k.govde.parcaSayisi, 2);
    assert.equal(k.govde.tamam, true);
    assert.deepEqual(k.govde.merkez, { belgeId: belge, ad: 'Salon A planı', harf: 'A', ozet: ozet(a) });
    const geri = await Promise.all([0, 1].map(async (i) => Buffer.from((await oku<ModelParcaCevabi>(`${yol}/parcalar/${i}`)).govde.veri, 'base64')));
    assert.ok(Buffer.concat(geri).equals(a), 'parçalar merkezdeki dosyanın aynısı');
    const merkezde = (await oku<{ baglar: { hedefModul: string; hedefId: number }[] }>(`/cizimler/${belge}`)).govde.baglar;
    assert.deepEqual(merkezde.map((g) => [g.hedefModul, g.hedefId]), [['atolye', s.id]]);

    const hiza = { sayfa: 1, olcek: 0.0352778, donus: 90, x: 1, z: 2 };
    const h = await yaz<Kroki>(`${yol}/hizala`, { ...hiza, surum: k.govde.surum });
    assert.equal(h.durum, 200, JSON.stringify(h.govde));

    // Merkezde B yayınlanınca kroki eskir: merkez özeti krokininkinden ayrılır; aynı komut tazeler, hizalama kalır.
    const b = pdf(40);
    await merkezRevizyonYayinla(belge, b);
    const eskimis = (await oku<KrokiCevabi>(yol)).govde.kroki;
    assert.equal(eskimis?.ozet, ozet(a));
    assert.deepEqual([eskimis?.merkez?.harf, eskimis?.merkez?.ozet], ['B', ozet(b)]);
    const taze = await yaz<Kroki>(`${yol}/merkezden`, { belgeId: belge });
    assert.equal(taze.durum, 200, JSON.stringify(taze.govde));
    assert.equal(taze.govde.ozet, ozet(b));
    assert.equal(taze.govde.merkez?.ozet, ozet(b));
    assert.deepEqual(taze.govde.hizalama, h.govde.hizalama);

    // Başka belge seçilince hizalama sıfırlanır ve eski belgenin bağı kalkar.
    const baska = await merkezKrokisiAc(pdf(50), 'Salon A yeni pafta');
    const degisti = await yaz<Kroki>(`${yol}/merkezden`, { belgeId: baska });
    assert.equal(degisti.durum, 200, JSON.stringify(degisti.govde));
    assert.equal(degisti.govde.hizalama, null);
    assert.deepEqual((await oku<{ baglar: unknown[] }>(`/cizimler/${belge}`)).govde.baglar, []);

    // Yerel yükleme merkez bağını çözer; kaldırma da.
    const yerel = await krokiYukle(s.id, pdf(60));
    assert.equal(yerel.merkez, null);
    assert.deepEqual((await oku<{ baglar: unknown[] }>(`/cizimler/${baska}`)).govde.baglar, []);
    assert.equal((await yaz<Kroki>(`${yol}/merkezden`, { belgeId: baska })).durum, 200);
    assert.equal((await yaz(`${yol}/sil`)).durum, 204);
    assert.deepEqual((await oku<{ baglar: unknown[] }>(`/cizimler/${baska}`)).govde.baglar, []);

    // Fabrika krokisinin merkez bağı yoktur.
    const fk = await yaz<Kroki>('/atolye/fabrika/kroki', { ad: 'Fabrika', boyutBayt: pdf().length, ozet: ozet(pdf()), sayfa: 1 });
    assert.equal(fk.govde.merkez, null);
  });

  test('merkez modeli: seçici yayındaki 3B modelleri listeler; komut tek modeli bağlar, eskisini kaldırır, beklenen eskiyse 409; dosya kendi ucunda', async () => {
    const s = await salonKur();
    const ist = await istasyonKur();
    const yersiz = await istasyonKur();
    assert.equal((await kaydet(s.id, bosYerlesim(s, { istasyonYerleri: [{ istasyonId: ist.id, x: 10, z: 5, donus: 0, genislik: 3, derinlik: 2 }] }))).durum, 200);
    const merkezModeli = async () => (await oku<YerlesimCevabi>(`/atolye/salonlar/${s.id}`)).govde.istasyonYerleri.find((y) => y.istasyonId === ist.id)?.merkezModeli;
    const dosyaYolu = (id: number) => `/atolye/istasyonlar/${id}/merkez-modeli`;
    const bagla = (id: number, belgeId: number | null, beklenen: number | null, cerez = yonetici) =>
      istek<MerkezModeliBaglaCevabi & HataGovdesi>(cerez, 'POST', `/atolye/istasyonlar/${id}/merkez-modeli-bagla`, { belgeId, beklenen });
    const bagliModeller = async (id: number) => (await vt().tx((db) => kaydaBagliBelgeler(db, 'istasyonlar', id))).filter((b) => b.tur === '3b-model').map((b) => b.id).sort();
    assert.equal(await merkezModeli(), null);
    assert.equal((await oku(dosyaYolu(ist.id))).durum, 404);

    const yeniBelge = async (tur: string, icerik: Buffer, dosyaAdi: string, yayinla: boolean): Promise<number> => {
      const b = await merkezKomutu<MerkezBelgesi>('/cizimler', { ad: `Deneme ${dosyaAdi}`, tur, ozet: await merkezDosyasi(icerik), dosyaAdi });
      assert.equal(b.durum, 200, JSON.stringify(b.govde));
      if (yayinla) assert.equal((await merkezKomutu(`/cizimler/${b.govde.id}/revizyonlar/${b.govde.revizyonlar[0]?.id}/yayinla`, { surum: b.govde.surum })).durum, 200);
      return b.govde.id;
    };
    const stl = Buffer.from('solid deneme\nendsolid deneme\n');
    const taslak = await yeniBelge('3b-model', Buffer.from('solid taslak\nendsolid taslak\n'), 'taslak.stl', false);
    const resim = await yeniBelge('teknik-resim', pdf(1), 'resim.pdf', true);
    const model = await yeniBelge('3b-model', stl, 'tezgah.stl', true);
    const ikinci = await yeniBelge('3b-model', Buffer.from('solid ikinci\nendsolid ikinci\n'), 'ikinci.stl', true);

    // Seçici: yalnız yayındaki 3B modeller; okuyana kapalı.
    const liste = await oku<MerkezModelleriCevabi>('/atolye/cizim-merkezi/modeller');
    assert.equal(liste.durum, 200);
    const listedeki = liste.govde.belgeler.map((b) => b.id);
    assert.ok(listedeki.includes(model) && listedeki.includes(ikinci));
    assert.equal(listedeki.includes(taslak) || listedeki.includes(resim), false);
    assert.equal((await istek(gorur, 'GET', '/atolye/cizim-merkezi/modeller')).durum, 403);

    // Taslak ve başka tür bağlanmaz; okuyan bağlayamaz; yeri olmayan istasyon bağlanmaz.
    assert.equal((await bagla(ist.id, taslak, null)).durum, 404);
    assert.equal((await bagla(ist.id, resim, null)).durum, 422);
    assert.equal((await bagla(ist.id, model, null, gorur)).durum, 403);
    assert.equal((await bagla(yersiz.id, model, null)).durum, 404);
    assert.deepEqual(await bagliModeller(ist.id), []);

    const ilk = await bagla(ist.id, model, null);
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    const beklenenModel = { belgeId: model, ad: 'Deneme tezgah.stl', harf: 'A', ozet: ozet(stl), dosyaTuru: 'stl' };
    assert.deepEqual(ilk.govde.merkezModeli, beklenenModel);
    assert.deepEqual(await merkezModeli(), beklenenModel);
    for (const cerez of [yonetici, gorur, planlamaci]) {
      const c = await app.inject({ method: 'GET', url: `/api${dosyaYolu(ist.id)}`, headers: { cookie: cerez } });
      assert.equal(c.statusCode, 200);
      assert.deepEqual(c.rawPayload, stl);
    }
    assert.equal((await istek(null, 'GET', dosyaYolu(ist.id))).durum, 401);
    assert.equal((await istek(muhasebeci, 'GET', dosyaYolu(ist.id))).durum, 403);

    // Panelin gördüğü eskidiyse 409 ve bağ değişmez; güncel beklenenle ikinci model öncekinin yerine geçer.
    const eski = await bagla(ist.id, ikinci, null);
    assert.equal(eski.durum, 409);
    assert.deepEqual(await bagliModeller(ist.id), [model]);
    assert.equal((await bagla(ist.id, ikinci, model)).durum, 200);
    assert.deepEqual(await bagliModeller(ist.id), [ikinci]);
    assert.equal((await merkezModeli())?.belgeId, ikinci);

    // Başka yoldan kurulmuş fazla bağ da komutla tek modele iner; null bağı kaldırır, sahne kütüphane modeline döner.
    await vt().tx(async (db) => {
      const kullanici = await kullaniciYukle(db, yoneticiId);
      if (!kullanici) throw new Error('kullanıcı yok');
      await kaydaBagla(db, kullanici, model, 'istasyonlar', ist.id);
      await kaydaBagla(db, kullanici, model, 'istasyonlar', yersiz.id);
    });
    assert.equal((await merkezModeli())?.belgeId, model, 'birden çoksa en eski belge');
    assert.equal((await bagla(ist.id, null, model)).durum, 200);
    assert.deepEqual(await bagliModeller(ist.id), []);
    assert.equal(await merkezModeli(), null);
    // Haritada yeri olmayan istasyonun belgesi atölyeden verilmez.
    assert.equal((await oku(dosyaYolu(yersiz.id))).durum, 404);
    // "Ekle" listesi için (kart #1196): yeri olmayan istasyonun modeli seçici cevabında gelir; modeli olmayan istasyon gelmez.
    const istasyonlar = (await oku<MerkezModelleriCevabi>('/atolye/cizim-merkezi/modeller')).govde.istasyonlar;
    assert.equal(istasyonlar.find((i) => i.istasyonId === yersiz.id)?.merkezModeli.belgeId, model);
    assert.equal(istasyonlar.some((i) => i.istasyonId === ist.id), false);
  });

  test('kart #1258: yalnız taslak modeli eşleşmiş istasyon "taslaklar"da gelir; açık emrin malzemesine bağlı yayındaki model makinede gösterilir, dosyası yalnız açık emrin malzemesine verilir', async () => {
    const sahip = ortam!.sahip;
    const yeniBelge = async (icerik: Buffer, dosyaAdi: string, yayinla: boolean): Promise<number> => {
      const b = await merkezKomutu<MerkezBelgesi>('/cizimler', { ad: `Deneme ${dosyaAdi}`, tur: '3b-model', ozet: await merkezDosyasi(icerik), dosyaAdi });
      assert.equal(b.durum, 200, JSON.stringify(b.govde));
      if (yayinla) assert.equal((await merkezKomutu(`/cizimler/${b.govde.id}/revizyonlar/${b.govde.revizyonlar[0]?.id}/yayinla`, { surum: b.govde.surum })).durum, 200);
      return b.govde.id;
    };
    const bagla = (belge: number, modul: 'istasyonlar' | 'malzemeler', id: number) => vt().tx(async (db) => {
      const kullanici = await kullaniciYukle(db, yoneticiId);
      if (!kullanici) throw new Error('kullanıcı yok');
      await kaydaBagla(db, kullanici, belge, modul, id);
    });

    // Taslak: yayında modeli olmayan istasyon gelir; yayında modeli de olan gelmez.
    const taslakIst = await istasyonKur();
    const ikisi = await istasyonKur();
    const taslak = await yeniBelge(Buffer.from('solid t1258\nendsolid t1258\n'), 't1258.stl', false);
    const yayinda = await yeniBelge(Buffer.from('solid y1258\nendsolid y1258\n'), 'y1258.stl', true);
    await bagla(taslak, 'istasyonlar', taslakIst.id);
    await bagla(taslak, 'istasyonlar', ikisi.id);
    await bagla(yayinda, 'istasyonlar', ikisi.id);
    const secici = (await oku<MerkezModelleriCevabi>('/atolye/cizim-merkezi/modeller')).govde;
    assert.deepEqual(secici.taslaklar?.find((t) => t.istasyonId === taslakIst.id), { istasyonId: taslakIst.id, belgeId: taslak, ad: 'Deneme t1258.stl' });
    assert.equal(secici.taslaklar?.some((t) => t.istasyonId === ikisi.id), false);
    assert.equal(secici.istasyonlar.find((i) => i.istasyonId === ikisi.id)?.merkezModeli.belgeId, yayinda);

    // Malzeme: açık emrin malzemesi modeliyle gelir; emri bitince gelmez ve dosyası verilmez.
    await sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['ATL-MM-']);
    const kartAc = async (sira: number) => (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'ATL-MM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`atl-mm-${sira}`, sira, JSON.stringify({ id: `atl-mm-${sira}`, com: { ad: `Deneme mamul ${sira}` } }), yoneticiId],
    ))!.no;
    const [acikKart, kapaliKart] = [await kartAc(1), await kartAc(2)];
    const stl = Buffer.from('solid p1258\nendsolid p1258\n');
    const parca = await yeniBelge(stl, 'p1258.stl', true);
    const parcaTaslak = await yeniBelge(Buffer.from('solid pt1258\nendsolid pt1258\n'), 'pt1258.stl', false);
    await bagla(parca, 'malzemeler', acikKart);
    await bagla(parcaTaslak, 'malzemeler', acikKart);
    await bagla(parca, 'malzemeler', kapaliKart);
    // Emrin kaynak revizyonu gerçek bir satırdır; iptal durumu açık ve yürürlükteki revizyonların tekil dizinine girmez.
    const revizyon = async (kart: number) => (await sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [kart, yoneticiId],
    ))!.id;
    const emir = async (kart: number) => (await sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, malzeme_no, kaynak_rota_revizyonu_id) VALUES ($1, $2, 5, $3, $4, $5, $6) RETURNING id',
      [`P-1258-${kart}`, 'Deneme parça', taslakIst.id, yoneticiId, kart, await revizyon(kart)],
    ))!.id;
    await emir(acikKart);
    const kapali = await emir(kapaliKart);
    await sahip.sorgu("UPDATE uretim_emri SET durum = 'bitti', baslama = now(), bitis = now(), saglam_adet = 5 WHERE id = $1", [kapali]);

    const modeller = await oku<MalzemeModelleriCevabi>('/atolye/malzeme-modelleri');
    assert.equal(modeller.durum, 200, JSON.stringify(modeller.govde));
    assert.deepEqual(modeller.govde.malzemeler.find((m) => m.malzemeNo === acikKart)?.merkezModeli, { belgeId: parca, ad: 'Deneme p1258.stl', harf: 'A', ozet: ozet(stl), dosyaTuru: 'stl' });
    assert.equal(modeller.govde.malzemeler.some((m) => m.malzemeNo === kapaliKart), false);
    const dosya = await app.inject({ method: 'GET', url: `/api/atolye/malzemeler/${acikKart}/merkez-modeli`, headers: { cookie: gorur } });
    assert.equal(dosya.statusCode, 200);
    assert.deepEqual(dosya.rawPayload, stl);
    assert.equal((await oku(`/atolye/malzemeler/${kapaliKart}/merkez-modeli`)).durum, 404);
    assert.equal((await istek(muhasebeci, 'GET', '/atolye/malzeme-modelleri')).durum, 403);
    assert.equal((await istek(muhasebeci, 'GET', `/atolye/malzemeler/${acikKart}/merkez-modeli`)).durum, 403);
    assert.equal((await istek(null, 'GET', '/atolye/malzeme-modelleri')).durum, 401);
  });
  test('kart #1296: yerleşmemiş istasyonlar istasyon ya da ekipman yeri olmayan aktif istasyonlardır; Çizim Merkezi modeli yayında/taslak bilgisiyle gelir', async () => {
    const s = await salonKur();
    const [yerlesik, ekipmanli, yersiz, pasif] = [await istasyonKur(), await istasyonKur(), await istasyonKur(), await istasyonKur()];
    const m = await yaz<{ id: number }>('/makineler', { kod: yeniKod('MK-'), ad: 'Deneme makinesi', istasyonId: ekipmanli.id });
    assert.equal(m.durum, 200, JSON.stringify(m.govde));
    await ortam!.sahip.sorgu('INSERT INTO atolye_istasyon_yeri (istasyon_id, salon_id, x, z, donus, genislik, derinlik) VALUES ($1, $2, 5, 5, 0, 3, 2)', [yerlesik.id, s.id]);
    await ortam!.sahip.sorgu('INSERT INTO atolye_makine_yeri (makine_id, salon_id, x, z, donus, genislik, derinlik) VALUES ($1, $2, 12, 5, 0, 2, 2)', [m.govde.id, s.id]);
    await ortam!.sahip.sorgu('UPDATE istasyon SET aktif = false WHERE id = $1', [pasif.id]);
    const b = await merkezKomutu<MerkezBelgesi>('/cizimler', { ad: 'Deneme y1296.stl', tur: '3b-model', ozet: await merkezDosyasi(Buffer.from('solid y1296\nendsolid y1296\n')), dosyaAdi: 'y1296.stl' });
    assert.equal(b.durum, 200, JSON.stringify(b.govde));
    await vt().tx(async (db) => {
      const kullanici = await kullaniciYukle(db, yoneticiId);
      if (!kullanici) throw new Error('kullanıcı yok');
      await kaydaBagla(db, kullanici, b.govde.id, 'istasyonlar', yersiz.id);
    });

    const c = await istek<YerlesmemisIstasyonlarCevabi>(gorur, 'GET', '/atolye/yerlesmemis-istasyonlar');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const idler = c.govde.istasyonlar.map((i) => i.istasyonId);
    assert.ok(idler.includes(yersiz.id));
    for (const id of [yerlesik.id, ekipmanli.id, pasif.id]) assert.equal(idler.includes(id), false);
    assert.deepEqual(c.govde.istasyonlar.find((i) => i.istasyonId === yersiz.id)?.model, { ad: 'Deneme y1296.stl', yayinda: false });
    assert.equal((await istek(muhasebeci, 'GET', '/atolye/yerlesmemis-istasyonlar')).durum, 403);
    assert.equal((await istek(null, 'GET', '/atolye/yerlesmemis-istasyonlar')).durum, 401);
  });

  test('ATL-41 kareye atama (#1304): karede alan yoksa kare boyunda açılır, varsa türü değişir; istasyon kareye yerleşir ya da taşınır, başka bölümdeki taşınmaz; atolye.yaz ister', async () => {
    const s = await salonKur();
    const ata = (govde: unknown, cerez = yonetici) => istek<KayitCevabi & HataGovdesi>(cerez, 'POST', `/atolye/salonlar/${s.id}/hucre-ata`, govde);
    assert.equal((await ata({ surum: s.surum, hucre: 'C2', atama: { tur: 'alan', alanTuru: 'hurda' } }, gorur)).durum, 403);
    assert.equal((await ata({ surum: s.surum, hucre: 'Z9', atama: { tur: 'alan', alanTuru: 'hurda' } })).durum, 422);
    const ilk = await ata({ surum: s.surum, hucre: 'C2', atama: { tur: 'alan', alanTuru: 'hurda' } });
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    assert.deepEqual(ilk.govde.alanlar.map((a) => [a.tur, a.hucre, Number(a.x), Number(a.z), Number(a.genislik)]), [['hurda', 'C2', 10, 6, 3.8]]);
    const ikinci = await ata({ surum: ilk.govde.salon.surum, hucre: 'c2', atama: { tur: 'alan', alanTuru: 'ara_alan', ad: 'B-4 bekleme' } });
    assert.equal(ikinci.durum, 200, JSON.stringify(ikinci.govde));
    assert.deepEqual(ikinci.govde.alanlar.map((a) => [a.id, a.tur, a.ad]), [[ilk.govde.alanlar[0]!.id, 'ara_alan', 'B-4 bekleme']]);
    assert.equal((await ata({ surum: ilk.govde.salon.surum, hucre: 'A1', atama: { tur: 'alan', alanTuru: 'bolge' } })).durum, 409);

    const ist = await istasyonKur();
    const yer = await ata({ surum: ikinci.govde.salon.surum, hucre: 'E3', atama: { tur: 'istasyon', istasyonId: ist.id } });
    assert.equal(yer.durum, 200, JSON.stringify(yer.govde));
    assert.deepEqual(yer.govde.istasyonYerleri.map((y) => [y.istasyonId, y.hucre]), [[ist.id, 'E3']]);
    const tasi = await ata({ surum: yer.govde.salon.surum, hucre: 'F4', atama: { tur: 'istasyon', istasyonId: ist.id } });
    assert.deepEqual(tasi.govde.istasyonYerleri.map((y) => [y.istasyonId, y.hucre]), [[ist.id, 'F4']]);
    const s2 = await salonKur();
    const baska = await istek<HataGovdesi>(yonetici, 'POST', `/atolye/salonlar/${s2.id}/hucre-ata`, { surum: s2.surum, hucre: 'A1', atama: { tur: 'istasyon', istasyonId: ist.id } });
    assert.equal(baska.durum, 422);
    assert.match(baska.govde.mesaj, /bölümünde yerleşik/);
  });
});
