import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AcikSiparisSatiri, AcikSiparisSatirlariCevabi, KonumlarCevabi, MalKabullerCevabi } from '#paylasilan/sozlesme/stok.ts';
import { acikSiparisAra } from './acik-siparis-arama.ts';
import { DEPOCU, ac, json, sunucuKur } from './test-ortak.tsx';

// Mal kabulde tek arama kutusu açık sipariş satırını malzeme, tedarikçi, üretim emri ve emrin projesiyle bulur; dördü tabloda
// ayrı sütundur. Fason dönüşü hizmet satırıdır ve aynı listede aranır. Veriler uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const satir = (id: number, x: Partial<AcikSiparisSatiri>): AcikSiparisSatiri => ({
  id, siparisNo: `SA-${id}`, talepNo: `ST-${id}`, tedarikciAdi: 'Deneme Tedarik', malzemeId: id, malzemeTur: null, kalemAdi: `Deneme kalem ${id}`,
  miktar: '10', kalanMiktar: '10', birim: 'adet', beklenenTeslim: null, uretimEmriId: null, emirNo: null, projeId: null, projeAdi: null, isEmriId: null, ...x,
});
const SATIRLAR = [
  satir(1, { kalemAdi: 'Çelik mil Ø20', tedarikciAdi: 'Deneme Çelik', uretimEmriId: 7, emirNo: 'UE-2026-0007', projeId: 3, projeAdi: 'Deneme Işık Projesi' }),
  satir(2, { kalemAdi: 'Pul M8', tedarikciAdi: 'Deneme Bağlantı' }),
  satir(3, { kalemAdi: 'Kaplama hizmeti', malzemeTur: 'hizmet', isEmriId: 31, tedarikciAdi: 'Deneme Fasoncu', uretimEmriId: 8, emirNo: 'UE-2026-0008', projeId: 3, projeAdi: 'Deneme Işık Projesi' }),
];
const idler = (metin: string) => acikSiparisAra(SATIRLAR, metin).map((x) => x.id);

describe('açık sipariş araması (kural)', () => {
  it('boş arama bütün satırları bırakır', () => {
    expect(idler('')).toEqual([1, 2, 3]);
    expect(idler('   ')).toEqual([1, 2, 3]);
  });
  it('dört alanın her biriyle bulur: malzeme, tedarikçi, emir no, proje', () => {
    expect(idler('mil')).toEqual([1]);
    expect(idler('bağlantı')).toEqual([2]);
    expect(idler('0008')).toEqual([3]);
    expect(idler('ışık')).toEqual([1, 3]);
  });
  it('Türkçe büyük-küçük harf eşittir (İ/i, I/ı, Ç/ç)', () => {
    expect(idler('IŞIK')).toEqual([1, 3]);
    expect(idler('ÇELİK')).toEqual([1]);
    expect(idler('ue-2026')).toEqual([1, 3]);
  });
  it('her sözcük alanlardan birinde geçmelidir; sözcükler farklı alanlarda olabilir', () => {
    expect(idler('fasoncu ışık')).toEqual([3]);
    expect(idler('çelik 0008')).toEqual([]);
  });
  it('emri ve projesi olmayan satır emir ya da proje aramasında çıkmaz', () => {
    expect(idler('UE-')).toEqual([1, 3]);
  });
});

describe('mal kabul ekranında açık sipariş araması', () => {
  it('dört bilgi ayrı sütunda görünür; tek kutu süzer; fason dönüşü işaretlidir; boş sonuç iletisi aramaya göredir', async () => {
    const bos = { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 };
    sunucuKur(DEPOCU, {
      'GET /stok/konumlar': () => json(200, bos satisfies KonumlarCevabi),
      'GET /stok/mal-kabuller': () => json(200, bos satisfies MalKabullerCevabi),
      'GET /stok/acik-siparis-satirlari': () => json(200, { satirlar: SATIRLAR } satisfies AcikSiparisSatirlariCevabi),
    });
    ac('/stok/mal-kabul');
    const tablo = await screen.findByRole('table', { name: 'Açık sipariş satırları' });
    await waitFor(() => expect(within(tablo).getByText('Çelik mil Ø20')).toBeTruthy());
    for (const baslik of ['Malzeme', 'Tedarikçi', 'Üretim emri', 'Proje']) expect(within(tablo).getByRole('columnheader', { name: baslik })).toBeTruthy();
    expect(within(tablo).getByText('Deneme Çelik')).toBeTruthy();
    expect(within(tablo).getByText('UE-2026-0007')).toBeTruthy();
    expect(within(tablo).getAllByText('Deneme Işık Projesi')).toHaveLength(2);
    expect(within(tablo).getByText('Fason dönüşü')).toBeTruthy();
    // 2940 a: tek satır, yana kayar; Sipariş solda, Seç sağda sabit; fason işareti kendi sütununda.
    expect(tablo.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    expect(within(tablo).getByRole('columnheader', { name: 'Sipariş' }).classList.contains('tc-tablo-sabit-sol')).toBe(true);
    expect(within(tablo).getByText('Fason dönüşü').closest('td')?.getAttribute('data-baslik')).toBe('Hizmet');
    expect(within(tablo).getAllByRole('button', { name: 'Seç' })[0]?.closest('td')?.classList.contains('tc-tablo-sabit-sag')).toBe(true);

    const kutu = screen.getByLabelText('Açık siparişlerde ara');
    fireEvent.change(kutu, { target: { value: 'fasoncu' } });
    await waitFor(() => expect(within(tablo).queryByText('Çelik mil Ø20')).toBeNull());
    expect(within(tablo).getByText('Kaplama hizmeti')).toBeTruthy();
    fireEvent.change(kutu, { target: { value: 'ışık' } });
    await waitFor(() => expect(within(tablo).getByText('Çelik mil Ø20')).toBeTruthy());
    expect(within(tablo).queryByText('Pul M8')).toBeNull();
    fireEvent.change(kutu, { target: { value: 'olmayan' } });
    expect(await screen.findByText('Aramaya uyan açık sipariş satırı yok.')).toBeTruthy();
  });
});
