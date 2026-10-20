import type { Db } from '#cekirdek/db.ts';
import { ornekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriBaglami } from '#cekirdek/ornek-veri.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  belgeEkleGovdesi, cekEkleGovdesi, duzenliOdemeGovdesi, hesapEkleGovdesi, odemeEkleGovdesi,
} from '#paylasilan/sozlesme/finans.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import { ORNEK_FIRMA_ANAHTARLARI, ornekFirmaNo } from '../musteri-tedarikci/disari.ts';
import { gunEkle } from './kurallar.ts';
import * as servis from './servis.ts';
import * as sorgular from './sorgular.ts';

// Tutar ve belge numaraları uydurmadır; örnek firmalar musteri-tedarikci örnek verisindedir. Yüklü mü denetimi örnek hesaba bakar.
// Ortak ayar, kur ve faiz yazılmaz (KD-066): örnek kayıtların hepsi TRY'dir, kuru gerektirmez; ilk kurulum kullanıcıya kalır.
const KAYITCI = 'ornek.muhasebe';

async function kayitci(db: Db): Promise<Kullanici> {
  const id = await kisiNoKullaniciAdindan(db, KAYITCI);
  if (id === null) throw new Error(`Finans örnek verisi ${KAYITCI} kişisini bulamadı (kisiler örnek verisi önce yüklenmeli).`);
  return { id, ad: KAYITCI, islemler: [] };
}

async function yukle(db: Db, baglam: OrnekVeriBaglami): Promise<void> {
  const k = await kayitci(db);
  const gun = baglam.gun;
  const once = (n: number): string => gunEkle(gun, -n);

  const acilis = once(90);
  await servis.hesapEkle(db, k, hesapEkleGovdesi.parse({ ad: 'ORNEK Kasa', tur: 'kasa', acilisBakiyesi: 50000, acilisTarihi: acilis }));
  const banka = await servis.hesapEkle(db, k, hesapEkleGovdesi.parse({
    ad: 'ORNEK Banka TL', tur: 'banka', acilisBakiyesi: 850000, acilisTarihi: acilis, bankaAdi: 'Ornek Bank',
  })) as { id: number };

  const firma: Record<string, number> = {};
  const KODLAR = { musteriA: 'ORN-MUS-01', musteriB: 'ORN-MUS-02', tedarikciA: 'ORN-TED-01', tedarikciB: 'ORN-TED-02', fason: 'ORN-FAS-01' } as const;
  for (const anahtar of ORNEK_FIRMA_ANAHTARLARI) {
    const no = await ornekFirmaNo(db, anahtar);
    if (no === null) throw new Error(`Finans örnek verisi örnek firmayı bulamadı (${anahtar}); musteri-tedarikci örnek verisi önce yüklenmeli.`);
    firma[KODLAR[anahtar]] = no;
  }

  const belge = (g: Record<string, unknown>) => servis.belgeEkle(db, k, belgeEkleGovdesi.parse(g));
  const satis1 = await belge({
    yon: 'gelir', kategori: 'urun_satisi', firmaId: firma['ORN-MUS-01'], belgeNo: 'ORN-S-0001', aciklama: 'Ornek mil sevkiyati',
    belgeTarihi: once(40), vade: once(10), tutar: 180000, kdvOrani: 20,
  });
  const satis2 = await belge({
    yon: 'gelir', kategori: 'urun_satisi', firmaId: firma['ORN-MUS-02'], belgeNo: 'ORN-S-0002', aciklama: 'Ornek flans siparisi',
    belgeTarihi: once(10), vade: gunEkle(gun, 35), tutar: 96000, kdvOrani: 20,
  });
  const alis1 = await belge({
    yon: 'gider', kategori: 'mal_alimi', firmaId: firma['ORN-TED-01'], belgeNo: 'ORN-A-0001', aciklama: 'Ornek cubuk malzeme',
    belgeTarihi: once(35), vade: once(5), tutar: 60000, kdvOrani: 20,
  });
  await belge({
    yon: 'gider', kategori: 'diger_gider', firmaId: firma['ORN-FAS-01'], belgeNo: 'ORN-A-0002', aciklama: 'Ornek isil islem (fason)',
    belgeTarihi: once(7), vade: gunEkle(gun, 23), tutar: 18000, kdvOrani: 20,
  });

  const odeme = (g: Record<string, unknown>) => servis.odemeEkle(db, k, odemeEkleGovdesi.parse(g));
  await odeme({
    yon: 'gelir', firmaId: firma['ORN-MUS-01'], tarih: once(12), yontem: 'banka', hesapId: banka.id, tutar: Number(satis1.toplam),
    aciklama: 'Ornek tahsilat', dagitimlar: [{ belgeId: satis1.id, belgeTutari: Number(satis1.toplam) }],
  });
  await odeme({
    yon: 'gider', firmaId: firma['ORN-TED-01'], tarih: once(6), yontem: 'banka', hesapId: banka.id, tutar: Number(alis1.toplam),
    aciklama: 'Ornek odeme', dagitimlar: [{ belgeId: alis1.id, belgeTutari: Number(alis1.toplam) }],
  });

  // Müşteri B ikinci faturanın bir kısmını vadeli çekle kapattı; kalanı açık durur.
  await servis.cekEkle(db, k, cekEkleGovdesi.parse({
    yon: 'alinan', tur: 'cek', firmaId: firma['ORN-MUS-02'], banka: 'Ornek Bank', seriNo: 'ORN-C-0001',
    duzenlemeTarihi: once(3), vade: gunEkle(gun, 30), tutar: 50000, dagitimlar: [{ belgeId: satis2.id, belgeTutari: 50000 }],
  }));

  await servis.duzenliEkle(db, k, duzenliOdemeGovdesi.parse({
    ad: 'ORNEK Atolye kirasi', kategori: 'kira', hesapId: banka.id, tutar: 45000, kdvOrani: 20, ayinGunu: 5,
  }));
  await servis.duzenliEkle(db, k, duzenliOdemeGovdesi.parse({
    ad: 'ORNEK Maaslar', kategori: 'personel', hesapId: banka.id, tutar: 320000, ayinGunu: 1,
  }));
}

export const ornekVeri = ornekVeriTanimi({
  modul: 'finans',
  gerekir: ['kisiler', 'musteri-tedarikci'],
  yukluMu: (db) => sorgular.ornekHesapVarMi(db),
  yukle,
});
