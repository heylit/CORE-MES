import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { TalimatlarCevabi, TalimatSablonlariCevabi, TalimatSablonuCevabi } from '#paylasilan/sozlesme/rota.ts';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// Uydurma talimat: yayında 2. sürüm (tek adım) ve bir şablon.
const kisi = { id: 1, ad: 'Deneme 1' };
const YAZAN: Kullanici = { ...YONETICI, islemler: [...YONETICI.islemler, 'rota.talimat-yaz'] };
const yayin = (baslik: string) => ({ sira: 1, baslik, metin: null, kontrol: { tur: 'onay' as const }, zorunlu: true, medya: [] });
const YAYINDA: TalimatlarCevabi = {
  surumler: [{ surum: 2, metin: 'Programı doğrula', yazan: kisi, yazma: '2026-10-28T10:00:00.000Z', adimli: true, adimlar: [yayin('Programı doğrula')] }],
  taslak: null,
};
const SABLONLAR: TalimatSablonlariCevabi = { sablonlar: [{ id: 3, kod: 'TS-DNM', ad: 'Deneme işleme', sartname: null, aktif: true, surum: 1, adimSayisi: 1, kontrolSayisi: 0, resimSayisi: 0, videoSayisi: 0 }] };
const SABLON: TalimatSablonuCevabi = {
  sablon: { ...SABLONLAR.sablonlar[0]!, adimlar: [{ sira: 1, baslik: 'Çapak al', metin: null, kontrol: { tur: 'yok' }, zorunlu: false, medya: [] }] },
};

function kur(kullanici: Kullanici) {
  let liste = YAYINDA;
  const yazilan: { yol: string; govde: unknown }[] = [];
  sunucuKur(kullanici, {
    durum: () => json(200, rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3)])),
    yazmalar: {
      'GET /rota/sartnameler': () => json(200, { kategoriler: [], standartlar: [], sartnameler: [] }),
      'GET /rota/revizyonlar/71/sartnameler': () => json(200, { adimlar: [] }),
      'GET /rota/urunler/11/talimatlar/10': () => json(200, liste),
      'GET /rota/talimat-sablonlari': () => json(200, SABLONLAR),
      'GET /rota/talimat-sablonlari/3': () => json(200, SABLON),
      'POST /rota/urunler/11/talimat-taslak-kaydet': (g) => {
        yazilan.push({ yol: 'kaydet', govde: g });
        const x = g as { adimlar: { baslik: string }[] };
        liste = { ...liste, taslak: { surum: 1, tabanSurum: 2, yazan: kisi, yazma: '2026-10-29T08:00:00.000Z', adimlar: x.adimlar.map((a, i) => ({ ...yayin(a.baslik), sira: i + 1 })) } };
        return json(200, liste);
      },
      'POST /rota/urunler/11/talimat-yayinla': (g) => {
        yazilan.push({ yol: 'yayinla', govde: g });
        liste = { surumler: [{ ...YAYINDA.surumler[0]!, surum: 3, adimlar: liste.taslak?.adimlar ?? [] }, ...YAYINDA.surumler], taslak: null };
        return json(200, liste);
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

describe('Rota adımının talimatı: taslak ve yayın (1193 a, 1194 b)', () => {
  it('yayındaki sürüm özetlenir; şablondan eklenen adım yayınlanınca önce taslağa yazılır, sonra yayınlanır', async () => {
    const yazilan = kur(YAZAN);
    const panel = await adimAc();
    await within(panel).findByText('Talimat · yayında sürüm 2');
    expect(within(panel).getByText('Programı doğrula')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Talimatı düzenle' }));

    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByText(/yeni taslak · yayında s2/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Şablondan başla' }));
    fireEvent.click(await within(pencere).findByRole('button', { name: 'TS-DNM · Deneme işleme · 1 adım' }));
    await within(pencere).findByText('2 / 30 adım');
    fireEvent.click(within(pencere).getByRole('button', { name: "Sürüm 3'i yayınla" }));

    await waitFor(() => { expect(yazilan.map((x) => x.yol)).toEqual(['kaydet', 'yayinla']); });
    expect(yazilan[0]?.govde).toMatchObject({ opNo: 10, okunanSurum: 2, taslakSurum: null });
    expect((yazilan[0]?.govde as { adimlar: { baslik: string }[] }).adimlar.map((a) => a.baslik)).toEqual(['Programı doğrula', 'Çapak al']);
    expect(yazilan[1]?.govde).toEqual({ opNo: 10, taslakSurum: 1 });
    await within(panel).findByText('Talimat · yayında sürüm 3');
  });

  it('taslak kaydedilince panelde yayınlanmamış taslak görünür; yalnız okuyan kullanıcı düzenleyemez', async () => {
    const yazilan = kur(YAZAN);
    const panel = await adimAc();
    fireEvent.click(await within(panel).findByRole('button', { name: 'Talimatı düzenle' }));
    const pencere = await screen.findByRole('dialog');
    expect((within(pencere).getByRole('button', { name: 'Taslağı kaydet' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Taslağı kaydet' }));
    await waitFor(() => { expect(yazilan).toHaveLength(1); });
    await within(panel).findByText(/Yayınlanmamış taslak: 1 adım/);
    expect(within(panel).getByRole('button', { name: 'Taslağı düzenle' })).toBeTruthy();
    cleanup();

    kur(OKUYAN);
    const okuyan = await adimAc();
    await within(okuyan).findByText('Talimat · yayında sürüm 2');
    expect(within(okuyan).queryByRole('button', { name: /Talimatı düzenle|Taslağı düzenle/ })).toBeNull();
  });
});
