import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { belgeEkleGovdesi, odemeEkleGovdesi } from '#paylasilan/sozlesme/finans.ts';
import { firmaEkleGovdesi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import {
  durumGovdesi, iskontoOnayGovdesi, siparisDonusumGovdesi, teklifEkleGovdesi, teklifKabulGovdesi, teklifNotGovdesi, teklifSurumuGovdesi,
} from '#paylasilan/sozlesme/siparisler.ts';
import { gunleriKos } from '../gun-dongusu.ts';
import { KosuKaydi } from '../kayit.ts';
import { DOSYA, adimSatiriOku } from '../sozlesme.ts';
import { rastgeleUret } from '../tohum.ts';
import finans, {
  dagitimHatasi, gecerliKdvOranlari, gunEkle, hesapSec, odemeGovdesi, surumGovdesi, teklifGovdesi, toplamHatasi,
} from './finans.ts';
import type { Cevap, RolIstemcisi } from '../senaryo.ts';
import type { AdimSatiri } from '../sozlesme.ts';
import type { z } from 'zod';

const gecici = mkdtempSync(join(tmpdir(), 'tmiv2-robot-finans-'));
after(() => { rmSync(gecici, { recursive: true, force: true }); });

describe('finans senaryosu: saf parçalar', () => {
  it('gün ekleme ay ve yıl sınırını geçer', () => {
    assert.equal(gunEkle('2026-12-20', 15), '2027-01-04');
    assert.equal(gunEkle('2028-02-28', 1), '2028-02-29');
  });

  it('KDV yalnız belge gününde geçerli ve sıfırdan büyük orandan seçilir', () => {
    const liste = { satirlar: [
      { oran: '0.00', gecerlilikBaslangic: '2023-07-10', gecerlilikBitis: null },
      { oran: '18.00', gecerlilikBaslangic: '2020-01-01', gecerlilikBitis: '2023-07-10' },
      { oran: '20.00', gecerlilikBaslangic: '2023-07-10', gecerlilikBitis: null },
      { oran: '25.00', gecerlilikBaslangic: '2030-01-01', gecerlilikBitis: null },
    ] };
    assert.deepEqual(gecerliKdvOranlari(liste, '2026-10-23'), [20]);
    assert.deepEqual(gecerliKdvOranlari({}, '2026-10-23'), []);
  });

  it('hesap aktif TRY hesaplarından, bankayı önce seçer; yoksa null', () => {
    const h = (id: number, tur: string, paraBirimi = 'TRY', aktif = true) => ({ id, tur, paraBirimi, aktif });
    assert.equal(hesapSec({ satirlar: [h(1, 'kasa'), h(2, 'banka', 'EUR'), h(3, 'banka', 'TRY', false), h(4, 'banka')] }), 4);
    assert.equal(hesapSec({ satirlar: [h(1, 'kasa')] }), 1);
    assert.equal(hesapSec({ satirlar: [h(2, 'banka', 'USD')] }), null);
  });

  it('teklif ve sürüm gövdesi sözleşmeden geçer, veri BNZ- önekli', () => {
    const r = rastgeleUret(3);
    const t = teklifGovdesi(r, 9, [11, 12, 13]);
    assert.equal(teklifEkleGovdesi.safeParse(t).success, true);
    assert.match(String(t['baslik']), /^BNZ-/);
    const satirSayisi = (t['satirlar'] as unknown[]).length;
    const cevap = { surum: 1, satirlar: Array.from({ length: satirSayisi }, (_, i) => ({ id: 100 + i })) };
    const s = surumGovdesi(r, cevap, '15');
    assert.equal(teklifSurumuGovdesi.safeParse(s).success, true);
    assert.equal(surumGovdesi(r, { surum: 1, satirlar: [] }, '5'), null);
  });

  it('kısmi ödeme kuruşa yuvarlanır ve tamamı belgeye dağıtılır', () => {
    const g = odemeGovdesi({ yon: 'gelir', firmaId: 1, hesapId: 2, bugun: '2026-10-23', belgeId: 3, toplam: '1000.01', yuzde: 40 });
    assert.equal(g['tutar'], 400);
    assert.deepEqual(g['dagitimlar'], [{ belgeId: 3, belgeTutari: 400 }]);
    assert.equal(odemeEkleGovdesi.safeParse(g).success, true);
  });

  it('toplam ve dağıtım denetimi bir kuruşu tolere eder, fazlasını bulgu yapar', () => {
    assert.equal(toplamHatasi({ toplam: '120.01' }, 100, 20), null);
    assert.match(String(toplamHatasi({ toplam: '121.00' }, 100, 20)), /beklenen 120.00/);
    assert.equal(dagitimHatasi({ dagitilan: '400.00' }, 400), null);
    assert.match(String(dagitimHatasi({ dagitilan: '0.00' }, 400)), /beklenen 400.00/);
  });
});

// Sahte sunucu: her yazma gövdesi gerçek sözleşme şemasından geçer; geçmezse 400 döner ve adım düşer.
function sahteSunucu(): { istemci: (h: string) => RolIstemcisi; cagrilar: string[] } {
  const cagrilar: string[] = [];
  let sira = 100;
  const yeniId = (): number => (sira += 1);
  const belgeler = new Map<number, string>();
  const siparisler: number[] = [];
  const dogrula = (sema: z.ZodTypeAny, govde: unknown): unknown => {
    const s = sema.safeParse(govde);
    if (!s.success) throw new Error(JSON.stringify(s.error.issues));
    return s.data;
  };
  const isle = (yontem: string, yol: string, govde: unknown, hesap: string): unknown => {
    const y = yol.replace(/\/\d+/g, '/:id').replace(/\?.*$/, '');
    const g = govde as Record<string, unknown>;
    // İşi yapan rol: teklif satışta, firma ve para kaydı muhasebede (onaylar aşağıda, müdür).
    const rol = y.startsWith('/api/siparisler/teklifler') && !y.endsWith('/iskonto-onayla') ? 'ornek.satis'
      : y.startsWith('/api/finans/') || y.startsWith('/api/musteri-tedarikci/') ? 'ornek.muhasebe' : null;
    if (rol !== null && hesap !== rol) throw new Error(`${yontem} ${y} ${hesap} ile atıldı, beklenen ${rol}`);
    switch (`${yontem} ${y}`) {
      case 'GET /api/finans/kdv-oranlari': return { satirlar: [{ oran: '0.00', gecerlilikBaslangic: '2023-07-10', gecerlilikBitis: null }, { oran: '20.00', gecerlilikBaslangic: '2023-07-10', gecerlilikBitis: null }] };
      case 'GET /api/finans/hesaplar': return { satirlar: [{ id: 7, tur: 'banka', paraBirimi: 'TRY', aktif: true }] };
      case 'GET /api/siparisler/malzeme-secenekleri': return { satirlar: [{ no: 11 }, { no: 12 }] };
      case 'POST /api/musteri-tedarikci/firmalar/ekle': dogrula(firmaEkleGovdesi, govde); return { firma: { id: yeniId() } };
      case 'POST /api/siparisler/teklifler/ekle': {
        dogrula(teklifEkleGovdesi, govde);
        return { id: yeniId(), surum: 1, durum: 'yeni', sonSurumNo: null, satirlar: (g['satirlar'] as unknown[]).map(() => ({ id: yeniId() })) };
      }
      case 'POST /api/siparisler/teklifler/:id/surum-ver': {
        const v = dogrula(teklifSurumuGovdesi, govde) as { iskontoOrani: string };
        return { id: 1, surum: 2, sonSurumNo: 1, durum: Number(v.iskontoOrani) > 10 ? 'onay-bekliyor' : 'verildi' };
      }
      case 'POST /api/siparisler/teklifler/:id/iskonto-onayla':
        assert.equal(hesap, 'ornek.mudur'); dogrula(iskontoOnayGovdesi, govde); return { surum: 3, sonSurumNo: 1, durum: 'verildi' };
      case 'POST /api/siparisler/teklifler/:id/reddet': dogrula(teklifNotGovdesi, govde); return { durum: 'red' };
      case 'POST /api/siparisler/teklifler/:id/kabul': dogrula(teklifKabulGovdesi, govde); return { surum: 4, durum: 'kabul' };
      case 'POST /api/siparisler/teklifler/:id/siparise-donustur': dogrula(siparisDonusumGovdesi, govde); { const id = yeniId(); siparisler.push(id); return { teklif: {}, siparisId: id }; }
      case 'GET /api/siparisler/:id': return { surum: 1, durum: 'taslak' };
      case 'POST /api/siparisler/:id/onayla':
        assert.equal(hesap, 'ornek.mudur'); dogrula(durumGovdesi, govde); return { surum: 2, durum: 'onayli', araToplam: '1234.50' };
      case 'GET /api/finans/satis-siparisleri': return { siparisler: siparisler.map((id) => ({ id })) };
      case 'POST /api/finans/belgeler/ekle': {
        const v = dogrula(belgeEkleGovdesi, govde) as { tutar: string; kdvOrani: string };
        const kurus = Math.round(Number(v.tutar) * 100);
        const id = yeniId();
        const toplam = ((kurus + Math.round((kurus * Number(v.kdvOrani)) / 100)) / 100).toFixed(2);
        belgeler.set(id, toplam);
        return { belge: { id, toplam } };
      }
      case 'POST /api/finans/odemeler/ekle': {
        const v = dogrula(odemeEkleGovdesi, govde) as { tutar: string; dagitimlar: { belgeId: number }[] };
        assert.ok(v.dagitimlar.every((d) => belgeler.has(d.belgeId)), 'ödeme bilinmeyen belgeye dağıtıldı');
        return { odeme: { dagitilan: v.tutar } };
      }
      default:
        if (yontem === 'GET') return {};
        throw new Error(`beklenmeyen uç: ${yontem} ${y}`);
    }
  };
  const istemci = (hesap: string): RolIstemcisi => ({
    istek(yontem, yol, govde): Promise<Cevap> {
      cagrilar.push(`${hesap} ${yontem} ${yol.replace(/\/\d+/g, '/:id').replace(/\?.*$/, '')}`);
      try {
        return Promise.resolve({ durum: 200, govde: isle(yontem, yol, govde, hesap) });
      } catch (hata) {
        return Promise.resolve({ durum: 400, govde: hata instanceof Error ? hata.message : String(hata) });
      }
    },
  });
  return { istemci, cagrilar };
}

const kos = async (tohum: number, gunSayisi: number): Promise<{ adimlar: AdimSatiri[]; cagrilar: string[] }> => {
  const kayit = new KosuKaydi({
    kok: gecici, kosuId: `finans-${String(tohum)}`, taban: null, tohum, gunSayisi, roller: [...finans.roller], senaryolar: [finans.ad],
    model: { kip: 'kapali', ustSinir: 0 },
  });
  const s = sahteSunucu();
  await gunleriKos({ kayit, senaryolar: [finans], istemci: s.istemci, tohum, gunSayisi, esZamanli: 4 });
  const adimlar = readFileSync(join(kayit.klasor, DOSYA.adimlar), 'utf8').split('\n').filter((x) => x !== '')
    .map((x) => adimSatiriOku(x) as AdimSatiri);
  return { adimlar, cagrilar: s.cagrilar };
};

describe('finans senaryosu: akış', () => {
  it('sözleşmeye uyan sahte sunucuda bütün adımlar geçer; ret, iskonto onayı ve tahsilat yolları koşar', async () => {
    const { adimlar, cagrilar } = await kos(5, 6);
    const dusen = adimlar.filter((a) => a.sonuc !== 'gecti');
    assert.deepEqual(dusen.map((a) => `${a.adim}: ${a.ileti ?? ''}`), []);
    const yollar = new Set(cagrilar);
    for (const beklenen of [
      'ornek.satis POST /api/siparisler/teklifler/:id/reddet',
      'ornek.mudur POST /api/siparisler/teklifler/:id/iskonto-onayla',
      'ornek.mudur POST /api/siparisler/:id/onayla',
      'ornek.muhasebe POST /api/finans/odemeler/ekle',
      'ornek.mudur GET /api/siparisler/ozet',
    ]) assert.ok(yollar.has(beklenen), `${beklenen} çağrılmadı`);
  });

  it('aynı tohum aynı çağrı dizisini verir', async () => {
    const sirali = (c: string[]): string[] => [...c].sort();
    assert.deepEqual(sirali((await kos(9, 2)).cagrilar), sirali((await kos(9, 2)).cagrilar));
  });

  it('sözleşmeye uymayan cevap sessiz geçmez: eksik alan ayrı adımda düşer', async () => {
    const kayit = new KosuKaydi({
      kok: gecici, kosuId: 'finans-bos', taban: null, tohum: 1, gunSayisi: 1, roller: [...finans.roller], senaryolar: [finans.ad],
      model: { kip: 'kapali', ustSinir: 0 },
    });
    await gunleriKos({ kayit, senaryolar: [finans], istemci: () => ({ istek: () => Promise.resolve({ durum: 200, govde: {} }) }), tohum: 1, gunSayisi: 1, esZamanli: 2 });
    const dusen = readFileSync(join(kayit.klasor, DOSYA.adimlar), 'utf8').split('\n').filter((x) => x !== '')
      .map((x) => adimSatiriOku(x) as AdimSatiri).filter((a) => a.sonuc === 'dustu').map((a) => a.adim);
    // İki kopya, her biri ortak veride durur; yazma adımı atılmaz.
    assert.deepEqual([...new Set(dusen)].sort(), ['geçerli KDV oranı', 'satılabilir malzeme', 'tahsilat hesabı']);
    assert.equal(dusen.length, 6);
  });
});
