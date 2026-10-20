import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriBaglami } from '#cekirdek/ornek-veri.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { eskiKoddanKimlikCoz } from '../istasyonlar/disari.ts';
import { kisiNoKullaniciAdindan, kisiSecenekleri, kullaniciYukle } from '../kisiler/disari.ts';
import type { Govde } from './kurallar.ts';
import { izinKarar, kaydet } from './servis.ts';
import { varMi } from './sorgular.ts';

/* Örnek atölyenin İK kayıtları: on iki örnek kişinin personel kartı, organizasyon, izin, devam, eğitim.
   Kayıtlar servis üzerinden yazılır (kurallar, kapsam ve geçmiş gerçek yazımdaki gibi işler). Ücret, T.C. kimlik ve IBAN
   açıkça uydurmadır: T.C. kimlik 1000000 ile başlar, IBAN sıfırlarla doludur, banka adı "ORNEK". */

const ILK_KIMLIK = 'orn_emp_01';

interface OrnekKisi {
  kullaniciAdi: string;
  soyad: string;
  pozisyon: string;
  departman: string;
  yonetici: string | null;
  maas: number;
  yaka: 'Beyaz yaka' | 'Mavi yaka';
  kademe: string;
}

// Yöneticisi önce gelir: personel kaydı bağlandığı yöneticinin kaydı varken yazılır. Ad ve görev kisiler örnek verisiyle aynı.
const KISILER: readonly OrnekKisi[] = [
  { kullaniciAdi: 'ornek.yonetici', soyad: 'Yönetici', pozisyon: 'Genel müdür', departman: 'yonetim', yonetici: null, maas: 150000, yaka: 'Beyaz yaka', kademe: 'Üst yönetim' },
  { kullaniciAdi: 'ornek.mudur', soyad: 'Müdür', pozisyon: 'Fabrika müdürü', departman: 'uretim', yonetici: 'ornek.yonetici', maas: 110000, yaka: 'Beyaz yaka', kademe: 'Yönetici' },
  { kullaniciAdi: 'ornek.planlama', soyad: 'Planlamacı', pozisyon: 'Üretim planlama', departman: 'uretim', yonetici: 'ornek.mudur', maas: 70000, yaka: 'Beyaz yaka', kademe: 'Uzman' },
  { kullaniciAdi: 'ornek.operator1', soyad: 'Operatör Bir', pozisyon: 'CNC torna operatörü', departman: 'uretim', yonetici: 'ornek.mudur', maas: 45000, yaka: 'Mavi yaka', kademe: 'Operasyon / teknik personel' },
  { kullaniciAdi: 'ornek.operator2', soyad: 'Operatör İki', pozisyon: 'CNC freze operatörü', departman: 'uretim', yonetici: 'ornek.mudur', maas: 45000, yaka: 'Mavi yaka', kademe: 'Operasyon / teknik personel' },
  { kullaniciAdi: 'ornek.operator3', soyad: 'Operatör Üç', pozisyon: 'CNC torna operatörü', departman: 'uretim', yonetici: 'ornek.mudur', maas: 42000, yaka: 'Mavi yaka', kademe: 'Operasyon / teknik personel' },
  { kullaniciAdi: 'ornek.cam', soyad: 'CAM Programcısı', pozisyon: 'CAM programcısı', departman: 'uretim', yonetici: 'ornek.mudur', maas: 68000, yaka: 'Beyaz yaka', kademe: 'Uzman' },
  { kullaniciAdi: 'ornek.kalite', soyad: 'Kaliteci', pozisyon: 'Kalite kontrol', departman: 'kalite', yonetici: 'ornek.yonetici', maas: 65000, yaka: 'Beyaz yaka', kademe: 'Uzman' },
  { kullaniciAdi: 'ornek.satinalma', soyad: 'Satınalmacı', pozisyon: 'Satın alma uzmanı', departman: 'satinalma', yonetici: 'ornek.yonetici', maas: 62000, yaka: 'Beyaz yaka', kademe: 'Uzman' },
  { kullaniciAdi: 'ornek.depo', soyad: 'Depocu', pozisyon: 'Depo sorumlusu', departman: 'satinalma', yonetici: 'ornek.satinalma', maas: 44000, yaka: 'Mavi yaka', kademe: 'Operasyon / teknik personel' },
  { kullaniciAdi: 'ornek.muhasebe', soyad: 'Muhasebeci', pozisyon: 'Muhasebe', departman: 'muhasebe', yonetici: 'ornek.yonetici', maas: 64000, yaka: 'Beyaz yaka', kademe: 'Uzman' },
  { kullaniciAdi: 'ornek.ik', soyad: 'İK Uzmanı', pozisyon: 'İnsan kaynakları', departman: 'ik', yonetici: 'ornek.yonetici', maas: 63000, yaka: 'Beyaz yaka', kademe: 'Uzman' },
];

