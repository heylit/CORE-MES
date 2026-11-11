import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Talep } from '#paylasilan/sozlesme/satin-alma.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V } from './store.ts';
import './ui.ts';
import { grupMetni, ikinciAlimRiski, ikinciAlimUyarisi } from './guncelleme-grubu.ts';
import { talepEkrana } from './tasiyici.ts';
import { filteredRequests, headerFacts, nextStep, talepGovdesi } from './views.ts';
import type { PurchaseRequest } from './tipler.ts';
import { Talepler } from '../ekran/Talepler.tsx';

const KOK = '00000000-0000-4000-8000-000000000101', G1 = '00000000-0000-4000-8000-000000000102', G2 = '00000000-0000-4000-8000-000000000103';
const uye = (id: string, no: string, status: PurchaseRequest['status'], kok = false) => ({ id, no, status, kok });
const talep = (id: string, no: string, status: PurchaseRequest['status'], grup?: PurchaseRequest['guncellemeGrubu']) =>
  ({ id, no, title: 'Deneme', department: '', requester: '', priority: 'normal', needDate: '', notes: '', status, cancelReason: 'Deneme iptal',
    items: [{ id: 'k', name: 'Deneme kalem', qty: 1, unit: 'adet' }], quotes: [], rfqs: [], log: [], createdAt: 0, ...(grup ? { guncellemeGrubu: grup } : {}) }) as unknown as PurchaseRequest;

afterEach(() => { cleanup(); for (const k of Object.keys(S.requests)) delete S.requests[k]; V.q = ''; V.status = 'all'; });

describe('2876: merkezde güncelleme grubu', () => {
  it('taşıyıcı sunucunun grubunu ekran durumuna çevirir; grup yoksa alan da yok', () => {
    const t = { id: KOK, no: 'ST-1', baslik: 'Deneme', birim: null, talepEdenKisiId: null, talepEdenAdi: null, acanKisiId: null, teslimYontemi: null, uretimEmriId: null, uretimEmriNo: null,
      oncelik: 'normal', ihtiyacTarihi: null, notlar: '', durum: 'iptal', iptalNedeni: '', agirliklar: null, kalemler: [], teklifIstekleri: [], teklifler: [], karar: null,
      onaylar: [], hareketler: [], senaryolar: [], surum: 1, olusturma: '2026-11-11T08:00:00.000Z' } as unknown as Talep;
    expect(talepEkrana({ ...t, guncellemeGrubu: [{ id: KOK, no: 'ST-1', durum: 'iptal', kok: true }, { id: G1, no: 'ST-2', durum: 'teslim_alindi', kok: false }] }).guncellemeGrubu)
      .toEqual([uye(KOK, 'ST-1', 'cancelled', true), uye(G1, 'ST-2', 'received')]);
    expect('guncellemeGrubu' in talepEkrana(t)).toBe(false);
  });

  it('grup metni Taleplerim ile aynı dilde: kökte "Güncellemeleri", güncellemede "Güncelleme grubu" ve ilk talep', () => {
    const grup = [uye(KOK, 'ST-1', 'rfq', true), uye(G1, 'ST-2', 'draft')];
    expect(grupMetni(talep(KOK, 'ST-1', 'rfq', grup))).toBe('Güncellemeleri: ST-2 satın almada');
    expect(grupMetni(talep(G1, 'ST-2', 'draft', grup))).toBe('Güncelleme grubu: ST-1 (ilk talep) teklif toplanıyor');
    expect(grupMetni(talep(KOK, 'ST-1', 'rfq'))).toBe('');
    expect(headerFacts(talep(KOK, 'ST-1', 'rfq', grup))).toContain('Güncellemeleri: ST-2 satın almada');
  });

  it('Maliyet N1: öteki üye siparişte ya da teslim alınmışsa iptal talepte ikinci alım uyarısı; açık ya da iptal üyede uyarı yok', () => {
    const grup = [uye(KOK, 'ST-1', 'cancelled', true), uye(G1, 'ST-2', 'ordered'), uye(G2, 'ST-3', 'received')];
    const r = talep(KOK, 'ST-1', 'cancelled', grup);
    expect(ikinciAlimRiski(r).map((x) => x.no)).toEqual(['ST-2', 'ST-3']);
    expect(ikinciAlimUyarisi(r)).toBe('Güncelleme grubunda ST-2 (sipariş verildi), ST-3 (teslim alındı); iptal geri alınırsa aynı ihtiyaç için ikinci alım olabilir.');
    // Arayüz N1: uyarı tonunda, geri alma ikincil düğme (engellenmez).
    expect(nextStep(r).cls).toBe('warn');
    expect(nextStep(r).s).toContain(`Uyarı: ${ikinciAlimUyarisi(r)}`);
    expect(nextStep(r).b).toEqual([['req-uncancel', 'İptali geri al', 0]]);
    expect(talepGovdesi(r)).toContain('ikinci alım olabilir');
    const temiz = talep(KOK, 'ST-1', 'cancelled', [uye(KOK, 'ST-1', 'cancelled', true), uye(G1, 'ST-2', 'rfq'), uye(G2, 'ST-3', 'cancelled')]);
    expect(ikinciAlimUyarisi(temiz)).toBe('');
    expect(nextStep(temiz).s).toBe('Deneme iptal');
    expect([nextStep(temiz).cls, nextStep(temiz).b]).toEqual(['done', [['req-uncancel', 'İptali geri al', 1]]]);
    expect(talepGovdesi(temiz)).not.toContain('ikinci alım');
  });

  it('Talepler listesinde grup alt satırı çıkar, aramada öteki üyenin numarasıyla bulunur', () => {
    const grup = [uye(KOK, 'ST-DEN-1', 'rfq', true), uye(G1, 'ST-DEN-2', 'draft')];
    S.requests[KOK] = talep(KOK, 'ST-DEN-1', 'rfq', grup);
    S.requests[G2] = talep(G2, 'ST-DEN-9', 'rfq');
    V.q = 'ST-DEN-2';
    expect(filteredRequests().map((r) => r.id)).toEqual([KOK]);
    V.q = '';
    render(<MemoryRouter><Talepler /></MemoryRouter>);
    expect(document.body.textContent).toContain('Güncellemeleri: ST-DEN-2 satın almada');
    expect(document.body.textContent?.match(/Güncelle/g)?.length).toBe(1);
  });
});
