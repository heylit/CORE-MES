import { describe, expect, it, vi } from 'vitest';
import { tesisDuzenleyicisi, tesisListesi } from '../../../../arkon/web/src/data/tmi-listeleri.ts';
import { tmiyeGit } from '../../../../arkon/web/src/data/yeni-paket.ts';
import { TMI_HEDEFLERI, bagla } from './baglanti.ts';

// Tesisin sahibi TMI İstasyonlar'dır: sunucuya bağlı Arkon tesis düzenleyicisi açmaz, kişiyi TMI'nin İstasyonlar sayfasına yollar.
describe('Arkon tesis yönü', () => {
  it('düzenleyici yalnız yerel kipte ve tesis yetkisiyle açılır; sunucuda yönetici de düzenleyemez', () => {
    expect(tesisDuzenleyicisi(false, true)).toBe(true);
    expect(tesisDuzenleyicisi(true, true)).toBe(false);
    expect(tesisDuzenleyicisi(false, false)).toBe(false);
  });

  it('sunucuda salt okunur liste hazırlığa da tesis yetkilisine de açılır, ikisi de değilse ve yerel kipte açılmaz', () => {
    expect(tesisListesi(true, true, false)).toBe(true);
    expect(tesisListesi(true, false, true)).toBe(true);
    expect(tesisListesi(true, false, false)).toBe(false);
    expect(tesisListesi(false, true, true)).toBe(false);
  });

  it('istasyonlar hedefi köprüyle TMI İstasyonlar sayfasını açar; köprü yoksa false', () => {
    const git = vi.fn();
    const pencere = {
      document: window.document, localStorage: window.localStorage, fetch: vi.fn(), EventSource: class {},
      location: { origin: window.location.origin, href: `${window.location.origin}/arkon/#ayarlar`, hash: '#ayarlar' },
    } as unknown as Window & typeof globalThis;
    bagla(pencere, { git });
    expect(tmiyeGit('istasyonlar', pencere)).toBe(true);
    expect(git.mock.calls).toEqual([['/istasyonlar']]);
    expect(TMI_HEDEFLERI.istasyonlar).toBe('/istasyonlar');
    expect(tmiyeGit('istasyonlar', {} as Window)).toBe(false);
  });
});
