import type { Db } from '#cekirdek/db.ts';
import type { DepoBelgesi } from './kurallar.ts';
import { koleksiyonBelgeleri } from './sorgular.ts';

// Bağlamada (Aşama 2) başka modül bu modülün kayıtlarını yalnız buradan okur; yazma dışarı açılmaz.
// Kişiye özel alan (data/users/...) buradan verilmez.
export async function mesajKoleksiyonu(db: Db, koleksiyon: string): Promise<DepoBelgesi[]> {
  if (koleksiyon.split('/')[0] === 'data') return [];
  return koleksiyonBelgeleri(db, koleksiyon);
}
