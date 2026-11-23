import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type {
  BildirimAlicilariCevabi, BildirimGosterimleriCevabi, BildirimOlayAciklariCevabi, BildirimPushTurleriCevabi, CagriYonlendirmeCevabi,
  CagriYonlendirmeDegistirGovdesi,
} from '#paylasilan/sozlesme/bildirim.ts';
import type { KademeAyarlariCevabi, KademeAyarSatiri } from '#paylasilan/sozlesme/bildirim-kademe.ts';
import type { BildirimKurallariCevabi } from '#paylasilan/sozlesme/bildirim-kural.ts';
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

// 3478-1 a: olayın ana anahtarı ve kademe kaynağı satırı. Varsayılan sınama bütün olaylar açık; kapalı başlama ayrıca sınanır.
const olayCevabi = (acik: boolean): BildirimOlayAciklariCevabi => ({
  satirlar: GOSTERIM.satirlar.map((s) => ({ tur: s.tur, baslik: s.baslik, onem: s.onem, kaynakModul: s.kaynakModul, acik, surum: acik ? 1 : null })),
  oncekiHal: { alindi: '2026-11-20T08:00:00.000Z', donuldu: null },
});
const KAYNAK: KademeAyarSatiri = {
  kaynak: 'satin-alma.talep-onay', ad: 'Talep onayı', grup: 'Satın alma', sayac: 'bekleme', asama: 1, para: false, acik: false,
  k2Gun: null, k3Gun: 2, k3Birim: 'gun', k4Gun: 2, k5Gun: 5, epostaKademe: 3, serit: true, kapatilamaz: false, yoneticiRolId: null,
  varsayilan: true, surum: 0, degistiren: null, degisti: null, takipte: 3, gecikti: 1,
};

const KURALLAR: BildirimKurallariCevabi = {
  kurallar: [{
    id: 4, tur: 'istasyonlar.makine-durdu', ad: 'M-1 bakıma', acik: true, kosullar: [{ alan: 'makine', karsilastirma: '=', deger: 'M-1' }],
    rolIdleri: [1], kisiIdleri: [], ortada: false, eposta: true, telefon: false, sablonBaslik: '{makine} durdu', sablonMetin: null,
    surum: 1, degisti: '2026-11-20T09:00:00Z', gecersiz: null,
  }],
};

