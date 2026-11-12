import { type Db } from '#cekirdek/db.ts';
import { dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  TASLAK_AZAMI_BAYT, malKabulTaslakFormu, type MalKabulTaslagiCevabi, type MalKabulTaslagiKaydetCevabi, type MalKabulTaslagiKaydetGovdesi,
  type MalKabulTaslagiSilGovdesi,
} from '#paylasilan/sozlesme/stok-mal-kabul-taslagi.ts';
import * as sorgular from '../sorgular.ts';

// 3087 a, 3091 a: yarım kalan mal kabul. Okuma ve yazma yalnız oturumdaki kişinin kendi taslağınadır; başkasınınki görünmez.
const BUYUK = 'Taslak çok büyük; satır sayısını azaltın ya da teslim alın.';

export async function malKabulTaslagi(db: Db, k: Kullanici): Promise<MalKabulTaslagiCevabi> {
  const t = await sorgular.malKabulTaslagiOku(db, k.id);
  // Şema sonradan daralırsa eski taslak formu bozmasın: okunamayan taslak yokmuş gibi döner, teslimde silinir.
  const govde = t ? malKabulTaslakFormu.safeParse(t.govde) : null;
  return { taslak: t && govde?.success ? { govde: govde.data, surum: t.surum, guncellendi: t.guncellendi } : null };
}

export async function malKabulTaslagiKaydet(db: Db, k: Kullanici, g: MalKabulTaslagiKaydetGovdesi): Promise<MalKabulTaslagiKaydetCevabi> {
  if (Buffer.byteLength(JSON.stringify(g.govde)) > TASLAK_AZAMI_BAYT) throw dogrulama(BUYUK, 'govde');
  const t = g.surum === null ? await sorgular.malKabulTaslagiAc(db, k.id, g.govde) : await sorgular.malKabulTaslagiGuncelle(db, k.id, g.govde, g.surum);
  if (t === null) throw eskiSurum();
  return { surum: t.surum, guncellendi: t.guncellendi };
}

// Sürüm tutmazsa (başka cihaz taslağı değiştirdi) silmez; taslak hiç yoksa sessizce geçer.
export async function malKabulTaslagiSil(db: Db, k: Kullanici, g: MalKabulTaslagiSilGovdesi): Promise<{ silindi: boolean }> {
  const silinen = await sorgular.malKabulTaslagiSil(db, k.id, g.surum);
  if (silinen === 0 && g.surum !== null && (await sorgular.malKabulTaslagiOku(db, k.id)) !== null) throw eskiSurum();
  return { silindi: silinen > 0 };
}

// Teslimde aynı işlemde: kişinin taslağı sürüme bakmadan silinir (form ondan devam ettiyse ya da onu yazdıysa istemci ister).
export async function teslimdeTaslagiSil(db: Db, k: Kullanici): Promise<void> {
  await sorgular.malKabulTaslagiSil(db, k.id, null);
}
