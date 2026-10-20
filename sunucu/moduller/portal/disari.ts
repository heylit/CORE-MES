import type { Db } from '#cekirdek/db.ts';
import type { DepoBelgesi } from './kurallar.ts';
import { koleksiyonBelgeleri } from './sorgular.ts';

// Bağlamada (Aşama 2) başka modül bu modülün kayıtlarını yalnız buradan okur; yazma dışarı açılmaz.
// Kişiye özel alan (data/users/...) buradan verilmez.
export async function portalKoleksiyonu(db: Db, koleksiyon: string): Promise<DepoBelgesi[]> {
  if (koleksiyon.split('/')[0] === 'data') return [];
  return koleksiyonBelgeleri(db, koleksiyon);
}

// Logo satış işinin kaynağı (kart #941): logo modülünün SatisKaynagi arayüzüyle yapısal olarak aynıdır. Yetki denetlemez; çağıran Logo işidir.
export {
  logoyaGidecekSatisSiparisleri, logoyaGidecekSatisTeklifleri, satisSiparisiLogoSonucu, satisTeklifiLogoSonucu,
} from './servis.ts';
export type { PortalLogoSiparisi, PortalLogoSonucu, PortalLogoTeklifi } from './servis.ts';
