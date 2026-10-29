import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { RevizyonSartnameleriCevabi, SartnamelerCevabi, TalimatlarCevabi } from '#paylasilan/sozlesme/rota.ts';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// Uydurma kütüphane: iç adıma uyan bir şartname (adımda değişen zorunlu alanlı) ve yalnız fason adıma uyan bir şartname.
const kisi = { id: 1, ad: 'Deneme 1' };
const ozet = (id: number, kod: string, kapsam: 'ic' | 'fason') => ({
  id, kod, ad: `Deneme ${kod}`, kategoriId: 1, kapsam, kaynak: 'varsayilan' as const, musteriFirma: null, musteriBelgeNo: null,
  aktif: true, surum: 1, yururlukteSurumNo: 1, taslakSurumNo: null, kullanim: 0,
});
const surumu = {
  id: 21, surumNo: 1, durum: 'yururlukte' as const, istenenBelgeler: [], terminalNotu: null, degisiklikNotu: null, acan: kisi, acilma: '2026-10-28T08:00:00.000Z',
  yayinlayan: kisi, yayin: '2026-10-28T09:00:00.000Z', atiflar: [],
  parametreler: [
    { sira: 1, anahtar: 'tolerans', ad: 'Genel tolerans', tur: 'metin' as const, birim: null, secenekler: null, varsayilan: 'ince', ipucu: null, zorunlu: false, adimdaDegisir: false },
    { sira: 2, anahtar: 'derinlik', ad: 'Cep derinliği', tur: 'sayi' as const, birim: 'mm', secenekler: null, varsayilan: null, ipucu: null, zorunlu: true, adimdaDegisir: true },
  ],
};
const LISTE: SartnamelerCevabi = {
  kategoriler: [{ id: 1, kod: 'TLS', ad: 'Talaşlı', sira: 1 }], standartlar: [],
  sartnameler: [ozet(7, 'TLS-DNM', 'ic'), ozet(8, 'KPL-DNM', 'fason')],
};
const TALIMAT: TalimatlarCevabi = {
  surumler: [{
    surum: 2, metin: 'Programı doğrula', yazan: kisi, yazma: '2026-10-28T10:00:00.000Z', adimli: true,
    adimlar: [{ sira: 1, baslik: 'Programı doğrula', metin: null, kontrol: { tur: 'onay' }, zorunlu: true, medya: [] }],
  }],
};

function kur(baglar: RevizyonSartnameleriCevabi) {
  let bag = baglar;
  const yazilan: unknown[] = [];
  sunucuKur(YONETICI, {
    durum: () => json(200, rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 4)])),
    yazmalar: {
      'GET /rota/sartnameler': () => json(200, LISTE),
      'GET /rota/revizyonlar/72/sartnameler': () => json(200, bag),
      'GET /rota/urunler/11/talimatlar/10': () => json(200, TALIMAT),
      'POST /rota/revizyonlar/72/adim-sartnameleri': (g) => {
        yazilan.push(g);
        const x = g as { sartnameler: { sartnameId: number; degerler: Record<string, unknown> }[] };
        bag = { adimlar: [{ opNo: 10, sartnameler: x.sartnameler.map((y, i) => ({
          sira: i + 1, sartname: ozet(7, 'TLS-DNM', 'ic'), degerler: y.degerler as never, yururlukte: surumu,
          eksikler: y.degerler['derinlik'] === undefined ? ['Cep derinliği'] : [], kapsamUyumsuz: false,
        })) }] };
        return json(200, { id: 72, durum: 'taslak', surum: 5 });
      },
    },
  });
  return yazilan;
}

const adimAc = async () => {
  rrAc('/recete-rota/schema');
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
  return within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
};

describe('Rota adımının şartnamesi ve talimatı (971 a, 989 a, 1193 a)', () => {
  it('şartname eklenir, eksik zorunlu alan gösterilir ve değeri kaydedilir; talimat özeti salt okunurdur', async () => {
    const yazilan = kur({ adimlar: [] });
    const panel = await adimAc();
    await within(panel).findByText(/Bu adıma bağlı şartname yok/);
    const secim = within(panel).getByLabelText('Şartname ekle');
    await within(secim).findByRole('option', { name: /TLS-DNM/ });
    // Yalnız fason adıma uyan şartname iç adımın listesinde yoktur.
    expect(within(secim).queryByRole('option', { name: /KPL-DNM/ })).toBeNull();
    fireEvent.change(secim, { target: { value: '7' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Şartnameyi ekle' }));
    await waitFor(() => { expect(yazilan).toHaveLength(1); });
    expect(yazilan[0]).toEqual({ surum: 4, opNo: 10, sartnameler: [{ sartnameId: 7, degerler: {} }] });
    await within(panel).findByText('Eksik: Cep derinliği');

    fireEvent.change(within(panel).getByLabelText('Cep derinliği (mm) *'), { target: { value: '12,5' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Değerleri kaydet' }));
    await waitFor(() => { expect(yazilan).toHaveLength(2); });
    // Revizyonun sürümü ilk yazımdan dönen sürümdür: rota kaydı da aynı sürümü kullanır.
    expect(yazilan[1]).toEqual({ surum: 5, opNo: 10, sartnameler: [{ sartnameId: 7, degerler: { derinlik: 12.5 } }] });
    await within(panel).findByText('Tam');

    expect(within(panel).getByText('Talimat · sürüm 2')).toBeTruthy();
    expect(within(panel).getByText('Programı doğrula')).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: /Talimatı düzenle/ })).toBeNull();
  });
});
