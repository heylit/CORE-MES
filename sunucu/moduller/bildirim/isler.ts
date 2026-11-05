import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { zamaniGelenleriDagit } from './yayin.ts';

// İleri tarihli elle bildirim (2147): zamanı gelen yayın dakikada bir alıcılara yazılır; geri çekilen ya da bitişi geçen gitmez.
export const isler = [
  isTanimi({ ad: 'bildirim-yayin-dagit', aralikMs: 60_000, calis: async (db) => { await zamaniGelenleriDagit(db); } }),
];
