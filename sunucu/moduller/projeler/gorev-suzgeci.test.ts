import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { DagitCevabi, DagitimCevabi, SablonListesiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { hazirlikHedefCozucusuKaydet } from './dagitim.ts';
import { hazirlikGorevleriAc, hazirlikIsEmriEklendi } from './hazirlik-gorevleri.ts';
import { butunOlaylariVeEskiKademeleriAc } from '../bildirim/disari.ts';

const PAROLA = 'dogru-parola-1';
interface Kisi { cerez: string; id: number }

// Görevin emri yabancı anahtarsızdır; çözücü sahte emir verir (Üretim Emirleri'nin gerçek bağı kendi testindedir).
const EMIR = 990301;

describe('3611-1 şablon kalemi süzgeci (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Kisi;
  let planlama: Kisi;
  const rol = new Map<string, number>();
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = (kod: string): number => {
    const id = rol.get(kod);
    if (id === undefined) throw new Error(`rol yok: ${kod}`);
    return id;
  };
  async function girisYap(rolKodu: string | null, yonetenId: number | null): Promise<Kisi> {
    const kullaniciAdi = `gsz-${(sayac += 1)}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null && yonetenId !== null) {
        await rolAta(db, yonetenId, yeni, rolId(rolKodu));
        await rolAl(db, yonetenId, yeni, rolId('yonetici'));
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }
  const gonder = (k: Kisi, yol: string, govde: unknown = {}): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: k.cerez, 'istek-kimligi': randomUUID() } });
  const oku = (k: Kisi, yol: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: k.cerez } });

  async function projeAc(): Promise<number> {
    const s = await vt().tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, durum, baslangic, bitis, olusturan_id) VALUES ($1, 'Deneme dağıtım projesi', 'aktif', '2026-12-01', '2026-12-31', $2) RETURNING id",
      [`GS.${(sayac += 1)}`, yonetici.id],
    );
    return s?.id ?? 0;
  }
  const gorevler = (projeId: number) => vt().sorgu<{ id: number; ad: string; sorumlu_kisi_id: number | null; yapan_rol_id: number | null; plan_bitis: string; kanit_zorunlu: boolean; onceki_gorev_id: number | null; hazirlik_maddesi: string | null }>(
    'SELECT id, ad, sorumlu_kisi_id, yapan_rol_id, plan_bitis::text AS plan_bitis, kanit_zorunlu, onceki_gorev_id, hazirlik_maddesi FROM projeler_gorev WHERE proje_id = $1 ORDER BY id', [projeId]);

  before(async () => {
    ortam = await testVeritabaniKur('gorev_suzgeci');
    // 3478: olaylar varsayılan kapalıdır; bu dosya 3478'den önceki gibi açık olaylarla çalışır.
    await ortam.vt.tx((db) => butunOlaylariVeEskiKademeleriAc(db, null));
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    for (const r of await ortam.vt.sorgu<{ id: number; kod: string }>('SELECT id, kod FROM rol')) rol.set(r.kod, r.id);
    yonetici = await girisYap(null, null);
    planlama = await girisYap('planlama_proje', yonetici.id);
    hazirlikHedefCozucusuKaydet(async (_db, projeId) => ({
      hedefler: projeId === hedefProjesi ? [
        { hedef: { emriId: EMIR, emirNo: 'ORN-SE-1', emirTuru: 'seri', isEmirleri: [{ id: 990311, opNo: 10, operasyonTipiId: 1 }, { id: 990312, opNo: 20, operasyonTipiId: 2 }] }, tarih: { baslangic: '2026-12-02', bitis: '2026-12-20' } },
        { hedef: { emriId: EMIR + 1, emirNo: 'ORN-FA-1', emirTuru: 'fai', isEmirleri: [{ id: 990321, opNo: 10, operasyonTipiId: 2 }] }, tarih: { baslangic: '2026-12-02', bitis: '2026-12-20' } },
      ] : [],
      maddeler: new Map([['cnc', { ad: 'CNC kurulumu', isEmriDuzeyi: true }], ['cizim', { ad: 'Çizim revizyonu', isEmriDuzeyi: false }], ['yayin', { ad: 'Yayın', isEmriDuzeyi: false }]]),
    }));
  });
  after(async () => { hazirlikHedefCozucusuKaydet(null); await app?.close(); await ortam?.kaldir(); });
  let hedefProjesi = 0;

  test('süzgeç kayıtta döner; dağıtım önizlemesi ve açılan görevler emir türüne ve iş emri tipine uyar; süzgeçsiz kalem eskisi gibi her emirde açılır', async () => {
    hedefProjesi = await projeAc();
    const c = await gonder(yonetici, '/projeler/sablonlar', {
      ad: 'Süzgeçli', varsayilan: true, etkin: true, kalemler: [
        { ad: 'Yalnız seri CNC', dayanak: 'baslangic', gun: 0, sureGun: 2, yapanRolId: rolId('kalite'), hazirlikMaddesi: 'cnc', emirTurleri: ['seri'], operasyonTipleri: [2] },
        { ad: 'Çizim her emirde', dayanak: 'baslangic', gun: 0, sureGun: 1, yapanRolId: rolId('kalite'), hazirlikMaddesi: 'cizim' },
        { ad: 'Yalnız FAI yayın', dayanak: 'baslangic', gun: 0, sureGun: 1, yapanRolId: rolId('kalite'), hazirlikMaddesi: 'yayin', emirTurleri: ['fai'] },
      ],
    });
    assert.equal(c.statusCode, 200, c.body);
    const s = c.json<SablonListesiCevabi>().sablonlar.find((x) => x.ad === 'Süzgeçli');
    assert.deepEqual(s?.kalemler.map((k) => [k.emirTurleri, k.operasyonTipleri]), [[['seri'], [2]], [[], []], [['fai'], []]]);
    const kotu = await gonder(yonetici, '/projeler/sablonlar', { ad: 'Kötü', varsayilan: false, etkin: true, kalemler: [{ ad: 'x', dayanak: 'baslangic', gun: 0, sureGun: 1, hazirlikMaddesi: 'cnc', emirTurleri: ['yok'] }] });
    assert.equal(kotu.statusCode, 400, 'tanımsız emir türü reddedilir');

    const o = (await oku(planlama, `/projeler/${hedefProjesi}/dagitim`)).json<DagitimCevabi>();
    // CNC: yalnız seri emir ve yalnız tip 2 iş emri (990312) -> 1 görev; çizim her emir -> 2; FAI yayın -> 1.
    assert.deepEqual(o.satirlar.map((x) => [x.ad, x.dogacak]), [['Yalnız seri CNC', 1], ['Çizim her emirde', 2], ['Yalnız FAI yayın', 1]]);
    const d = await gonder(planlama, `/projeler/${hedefProjesi}/dagit`, { sablonId: o.sablonId });
    assert.equal(d.statusCode, 200, d.body);
    assert.deepEqual(d.json<DagitCevabi>(), { projeGorevi: 0, hazirlikGorevi: 4 });
    const g = await gorevler(hedefProjesi);
    assert.equal(g.filter((x) => x.hazirlik_maddesi === 'cnc').length, 1);
    assert.equal(g.filter((x) => x.hazirlik_maddesi === 'cizim').length, 2, 'çizim her emirde açılır');
    assert.equal(g.filter((x) => x.hazirlik_maddesi === 'yayin').length, 1, 'yayın yalnız FAI emrinde');
    const adimlar = await vt().sorgu<{ is_emri_id: number }>('SELECT a.hazirlik_is_emri_id AS is_emri_id FROM projeler_gorev_adimi a JOIN projeler_gorev g ON g.id = a.gorev_id WHERE g.proje_id = $1 AND g.hazirlik_maddesi = $2 AND a.hazirlik_is_emri_id IS NOT NULL', [hedefProjesi, 'cnc']);
    assert.deepEqual(adimlar.map((a) => a.is_emri_id), [990312], 'seri emirde yalnız tip 2 iş emri adım');
  });

  test('donan kalemde süzgeç yoksa (eski şablon) hepsi sayılır; sonradan eklenen iş emri tipi süzgece girmiyorsa göreve adım olmaz', async () => {
    const r = await vt().tek<{ kalemler: Record<string, unknown>[] }>('SELECT kalemler FROM projeler_proje_sablonu WHERE proje_id = $1', [hedefProjesi]);
    const eski = (r?.kalemler ?? []).map(({ emirTurleri: _a, operasyonTipleri: _b, ...kalan }) => kalan);
    const p = await projeAc();
    await vt().sorgu('INSERT INTO projeler_proje_sablonu (proje_id, sablon_id, sablon_surum, kalemler, kisi_id) SELECT $1, sablon_id, sablon_surum, $2::jsonb, kisi_id FROM projeler_proje_sablonu WHERE proje_id = $3', [p, JSON.stringify(eski), hedefProjesi]);
    const ac = await vt().tx((db) => hazirlikGorevleriAc(db, yonetici.id, {
      projeId: p, sablonId: null, maddeler: new Map([['cnc', { ad: 'CNC kurulumu', isEmriDuzeyi: true }]]), tarih: { baslangic: null, bitis: null },
      hedefler: [{ emriId: EMIR + 7, emirNo: 'ORN-EK-1', emirTuru: 'prototip', isEmirleri: [{ id: 990711, opNo: 10, operasyonTipiId: 1 }] }],
    }));
    assert.equal(ac.eklenen, 1, 'süzgeçsiz donmuş kalem her emirde açılır');
    const ek = await vt().tx((db) => hazirlikIsEmriEklendi(db, yonetici.id, { emriId: EMIR, emirNo: 'ORN-SE-1', isEmriId: 990319, opNo: 30, operasyonTipiId: 1 }));
    assert.equal(ek, 0, 'tip 1 süzgeçte yok: seri emrin CNC görevine adım olmaz');
    const ek2 = await vt().tx((db) => hazirlikIsEmriEklendi(db, yonetici.id, { emriId: EMIR, emirNo: 'ORN-SE-1', isEmriId: 990318, opNo: 40, operasyonTipiId: 2 }));
    assert.equal(ek2, 1, 'tip 2 adım olur');
  });
});
