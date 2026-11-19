import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type {
  BildirimAlicilariCevabi, BildirimGosterimleriCevabi, BildirimPushTurleriCevabi, CagriYonlendirmeCevabi, CagriYonlendirmeDegistirGovdesi,
} from '#paylasilan/sozlesme/bildirim.ts';
import type { EpostaSablonlariCevabi, EpostaTetikleyicileriCevabi } from '#paylasilan/sozlesme/bildirim-eposta.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { IKINCI_MENULER, maddeGorunurMu } from '#paylasilan/sayfalar.ts';
import { BildirimYonetimi } from './BildirimYonetimi.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

const BASLANGIC: CagriYonlendirmeCevabi = {
  satirlar: [
    { ekip: 'bakim', rolIdleri: [1, 2], surum: 1, degistiren: null, degistirildi: '2026-10-21T09:00:00Z' },
    { ekip: 'malzeme', rolIdleri: [3], surum: 4, degistiren: { id: 9, ad: 'Deneme Yönetici' }, degistirildi: '2026-10-21T09:00:00Z' },
    { ekip: 'ayarci', rolIdleri: [], surum: 1, degistiren: null, degistirildi: '2026-10-21T09:00:00Z' },
  ],
  roller: [{ id: 1, kod: 'bakim', ad: 'Bakım' }, { id: 2, kod: 'mudur', ad: 'Müdür' }, { id: 3, kod: 'depo', ad: 'Depo' }],
};

const ALICILAR: BildirimAlicilariCevabi = {
  satirlar: [
    {
      tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu', onem: 'acil', kaynakModul: 'istasyonlar', varsayilanIslemler: ['arkon.bakim'],
      rolIdleri: [], kisiIdleri: [], surum: null, degistiren: null, degistirildi: null,
    },
    {
      tur: 'satin-alma.talep-onay-bekliyor', baslik: 'Satın alma talebi onay bekliyor', onem: 'uyari', kaynakModul: 'satin-alma',
      varsayilanIslemler: ['satin-alma.onayla'], rolIdleri: [2], kisiIdleri: [7], surum: 3,
      degistiren: { id: 9, ad: 'Deneme Sorumlu' }, degistirildi: '2026-10-21T09:00:00Z',
    },
    {
      tur: 'stok.birakildi', baslik: 'Malzeme bırakıldı', onem: 'bilgi', kaynakModul: 'stok', varsayilanIslemler: [],
      rolIdleri: [], kisiIdleri: [], surum: null, degistiren: null, degistirildi: null,
    },
  ],
  roller: [{ id: 1, kod: 'bakim', ad: 'Bakım' }, { id: 2, kod: 'mudur', ad: 'Müdür' }],
  kisiler: [{ id: 7, ad: 'Deneme Kalite' }, { id: 8, ad: 'Deneme Planlama' }],
};

