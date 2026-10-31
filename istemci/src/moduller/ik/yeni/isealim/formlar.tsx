import { useMemo, useState, type ReactNode } from 'react';
import { useBildirim } from '../../../../ortak/arayuz/index.ts';
import { adSoyad } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { PersonelFormu } from '../personel/index.tsx';
import { ikSabitleri, motorKur, type IkMotoru } from '../motor.ts';
import type { Aday, Egitim, Gorusme, Performans, Pozisyon } from '../tipler.ts';
import { useIkDeposu, useIkKomutu, yeniKimlik } from '../veri.ts';
import {
  ADAY_ALANLARI, bolumAlanlari, EGITIM_ALANLARI, GORUSME_ALANLARI, PERFORMANS_ALANLARI, POZISYON_ALANLARI, type AdayBolumu, type GorusmeBolumu,
} from './alanlar.ts';
import { adayAdi, gorusmeSonrasiAsama, gunEkle, ISE_ALINDI, iseGirisTaslagi, kisaGorusmeZamani, REDDEDILDI, satirlar } from './kurallar.ts';
import { adayBul, bugun, KayitFormu, pozisyonBul, type FormBaglami } from './parcalar.tsx';

/* ---------------- Performans ---------------- */

export interface PerformansFormuOzellikleri { o: IkEkranOzellikleri; acik: boolean; kayit: Performans | null; onDolu: Partial<Performans>; kapat: () => void }

export function PerformansFormu({ o, acik, kayit, onDolu, kapat }: PerformansFormuOzellikleri) {
  if (!acik) return null;
  return (
    <KayitFormu<Performans>
      b={{ depo: o.depo, motor: o.motor }} baslik={kayit ? 'Değerlendirmeyi düzenle' : 'Yeni değerlendirme'} alanlar={PERFORMANS_ALANLARI}
      kayit={kayit} onDolu={onDolu} yeni={() => ({ id: yeniKimlik('perf'), kind: 'perf' })} kapat={kapat}
    />
  );
}

/* ---------------- Eğitim ---------------- */

export function EgitimFormu({ o, kayit, kapat }: { o: IkEkranOzellikleri; kayit: Egitim | null; kapat: () => void }) {
  return (
    <KayitFormu<Egitim>
      b={{ depo: o.depo, motor: o.motor }} baslik={kayit ? `${kayit.ad ?? 'Eğitim'}: düzenle` : 'Eğitim ekle'} alanlar={EGITIM_ALANLARI}
      kayit={kayit} yeni={() => ({ id: yeniKimlik('train'), kind: 'train' })} kapat={kapat}
    />
  );
}

/* ---------------- Pozisyon ---------------- */

// İlan kodu boşsa motor verir (bugünkü kural); yeni pozisyon taslak ve yayınsız başlar.
function pozisyonFormuIcerigi(b: FormBaglami, kayit: Pozisyon | null, onDolu: Partial<Pozisyon>, kapat: () => void, kaydedildi?: (j: Pozisyon) => void) {
  const gun = bugun();
  const ims = b.depo.ben.secenekler.isMerkezleri;
  const tekMerkez = ims.length === 1 && ims[0] ? { isMerkeziId: ims[0].id } : {};
  return (
    <KayitFormu<Pozisyon>
      b={b} baslik={kayit ? `${kayit.baslik ?? 'Pozisyon'}: düzenle` : 'Pozisyon aç'} alanlar={POZISYON_ALANLARI} kayit={kayit}
      onDolu={{ sonBasvuru: gunEkle(gun, 30), ...tekMerkez, ...onDolu } as Partial<Pozisyon>}
      yeni={() => ({ id: yeniKimlik('job'), kind: 'job', durum: 'Taslak', yayinlar: {}, acilis: gun })}
      once={(j) => (j.ilanKodu || !b.motor ? j : { ...j, ilanKodu: String(b.motor.newJobCode()) })}
      bildirim={kayit ? undefined : 'Pozisyon oluşturuldu. İlan metnini kontrol edip kanallara yayınlayın.'}
      kapat={kapat} sonra={(j) => { kaydedildi?.(j); }}
    />
  );
}