const DEPARTMANLAR: readonly { anahtar: string; ad: string; kod: string }[] = [
  { anahtar: 'yonetim', ad: 'Yönetim', kod: 'ORN-YON' },
  { anahtar: 'uretim', ad: 'Üretim', kod: 'ORN-URT' },
  { anahtar: 'kalite', ad: 'Kalite', kod: 'ORN-KAL' },
  { anahtar: 'satinalma', ad: 'Satın Alma ve Depo', kod: 'ORN-SAT' },
  { anahtar: 'muhasebe', ad: 'Muhasebe', kod: 'ORN-MUH' },
  { anahtar: 'ik', ad: 'İnsan Kaynakları', kod: 'ORN-IK' },
];

const iki = (n: number): string => String(n).padStart(2, '0');
const personelKimligi = (sira: number): string => `orn_emp_${iki(sira + 1)}`;
const departmanKimligi = (anahtar: string): string => `orn_dept_${anahtar}`;

// Denetim haneleri doğru, açıkça uydurma numara (1000000 ile başlar); ekrandaki biçim denetiminden geçsin diye.
export function ornekTckn(sira: number): string {
  const d = `1000000${iki(sira)}`.split('').map(Number);
  const tek = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const cift = d[1]! + d[3]! + d[5]! + d[7]!;
  const d10 = (((tek * 7 - cift) % 10) + 10) % 10;
  const d11 = (d.reduce((a, b) => a + b, 0) + d10) % 10;
  return `${d.join('')}${d10}${d11}`;
}

