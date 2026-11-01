import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KmCmmOnizlemeCevabi, KmCmmPlaniCevabi } from '#paylasilan/sozlesme/kalite-merkezi-cmm.ts';
import type { KmResim, KmStudyoParcaCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { kmAc, MUAYENECI, OKUYAN, type SunucuSecenegi } from '../yeni/test-ortak.tsx';
import { cmmMetniCoz } from './kurallar.ts';

// CMM sonuç dönüşü (1439 a). Uydurma deneme verisi; gerçek CMM çıktısı değildir.
const KART = { malzemeNo: 7, kod: 'DNM-07', ad: 'Deneme gövde', aktif: true };
const RESIM: KmResim = {
  id: 1, malzemeNo: 7, tur: 'resim', merkezBelgeId: 11, ozet: 'a'.repeat(64), ad: 'Deneme resim', revizyon: 'B', aktif: true, surum: 4,
  eklendi: '2026-10-20T08:00:00.000Z', balonlar: [],
};
const PARCA: KmStudyoParcaCevabi = { resimler: [RESIM], numunePlanlari: [] };
const SECENEK: SunucuSecenegi = {
  parcalar: [KART],
  emirler: [{ kimlik: 'ue-6', no: 'UE-6', tip: 'İş emri', acik: true, parcaNo: 'DNM-07', parcaAdi: null, miktar: 10, termin: null, firmaId: null, firmaAd: null }],
  studyo: { parcalar: { 7: PARCA }, numuneler: {} },
};
const satir = (o: Partial<KmCmmOnizlemeCevabi['satirlar'][number]>): KmCmmOnizlemeCevabi['satirlar'][number] => ({
  satir: 2, karakteristik: 'B1', olculen: '10.012', dosyaNominali: '10', balonId: 101, balonNo: 1, balonNominali: 'Ø10', alt: '9.95', ust: '10.05', uygun: true,
  durum: 'eslesti', ...o,
});
const ONIZLEME: KmCmmOnizlemeCevabi = {
  bicim: 'csv', ayirici: ';', basliklar: ['Karakteristik', 'Nominal', 'Ölçülen'], esleme: { karakteristik: 0, olculen: 2, nominal: 1 }, resimSurumu: 4,
  satirlar: [satir({}), satir({ satir: 3, karakteristik: 'B3', balonId: 103, balonNo: 3, dosyaNominali: '26', balonNominali: '25', durum: 'nominalFarki' }),
    satir({ satir: 4, karakteristik: 'CIRCLE_7', balonId: null, balonNo: null, balonNominali: null, alt: null, ust: null, uygun: null, durum: 'eslesmedi' })],
};
const PLAN: KmCmmPlaniCevabi = {
  resim: { id: 1, ad: 'Deneme resim', revizyon: 'B', malzemeNo: 7 }, kapsam: 'cmm',
  satirlar: [{ no: 1, tur: null, nominal: 'Ø10', tolerans: null, alt: '9.95', ust: '10.05', kritik: true, ozellik: 'Silindir / delik', uydurma: 'En küçük kareler', enAzNokta: 8, not: null }],
};

function ac(k = MUAYENECI) {
  const acilan = kmAc('resimler?parca=7', k, {}, SECENEK);
  const asil = acilan.fetch.getMockImplementation()!;
  const cevap = (govde: unknown) => Promise.resolve(new Response(JSON.stringify(govde), { status: 200 }));
  acilan.fetch.mockImplementation((adres: string, istek?: RequestInit) => {
    if (adres === '/api/kalite-merkezi/studyo/olcumler/cmm-onizle') { void asil(adres, istek); return cevap(ONIZLEME); }
    if (adres === '/api/kalite-merkezi/studyo/olcumler/cmm-yaz') { void asil(adres, istek); return cevap({ olcumler: [], atlanan: 1 }); }
    if (adres === '/api/kalite-merkezi/studyo/resimler/1/cmm-plani') return cevap(PLAN);
    return asil(adres, istek);
  });
  return acilan;
}

describe('CMM sonuç dönüşü (1439 a)', () => {
  it('kodlama: geçerli UTF-8 olduğu gibi, değilse Windows-1254', () => {
    expect(cmmMetniCoz(new TextEncoder().encode('Ölçülen;Çap'))).toBe('Ölçülen;Çap');
    expect(cmmMetniCoz(new Uint8Array([0xd6, 0x6c, 0xe7, 0xfc, 0x6c, 0x65, 0x6e, 0x3b, 0xdd, 0xfe]))).toBe('Ölçülen;İş');
  });

  it('dosya önizlenir; eşleşen satır yazılır, nominal farkı yalnız işaretlenince; yazma dosyayı ve sürümü gönderir, değeri göndermez', async () => {
    const { yazmalar } = ac();
    fireEvent.click(await screen.findByRole('button', { name: 'CMM sonucu yükle' }));
    const pencere = await screen.findByRole('dialog', { name: 'CMM sonucu yükle' });
    const metin = 'Karakteristik;Nominal;Ölçülen\nB1;10;10,012\n';
    const girdi = pencere.querySelector('input[type="file"]')!;
    // jsdom'un File'ında arrayBuffer yok; tarayıcıdaki davranış verilir.
    const dosya = Object.assign(new File([metin], 'sonuc.csv', { type: 'text/csv' }), { arrayBuffer: () => Promise.resolve(new TextEncoder().encode(metin).buffer) });
    fireEvent.change(girdi, { target: { files: [dosya] } });
    expect(await within(pencere).findByText('CIRCLE_7')).toBeTruthy();
    expect(within(pencere).getByRole('button', { name: '1 ölçüyü yaz' })).toBeTruthy();
    fireEvent.click(within(pencere).getByLabelText('Nominal farklı, yine de yaz'));
    fireEvent.click(within(pencere).getByRole('button', { name: '2 ölçüyü yaz' }));
    await waitFor(() => { expect(yazmalar.some((y) => y.yol === '/kalite-merkezi/studyo/olcumler/cmm-yaz')).toBe(true); });
    expect(yazmalar.find((y) => y.yol === '/kalite-merkezi/studyo/olcumler/cmm-yaz')?.govde).toEqual({
      uretimEmriId: 6, resimId: 1, metin, resimSurumu: 4, onaylananlar: [3], esleme: { karakteristik: 0, olculen: 2, nominal: 1 },
    });
  });

  it('yazma yetkisi olmayan yükleme düğmesini görmez, ölçüm planını açar', async () => {
    ac(OKUYAN);
    await screen.findByRole('button', { name: /Deneme resim/ });
    expect(screen.queryByRole('button', { name: 'CMM sonucu yükle' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'CMM ölçüm planı' }));
    const pencere = await screen.findByRole('dialog', { name: 'CMM ölçüm planı' });
    expect(await within(pencere).findByText('Silindir / delik')).toBeTruthy();
    expect(within(pencere).getByRole('button', { name: 'Yazdır' })).toBeTruthy();
  });
});
