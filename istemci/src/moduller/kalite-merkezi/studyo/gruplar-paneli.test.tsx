import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KmResim, KmStudyoParcaCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { kmAc, MUAYENECI, MUHENDIS, type SunucuSecenegi } from '../yeni/test-ortak.tsx';

// Uydurma deneme verisi: iki balonlu resim, iki gruplu plan, üç operasyonlu rota (biri grupsuz).
const balon = (id: number, no: number) => ({
  id, no, nominal: `Ø${String(no)}0`, tolerans: null, alt: '9.9', ust: '10.1', alet: null, siklik: null, kritik: false, yontem: null, olcuAletiGerekir: false,
  tur: null, sayfa: 1, x: 10, y: 20, yaziKutusu: null, yer: null, yerKipi: null, yerKontrol: false, surum: 1,
});
const resim = (o: Partial<KmResim> = {}): KmResim => ({
  id: 1, malzemeNo: 7, tur: 'resim', merkezBelgeId: 11, ozet: 'a'.repeat(64), ad: 'Deneme resim', revizyon: 'B', aktif: true, surum: 1,
  eklendi: '2026-10-20T08:00:00.000Z', balonlar: [balon(1, 1), balon(2, 2)], gruplarSurum: 4,
  gruplar: [{ id: 5, ad: 'A', balonlar: [1], operasyonlar: [{ operasyonId: 101, opNo: 10 }] }, { id: 6, ad: 'B', balonlar: [2], operasyonlar: [] }], ...o,
});
const parca = (r: KmResim): KmStudyoParcaCevabi => ({
  resimler: [r], numunePlanlari: [], alinmamis: 0,
  operasyonlar: [{ operasyonId: 101, opNo: 10 }, { operasyonId: 102, opNo: 20 }],
});
const secenek = (r: KmResim): SunucuSecenegi => ({
  parcalar: [{ malzemeNo: 7, kod: 'DNM-07', ad: 'Deneme gövde', aktif: true }], emirler: [], studyo: { parcalar: { 7: parca(r) } },
});

describe('Balon grupları paneli (3693)', () => {
  it('grupsuz operasyon uyarı alır; kalite onaylı kullanıcı operasyonu gruba bağlar ve plan bütün olarak yazılır', async () => {
    const s = kmAc('resimler?parca=7', MUHENDIS, {}, secenek(resim()));
    const panel = await screen.findByRole('region', { name: 'Balon grupları' });
    expect(within(panel).getByText('Kontrol grubu yok')).toBeTruthy();
    expect(within(panel).getByText('Op 20 için bir grup bağlayın.')).toBeTruthy();
    const baglar = within(panel).getAllByLabelText('Operasyon bağla');
    fireEvent.change(baglar[1]!, { target: { value: '102' } });
    expect(within(panel).queryByText('Kontrol grubu yok')).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => {
      expect(s.yazmalar.find((y) => y.yol === '/kalite-merkezi/studyo/resimler/1/gruplar')?.govde).toEqual({
        surum: 4,
        gruplar: [{ id: 5, ad: 'A', balonlar: [1] }, { id: 6, ad: 'B', balonlar: [2] }],
        atamalar: [{ operasyonId: 101, grup: 'A' }, { operasyonId: 102, grup: 'B' }],
      });
    });
  });

  it('aynı ad (büyük küçük harf farkıyla) kaydetmeyi kapatır; onaysız kullanıcı düzenleyemez', async () => {
    kmAc('resimler?parca=7', MUHENDIS, {}, secenek(resim()));
    const panel = await screen.findByRole('region', { name: 'Balon grupları' });
    fireEvent.change(within(panel).getAllByLabelText('Grup adı')[1]!, { target: { value: 'a' } });
    expect(within(panel).getByRole('alert').textContent).toBe('Bu adla grup zaten var.');
    expect((within(panel).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('kalite onayı yoksa gruplar salt okunur görünür', async () => {
    kmAc('resimler?parca=7', MUAYENECI, {}, secenek(resim()));
    const panel = await screen.findByRole('region', { name: 'Balon grupları' });
    expect(within(panel).queryByRole('button', { name: 'Yeni grup' })).toBeNull();
    expect(within(panel).getByText('Grupları düzenlemek için kalite onayı gerekir.')).toBeTruthy();
  });

  it('gruplar ayrı bölgede durur; "Seçilileri ekle" resimden seçim yokken kapalıdır ve operasyon adı rotadan gelir', async () => {
    const r = resim();
    kmAc('resimler?parca=7', MUHENDIS, {}, { ...secenek(r), studyo: { parcalar: { 7: { ...parca(r), operasyonlar: [{ operasyonId: 101, opNo: 10, ad: 'Tornalama' }, { operasyonId: 102, opNo: 20, ad: 'Taşlama' }] } } } });
    const bolge = await screen.findByRole('complementary', { name: 'Balon grupları' });
    const dugmeler = await within(bolge).findAllByRole('button', { name: 'Resimde “Çoklu seç” ile balon seçin' });
    expect(dugmeler.every((d) => (d as HTMLButtonElement).disabled)).toBe(true);
    expect(within(bolge).getAllByText('Op 10 · Tornalama').length).toBeGreaterThan(0);
    expect(within(bolge).getByText('Op 20 · Taşlama için bir grup bağlayın.')).toBeTruthy();
  });
});
