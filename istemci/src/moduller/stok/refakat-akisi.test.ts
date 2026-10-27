import { describe, expect, it } from 'vitest';
import {
  adimSatirlari, anSatirlari, asamalar, cycleSatirlari, islemPlaniDk, kartAdedi, leadDagilimi, miniRota, odakAdimi, ozetKutulari, planLeadDk, saat, sonAnMetni,
  sureMetni, sureOzetiSatirlari, tarihSaat, tekliCubuklar,
} from './refakat-akisi.ts';
import { ORNEK_AKIS, ORNEK_OZET, t } from './test-refakat.ts';

const B = { urun: 'Mil 40 (örnek)' };

describe('refakat kartının rotası (kart #708)', () => {
  it('süre metni gün, saat ve dakikadır; ölçülemeyen süre tire', () => {
    expect([sureMetni(null), sureMetni(0), sureMetni(59.6), sureMetni(65), sureMetni(1500)]).toEqual(['—', '0 dk', '1 sa 00 dk', '1 sa 05 dk', '1 g 1 sa']);
  });

  it('aşamalar: lot, adımın önü, adım, çıkışı (şimdi, yolda), sıradaki adımlar ve kapanış', () => {
    const l = asamalar(ORNEK_AKIS, B);
    expect(l.map((s) => [s.kod, s.baslik, s.durum])).toEqual([
      ['LOT', 'Hammadde lotu · L-26-00417', 'gecti'],
      ['', 'Torna 2 önünde', 'gecti'],
      ['OP10', 'OP10 · Torna 2', 'gecti'],
      ['', 'Torna 2 → Freze 1', 'simdi'],
      ['OP20', 'OP20 · Freze 1', 'sirada'],
      ['OP30', 'OP30 · Taşlama', 'sirada'],
      ['OP40', 'OP40 · Kalite', 'sirada'],
      ['SON', 'Mamul deposu ya da sevk', 'sirada'],
    ]);
    const [lot, once, op, cikis, op20] = l;
    expect(lot!.anlar.map((a) => a.ad)).toEqual(['Mal kabul edildi', 'Karta yüklendi', 'Yola çıktı']);
    expect(lot!.anlar[0]!.alanlar.map((f) => f.ad)).toEqual(['Lot', 'Döküm', 'Sertifika', 'Tedarikçi parti']);
    expect([lot!.sureDk, lot!.alt]).toEqual([4190, 'mal kabulden karta yüklemeye 2 g 21 sa']);
    expect([once!.sureDk, once!.alt, once!.anlar.map((a) => [a.ad, a.farkDk])]).toEqual([68, 'yolda 3 dk · bekledi 1 sa 05 dk', [['Teslim alındı', 3]]]);
    expect(op!.alt).toBe('ayar 28 dk · üretim 5 sa 03 dk · duruş 15 dk');
    expect(op!.giren).toEqual([{ miktar: '52 adet', ad: 'ORN-HM-40 Çubuk 40 (örnek) · sarf' }]);
    expect(op!.cikan).toEqual([
      { miktar: '50', ad: 'Mil 40 (örnek) · OP10' }, { miktar: '2', ad: 'hurda · Çap dışı', ton: 'stop' },
      { miktar: '8 adet', ad: 'ORN-HM-40 Çubuk 40 (örnek) · kalan', ton: 'soluk' },
    ]);
    expect(op!.anlar.map((a) => a.ad)).toEqual(['Ayar başladı', 'Üretim başladı', 'Durdu', 'Devam etti', 'Bitti']);
    expect(op!.anlar[2]!.alanlar).toEqual([{ ad: 'Neden', deger: 'Takım değişimi' }, { ad: 'O ana kadar', deger: '18 sağlam' }, { ad: 'Operatör', deger: 'Operatör A' }]);
    expect(op!.anlar[4]!.alanlar.map((f) => `${f.ad} ${f.deger}`)).toEqual(['Sağlam 50', 'Hurda 2', 'Brüt birim 6,1 dk', 'Net birim 5,8 dk', 'Tekli ort. 6,3 dk']);
    expect([cikis!.alt, cikis!.acik, cikis!.anlar.map((a) => [a.ad, a.farkDk, a.simdi])]).toEqual([
      'yolda 38 dk · bekledi 34 dk, sürüyor', true, [['Teslim edildi', 34, false], ['Yolda', 38, true]],
    ]);
    expect(cikis!.giren).toEqual([{ miktar: '50', ad: 'Mil 40 (örnek) · OP10' }]);
    expect([op20!.alt, op20!.sureDk, op20!.planli, op20!.giren[0]?.miktar]).toEqual(['plan: ayar 25 dk, cycle 3,6 dk', 25 + 3.6 * 50, true, '50']);
  });

  it('plan saatleri (750 a): adımın önünde planlanan başlangıç ve başlama farkı, biten adımda bitiş farkı ve taban, sıradakinde gecikme, kapanışta termin', () => {
    const z = (dk: number) => Date.parse(t(dk));
    const l = asamalar(ORNEK_AKIS, B);
    expect(l.map((s) => (s.plan ? [s.plan.metin, s.plan.fark, s.plan.farkTon, s.plan.taban] : null))).toEqual([
      null,
      [`${saat(z(4228))} başlangıç`, '30 dk geç başladı', 'bekle', ''],
      [`${saat(z(4228))} → ${saat(z(4550))}`, 'bitiş 54 dk geç', 'bekle', `taban ${saat(z(4200))} → ${saat(z(4500))}`],
      null,
      [`${tarihSaat(z(4620))} → ${saat(z(4826))}`, 'plana göre 56 dk gecikmede', 'stop', ''],
      [`${tarihSaat(z(6000))} → ${saat(z(6100))}`, '', 'soluk', ''],
      [`${tarihSaat(z(6120))} → ${saat(z(6145))}`, '', 'soluk', ''],
      ['termin 30.10.2026', '', 'soluk', ''],
    ]);
    expect(planLeadDk(ORNEK_AKIS)).toBe(6145 - 4188);
    const planSiz = { ...ORNEK_AKIS, rota: ORNEK_AKIS.rota.map((r) => ({ ...r, plan: null, taban: null })) };
    expect(asamalar(planSiz, B).filter((s) => s.tur !== 'son').every((s) => s.plan === undefined)).toBe(true);
    expect(planLeadDk(planSiz)).toBeNull();
    expect(ozetKutulari(planSiz, leadDagilimi(planSiz))[0]!.fark).toBe('işlem planı 5 sa 16 dk · +54%');
    const erken = { ...ORNEK_AKIS, rota: ORNEK_AKIS.rota.map((r) => (r.opNo === 10 ? { ...r, plan: { baslangic: t(4268), bitis: t(4604) } } : r)) };
    expect(asamalar(erken, B)[1]!.plan?.fark).toBe('10 dk erken başladı');
    expect(asamalar(erken, B)[2]!.plan?.fark).toBe('');
  });

  it('lead dağılımı karta yüklemeden şimdiye; operasyon parçası önce, yol sonra, kalan stokta bekleme', () => {
    const d = leadDagilimi(ORNEK_AKIS)!;
    expect([d.bas, d.bit]).toEqual([Date.parse(t(4188)), Date.parse(t(4676))]);
    expect(d.parcalar.map((p) => [p.tur, p.dk])).toEqual([['stok', 2], ['yol', 3], ['stok', 65], ['ayar', 28], ['uretim', 95], ['durus', 15], ['uretim', 208], ['stok', 34], ['yol', 38]]);
    expect(d.toplamlar).toEqual({ stok: 101, yol: 41, ayar: 28, uretim: 303, durus: 15, fason: 0 });
    expect(d.parcalar.reduce((s, p) => s + p.pay, 0)).toBeCloseTo(1);
  });

  it('özet kutuları, cycle çubukları, süre özeti ve tekli dizi', () => {
    expect(kartAdedi(ORNEK_AKIS)).toBe(52);
    expect(islemPlaniDk(ORNEK_AKIS)).toBe(316);
    expect(ozetKutulari(ORNEK_AKIS, leadDagilimi(ORNEK_AKIS)).map((k) => [k.ad, k.deger, k.fark])).toEqual([
      ['Lead time · gerçek', '8 sa 08 dk (sürüyor)', 'plan 1 g 8 sa · 1 g 0 sa kaldı'],
      ['Operasyonda / lead', '%71', '5 sa 46 dk / 8 sa 08 dk'],
      ['OP10 cycle · gerçek', '5,8 dk', 'plan 5,5 · emir 5,6 · +5%'],
      ['Hammadde yaşı', '2 g 21 sa', 'mal kabulden karta yüklemeye'],
    ]);
    expect(cycleSatirlari(ORNEK_AKIS).map((c) => [c.ad, c.plan, c.gercek, c.ton])).toEqual([
      ['OP10 Torna 2', 5.5, 5.8, 'bekle'], ['OP20 Freze 1', 3.6, null, 'soluk'], ['OP30 Taşlama', 1.7, null, 'soluk'], ['OP40 Kalite', 0.5, null, 'soluk'],
    ]);
    const odak = odakAdimi(ORNEK_AKIS)!;
    expect(odak.opNo).toBe(10);
    expect(sureOzetiSatirlari(ORNEK_AKIS, odak).map((s) => [s.ad, s.plan, s.kart, s.emir])).toEqual([
      ['Hazırlık (ayar)', '30 dk', '28 dk', '28 dk'], ['Brüt birim', '—', '6,1 dk', '5,9 dk'], ['Net birim (cycle)', '5,5 dk', '5,8 dk', '5,6 dk'],
      ['Tekli ortalama', '5,5 dk', '6,3 dk', '5,6 dk'], ['Sağlam / hurda', '52 / 0', '50 / 2', '98 / 3'],
    ]);
    expect(tekliCubuklar(ORNEK_AKIS, odak).cubuklar.map((c) => c.ton)).toEqual(['bekle', 'run', 'bekle', 'bekle', 'stop', 'bekle']);
  });

  it('tablolar: adımlarda geçen stok aşaması sonraki adımın önce beklemesidir; anlar kim ve durumla, sonda şimdi', () => {
    const l = asamalar(ORNEK_AKIS, B);
    expect(adimSatirlari(l, ORNEK_AKIS).map((r) => [r.adim, r.bekleme, r.ayar, r.cycle, r.sure, r.sapma])).toEqual([
      ['Lot', '2 g 21 sa', '', '', '2 g 21 sa', 'lead dışı'],
      ['OP10 Torna 2', '1 sa 08 dk', '30 / 28 dk', '5,5 / 5,8 dk', '5 sa 46 dk', '+5%'],
      ['Yolda', '1 sa 12 dk', '', '', 'sürüyor', ''],
      ['OP20 Freze 1', '', '25 / — dk', '3,6 / — dk', 'plan 3 sa 25 dk', ''],
      ['OP30 Taşlama', '', '15 / — dk', '1,7 / — dk', 'plan 1 sa 40 dk', ''],
      ['OP40 Kalite', '', '— / — dk', '0,5 / — dk', 'plan 25 dk', ''],
    ]);
    const anlar = anSatirlari(ORNEK_AKIS, B);
    expect(anlar.map((r) => [r.ad, r.durum, r.kim])).toEqual([
      ['Mal kabul edildi', 'Stokta', '—'], ['Karta yüklendi', 'Stokta', '—'], ['Teslim edildi', 'Yolda', 'Depocu A'], ['Teslim alındı', 'Stokta', 'Operatör A'],
      ['OP10 ayar başladı', 'Ayar', 'Operatör A'], ['OP10 üretim başladı', 'Operasyonda', 'Operatör A'], ['OP10 durdu · Takım değişimi', 'Duruş', 'Operatör A'],
      ['OP10 devam etti', 'Operasyonda', 'Operatör A'], ['OP10 bitti', 'Stokta', 'Operatör A'], ['Teslim edildi', 'Yolda', 'Operatör A'], ['Stokta · yolda', 'Yolda', '—'],
    ]);
    expect(anlar.find((r) => r.ad === 'OP10 bitti')).toMatchObject({ giren: '52 ORN-HM-40 Çubuk 40 (örnek) sarf', cikan: '50 Mil 40 (örnek), 2 hurda' });
    expect(anlar.at(-1)?.zaman).toMatch(/^şimdi /);
  });

  it('listedeki küçük rota ve son an', () => {
    expect(miniRota(ORNEK_OZET)).toEqual(['gecti', 'gecti', 'simdi', 'sirada', 'sirada']);
    expect(sonAnMetni(ORNEK_OZET)).toBe('Torna 2 → Freze 1 yolunda');
    expect(miniRota({ ...ORNEK_OZET, konum: { ...ORNEK_OZET.konum, durum: 'depoda' }, rota: ORNEK_OZET.rota.map((r) => ({ ...r, durum: 'sirada' as const })) }))
      .toEqual(['simdi', 'sirada', 'sirada', 'sirada', 'sirada']);
  });
});
