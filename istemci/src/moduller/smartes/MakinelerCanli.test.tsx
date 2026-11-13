import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { CanliMakineAyrintisiCevabi, CanliMakinelerCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { MakinelerCanli } from './MakinelerCanli.tsx';

type Makine = CanliMakinelerCevabi['makineler'][number];
const once = (sn: number) => new Date(Date.now() - sn * 1000).toISOString();
const makine = (makineKodu: string, ek: Partial<Makine> = {}): Makine => ({
  makineKodu, makineAdi: `ORN ${makineKodu}`, istasyonKodu: 'ORN-T1', istasyonAdi: 'ORN torna hücresi', durum: 'calisiyor', durumKodu: null,
  durumBaslangic: once(600), mod: 'AUTO', alarm: null, uyari: null, programNo: 'O1001', programAdi: 'ORN-PROGRAM', sayac: 12, spindleYuku: 45,
  okundu: once(20), calisanIs: null, bugun: [{ durum: 'calisiyor', baslangic: once(600), bitis: null }], ...ek,
});
const PANO: CanliMakinelerCevabi = {
  baglanti: 'acik', okumaAcik: true, destekleniyor: true, aralikSaniye: 60, sonOkuma: once(20),
  makineler: [
    makine('ORN-M01', { calisanIs: { emirId: 1, emirNo: 'ORN-UE-1', opNo: 20, opAdi: 'CNC torna', tamamlananYuzde: 38, tahminiBitis: once(-3600) } }),
    makine('ORN-M02', { durum: 'alarm', alarm: '1012 ORN alarm metni' }),
    makine('ORN-M03', { durum: 'bilinmiyor', durumKodu: 'ORN-7', istasyonKodu: null, istasyonAdi: null }),
    makine('ORN-M04', { okundu: once(600) }),
  ],
};
const AYRINTI: CanliMakineAyrintisiCevabi = {
  makineKodu: 'ORN-M02', okundu: once(20), mod: 'AUTO', uyari: null, sayacToplam: 3400, eksenHizi: 1200, eksenOrani: 100,
  spindle: { hiz: 2400, yuk: 45, oran: 90 }, takimCebi: 4,
  degisimler: [{ zaman: once(300), eski: 'calisiyor', yeni: 'alarm', aciklama: '1012 ORN alarm metni' }],
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(pano: CanliMakinelerCevabi): string[] {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/smartes/makineler') return json(200, pano);
    if (yol === '/smartes/makineler/ORN-M02') return json(200, AYRINTI);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return yollar;
}

function ac(ekran: ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici>{ekran}</BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('SmartES Makineler canlı', () => {
  it('makineler istasyona göre gruplanır; durum kelimeyle, bilinmeyen kod ham haliyle, eski veri "Veri eski" diye yazılır', async () => {
    sunucuKur(PANO);
    ac(<MakinelerCanli />);
    const grup = await screen.findByRole('region', { name: /ORN-T1/ });
    expect(within(grup).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('region', { name: 'İstasyona bağlı olmayan' })).toBeTruthy();
    expect(screen.getByText('kod ORN-7')).toBeTruthy();
    expect(screen.getByText(/^Veri eski \(10 dk\)$/)).toBeTruthy();
    expect(screen.getByText('1012 ORN alarm metni')).toBeTruthy();
    const dolu = screen.getByRole('button', { name: /^ORN-M01 / });
    expect(within(dolu).getByText(/ORN-UE-1 · Op 20 CNC torna/)).toBeTruthy();
    expect(within(dolu).getByText('%38')).toBeTruthy();
    expect(within(dolu).getByText('Tahmini bitiş')).toBeTruthy();
    // SmartES ilerleme vermediyse satır hiç çizilmez; sıfır uydurulmaz.
    expect(within(screen.getByRole('button', { name: /^ORN-M02 / })).queryByText('Tamamlanan')).toBeNull();
  });

  it('özet çipi süzer: Alarm seçilince yalnız alarmlı makine kalır, yeniden basınca hepsi döner', async () => {
    sunucuKur(PANO);
    ac(<MakinelerCanli />);
    const cipler = await screen.findByRole('group', { name: 'Duruma göre süz' });
    expect(within(cipler).getByRole('button', { name: /Tümü 4/ })).toBeTruthy();
    const alarm = within(cipler).getByRole('button', { name: /Alarm 1/ });
    fireEvent.click(alarm);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^ORN-M02 / })).toBeTruthy();
    fireEvent.click(alarm);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    fireEvent.click(within(cipler).getByRole('button', { name: /Veri eski 1/ }));
    expect(screen.getByRole('button', { name: /^ORN-M04 / })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('karta basınca ayrıntı o makine için istenir: toplam sayaç, iş mili, eksen hızı, besleme oranı, takım cebi ve değişimler görünür', async () => {
    const yollar = sunucuKur(PANO);
    ac(<MakinelerCanli />);
    fireEvent.click(await screen.findByRole('button', { name: /^ORN-M02 / }));
    const pencere = await screen.findByRole('dialog');
    expect(await within(pencere).findByText('Sayaç (toplam)')).toBeTruthy();
    expect(yollar).toContain('/smartes/makineler/ORN-M02');
    expect(within(pencere).getByText('3.400')).toBeTruthy();
    expect(within(pencere).getByText(/2\.400 dev\/dk · yük %45 · oran %90/)).toBeTruthy();
    expect(within(pencere).getByText('Eksen hızı')).toBeTruthy();
    expect(within(pencere).getByText('1.200')).toBeTruthy();
    expect(within(pencere).getByText('%100')).toBeTruthy();
    expect(within(pencere).getByText('Takım cebi')).toBeTruthy();
    expect(within(pencere).getByText('4')).toBeTruthy();
    expect(within(pencere).getByText('Bugünkü durum değişimleri')).toBeTruthy();
  });

  it('(ret) bağlantı kapalıyken, okuma anahtarı kapalıyken, SmartES bilgiyi vermiyorken ve henüz okunmamışken kart çizilmez, neden yazılır', async () => {
    const durumlar: [Partial<CanliMakinelerCevabi>, RegExp][] = [
      [{ baglanti: 'kapali' }, /SmartES bağlantısı kapalı; canlı durum okunmuyor/],
      [{ okumaAcik: false }, /Canlı makine okuması kapalı/],
      [{ destekleniyor: false }, /SmartES bu bilgiyi vermiyor/],
      [{}, /Henüz makine okunmadı/],
    ];
    for (const [ek, ileti] of durumlar) {
      sunucuKur({ ...PANO, makineler: [], sonOkuma: null, ...ek });
      ac(<MakinelerCanli />);
      expect(await screen.findByText(ileti)).toBeTruthy();
      expect(screen.queryAllByRole('listitem')).toHaveLength(0);
      expect(screen.queryByRole('group', { name: 'Duruma göre süz' })).toBeNull();
      cleanup();
      vi.unstubAllGlobals();
    }
  });
});
