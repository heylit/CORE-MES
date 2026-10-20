import { useId, useState, type FormEvent, type ReactNode } from 'react';
import type {
  AletAyrintiCevabi, AletGuncelleGovdesi, AletOlusturGovdesi, KalibrasyonGovdesi, KullanimDisiGovdesi, Sonuc, Tur, TurGuncelleGovdesi, TurListesiCevabi,
} from '#paylasilan/sozlesme/kalibrasyon.ts';
import { CokSatir, Dugme, Girdi, IsaretKutusu, Pencere, Secim } from '../../ortak/arayuz/index.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useKomut } from './komut.ts';
import { SONUC_METNI } from './gosterim.ts';

const SONUC_SECENEKLERI = (['uygun', 'uygunsuz'] as const).map((s) => ({ deger: s, baslik: SONUC_METNI[s] }));

interface KalibrasyonDegeri {
  sonuc: Sonuc;
  tarih: string;
  sertifikaNo: string;
  aciklama: string;
}

const BOS_KALIBRASYON: KalibrasyonDegeri = { sonuc: 'uygun', tarih: '', sertifikaNo: '', aciklama: '' };

// Boş tarih "bugün" demektir; sunucu yazar.
const kalibrasyonGovdesi = (d: KalibrasyonDegeri): KalibrasyonGovdesi => ({
  sonuc: d.sonuc,
  ...(d.tarih === '' ? {} : { tarih: d.tarih }),
  sertifikaNo: d.sertifikaNo,
  aciklama: d.aciklama,
});

function KalibrasyonAlanlari({ deger, degistir }: { deger: KalibrasyonDegeri; degistir: (d: KalibrasyonDegeri) => void }) {
  return (
    <>
      <Secim
        etiket="Sonuç" required value={deger.sonuc} secenekler={SONUC_SECENEKLERI}
        onChange={(e) => degistir({ ...deger, sonuc: e.target.value as Sonuc })}
        ipucu={deger.sonuc === 'uygunsuz' ? 'Uygunsuz sonuç aleti kullanım dışı bırakır.' : undefined}
      />
      <Girdi etiket="Tarih" type="date" value={deger.tarih} ipucu="Boşsa bugün yazılır; ileri tarih girilmez." onChange={(e) => degistir({ ...deger, tarih: e.target.value })} />
      <Girdi etiket="Sertifika no" value={deger.sertifikaNo} maxLength={80} onChange={(e) => degistir({ ...deger, sertifikaNo: e.target.value })} />
      <div className="tc-form-tam">
        <CokSatir etiket="Açıklama" value={deger.aciklama} maxLength={500} onChange={(e) => degistir({ ...deger, aciklama: e.target.value })} />
      </div>
    </>
  );
}

interface FormKabugu {
  baslik: string;
  kapat: () => void;
  gonder: () => void;
  yukleniyor: boolean;
  hata: string | null;
  onayMetni: string;
  children: ReactNode;
}

function FormKabugu({ baslik, kapat, gonder, yukleniyor, hata, onayMetni, children }: FormKabugu) {
  const kimlik = useId();
  const ilet = (o: FormEvent) => { o.preventDefault(); gonder(); };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={baslik}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={yukleniyor}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={yukleniyor}>{onayMetni}</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        {children}
        {hata !== null && <p className="tc-form-tam tc-kal-hata" role="alert">{hata}</p>}
      </form>
    </Pencere>
  );
}

export function KalibrasyonFormu({ aletId, aletNo, kapat }: { aletId: number; aletNo: string; kapat: () => void }) {
  const [deger, degerYaz] = useState(BOS_KALIBRASYON);
  // Kimlik form açılınca bir kez üretilir: aynı formdan giden her gönderim tek kayıttır.
  const [istekKimligi] = useState(yeniIstekKimligi);
  const komut = useKomut<AletAyrintiCevabi>(`/olcu-aletleri/${aletId}/kalibrasyon-kaydet`, kapat, 'Kayıt eklenemedi', istekKimligi);
  return (
    <FormKabugu baslik={`Kalibrasyon kaydet: ${aletNo}`} kapat={kapat} gonder={() => { komut.gonder(kalibrasyonGovdesi(deger)); }} yukleniyor={komut.yukleniyor} hata={komut.hata} onayMetni="Kaydet">
      <KalibrasyonAlanlari deger={deger} degistir={degerYaz} />
    </FormKabugu>
  );
}

export function KullanimDisiFormu({ aletId, aletNo, kapat }: { aletId: number; aletNo: string; kapat: () => void }) {
  const [neden, nedenYaz] = useState('');
  const komut = useKomut<AletAyrintiCevabi>(`/olcu-aletleri/${aletId}/kullanim-disi`, kapat, 'Alet kullanım dışı bırakılamadı');
  return (
    <FormKabugu baslik={`Kullanım dışı bırak: ${aletNo}`} kapat={kapat} gonder={() => { komut.gonder({ neden } satisfies KullanimDisiGovdesi); }} yukleniyor={komut.yukleniyor} hata={komut.hata} onayMetni="Kullanım dışı bırak">
      <div className="tc-form-tam">
        <CokSatir
          etiket="Neden" required value={neden} maxLength={300}
          ipucu="Alet yalnız yeni bir uygun kalibrasyon kaydıyla kullanıma döner."
          onChange={(e) => nedenYaz(e.target.value)}
        />
      </div>
    </FormKabugu>
  );
}

