import type { Db } from '#cekirdek/db.ts';
import { bulunamadi } from '#cekirdek/hata.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { TeklifIstekFormuCevabi, TeklifIstekFormuIcerigi } from '#paylasilan/sozlesme/satin-alma.ts';
import { teklifFormuKurumBilgisi } from '../siparisler/disari.ts';
import { ILETILER, istekFormuIcerigi } from './kurallar.ts';
import * as s from './sorgular.ts';

// şablon satırı göçle gelir; yoksa kurulum bozuktur, boş form uydurulmaz.
export async function teklifIstekFormu(db: Db): Promise<TeklifIstekFormuCevabi> {
  const satir = await s.teklifIstekFormuOku(db);
  if (satir === null) throw bulunamadi(ILETILER.istekFormuYok);
  return { icerik: istekFormuIcerigi(satir.icerik), surum: satir.surum, kurum: await teklifFormuKurumBilgisi(db) };
}

export async function teklifIstekFormuKaydet(db: Db, k: Kullanici, g: { icerik: TeklifIstekFormuIcerigi; surum: number }): Promise<TeklifIstekFormuCevabi> {
  await surumluGuncelle({
    guncelle: () => s.teklifIstekFormuGuncelle(db, g.icerik, g.surum, k.id),
    varMi: async () => (await s.teklifIstekFormuOku(db)) !== null,
    bulunamadiIletisi: ILETILER.istekFormuYok,
  });
  return teklifIstekFormu(db);
}
