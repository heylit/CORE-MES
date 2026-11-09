import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { DOSYA_EN_BUYUK_BAYT, damga, planKur, sayfaTanimi, type ExcelTanimi } from './kurallar.ts';
import { DosyaReddi, dosyaDenetle, dosyaOku, sablonYaz } from './kitap.ts';

// Sentetik veri (kırmızı çizgi): gerçek ad ya da kod yok.
interface Kayit { kod: string; ad: string; gizli: string; merkez: string; tarih: string; oran: number }
const KAYITLAR: Kayit[] = [
  { kod: 'K1', ad: '=HYPERLINK("http://ornek.invalid","tikla")', gizli: 'GIZLI-ALAN-DEGERI', merkez: 'IM1', tarih: '2026-11-09', oran: 2.5 },
  { kod: 'K2', ad: 'Düz, "tırnaklı" ad', gizli: 'GIZLI-ALAN-DEGERI', merkez: 'IM2', tarih: '2026-01-31', oran: 1 },
];
const tanim: ExcelTanimi = {
  ad: 'deneme', baslik: 'Deneme', kilavuz: ['Kılavuz satırı.'],
  sayfalar: [sayfaTanimi<Kayit>({
    ad: 'Kayıtlar', kayitTuru: 'kayit', anahtarSutun: 'kod', kayitlar: KAYITLAR, anahtar: (k) => k.kod,
    sutunlar: [
      { anahtar: 'kod', baslik: 'Kod', tur: 'kod', zorunlu: true },
      { anahtar: 'ad', baslik: 'Ad', tur: 'metin', zorunlu: true },
      { anahtar: 'merkez', baslik: 'İş merkezi', tur: 'liste', liste: [{ kod: 'IM1', ad: 'Bir, "virgüllü"' }, { kod: 'IM2', ad: 'İki' }] },
      { anahtar: 'tarih', baslik: 'Tarih', tur: 'tarih' },
      { anahtar: 'oran', baslik: 'Oran', tur: 'sayi' },
      { anahtar: 'aktif', baslik: 'Aktif', tur: 'evet-hayir' },
    ],
    // Kayıt nesnesinde ekranda gösterilmeyen alan (gizli) var; şablona yalnız tanımın sütunları yazılır.
    satir: (k) => ({ kod: k.kod, ad: k.ad, merkez: k.merkez, tarih: k.tarih, oran: k.oran, aktif: true }),
  })],
};
const dosya = (b: ArrayBuffer, ad = 'deneme.xlsx') => new File([b], ad);
const kitapAc = async (b: ArrayBuffer) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(b); return wb; };

