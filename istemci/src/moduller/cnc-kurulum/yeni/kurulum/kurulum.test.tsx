import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { EmirSecenegi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import type { CncYetkisi } from '../veri.ts';

// Kurulum görünümünün yazma düğmeleri yetkiye göre görünür; çark ve önizleme sahnesi burada çizilmez. Emir ve kişi uydurmadır.
const v = vi.hoisted(() => ({ yetki: null as CncYetkisi | null, emir: null as EmirSecenegi | null }));
vi.mock('../sahne/Sahne.tsx', () => ({ Sahne: () => null }));
vi.mock('./cark.ts', () => ({
  carkBasildi: () => undefined, carkBirak: () => undefined, carkBirakildi: () => undefined, carkCikti: () => undefined, carkCiz: () => undefined,
  carkKaydi: () => undefined, sonKartaIn: () => undefined,
}));
vi.mock('./onizleme.ts', () => ({ onizlemeBirak: () => undefined, onizlemeCiz: () => undefined, onizlemeSurukle: () => undefined }));
vi.mock('../hesap/kesme.ts', () => ({ coolHint: () => '', cutData: () => null, holderOf: () => '' }));
vi.mock('../veri.ts', () => ({
  useCncYetkisi: () => v.yetki,
  seciliEmir: () => v.emir,
  emirler: () => Promise.resolve(v.emir ? [v.emir] : []),
  emirSec: () => Promise.resolve(),
  hazirlikKaydi: () => Promise.resolve({ onaylar: [], kurulum: null }),
  kurulumTamam: () => Promise.resolve({ kisi: { id: 1, ad: 'Deneme Kisi' }, zaman: '2026-01-01T08:00:00Z', gecerli: true }),
  secimIsaretleri: () => ({}),
  secimIsaretle: () => undefined,
}));

const { Kurulum } = await import('./Kurulum.tsx');
const { emirAdaylari, etiket, operasyon, saat } = await import('./secim.ts');
const { esc } = await import('./disa-aktarim.ts');
const { K } = await import('./satirlar.ts');

const EMIR: EmirSecenegi = { id: 7, uretimEmriId: 3, emirNo: 'UE-0001', opNo: 10, ad: 'Frezeleme', parcaNo: 'P-1', parcaAd: 'Ornek parca', adet: 5, istasyon: 'CNC-1' } as EmirSecenegi;
const yetki = (y: Partial<CncYetkisi>): CncYetkisi => ({
  kisi: { id: 1, ad: 'Deneme Kisi' }, yazabilir: false, hazirlikOnaylayabilir: false, takimDegistirebilir: false, stokDusebilir: false,
  stokKartiBaglayabilir: false, emirGorebilir: true, saltOnay: false, ...y,
});
const ac = () => render(<BildirimSaglayici><MemoryRouter initialEntries={['/cnc-kurulum/yeni/kurulum']}><Kurulum /></MemoryRouter></BildirimSaglayici>);

afterEach(() => { cleanup(); v.emir = null; });

describe('Kurulum düğmeleri (izinli ve reddedilen)', () => {
  it('yazan kişide Sıfırla ve emir seçiliyken Kurulum tamam görünür', async () => {
    v.yetki = yetki({ yazabilir: true }); v.emir = EMIR;
    ac();
    expect(await screen.findByRole('button', { name: /Sıfırla/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bütün adımları sırayla seçin|Seçimleri onaylayıp/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Yazdır/ })).toBeTruthy();
  });
  it('yazma yetkisi olmayan kişide Sıfırla ve Kurulum tamam yoktur, emir alanı salt okunur', async () => {
    v.yetki = yetki({}); v.emir = EMIR;
    ac();
    expect(await screen.findByRole('button', { name: /Yazdır/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sıfırla/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Bütün adımları sırayla seçin|Seçimleri onaylayıp/ })).toBeNull();
    expect((screen.getByRole('combobox', { name: /Üretim emri/ }) as HTMLInputElement).readOnly).toBe(true);
  });
  it('emir seçilmeden Kurulum tamam çıkmaz', async () => {
    v.yetki = yetki({ yazabilir: true });
    ac();
    expect(await screen.findByRole('button', { name: /Sıfırla/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Önce üretim emrini seçin/ })).toBeNull();
  });
});

describe('kartlı akış (1843)', () => {
  it('3D açılamayan bilgisayarda kartlı akış gelir, çark seçilemez; karta tıklamak seçer ve sonraki adıma geçer', async () => {
    v.yetki = yetki({ yazabilir: true });
    ac();
    const akis = await screen.findByLabelText('Kurulum adımları');
    expect((screen.getByRole('button', { name: /3D çark/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Kartlar/ }).getAttribute('aria-pressed')).toBe('true');
    const ilk = K.defs[0]!;
    if (ilk.type !== 'single') throw new Error('ilk adım tek seçimli olmalı');
    const kartlar = within(within(akis).getByRole('group', { name: `${ilk.title} seçenekleri` })).getAllByRole('button');
    expect(kartlar).toHaveLength(ilk.options.length);
    const hedef = ilk.options.length > 1 ? 1 : 0;
    fireEvent.click(kartlar[hedef]!);
    expect(ilk.get()).toBe(ilk.options[hedef]!.id);
    expect(K.active).toBe(1);
    expect(within(akis).getByRole('group', { name: `${K.defs[1]!.title} seçenekleri` })).toBeTruthy();
  });
  it('kartlı akışta 3B önizleme istenince açılır', async () => {
    v.yetki = yetki({});
    ac();
    fireEvent.click(await screen.findByRole('button', { name: /Modeli göster/ }));
    expect(screen.getByRole('button', { name: 'Modeli kapat' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Modeli göster/ })).toBeNull();
  });
});

describe('saf yardımcılar', () => {
  it('emir etiketi köprüdekiyle aynıdır', () => {
    expect(operasyon(EMIR)).toBe('UE-0001 · OP10 Frezeleme');
    expect(etiket(EMIR)).toBe('UE-0001 · OP10 Frezeleme · P-1 Ornek parca · 5 adet · CNC-1');
  });
  it('CNC-6: emir alanına yazılan metin tam etiketle ya da etiketin bir parçasıyla eşleşir (Türkçe harf farkı yok)', () => {
    const ikinci = { ...EMIR, id: 8, emirNo: 'UE-0002', opNo: 20, ad: 'Ikinci islem' } as EmirSecenegi;
    const liste = [EMIR, ikinci];
    expect(emirAdaylari(liste, etiket(ikinci))).toEqual([ikinci]);
    expect(emirAdaylari(liste, ' ue-0001 ')).toEqual([EMIR]);
    expect(emirAdaylari(liste, 'FREZELEME')).toEqual([EMIR, ikinci].filter((e) => e.ad === 'Frezeleme'));
    expect(emirAdaylari(liste, 'p-1')).toEqual(liste);
    expect(emirAdaylari(liste, 'yok')).toEqual([]);
    expect(emirAdaylari(liste, '  ')).toEqual([]);
  });
  it('saat geçersiz zamanda boştur, saat dilimine göre yazılır', () => {
    expect(saat('yok')).toBe('');
    expect(saat('2026-01-01T08:05:00Z', 'UTC')).toMatch(/^01\D01\D? 08:05$/);
  });
  it('yazdırma metni HTML kaçışlıdır', () => { expect(esc('<a&"b">')).toBe('&lt;a&amp;&quot;b&quot;&gt;'); });
});
