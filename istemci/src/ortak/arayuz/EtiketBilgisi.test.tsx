import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { cm1Coz, etiketFarklari } from '#paylasilan/etiket-kodu.ts';
import { EtiketBilgisi } from './EtiketBilgisi.tsx';

afterEach(cleanup);
const LOT = cm1Coz('CM1/LOT:ORN-LT-2041/TPN:ORN-TPN-77812/DKM:ORN-DKM-5531/SKT:270527/MK:ORN-MK-0045/GT:261118/TDR:ORN-TD-07/DRM:KBK/BT:261122');
const REFAKAT = cm1Coz('CM1/UE:142/PRC:ORN-PRC-001/REV:B/RRV:3/ADT:120/TRM:261125/OPS:10+20+30+15K/BT:261122');

describe('EtiketBilgisi', () => {
  it('CM1 olmayan kodda hiçbir şey çizmez', () => {
    const { container } = render(<EtiketBilgisi ozet={null} durum="cevrimdisi" />);
    expect(container.innerHTML).toBe('');
  });

  it('güncel: tek satır, bant yok', () => {
    render(<EtiketBilgisi ozet={LOT} durum="guncel" />);
    expect(screen.getByRole('status').textContent).toContain('Etiket güncel · basım 22.11.2026');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('çevrimdışı: Türkçe alan adı, GG.AA.YYYY, ham durum kodu yok; durum ve termin doğrulanmadı', () => {
    render(<EtiketBilgisi ozet={REFAKAT} durum="cevrimdisi" />);
    expect(screen.getByText(/Çevrimdışı bilgi · basım 22\.11\.2026 · güncel olmayabilir/)).toBeTruthy();
    for (const ad of ['Parça', 'Revizyon', 'Rota revizyonu', 'Adet', 'Termin', 'İşlemler']) expect(screen.getByText(ad)).toBeTruthy();
    for (const kisaltma of ['PRC', 'REV', 'RRV', 'ADT', 'TRM', 'OPS', 'BT']) expect(screen.queryByText(kisaltma)).toBeNull();
    expect(screen.getByText('25.11.2026')).toBeTruthy();
    expect(screen.getByText('10 · 20 · 30 · 15 işlem daha')).toBeTruthy();
    expect(screen.getAllByText('doğrulanmadı')).toHaveLength(1);
  });

  it('çevrimdışı lot: durum ekran dilinde ve doğrulanmadı rozetli', () => {
    render(<EtiketBilgisi ozet={LOT} durum="cevrimdisi" />);
    expect(screen.getByText('Karar bekliyor')).toBeTruthy();
    expect(screen.getByText('18.11.2026')).toBeTruthy();
    expect(screen.getAllByText('doğrulanmadı')).toHaveLength(1);
    expect(screen.getByText('Durum').closest('div')?.hasAttribute('data-soluk')).toBe(true);
  });

  it('eski: uyarı bandı alert, fark metni ve çağıranın eylemi', () => {
    const farklar = etiketFarklari(REFAKAT!, { REV: 'C' });
    render(<EtiketBilgisi ozet={REFAKAT} durum="eski" farklar={farklar} eylemler={<button type="button">Emri aç</button>} />);
    expect(screen.getByRole('alert').textContent).toContain('Etiket eski: revizyon B → C');
    expect(screen.getByRole('alert').textContent).toContain('Kullanma.');
    expect(screen.getByText('etikette B')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Emri aç' })).toBeTruthy();
  });

  it('kayıt yok ve okunuyor', () => {
    const { rerender } = render(<EtiketBilgisi ozet={LOT} durum="kayit-yok" />);
    expect(screen.getByRole('alert').textContent).toContain('Kayıt bulunamadı');
    rerender(<EtiketBilgisi ozet={LOT} durum="okunuyor" />);
    expect(screen.getByRole('status').textContent).toContain('Okunuyor');
  });

  it('sığmayıp düşen alan adıyla söylenir; bilinmeyen sürümde yalnız kimlik gösterilir', () => {
    const sevk = cm1Coz('CM1/KOL:ORN-KL-0091-1/NN:1-4/SVK:ORN-SVK-0091/MSN:ORN-SIP-5520/PRC:X/REV:B/ADT:50/LOT:ORN-LT-2041/BT:261122/+1');
    const { rerender } = render(<EtiketBilgisi ozet={sevk} durum="cevrimdisi" />);
    expect(screen.getByText(/Etikette 1 alan sığmadı: Üretim tarihi; bağlantı gelince kayıttan bakın/)).toBeTruthy();
    rerender(<EtiketBilgisi ozet={cm1Coz('CM2/UE:142/YENI:X/BT:261122')} durum="cevrimdisi" />);
    expect(screen.getByText(/Etiket sürümü tanınmadı; yalnız kimlik okundu \(UE:142\)/)).toBeTruthy();
    expect(screen.queryByText('YENI')).toBeNull();
  });
});
