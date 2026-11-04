import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { TurListesiCevabi, TurListesiSatiri } from '#paylasilan/sozlesme/stok.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { ac, json, sunucuKur } from './test-ortak.tsx';

// 2099-6 a: Stok Merkezi'nin tür listeleri; kart alanları sütun, kimyasalda SKT sütunu ve SKT uyarısı süzgeci.
const DEPOCU: Kullanici = { id: 5, ad: 'Deneme Depocu', islemler: ['sayfa.stok', 'stok.giris'] };
const satir = (malzemeId: number, ad: string, ek: Partial<TurListesiSatiri>): TurListesiSatiri => ({
  malzemeId, ad, stokKodu: `KIM-${malzemeId}`, tur: 'sarf', birim: 'lt', toplam: '10', serbest: '10', statude: '0', rezerve: '0', kritikSeviye: null,
  durum: 'tanimsiz', konumSayisi: 1, konumlar: [{ kod: 'A-01-1', katNo: 1, miktar: '10' }], alanlar: {}, sktTakipli: true, enYakinSkt: null, sktGecmisMiktar: '0', ...ek,
});
const KIMYASAL: TurListesiCevabi = {
  bugun: '2026-11-04',
  satirlar: [
    satir(1, 'Deneme bor yağı', { alanlar: { marka: 'Deneme marka', ambalaj: ['bidon'] }, enYakinSkt: '2026-10-01', sktGecmisMiktar: '4' }),
    satir(2, 'Deneme temizleyici', { enYakinSkt: '2026-11-20' }),
    satir(3, 'Deneme gres', { enYakinSkt: '2028-01-01' }),
  ],
};

describe('Stok tür listeleri (2099-6 a)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('kimyasal listesi kart alanlarını ve SKT durumunu gösterir; SKT uyarısı yalnız geçmiş ve yaklaşanı süzer', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/tur-listeleri/kimyasal': () => json(200, KIMYASAL) });
    ac('/stok/kimyasallar');
    const tablo = await screen.findByRole('table', { name: 'Kimyasallar' });
    expect(within(tablo).getByText('Deneme marka')).toBeTruthy();
    expect(within(tablo).getByText('bidon')).toBeTruthy();
    expect(within(tablo).getByText(/Geçmiş: 4/)).toBeTruthy();
    expect(within(tablo).getByText('30 gün içinde')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /SKT uyarısı 2/ }));
    expect(within(tablo).queryByText('Deneme gres')).toBeNull();
    expect(within(tablo).getByText('Deneme bor yağı')).toBeTruthy();
  });

  it('kesici takım listesinde SKT sütunu ve süzgeci yok; boş listede kartın kategorisi söylenir', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/tur-listeleri/takim': () => json(200, { bugun: '2026-11-04', satirlar: [] }) });
    ac('/stok/kesici-takimlar');
    expect(await screen.findByText(/"Kesici takım" kategorisiyle/)).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /SKT uyarısı/ })).toBeNull();
    expect(screen.queryByText('En yakın SKT')).toBeNull();
  });
});
