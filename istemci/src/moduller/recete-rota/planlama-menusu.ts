import type { IkinciMenuTanimi } from '#paylasilan/sayfa-tanimi.ts';

// Planlama plan modülünün sayfasıdır (658 b); eski planlama çerçevesi (cerceve/planlama-modulu.html) bir süre /plan/eski altında yalnız
// yöneticide açılır (659 a). Çerçeve dosyası ve köprüsü burada kalır, plan modülü onu disari.ts'ten alır.
// Anahtar planlama görünümünün kimliğidir; plan, studio ve kanban eski bağlantılar için kalır (plan ve kanban planlama motoruna,
// studio planlama atölyesine açılır).
export const PLANLAMA_ANAHTARLARI: readonly string[] = [
  'plan', 'studio', 'kanban', 'ysiparis', 'maliyet', 'giderler', 'mesaiplan', 'fasonplan', 'malzplan', 'terminler', 'denge', 'yillik', 'ufuk', 'sevkiyat',
];

// Planlama sayfalarını görme işlemi; yönetici, müdür ve planlamadadır (195 a, 663 a). Planlama çerçevesinin açılışı bunu ister.
export const PLANLAMA_ISLEMI = 'plan.planlama-oku';

// Maliyet ve kâr gösteren planlama sayfaları birim maliyet okumasını da ister: planlama rolü maliyet görmez (200 a), 195 a bunu korur.
export const MALIYET_ISLEMI = 'finans.maliyet-oku';
export const MALIYET_ANAHTARLARI: readonly string[] = ['maliyet', 'giderler', 'denge'];

// Eski planlama çerçevesinin kökü; görünüm adresi `/plan/eski/<anahtar>`, kök planlama motorudur.
export const PLANLAMA_ESKI_KOK = '/plan/eski';
const ESKI_PLANLAMA_YOLU = /^\/plan\/eski(?:\/([a-z][a-z0-9-]*))?(?:\/|$)/;

// Yol eski planlama çerçevesinin mi: /plan/eski ya da /plan/eski/<anahtar> (altıyla).
export function planlamaYoluMu(yol: string): boolean {
  const m = ESKI_PLANLAMA_YOLU.exec(yol);
  return m !== null && (m[1] === undefined || PLANLAMA_ANAHTARLARI.includes(m[1]));
}

export function maliyetYoluMu(yol: string): boolean {
  const m = ESKI_PLANLAMA_YOLU.exec(yol);
  return m !== null && MALIYET_ANAHTARLARI.includes(m[1] ?? '');
}

// Planlama menüsünün adresi -> eski çerçevedeki adresi: `/plan` -> `/plan/eski`, `/plan/studio` -> `/plan/eski/studio`.
export const planlamaEskiAdresi = (yol: string): `/${string}` => `${PLANLAMA_ESKI_KOK}${yol.slice('/plan'.length)}`;

// İkinci menü önerisi (Aşama 1): menü paylasilan/sayfalar/recete-rota.ts'dedir (çekirdek şeridi); test ikisinin aynı olduğunu denetler.
export const ONERILEN_IKINCI_MENU = {
  kok: '/recete-rota',
  baslik: 'Reçete ve Rota',
  simge: 'tool',
  cerceveli: true,
  gruplar: [
    { baslik: 'Reçete ve Rota', maddeler: [
      { anahtar: 'orders', baslik: 'Üretim emirleri', yol: '/recete-rota', simge: 'list', islem: 'sayfa.recete-rota' },
      { anahtar: 'stock', baslik: 'Stok', yol: '/recete-rota/stock', simge: 'box', islem: 'sayfa.recete-rota' },
      { anahtar: 'schema', baslik: 'Ürün ve rotalar', yol: '/recete-rota/schema', simge: 'layers', islem: 'sayfa.recete-rota' },
      { anahtar: 'ops', baslik: 'Operasyonlar', yol: '/recete-rota/ops', simge: 'edit', islem: 'sayfa.recete-rota' },
      { anahtar: 'sureler', baslik: 'Süreler', yol: '/recete-rota/sureler', simge: 'clock', islem: 'sayfa.recete-rota' },
      { anahtar: 'items', baslik: 'Malzemeler', yol: '/recete-rota/items', simge: 'cube', islem: 'sayfa.recete-rota' },
      { anahtar: 'res', baslik: 'Kaynaklar', yol: '/recete-rota/res', simge: 'cpu', islem: 'sayfa.recete-rota' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
