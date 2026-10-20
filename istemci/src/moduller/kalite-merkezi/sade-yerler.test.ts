import { describe, expect, it, vi } from 'vitest';
import { KITAPLIK_KIMLIKLERI, SADE_YERLER, sayfaKur } from './sayfa.ts';
import { KM_PAKETI } from './uygulama/paket.ts';

// Kullanıcı kararı 17.10.2026 ("Üçü de"): onay penceresi onaylayan adını sormaz (sunucu oturumdaki kişiyi yazar), ayarlarda
// işlemeyen "Örnek verileri yükle" düğmesi görünmez. Uygulamanın onay işlevi kurulan sayfadan alınıp sahte nesnelerle koşturulur.
const kitapliklar = Object.fromEntries(KITAPLIK_KIMLIKLERI.map((k) => [k, ''])) as Parameters<typeof sayfaKur>[0]['kitapliklar'];
const sayfa = sayfaKur({ paket: KM_PAKETI, koken: 'http://localhost:4101', grafik: '', kitapliklar, kimlik: { kisi: { id: 7, ad: 'Deneme Kişi' }, yonetici: false, kisiler: [], onaylayabilir: true } });

function onayIslevi(): string {
  const bas = sayfa.indexOf('function approveRec(');
  const son = sayfa.indexOf('\nfunction ', bas + 1);
  if (bas < 0 || son < 0) throw new Error('Sayfadan ayıklanamadı: approveRec');
  return sayfa.slice(bas, son);
}

describe('Kalite Merkezi işlemeyen ekran parçaları', () => {
  it('yerler pakette birer kez geçer; kurulan sayfada kalmaz', () => {
    for (const [aranan] of SADE_YERLER) {
      expect(KM_PAKETI.split(aranan).length).toBe(2);
      expect(sayfa).not.toContain(aranan);
    }
    expect(sayfa).not.toContain('>Örnek verileri yükle</button>');
    expect(sayfa).toContain('data-bk="exp">Yedek indir</button>');
    expect(sayfa).toContain('data-bk="wipe">Tüm verileri sil</button>');
  });

  it('onay penceresi karar ve not sorar, onaylayanı sormaz; kayıt onaylayan adı taşımaz', async () => {
    const pencereler: { alanlar: { k: string }[]; kaydet: (d: Record<string, unknown>) => Promise<void> }[] = [];
    const kayitlar: [string, Record<string, unknown>][] = [];
    const formModal = (_b: string, alanlar: { k: string }[], _i: unknown, kaydet: (d: Record<string, unknown>) => Promise<void>) => {
      pencereler.push({ alanlar, kaydet });
      return { querySelector: () => ({ classList: { add: () => {} } }) };
    };
    const onayla = new Function('S', 'need', 'G', 'formModal', 'save', 'closeModal', 'toast', 'TODAY', `${onayIslevi()}; return approveRec;`)(
      { frm: [{ _id: 'f1', kod: 'F-1', durum: 'Onay bekliyor' }] }, () => true, () => ({ onaylayan: 'Eski Ad' }), formModal,
      async (c: string, r: Record<string, unknown>) => { kayitlar.push([c, r]); }, vi.fn(), vi.fn(), () => '2026-10-17',
    ) as (id: string) => void;
    onayla('f1');
    expect(pencereler[0]?.alanlar.map((a) => a.k)).toEqual(['karar', 'onayNot']);
    await pencereler[0]?.kaydet({ karar: 'Onayla', onayNot: 'Uygun' });
    const [koleksiyon, kayit] = kayitlar[0]!;
    expect(koleksiyon).toBe('frm');
    expect(kayit.durum).toBe('Onaylandı');
    expect(JSON.parse(JSON.stringify(kayit))).not.toHaveProperty('onaylayan');
  });
});