export function PozisyonDuzenle({ o, kayit, onDolu = {}, kapat, kaydedildi }: { o: IkEkranOzellikleri; kayit: Pozisyon | null; onDolu?: Partial<Pozisyon>; kapat: () => void; kaydedildi?: (j: Pozisyon) => void }) {
  return pozisyonFormuIcerigi({ depo: o.depo, motor: o.motor }, kayit, onDolu, kapat, kaydedildi);
}

// Parçalar arası (sözleşme): P1 "Yerine pozisyon aç" ön dolu açar; depo ve motor buradan okunur.
export interface PozisyonFormuOzellikleri { acik: boolean; onDolu: Partial<Pozisyon>; kapat: () => void; kaydedildi?: (j: Pozisyon) => void }
export function PozisyonFormu({ acik, onDolu, kapat, kaydedildi }: PozisyonFormuOzellikleri) {
  const { data: depo } = useIkDeposu();
  const motor = useMemo<IkMotoru | null>(() => (depo ? motorKur([...depo.kayitlar.values()], depo.ayarlar) : null), [depo]);
  if (!acik || !depo) return null;
  return pozisyonFormuIcerigi({ depo, motor }, null, onDolu, kapat, kaydedildi);
}

/* ---------------- Aday ---------------- */

export function AdayFormu({ o, kayit, bolumler, onDolu = {}, baslik, kapat, kaydedildi, ret }: {
  o: IkEkranOzellikleri; kayit: Aday | null; bolumler: readonly AdayBolumu[]; onDolu?: Partial<Aday>; baslik?: string; kapat: () => void;
  kaydedildi?: (a: Aday) => void; ret?: boolean;
}) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const gun = bugun();
  // Ret: aşama Reddedildi ve ret tarihi; adayın planlı görüşmeleri iptal edilir (bugünkü kural).
  const sonra = async (a: Aday) => {
    if (ret) {
      const planli = o.depo.tur('intv').filter((g) => g.candId === a.id && g.durum === 'Planlandı');
      for (const g of planli) await komut.kaydet({ ...g, durum: 'İptal' });
      if (planli.length) bildir('bilgi', `${planli.length} planlı görüşme iptal edildi.`);
    }
    kaydedildi?.(a);
  };
  return (
    <KayitFormu<Aday>
      b={{ depo: o.depo, motor: o.motor }} baslik={baslik ?? (kayit ? `${adayAdi(kayit)}: düzenle` : 'Aday ekle')}
      alanlar={bolumAlanlari(ADAY_ALANLARI, bolumler)} kayit={kayit} onDolu={onDolu}
      yeni={() => ({ id: yeniKimlik('cand'), kind: 'cand', asama: 'Başvuru', basvuruTarihi: gun })}
      once={ret ? (a) => ({ ...a, asama: REDDEDILDI, redTarihi: gun }) : undefined}
      kaydetMetni={ret ? 'Adayı reddet' : undefined} kapat={kapat} sonra={sonra}
    />
  );
}

/* ---------------- Görüşme ---------------- */

