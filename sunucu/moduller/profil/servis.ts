import type { Db } from '#cekirdek/db.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { GeriBildirim, GeriBildirimGonderGovdesi, GeriBildirimKonusu, GeriBildirimTuru, ProfilCevabi } from '#paylasilan/sozlesme/profil.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { kisininFazlaMesaisi, kisininIzinleri, kisininKalanIzni, kisininPersonelKarti } from '../ik/disari.ts';
import { kisiAdlari, kisiGorevi } from '../kisiler/disari.ts';
import { mesaiToplami, PROFIL_GERI_BILDIRIM_SINIRI, profilAraliklari } from './kurallar.ts';
import * as s from './sorgular.ts';

const disaGeriBildirim = ({ kisiId: _kisi, ...g }: s.GeriBildirimSatiri): GeriBildirim => g;

// Yalnız oturumdaki kişinin kaydı okunur; başka kişiyi seçen girdi yoktur.
export async function profilOku(db: Db, kullanici: Kullanici, simdi: Date): Promise<ProfilCevabi> {
  const bugun = tesisGunu(simdi);
  const ar = profilAraliklari(bugun);
  const gorev = await kisiGorevi(db, kullanici.id);
  const personel = await kisininPersonelKarti(db, kullanici.id);
  const izin = await kisininKalanIzni(db, kullanici.id, bugun);
  const izinler = await kisininIzinleri(db, kullanici.id, ar.izinBaslangic, ar.izinBitis);
  const mesai = await kisininFazlaMesaisi(db, kullanici.id, ar.mesaiBaslangic, ar.mesaiBitis);
  const geriBildirimler = await s.kisininGeriBildirimleri(db, kullanici.id, PROFIL_GERI_BILDIRIM_SINIRI);
  return {
    kisi: { id: kullanici.id, ad: kullanici.ad, gorev },
    personel,
    izin,
    izinler: izinler === null ? null : [...izinler].sort((a, b) => b.baslangic.localeCompare(a.baslangic)),
    fazlaMesai: mesai === null ? null : {
      satirlar: [...mesai.satirlar].sort((a, b) => b.tarih.localeCompare(a.tarih)),
      toplamSaat: mesaiToplami(mesai.satirlar),
      yillikSinirSaat: mesai.yillikSinirSaat,
    },
    geriBildirimler: geriBildirimler.map(disaGeriBildirim),
    geriBildirimOkur: kullanici.islemler.includes('profil.geri-bildirim-oku'),
  };
}

// Kişi ve zaman sunucudan; gövde yalnız konu, tür ve metni taşır.
export async function geriBildirimGonder(db: Db, kullanici: Kullanici, govde: GeriBildirimGonderGovdesi): Promise<GeriBildirim> {
  return disaGeriBildirim(await s.geriBildirimEkle(db, kullanici.id, { konu: govde.konu, tur: govde.tur, metin: govde.metin.trim() }));
}

export async function geriBildirimListesi(
  db: Db,
  sorgu: { sayfa: number; sayfaBoyu?: number | undefined; konu?: GeriBildirimKonusu | undefined; tur?: GeriBildirimTuru | undefined },
): Promise<SayfaliListe<GeriBildirim & { kisiAdi: string }>> {
  const suzgec = { konu: sorgu.konu ?? null, tur: sorgu.tur ?? null };
  return sayfaliListe(sorgu, {
    say: () => s.geriBildirimSay(db, suzgec),
    satirlar: async (dilim) => {
      const satirlar = await s.geriBildirimSatirlari(db, suzgec, dilim);
      const adlar = await kisiAdlari(db, satirlar.map((r) => r.kisiId));
      return satirlar.map((r) => ({ ...disaGeriBildirim(r), kisiAdi: adlar.get(r.kisiId) ?? `Kişi ${r.kisiId}` }));
    },
  });
}
