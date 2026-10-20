import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { MalzemeKatalogu } from './MalzemeKatalogu.tsx';
import { ACAN, ac, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

type Pencere = Window & Record<string, unknown> & { eval(kod: string): unknown };

// Kataloğun kuralları ekranın iç betiğindedir; srcdoc ayrı bir çerçevede koşturulur (katalog-kurallari.test.tsx ile aynı kurulum).
async function prototipiKostur(): Promise<Pencere> {
  sunucuKur(ACAN, {});
  const asil = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => (
    adres.endsWith('.woff2') ? new Response(new Uint8Array([1, 2, 3]), { status: 200 }) : asil(adres, secenek)
  )));
  ac([{ yol: '/malzemeler', ekran: MalzemeKatalogu }], '/malzemeler');
  const cerceve = await screen.findByTitle('Malzeme Kataloğu', {}, { timeout: 5000 }) as HTMLIFrameElement;
  const sayfa = cerceve.getAttribute('srcdoc') ?? '';
  const kosan = document.createElement('iframe');
  document.body.append(kosan);
  const belge = kosan.contentDocument;
  if (!belge) throw new Error('çerçeve belgesi yok');
  belge.open();
  belge.write(sayfa);
  belge.close();
  return kosan.contentWindow as unknown as Pencere;
}

async function hesapla<T>(w: Pencere, govde: string): Promise<T> {
  const yazi = await (w.eval(`(async () => JSON.stringify(await (async () => { ${govde} })(), (k, v) => v === undefined ? null : v))()`) as Promise<string>);
  return JSON.parse(yazi) as T;
}

describe('hizmet kartı: etiket, reçete araması, depo yeri ve sertifika (borç 323)', () => {
  it('etiket: hizmet kartına etiket basılmaz (ileti çıkar, pencere açılmaz); karışık seçimde yalnız hizmet olmayanlar kalır', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      Store.items = [
        { id: 'h1', tur: 'hizmet', g: { kat: 'fason' }, com: { kod: 'HZ-FSN-0001', ad: 'Deneme hizmet' }, opts: {} },
        { id: 'm1', tur: 'sarf', g: { kat: 'yapistirici' }, com: { kod: 'SF-0001', ad: 'Deneme sarf' }, opts: {} },
      ];
      const o = {};
      openLabels(['h1']);
      o.yalnizHizmet = [lblIds, $('#toast').textContent, $('#toast').hidden];
      $('#toast').hidden = true; $('#toast').textContent = '';
      openLabels(['h1', 'm1']);
      o.karisik = [lblIds, $('#toast').textContent];
      return o;`);
    expect(r['yalnizHizmet']).toEqual([[], 'Hizmet kartına etiket basılmaz.', false]);
    expect(r['karisik']).toEqual([['m1'], '']);
  });

  it('etiket düğmesi: kart ayrıntısında ve QR kartında hizmete "Etiket" düğmesi çizilmez, öteki türlere çizilir', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, boolean>>(w, `
      Store.items = [
        { id: 'h1', tur: 'hizmet', g: { kat: 'fason' }, com: { kod: 'HZ-FSN-0001', ad: 'Deneme hizmet' }, opts: {} },
        { id: 'm1', tur: 'sarf', g: { kat: 'yapistirici' }, com: { kod: 'SF-0001', ad: 'Deneme sarf' }, opts: {} },
      ];
      const etiket = () => !!$('#ovIn').querySelector('[data-act="lbl"]');
      const o = {};
      openItem('h1'); o.ayrintiHizmet = etiket();
      openItem('m1'); o.ayrintiSarf = etiket();
      sahaAc('h1'); o.qrHizmet = etiket();
      sahaAc('m1'); o.qrSarf = etiket();
      return o;`);
    expect(r).toEqual({ ayrintiHizmet: false, ayrintiSarf: true, qrHizmet: false, qrSarf: true });
  });

  it('reçete araması: hizmet, demirbaş ve ticari mal listelenmez; pasif kart da listelenmez; hammadde ve sarf listelenir', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, unknown>>(w, `
      const kart = (id, tur) => ({ id, tur, g: {}, com: { kod: 'HM-' + id, ad: 'Deneme ' + id }, opts: {} });
      Store.items = [kart('hammadde1', 'hammadde'), kart('sarf1', 'sarf'), kart('hizmet1', 'hizmet'), kart('demirbas1', 'demirbas'), kart('ticari1', 'ticari_mal'),
        { ...kart('pasif1', 'hammadde'), onay: { durum: 'pasif' } }];
      D = { ...newDraft(), id: 'taslak', tur: 'mamul' };
      const bul = (q) => [...new DOMParser().parseFromString(bomAramaHTML(q), 'text/html').querySelectorAll('[data-bomadd]')].map(b => b.dataset.bomadd);
      return { hepsi: bul('').sort(), hizmetAdiyla: bul('hizmet1'), kodla: bul('HM-hizmet1') };`);
    expect(r['hepsi']).toEqual(['hammadde1', 'sarf1']);
    expect(r['hizmetAdiyla']).toEqual([]);
    expect(r['kodla']).toEqual([]);
  });

  it('ticari adım: hizmette depo yeri ve sertifika alanı yoktur; ticari malda ikisi de vardır', async () => {
    const w = await prototipiKostur();
    const r = await hesapla<Record<string, boolean>>(w, `
      const bak = (d) => { D = d; const h = gTicariHTML(); return [h.includes('data-b="g.depoYeri"'), h.includes('Sertifika ve uygunluk') && h.includes('data-cert=')]; };
      const ticari = bak({ ...newDraft(), tur: 'ticari_mal', g: {} });
      const alinan = bak({ ...newDraft(), tur: 'hizmet', g: { kat: 'yuzey', yon: 'Alınan' } });
      const verilen = bak({ ...newDraft(), tur: 'hizmet', g: { kat: 'yuzey', yon: 'Verilen' } });
      return { ticariDepo: ticari[0], ticariSertifika: ticari[1], alinanDepo: alinan[0], alinanSertifika: alinan[1], verilenDepo: verilen[0], verilenSertifika: verilen[1] };`);
    expect(r).toEqual({ ticariDepo: true, ticariSertifika: true, alinanDepo: false, alinanSertifika: false, verilenDepo: false, verilenSertifika: false });
  });
});