export function GorusmeFormu({ o, kayit, adayId, degerlendir, kapat }: {
  o: IkEkranOzellikleri; kayit: Gorusme | null; adayId?: string; degerlendir?: boolean; kapat: () => void;
}) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const gun = bugun();
  const sabitler = ikSabitleri();
  const aday = adayBul(o.depo, kayit?.candId ?? adayId);
  const pozisyon = pozisyonBul(o.depo, aday?.jobId);
  const sorular = satirlar(pozisyon?.mulakatSorulari);
  const bolumler: readonly GorusmeBolumu[] | null = degerlendir ? ['Değerlendirme'] : kayit ? null : ['Planlama'];
  const giris = degerlendir && kayit ? (
    <div className="tc-ika-giris">
      <p className="tc-ika-soluk">
        {kisaGorusmeZamani(kayit)}{(kayit.gorusmeciler ?? []).length ? `. Görüşmeci: ${(kayit.gorusmeciler ?? []).map((id) => adSoyad(o.depo.tur('emp').find((p) => p.id === id))).join(', ')}` : ''}
      </p>
      {sorular.length > 0 && (
        <details className="tc-ika-sorular">
          <summary>{`${pozisyon?.baslik ?? ''} için mülakat soru seti (${sorular.length})`}</summary>
          <ol>{sorular.map((s) => <li key={s}>{s}</li>)}</ol>
        </details>
      )}
    </div>
  ) : undefined;
  // Yeni görüşme planlanınca süreçteki aday ön görüşme ya da mülakat aşamasına geçer (bugünkü kural).
  const sonra = async (g: Gorusme) => {
    if (kayit || !sabitler) return;
    const a = adayBul(o.depo, g.candId);
    const hedef = a ? gorusmeSonrasiAsama(sabitler.STAGES, a, g.tur) : null;
    if (a && hedef) {
      await komut.kaydet({ ...a, asama: hedef });
      bildir('bilgi', `${adayAdi(a)} “${hedef}” aşamasına taşındı.`);
    }
  };
  return (
    <KayitFormu<Gorusme>
      b={{ depo: o.depo, motor: o.motor }}
      baslik={degerlendir && kayit ? `Değerlendirme: ${adayAdi(aday)}, ${kayit.tur ?? ''}` : kayit ? 'Görüşmeyi düzenle' : 'Görüşme planla'}
      alanlar={bolumAlanlari(GORUSME_ALANLARI, bolumler)} kayit={kayit} onDolu={adayId ? { candId: adayId } : {}} giris={giris}
      yeni={() => ({ id: yeniKimlik('intv'), kind: 'intv' })}
      once={degerlendir ? (g) => ({ ...g, durum: !g.durum || g.durum === 'Planlandı' ? 'Tamamlandı' : g.durum, degerlendirmeTarihi: gun }) : undefined}
      kapat={kapat} sonra={sonra}
    />
  );
}

/* ---------------- İşe al ---------------- */

// İşe al: personel formu adayın bilgileriyle açılır (P1 PersonelFormu). Kaydedilince aday işe alındı olur, planlı görüşmeleri
// iptal edilir ve çalışan sayfasına geçilir (sözleşmedeki akış; yazmalar bugünkü gibi sıralıdır).
export function useIseAlim(o: IkEkranOzellikleri): { baslat: (a: Aday) => void; pencere: ReactNode } {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const [aday, adayYaz] = useState<Aday | null>(null);
  const pencere = aday ? (
    <PersonelFormu
      acik onDolu={iseGirisTaslagi(aday, pozisyonBul(o.depo, aday.jobId) ?? undefined, bugun())} kapat={() => { adayYaz(null); }}
      kaydedildi={(p) => {
        const a = adayBul(o.depo, aday.id) ?? aday;
        adayYaz(null);
        void (async () => {
          await komut.kaydet({ ...a, asama: ISE_ALINDI, empId: p.id, ...(p.iseGiris ? { iseAlimTarihi: p.iseGiris } : {}), teklifYanit: 'Kabul etti' });
          for (const g of o.depo.tur('intv').filter((x) => x.candId === a.id && x.durum === 'Planlandı')) await komut.kaydet({ ...g, durum: 'İptal' });
          bildir('tamam', 'Aday personele dönüştürüldü.');
          o.git('calisan', p.id);
        })().catch(() => { bildir('hata', 'Personel kaydedildi ama aday güncellenemedi; aday dosyasından aşamayı güncelleyin.'); });
      }}
    />
  ) : null;
  return { baslat: adayYaz, pencere };
}
