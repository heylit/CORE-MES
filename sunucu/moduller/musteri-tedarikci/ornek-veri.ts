import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { firmaEkleGovdesi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import * as servis from './servis.ts';
import * as sorgular from './sorgular.ts';

// Firma adları ve adresleri uydurmadır; kodlar ORN- önekiyle başlar (yüklü mü denetimi buna bakar).
const KAYITCI = 'ornek.muhasebe';

const FIRMALAR = [
  { anahtar: 'musteriA', kod: 'ORN-MUS-01', ad: 'Ornek Musteri A', tur: 'musteri', vadeGunu: 60, il: 'Ankara', ilce: 'Cankaya', adres: 'Ornek Mah. 1. Sok. No: 1', postaKodu: '06000' },
  { anahtar: 'musteriB', kod: 'ORN-MUS-02', ad: 'Ornek Musteri B', tur: 'musteri', vadeGunu: 45, il: 'Ankara', ilce: 'Yenimahalle', adres: 'Ornek Mah. 2. Sok. No: 2', postaKodu: '06000' },
  { anahtar: 'tedarikciA', kod: 'ORN-TED-01', ad: 'Ornek Tedarikci A', tur: 'tedarikci', vadeGunu: 30, il: 'Ankara', ilce: 'Sincan', adres: 'Ornek OSB 3. Cad. No: 3', postaKodu: '06000' },
  { anahtar: 'tedarikciB', kod: 'ORN-TED-02', ad: 'Ornek Tedarikci B', tur: 'tedarikci', vadeGunu: 30, il: 'Ankara', ilce: 'Etimesgut', adres: 'Ornek OSB 4. Cad. No: 4', postaKodu: '06000' },
  { anahtar: 'fason', kod: 'ORN-FAS-01', ad: 'Ornek Fason Isil Islem', tur: 'tedarikci', fason: true, vadeGunu: 30, il: 'Ankara', ilce: 'Sincan', adres: 'Ornek OSB 5. Cad. No: 5', postaKodu: '06000' },
] as const;

// Başka modüllerin örnek verisi örnek firmayı bu anahtarla bulur (disari.ts ornekFirmaNo).
export type OrnekFirmaAnahtari = (typeof FIRMALAR)[number]['anahtar'];
export const ORNEK_FIRMA_ANAHTARLARI: readonly OrnekFirmaAnahtari[] = FIRMALAR.map((f) => f.anahtar);
export function ornekFirmaNo(db: Db, anahtar: OrnekFirmaAnahtari): Promise<number | null> {
  const f = FIRMALAR.find((x) => x.anahtar === anahtar);
  return f ? servis.firmaNoKoddan(db, f.kod) : Promise.resolve(null);
}

async function kayitci(db: Db): Promise<Kullanici> {
  const id = await kisiNoKullaniciAdindan(db, KAYITCI);
  if (id === null) throw new Error(`Müşteri ve tedarikçi örnek verisi ${KAYITCI} kişisini bulamadı (kisiler örnek verisi önce yüklenmeli).`);
  return { id, ad: KAYITCI, islemler: [] };
}

async function yukle(db: Db): Promise<void> {
  const k = await kayitci(db);
  for (const f of FIRMALAR) await servis.firmaEkle(db, k, firmaEkleGovdesi.parse(f));
}

export const ornekVeri = ornekVeriTanimi({
  modul: 'musteri-tedarikci',
  gerekir: ['kisiler'],
  yukluMu: (db) => sorgular.ornekFirmaVarMi(db),
  yukle,
});
