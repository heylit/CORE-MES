import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kisiNoKullaniciAdindan, kullaniciYukle } from '../kisiler/disari.ts';
import { malzemeOzeti, ornekMalzemeNo, type OrnekMalzemeAnahtari } from '../malzemeler/disari.ts';
import { onayla, yaz } from './servis.ts';
import { ornekKaydiVarMi } from './sorgular.ts';

// "ORNEK Atölye" hikayesinin kalite kayıtları (kart #906): üç mamulün parça kartı, Mil'in final muayenesi (kabul), Flanş'ın
// proses muayenesi (ret), o retten açılan uygunsuzluk ve DÖF. Kayıtlar uygulamanın kendi biçimindedir (alan adları
// uygulamanın formlarından); parça no malzeme kartının stok kodudur. Örnek kayıtların kimliği ORN- ile başlar.
const KALITECI = 'ornek.kalite';
const KALITECI_ADI = 'Örnek Kaliteci';

const PARCALAR: readonly { anahtar: OrnekMalzemeAnahtari; malzeme: string; sinif: string }[] = [
  { anahtar: 'mil', malzeme: 'ORNEK çelik', sinif: 'Standart' },
  { anahtar: 'flans', malzeme: 'ORNEK çelik', sinif: 'Kritik' },
  { anahtar: 'burc', malzeme: 'ORNEK bronz', sinif: 'Standart' },
];

async function kaliteci(db: Db): Promise<Kullanici> {
  const no = await kisiNoKullaniciAdindan(db, KALITECI);
  const kullanici = no === null ? null : await kullaniciYukle(db, no);
  if (!kullanici) throw new Error(`Kalite Merkezi örnek verisi ${KALITECI} hesabını bulamadı (kisiler örnek verisi önce yüklenir).`);
  return kullanici;
}

async function parca(db: Db, anahtar: OrnekMalzemeAnahtari): Promise<{ no: string; ad: string }> {
  const no = await ornekMalzemeNo(db, anahtar);
  const ozet = no === null ? null : await malzemeOzeti(db, no);
  if (!ozet) throw new Error(`Kalite Merkezi örnek verisi "${anahtar}" malzeme kartını bulamadı (malzemeler örnek verisi önce yüklenir).`);
  return { no: ozet.kod, ad: ozet.ad ?? ozet.kod };
}

// Uygulamanın parça kimliği: 'p-' ve büyük harfe çevrilmiş parça no (uygulamadaki openPartForm ile aynı).
const parcaKimligi = (parcaNo: string): string =>
  `p-${parcaNo.trim().toLocaleUpperCase('tr').replace(/[^A-Za-z0-9_\-.]/g, '_').slice(0, 120)}`;

