import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { IKINCI_MENULER } from '#paylasilan/sayfalar.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { merkeziBagla } from './bagla.ts';
import { rotalar } from '../rotalar.tsx';
import { ayarEkranlari } from '../ayar-ekranlari.tsx';

const acilis: AcilisCevabi = {
  kullanici: { id: 7, ad: 'Deneme Alıcı' }, talepler: [], tedarikciler: [], firmaKartlari: [], katalog: [],
  ayarlar: {
    sirket: '', agirliklar: { maliyet: 60, termin: 20, tedarikci: 10, garanti: 10 }, gecerlilikGun: 15, enAzTeklif: 3, fiyatUyariYuzdesi: '10', kurTarihi: null,
    kurlar: [{ paraBirimi: 'TRY', kur: null, aylikFaizYuzdesi: '3' }], kategoriler: [], birimler: [], onayLimitleri: [], surum: 1,
  },
};
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('satın alma ayarları yalnız Sistem Ayarları\'nda', () => {
  it('ikinci menüde ve rotalarda ayar yok; ayar ekranı Sistem Ayarları\'na bildirilir', () => {
    const menu = IKINCI_MENULER.find((m) => m.kok === '/satin-alma')!;
    const yollar = menu.gruplar.flatMap((g) => g.maddeler.map((m) => m.yol as string));
    expect(yollar).toContain('/satin-alma/talepler');
    expect(yollar.some((y) => y.includes('ayar'))).toBe(false);
    expect(rotalar.some((r) => r.yol.includes('ayar'))).toBe(false);
    expect(ayarEkranlari.map((e) => [e.anahtar, e.islem])).toEqual([['satin-alma', 'satin-alma.ayar']]);
  });
});

describe('tedarikçi penceresinden yeni firma', () => {
  it('firma ortak listeye (finans) tedarikçi olarak açılır, seçilir; aynı pencerede yeniden gönderim aynı kimlikle gider', async () => {
    const istekler: { yol: string; govde: unknown; kimlik: string | null }[] = [];
    let ilkDenemeDusur = true;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      const yol = new URL(adres, 'http://x').pathname;
      const kimlik = new Headers(secenek?.headers).get(ISTEK_KIMLIGI_BASLIGI);
      const govde = secenek?.body ? JSON.parse(String(secenek.body)) as unknown : null;
      istekler.push({ yol, govde, kimlik });
      if (yol === '/api/satin-alma-acilis' || yol === '/satin-alma-acilis') return json(200, acilis);
      if (yol.endsWith('/satin-alma-firma-secenekleri')) return json(200, { firmalar: [] });
      if (yol.endsWith('/musteri-tedarikci/firmalar/ekle')) {
        if (ilkDenemeDusur) { ilkDenemeDusur = false; return json(422, { hata: { kod: 'GECERSIZ' }, mesaj: 'Deneme ret.' }); }
        return json(200, { firma: { id: 41, ad: 'Deneme Tedarik Yeni' } });
      }
      if (yol.endsWith('/satin-alma-tedarikcileri/kaydet')) {
        return json(200, { firmaId: 41, firmaAdi: 'Deneme Tedarik Yeni', durum: 'onayli', puan: 3, notlar: '', kategoriler: [], degerlendirmeler: [], surum: 1 });
      }
      return json(200, acilis);
    }));
    const kok = document.createElement('div');
    document.body.append(kok);
    const kapat = merkeziBagla(kok, { rol: 'buyer', sayfa: 'suppliers', yol: '/satin-alma/tedarikciler', git: () => {} });
    await vi.waitFor(() => expect(kok.querySelector('[data-act="new-supplier"]')).not.toBeNull());
    kok.querySelector<HTMLElement>('[data-act="new-supplier"]')!.click();

    const ara = kok.querySelector<HTMLInputElement>('#s-firma-ara')!;
    ara.value = 'Deneme Tedarik Yeni';
    ara.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => expect(kok.querySelector('[data-act="firma-yeni"]')).not.toBeNull(), { timeout: 2000 });
    kok.querySelector<HTMLElement>('[data-act="firma-yeni"]')!.click();
    expect(kok.querySelector<HTMLInputElement>('#s-yf-ad')!.value).toBe('Deneme Tedarik Yeni');
    kok.querySelector<HTMLInputElement>('#s-yf-vergi')!.value = '1234567890';

    const ac = () => kok.querySelector<HTMLButtonElement>('[data-act="firma-ac"]')!;
    ac().click();
    await vi.waitFor(() => expect(ac().disabled).toBe(false));
    ac().click();
    await vi.waitFor(() => expect(kok.querySelector('#s-firma-sonuc')!.textContent).toContain('açıldı ve seçildi'));

    const ekleme = istekler.filter((i) => i.yol.endsWith('/musteri-tedarikci/firmalar/ekle'));
    expect(ekleme).toHaveLength(2);
    expect(ekleme[0]!.govde).toMatchObject({ ad: 'Deneme Tedarik Yeni', tur: 'tedarikci', vergiNo: '1234567890' });
    expect(ekleme[0]!.kimlik).toMatch(/^[0-9a-f-]{36}$/);
    expect(ekleme[1]!.kimlik).toBe(ekleme[0]!.kimlik);

    kok.querySelector<HTMLElement>('[data-act="save-supplier"]')!.click();
    await vi.waitFor(() => expect(istekler.some((i) => i.yol.endsWith('/satin-alma-tedarikcileri/kaydet'))).toBe(true));
    expect(istekler.find((i) => i.yol.endsWith('/satin-alma-tedarikcileri/kaydet'))!.govde).toMatchObject({ firmaId: 41 });
    kapat();
  });
});
