import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KmNumuneKurali, KmResim, KmStudyoParcaCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { kmAc, MUAYENECI, MUHENDIS, type SunucuSecenegi } from '../yeni/test-ortak.tsx';
import { ilkParcaAcik, ilkParcaKarari, olcuSecimi, olcuYaz, planEksigi, SABLONLAR, zamanYaz } from './numune-plani.ts';

// 3689-2: ilk parçanın tek kaynağı Kalite Merkezi numune planı. Uydurma deneme verisi: iki operasyonlu rota, bir grup, Op 30'da rotada olmayan eski plan.
const ILK: KmNumuneKurali = { kimlik: 'k1', ne: 'ilk', kim: ['kalite'], balonlar: 'hepsi', kapi: true };
const GRUP = { id: 5, ad: 'A', balonlar: [3, 1], operasyonlar: [] };

describe('numune planı kuralları (3689-2)', () => {
  it('kapı yalnız ilk parça kuralında; zaman değişince n ve kapı kurala uyar', () => {
    expect(planEksigi([ILK])).toBeNull();
    expect(planEksigi([{ ...ILK, ne: 'son' }])).toMatch(/yalnız ilk parça/);
    expect(planEksigi([{ kimlik: 'k2', ne: 'her', n: 0, kim: ['operator'], balonlar: 'kritik' }])).toMatch(/pozitif tam sayı/);
    const her = zamanYaz(ILK, 'her');
    expect(her).toEqual({ kimlik: 'k1', ne: 'her', n: 50, kim: ['kalite'], balonlar: 'hepsi' });
    expect(zamanYaz(her, 'ilk')).toEqual({ kimlik: 'k1', ne: 'ilk', kim: ['kalite'], balonlar: 'hepsi', kapi: true });
  });

  it('grup seçimi kayıt anında balon numaralarına açılır; şablonlar kullanıcı metnindeki kurallardır', () => {
    expect(olcuYaz('g5', 'hepsi', [GRUP])).toEqual([1, 3]);
    expect(olcuSecimi([1, 3], [GRUP])).toBe('g5');
    expect(olcuSecimi([1], [GRUP])).toBe('secili');
    expect(SABLONLAR.map((s) => s.kurallar().map((k) => [k.ne, k.n ?? null, k.kim.join('+'), k.kapi === true]))).toEqual([
      [['ilk', null, 'kalite', true]],
      [['ilk', null, 'kalite', true], ['her', 50, 'operator', false], ['son', null, 'kalite', false]],
    ]);
    expect(ilkParcaAcik(SABLONLAR[1]!.kurallar())).toBe(true);
    expect(ilkParcaAcik([{ ...ILK, kapi: false }])).toBe(false);
    expect([ilkParcaKarari([ILK]), ilkParcaKarari([]), ilkParcaKarari([{ ...ILK, kapi: false }])]).toEqual([true, false, null]);
  });
});

const resim: KmResim = {
  id: 1, malzemeNo: 7, tur: 'resim', merkezBelgeId: 11, ozet: 'a'.repeat(64), ad: 'Deneme resim', revizyon: 'B', aktif: true, surum: 1,
  eklendi: '2026-10-20T08:00:00.000Z', balonlar: [], gruplarSurum: 1, gruplar: [GRUP],
};
const parca = (o: Partial<KmStudyoParcaCevabi> = {}): KmStudyoParcaCevabi => ({
  resimler: [resim], alinmamis: 0,
  numunePlanlari: [{ opNo: 10, surum: 2, kurallar: [ILK] }, { opNo: 30, surum: 1, kurallar: [{ ...ILK, kimlik: 'e1' }] }],
  operasyonlar: [{ operasyonId: 101, opNo: 10, ad: 'Tornalama' }, { operasyonId: 102, opNo: 20, ad: 'Frezeleme' }], ...o,
});
const secenek = (o: Partial<SunucuSecenegi> = {}, p = parca()): SunucuSecenegi => ({
  parcalar: [{ malzemeNo: 7, kod: 'ORN-07', ad: 'Örnek gövde', aktif: true }], emirler: [], studyo: { parcalar: { 7: p } }, ...o,
});
const planPaneli = async () => screen.findByRole('complementary', { name: 'Numune planı ve numuneler' });
const opAc = async (ad: RegExp) => { const p = await planPaneli(); fireEvent.click(await within(p).findByRole('button', { name: ad })); return p; };

