import { describe, expect, it, vi } from 'vitest';
import { ONAY_GERI_BETIGI } from './acilis.ts';
import { KITAPLIK_KIMLIKLERI, ONAY_GERI_YERLERI, sayfaKur } from './sayfa.ts';
import { KM_PAKETI } from './uygulama/paket.ts';

// Kullanıcı kararı 17.10.2026 ("Eklensin"): onaylı formda "Onayı geri al" düğmesi yalnız onay işlemi olana görünür; düğme sunucunun
// onay geri alma ucuna köprüden gider. Uygulamanın satır şablonu ve işlev metni kurulan sayfadan alınıp sahte nesnelerle koşturulur.
const kitapliklar = Object.fromEntries(KITAPLIK_KIMLIKLERI.map((k) => [k, ''])) as Parameters<typeof sayfaKur>[0]['kitapliklar'];
const kur = (onaylayabilir: boolean): string =>
  sayfaKur({ paket: KM_PAKETI, koken: 'http://localhost:4101', grafik: '', kitapliklar, kimlik: { kisi: { id: 7, ad: 'Deneme Kişi' }, yonetici: false, kisiler: [], onaylayabilir } });

const [satirYeri, baglamaYeri] = ONAY_GERI_YERLERI;
// Form listesinin işlem sütunundaki yeni parça: uygulamanın şablon ifadeleriyle aynı biçimde çalıştırılır.
function islemler(d: string, onaylayabilir: boolean): string {
  const sablon = satirYeri![1];
  return new Function('d', 'r', 'window', `return \`${sablon}\`;`)(d, { _id: 'frm_1' }, { __TMI_KM: { onaylayabilir } }) as string;
}

describe('Kalite Merkezi onay geri alma düğmesi', () => {
  it('düğme ve bağlaması pakette tek yere girer; sayfa ayarı onay işlemini taşır', () => {
    for (const [aranan] of ONAY_GERI_YERLERI) expect(KM_PAKETI.split(aranan).length).toBe(2);
    const sayfa = kur(true);
    expect(sayfa).toContain(satirYeri![1]);
    expect(sayfa).toContain(baglamaYeri![1]);
    expect(sayfa).toContain('"onaylayabilir":true');
    expect(sayfa.split('function tmiOnayGeriAl(').length).toBe(2);
    expect(kur(false)).toContain('"onaylayabilir":false');
  });

  it('düğme yalnız onaylı formda ve onay işlemi olana görünür', () => {
    expect(islemler('Onaylandı', true)).toContain('data-geri="frm_1">Onayı geri al</button>');
    expect(islemler('Onaylandı', false)).not.toContain('data-geri');
    for (const d of ['Taslak', 'Onay bekliyor']) expect(islemler(d, true)).not.toContain('data-geri');
  });

  function calistir(formlar: Record<string, unknown>[], onaylayabilir: boolean, cevap: { ok: boolean; json?: unknown }) {
    const pencere = { __TMI_KM: { onaylayabilir } };
    const pencereler: { baslik: string; kaydet: () => Promise<void> }[] = [];
    const fetch = vi.fn(async (_a: string, _s?: unknown) => ({ ok: cevap.ok, json: async () => cevap.json }));
    const toast = vi.fn();
    const closeModal = vi.fn();
    const dugme = { textContent: 'Kaydet' };
    const formModal = (baslik: string, _alanlar: unknown, _ilk: unknown, kaydet: () => Promise<void>) => {
      pencereler.push({ baslik, kaydet });
      return { querySelector: (s: string) => (s === '[data-save]' ? dugme : null) };
    };
    const geriAl = new Function('window', 'S', 'formModal', 'fetch', 'toast', 'closeModal', `${ONAY_GERI_BETIGI}; return tmiOnayGeriAl;`)(
      pencere, { frm: formlar }, formModal, fetch, toast, closeModal,
    ) as (id: string) => void;
    return { geriAl, pencereler, fetch, toast, closeModal, dugme };
  }

  it('onaylı formda pencere açılır; onaylanınca köprüye istek gider, pencere kapanır', async () => {
    const u = calistir([{ _id: 'frm:1', kod: 'F-1', durum: 'Onaylandı' }], true, { ok: true, json: { version: 9 } });
    u.geriAl('frm:1');
    expect(u.pencereler.map((p) => p.baslik)).toEqual(['F-1 onayını geri al']);
    expect(u.dugme.textContent).toBe('Onayı geri al');
    await u.pencereler[0]!.kaydet();
    expect(u.fetch).toHaveBeenCalledWith('api/onay-geri-al/frm/frm%3A1', { method: 'POST' });
    expect(u.closeModal).toHaveBeenCalledWith(true);
    expect(u.toast).toHaveBeenCalledWith('Onay geri alındı; form taslağa döndü');
  });

  it('sunucu reddederse ileti gösterilir, pencere açık kalır; onaylı olmayan formda ya da yetkisiz kişide pencere açılmaz', async () => {
    const red = calistir([{ _id: 'f', kod: 'F', durum: 'Onaylandı' }], true, { ok: false, json: { hata: 'Bu işlem için yetkiniz yok.' } });
    red.geriAl('f');
    await red.pencereler[0]!.kaydet();
    expect(red.toast).toHaveBeenCalledWith('Bu işlem için yetkiniz yok.', 'bad');
    expect(red.closeModal).not.toHaveBeenCalled();
    const taslak = calistir([{ _id: 'f', kod: 'F', durum: 'Taslak' }], true, { ok: true });
    taslak.geriAl('f');
    const yetkisiz = calistir([{ _id: 'f', kod: 'F', durum: 'Onaylandı' }], false, { ok: true });
    yetkisiz.geriAl('f');
    expect([taslak.pencereler.length, yetkisiz.pencereler.length]).toEqual([0, 0]);
  });
});
