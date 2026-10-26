import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import uretim, { gunEkle, kod, kartGovdesi, rotaAdimi, siparisGovdesi, yetkinlikBirlesimi } from './uretim.ts';
import { gunleriKos } from '../gun-dongusu.ts';
import { KosuKaydi } from '../kayit.ts';
import { DOSYA, adimSatiriOku } from '../sozlesme.ts';
import { ESKI_SURUM_ILETISI, ESKI_SURUM_NEDENI } from '#paylasilan/hata.ts';
import { rastgeleUret } from '../tohum.ts';
import type { Cevap, RolIstemcisi } from '../senaryo.ts';
import type { AdimSatiri } from '../sozlesme.ts';
import type { Hesap } from '../../hesaplar.ts';

const gecici = mkdtempSync(join(tmpdir(), 'tmiv2-robot-uretim-'));
after(() => { rmSync(gecici, { recursive: true, force: true }); });

interface Cagri { rol: Hesap; yontem: string; yol: string; govde: unknown }

// Sahte sunucu: her uca akışın okuduğu en az alanla cevap verir. `boz` verilen ucu bozar (yol kalıbına göre).
function sahteSunucu(boz: (c: Cagri) => Cevap | undefined = () => undefined): { istemci: (h: Hesap) => RolIstemcisi; cagrilar: Cagri[] } {
  const cagrilar: Cagri[] = [];
  let sira = 100;
  const emirler = new Map<number, number>();
  const yeni = (): number => (sira += 1);
  const cevap = (c: Cagri): unknown => {
    const g = c.govde as Record<string, unknown> | undefined;
    const y = `${c.yontem} ${c.yol.replace(/\?.*$/, '')}`;
    if (y === 'POST /api/musteri-tedarikci/firmalar/ekle') return { firma: { id: yeni() } };
    if (/^POST \/api\/malzeme-katalogu-kartlari\/.+\/kaydet$/.test(y)) {
      const kod = String((g?.['ozet'] as Record<string, unknown>)['stok_kodu']).replace(/00001$/, String(yeni()));
      return { id: 'x', stok_kodu: kod, surum: yeni() };
    }
    if (y === 'GET /api/malzemeler/ara') return { sonuclar: [{ anahtar: String(yeni()), baslik: `${new URLSearchParams(c.yol.split('?')[1]).get('q') ?? ''} ad` }] };
    if (y === 'POST /api/is-merkezleri' || y === 'POST /api/makineler') return { id: yeni() };
    if (y === 'POST /api/istasyonlar') return { id: yeni(), kod: g?.['kod'] };
    if (y === 'GET /api/oturum') return { kullanici: { id: 4 } };
    if (y === 'GET /api/kisi-yetkinlikleri') return { yetkinlikler: [{ kisiId: 4, istasyonIdleri: [1, 2] }] };
    if (y === 'GET /api/rota/secenekler') return { operasyonTipleri: [{ id: 1, kod: 'TRN' }, { id: 2, kod: 'FRZ' }] };
    if (/taslak-ac$/.test(y)) return { id: 5 };
    if (y === 'GET /api/rota/revizyonlar/5') return { revizyon: { surum: 1 } };
    if (y === 'POST /api/siparisler/ekle') return { id: 7, surum: 1 };
    if (y === 'GET /api/siparisler/7') return { satirlar: [{ id: 8 }] };
    if (/^POST \/api\/projeler\/siparisten/.test(y)) return { id: 9 };
    if (/emre-kopyala$/.test(y)) { const id = yeni(); emirler.set(id, Number(g?.['adet'])); return { uretimEmriId: id, isEmriIdleri: [11, 12] }; }
    if (/^GET \/api\/adimli-emirler\/\d+$/.test(y)) return { emir: { durum: 'bitti', isEmirleri: [{ id: 12, sira: 2 }, { id: 11, sira: 1 }] } };
    if (/^GET \/api\/stok\/malzemeler\//.test(y)) return { satir: { toplam: '0' }, bakiyeler: [{ konumId: 3, miktar: '5' }] };
    if (y === 'GET /api/stok/partiler') return { satirlar: [...emirler].map(([e, a]) => ({ id: 4, uretimEmriId: e, eldeki: String(a) })) };
    if (y === 'POST /api/vardiyalar') return { vardiyalar: [{ id: 3, ad: 'baska' }, { id: yeni(), ad: g?.['ad'] }] };
    if (y === 'GET /api/plan' && !c.yol.includes('taslak=')) {
      return { surum: 1, yerlesmemis: [...emirler.keys()].flatMap((e) => [10, 20].map((opNo) => ({ uretimEmriId: e, emirNo: `E${String(e)}`, opNo, kaynak: { tur: 'makine', id: opNo } }))) };
    }
    if (y === 'POST /api/plan/kuyruklari-yaz') return { taslak: 1, canli: false, yazilan: 2, atlanan: 0 };
    if (y === 'GET /api/plan') return { taslak: { surum: 1 }, yerlesimler: [...emirler.keys()].flatMap((e) => [{ uretimEmriId: e }, { uretimEmriId: e }]) };
    if (/^POST \/api\/arkon\/kayitlar\//.test(y)) return { eklenen: 1, reddedilen: [] };
    if (y === 'GET /api/sevkiyat/bekleyenler') return { bekleyenler: [...emirler.keys()].map((e) => ({ id: 2, uretimEmriId: e })) };
    if (y === 'POST /api/sevkiyat/noktalar/ekle') return { nokta: { id: 1 } };
    if (/ise-cevir$/.test(y)) return { is: { id: 3 } };
    return { surum: yeni() };
  };
  return {
    cagrilar,
    istemci: (rol) => ({
      istek(yontem, yol, govde) {
        const c = { rol, yontem, yol, govde };
        cagrilar.push(c);
        return Promise.resolve(boz(c) ?? { durum: 200, govde: cevap(c) });
      },
    }),
  };
}

async function kos(kosuId: string, sunucu: ReturnType<typeof sahteSunucu>, gunSayisi = 1): Promise<AdimSatiri[]> {
  const kayit = new KosuKaydi({
    kok: gecici, kosuId, taban: null, tohum: 3, gunSayisi, roller: [...uretim.roller], senaryolar: [uretim.ad],
    model: { kip: 'kapali', ustSinir: 0 }, simdi: () => new Date('2026-10-23T10:00:00Z'),
  });
  await gunleriKos({ kayit, senaryolar: [uretim], istemci: sunucu.istemci, tohum: 3, gunSayisi, esZamanli: 4 });
  return readFileSync(join(kayit.klasor, DOSYA.adimlar), 'utf8').split('\n').filter((s) => s !== '')
    .map((s) => adimSatiriOku(s) as AdimSatiri);
}

const sayac = (c: Cagri[], kalip: RegExp): number => c.filter((x) => kalip.test(`${x.yontem} ${x.yol}`)).length;

describe('üretim senaryosu: gövdeler', () => {
  it('tarih ay ve yıl sınırını geçer', () => {
    assert.equal(gunEkle('2026-12-20', 22), '2027-01-11');
    assert.equal(gunEkle('2026-02-27', 2), '2026-03-01');
  });
  it('kod gün ve kopyayı taşır; aynı rastgele akış iki kopyada çakışmaz', () => {
    const a = kod({ rastgele: rastgeleUret(5), gun: 3, kopya: 1 }, 'nokta');
    const b = kod({ rastgele: rastgeleUret(5), gun: 3, kopya: 2 }, 'nokta');
    assert.match(a, /^BNZ-NOKTA3K1-[A-Z]+-00001$/);
    assert.notEqual(a, b);
  });
  it('yetkinlik listesi tümden yazıldığı için var olanlar korunur', () => {
    assert.deepEqual(yetkinlikBirlesimi({ yetkinlikler: [{ kisiId: 4, istasyonIdleri: [3, 1] }, { kisiId: 5, istasyonIdleri: [9] }] }, 4, [7, 3]), [1, 3, 7]);
    assert.deepEqual(yetkinlikBirlesimi({ yetkinlikler: [] }, 4, [2]), [2]);
  });
  it('kart, rota ve sipariş gövdeleri akışın beklediği biçimde', () => {
    const hm = kartGovdesi('hammadde', 'k', 'HM-BNZ-00001', 'BNZ-A', 'taslak', null) as { kayit: Record<string, unknown> };
    assert.equal(hm.kayit['grade'], 'S235');
    assert.equal(hm.kayit['ops'], undefined);
    const mm = kartGovdesi('mamul', 'k', 'MM-BNZ-00001', 'BNZ-A', 'aktif', 3) as { kayit: { ops: unknown[] }; surum: number };
    assert.equal(mm.kayit.ops.length, 2);
    assert.equal(mm.surum, 3);
    assert.deepEqual(rotaAdimi(10, 1, 'T', 5, 42)['bilesenler'], [{ malzemeId: 42, miktar: 1, fireYuzde: 0 }]);
    assert.deepEqual(rotaAdimi(20, 2, 'F', 6, null)['bilesenler'], []);
    const sp = siparisGovdesi(1, 'BNZ-MS', '2026-10-23', '2026-11-12', 9, 12, null) as { satirlar: Record<string, unknown>[] };
    assert.deepEqual([sp.satirlar[0]?.['malzemeNo'], sp.satirlar[0]?.['miktar'], sp.satirlar[0]?.['birimFiyat']], [9, '12', null]);
  });
});

describe('üretim senaryosu: akış', () => {
  it('üç kopya uçtan uca geçer; tezgâhlar koşuda bir kez açılır; her adım yetkili rolle', async () => {
    const s = sahteSunucu();
    const adimlar = await kos('u1', s, 2);
    assert.deepEqual(adimlar.filter((a) => a.sonuc !== 'gecti').map((a) => `${a.adim}: ${a.ileti ?? ''}`), []);
    assert.equal(uretim.kopya, 3);
    assert.equal(sayac(s.cagrilar, /^POST \/api\/is-merkezleri$/), 1);
    assert.equal(sayac(s.cagrilar, /^POST \/api\/istasyonlar$/), 6);
    assert.equal(sayac(s.cagrilar, /^POST \/api\/kisi-yetkinlikleri\/4\/belirle$/), 1);
    assert.equal(sayac(s.cagrilar, /emre-kopyala$/), 6);
    assert.equal(sayac(s.cagrilar, /\/durum$/), 6);
    const rolu = (kalip: RegExp): Hesap[] => [...new Set(s.cagrilar.filter((c) => kalip.test(`${c.yontem} ${c.yol}`)).map((c) => c.rol))];
    assert.deepEqual(rolu(/^POST \/api\/siparisler\/7\/onayla$/), ['ornek.mudur']);
    assert.deepEqual(rolu(/^POST \/api\/rota\/revizyonlar\/5\/onayla$/), ['ornek.mudur']);
    assert.deepEqual(rolu(/^POST \/api\/arkon\//), ['ornek.operator1']);
    assert.deepEqual(rolu(/ilk-parca/), ['ornek.kalite']);
    assert.deepEqual(rolu(/^POST \/api\/(stok|sevkiyat)\//), ['ornek.depo']);
    // Sunucu motoru için koşu başına bir vardiya, iş merkezinin yedi günü ve bir planlama çalışması kaydı.
    assert.equal(sayac(s.cagrilar, /^POST \/api\/vardiyalar$/), 1);
    assert.equal(sayac(s.cagrilar, /^POST \/api\/vardiya-matrisi\/degistir$/), 7);
    assert.equal(sayac(s.cagrilar, /^POST \/api\/recete-rota\/kayitlar\/yaz$/), 1);
    assert.deepEqual(rolu(/^POST \/api\/vardiya/), ['ornek.mudur']);
    assert.deepEqual(rolu(/^POST \/api\/(plan|recete-rota)\//), ['ornek.planlama']);
    assert.equal(sayac(s.cagrilar, /\/plan\/oner/), 0);
    const kuyruk = s.cagrilar.find((c) => c.yol === '/api/plan/kuyruklari-yaz')?.govde as { kuyruklar: { kaynak: { id: number }; isler: { opNo: number }[] }[] };
    assert.deepEqual(kuyruk.kuyruklar.map((q) => [q.kaynak.id, q.isler.map((i) => i.opNo)]), [[10, [10]], [20, [20]]]);
  });

  it('uydurma ad ve kodlar BNZ- önekli, örnek veriye (ORN-) dokunulmaz', async () => {
    const s = sahteSunucu();
    await kos('u2', s);
    const adlar = s.cagrilar.flatMap((c) => {
      const g = c.govde as Record<string, unknown> | undefined;
      return ['ad', 'kod', 'musteriSiparisNo', 'irsaliyeNo', 'belgeNo'].map((k) => g?.[k]).filter((x): x is string => typeof x === 'string');
    });
    assert.ok(adlar.length > 10);
    assert.deepEqual(adlar.filter((a) => !a.startsWith('BNZ')), []);
    assert.equal(JSON.stringify(s.cagrilar).includes('ORN-'), false);
  });

  it('iş emirleri cevap sırasıyla değil adım sırasıyla yürür', async () => {
    const s = sahteSunucu();
    await kos('u3', s);
    const kopya = s.cagrilar.filter((c) => /arkon|ilk-parca/.test(c.yol)).slice(0, 4)
      .map((c) => `${c.yol.includes('ilk-parca') ? 'ilk-parca' : String((c.govde as { satirlar: { pkgId: string }[] }).satirlar[0]?.pkgId)}`);
    assert.equal(kopya[0], 'tmi-ie-11');
  });

  it('düşen yazma adımında kopya durur, sonraki adımlar gönderilmez', async () => {
    const s = sahteSunucu((c) => (c.yol === '/api/siparisler/ekle' ? { durum: 500, govde: { kod: 'HATA' } } : undefined));
    const adimlar = await kos('u4', s);
    assert.equal(adimlar.filter((a) => a.sonuc === 'dustu' && a.adim === 'satış siparişi aç').length, 3);
    assert.equal(sayac(s.cagrilar, /^POST \/api\/siparisler\/ekle$/), 3);
    assert.equal(sayac(s.cagrilar, /emre-kopyala|arkon|sevkiyat/), 0);
  });

  it('Arkon reddi 200 ile gelse de adım düşer', async () => {
    const s = sahteSunucu((c) => (c.yol.includes('/arkon/kayitlar/events') ? { durum: 200, govde: { eklenen: 0, reddedilen: [{ cid: 'x', ileti: 'makine dolu' }] } } : undefined));
    const adimlar = await kos('u5', s);
    const dusen = adimlar.filter((a) => a.sonuc === 'dustu');
    assert.deepEqual([...new Set(dusen.map((a) => a.adim))], ['iş emri 1: başlat']);
    assert.match(dusen[0]?.ileti ?? '', /makine dolu/);
    assert.equal(sayac(s.cagrilar, /ilk-parca|sevkiyat/), 0);
  });

  it('eşzamanlı plan değişikliği (409) düşmüş sayılmaz, başka hata düşer', async () => {
    const s409 = sahteSunucu((c) => (c.yol.endsWith('/canliya-al') ? { durum: 409, govde: { kod: 'CAKISMA' } } : undefined));
    const a = (await kos('u6', s409)).filter((x) => x.adim === 'planı canlıya al');
    assert.deepEqual([...new Set(a.map((x) => x.sonuc))], ['gecti']);
    assert.match(a[0]?.ileti ?? '', /sürüm denetimi/);
    const s500 = sahteSunucu((c) => (c.yol.endsWith('/canliya-al') ? { durum: 500, govde: {} } : undefined));
    const b = (await kos('u7', s500)).filter((x) => x.adim === 'planı canlıya al');
    assert.deepEqual([...new Set(b.map((x) => x.sonuc))], ['dustu']);
    assert.equal(sayac(s500.cagrilar, /arkon/), 0);
  });

  it('kuyruk yazımında eski sürüm (409) düşmüş sayılmaz; motorun reddi (409) düşer; ikisinde de canlıya alınmaz', async () => {
    const eski = sahteSunucu((c) => (c.yol === '/api/plan/kuyruklari-yaz' ? { durum: 409, govde: { kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI, ayrinti: { neden: ESKI_SURUM_NEDENI } } } : undefined));
    const a = (await kos('u8', eski)).filter((x) => x.adim === 'emrin işlerini kuyruğa yaz');
    assert.deepEqual([...new Set(a.map((x) => x.sonuc))], ['gecti']);
    assert.equal(sayac(eski.cagrilar, /canliya-al/), 0);
    const ret = sahteSunucu((c) => (c.yol === '/api/plan/kuyruklari-yaz' ? { durum: 409, govde: { kod: 'CAKISMA', mesaj: 'Sunucu motoru şu işleri yerleştiremedi' } } : undefined));
    const b = (await kos('u9', ret)).filter((x) => x.adim === 'emrin işlerini kuyruğa yaz');
    assert.deepEqual([...new Set(b.map((x) => x.sonuc))], ['dustu']);
    assert.equal(sayac(ret.cagrilar, /canliya-al|arkon/), 0);
  });
});
