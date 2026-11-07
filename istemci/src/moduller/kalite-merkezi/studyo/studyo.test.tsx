import { describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KmMerkezBelgesi, KmResim, KmStudyoParcaCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { kmAc, MUAYENECI, MUHENDIS, OKUYAN, type SunucuSecenegi } from '../yeni/test-ortak.tsx';

// Uydurma deneme verisi: bir malzeme kartı, iki iş emri, bir resim ve bir model.
const KART = { malzemeNo: 7, kod: 'DNM-07', ad: 'Deneme gövde', aktif: true };
const resim = (o: Partial<KmResim>): KmResim => ({
  id: 1, malzemeNo: 7, tur: 'resim', merkezBelgeId: 11, ozet: 'a'.repeat(64), ad: 'Deneme resim', revizyon: 'B', aktif: true, surum: 1,
  eklendi: '2026-10-20T08:00:00.000Z', balonlar: [], ...o,
});
const PARCA: KmStudyoParcaCevabi = {
  resimler: [resim({}), resim({ id: 2, tur: 'model', ad: 'Deneme model', revizyon: null }), resim({ id: 3, ad: 'Eski resim', aktif: false })],
  numunePlanlari: [{ opNo: 10, surum: 1, kurallar: [{ kimlik: 'k1', ne: 'ilk', kim: ['kalite'], balonlar: 'hepsi', kapi: true }] }],
  alinmamis: 0,
};
const SECENEK: SunucuSecenegi = {
  parcalar: [KART],
  emirler: [
    { kimlik: 'ue-5', no: 'UE-5', tip: 'İş emri', acik: false, parcaNo: 'DNM-07', parcaAdi: null, miktar: 10, termin: null, firmaId: null, firmaAd: null },
    { kimlik: 'ue-6', no: 'UE-6', tip: 'İş emri', acik: true, parcaNo: 'DNM-07', parcaAdi: null, miktar: 10, termin: null, firmaId: null, firmaAd: null },
    { kimlik: 'sa-6', no: 'SA-6', tip: 'Satınalma siparişi', acik: true, parcaNo: 'DNM-07', parcaAdi: null, miktar: 10, termin: null, firmaId: null, firmaAd: null },
  ],
  studyo: {
    parcalar: { 7: PARCA },
    numuneler: {
      6: [{ id: 1, uretimEmriId: 6, opNo: 10, balonlar: [1, 2], kritik: true, neden: 'İlk parça', parcaSayisi: 1, isteyen: 'Deneme', istendi: '2026-10-26T07:00:00.000Z', durum: 'bekliyor', karar: null, olcumler: [] }],
    },
  },
};

describe('Resim ve modeller stüdyosu (597 a)', () => {
  it('parça seçilmeden liste gelir (799); satır stüdyoyu açar, parça seçici stüdyoda kalır', async () => {
    kmAc('resimler', OKUYAN, {}, { ...SECENEK, studyo: { ...SECENEK.studyo, ozetler: [{ malzemeNo: 7, resim: 1, model: 1, balon: 0, numunePlani: 1, merkezde: 0 }] } });
    const tablo = await screen.findByRole('table', { name: 'Resim ve modeller' });
    fireEvent.click(await within(tablo).findByText('DNM-07'));
    expect(await screen.findByRole('region', { name: 'Teknik resim' })).toBeTruthy();
    expect(await screen.findByText('Deneme gövde')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Parça değiştir' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('parçanın etkin resim ve modelleri, numune planı ve açık iş emrinin numuneleri listelenir; sipariş satırı emir değildir', async () => {
    const { fetch } = kmAc('resimler?parca=7', MUAYENECI, {}, SECENEK);
    const sol = await screen.findByRole('complementary', { name: 'Parça ve resimler' });
    expect(await within(sol).findByRole('button', { name: /Deneme resim/ })).toBeTruthy();
    expect(within(sol).getByRole('button', { name: /Deneme model/ })).toBeTruthy();
    expect(within(sol).queryByText('Eski resim')).toBeNull();
    const emir = within(sol).getByLabelText('Ölçümleri gösterilen emir');
    expect((emir as HTMLSelectElement).value).toBe('ue-6');
    expect(within(emir).queryByText(/SA-6/)).toBeNull();
    const sag = screen.getByRole('complementary', { name: 'Numune planı ve numuneler' });
    expect(within(sag).getByText('İlk parça · Kalite · tüm balonlar · kalite kararı bekler')).toBeTruthy();
    expect(await within(sag).findByText('Bekliyor')).toBeTruthy();
    expect(fetch.mock.calls.some(([a]) => a === '/api/kalite-merkezi/studyo/emirler/6/olcumler')).toBe(true);
    fireEvent.change(emir, { target: { value: 'ue-5' } });
    expect(await within(sag).findByText('Bu emirde numune isteği yok.')).toBeTruthy();
  });

  it('1993 a: kartına bağlı alınmamış yayındaki belge varsa kalite onayı olan açınca bir kez eşitlenir; onaysız eşitlemez, notu görür', async () => {
    const bekleyen = { ...SECENEK, studyo: { ...SECENEK.studyo, parcalar: { 7: { ...PARCA, alinmamis: 2 } } } };
    const esitleme = (yazmalar: { yol: string }[]) => yazmalar.filter((y) => y.yol === '/kalite-merkezi/studyo/parcalar/7/esitle');
    const m = kmAc('resimler?parca=7', MUHENDIS, {}, bekleyen);
    await waitFor(() => { expect(esitleme(m.yazmalar)).toHaveLength(1); });
    cleanup();
    const o = kmAc('resimler?parca=7', MUAYENECI, {}, bekleyen);
    expect(await screen.findByText(/bu karta bağlı 2 yayındaki belge var/)).toBeTruthy();
    expect(esitleme(o.yazmalar)).toHaveLength(0);
  });

  it('1995 a: eski revizyon rozetle ayrılır, güncel resim açılır; balonsuz yeni revizyona eski plan tek düğmeyle kopyalanır', async () => {
    const balon = {
      id: 5, no: 1, nominal: 'Ø5', tolerans: null, alt: '4.9', ust: '5.1', alet: null, siklik: null, kritik: false, yontem: null, olcuAletiGerekir: false,
      tur: null, sayfa: 1, x: 10, y: 20, yaziKutusu: null, yer: null, yerKipi: null, yerKontrol: false, surum: 1,
    };
    const parcasi: KmStudyoParcaCevabi = {
      resimler: [resim({ id: 20, ad: 'Deneme resim', revizyon: 'A', eski: true, balonlar: [balon] }), resim({ id: 21, ad: 'Deneme resim', revizyon: 'B', surum: 3, eski: false })],
      numunePlanlari: [], alinmamis: 0,
    };
    const s = kmAc('resimler?parca=7', MUHENDIS, {}, { ...SECENEK, studyo: { ...SECENEK.studyo, parcalar: { 7: parcasi } } });
    const sol = await screen.findByRole('complementary', { name: 'Parça ve resimler' });
    const eskiDugme = await within(sol).findByRole('button', { name: /Rev A/ });
    expect(within(eskiDugme).getByText('Eski revizyon')).toBeTruthy();
    expect(within(sol).getByRole('button', { name: /Rev B/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(sol).getByRole('button', { name: 'Eski revizyondan planı kopyala' }));
    await waitFor(() => {
      expect(s.yazmalar.find((y) => y.yol === '/kalite-merkezi/studyo/resimler/21/plani-kopyala')?.govde).toEqual({ kaynakResimId: 20, surum: 3 });
    });
  });

  it('1995 a: onaysız kullanıcı kopyalama düğmesini görmez', async () => {
    const parcasi: KmStudyoParcaCevabi = {
      resimler: [resim({ id: 20, revizyon: 'A', eski: true, balonlar: [] }), resim({ id: 21, revizyon: 'B', eski: false })], numunePlanlari: [], alinmamis: 0,
    };
    kmAc('resimler?parca=7', MUAYENECI, {}, { ...SECENEK, studyo: { ...SECENEK.studyo, parcalar: { 7: parcasi } } });
    const sol = await screen.findByRole('complementary', { name: 'Parça ve resimler' });
    await within(sol).findByRole('button', { name: /Rev B/ });
    expect(within(sol).queryByRole('button', { name: 'Eski revizyondan planı kopyala' })).toBeNull();
  });

  it('yan paneller kapalı açılır (1738 c); düğme açar, tercih bu tarayıcıda hatırlanır', async () => {
    window.localStorage.removeItem('kalite-merkezi:studyo-yan-panel');
    kmAc('resimler?parca=7', MUAYENECI, {}, SECENEK);
    const dugme = await screen.findByRole('button', { name: 'Yan panelleri göster' });
    expect(dugme.getAttribute('aria-expanded')).toBe('false');
    expect(dugme.closest('.km-st')?.classList.contains('km-st-genis')).toBe(true);
    const ust = dugme.parentElement!;
    expect(await within(ust).findByText('DNM-07')).toBeTruthy();
    fireEvent.click(dugme);
    const kapat = screen.getByRole('button', { name: 'Yan panelleri gizle' });
    expect(kapat.getAttribute('aria-expanded')).toBe('true');
    expect(kapat.closest('.km-st')?.classList.contains('km-st-genis')).toBe(false);
    expect(window.localStorage.getItem('kalite-merkezi:studyo-yan-panel')).toBe('acik');
    window.localStorage.removeItem('kalite-merkezi:studyo-yan-panel');
  });

  it('açılışta yazma isteği gitmez', async () => {
    const { fetch } = kmAc('resimler?parca=7', MUAYENECI, {}, SECENEK);
    await screen.findByRole('button', { name: /Deneme resim/ });
    expect(fetch.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method && (i as RequestInit).method !== 'GET')).toBe(false);
  });

  // Resim alma seçicisi ve resim alma/kaldırma cevapları ortak deneme sunucusunun üstüne konur (ötekiler ona gider).
  const BELGE: KmMerkezBelgesi = { id: 41, ad: 'Merkez flanş', harf: 'C', revKodu: '02', tur: 'resim', bicim: 'pdf', ozet: 'b'.repeat(64), bagli: true };
  function merkezliAc(k = MUHENDIS) {
    const acilan = kmAc('resimler?parca=7', k, {}, SECENEK);
    const asil = acilan.fetch.getMockImplementation()!;
    const cevap = (govde: unknown) => Promise.resolve(new Response(JSON.stringify(govde), { status: 200 }));
    acilan.fetch.mockImplementation((adres: string, istek?: RequestInit) => {
      if (adres.startsWith('/api/kalite-merkezi/studyo/merkez-belgeleri')) { void asil(adres, istek); return cevap({ belgeler: [BELGE] }); }
      if (adres === '/api/kalite-merkezi/studyo/resimler/al') { void asil(adres, istek); return cevap({ resim: resim({ id: 9, ad: 'Merkez flanş', merkezBelgeId: 41 }) }); }
      if (adres === '/api/kalite-merkezi/studyo/resimler/1/kaldir') { void asil(adres, istek); return cevap({ resim: resim({ aktif: false, surum: 2 }) }); }
      return asil(adres, istek);
    });
    return acilan;
  }

  it('onaylayan belge merkezinden resim alır: seçici yayındakileri listeler, seçilen belge revizyon koduyla alınır (2138-2, harf değil) ve listeye girer', async () => {
    const { yazmalar, fetch } = merkezliAc();
    fireEvent.click(await screen.findByRole('button', { name: 'Belge merkezinden al' }));
    const pencere = await screen.findByRole('dialog', { name: 'Belge merkezinden resim al' });
    // 1306: seçici stüdyodaki parçayı sorar; kartına bağlı belge işaretli gelir.
    expect(await within(pencere).findByText('Parçaya bağlı')).toBeTruthy();
    expect(fetch.mock.calls.some(([a]) => String(a).startsWith('/api/kalite-merkezi/studyo/merkez-belgeleri') && String(a).includes('malzemeNo=7'))).toBe(true);
    const satir = await within(pencere).findByRole('button', { name: /^Merkez flanş/ });
    expect(satir.textContent).toContain('Rev 02');
    expect(satir.textContent).not.toContain('Rev C');
    fireEvent.click(satir);
    await waitFor(() => { expect(yazmalar.some((y) => y.yol === '/kalite-merkezi/studyo/resimler/al')).toBe(true); });
    expect(yazmalar.find((y) => y.yol === '/kalite-merkezi/studyo/resimler/al')?.govde).toEqual({ malzemeNo: 7, merkezBelgeId: 41, revizyon: '02' });
    const sol = screen.getByRole('complementary', { name: 'Parça ve resimler' });
    expect(await within(sol).findByRole('button', { name: 'Merkez flanş resmini kaldır' })).toBeTruthy();
  });

  it('onaylayan resmi onayla kaldırır; sürüm gider, resim listeden düşer', async () => {
    const { yazmalar } = merkezliAc();
    fireEvent.click(await screen.findByRole('button', { name: 'Deneme resim resmini kaldır' }));
    const pencere = await screen.findByRole('dialog', { name: 'Resmi parçadan kaldır' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaldır' }));
    await waitFor(() => { expect(yazmalar.find((y) => y.yol === '/kalite-merkezi/studyo/resimler/1/kaldir')?.govde).toEqual({ surum: 1 }); });
    const sol = screen.getByRole('complementary', { name: 'Parça ve resimler' });
    await waitFor(() => { expect(within(sol).queryByRole('button', { name: /^Deneme resim/ })).toBeNull(); });
  });

  it('onayı olmayan resim alamaz ve kaldıramaz', async () => {
    merkezliAc(MUAYENECI);
    await screen.findByRole('button', { name: /Deneme resim/ });
    expect(screen.queryByRole('button', { name: 'Belge merkezinden al' })).toBeNull();
    expect(screen.queryByRole('button', { name: /resmini kaldır/ })).toBeNull();
    vi.unstubAllGlobals();
  });
});
