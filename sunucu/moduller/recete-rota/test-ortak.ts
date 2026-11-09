// Yalnız testler için: ana durum kaydı komut ucundan yazılmaz (anaKaydiReddet, B-2484-2). Eski çerçevenin yazdığı belgeyi okuyan
// davranışlar (sayım, taşıma tabloları, plan alanları) belgeyi servisin kendi yazımıyla kurar; yazan, testin `yonetici` hesabıdır.
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { YazGovdesi } from '#paylasilan/sozlesme/recete-rota.ts';
import { kisiNoKullaniciAdindan, kullaniciYukle } from '../kisiler/disari.ts';
import { DURUM_ANAHTARI } from './disari.ts';
import { kayitGetir } from './sorgular.ts';
import { yaz } from './servis.ts';

export async function anaKayitYaz(vt: TestVeritabani['vt'], deger: unknown, beklenenSurum: number | null, anahtar = DURUM_ANAHTARI): Promise<number> {
  return vt.tx(async (db): Promise<number> => {
    const kisiId = await kisiNoKullaniciAdindan(db, 'yonetici');
    const kullanici = kisiId === null ? null : await kullaniciYukle(db, kisiId);
    if (kullanici === null) throw new Error('Ana kaydı yazacak yonetici hesabı yok.');
    return (await yaz(db, kullanici, { anahtar, bicim: 'json', deger: deger as YazGovdesi['deger'], beklenenSurum })).kayit.surum;
  });
}

export async function anaKayitSurumu(vt: TestVeritabani['vt']): Promise<number | null> {
  return (await vt.tx((db) => kayitGetir(db, DURUM_ANAHTARI)))?.surum ?? null;
}
