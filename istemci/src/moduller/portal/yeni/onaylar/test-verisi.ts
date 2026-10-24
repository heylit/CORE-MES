import type { Kullanici } from '#paylasilan/kullanici.ts';
import { onay, ornekDepo } from '../ornek-veri.ts';
import { json } from '../test-ortak.tsx';
import type { Depo, Onay } from '../tipler.ts';

// Onaylar testlerinin sentetik verisi. Kişi ve firma adları uydurmadır.

const ISLEMLER: Kullanici['islemler'] = ['kisiler.rol-yonet', 'portal.oku', 'portal.yaz'];
// Satın alma müdürü (ornek-veri: tmi-5). ornek-veri'deki a1'in ilk adımı onundur; talep eden tmi-9.
export const SATINALMACI_KISI: Kullanici = { id: 5, ad: 'Deneme Satınalmacı', islemler: ISLEMLER };

export function onayDeposu(...ekler: Onay[]): Depo {
  const d = ornekDepo();
  return { ...d, approvals: { ...d.approvals, ...Object.fromEntries(ekler.map((a) => [a.id, a])) } };
}

export const onayBelgesi = (a: Onay) => {
  const { id, surum, ...veri } = a;
  return { yol: `approvals/${id}`, kimlik: id, veri, surum: surum + 1 };
};

// Karar ucu verilen onayın sonraki hâlini döner; belge yazımı kabul edilir.
export function kararCevabi(sonra: Onay, yazma: Response | null = null) {
  return (yontem: string, yol: string): Response | null => {
    if (yontem === 'POST' && yol === `/portal/onaylar/${sonra.id}/karar`) return json(200, { belge: onayBelgesi(sonra), damga: 2 });
    if (yontem === 'POST' && yol === '/portal/belge/yaz') return yazma ?? json(200, { belge: null, damga: 3 });
    return null;
  };
}

export { onay };
