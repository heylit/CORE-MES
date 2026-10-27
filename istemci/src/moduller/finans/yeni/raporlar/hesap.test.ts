import { describe, expect, it } from 'vitest';
import { ornekHamVeri } from '../ornek-ham-veri.ts';
import { finansiKur } from '../veri.ts';
import { sum } from '../motor.ts';
import {
  basabas, bilancoGovdesi, ilgiliSekme, ilkKapanisAyi, KAPANIS_MADDELERI, kapanisAylari, kapanisIlerlemesi, kredi, gelirCsvSatirlari, gelirTablosu,
  modelVar, oneriGovdesi, skorDurumu, yatirim,
} from './hesap.ts';

const BUGUN = '2026-10-23';
const kur = () => finansiKur(ornekHamVeri(), BUGUN);

describe('raporlar: saf hesaplar', () => {
  it('skor rengi prototip eşikleriyle (65 ve 50)', () => {
    expect([skorDurumu(null), skorDurumu(65), skorDurumu(64), skorDurumu(50), skorDurumu(49)]).toEqual([undefined, 'calisiyor', 'durakli', 'durakli', 'durdu']);
  });

  it('motorun her bulgu bağı bir sekmeye iner; model bağı yalnız altı modelden biri', () => {
    const { motor } = kur();
    for (const f of motor.runAnalysis().findings) expect(ilgiliSekme(f.link), f.id).not.toBeNull();
    expect(['cari', 'cek', 'islem', 'nakit', 'butce', 'oran', 'modeller', 'surec'].map(ilgiliSekme))
      .toEqual(['firmalar', 'cekler', 'kayitlar', 'nakit', 'butce', 'durum', 'tahminler', 'ay-sonu']);
    expect([modelVar('mc'), modelVar('anom'), modelVar('ratio'), modelVar(null)]).toEqual([true, true, false, false]);
  });

  it('öneri gövdesi: Kapat "kapatildi" gider, ertelemede bitiş günü vardır', () => {
    expect(oneriGovdesi('dso', 'yoksay', '2026-10-30')).toEqual({ bulguKimligi: 'dso', durum: 'kapatildi' });
    expect(oneriGovdesi('dso', 'ertelendi', '2026-10-30')).toEqual({ bulguKimligi: 'dso', durum: 'ertelendi', erteleBitis: '2026-10-30' });
    expect(oneriGovdesi('dso', 'acik', '2026-10-30')).toEqual({ bulguKimligi: 'dso', durum: 'acik' });
  });

  it('bilanço gövdesi kayıtlı ayarı korur, yalnız bilançoyu değiştirir (biçim derlemede sözleşmeyle denetlenir)', () => {
    const { V } = kur();
    const g = bilancoGovdesi(V.ayar, { donen: 500000, stok: 0, kvb: 200000, toplamBorc: 300000, ozkaynak: 400000, birikmisKar: -5000 });
    expect(g).toMatchObject({ sirketAdi: V.ayar.sirketAdi, surum: V.ayar.surum, bilancoDonen: 500000, bilancoStok: null, bilancoBirikmisKar: -5000 });
    expect(Object.keys(g)).not.toContain('caprazKurPayi');
  });

  it('gelir tablosu: kategori satırları toplamı tutar, toplamlar motorun aylarıyla aynı', () => {
    const { motor } = kur();
    const T = gelirTablosu(motor, 12), m = motor.completeMonths(12);
    expect(T.aylar).toEqual(m.map((r) => r.ym));
    expect(T.toplamGelir.aylar).toEqual(m.map((r) => r.gelir));
    expect(T.toplamGider.aylar).toEqual(m.map((r) => r.gider));
    T.aylar.forEach((_, i) => {
      expect(sum(T.gelirler, (s) => s.aylar[i]!)).toBeCloseTo(T.toplamGelir.aylar[i]!, 6);
      expect(sum(T.giderler, (s) => s.aylar[i]!)).toBeCloseTo(T.toplamGider.aylar[i]!, 6);
    });
    const iade = T.giderler.find((s) => s.ad === 'Satış iadesi');
    expect(iade?.toplam).toBeGreaterThan(0);
    expect(T.giderler.indexOf(iade!)).toBeGreaterThan(T.giderler.findIndex((s) => s.ad === 'Mal / hammadde alımı'));
    expect(T.net.toplam).toBeCloseTo(T.toplamGelir.toplam - T.toplamGider.toplam, 6);
    const csv = gelirCsvSatirlari(motor, 6);
    expect(csv.basliklar).toEqual(['Ay', 'Gelir', 'Gider', 'Net kâr']);
    expect(csv.satirlar).toHaveLength(6);
  });

  it('başabaş, yatırım ve kredi prototipteki formüllerle', () => {
    const be = basabas({ fixed: 450000, price: 1200, varCost: 780, units: 1300 });
    expect(be.katki).toBe(420);
    expect(be.adet).toBeCloseTo(450000 / 420, 9);
    expect(be.guvenlik).toBeCloseTo((1300 - 450000 / 420) / 1300, 9);
    expect(basabas({ fixed: 1, price: 5, varCost: 6, units: 1 })).toMatchObject({ adet: null, ciro: null, guvenlik: null });

    const yt = yatirim({ cost: 1000, cash: 600, years: 2, rate: 0, salvage: 0 });
    expect(yt.nbd).toBeCloseTo(200, 9);
    expect(yt.donus).toBeCloseTo(1 + 400 / 600, 9);
    expect(yt.bugunku).toEqual([-1000, -400, 200]);

    const k = kredi({ amount: 1200, rate: 0, months: 12 }, 1000);
    expect(k).toMatchObject({ taksit: 100, toplamFaiz: 0, oran: 0.1, ton: 'ok' });
    expect(kredi({ amount: 1000, rate: 1, months: 12 }, -5)).toMatchObject({ oran: null, ton: 'risk' });
    expect(kredi({ amount: 1000, rate: 1, months: 12 }, 1000).taksit).toBeCloseTo(1000 * 0.01 / (1 - Math.pow(1.01, -12)), 9);
  });

  it('kapanış: üç ay, ilk yarıda geçen ay, ilerleme sayısı', () => {
    expect(kapanisAylari('2026-01-10')).toEqual(['2026-01', '2025-12', '2025-11']);
    expect([ilkKapanisAyi('2026-10-15'), ilkKapanisAyi('2026-10-16')]).toEqual(['2026-09', '2026-10']);
    expect(KAPANIS_MADDELERI).toHaveLength(10);
    expect(kapanisIlerlemesi({ banka: true, kasa: false, yok: true })).toBe(1);
    expect(kapanisIlerlemesi(undefined)).toBe(0);
  });
});
