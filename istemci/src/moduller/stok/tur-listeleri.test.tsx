import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { TurListesiCevabi, TurListesiSatiri } from '#paylasilan/sozlesme/stok.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { IKINCI_MENU_TANIMLARI, acikIkinciMenu, adresMaddesiKapaliMi, etkinMadde, menuMaddeleri } from '../../ortak/rota/ikinci-menu.ts';
import { ac, json, sunucuKur } from './test-ortak.tsx';

// 2099-6 a: Stok Merkezi'nin tür listeleri; kart alanları sütun, kimyasalda SKT sütunu ve SKT uyarısı süzgeci.
const DEPOCU: Kullanici = { id: 5, ad: 'Deneme Depocu', islemler: ['sayfa.stok', 'stok.giris'] };
const satir = (malzemeId: number, ad: string, ek: Partial<TurListesiSatiri>): TurListesiSatiri => ({
  malzemeId, ad, stokKodu: `KIM-${malzemeId}`, tur: 'sarf', birim: 'lt', toplam: '10', serbest: '10', statude: '0', rezerve: '0', kritikSeviye: null,
  durum: 'tanimsiz', konumSayisi: 1, konumlar: [{ kod: 'A-01-1', katNo: 1, miktar: '10' }], alanlar: {}, kategoriAdi: null, kartDurumu: null, varsayilanKonum: null, sonHareket: null, sktTakipli: true, enYakinSkt: null, sktGecmisMiktar: '0', ...ek,
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
    ac('/stok/malzemeler/kimyasallar');
    const tablo = await screen.findByRole('table', { name: 'Kimyasallar' });
    expect(within(tablo).getByText('Deneme marka')).toBeTruthy();
    expect(within(tablo).getByText('bidon')).toBeTruthy();
    expect(within(tablo).getByText(/Geçmiş: 4/)).toBeTruthy();
    expect(within(tablo).getByText('30 gün içinde')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /SKT uyarısı 2/ }));
    expect(within(tablo).queryByText('Deneme gres')).toBeNull();
    expect(within(tablo).getByText('Deneme bor yağı')).toBeTruthy();
  });

  it('kesici takım listesinde SKT sütunu ve süzgeci yok; boş listede kartın kategorisi söylenir', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/tur-listeleri/takim': () => json(200, { bugun: '2026-11-04', satirlar: [] }) });
    ac('/stok/malzemeler/kesici-takimlar');
    expect(await screen.findByText(/"Kesici takım" kategorisiyle/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /SKT uyarısı/ })).toBeNull();
    expect(screen.queryByText('En yakın SKT')).toBeNull();
  });
});

// 2896: tür listeleri Malzemeler'in sekmeleridir; ikinci menüde ayrı madde değildir.
const PANEL = { malzemeCesidi: 0, kritik: 0, eksi: 0, kabulde: 0 };
const BOS_MALZEMELER = { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 };
const turSekmeleri = () => screen.getByRole('tablist', { name: 'Malzeme türü' });

describe('Malzeme türü sekmeleri (2896)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('Malzemeler sayfası dört tür sekmesini gösterir; sekme tür listesini açar ve geri döner', async () => {
    sunucuKur(DEPOCU, {
      'GET /stok/malzemeler': () => json(200, BOS_MALZEMELER), 'GET /stok/panel': () => json(200, PANEL),
      'GET /stok/tur-listeleri/aparat': () => json(200, { bugun: '2026-11-04', satirlar: [] }),
    });
    ac('/stok/malzemeler');
    await screen.findByText(/Bu süzgece uyan malzeme yok/);
    const sekmeler = within(turSekmeleri()).getAllByRole('tab').map((t) => t.textContent);
    expect(sekmeler).toEqual(['Malzemeler', 'Kimyasallar', 'Kesici takımlar', 'Aparatlar']);
    expect(within(turSekmeleri()).getByRole('tab', { name: 'Malzemeler' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(within(turSekmeleri()).getByRole('tab', { name: 'Aparatlar' }));
    expect(await screen.findByText(/"Kalıp ve aparat" kategorisiyle/)).toBeTruthy();
    expect(within(turSekmeleri()).getByRole('tab', { name: 'Aparatlar' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(within(turSekmeleri()).getByRole('tab', { name: 'Malzemeler' }));
    expect(await screen.findByText(/Bu süzgece uyan malzeme yok/)).toBeTruthy();
  });

  it.each([
    ['/stok/kimyasallar', 'kimyasal', /"Yağ ve kimyasal" kategorisiyle/],
    ['/stok/kesici-takimlar', 'takim', /"Kesici takım" kategorisiyle/],
    ['/stok/aparatlar', 'aparat', /"Kalıp ve aparat" kategorisiyle/],
  ])('eski adres %s yeni sekmeye yönlenir', async (adres, liste, bos) => {
    sunucuKur(DEPOCU, { [`GET /stok/tur-listeleri/${liste}`]: () => json(200, { bugun: '2026-11-04', satirlar: [] }) });
    ac(adres);
    expect(await screen.findByText(bos)).toBeTruthy();
    expect(within(turSekmeleri()).getByRole('tab', { selected: true })).toBeTruthy();
  });

  it('ikinci menüde tür maddeleri yok; sekme adreslerinde Malzemeler etkin ve görünürlük sayfa.stok ile aynı', () => {
    const stok = IKINCI_MENU_TANIMLARI.find((t) => t.kok === '/stok');
    expect(stok).toBeDefined();
    const maddeler = menuMaddeleri(stok!);
    expect(maddeler.some((m) => ['kimyasallar', 'kesici-takimlar', 'aparatlar'].includes(m.anahtar))).toBe(false);
    for (const adres of ['/stok/malzemeler/kimyasallar', '/stok/malzemeler/kesici-takimlar', '/stok/malzemeler/aparatlar']) {
      expect(etkinMadde(maddeler, adres)?.anahtar).toBe('malzemeler');
      // Yalnız sayfa.stok taşıyan okuyucu eskisi gibi açar; işlemi olmayan menüyü ve adresi göremez.
      expect(adresMaddesiKapaliMi(IKINCI_MENU_TANIMLARI, adres, ['sayfa.stok'])).toBe(false);
    }
    const okuyucu = acikIkinciMenu(IKINCI_MENU_TANIMLARI, '/stok', ['sayfa.stok']);
    expect(okuyucu && menuMaddeleri(okuyucu).some((m) => m.anahtar === 'malzemeler')).toBe(true);
    expect(acikIkinciMenu(IKINCI_MENU_TANIMLARI, '/stok', [])).toBeNull();
  });
});
