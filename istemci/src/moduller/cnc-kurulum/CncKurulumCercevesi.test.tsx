import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BenCevabi, KayitlarCevabi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { IKINCI_MENU_TANIMLARI, menuMaddeleri } from '../../ortak/rota/ikinci-menu.ts';
import { ONEK, sayfaKur, yerelDegerler } from './CncKurulumCercevesi.tsx';
import { rotalar } from './rotalar.tsx';

// Kişi adları uydurmadır.
const YAZAR: Kullanici = { id: 5, ad: 'Deneme Yazar', islemler: ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.yaz'] };
const YETKISIZ: Kullanici = { id: 6, ad: 'Deneme Yetkisiz', islemler: ['sayfa.ayarlar'] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(
  kullanici: Kullanici, kayitlar: KayitlarCevabi['kayitlar'] = [],
  yetki: Partial<BenCevabi> & Pick<BenCevabi, 'yazabilir' | 'hazirlikOnaylayabilir'> = { yazabilir: true, hazirlikOnaylayabilir: false },
): string[] {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push(`${yontem} ${yol}`);
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yontem === 'GET' && yol === '/cnc-kurulum/ben') return json(200, {
      kisi: { id: kullanici.id, ad: kullanici.ad }, takimDegistirebilir: false, stokDusebilir: false, stokKartiBaglayabilir: false, emirGorebilir: true, ...yetki,
    } satisfies BenCevabi);
    if (yontem === 'GET' && yol === '/cnc-kurulum/kayitlar') return json(200, { kayitlar } satisfies KayitlarCevabi);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function ac(adres: string) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter initialEntries={[adres]}>
      <Routes>
        {rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}
        <Route path="*" element={<p>Başka sayfa</p>} />
      </Routes>
    </MemoryRouter></BildirimSaglayici></QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('CncKurulumCercevesi', () => {
  it('prototipi içerik politikasıyla ve köprüyle yalıtılmış çerçevede açar; kayıtlar köprüye açılış değeri olarak geçer', async () => {
    sunucuKur(YAZAR, [{ anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: { machine: 'f5a' }, surum: 7 }]);
    ac('/cnc-kurulum');
    const cerceve = await screen.findByTitle('CNC Kurulum Motoru', {}, { timeout: 20000 });
    const belge = cerceve.getAttribute('srcdoc') ?? '';
    expect(cerceve.getAttribute('sandbox')).toBe('allow-scripts allow-downloads allow-modals');
    expect(belge).toContain('Content-Security-Policy');
    expect(belge).toContain("connect-src 'none'");
    // STEP okuyucusu (WebAssembly ve bağlayıcı kodu) için; dış istek yine kapalı.
    expect(belge).toContain("script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'");
    expect(belge).toContain("default-src 'none'");
    // Köprü ve politika prototipin ilk betiğinden önce koşar.
    const kopru = belge.indexOf('"kanal":"cnc-kurulum"');
    expect(kopru).toBeGreaterThan(-1);
    expect(belge.indexOf('Content-Security-Policy')).toBeLessThan(kopru);
    expect(kopru).toBeLessThan(belge.indexOf('Three.js Authors'));
    expect(belge).toContain('"cnc-kurulum-motoru.v1":{"deger":"{\\"machine\\":\\"f5a\\"}","surum":7}');
    // Çizimlere yazamayan kişide aktarım yoktur.
    expect(belge).toContain('"aktarabilir":false');
    expect(screen.queryByRole('button', { name: /Çizimlere aktar/ })).toBeNull();
  }, 30000);

  it('yalnız hazırlık onayı olan kişide köprü kaydı sunucuya yazar (sunucu yalnız onay alanlarını alır); ikisi de yoksa yazmaz', async () => {
    sunucuKur(YAZAR, [], { yazabilir: false, hazirlikOnaylayabilir: true });
    ac('/cnc-kurulum');
    const onaylayan = await screen.findByTitle('CNC Kurulum Motoru', {}, { timeout: 20000 });
    expect(onaylayan.getAttribute('srcdoc') ?? '').toContain('"yazabilir":true');
    cleanup();
    sunucuKur(YAZAR, [], { yazabilir: false, hazirlikOnaylayabilir: false });
    ac('/cnc-kurulum');
    const okuyan = await screen.findByTitle('CNC Kurulum Motoru', {}, { timeout: 20000 });
    expect(okuyan.getAttribute('srcdoc') ?? '').toContain('"yazabilir":false');
  }, 60000);

  it('stok kartı bağlama ve stoktan düşme yetkisi çerçeveye geçer; yoksa kapalıdır (163 b, 164 b)', async () => {
    sunucuKur(YAZAR, [], { yazabilir: true, hazirlikOnaylayabilir: false, stokDusebilir: true, stokKartiBaglayabilir: true });
    ac('/cnc-kurulum');
    const yonetici = await screen.findByTitle('CNC Kurulum Motoru', {}, { timeout: 20000 });
    expect(yonetici.getAttribute('srcdoc') ?? '').toContain('"stokKartiBaglayabilir":true,"stokDusebilir":true');
    cleanup();
    sunucuKur(YAZAR);
    ac('/cnc-kurulum');
    const yazar = await screen.findByTitle('CNC Kurulum Motoru', {}, { timeout: 20000 });
    expect(yazar.getAttribute('srcdoc') ?? '').toContain('"stokKartiBaglayabilir":false,"stokDusebilir":false');
  }, 60000);

  it('emir listesi yetkisi çerçeveye geçer; yoksa kapalıdır (182 a)', async () => {
    sunucuKur(YAZAR, [], { yazabilir: false, hazirlikOnaylayabilir: true, emirGorebilir: false });
    ac('/cnc-kurulum');
    const operator = await screen.findByTitle('CNC Kurulum Motoru', {}, { timeout: 20000 });
    expect(operator.getAttribute('srcdoc') ?? '').toContain('"emirGorebilir":false');
    cleanup();
    sunucuKur(YAZAR);
    ac('/cnc-kurulum');
    const yazar = await screen.findByTitle('CNC Kurulum Motoru', {}, { timeout: 20000 });
    expect(yazar.getAttribute('srcdoc') ?? '').toContain('"emirGorebilir":true');
  }, 60000);

  it('Çizimlere yazabilen kişide de çerçevede aktarım düğmesi yoktur: makine eşleştirme Çizim Merkezi\'ndedir', async () => {
    sunucuKur({ ...YAZAR, islemler: [...YAZAR.islemler, 'cizimler.yaz'] });
    ac('/cnc-kurulum');
    const cerceve = await screen.findByTitle('CNC Kurulum Motoru', {}, { timeout: 20000 });
    const belge = cerceve.getAttribute('srcdoc') ?? '';
    expect(belge).toContain('"aktarabilir":false');
    expect(screen.queryByRole('button', { name: /Çizimlere aktar/ })).toBeNull();
    expect(screen.queryByRole('status', { name: 'Çizimlere aktarım' })).toBeNull();
  }, 30000);

  it('sayfayı görmeyen kişiye yetki iletisi gösterir, uçlara gitmez', async () => {
    const istekler = sunucuKur(YETKISIZ);
    ac('/cnc-kurulum');
    expect(await screen.findByText('Bu bölümü görme yetkiniz yok.')).toBeTruthy();
    await waitFor(() => { expect(istekler.some((i) => i.startsWith('GET /cnc-kurulum/'))).toBe(false); });
  });

  it('ikinci menünün her maddesinin rotası vardır', () => {
    const menu = IKINCI_MENU_TANIMLARI.find((m) => m.kok === '/cnc-kurulum');
    expect(menu).toBeDefined();
    for (const madde of menuMaddeleri(menu!)) expect(rotalar.some((r) => r.yol === madde.yol)).toBe(true);
  });

  it('sayfaKur politikayı ve betiği başa koyar; prototip metnindeki $ dizileri bozulmaz', () => {
    const prototip = '<!doctype html><html><head><title>T</title></head><body>$& $1</body></html>';
    const sayfa = sayfaKur(prototip, '<script>kopru()</script>');
    expect(sayfa.indexOf('Content-Security-Policy')).toBeLessThan(sayfa.indexOf('<title>'));
    expect(sayfa.indexOf('kopru()')).toBeLessThan(sayfa.indexOf('<title>'));
    expect(sayfa).toContain('<body>$& $1</body>');
  });

  it('sayfaKur elle üretim kaydı alanlarını gizler, başka alana dokunmaz (301 a)', () => {
    const prototip = '<html><head></head><body><div id="lfTrack"><div class="prod">elle</div><div class="tw">kart</div></div>'
      + '<div id="lwPanel"><div class="prod">elle</div></div><div class="prod">baska</div></body></html>';
    document.body.innerHTML = '';
    const belge = new DOMParser().parseFromString(sayfaKur(prototip, ''), 'text/html');
    const stil = belge.head.querySelector('style')!.textContent!;
    document.head.insertAdjacentHTML('beforeend', `<style id="gizle-deneme">${stil}</style>`);
    document.body.innerHTML = belge.body.innerHTML;
    const gorunur = (s: string) => getComputedStyle(document.querySelector(s)!).display !== 'none';
    expect(gorunur('#lfTrack .prod')).toBe(false);
    expect(gorunur('#lwPanel .prod')).toBe(false);
    expect(gorunur('#lfTrack .tw')).toBe(true);
    expect(gorunur('body > .prod')).toBe(true);
    document.getElementById('gizle-deneme')!.remove();
    document.body.innerHTML = '';
  });

  it('kayıtlar prototipin metnine döner: json yeniden metne, metin olduğu gibi; önek dışı ve bozuk kayıt atlanır', () => {
    // Sözleşmedeki önekle aynı (sunucu testi CK-K4 aynı biçimi denetler).
    expect(ONEK).toBe('cnc-kurulum-motoru.');
    const degerler = yerelDegerler({
      kayitlar: [
        { anahtar: 'cnc-kurulum-motoru.v1', bicim: 'json', deger: { a: [1, 'x'], b: null }, surum: 4 },
        { anahtar: 'cnc-kurulum-motoru.not', bicim: 'metin', deger: 'düz {', surum: 5 },
        { anahtar: 'cnc-kurulum-motoru.bozuk', bicim: 'metin', deger: 3, surum: 6 },
        { anahtar: 'baska', bicim: 'json', deger: {}, surum: 7 },
      ],
    });
    expect(degerler).toEqual({
      'cnc-kurulum-motoru.v1': { deger: '{"a":[1,"x"],"b":null}', surum: 4 },
      'cnc-kurulum-motoru.not': { deger: 'düz {', surum: 5 },
    });
  });
});
