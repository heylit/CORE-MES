import { describe, expect, it } from 'vitest';
import { ornekHamVeri } from '../ornek-ham-veri.ts';
import { finansiKur } from '../veri.ts';
import { firmaGovdesi, firmaIlkDegerleri } from './FirmaFormu.tsx';
import { ornekFirma } from './test-veri.ts';
import { acikBakiye, cariOzet, ekstre, ekstreCsvSatirlari, firmaTarafi, pasifOnKontrol } from './kurallar.ts';

const BUGUN = '2026-10-15';
const kur = () => finansiKur(ornekHamVeri(), BUGUN);

describe('Firmalar: rakamlar', () => {
  it('açık alacak ve borç açık belgelerin kalanı, kuruyla TL', () => {
    const { V } = kur();
    // Firma 1: belge 1 (600) ve 8 (1100) açık gelir; iade belgesi 4 (120) gider.
    expect(acikBakiye(V, 1, 'gelir')).toBe(1700);
    expect(acikBakiye(V, 1, 'gider')).toBe(120);
    // Firma 3: EUR belge, kalan 120 x kur 35.5.
    expect(acikBakiye(V, 3, 'gelir')).toBeCloseTo(4260);
  });

  it('cari tarafı: tedarikçi gider, müşteri ve ikisi gelir', () => {
    expect(firmaTarafi('tedarikci')).toBe('gider');
    expect(firmaTarafi('musteri')).toBe('gelir');
    expect(firmaTarafi('ikisi')).toBe('gelir');
  });
});

describe('Firmalar: pasife alma ön denetimi (FNS-60)', () => {
  it('açık fatura, dağıtılmamış ödeme ve sonuçlanmamış çek sayılır', () => {
    const { V } = kur();
    const m = pasifOnKontrol(V, 2)!;
    expect(m).toMatch(/^Firma pasife alınamaz: 1 açık fatura/);
    expect(m).toMatch(/1 faturaya dağıtılmamış ödeme/);
    expect(m).toMatch(/1 sonuçlanmamış çek\/senet/);
  });

  it('kalan kaydı olmayan firmada engel yok', () => {
    const ham = ornekHamVeri();
    ham.firmalar.push({ ...ham.firmalar[0]!, id: 4, ad: 'Bos Firma', kod: 'B1' });
    expect(pasifOnKontrol(finansiKur(ham, BUGUN).V, 4)).toBeNull();
  });
});

describe('Firmalar: cari hesap', () => {
  it('ekstre tarih sırasında, bakiye borç eksi alacak', () => {
    const { motor } = kur();
    const rows = ekstre(motor, 'Deneme Tedarik', 'gider');
    expect(rows.length).toBeGreaterThan(0);
    for (let i = 1; i < rows.length; i += 1) expect(rows[i - 1]!.date <= rows[i]!.date).toBe(true);
    const son = rows.at(-1)!;
    expect(son.bal).toBeCloseTo(rows.reduce((t, r) => t + r.d - r.c, 0));
    expect(rows.some((r) => /^Çek verildi/.test(r.desc))).toBe(true);
    const csv = ekstreCsvSatirlari(rows);
    expect(csv[0]![0]).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
  });

  it('özet: açık faturalar en eski vadeden, gecikmiş kısmı ayrı', () => {
    const { motor } = kur();
    const o = cariOzet(motor, 'Deneme Musteri · M1', 'gelir');
    expect(o.acik.length).toBeGreaterThan(0);
    for (let i = 1; i < o.acik.length; i += 1) expect(o.acik[i - 1]!.due <= o.acik[i]!.due).toBe(true);
    expect(o.gecikmis).toBeLessThanOrEqual(o.acikToplam);
    expect(o.elimizdekiCekler).toBeGreaterThan(0);
  });
});

describe('Firma formu', () => {
  it('yeni firma TR ve TRY ile başlar; vade günü sayı ya da null gider', () => {
    const d = firmaIlkDegerleri(null);
    expect(d).toMatchObject({ tur: 'musteri', fason: false, ulkeKodu: 'TR', paraBirimi: 'TRY', ad: '', vadeGunu: '' });
    expect(firmaGovdesi({ ...d, ad: 'Yeni', vadeGunu: '' }, null)).toMatchObject({ ad: 'Yeni', vadeGunu: null, tur: 'musteri' });
    expect(firmaGovdesi({ ...d, ad: 'Yeni', vadeGunu: '45' }, null)).toMatchObject({ vadeGunu: 45 });
  });

  it("Logo'ya gönderilmiş kartta kod ve Logo cari kodu kartın kendi değeriyle gider", () => {
    const f = ornekFirma({ logoKayitNo: 77, logoCariKodu: 'L-1' });
    const d = { ...firmaIlkDegerleri(f), kod: 'DEGISTI', logoCariKodu: 'DEGISTI', ad: 'Yeni ad' };
    expect(firmaGovdesi(d, f)).toMatchObject({ kod: 'M1', logoCariKodu: 'L-1', ad: 'Yeni ad' });
  });
});