describe('Numune planı düzenleyicisi (3689-2, A)', () => {
  it('rotadaki oplar akordeonda; şablonla Op 20 planı yazılır, sürüm null gider; rotada olmayan eski plan salt okunur', async () => {
    const s = kmAc('resimler?parca=7', MUHENDIS, {}, secenek());
    const p = await opAc(/Op 20/);
    expect(within(p).getByText('Plan yok')).toBeTruthy();
    expect(within(p).getByText('Rotada yok')).toBeTruthy();
    fireEvent.change(within(p).getByLabelText('Şablon uygula'), { target: { value: 'ilk-her-son' } });
    expect(within(p).getAllByLabelText(/kural ne zaman/)).toHaveLength(3);
    expect(within(p).getAllByLabelText('Kalite kararına kadar sayım kilitli (kapı)')).toHaveLength(1);
    expect((within(p).getByRole('button', { name: /Op 10/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(p).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => {
      const y = s.yazmalar.find((x) => x.yol === '/kalite-merkezi/studyo/parcalar/7/numune-planlari/20');
      expect(y?.govde).toMatchObject({ surum: null, kurallar: [{ ne: 'ilk', kapi: true }, { ne: 'her', n: 50, kim: ['operator'] }, { ne: 'son' }] });
    });
  });

  it('R1 geçiş: kapısız planda rota seçimi geçerli der ve onaysız kaydeder; kuralsız plan onay ister; 409 çakışma şeridi gösterir', async () => {
    const s = kmAc('resimler?parca=7', MUHENDIS, {}, secenek({ cakisma: (y) => y.endsWith('/numune-planlari/10') }));
    const p = await opAc(/Op 10/);
    fireEvent.click(within(p).getByLabelText('Kalite kararına kadar sayım kilitli (kapı)'));
    expect(within(p).getByText(/rotadaki ilk parça seçimi geçerli kalır/)).toBeTruthy();
    fireEvent.click(within(p).getByRole('button', { name: '1. kuralı sil' }));
    fireEvent.click(within(p).getByRole('button', { name: 'Kaydet' }));
    const onay = await screen.findByRole('dialog');
    expect(within(onay).getByText(/ilk parça onayı istenmez/)).toBeTruthy();
    expect(s.yazmalar.some((y) => y.yol.endsWith('/numune-planlari/10'))).toBe(false);
    fireEvent.click(within(onay).getByRole('button', { name: 'Vazgeç' }));
    fireEvent.change(within(p).getByLabelText('Şablon uygula'), { target: { value: 'ilk' } });
    fireEvent.click(within(p).getByLabelText('Kalite kararına kadar sayım kilitli (kapı)'));
    fireEvent.click(within(p).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(within(p).getByText(/başka biri tarafından değiştirildi/)).toBeTruthy(); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(s.yazmalar.find((y) => y.yol.endsWith('/numune-planlari/10'))?.govde).toMatchObject({ surum: 2, kurallar: [{ ne: 'ilk', kapi: false }] });
  });

  it('eski planda ilk parça dışındaki kapı kaydı kapatır; kaldırılınca açılır', async () => {
    const p0 = parca({ numunePlanlari: [{ opNo: 10, surum: 2, kurallar: [{ kimlik: 'k9', ne: 'son', kim: ['kalite'], balonlar: 'hepsi', kapi: true }] }] });
    kmAc('resimler?parca=7', MUHENDIS, {}, secenek({}, p0));
    const p = await opAc(/Op 10/);
    expect(within(p).getByRole('alert').textContent).toMatch(/Kapı yalnız ilk parça kuralında/);
    fireEvent.change(within(p).getByLabelText('1. kural ne zaman'), { target: { value: 'vardiya' } });
    fireEvent.click(within(p).getByRole('button', { name: 'Kural ekle' }));
    expect((within(p).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('kalite onayı olmayan planı salt okunur görür ve geçmişi açabilir', async () => {
    kmAc('resimler?parca=7', MUAYENECI, {}, secenek({ planGecmisi: [{ zaman: '2026-11-20T08:00:00.000Z', kisiAd: 'Deneme Mühendis', kurallar: [ILK] }] }));
    const p = await opAc(/Op 10/);
    expect(within(p).queryByRole('button', { name: 'Kural ekle' })).toBeNull();
    expect(within(p).getByText('Planı kalite onayı yetkisi olan düzenler.')).toBeTruthy();
    fireEvent.click(within(p).getByRole('button', { name: /Geçmiş · sürüm 2/ }));
    expect(await within(p).findByText(/Deneme Mühendis/)).toBeTruthy();
  });
});
