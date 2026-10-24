// Prototip çekirdeğinin DOM bağları için boş nesne: her özellik, çağrı ve atama sessizce kendine döner; yinelemede boştur.
// Çekirdek yeni ekranda arayüz çizmez, bu yüzden bu bağların hiçbiri görünür bir iş yapmaz.
const hedef = function kukla() { /* boş */ };
export const kukla: unknown = new Proxy(hedef, {
  get: (_h, ad) => {
    if (ad === Symbol.iterator) return function* bos() { /* boş */ };
    if (ad === Symbol.toPrimitive || ad === 'toString' || ad === 'valueOf') return () => '';
    if (ad === 'length') return 0;
    if (ad === 'then') return undefined;
    return kukla;
  },
  apply: () => kukla,
  construct: () => kukla as object,
  set: () => true,
  has: () => false,
});

// Çekirdeğin yerel deposu bellektedir: ortak tarayıcı deposuna yazmaz, eski anahtarları okumaz.
export function bellekDepo(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
