import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KmGirisAyrintisi, KmGirisBekleyenCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { kmAc, MUAYENECI, MUHENDIS, type TestKayitlari, type TestKullanicisi } from '../test-ortak.tsx';

// Kayıtlar ve adlar sentetiktir.
type Kayit = KmGirisBekleyenCevabi['kayitlar'][number];
const AYRINTI: KmGirisAyrintisi = {
  kartTuru: 'Hammadde', cinsi: null, kalite: 'Deneme kalite', form: 'Yuvarlak çubuk', durum: null, yuzey: null, standartlar: [], tolerans: null,
  istenenSertifikalar: [], mensei: null, olculer: [{ ad: 'Çap', deger: '40 mm' }], resimNo: null, revizyon: null, islemler: [],
  dokumNo: 'D-0001', tedarikciPartiNo: null, sertifikaNo: null, kontrol: null,
};
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const GKK: Kayit = {
  malKabulSatirId: 11, gkkNo: null, gkkTuru: 'hammadde', malKabulNo: 'MK-0001', zaman: '2026-10-30T08:00:00.000Z', malzemeId: 901, malzemeKod: 'HM-0001', malzemeAd: 'Deneme çubuk', birim: 'kg',
  partiId: 4, partiEtiketi: 'LT-000123', sertifikaVar: false, tedarikciAdi: 'Deneme Tedarikçi', siparisNo: 'SA-0001', miktar: '10.000', durum: 'gkk_bekliyor',
  kabulMiktar: null, hataliMiktar: null, gkkKisiAd: null, gkkZaman: null, karar: null, ncrNo: null, kararKisiAd: null, kararZaman: null, not: null,
};
const KARAR: Kayit = { ...GKK, malKabulSatirId: 12, malKabulNo: 'MK-0002', sertifikaVar: true, durum: 'karar_bekliyor', kabulMiktar: '7.000', hataliMiktar: '3.000', gkkKisiAd: 'Deneme Kişi', gkkZaman: '2026-10-30T09:00:00.000Z' };
const KAPALI: Kayit = { ...KARAR, malKabulSatirId: 13, gkkNo: 'GKK-2026-0001', malKabulNo: 'MK-0003', durum: 'kapandi', karar: 'red', ncrNo: 'NCR-2026-0001', kararKisiAd: 'Deneme Kişi', kararZaman: '2026-10-30T10:00:00.000Z' };