function gunEkle(gun: string, ek: number): string {
  const t = new Date(`${gun}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + ek);
  return t.toISOString().slice(0, 10);
}

export const ornekVeri = ornekVeriTanimi({
  modul: 'kalite-merkezi',
  gerekir: ['kisiler', 'malzemeler'],
  yukluMu: ornekKaydiVarMi,
  async yukle(db, baglam) {
    const kisi = await kaliteci(db);
    const guncelleme = baglam.an.toISOString();
    const kaydet = (koleksiyon: string, kimlik: string, govde: Record<string, unknown>) =>
      yaz(db, kisi, koleksiyon, kimlik, { ...govde, guncelleme }, null);

    const parcalar = new Map<OrnekMalzemeAnahtari, { no: string; ad: string }>();
    for (const p of PARCALAR) {
      const m = await parca(db, p.anahtar);
      parcalar.set(p.anahtar, m);
      await kaydet('parca', parcaKimligi(m.no), {
        parcaNo: m.no, ad: m.ad, malzeme: p.malzeme, tedarikci: '', sinif: p.sinif, not: 'Örnek parça kartı.',
      });
    }
    const mil = parcalar.get('mil')!;
    const flans = parcalar.get('flans')!;
    const dun = gunEkle(baglam.gun, -1);

    await kaydet('insp', 'ORN-MUA-1', {
      no: 'ORN-MUA-0001', tur: 'Final', tarih: dun, muayeneci: KALITECI_ADI, parcaNo: mil.no, parcaAdi: mil.ad, rev: 'A',
      lot: 'ORN-LOT-001', emir: '', miktar: 20, numune: 5, tedarikci: '',
      chars: [
        { balon: 1, ad: 'Dış çap Ø20', tip: 'Değişken', nominal: '20', alt: '0.02', ust: '0.02', olcum: '20.01', cihaz: '', sonuc: 'OK' },
        { balon: 2, ad: 'Boy 120', tip: 'Değişken', nominal: '120', alt: '0.1', ust: '0.1', olcum: '119.96', cihaz: '', sonuc: 'OK' },
        { balon: 3, ad: 'Yüzey görünümü', tip: 'Nitel', nominal: '', alt: '', ust: '', olcum: 'Uygun', cihaz: '', sonuc: 'OK' },
      ],
      not: 'Örnek final muayenesi.', aqlPlan: '', gchk: [], fchk: [], faiNeden: '', faiKapsam: '', sonuc: 'Kabul', cizimId: '',
    });
    await kaydet('insp', 'ORN-MUA-2', {
      no: 'ORN-MUA-0002', tur: 'Proses', tarih: baglam.gun, muayeneci: KALITECI_ADI, parcaNo: flans.no, parcaAdi: flans.ad, rev: 'A',
      lot: 'ORN-LOT-002', emir: '', miktar: 20, numune: 5, tedarikci: '',
      chars: [
        { balon: 1, ad: 'Delik çapı Ø12 H7', tip: 'Değişken', nominal: '12', alt: '0', ust: '0.018', olcum: '12.031', cihaz: '', sonuc: 'NOK' },
        { balon: 2, ad: 'Flanş kalınlığı 15', tip: 'Değişken', nominal: '15', alt: '0.05', ust: '0.05', olcum: '15.02', cihaz: '', sonuc: 'OK' },
      ],
      not: 'Örnek proses muayenesi; delik çapı tolerans dışı.', aqlPlan: '', gchk: [], fchk: [], faiNeden: '', faiKapsam: '',
      sonuc: 'Ret', cizimId: '',
    });
    // MRB kararı onaydır (195 a): kararlı uygunsuzluk onay yoluyla yazılır.
    await onayla(db, kisi, 'ncr', 'ORN-NCR-1', {
      no: 'ORN-NCR-0001', tarih: baglam.gun, kaynak: 'Proses muayene', ciddiyet: 'Majör', parcaNo: flans.no, parcaAdi: flans.ad,
      rev: 'A', lot: 'ORN-LOT-002', proje: '', emir: '', miktar: 2, hataTipi: 'Boyutsal', tedarikci: '', sorumlu: KALITECI_ADI,
      durum: 'DÖF açıldı', tanim: 'Gereksinim Ø12 H7 (12,000-12,018); ölçülen 12,031. Numunede 2 parça tolerans dışı.',
      mrb: 'Yeniden işle', mrbGerekce: 'Örnek karar: delik yeniden işlenip tekrar ölçülecek.', guncelleme,
    }, null);
    await kaydet('capa', 'ORN-DOF-1', {
      no: 'ORN-DOF-0001', ncrRef: 'ORN-NCR-1', acilis: baglam.gun, termin: gunEkle(baglam.gun, 30),
      baslik: 'Flanş delik çapı tolerans dışı', sorumlu: KALITECI_ADI, tur: 'Düzeltici', yontem: '5 Neden', adim: 3, durum: 'Açık',
      kokNeden: 'Örnek: delik takımı aşınmış, takım ömrü takibi yok.', aksiyon: 'Örnek: takım ömrü sayacı ve vardiya başı ölçüm.',
      etkinlik: 'Doğrulanmadı', etkinlikKanit: '',
    });
  },
});