function matrisSunucusu(hataliYol?: string, secenek: { acik?: boolean; kademe?: boolean } = {}) {
  const yazilanlar: { yol: string; govde: unknown }[] = [];
  const okunanlar: string[] = [];
  const olaylar = olayCevabi(secenek.acik ?? true);
  const kademe: KademeAyarlariCevabi = { kaynaklar: secenek.kademe ? [structuredClone(KAYNAK)] : [], roller: [] };
  // Alıcı yazımı sunucudaki gibi satırı değiştirir ve sürümü artırır; Geri al yeniden okunan sürümü taşımalıdır.
  const alicilar: BildirimAlicilariCevabi = structuredClone(ALICILAR);
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { method?: string; body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    if (secenek.method === 'POST') {
      const govde = JSON.parse(secenek.body ?? '{}') as { rolIdleri?: number[]; kisiIdleri?: number[]; surum?: number | null };
      yazilanlar.push({ yol, govde });
      if (yol === hataliYol) return json(409, { kod: 'CAKISMA', mesaj: 'Kayıt başkası tarafından değiştirildi.' });
      const g = govde as { acik?: boolean; turler?: string[] };
      const olay = /^\/bildirimler\/olaylar\/([^/]+)\/degistir$/.exec(yol);
      const degisen = olay ? [olay[1]] : yol === '/bildirimler/olaylar/toplu' ? (g.turler ?? []) : yol === '/bildirimler/olaylar/onceki-hale-don' ? olaylar.satirlar.map((x) => x.tur) : null;
      if (degisen) {
        for (const x of olaylar.satirlar) if (degisen.includes(x.tur)) Object.assign(x, { acik: g.acik ?? true, surum: (x.surum ?? 0) + 1 });
        return json(200, olaylar);
      }
      const kaynak = /^\/bildirim-kademe\/kaynaklar\/([^/]+)\/ayarla$/.exec(yol);
      if (kaynak) {
        for (const x of kademe.kaynaklar) if (x.kaynak === kaynak[1]) Object.assign(x, { acik: g.acik ?? false, surum: x.surum + 1 });
        return json(200, kademe);
      }
      if (yol === '/bildirimler/kurallar/on-izleme') return json(200, { gun: 7, olay: 3, uyan: 1, kisi: 1, yetkisiz: 0 });
      if (yol === '/bildirimler/kurallar/ekle') return json(200, KURALLAR);
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
    if (yol === '/bildirim-kademe/kaynaklar') return json(200, kademe);
    if (yol === '/bildirimler/olaylar') return json(200, olaylar);
    if (yol === '/bildirimler/kurallar') return json(200, KURALLAR);
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
    expect(within(satin).getByText('E-posta hemen · ORN Acil talep')).toBeTruthy();
    expect(within(satin).getByText('Müdür, 1 kişi')).toBeTruthy();
    expect(anahtar('Satın alma talebi onay bekliyor: E-posta').getAttribute('aria-checked')).toBe('true');
    expect(anahtar('Makine durdu: Ekran ortası').getAttribute('aria-checked')).toBe('true');
    expect(anahtar('Makine durdu: Telefon').getAttribute('aria-checked')).toBe('true');
    expect(anahtar('Malzeme bırakıldı: Telefon').getAttribute('aria-checked')).toBe('false');
    const makine = within(tablo).getByText('Makine durdu').closest('tr');
    expect(makine?.textContent).toMatch(/Yetkisi olanlar .*\(varsayılan\)/);
    expect(within(tablo).getByText('Malzeme bırakıldı').closest('tr')?.textContent).toMatch(/Kayda bağlı kişi/);
    expect(within(tablo).queryByText('Zil')).toBeNull();
    expect(screen.queryByRole('tab', { name: /Kademeli uyarı/ })).toBeNull();
    expect(anahtar('Makine durdu: Açık').getAttribute('aria-checked')).toBe('true');
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
    const kaydet = within(panel).getByRole('button', { name: 'Kaydet' });
    expect(kaydet.getAttribute('aria-disabled')).toBe('true');
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
    const kaydet = within(panel).getByRole('button', { name: 'Kaydet' });
    expect(kaydet.getAttribute('aria-disabled')).toBe('true');
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
    expect(within(tablo).getByRole('columnheader', { name: 'Nasıl' })).toBeTruthy();
    expect(anahtar('Satın alma talebi onay bekliyor: E-posta').getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('switch', { name: 'Makine durdu: Telefon' })).toBeNull();
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
    expect(await screen.findByText('Bakım eklendi.')).toBeTruthy();
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

  it('eski kademe sekmesi adresi Olaylar\'ı açar; kademe yetkisi olmayan kademe ucunu okumaz', async () => {
    const { okunanlar } = matrisSunucusu();
    ac(['ayarlar.yaz'], '/bildirim-merkezi/yonetim?sekme=kademe');
    expect(await screen.findByRole('table', { name: 'Bildirim olayları' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Olaylar/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('tab', { name: /Kademeli uyarı/ })).toBeNull();
    expect(okunanlar).not.toContain('/bildirim-kademe/kaynaklar');
  });

  it('yalnız kademeli uyarı yöneten kişi Olaylar\'da kaynağı tek satırda, merdiveniyle görür; olay uçlarını okumaz', async () => {
    const { okunanlar } = matrisSunucusu(undefined, { kademe: true });
    ac(['bildirim.kademe-yonet']);
    const tablo = await screen.findByRole('table', { name: 'Bildirim olayları' });
    const satir = within(tablo).getByText('Talep onayı').closest('tr');
    expect(satir?.textContent).toMatch(/3 takipte · 1 gecikti/);
    expect(satir?.textContent).toMatch(/2g bekleyince ·\s*\+\d+g yönetici/);
    expect(within(tablo).getByRole('img', { name: /^Talep onayı merdiveni \(kapalı\): K1 Atandı: İş açılınca; K3 Gecikti: 2 iş günü bekleyince; K4/ })).toBeTruthy();
    expect(okunanlar).not.toContain('/bildirimler/alicilar');
    expect(okunanlar).not.toContain('/bildirimler/olaylar');
    fireEvent.click(screen.getByRole('button', { name: 'Talep onayı: ayrıntı' }));
    const panel = await screen.findByRole('dialog', { name: 'Talep onayı' });
    expect(within(panel).getByRole('list', { name: 'Merdiven' })).toBeTruthy();
    expect(within(panel).getByRole('switch', { name: 'Talep onayı: Açık' }).getAttribute('aria-checked')).toBe('false');
  });

  it('3478: kapalı olay tek anahtarla sürümüyle açılır; modülün toplu açması önce sorar', async () => {
    const { yazilanlar } = matrisSunucusu(undefined, { acik: false });
    ac();
    await screen.findByRole('table', { name: 'Bildirim olayları' });
    expect(screen.getByRole('note').textContent).toMatch(/Gelenler'de kalır/);
    const kanal = () => screen.getAllByRole('switch', { name: /^Makine durdu: / }).find((d) => d.getAttribute('aria-label') !== 'Makine durdu: Açık' && d.getAttribute('aria-checked') === 'true');
    expect(kanal()?.className).toContain('tc-kanal-soluk');
    expect(kanal()?.getAttribute('title')).toMatch(/Olay kapalı; açınca bu kanal kullanılır/);
    fireEvent.click(anahtar('Makine durdu: Açık'));
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]).toEqual({ yol: '/bildirimler/olaylar/istasyonlar.makine-durdu/degistir', govde: { acik: true, surum: null } });
    await waitFor(() => { expect(anahtar('Makine durdu: Açık').getAttribute('aria-checked')).toBe('true'); });
    expect(kanal()?.className).not.toContain('tc-kanal-soluk');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Stok: Açık, 0/1 açık' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(2); });
    expect(yazilanlar[1]).toEqual({ yol: '/bildirimler/olaylar/stok.birakildi/degistir', govde: { acik: true, surum: null } });
  });

  it('3478: kademe kaynağını açmak, bekleyen işlerin ilk turda çalacağını söyleyip sorar', async () => {
    const { yazilanlar } = matrisSunucusu(undefined, { acik: false, kademe: true });
    ac();
    await screen.findByRole('table', { name: 'Bildirim olayları' });
    fireEvent.click(anahtar('Talep onayı: Açık'));
    const pencere = await screen.findByRole('dialog', { name: 'Talep onayı: açılsın mı?' });
    expect(pencere.textContent).toMatch(/ilk turda/);
    expect(yazilanlar).toHaveLength(0);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Aç' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]?.yol).toBe('/bildirim-kademe/kaynaklar/satin-alma.talep-onay/ayarla');
    expect(yazilanlar[0]?.govde).toMatchObject({ acik: true, k3Gun: 2, k4Gun: 2, k5Gun: 5, surum: 0 });
  });

  it('3478: Önceki hale dön onaydan sonra yazılır ve bütün olaylar açık görünür', async () => {
    const { yazilanlar } = matrisSunucusu(undefined, { acik: false });
    ac();
    await screen.findByRole('table', { name: 'Bildirim olayları' });
    fireEvent.click(screen.getByRole('button', { name: 'Önceki hale dön' }));
    const pencere = await screen.findByRole('dialog', { name: 'Önceki hale dönülsün mü?' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Önceki hale dön' }));
    await waitFor(() => { expect(yazilanlar).toEqual([{ yol: '/bildirimler/olaylar/onceki-hale-don', govde: {} }]); });
    await waitFor(() => { expect(anahtar('Malzeme bırakıldı: Açık').getAttribute('aria-checked')).toBe('true'); });
  });

  it('menü maddesi üç işlemden biriyle görünür: yalnız e-posta ya da yalnız kademe yöneten kişi de görür', () => {
    const madde = IKINCI_MENULER.flatMap((m) => m.gruplar.flatMap((g) => [...g.maddeler])).find((x) => x.yol === '/bildirim-merkezi/yonetim');
    if (!madde) throw new Error('madde yok');
    for (const islem of ['ayarlar.yaz', 'bildirim.eposta-yonet', 'bildirim.kademe-yonet']) expect(maddeGorunurMu(madde, [islem]), islem).toBe(true);
    expect(maddeGorunurMu(madde, ['sayfa.bildirim-merkezi'])).toBe(false);
  });
});

describe('3478-3 olay kuralları', () => {
  it('kurallı olayın satırında kural sayısı, panelde kural özeti görünür', async () => {
    matrisSunucusu();
    ac();
    const tablo = await screen.findByRole('table', { name: 'Bildirim olayları' });
    expect(within(tablo).getByText('Makine durdu').closest('tr')?.textContent).toMatch(/1 kural/);
    expect(within(tablo).getByText('1 kural').closest('[title]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Makine durdu: ayrıntı' }));
    const liste = await screen.findByRole('list', { name: 'Kurallar' });
    expect(within(liste).getByText('M-1 bakıma')).toBeTruthy();
    expect(within(liste).getByText('Makine kodu eşit M-1')).toBeTruthy();
    expect(within(liste).getByRole('switch', { name: 'M-1 bakıma: Açık' }).getAttribute('aria-checked')).toBe('true');
  });

  it('olay kapalıyken kural rozeti soluk ve nedenini söyler', async () => {
    matrisSunucusu(undefined, { acik: false });
    ac();
    const tablo = await screen.findByRole('table', { name: 'Bildirim olayları' });
    expect(within(tablo).getByText('1 kural').closest('[title]')?.getAttribute('title')).toBe('Olay kapalı; kural çalışmaz.');
  });

  it('kural ön izlenmeden kaydedilmez; form değişince ön izleme yenilenmeli', async () => {
    const { yazilanlar } = matrisSunucusu();
    ac();
    await screen.findByRole('table', { name: 'Bildirim olayları' });
    fireEvent.click(screen.getByRole('button', { name: 'Makine durdu: ayrıntı' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Kural ekle' }));
    expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Kuraldan vazgeç' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Kural adı'), { target: { value: 'M-2 durunca' } });
    fireEvent.click(screen.getByRole('button', { name: 'Koşul ekle' }));
    fireEvent.change(screen.getByLabelText('Koşul 1: değer'), { target: { value: 'M-2' } });
    fireEvent.change(screen.getByLabelText('Kurala kişi ekle'), { target: { value: '7' } });
    const kaydet = screen.getByRole('button', { name: 'Kuralı kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ön izle' }));
    expect(await screen.findByText(/Son 7 günde bu olay 3 kez oldu; 1 tanesi koşula uydu/)).toBeTruthy();
    expect(kaydet.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Koşul 1: değer'), { target: { value: 'M-3' } });
    expect(kaydet.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ön izle' }));
    await waitFor(() => { expect(kaydet.disabled).toBe(false); });
    fireEvent.click(kaydet);
    await waitFor(() => { expect(yazilanlar.some((y) => y.yol === '/bildirimler/kurallar/ekle')).toBe(true); });
    expect(yazilanlar.find((y) => y.yol === '/bildirimler/kurallar/ekle')?.govde).toEqual({
      tur: 'istasyonlar.makine-durdu', ad: 'M-2 durunca', acik: true, kosullar: [{ alan: 'makine', karsilastirma: '=', deger: 'M-3' }],
      rolIdleri: [], kisiIdleri: [7], ortada: false, eposta: false, telefon: false, sablonBaslik: '{olay}', sablonMetin: null,
    });
  });
});

describe('bildirim alıcı seçimi (3594)', () => {
  it('Alıcılar hücresi paneli açar, odak ilk role gelir; olay altında ne zaman gittiği yazar', async () => {
    matrisSunucusu();
    ac();
    const tablo = await screen.findByRole('table', { name: 'Bildirim olayları' });
    expect(within(tablo).getByText('Satın alma talebi onaya gönderilince')).toBeTruthy();
    fireEvent.click(within(tablo).getByRole('button', { name: /^Satın alma talebi onay bekliyor: alıcıları değiştir/ }));
    const panel = await screen.findByRole('dialog', { name: 'Satın alma talebi onay bekliyor' });
    await waitFor(() => { expect(document.activeElement).toBe(within(panel).getByRole('checkbox', { name: 'Bakım' })); });
    expect(within(panel).getByText(/Olayı başlatan kişi/)).toBeTruthy();
    expect(within(panel).getByText(/Yalnız seçilenler alır\. Hiç seçim yoksa/)).toBeTruthy();
    expect(within(panel).getByText('Değişiklik yok')).toBeTruthy();
  });

  it('varsayılan alıcılı olayda ilk seçim uyarır, kimin alacağını yazar; Varsayılana dön seçimi temizler', async () => {
    const { yazilanlar } = matrisSunucusu();
    ac();
    fireEvent.click(await screen.findByRole('button', { name: /^Makine durdu: alıcıları değiştir/ }));
    const panel = await screen.findByRole('dialog', { name: 'Makine durdu' });
    expect(within(panel).getByRole('status').textContent).toBe('');
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Müdür' }));
    expect(within(panel).getByRole('status').textContent).toMatch(/yetkisi olanlara bu bildirim artık gitmez/);
    expect(within(panel).getByText(/Müdür rolündekiler\. Bunların dışında kalan/)).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Varsayılana dön' }));
    expect((within(panel).getByRole('checkbox', { name: 'Müdür' }) as HTMLInputElement).checked).toBe(false);
    expect(within(panel).getByRole('status').textContent).toBe('');
    expect(yazilanlar).toHaveLength(0);
  });

  it('kişi arayarak eklenir; kaydedilmemiş seçimle Esc önce sorar, Kaydetmeden kapat yazmaz', async () => {
    const { yazilanlar } = matrisSunucusu();
    ac();
    const panel = await ayrintiAc('Satın alma talebi onay bekliyor');
    fireEvent.click(within(panel).getByRole('button', { name: 'Kişi ekle' }));
    const ara = await screen.findByRole('combobox', { name: 'Kişi ekle ara' });
    fireEvent.change(ara, { target: { value: 'plan' } });
    fireEvent.keyDown(ara, { key: 'Enter' });
    expect(within(panel).getByRole('button', { name: 'Deneme Planlama çıkar' })).toBeTruthy();
    fireEvent.keyDown(panel, { key: 'Escape' });
    const sor = await screen.findByRole('dialog', { name: 'Kaydedilmemiş değişiklik var' });
    fireEvent.click(within(sor).getByRole('button', { name: 'Kaydetmeden kapat' }));
    await waitFor(() => { expect(screen.queryByRole('dialog', { name: 'Satın alma talebi onay bekliyor' })).toBeNull(); });
    expect(yazilanlar).toHaveLength(0);
  });

  it('kayıt hatasında panel açık kalır ve nedeni panelde yazar', async () => {
    matrisSunucusu('/bildirimler/alicilar/satin-alma.talep-onay-bekliyor/degistir');
    ac();
    const panel = await ayrintiAc('Satın alma talebi onay bekliyor');
    fireEvent.click(within(within(panel).getByRole('group', { name: 'Alıcı rolleri' })).getByRole('checkbox', { name: 'Bakım' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Kaydet' }));
    expect((await within(panel).findByRole('alert')).textContent).toMatch(/Alıcılar kaydedilemedi/);
    expect(screen.getByRole('dialog', { name: 'Satın alma talebi onay bekliyor' })).toBeTruthy();
  });

  it('Kim alır: kişi anında eklenir ve çıkarılır, satırdaki Geri al eski kişileri yazar', async () => {
    const { yazilanlar } = matrisSunucusu();
    ac(HEPSI, '/bildirim-merkezi/yonetim?sekme=kim-alir');
    const tablo = await screen.findByRole('table', { name: 'Kim alır' });
    fireEvent.click(within(tablo).getByRole('button', { name: 'Satın alma talebi onay bekliyor: kişi ekle' }));
    const ara = await screen.findByRole('combobox', { name: 'Satın alma talebi onay bekliyor: kişi ekle ara' });
    fireEvent.change(ara, { target: { value: 'plan' } });
    fireEvent.keyDown(ara, { key: 'Enter' });
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]).toEqual({ yol: '/bildirimler/alicilar/satin-alma.talep-onay-bekliyor/degistir', govde: { rolIdleri: [2], kisiIdleri: [7, 8], surum: 3 } });
    expect(await within(tablo).findByText('Deneme Planlama eklendi.')).toBeTruthy();
    fireEvent.click(within(tablo).getByRole('button', { name: 'Geri al' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(2); });
    expect(yazilanlar[1]).toEqual({ yol: '/bildirimler/alicilar/satin-alma.talep-onay-bekliyor/degistir', govde: { rolIdleri: [2], kisiIdleri: [7], surum: 4 } });
    const cip = await within(tablo).findByRole('button', { name: 'Satın alma talebi onay bekliyor: Deneme Kalite çıkar' });
    cip.focus();
    fireEvent.click(cip);
    await waitFor(() => { expect(yazilanlar).toHaveLength(3); });
    expect(yazilanlar[2]).toEqual({ yol: '/bildirimler/alicilar/satin-alma.talep-onay-bekliyor/degistir', govde: { rolIdleri: [2], kisiIdleri: [], surum: 5 } });
  });

  it('Kim alır: varsayılan alıcılı satırda ilk seçim, varsayılanın artık almadığını satırda söyler; odak kutuda kalır', async () => {
    const { yazilanlar } = matrisSunucusu();
    ac(HEPSI, '/bildirim-merkezi/yonetim?sekme=kim-alir');
    const tablo = await screen.findByRole('table', { name: 'Kim alır' });
    const kutu = within(tablo).getByRole('checkbox', { name: 'Makine durdu: Müdür' });
    kutu.focus();
    fireEvent.click(kutu);
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(await within(tablo).findByText(/Müdür eklendi\. .* yetkisi olanlar bu bildirimi artık almaz\./)).toBeTruthy();
    expect(document.activeElement).toBe(within(tablo).getByRole('checkbox', { name: 'Makine durdu: Müdür' }));
  });
});