interface Secenek { cakisma?: boolean; ayrinti?: KmGirisAyrintisi; tek?: Kayit }
function ac(k: TestKullanicisi, gorunum: string, kayitlar: Kayit[], ek: TestKayitlari = {}, secenek: Secenek = {}) {
  const s = kmAc(gorunum, k, ek);
  const asil = s.fetch.getMockImplementation();
  const tek = new Map<number, Kayit>([secenek.tek ?? GKK, KARAR, KAPALI].map((x) => [x.malKabulSatirId, x]));
  const ayrinti = secenek.ayrinti ?? AYRINTI;
  s.fetch.mockImplementation(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace(/^\/api/, '');
    if (yol === '/kalite-merkezi/giris/bekleyenler') return json(200, { kayitlar: kayitlar.filter((x) => tek.get(x.malKabulSatirId)?.durum !== 'kapandi') });
    if (yol.startsWith('/kalite-merkezi/giris/kayitlar?')) return json(200, { kayitlar: [KAPALI], sinirda: false });
    const okuma = /^\/kalite-merkezi\/giris\/(\d+)$/.exec(yol);
    if (okuma) { const x = tek.get(Number(okuma[1])); return x ? json(200, { kayit: x, ayrinti }) : json(404, {}); }
    if (yol === '/kalite-merkezi/giris/11/gkk') {
      s.yazmalar.push({ yol, govde: JSON.parse(String(istek?.body)) });
      if (secenek.cakisma) { tek.set(11, { ...GKK, durum: 'kapandi', kabulMiktar: '10.000', hataliMiktar: '0.000' }); return json(409, { mesaj: 'Bu lotun giriş kontrolü verilmiş.' }); }
      const g = JSON.parse(String(istek?.body)) as { kabul: string; hatali: string; karar: { karar: Kayit['karar']; ncrNo: string } | null };
      const yeni: Kayit = {
        ...(secenek.tek ?? GKK), gkkNo: 'GKK-2026-0002', durum: g.karar ? 'kapandi' : Number(g.hatali) > 0 ? 'karar_bekliyor' : 'kapandi', kabulMiktar: g.kabul, hataliMiktar: g.hatali,
        gkkKisiAd: 'Deneme Kişi', gkkZaman: '2026-10-30T09:30:00.000Z', karar: g.karar?.karar ?? null, ncrNo: g.karar?.ncrNo ?? null,
      };
      tek.set(11, yeni);
      return json(200, { kayit: yeni, ayrinti });
    }
    if (yol === '/kalite-merkezi/giris/12/karar') {
      s.yazmalar.push({ yol, govde: JSON.parse(String(istek?.body)) });
      const yeni: Kayit = { ...KARAR, durum: 'kapandi', karar: 'red', ncrNo: 'NCR-X' };
      tek.set(12, yeni);
      return json(200, { kayit: yeni, ayrinti });
    }
    return asil ? asil(adres, istek) : json(404, {});
  });
  return s;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('GKK listesi ve formu (1246, 3117, 3118)', () => {
  it('liste sekmeleri bekleyen ve karar bekleyeni ayırır; Yapılan tarih aralığıyla ister; satır formu açar', async () => {
    const s = ac(MUHENDIS, 'giris-kontrolu', [GKK, KARAR]);
    const bekleyen = await screen.findByRole('table', { name: 'Bekleyen GKK' });
    expect(within(bekleyen).getByText('MK-0001')).toBeTruthy();
    expect(within(bekleyen).queryByText('MK-0002')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Karar bekleyen/ }));
    expect(within(await screen.findByRole('table', { name: 'Karar bekleyen' })).getByText('MK-0002')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Yapılan/ }));
    expect(within(await screen.findByRole('table', { name: 'Yapılan GKK' })).getByText('MK-0003')).toBeTruthy();
    expect(s.fetch.mock.calls.some(([a]) => /\/giris\/kayitlar\?baslangic=\d{4}-\d{2}-\d{2}&bitis=\d{4}-\d{2}-\d{2}$/.test(String(a)))).toBe(true);
    fireEvent.click(screen.getByText('MK-0003'));
    expect(await screen.findByText('NCR-2026-0001')).toBeTruthy();
    expect(screen.queryByRole('button', { name: "GKK'yı kaydet" })).toBeNull();
  });

  it('hammadde GKK: malzeme ve lot ayrıntısı görünür; Kısmi kabul miktar, kontrol listesi ve ret kararını tek istekte, tekrar korumalı gönderir', async () => {
    const s = ac(MUHENDIS, 'giris-kontrolu', [GKK], { ncr: [{ no: `NCR-${String(new Date().getFullYear())}-0004` }] });
    fireEvent.click(await screen.findByText('MK-0001'));
    expect(await screen.findByText('Numara kaydedince verilir')).toBeTruthy();
    expect(screen.getByText('Kart: 40 mm')).toBeTruthy();
    expect(screen.getByText('D-0001')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Seri numaraları/ })).toBeNull();
    fireEvent.click(within(screen.getByRole('group', { name: 'İrsaliye ve sipariş uyumlu' })).getByRole('button', { name: 'Uygun' }));
    fireEvent.change(screen.getByLabelText('Çap ölçülen'), { target: { value: '40,02' } });
    fireEvent.click(screen.getByRole('button', { name: /^Kısmi kabul/ }));
    fireEvent.change(screen.getByLabelText('Ret'), { target: { value: '2' } });
    expect(screen.getByText('8 kg')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Gerekçe'), { target: { value: 'Ölçü dışı' } });
    fireEvent.click(screen.getByRole('button', { name: "GKK'yı kaydet" }));
    fireEvent.click(within(screen.getByRole('dialog', { name: "GKK'yı kaydet" })).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(s.yazmalar.some((y) => y.yol === '/kalite-merkezi/giris/11/gkk')).toBe(true); });
    const govde = s.yazmalar.find((y) => y.yol === '/kalite-merkezi/giris/11/gkk')?.govde as Record<string, unknown>;
    expect(govde).toMatchObject({ kabul: '8', hatali: '2', not: null, karar: { karar: 'red', ciddiyet: 'Majör', not: 'Ölçü dışı' } });
    const kontrol = govde['kontrol'] as { maddeler: { anahtar: string; sonuc: string }[]; olcumler: unknown[]; islemler: unknown[]; seriler: unknown[] };
    expect(kontrol.maddeler[0]).toEqual({ anahtar: 'irsaliye', sonuc: 'uygun' });
    expect(kontrol.maddeler.slice(1).every((m) => m.sonuc === 'bakilmadi')).toBe(true);
    expect(kontrol.olcumler).toEqual([{ ad: 'Çap', istenen: '40 mm', olculen: '40,02' }]);
    expect(kontrol.islemler).toEqual([]);
    expect(kontrol.seriler).toEqual([]);
    const istek = s.fetch.mock.calls.find(([a]) => String(a).endsWith('/giris/11/gkk'));
    expect(new Headers((istek?.[1] as RequestInit | undefined)?.headers).get('istek-kimligi')).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByRole('heading', { name: 'Kalite kararı' })).toBeTruthy();
    expect(screen.getByText('GKK-2026-0002')).toBeTruthy();
  });

  it('Kısmi kabulde karar sonraya bırakılırsa karar gönderilmez, hatalı Karar bekleyen olur', async () => {
    const s = ac(MUHENDIS, 'giris-kontrolu', [GKK]);
    fireEvent.click(await screen.findByText('MK-0001'));
    fireEvent.click(await screen.findByRole('button', { name: /^Kısmi kabul/ }));
    fireEvent.click(screen.getByLabelText(/kararını sonra ver/));
    fireEvent.change(screen.getByLabelText('Hatalı'), { target: { value: '3' } });
    expect(screen.queryByLabelText('Ciddiyet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: "GKK'yı kaydet" }));
    fireEvent.click(within(screen.getByRole('dialog', { name: "GKK'yı kaydet" })).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(s.yazmalar.some((y) => y.yol.endsWith('/gkk'))).toBe(true); });
    expect(s.yazmalar.find((y) => y.yol.endsWith('/gkk'))?.govde).toMatchObject({ kabul: '7', hatali: '3', karar: null });
    expect(await screen.findByRole('heading', { name: 'Hatalı için kalite kararı' })).toBeTruthy();
  });

  it('sonuç seçilmeden ve miktar lotu aşınca GKK gönderilmez; Şartlı kabulde şart zorunludur; Ret lotun tamamıdır', async () => {
    const s = ac(MUHENDIS, 'giris-kontrolu', [GKK]);
    fireEvent.click(await screen.findByText('MK-0001'));
    fireEvent.click(await screen.findByRole('button', { name: "GKK'yı kaydet" }));
    expect(screen.getByText('Sonuç seçin.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Kısmi kabul/ }));
    fireEvent.change(screen.getByLabelText('Ret'), { target: { value: '10' } });
    expect(screen.getByText(/lot miktarından \(10\) küçük olmalı/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: "GKK'yı kaydet" }));
    expect(screen.queryByRole('dialog', { name: "GKK'yı kaydet" })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Şartlı kabul/ }));
    expect((screen.getByLabelText(/^Şart/, { selector: 'textarea' }) as HTMLTextAreaElement).required).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^Ret/ }));
    expect(screen.getByText(/Lotun tamamı \(10 kg\) ret/)).toBeTruthy();
    expect(s.yazmalar.some((y) => y.yol.endsWith('/gkk'))).toBe(false);
  });

  it('yarı mamul GKK: işlemler ve seri listesi kontrolle gider; hatalı seri hatalı miktarı önerir', async () => {
    const YM: Kayit = { ...GKK, gkkTuru: 'yari_mamul' };
    const s = ac(MUHENDIS, 'giris-kontrolu', [YM], {}, { ayrinti: { ...AYRINTI, kartTuru: 'Yarı mamul', olculer: [], resimNo: 'RS-0001', revizyon: 'B', islemler: ['OP10 Tornalama'] }, tek: YM });
    fireEvent.click(await screen.findByText('MK-0001'));
    expect(await screen.findByText('RS-0001')).toBeTruthy();
    expect(screen.getByText('Resim no ve revizyon kartla aynı')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('group', { name: 'OP10 Tornalama' })).getByRole('button', { name: 'Uygun değil' }));
    fireEvent.change(screen.getByLabelText('Seri no'), { target: { value: 'S-1 S-2 S-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));
    fireEvent.click(screen.getByRole('button', { name: 'S-2 hatalı' }));
    fireEvent.click(screen.getByRole('button', { name: /^Kısmi kabul/ }));
    expect((screen.getByLabelText('Ret') as HTMLInputElement).value).toBe('1');
    fireEvent.click(screen.getByRole('button', { name: "GKK'yı kaydet" }));
    fireEvent.click(within(screen.getByRole('dialog', { name: "GKK'yı kaydet" })).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(s.yazmalar.some((y) => y.yol.endsWith('/gkk'))).toBe(true); });
    const kontrol = (s.yazmalar.find((y) => y.yol.endsWith('/gkk'))?.govde as { kontrol: { islemler: unknown; seriler: unknown; maddeler: { anahtar: string }[] } }).kontrol;
    expect(kontrol.islemler).toEqual([{ ad: 'OP10 Tornalama', sonuc: 'uygun_degil' }]);
    expect(kontrol.seriler).toEqual([{ no: 'S-1', hatali: false }, { no: 'S-2', hatali: true }]);
    expect(kontrol.maddeler.map((m) => m.anahtar)).toContain('resim');
  });

  it('başkası önce yazdıysa (409) form yenilenir ve salt okunur olur', async () => {
    ac(MUHENDIS, 'giris-kontrolu', [GKK], {}, { cakisma: true });
    fireEvent.click(await screen.findByText('MK-0001'));
    fireEvent.click(await screen.findByRole('button', { name: /^Kabul/ }));
    fireEvent.click(screen.getByRole('button', { name: "GKK'yı kaydet" }));
    fireEvent.click(within(screen.getByRole('dialog', { name: "GKK'yı kaydet" })).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText(/az önce yazıldı/)).toBeTruthy();
    await waitFor(() => { expect(screen.queryByRole('button', { name: "GKK'yı kaydet" })).toBeNull(); });
  });

  it('hatalının kararı NCR numarasıyla gider; karar seçimsiz açılır ve seçilmeden yazılmaz (2754 a/a); şartlı kabulde şart zorunludur', async () => {
    const s = ac(MUHENDIS, 'giris-kontrolu', [KARAR], { ncr: [{ no: `NCR-${String(new Date().getFullYear())}-0004` }] });
    fireEvent.click(await screen.findByRole('tab', { name: /Karar bekleyen/ }));
    fireEvent.click(await screen.findByText('MK-0002'));
    const karar = await screen.findByLabelText(/^Karar/);
    expect((karar as HTMLSelectElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Kararı yaz' }));
    expect(screen.getByText('Karar seçin.')).toBeTruthy();
    expect(s.yazmalar.some((y) => y.yol.includes('/karar'))).toBe(false);
    fireEvent.change(karar, { target: { value: 'sartli_kabul' } });
    expect((screen.getByLabelText(/Şart/) as HTMLTextAreaElement).required).toBe(true);
    fireEvent.change(karar, { target: { value: 'red' } });
    fireEvent.change(screen.getByLabelText('Gerekçe'), { target: { value: 'Ölçü dışı' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kararı yaz' }));
    await waitFor(() => { expect(s.yazmalar.some((y) => y.yol === '/kalite-merkezi/giris/12/karar')).toBe(true); });
    expect(s.yazmalar.find((y) => y.yol === '/kalite-merkezi/giris/12/karar')?.govde)
      .toMatchObject({ karar: 'red', ciddiyet: 'Majör', not: 'Ölçü dışı', ncrNo: `NCR-${String(new Date().getFullYear())}-0005` });
    expect(await screen.findByRole('heading', { name: 'Kalite kararı' })).toBeTruthy();
  });

  it('Bugün: bekleyen satırın GKK düğmesi ve kısayol GKK sayfasına gider; Tümü listeyi açar', async () => {
    ac(MUHENDIS, '', [GKK]);
    const bolum = await screen.findByRole('region', { name: 'Giriş kontrolü' });
    expect(within(bolum).getByText('Sertifika yok')).toBeTruthy();
    fireEvent.click(within(bolum).getByRole('button', { name: 'GKK' }));
    expect(await screen.findByRole('button', { name: "GKK'yı kaydet" })).toBeTruthy();
    expect(screen.getByText('LT-000123')).toBeTruthy();
  });

  it('onay yetkisi olmayan kişide liste istenmez; kısayol bugünkü boş giriş muayenesini açar', async () => {
    const s = ac(MUAYENECI, '', [GKK]);
    await screen.findByRole('heading', { level: 2, name: 'Merhaba Deneme' });
    expect(screen.queryByRole('region', { name: 'Giriş kontrolü' })).toBeNull();
    expect(s.fetch.mock.calls.some(([a]) => String(a).includes('/giris/'))).toBe(false);
    cleanup();
    const t = ac(MUAYENECI, 'giris-kontrolu', [GKK]);
    expect(await screen.findByText('GKK onay yetkisiyle yapılır')).toBeTruthy();
    expect(t.fetch.mock.calls.some(([a]) => String(a).includes('/giris/'))).toBe(false);
  });
});
