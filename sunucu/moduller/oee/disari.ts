import type { Db } from '#cekirdek/db.ts';
import { dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { oeeSorgusu } from '#paylasilan/sozlesme/oee.ts';
import type { OeeCevabi, OeeSorgusu } from '#paylasilan/sozlesme/oee.ts';
import { oee } from './servis.ts';

export type IstasyonOeesi = OeeCevabi['istasyonlar'][number];

// Uç dışından çağrılır (saat): `GET /oee` ucunun verdiği oee.oku denetimi ve sorgu sınırları burada yapılır; iş merkezi kapsamı
// ve maliyet gizleme oee() içindedir.
export async function istasyonOeeleri(db: Db, kullanici: Kullanici, sorgu: OeeSorgusu, simdi = Date.now()): Promise<IstasyonOeesi[]> {
  if (!kullanici.islemler.includes('oee.oku')) throw yetkiYok();
  const s = oeeSorgusu.safeParse(sorgu);
  if (!s.success) throw dogrulama(s.error.issues[0]?.message ?? 'Aralık geçersiz.', 'bitis');
  return (await oee(db, kullanici, s.data, simdi)).istasyonlar;
}