export interface AletDuzenlemesi {
  id: number;
  no: string;
  turId: number;
  ad: string | null;
  olcmeAraligi: string | null;
  yer: string | null;
  periyotGun: number;
  surum: number;
}

export function AletFormu({ alet, turler, kapat }: { alet: AletDuzenlemesi | null; turler: readonly Tur[]; kapat: () => void }) {
  const [no, noYaz] = useState(alet?.no ?? '');
  const [turId, turYaz] = useState(alet === null ? '' : String(alet.turId));
  const [ad, adYaz] = useState(alet?.ad ?? '');
  const [aralik, aralikYaz] = useState(alet?.olcmeAraligi ?? '');
  const [yer, yerYaz] = useState(alet?.yer ?? '');
  const [periyot, periyotYaz] = useState(String(alet?.periyotGun ?? 365));
  const [ilkVar, ilkVarYaz] = useState(false);
  const [ilk, ilkYaz] = useState(BOS_KALIBRASYON);
  const komut = useKomut<AletAyrintiCevabi>(
    alet === null ? '/olcu-aletleri' : `/olcu-aletleri/${alet.id}/guncelle`, kapat, 'Alet kaydedilemedi',
  );

  // Pasif tür yalnız aletin kendi türüyse listede kalır: yeni seçim yapılamaz, mevcut atama bozulmaz.
  const secenekler = turler.filter((t) => t.aktif || t.id === alet?.turId).map((t) => ({ deger: String(t.id), baslik: t.ad }));

  const gonder = () => {
    const alanlar = { no, turId: Number(turId), ad, olcmeAraligi: aralik, yer, periyotGun: Number(periyot) };
    if (alet !== null) {
      komut.gonder({ ...alanlar, surum: alet.surum } satisfies AletGuncelleGovdesi);
      return;
    }
    komut.gonder({ ...alanlar, ...(ilkVar ? { ilkKalibrasyon: kalibrasyonGovdesi(ilk) } : {}) } satisfies AletOlusturGovdesi);
  };

  return (
    <FormKabugu baslik={alet === null ? 'Alet ekle' : `Aleti düzenle: ${alet.no}`} kapat={kapat} gonder={gonder} yukleniyor={komut.yukleniyor} hata={komut.hata} onayMetni="Kaydet">
      <Girdi etiket="Alet no" required value={no} maxLength={60} onChange={(e) => noYaz(e.target.value)} />
      <Secim etiket="Tür" required bosSecenek="Seçiniz" value={turId} secenekler={secenekler} onChange={(e) => turYaz(e.target.value)} />
      <Girdi etiket="Ad" value={ad} maxLength={120} onChange={(e) => adYaz(e.target.value)} />
      <Girdi etiket="Ölçme aralığı / çözünürlük" value={aralik} maxLength={120} onChange={(e) => aralikYaz(e.target.value)} />
      <Girdi etiket="Yer / zimmet" value={yer} maxLength={120} onChange={(e) => yerYaz(e.target.value)} />
      <Girdi etiket="Kalibrasyon periyodu (gün)" required type="number" inputMode="numeric" min={1} value={periyot} onChange={(e) => periyotYaz(e.target.value)} />
      {alet === null && (
        <div className="tc-form-tam">
          <IsaretKutusu etiket="İlk kalibrasyon kaydını da ekle" checked={ilkVar} onChange={(e) => ilkVarYaz(e.target.checked)} />
        </div>
      )}
      {alet === null && ilkVar && <KalibrasyonAlanlari deger={ilk} degistir={ilkYaz} />}
    </FormKabugu>
  );
}

export function TurFormu({ tur, kapat }: { tur: Tur | null; kapat: () => void }) {
  const [ad, adYaz] = useState(tur?.ad ?? '');
  const [aktif, aktifYaz] = useState(tur?.aktif ?? true);
  const komut = useKomut<TurListesiCevabi>(tur === null ? '/olcu-aleti-turleri' : `/olcu-aleti-turleri/${tur.id}/guncelle`, kapat, 'Tür kaydedilemedi');
  const gonder = () => { komut.gonder(tur === null ? { ad } : ({ ad, aktif, surum: tur.surum } satisfies TurGuncelleGovdesi)); };
  return (
    <FormKabugu baslik={tur === null ? 'Tür ekle' : 'Türü düzenle'} kapat={kapat} gonder={gonder} yukleniyor={komut.yukleniyor} hata={komut.hata} onayMetni="Kaydet">
      <div className="tc-form-tam">
        <Girdi etiket="Tür adı" required value={ad} maxLength={80} onChange={(e) => adYaz(e.target.value)} />
      </div>
      {tur !== null && (
        <div className="tc-form-tam">
          <IsaretKutusu etiket="Yeni aletlerde seçilebilir" checked={aktif} onChange={(e) => aktifYaz(e.target.checked)} />
        </div>
      )}
    </FormKabugu>
  );
}
