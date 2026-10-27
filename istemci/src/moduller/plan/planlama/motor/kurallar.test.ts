import { describe, expect, it } from 'vitest';
import { planGuncel } from '../durum.ts';
import { derle, girdiKur, olayAdi, planOku, plandanBitenler, saatYaz, sorunlar, veriDenetimi } from './kurallar.ts';
import { ornekCalisma } from './ornek.ts';
import { ACIK_TEZGAH_YOK, beklemeler, cevap, gostergeler, ozetVerisi, yorumlar, type Metin } from './ozet/veri.ts';
import { nabizDurumu } from './ust/nabiz.ts';

// Beklenen değerler eski sayfanın (cerceve/planlama) aynı örnek kayıtla ekrana yazdığı değerlerdir; kalın yazı <b> ile.
const html = (m: Metin) => m.map((x) => (typeof x === 'string' ? x : `<b>${x.b}</b>`)).join('');
function kur() {
  const c = ornekCalisma(); const p = planOku(c);
  if (!p) throw new Error('plan yok');
  const cx = derle(girdiKur(c, plandanBitenler(c, p)));
  const tg = (m: string) => c.D.tezgahlar.find((t) => t.id === m)?.grup ?? 'diger';
  return { c, p, cx, tg, v: ozetVerisi(c, p, cx, 'hafta', 0) };
}

