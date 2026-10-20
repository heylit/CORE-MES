import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kisiNoKullaniciAdindan, kullaniciYukle } from '../kisiler/disari.ts';
import { ornekKartKimligi, type OrnekMalzemeAnahtari } from './kurallar.ts';
import { katalogKartiKaydet, ornekKartVarMi } from './servis.ts';

// "ORNEK Atölye" hikayesinin malzeme kartları (kart #906). Kartlar ekranın yazdığı biçimde servis üzerinden açılır:
// kod, birim ve onay kuralları gerçek yazımdaki gibi işler. Kartı planlama açar, müdür onaylar (dört göz).
interface OrnekKart {
  kimlik: string;
  tur: 'mamul' | 'yarimamul' | 'hammadde' | 'sarf' | 'demirbas' | 'hizmet';
  onek: string;
  ad: string;
  birim: string;
  durum?: 'taslak' | 'onayda' | 'aktif';
  ek?: Record<string, unknown>;
}

const hikaye = (anahtar: OrnekMalzemeAnahtari, k: Omit<OrnekKart, 'kimlik'>): OrnekKart => ({ kimlik: ornekKartKimligi(anahtar), ...k });

// Listeyi sayfalamaya yetecek kadar dolduran uydurma kartlar (Bütün kartlar sayfası 50 satır): her türden, listedeki kategorilerle,
// çoğu aktif, bir kısmı onayda ya da taslak. Başka modüllerin örnek verisi bunlara bağlanmaz.
const DOLGU_TURLERI: readonly Omit<OrnekKart, 'kimlik' | 'ad' | 'durum'>[] = [
  { tur: 'hammadde', onek: 'HM-ORN-', birim: 'kg', ek: { fam: 'metal' } },
  { tur: 'yarimamul', onek: 'YM-ORN-', birim: 'adet' },
  { tur: 'mamul', onek: 'MM-ORN-', birim: 'adet' },
  { tur: 'sarf', onek: 'SF-ORN-', birim: 'adet' },
  { tur: 'demirbas', onek: 'DB-ORN-', birim: 'adet' },
  { tur: 'hizmet', onek: 'HZ-ORN-', birim: 'saat' },
];
const SARF_KATEGORILERI = ['kaynak', 'takim', 'asindirici', 'kimyasal', 'kkd', 'baglanti', 'ambalaj', 'genel'];
const DEMIRBAS_KATEGORILERI = ['makine', 'olcu', 'elaleti', 'kaldirma', 'kalip', 'bt', 'mobilya', 'tasit', 'tesis', 'diger'];
const HIZMET_GRUPLARI = ['fason', 'bakim', 'nakliye', 'danismanlik', 'yuzey', 'isil', 'muayene'];
export const DOLGU_KART_SAYISI = 45;

function dolguKarti(i: number): OrnekKart {
  const t = DOLGU_TURLERI[i % DOLGU_TURLERI.length]!;
  const sira = Math.floor(i / DOLGU_TURLERI.length);
  const no = String(i + 1).padStart(2, '0');
  const g = t.tur === 'sarf' ? { kat: SARF_KATEGORILERI[sira % SARF_KATEGORILERI.length] }
    : t.tur === 'demirbas' ? { kat: DEMIRBAS_KATEGORILERI[sira % DEMIRBAS_KATEGORILERI.length] }
      : t.tur === 'hizmet' ? { kat: HIZMET_GRUPLARI[sira % HIZMET_GRUPLARI.length], yon: sira % 2 === 0 ? 'Alınan' : 'Verilen' }
        : null;
  const durum = i % 7 === 6 ? 'taslak' : i % 4 === 3 ? 'onayda' : 'aktif';
  return { ...t, kimlik: `ornek-dolgu-${no}`, ad: `ORNEK Dolgu kartı ${no}`, durum, ek: { ...t.ek, ...(g ? { g } : {}) } };
}

const KARTLAR: readonly OrnekKart[] = [
  hikaye('mil', { tur: 'mamul', onek: 'MM-ORN-', ad: 'ORNEK Mil', birim: 'adet' }),
  hikaye('flans', { tur: 'mamul', onek: 'MM-ORN-', ad: 'ORNEK Flanş', birim: 'adet' }),
  hikaye('burc', { tur: 'mamul', onek: 'MM-ORN-', ad: 'ORNEK Burç', birim: 'adet' }),
  hikaye('cubuk', { tur: 'hammadde', onek: 'HM-ORN-', ad: 'ORNEK Yuvarlak çubuk Ø50', birim: 'kg', ek: { fam: 'metal' } }),
  hikaye('levha', { tur: 'hammadde', onek: 'HM-ORN-', ad: 'ORNEK Sac levha 10 mm', birim: 'kg', ek: { fam: 'metal' } }),
  hikaye('kesme-yagi', { tur: 'sarf', onek: 'SF-ORN-', ad: 'ORNEK Kesme yağı', birim: 'L' }),
  hikaye('isil-islem', { tur: 'hizmet', onek: 'HZ-ORN-', ad: 'ORNEK Isıl işlem (fason)', birim: 'kg', ek: { g: { kat: 'isil', yon: 'Alınan' } } }),
  ...Array.from({ length: DOLGU_KART_SAYISI }, (_, i) => dolguKarti(i)),
];

const YAZAN = 'ornek.planlama';
const ONAYLAYAN = 'ornek.mudur';

async function ornekKullanici(db: Db, kullaniciAdi: string): Promise<Kullanici> {
  const no = await kisiNoKullaniciAdindan(db, kullaniciAdi);
  const kullanici = no === null ? null : await kullaniciYukle(db, no);
  if (!kullanici) throw new Error(`Malzemeler örnek verisi ${kullaniciAdi} hesabını bulamadı (kisiler örnek verisi önce yüklenir).`);
  return kullanici;
}

// Hammadde ve sarfta ekran benzersiz anahtar üretir; mamul ve hizmette yoktur (kurallar.ts MKK-10).
const govde = (k: OrnekKart, durum: 'taslak' | 'onayda' | 'aktif', surum: number | null) => {
  const { kimlik } = k;
  return {
    kayit: { id: kimlik, tur: k.tur, com: { kod: `${k.onek}00000`, ad: k.ad, birim: k.birim }, onay: { durum }, ...k.ek },
    ozet: { benzersiz_anahtar: k.tur === 'hammadde' || k.tur === 'sarf' ? `${k.tur}|ornek|${kimlik}` : null, mukerrer_gerekcesi: null },
    surum,
  };
};

export const ornekVeri = ornekVeriTanimi({
  modul: 'malzemeler',
  gerekir: ['kisiler'],
  yukluMu: ornekKartVarMi,
  async yukle(db) {
    const yazan = await ornekKullanici(db, YAZAN);
    const onaylayan = await ornekKullanici(db, ONAYLAYAN);
    for (const k of KARTLAR) {
      const durum = k.durum ?? 'aktif';
      const acilan = await katalogKartiKaydet(db, yazan, k.kimlik, govde(k, durum === 'taslak' ? 'taslak' : 'onayda', null));
      if (durum === 'aktif') await katalogKartiKaydet(db, onaylayan, k.kimlik, govde(k, 'aktif', acilan.surum));
    }
  },
});
