import { describe, expect, it, vi } from 'vitest';
import type { ArkonKisi } from '#paylasilan/sozlesme/arkon.ts';
import { eskiGorunumAdresiMi } from '../../ortak/rota/yeni-ekran-menusu.ts';
import { ESKI_GORUNUM_SALT_OKUR, SANAL_SUNUCU, bagla, type Istemci } from './baglanti.ts';
import { ESKI_ARKON_KOKU, URETIM_TERMINALI_ESKI_YOLU } from './ArkonCercevesi.tsx';
import { KUYRUK_ESKI_YOLU } from './rotalar.tsx';

// 4a (kart 723): Arkon'un eski görünümleri yönetici için yalnız okunur; kayıt yeni ekranda yapılır.

const KISI: ArkonKisi = { kimlik: '7', ad: 'Deneme Kişi', rol: 'admin', isMerkezleri: ['TAL'], istasyon: 'TZG-04', aktif: true };
const YAZMALAR: [string, string][] = [
  ['PUT', '/doc/pkgs/tmi-ie-1'], ['DELETE', '/doc/pkgs/tmi-ie-1'], ['POST', '/log/counts'], ['POST', '/log/events'], ['POST', '/bus'],
  ['PUT', '/blob/b1'], ['POST', '/plan-sira'], ['POST', '/kuyruk-sira'], ['POST', '/kuyruk-sira/plana-don'], ['POST', '/uretim-hazirligi'],
];

function kur(saltOkunur: boolean) {
  const cagrilar: string[] = [];
  const istemci = {
    get: async <T,>(yol: string) => { cagrilar.push(`GET ${yol}`); return (yol === '/arkon/ben' ? { kisi: KISI } : {}) as T; },
    post: async <T,>(yol: string) => { cagrilar.push(`POST ${yol}`); return { eklenen: 1 } as T; },
  } as Istemci;
  const pencere = {
    document: window.document, localStorage: window.localStorage, fetch: vi.fn(), EventSource: class {},
    location: { origin: window.location.origin, href: `${window.location.origin}/arkon/#hazirlik`, hash: '#hazirlik' },
  } as unknown as Window & typeof globalThis;
  pencere.Response = window.Response;
  const bildirimler: string[] = [];
  bagla(pencere, { istemci, saltOkunur, reddedildi: (ileti) => bildirimler.push(ileti) });
  return { pencere, cagrilar, bildirimler };
}
const adres = (yol: string) => `${window.location.origin}${SANAL_SUNUCU}/api${yol}?c=x`;

describe('Arkon eski görünüm salt okunur (723)', () => {
  it('eski görünümde okuma TMI\'ye gider, her yazma 403 ile durur, TMI\'ye istek gitmez ve kullanıcıya bir kez söylenir', async () => {
    const { pencere, cagrilar, bildirimler } = kur(true);
    for (const [yontem, yol] of YAZMALAR) {
      const c = await pencere.fetch(adres(yol), { method: yontem, body: '{}' });
      expect(c.status, `${yontem} ${yol}`).toBe(403);
      expect(await c.json()).toEqual({ error: ESKI_GORUNUM_SALT_OKUR });
    }
    expect(cagrilar).toEqual([]);
    expect(bildirimler).toEqual([ESKI_GORUNUM_SALT_OKUR]);
    expect((await pencere.fetch(adres('/me'))).status).toBe(200);
    expect(cagrilar).toEqual(['GET /arkon/ben']);
  });

  it('yeni görünümün ve Sistem Ayarları\'nın çerçevesinde yazma TMI\'ye iletilir', async () => {
    const { pencere, cagrilar, bildirimler } = kur(false);
    const c = await pencere.fetch(adres('/log/counts'), { method: 'POST', body: JSON.stringify([{ cid: 'a' }]) });
    expect(c.status).toBe(200);
    expect(cagrilar).toEqual(['POST /arkon/kayitlar/counts/ekle']);
    expect(bildirimler).toEqual([]);
  });

  it('salt okunurluk eski görünüm köklerindedir; yeni adresler ve kök yok (Sistem Ayarları) yazar', () => {
    for (const kok of [KUYRUK_ESKI_YOLU, URETIM_TERMINALI_ESKI_YOLU, ESKI_ARKON_KOKU]) expect(eskiGorunumAdresiMi(kok), kok).toBe(true);
    for (const kok of ['/kuyruk', '/uretim-terminali', '/arkon']) expect(eskiGorunumAdresiMi(kok), kok).toBe(false);
  });
});