function gunEkle(gun: string, ek: number): string {
  const t = new Date(`${gun}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + ek);
  return t.toISOString().slice(0, 10);
}

// Yıllık ve mazeret izni iş günüyle sınırlıdır (soru 55): örnek izin, gün + ek tarihinde ya da ondan sonraki ilk pazartesi başlar.
function pazartesiden(gun: string, ek: number): string {
  const t = gunEkle(gun, ek);
  return gunEkle(t, (8 - new Date(`${t}T00:00:00Z`).getUTCDay()) % 7);
}

async function kullanici(db: Db, ad: string, kisiNo: Map<string, number>): Promise<Kullanici> {
  const k = await kullaniciYukle(db, kisiNo.get(ad)!);
  if (k === null) throw new Error(`İK örnek verisi: ${ad} hesabı yüklenemedi (girişi yok ya da pasif).`);
  return k;
}

async function yukle(db: Db, baglam: OrnekVeriBaglami): Promise<void> {
  const kisiNo = new Map<string, number>();
  for (const k of KISILER) {
    const no = await kisiNoKullaniciAdindan(db, k.kullaniciAdi);
    if (no === null) throw new Error(`İK örnek verisi: ${k.kullaniciAdi} kişisi yok (kisiler örnek verisi önce yüklenir).`);
    kisiNo.set(k.kullaniciAdi, no);
  }
  // Personel kartının iş merkezi zorunlu; örnek atölyenin bütün kadrosu talaşlı imalat merkezinde.
  const merkez = (await eskiKoddanKimlikCoz(db, 'is_merkezi', ['ORN-TAL'])).get('ORN-TAL');
  if (merkez === undefined) throw new Error('İK örnek verisi: ORN-TAL iş merkezi yok (istasyonlar örnek verisi önce yüklenir).');
  // Sicil kişi kartındakiyle aynı (aynı kavram, ORTAKLIK-ik.md); kişi kartında sicili olmayan örnek yönetici ORN-001 alır.
  const siciller = new Map((await kisiSecenekleri(db)).map((k) => [k.id, k.sicilNo]));
  const yon = await kullanici(db, 'ornek.yonetici', kisiNo);
  const gun = baglam.gun;

  const departmanSurumu = new Map<string, number>();
  for (const d of DEPARTMANLAR) {
    const r = await kaydet(db, yon, 'departmanlar', departmanKimligi(d.anahtar), { id: departmanKimligi(d.anahtar), kind: 'dept', ad: d.ad, kod: d.kod }, null);
    departmanSurumu.set(d.anahtar, r.kayit.surum);
  }
  const kimlikOf = new Map(KISILER.map((k, i) => [k.kullaniciAdi, personelKimligi(i)]));
  for (const [i, k] of KISILER.entries()) {
    const id = personelKimligi(i);
    const govde: Govde = {
      id, kind: 'emp', ad: 'Örnek', soyad: k.soyad, sicilNo: siciller.get(kisiNo.get(k.kullaniciAdi)!) ?? 'ORN-001',
      pozisyon: k.pozisyon, departmanId: departmanKimligi(k.departman), yakaTipi: k.yaka, kademe: k.kademe,
      iseGiris: gunEkle(gun, -365 * (1 + (i % 4)) - 30 * i), sozlesmeTuru: 'Belirsiz süreli',
      calismaSekli: k.yaka === 'Mavi yaka' ? 'Vardiyalı' : 'Ofis', durum: 'Aktif', lokasyon: 'ORNEK Atölye',
      telefon: `0500 000 00 ${iki(i + 1)}`, eposta: `${k.kullaniciAdi}@ornek.invalid`,
      tckn: ornekTckn(i + 1), brutMaas: k.maas, banka: 'ORNEK Bankası', iban: `TR00 0000 0000 0000 0000 0000 ${iki(i + 1)}`,
      kisiId: kisiNo.get(k.kullaniciAdi)!, isMerkeziId: merkez,
      ...(k.yonetici === null ? {} : { yoneticiId: kimlikOf.get(k.yonetici)! }),
    };
    await kaydet(db, yon, 'personel', id, govde, null);
  }
  // Departman yöneticileri personel kartları yazıldıktan sonra bağlanır (bağlı kayıt önce var olmalı).
  const yoneticiler: Record<string, string> = { yonetim: 'ornek.yonetici', uretim: 'ornek.mudur', kalite: 'ornek.kalite', satinalma: 'ornek.satinalma', muhasebe: 'ornek.muhasebe', ik: 'ornek.ik' };
  for (const d of DEPARTMANLAR) {
    await kaydet(db, yon, 'departmanlar', departmanKimligi(d.anahtar),
      { id: departmanKimligi(d.anahtar), kind: 'dept', ad: d.ad, kod: d.kod, yoneticiId: kimlikOf.get(yoneticiler[d.anahtar]!)! }, departmanSurumu.get(d.anahtar)!);
  }

  // İzin: çalışan kendi talebini açar (talep ucu); biri yöneticinin kararıyla onaylanır, öteki onay bekler.
  const op1 = kimlikOf.get('ornek.operator1')!;
  const op2 = kimlikOf.get('ornek.operator2')!;
  const talep1 = await kaydet(db, await kullanici(db, 'ornek.operator1', kisiNo), 'izinler', 'orn_leave_01', {
    id: 'orn_leave_01', kind: 'leave', empId: op1, tur: 'Yıllık izin', baslangic: pazartesiden(gun, 7), bitis: gunEkle(pazartesiden(gun, 7), 2), gun: 3, durum: 'Beklemede', aciklama: 'Örnek izin talebi',
  }, null, 'talep');
  await izinKarar(db, yon, 'orn_leave_01', 'Onaylandı', talep1.kayit.surum);
  await kaydet(db, await kullanici(db, 'ornek.operator2', kisiNo), 'izinler', 'orn_leave_02', {
    id: 'orn_leave_02', kind: 'leave', empId: op2, tur: 'Mazeret izni', baslangic: pazartesiden(gun, 14), bitis: pazartesiden(gun, 14), gun: 1, durum: 'Beklemede', aciklama: 'Örnek izin talebi',
  }, null, 'talep');

  const devam: Govde[] = [
    { id: 'orn_att_01', kind: 'att', empId: op1, tarih: gunEkle(gun, -1), tur: 'Fazla mesai', saat: 2, onay: 'Onaylandı', aciklama: 'Örnek mesai' },
    { id: 'orn_att_02', kind: 'att', empId: op2, tarih: gunEkle(gun, -2), tur: 'Fazla mesai', saat: 1.5, onay: 'Beklemede', aciklama: 'Örnek mesai' },
    { id: 'orn_att_03', kind: 'att', empId: kimlikOf.get('ornek.operator3')!, tarih: gunEkle(gun, -3), tur: 'Geç kalma', saat: 0.5, onay: 'Onaylandı', aciklama: 'Örnek kayıt' },
  ];
  for (const g of devam) await kaydet(db, yon, 'devam', String(g['id']), g, null);

  await kaydet(db, yon, 'egitimler', 'orn_train_01', {
    id: 'orn_train_01', kind: 'train', ad: 'Örnek İSG temel eğitimi', tur: 'İSG (zorunlu)', kurum: 'ORNEK Eğitim', durum: 'Planlandı',
    tarih: gunEkle(gun, 10), sure: 8, maliyet: 5000, katilimcilar: [op1, op2, kimlikOf.get('ornek.operator3')!],
  }, null);
}

// Bordro taslağı kayıt değildir: Bordro ekranı ayın taslağını personel kartlarındaki ücretten hesaplar; kesinleştirme kullanıcının işidir.
export const ornekVeri = ornekVeriTanimi({
  modul: 'ik',
  gerekir: ['kisiler', 'istasyonlar'],
  yukluMu: (db) => varMi(db, 'emp', ILK_KIMLIK),
  yukle,
});
