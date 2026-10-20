import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import type { Db } from '#cekirdek/db.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import { gunEkle } from './kurallar.ts';
import { aktifTurler, aletOlustur, kalibrasyonKaydet } from './servis.ts';
import { ornekAletVarMi } from './sorgular.ts';

const KAYDEDEN = 'ornek.kalite';
const PERIYOT = 365;

// `once`: örnek günden kaç gün önce kalibre edildiği (son uygun kayıt). Vade = son kayıt + periyot; kalan gün buradan çıkar:
// 5 ve 12 gün kalan iki alet yaklaşan, 15 gün geçmiş bir alet vadesi geçmiş, gerisi geçerli.
interface OrnekAlet {
  no: string; tur: string; ad: string; olcmeAraligi: string; yer: string; once: number[];
}

const ALETLER: readonly OrnekAlet[] = [
  { no: 'ORN-KMP-01', tur: 'Kumpas', ad: 'Örnek dijital kumpas', olcmeAraligi: '0-150 mm', yer: 'Kontrol masası', once: [120] },
  { no: 'ORN-KMP-02', tur: 'Kumpas', ad: 'Örnek analog kumpas', olcmeAraligi: '0-200 mm', yer: 'Torna bölümü', once: [725, PERIYOT - 5] },
  { no: 'ORN-MKR-01', tur: 'Mikrometre', ad: 'Örnek dış mikrometre', olcmeAraligi: '25-50 mm', yer: 'Kontrol masası', once: [PERIYOT - 12] },
  { no: 'ORN-KOM-01', tur: 'Komparatör', ad: 'Örnek komparatör saati', olcmeAraligi: '0-10 mm', yer: 'Freze bölümü', once: [PERIYOT + 15] },
  { no: 'ORN-TMP-01', tur: 'Tampon mastar', ad: 'Örnek tampon mastar H7', olcmeAraligi: 'Ø20 H7', yer: 'Kontrol masası', once: [60] },
  { no: 'ORN-DIS-01', tur: 'Diş mastarı', ad: 'Örnek diş mastarı', olcmeAraligi: 'M10x1,5', yer: 'Torna bölümü', once: [200] },
  { no: 'ORN-YUK-01', tur: 'Yükseklik mihengiri', ad: 'Örnek yükseklik mihengiri', olcmeAraligi: '0-300 mm', yer: 'Kontrol masası', once: [30] },
  { no: 'ORN-TRK-01', tur: 'Tork anahtarı', ad: 'Örnek tork anahtarı', olcmeAraligi: '20-100 Nm', yer: 'Montaj bölümü', once: [90] },
];

async function yukle(db: Db, gun: string): Promise<void> {
  const kisiId = await kisiNoKullaniciAdindan(db, KAYDEDEN);
  if (kisiId === null) throw new Error(`Kalibrasyon örnek verisi ${KAYDEDEN} kişisini bulamadı (kisiler örnek verisi önce yüklenir)`);
  const turler = new Map((await aktifTurler(db)).map((t) => [t.ad, t.id]));
  for (const a of ALETLER) {
    const turId = turler.get(a.tur);
    if (turId === undefined) throw new Error(`Kalibrasyon örnek verisi için aktif tür yok: ${a.tur}`);
    const [ilk, ...sonrakiler] = a.once.map((g, i) => ({
      tarih: gunEkle(gun, -g), sonuc: 'uygun' as const, sertifikaNo: `ORN-SRT-${a.no.slice(4)}-${i + 1}`,
    }));
    const alet = await aletOlustur(db, kisiId, {
      no: a.no, turId, ad: a.ad, olcmeAraligi: a.olcmeAraligi, yer: a.yer, periyotGun: PERIYOT, ilkKalibrasyon: ilk,
    }, gun);
    for (const kayit of sonrakiler) await kalibrasyonKaydet(db, kisiId, alet.id, kayit, gun);
  }
}

export const ornekVeri = ornekVeriTanimi({
  modul: 'kalibrasyon',
  gerekir: ['kisiler'],
  yukluMu: ornekAletVarMi,
  yukle: (db, baglam) => yukle(db, baglam.gun),
});
