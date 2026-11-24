import type { Db } from '#cekirdek/db.ts';
import type { VeritabaniCevabi } from '#paylasilan/sozlesme/saglik.ts';
import { dizinEksikOlabilirMi, sorguMetniniTemizle } from './kurallar.ts';
import { vtPahaliSorgular, vtTabloKullanimi } from './sorgular.ts';

const EN_COK = 20;

// Veritabanı ekranı: en pahalı sorgular (pg_stat_statements; eklenti yoksa durum söylenir) ve tablo kullanımı. Sorgu metni
// parametresizdir ve ayrıca maskelenip kısaltılır. İşaret kesin hüküm değildir (kurallar.ts).
export async function veritabaniTopla(db: Db): Promise<VeritabaniCevabi> {
  const sorgular = await vtPahaliSorgular(db, EN_COK);
  const tablolar = await vtTabloKullanimi(db, EN_COK);
  return {
    enCok: EN_COK,
    eklenti: sorgular.durum,
    sorgular: sorgular.sorgular.map((s) => ({ ...s, sorgu: sorguMetniniTemizle(s.sorgu) })),
    tablolar: tablolar.map((t) => ({
      ad: t.ad, okunanSatir: t.okunanSatir, tamTarama: t.tamTarama, dizinTaramasi: t.dizinTaramasi, yazma: t.yazma, dizinEksikOlabilir: dizinEksikOlabilirMi(t),
    })),
  };
}