describe('şablon (exceljs ile gerçek dosya)', () => {
  it('dolu şablon geri okunur; plan değişmeyen satırlar çıkarır', async () => {
    const b = await sablonYaz(tanim, { dolu: true });
    const { plan, uyari } = planKur(tanim, await dosyaOku(tanim, dosya(b)));
    expect(uyari).toBeNull();
    expect(plan.map((p) => [p.kod, p.islem, p.hatalar])).toEqual([['K1', 'ayni', []], ['K2', 'ayni', []]]);
  });

  it('kullanıcı metni formül olmaz ve aynı metin olarak geri gelir (Güvenlik K2)', async () => {
    const b = await sablonYaz(tanim, { dolu: true });
    const wb = await kitapAc(b);
    const hucre = wb.getWorksheet('Kayıtlar')!.getCell('B2');
    expect(hucre.type).not.toBe(ExcelJS.ValueType.Formula);
    expect(typeof hucre.value).toBe('string');
    const { plan } = planKur(tanim, await dosyaOku(tanim, dosya(b)));
    expect(plan[0]?.degerler['ad']).toBe(KAYITLAR[0]!.ad);
    wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell((c) => { expect(c.type).not.toBe(ExcelJS.ValueType.Formula); })));
  });

  it('açılır liste adlandırılmış aralığa dayanır; gizli Listeler yalnız kod ve ad taşır; tanım dışı alan hiçbir hücrede yok (Güvenlik K1)', async () => {
    const wb = await kitapAc(await sablonYaz(tanim, { dolu: true }));
    const L = wb.getWorksheet('Listeler')!;
    expect(L.state).toBe('hidden');
    expect(wb.definedNames.model.map((d) => d.name)).toEqual(['liste_1']);
    const dogrulama = (wb.getWorksheet('Kayıtlar') as unknown as { dataValidations: { model: Record<string, { formulae: string[] }> } }).dataValidations.model;
    const formuller = Object.values(dogrulama).map((d) => d.formulae[0]);
    expect(formuller).toContain('liste_1');
    expect(formuller.every((f) => f === 'liste_1' || f === '"Evet,Hayır"')).toBe(true);
    const izinli = new Set<string>([
      'Kayıtlar: İş merkezi', "IM1 — Bir, \"virgüllü\"", 'IM2 — İki',
      ...tanim.sayfalar[0]!.sutunlar.map((s) => (s.zorunlu ? `${s.baslik} *` : s.baslik)),
      ...KAYITLAR.flatMap((k) => [k.kod, `'${k.ad}`, k.ad]), 'IM1 — Bir, "virgüllü"', 'Evet',
    ]);
    const degerler: unknown[] = [];
    wb.eachSheet((ws) => {
      if (ws.name === 'Nasıl kullanılır') return;
      ws.eachRow((r) => r.eachCell((c) => { degerler.push(c.value); }));
    });
    expect(JSON.stringify(degerler)).not.toContain('GIZLI-ALAN-DEGERI');
    for (const d of degerler) if (typeof d === 'string') expect(izinli.has(d), d).toBe(true);
  });

  it('tarih gg.aa.yyyy hücresi, ondalık sayı hücresi olarak yazılır', async () => {
    const wb = await kitapAc(await sablonYaz(tanim, { dolu: true }));
    const ws = wb.getWorksheet('Kayıtlar')!;
    expect(ws.getCell('D2').value).toEqual(new Date('2026-11-09T00:00:00Z'));
    expect(ws.getColumn(4).numFmt).toBe('dd.mm.yyyy');
    expect(ws.getCell('E2').value).toBe(2.5);
  });

  it('formül hücresinin yalnız kayıtlı sonucu okunur', async () => {
    const wb = await kitapAc(await sablonYaz(tanim));
    const ws = wb.getWorksheet('Kayıtlar')!;
    ws.getCell('A2').value = 'K9';
    ws.getCell('B2').value = { formula: 'CONCAT("a","b")', result: 'ab' };
    const { plan } = planKur(tanim, await dosyaOku(tanim, dosya(await wb.xlsx.writeBuffer() as ArrayBuffer)));
    expect(plan[0]?.degerler['ad']).toBe('ab');
  });

  it('hata dosyası satırları ve Sonuç sütununu taşır', async () => {
    const b = await sablonYaz(tanim, { sonuclar: { 'Kayıtlar': [{ hucreler: ['K5', null], sonuc: 'Ad zorunlu.' }] } });
    const ws = (await kitapAc(b)).getWorksheet('Kayıtlar')!;
    expect(ws.getCell('G1').value).toBe('Sonuç');
    expect([ws.getCell('A2').value, ws.getCell('G2').value]).toEqual(['K5', 'Ad zorunlu.']);
  });
});

describe('dosya denetimi ayrıştırmadan önce (Güvenlik K3)', () => {
  const zip = (ek = ''): Uint8Array => new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...[...ek].map((c) => c.charCodeAt(0))]);
  it('boyut, uzantı, ZIP imzası ve makro', () => {
    expect(() => dosyaDenetle('a.xlsx', new Uint8Array(DOSYA_EN_BUYUK_BAYT + 1))).toThrow(DosyaReddi);
    expect(() => dosyaDenetle('a.xlsm', zip())).toThrow(/Yalnız .xlsx/);
    expect(() => dosyaDenetle('a.xlsx', new TextEncoder().encode('kod;ad'))).toThrow(/Yalnız .xlsx/);
    expect(() => dosyaDenetle('a.xlsx', zip('....xl/vbaProject.bin'))).toThrow(/Makro/);
    expect(() => dosyaDenetle('a.xlsx', zip())).not.toThrow();
  });
  it('bozuk zip ve başka sayfanın şablonu anlaşılır iletiyle reddedilir', async () => {
    await expect(dosyaOku(tanim, dosya(zip('bozuk').buffer as ArrayBuffer))).rejects.toThrow(/okunamadı/);
    const baska = await sablonYaz({ ...tanim, ad: 'baska' });
    await expect(dosyaOku(tanim, dosya(baska))).rejects.toThrow(/şablonu değil/);
    expect(damga(tanim)).toBe('core-mes-excel:deneme:1');
  });
});