describe('planlama motoru hesapları', () => {
  it('Yapılacaklar ve veri denetimi eski sayfanınkiyle aynı', () => {
    const { c, p, cx } = kur();
    expect(sorunlar(c, p, cx, planGuncel(c)).map((s) => [s.ton, s.baslik, s.eylem.tur])).toEqual([
      ['uyari', 'Plan eski veriyle hesaplı', 'ekip'], ['hata', '2 72,9 sa gecikiyor', 'one-al'], ['uyari', '10 veri bulgusu', 'git'],
    ]);
    expect(veriDenetimi(c, cx)).toHaveLength(10);
  });

  it('741 a: başlangıç gününden önceki gecenin vardiyası gece yarısından sonra da çalışma saatidir', () => {
    const { c, p } = kur();
    const gunler = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
    c.D.vardiyalar = [{ id: 'G', bas: '22:00', bit: '06:00' }];
    c.D.calismaGunleri = Object.fromEntries(gunler.map((g) => [g, ['G']]));
    c.D.tezgahlar = c.D.tezgahlar.map((m) => ({ ...m, vardiyalar: [] }));
    const sw = Object.values(derle(girdiKur(c, plandanBitenler(c, p))).M)[0]!.sw;
    expect(sw.slice(0, 2)).toEqual([[0, 6], [22, 30]]);
  });

  it('nabız bu haftayı ölçer ve önceki sürümle karşılaştırır', () => {
    const { c, p, cx } = kur();
    const n = nabizDurumu(c, p, cx, 'hafta', 0);
    expect(n.cur.zam).toBe(50); expect(n.cur.late).toBe(1); expect(n.cur.suH).toBeCloseTo(0.75, 6);
    expect(n.cur.wT).toBeCloseTo(72.92105263157893, 6); expect(n.cur.dar).toBeCloseTo(2.4189261031366036, 6);
    expect(n.donemYazi).toBe('19.10 Pzt – 25.10 Paz');
    expect(n.ozet).toEqual({ metin: 'Referansa göre 4 gösterge kötü, 1 iyi.', ton: 'kotu' });
  });

  it('Özet: eksen, beklemeler, yorumlar ve bölüm cevapları', () => {
    const { c, v, tg } = kur();
    expect([v.T0, v.H1, v.gun, v.gunAd, v.gruplar]).toEqual([0, 168, 7, ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'], ['1', '3', 'fason', '4', '5']]);
    expect(beklemeler(v).map((x) => [x.id, Math.round(x.bek * 100) / 100, Math.round(x.bekG * 100) / 100])).toEqual([
      ['1', 120, 0], ['3', 130.62, 130.62], ['fason', 2.75, 2.75], ['4', 0, 0], ['5', 0, 0],
    ]);
    const yor = yorumlar(c, v, tg);
    expect(yor.map((x) => [x.ton, html(x.m)])).toEqual([
      ['hata', "2 siparişin <b>1</b>'i zamanında, <b>1</b>'i geç. En çok geciken <b>2</b> (ORNEK Flanş), termininden <b>73 sa</b> sonra bitiyor."],
      ['uyari', 'Geç siparişleri en çok <b>Fason · 5</b> bekletiyor: toplam <b>2,8 sa</b>. Bu kaynağı rahatlatmak gecikmeyi en çok azaltır.'],
      ['bilgi', "Bir sipariş atölyede geçirdiği sürenin yalnız <b>%3</b>'ünde işleniyor. En büyük pay <b>başlangıç koşulu (serbest, malzeme, nc programı, kilit)</b> (%74)."],
      ['bilgi', "En yoğun gün <b>Cmt</b> (24.10): tezgâhların ortalama <b>%12</b>'si dolu."],
      ['bilgi', 'En boş grup <b>3</b> (%0), en dolu <b>1</b> (%2). Dolu gruptaki adımlara boş gruptan alternatif tezgâh tanımlamak yükü dengeler.'],
      ['bilgi', 'Ayara <b>0,8 sa</b> gidiyor (2 ayar).'],
      ['bilgi', 'Plandaki son işin bitişi: <b>27.10 Sal 17:55</b>.'],
    ]);
    expect((['ozet', 'bekle', 'yuk', 'sure', 'yaris', 'yorum'] as const).map((id) => html(cevap(c, v, id, yor)))).toEqual([
      "2 siparişin <b>1</b>'i zamanında, <b>1</b>'i geç (toplam 73 sa). Son işin bitişi: <b>27.10 Sal 17:55</b>.",
      "En çok bekleme <b>3</b> grubunda: 131 sa, bunun <b>131 sa</b>'i geç siparişlerin.",
      'En yoğun gün <b>Cmt 24.10</b> (ortalama %12). Plan boyunca en dolu tezgâh <b>1</b> (%2).',
      "Bir sipariş atölyede geçirdiği sürenin yalnız <b>%3</b>'ünde işleniyor. En büyük pay <b>başlangıç koşulu (serbest, malzeme, nc programı, kilit)</b> (%74).",
      '<b>1</b> sipariş geç; en çok geciken <b>2</b>, termininden 73 sa sonra biter.',
      'Veriden çıkan <b>7</b> gözlem; önce sorunlar.',
    ]);
    expect(gostergeler(c, v, tg).map((g) => [g.ad, g.deger])).toEqual([
      ['Sipariş', 2], ['Zamanında', 1], ['Geç', 1], ['Ortalama doluluk', 1], ['En yoğun tezgâh', '1'], ['Ayar', 1], ['Son iş biter', 'Sal 17:55'],
    ]);
  });

  it('dönem değişince Özet o dönemi gösterir; günde üçer saatlik sekiz sütun, yılda sütun haftadır', () => {
    const { c, p, cx } = kur();
    const gun = ozetVerisi(c, p, cx, 'gun', 0);
    expect([gun.T0, gun.H1, gun.gun, gun.kova * 24, gun.gunAd]).toEqual([0, 24, 8, 3, ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00']]);
    expect(gun.yuk.every((y) => y.g.length === 8)).toBe(true);
    const yil = ozetVerisi(c, p, cx, 'yil', 0);
    expect([yil.kova, yil.gun]).toEqual([7, 52]);
    expect(ozetVerisi(c, p, cx, 'hafta', 1).sip.map((s) => s.id)).toEqual(['2']);
  });

  it('açık tezgâh saati olmayan dönemde yüzde yerine durum yazılır (489/1 c)', () => {
    const { c, p, cx } = kur();
    const tg = (m: string) => c.D.tezgahlar.find((t) => t.id === m)?.grup ?? 'diger';
    const kapali = [0, 1, 2, 3, 4, 5, 6].map((k) => ozetVerisi(c, p, cx, 'gun', k)).find((v) => v.yuk.every((y) => y.g.every((x) => x == null)));
    if (!kapali) throw new Error('kapalı gün yok');
    const yor = yorumlar(c, kapali, tg);
    expect(yor.find((y) => y.simge === 'grid')?.m).toEqual([ACIK_TEZGAH_YOK]);
    expect(html(cevap(c, kapali, 'yuk', yor))).toMatch(/^Bu dönemde açık tezgâh yok\. Plan boyunca en dolu tezgâh /);
  });

  it('saat biçimi eski sayfanınki', () => {
    const { c } = kur();
    expect(saatYaz(c.D, 8)).toBe('19.10 Pzt 08:00');
    expect(saatYaz(c.D, null)).toBe('—');
  });
  it('olay adı süre sapmasını açıkça yazar: ürün, adım, çarpan, sipariş sayısı (494 b)', () => {
    const c = ornekCalisma(); const u = c.D.siparisler.find((x) => x.id === '2')?.urun;
    const ad = c.D.urunler.find((x) => x.id === u)?.ad ?? String(u); const n = c.D.siparisler.filter((x) => !x.havuz && x.urun === u).length;
    expect(olayAdi(c, { tip: 'sure', urun: u, k: '20', oran: 1.5 })).toBe(`${ad}, adım 20: süre ×1,5 (${String(n)} sipariş)`);
    expect(olayAdi(c, { tip: 'sureOp', id: '2.20', oran: 0.8 })).toBe('2.20: süre ×0,8');
  });
});
