import type { Db } from '#cekirdek/db.ts';
import { disIzleyiciMi, portalKullaniciYolu } from './kurallar.ts';
import type { DepoBelgesi } from './kurallar.ts';
import { belgeGetir, koleksiyonBelgeleri } from './sorgular.ts';

// Bağlamada (Aşama 2) başka modül bu modülün kayıtlarını yalnız buradan okur; yazma dışarı açılmaz.
// Kişiye özel alan (data/users/...) buradan verilmez.
export async function portalKoleksiyonu(db: Db, koleksiyon: string): Promise<DepoBelgesi[]> {
  if (koleksiyon.split('/')[0] === 'data') return [];
  return koleksiyonBelgeleri(db, koleksiyon);
}

// Kişi portalda müşteri ya da tedarikçi firmasına atanmışsa (1021 b) dış izleyicidir (1224 a); oturum kimliği her istekte
// buradan işaretlenir, işaret kopyalanmaz. Portal uygulamada kapalıyken de okunur. Yetki denetlemez.
export async function disIzleyiciKisiMi(db: Db, kisiId: number): Promise<boolean> {
  return disIzleyiciMi((await belgeGetir(db, portalKullaniciYolu(kisiId)))?.veri ?? null);
}

// Logo satış işinin kaynağı (kart #941): logo modülünün SatisKaynagi arayüzüyle yapısal olarak aynıdır. Yetki denetlemez; çağıran Logo işidir.
export {
  logoyaGidecekSatisSiparisleri, logoyaGidecekSatisTeklifleri, satisSiparisiLogoSonucu, satisTeklifiLogoSonucu,
} from './servis.ts';
export type { PortalLogoSiparisi, PortalLogoSonucu, PortalLogoTeklifi } from './servis.ts';