function sunucuKur(yazmaDurumu = 200) {
  const yazilanlar: { ekip: string; govde: CagriYonlendirmeDegistirGovdesi }[] = [];
  let saklanan = BASLANGIC;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    if (yol === '/bildirimler/cagri-yonlendirme') return json(200, saklanan);
    if (yol === '/bildirimler/alicilar') return json(200, ALICILAR);
    const m = /^\/bildirimler\/cagri-yonlendirme\/([a-z]+)\/degistir$/.exec(yol);
    if (m?.[1]) {
      const govde = JSON.parse(secenek.body ?? '{}') as CagriYonlendirmeDegistirGovdesi;
      yazilanlar.push({ ekip: m[1], govde });
      if (yazmaDurumu !== 200) return json(yazmaDurumu, { kod: 'ESKI_SURUM', mesaj: 'Kayıt başkası tarafından değiştirildi.' });
      saklanan = {
        ...saklanan,
        satirlar: saklanan.satirlar.map((s) => (s.ekip === m[1] ? { ...s, rolIdleri: govde.rolIdleri, surum: s.surum + 1 } : s)),
      };
      return json(200, saklanan);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yazilanlar;
}

const HEPSI = ['ayarlar.yaz', 'bildirim.eposta-yonet', 'bildirim.kademe-yonet'] as const;
function ac(islemler: readonly string[] = HEPSI, adres = '/bildirim-merkezi/yonetim') {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler: [...islemler] as Kullanici['islemler'] });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><MemoryRouter initialEntries={[adres]}><BildirimYonetimi /></MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
}
const ekipAc = (islemler?: readonly string[]) => { ac(islemler, '/bildirim-merkezi/yonetim?sekme=ekip'); };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('bildirim yönetimi: ekip çağrıları', () => {
  it('her ekip seçili rolleriyle görünür; boş ekip "kimseye gitmiyor" der', async () => {
    sunucuKur();
    ekipAc();
    const bakim = await screen.findByRole('group', { name: 'Bakım alıcı rolleri' });
    expect((within(bakim).getByRole('checkbox', { name: 'Bakım' }) as HTMLInputElement).checked).toBe(true);
    expect((within(bakim).getByRole('checkbox', { name: 'Depo' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Kimseye gitmiyor')).toBeTruthy();
    expect(screen.getByText(/Deneme Yönetici/)).toBeTruthy();
  });

  it('rol eklemek ekibin okunan sürümüyle yeni listeyi yazar', async () => {
    const yazilanlar = sunucuKur();
    ekipAc();
    const malzeme = await screen.findByRole('group', { name: 'Malzeme alıcı rolleri' });
    fireEvent.click(within(malzeme).getByRole('checkbox', { name: 'Müdür' }));
    await waitFor(() => { expect(yazilanlar).toEqual([{ ekip: 'malzeme', govde: { rolIdleri: [3, 2], surum: 4 } }]); });
    expect(await screen.findByText('Çağrı alıcıları kaydedildi.')).toBeTruthy();
  });

  it('sunucu reddederse hata görünür ve seçim sunucudaki hâle döner', async () => {
    sunucuKur(409);
    ekipAc();
    const bakim = await screen.findByRole('group', { name: 'Bakım alıcı rolleri' });
    fireEvent.click(within(bakim).getByRole('checkbox', { name: 'Müdür' }));
    expect(await screen.findByText('Kayıt başkası tarafından değiştirildi.')).toBeTruthy();
    expect((within(bakim).getByRole('checkbox', { name: 'Müdür' }) as HTMLInputElement).checked).toBe(true);
  });
});

// 3435-3 a: olay ve kanal tablosu.
const GOSTERIM: BildirimGosterimleriCevabi = {
  satirlar: [
    { tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu', onem: 'acil', kaynakModul: 'istasyonlar', ortada: true, onayIstenir: false, surum: null, degistiren: null, degistirildi: null },
    { tur: 'satin-alma.talep-onay-bekliyor', baslik: 'Satın alma talebi onay bekliyor', onem: 'uyari', kaynakModul: 'satin-alma', ortada: false, onayIstenir: false, surum: 2, degistiren: null, degistirildi: null },
    { tur: 'stok.birakildi', baslik: 'Malzeme bırakıldı', onem: 'bilgi', kaynakModul: 'stok', ortada: false, onayIstenir: false, surum: null, degistiren: null, degistirildi: null },
  ],
};
const PUSH: BildirimPushTurleriCevabi = {
  satirlar: GOSTERIM.satirlar.map((s) => ({ tur: s.tur, baslik: s.baslik, onem: s.onem, kaynakModul: s.kaynakModul, acik: s.onem === 'acil', varsayilan: s.onem === 'acil' })),
};
const tetik = (tur: string, baslik: string, onem: 'acil' | 'uyari' | 'bilgi', konu: 'uretim' | 'satin-alma', ek: Partial<EpostaTetikleyicileriCevabi['satirlar'][number]> = {}) => ({
  tur, baslik, onem, sinif: 'gorev', konu, eposta: false, zaman: 'hemen', tekrarGun: null, tekrarEnCok: null, yukseltGun: null,
  yukseltRolIdleri: [], yukseltKisiIdleri: [], sablonId: null, surum: null, ...ek,
}) as EpostaTetikleyicileriCevabi['satirlar'][number];
const TETIK: EpostaTetikleyicileriCevabi = {
  satirlar: [
    tetik('istasyonlar.makine-durdu', 'Makine durdu', 'acil', 'uretim'),
    tetik('satin-alma.talep-onay-bekliyor', 'Satın alma talebi onay bekliyor', 'uyari', 'satin-alma', { eposta: true, sablonId: 9, surum: 4 }),
  ],
  roller: [{ id: 1, ad: 'Bakım' }, { id: 2, ad: 'Müdür' }],
  kisiler: [{ id: 7, ad: 'Deneme Kalite' }],
};
const SABLONLAR = {
  satirlar: [],
  ozel: [{
    id: 9, ad: 'ORN Acil talep', simge: 'alert', konuKalibi: '{olay}', baslikKalibi: null, govde: '{olay}', tabloAlanlari: [], dugmeYazisi: null,
    onayDugmesi: true, altBilgi: null, serit: 'onem', logo: false, olaySayisi: 1, surum: 1, degistirildi: '2026-11-19T08:00:00.000+03:00',
  }],
} satisfies EpostaSablonlariCevabi;

function matrisSunucusu(hataliYol?: string) {
  const yazilanlar: { yol: string; govde: unknown }[] = [];
  const okunanlar: string[] = [];
  // Alıcı yazımı sunucudaki gibi satırı değiştirir ve sürümü artırır; Geri al yeniden okunan sürümü taşımalıdır.
  const alicilar: BildirimAlicilariCevabi = structuredClone(ALICILAR);
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { method?: string; body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    if (secenek.method === 'POST') {
      const govde = JSON.parse(secenek.body ?? '{}') as { rolIdleri?: number[]; kisiIdleri?: number[]; surum?: number | null };
      yazilanlar.push({ yol, govde });
      if (yol === hataliYol) return json(409, { kod: 'CAKISMA', mesaj: 'Kayıt başkası tarafından değiştirildi.' });
      const alici = /^\/bildirimler\/alicilar\/([^/]+)\/degistir$/.exec(yol);
      const satir = alici ? alicilar.satirlar.find((a) => a.tur === alici[1]) : undefined;
      if (satir) {
        if (govde.surum !== satir.surum) return json(409, { kod: 'CAKISMA', mesaj: 'Kayıt başkası tarafından değiştirildi.' });
        Object.assign(satir, { rolIdleri: govde.rolIdleri ?? [], kisiIdleri: govde.kisiIdleri ?? [], surum: (satir.surum ?? 0) + 1 });
      }
      return json(200, {});
    }
    okunanlar.push(yol);
    if (yol === '/bildirimler/alicilar') return json(200, alicilar);
    if (yol === '/bildirimler/gosterim') return json(200, GOSTERIM);
    if (yol === '/bildirimler/push/turler') return json(200, PUSH);
    if (yol === '/bildirimler/eposta/tetikleyiciler') return json(200, TETIK);
    if (yol === '/bildirimler/eposta/sablonlar') return json(200, SABLONLAR);
    if (yol === '/bildirim-kademe/kaynaklar') return json(200, { kaynaklar: [], roller: [] });
    if (yol === '/bildirimler/cagri-yonlendirme') return json(200, BASLANGIC);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return { yazilanlar, okunanlar };
}

const ayrintiAc = async (baslik: string) => {
  fireEvent.click(await screen.findByRole('button', { name: `${baslik}: ayrıntı` }));
  return screen.findByRole('dialog', { name: baslik });
};
const anahtar = (ad: string) => screen.getByRole('switch', { name: ad });

describe('bildirim ve uyarı yönetimi: olaylar (3435-3, 3456)', () => {
  it('her olay tek satırda: kanal anahtarları, e-posta zamanı ve şablonu, alıcılar; varsayılan alıcı işaretli', async () => {
    matrisSunucusu();
    ac();
    const tablo = await screen.findByRole('table', { name: 'Bildirim olayları' });
    const satin = within(tablo).getByText('Satın alma talebi onay bekliyor').closest('tr');
    if (!satin) throw new Error('satır yok');
    expect(within(satin).getByText('Hemen · ORN Acil talep')).toBeTruthy();
    expect(within(satin).getByText('Müdür, 1 kişi')).toBeTruthy();
    expect(anahtar('Satın alma talebi onay bekliyor: E-posta').getAttribute('aria-checked')).toBe('true');
    expect(anahtar('Makine durdu: Ekran ortası').getAttribute('aria-checked')).toBe('true');
    expect(anahtar('Makine durdu: Telefon').getAttribute('aria-checked')).toBe('true');
    expect(anahtar('Malzeme bırakıldı: Telefon').getAttribute('aria-checked')).toBe('false');
    const makine = within(tablo).getByText('Makine durdu').closest('tr');
    expect(makine?.textContent).toMatch(/Yetkisi olanlar .*\(varsayılan\)/);
    expect(within(tablo).getByText('Malzeme bırakıldı').closest('tr')?.textContent).toMatch(/Kayda bağlı kişi/);
    expect(within(tablo).queryByText('Zil')).toBeNull();
    expect(screen.getByRole('tab', { name: /Kademeli uyarı/ })).toBeTruthy();
  });

  it('anahtar basınca o kanal hemen, okunan sürümle yazılır; öteki gösterim alanı korunur', async () => {
    const { yazilanlar } = matrisSunucusu();
    ac();
    await screen.findByRole('table', { name: 'Bildirim olayları' });
    fireEvent.click(anahtar('Satın alma talebi onay bekliyor: Okudum onayı'));
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]).toEqual({ yol: '/bildirimler/gosterim/satin-alma.talep-onay-bekliyor/degistir', govde: { ortada: false, onayIstenir: true, surum: 2 } });
    fireEvent.click(anahtar('Malzeme bırakıldı: Telefon'));
    await waitFor(() => { expect(yazilanlar).toHaveLength(2); });
    expect(yazilanlar[1]).toEqual({ yol: '/bildirimler/push/turler/stok.birakildi/degistir', govde: { acik: true } });
  });

  it('e-posta anahtarı yalnız açık-kapalıyı değiştirir; şablon ve zaman olduğu gibi gider', async () => {
    const { yazilanlar } = matrisSunucusu();
    ac();
    await screen.findByRole('table', { name: 'Bildirim olayları' });
    fireEvent.click(anahtar('Satın alma talebi onay bekliyor: E-posta'));
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]).toEqual({
      yol: '/bildirimler/eposta/tetikleyiciler/satin-alma.talep-onay-bekliyor/degistir',
      govde: { eposta: false, zaman: 'hemen', tekrarGun: null, tekrarEnCok: null, yukseltGun: null, yukseltRolIdleri: [], yukseltKisiIdleri: [], sablonId: 9, surum: 4 },
    });
  });

  it('Geri al eski değeri yeniden okunan sürümle yazar', async () => {
    const { yazilanlar } = matrisSunucusu();
    ac();
    await screen.findByRole('table', { name: 'Bildirim olayları' });
    fireEvent.click(anahtar('Makine durdu: Okudum onayı'));
    expect(await screen.findByText('Makine durdu: Okudum onayı açıldı.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(2); });
    expect(yazilanlar[1]).toEqual({ yol: '/bildirimler/gosterim/istasyonlar.makine-durdu/degistir', govde: { ortada: true, onayIstenir: false, surum: null } });
    expect(await screen.findByText('Geri alındı.')).toBeTruthy();
  });

  it('kanal kaydedilemezse olay adıyla hata görünür', async () => {
    matrisSunucusu('/bildirimler/gosterim/istasyonlar.makine-durdu/degistir');
    ac();
    await screen.findByRole('table', { name: 'Bildirim olayları' });
    fireEvent.click(anahtar('Makine durdu: Ekran ortası'));
    expect(await screen.findByText(/Makine durdu: kaydedilemedi/)).toBeTruthy();
  });

  it('modülün toplu e-posta açması önce kaç olayı etkilediğini sorar, onayla yazar', async () => {
    const { yazilanlar } = matrisSunucusu();
    ac();
    await screen.findByRole('table', { name: 'Bildirim olayları' });
    const toplu = screen.getByRole('checkbox', { name: 'İstasyonlar: E-posta, 0/1 açık' });
    expect(toplu.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toplu);
    const sor = await screen.findByRole('dialog', { name: 'İstasyonlar: E-posta açılsın mı?' });
    expect(yazilanlar).toHaveLength(0);
    fireEvent.click(within(sor).getByRole('button', { name: '1 olayda aç' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]?.yol).toBe('/bildirimler/eposta/tetikleyiciler/istasyonlar.makine-durdu/degistir');
    expect(yazilanlar[0]?.govde).toMatchObject({ eposta: true });
  });

  it('toplu kapatma sormadan yazar; aramaya uymayan olaya dokunmaz', async () => {
    const { yazilanlar } = matrisSunucusu();
    ac();
    await screen.findByRole('table', { name: 'Bildirim olayları' });
    fireEvent.change(screen.getByLabelText('Olay ara'), { target: { value: 'makine' } });
    fireEvent.click(await screen.findByRole('checkbox', { name: 'İstasyonlar: Telefon, 1/1 açık' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]).toEqual({ yol: '/bildirimler/push/turler/istasyonlar.makine-durdu/degistir', govde: { acik: false } });
    expect(screen.queryByRole('checkbox', { name: /Stok: Telefon/ })).toBeNull();
  });

  it('panel tek Kaydet ile yalnız alıcıyı ve e-posta ayrıntısını kendi sürümüyle yazar', async () => {
    const { yazilanlar } = matrisSunucusu();
    ac();
    const panel = await ayrintiAc('Satın alma talebi onay bekliyor');
    expect(within(panel).queryByRole('switch')).toBeNull();
    const kaydet = within(panel).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    fireEvent.click(within(within(panel).getByRole('group', { name: 'Alıcı rolleri' })).getByRole('checkbox', { name: 'Bakım' }));
    fireEvent.change(within(panel).getByLabelText('E-posta şablonu'), { target: { value: '' } });
    fireEvent.click(kaydet);
    await waitFor(() => { expect(yazilanlar).toHaveLength(2); });
    expect(yazilanlar).toEqual([
      { yol: '/bildirimler/alicilar/satin-alma.talep-onay-bekliyor/degistir', govde: { rolIdleri: [1, 2], kisiIdleri: [7], surum: 3 } },
      {
        yol: '/bildirimler/eposta/tetikleyiciler/satin-alma.talep-onay-bekliyor/degistir',
        govde: { eposta: true, zaman: 'hemen', tekrarGun: null, tekrarEnCok: null, yukseltGun: null, yukseltRolIdleri: [], yukseltKisiIdleri: [], sablonId: null, surum: 4 },
      },
    ]);
    expect(await screen.findByText('Satın alma talebi onay bekliyor: kaydedildi.')).toBeTruthy();
  });

  it('e-posta kapalı olayın panelinde ayrıntı yerine tablodan açma notu çıkar', async () => {
    matrisSunucusu();
    ac();
    const panel = await ayrintiAc('Makine durdu');
    expect(within(panel).getByText(/e-posta kapalı; tablodaki E-posta anahtarıyla açılır/)).toBeTruthy();
    expect(within(panel).queryByLabelText('E-posta şablonu')).toBeNull();
  });

  it('e-posta tekrar ve üst kademe birlikte yazılır; eksik alan kaydı kapatır', async () => {
    const { yazilanlar } = matrisSunucusu();
    ac();
    const panel = await ayrintiAc('Satın alma talebi onay bekliyor');
    fireEvent.click(within(panel).getByLabelText('İş açık kaldıkça tekrarla'));
    fireEvent.change(within(panel).getByLabelText('Kaç günde bir'), { target: { value: '2' } });
    fireEvent.click(within(panel).getByLabelText('İş açık kalırsa üst kademeye de e-posta gönder'));
    const kaydet = within(panel).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    expect(within(panel).getByText('En az bir rol ya da kişi seçin.')).toBeTruthy();
    fireEvent.click(within(within(panel).getByRole('group', { name: 'Üst kademe rolleri' })).getByRole('checkbox', { name: 'Müdür' }));
    fireEvent.click(kaydet);
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]).toEqual({
      yol: '/bildirimler/eposta/tetikleyiciler/satin-alma.talep-onay-bekliyor/degistir',
      govde: { eposta: true, zaman: 'hemen', tekrarGun: 2, tekrarEnCok: 3, yukseltGun: 2, yukseltRolIdleri: [2], yukseltKisiIdleri: [], sablonId: 9, surum: 4 },
    });
  });

  it('yalnız e-posta yönetimi olan kişi e-posta sütununu görür; alıcı ve kademe uçlarını okumaz', async () => {
    const { okunanlar } = matrisSunucusu();
    ac(['bildirim.eposta-yonet']);
    const tablo = await screen.findByRole('table', { name: 'Bildirim olayları' });
    expect(within(tablo).queryByText('Alıcılar')).toBeNull();
    expect(within(tablo).getByRole('columnheader', { name: 'E-posta' })).toBeTruthy();
    expect(okunanlar).not.toContain('/bildirimler/alicilar');
    expect(okunanlar).not.toContain('/bildirim-kademe/kaynaklar');
    expect(screen.queryByRole('tab', { name: /Ekip çağrıları/ })).toBeNull();
  });

  it('günlük özet seçimi zaman olarak "ozet" yazar', async () => {
    const { yazilanlar } = matrisSunucusu();
    ac();
    const panel = await ayrintiAc('Satın alma talebi onay bekliyor');
    fireEvent.click(within(panel).getByLabelText('Hemen değil, günlük özette gönder'));
    fireEvent.click(within(panel).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]?.govde).toMatchObject({ eposta: true, zaman: 'ozet', surum: 4 });
  });

  it('anahtar yazımından sonra değişen kanalın sorgusu yeniden okunur', async () => {
    const { okunanlar } = matrisSunucusu();
    ac();
    await screen.findByRole('table', { name: 'Bildirim olayları' });
    const once = okunanlar.filter((y) => y === '/bildirimler/gosterim').length;
    fireEvent.click(anahtar('Makine durdu: Okudum onayı'));
    expect(await screen.findByText('Makine durdu: Okudum onayı açıldı.')).toBeTruthy();
    expect(okunanlar.filter((y) => y === '/bildirimler/gosterim').length).toBeGreaterThan(once);
  });

  it('Kim alır: kutucuk rolü anında ekler, kişiler ve sürüm korunur', async () => {
    const { yazilanlar } = matrisSunucusu();
    ac(HEPSI, '/bildirim-merkezi/yonetim?sekme=kim-alir');
    const tablo = await screen.findByRole('table', { name: 'Kim alır' });
    fireEvent.click(within(tablo).getByRole('checkbox', { name: 'Satın alma talebi onay bekliyor: Bakım' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]).toEqual({ yol: '/bildirimler/alicilar/satin-alma.talep-onay-bekliyor/degistir', govde: { rolIdleri: [1, 2], kisiIdleri: [7], surum: 3 } });
    expect(await screen.findByText('Satın alma talebi onay bekliyor: Bakım eklendi.')).toBeTruthy();
    expect(within(tablo).getByText('Malzeme bırakıldı').closest('tr')?.textContent).toMatch(/Kayda bağlı kişi \(varsayılan\)/);
    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(2); });
    expect(yazilanlar[1]).toEqual({ yol: '/bildirimler/alicilar/satin-alma.talep-onay-bekliyor/degistir', govde: { rolIdleri: [2], kisiIdleri: [7], surum: 4 } });
    expect(await screen.findByText('Geri alındı.')).toBeTruthy();
  });

  it('eski şablonlar adresi E-posta sekmesini açar; E-posta sekmesi yalnız e-posta yöneticisine görünür', async () => {
    matrisSunucusu();
    ac(HEPSI, '/bildirim-merkezi/yonetim?sekme=sablonlar');
    expect((await screen.findByRole('tab', { name: /E-posta/ })).getAttribute('aria-selected')).toBe('true');
    cleanup();
    ac(['ayarlar.yaz']);
    await screen.findByRole('table', { name: 'Bildirim olayları' });
    expect(screen.queryByRole('tab', { name: /E-posta/ })).toBeNull();
    expect(screen.getByRole('tab', { name: /Kim alır/ })).toBeTruthy();
  });

  it('kademe sekmesi adresle de yetkisiz kişiye açılmaz: Olaylar açılır, kademe ucu okunmaz', async () => {
    const { okunanlar } = matrisSunucusu();
    ac(['ayarlar.yaz'], '/bildirim-merkezi/yonetim?sekme=kademe');
    expect(await screen.findByRole('table', { name: 'Bildirim olayları' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Olaylar/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('tab', { name: /Kademeli uyarı/ })).toBeNull();
    expect(okunanlar).not.toContain('/bildirim-kademe/kaynaklar');
  });

  it('yalnız kademeli uyarı yöneten kişi boş Olaylar yerine Kademeli uyarı sekmesini açar', async () => {
    const { okunanlar } = matrisSunucusu();
    ac(['bildirim.kademe-yonet']);
    expect(await screen.findByRole('tab', { name: /Kademeli uyarı/ })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Olaylar/ })).toBeNull();
    expect(screen.getByRole('tab', { name: /Kademeli uyarı/ }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => { expect(okunanlar).toContain('/bildirim-kademe/kaynaklar'); });
    expect(okunanlar).not.toContain('/bildirimler/alicilar');
  });

  it('menü maddesi üç işlemden biriyle görünür: yalnız e-posta ya da yalnız kademe yöneten kişi de görür', () => {
    const madde = IKINCI_MENULER.flatMap((m) => m.gruplar.flatMap((g) => [...g.maddeler])).find((x) => x.yol === '/bildirim-merkezi/yonetim');
    if (!madde) throw new Error('madde yok');
    for (const islem of ['ayarlar.yaz', 'bildirim.eposta-yonet', 'bildirim.kademe-yonet']) expect(maddeGorunurMu(madde, [islem]), islem).toBe(true);
    expect(maddeGorunurMu(madde, ['sayfa.bildirim-merkezi'])).toBe(false);
  });
});
