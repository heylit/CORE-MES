import { useState } from 'react';
import {
  DurumKutusu, Kart, Rozet, SayfaBasligi, SayiKarti, Tablo, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import type { Devam, Izin, Personel } from '../tipler.ts';
import { useIkPuantaj } from '../veri.ts';
import type { IkMotoru } from '../motor.ts';
import {
  aydaCalisiyor, ayinGunleri, DEVAM_KISA, dakikaSaat, IZIN_BEKLIYOR, mesaiOzeti, metindenGun, PUANTAJ_DURUM_ADI, puantajHucresi, puantajToplami, saatVar, sayi, sayiMetni,
} from './kurallar.ts';
import {
  AyYilSecici, BagliDegil, bugun, isGunuMu, Not,
} from './parcalar.tsx';

const GUN_ADLARI = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const FAZLA_DEVAM = ['Fazla mesai', 'Hafta tatili çalışması', 'Resmi tatil çalışması'];

// Kişinin ay takvimi, salt okunur (TmiKisiTakvim(a, ro, ayYok)): ay seçimi sayfanındır.
function PuantajTakvimi({ personel, ay, devamlar, izinler, motor }: {
  personel: Personel; ay: string; devamlar: readonly Devam[]; izinler: readonly Izin[]; motor: IkMotoru | null;
}) {
  const puantaj = useIkPuantaj(ay, personel.id);
  if (!aydaCalisiyor(personel, ay)) return <p className="tc-ikm-soluk">Bu ay çalışma dönemi dışında.</p>;
  if (puantaj.error) return <DurumKutusu durum="hata" mesaj="Puantaj yüklenemedi" />;
  if (!puantaj.data) return <p className="tc-ikm-soluk">Puantaj yükleniyor…</p>;
  const v = puantaj.data;
  const k = v.kisiler.find((x) => x.personel === personel.id) ?? null;
  const gunler = v.gunler.length ? v.gunler : ayinGunleri(ay);
  const ilk = metindenGun(gunler[0]);
  const bos = ilk ? (ilk.getDay() + 6) % 7 : 0;
  const t = bugun();
  const isGunu = motor ? (d: Date) => isGunuMu(motor, d) : null;
  const top = puantajToplami(k, personel.id, ay, devamlar);
  return (
    <>
      <div className="tc-ikm-takvim" role="grid" aria-label={`${ay} puantaj takvimi`}>
        <div role="row" className="tc-ikm-takvim-satir">
          {GUN_ADLARI.map((g) => <div key={g} role="columnheader" className="tc-ikm-gun tc-ikm-gun-bas">{g}</div>)}
          {Array.from({ length: bos }, (_, i) => <div key={`b${i}`} className="tc-ikm-gun tc-ikm-gun-bos" aria-hidden="true" />)}
          {gunler.map((g) => {
            const h = puantajHucresi(k, personel.id, g, devamlar, izinler, t, isGunu);
            const r = h.kayit;
            const fazlaDevam = h.devam.some((x) => FAZLA_DEVAM.includes(x.tur ?? ''));
            return (
              <div
                key={g} role="gridcell" className="tc-ikm-gun" title={h.aciklama || undefined}
                data-sinif={h.siniflar.join(' ') || undefined} data-bugun={g === t ? '' : undefined}
              >
                <small>{Number(g.slice(8))}</small>
                {r?.durum === 'calisti' && (
                  <>
                    <span className="mono">{r.giris}–{r.cikis || '…'}</span>
                    {r.cikis && <b className="mono">{sayiMetni(dakikaSaat(r.calismaDakika) ?? 0)} sa</b>}
                    {(r.fazlaDakika ?? 0) > 0 && !fazlaDevam && <em className="mono">+{sayiMetni(dakikaSaat(r.fazlaDakika) ?? 0)}</em>}
                  </>
                )}
                {r && r.durum !== 'calisti' && <span>{PUANTAJ_DURUM_ADI[r.durum]}</span>}
                {!r && h.isaret && !h.devam.length && <span className="tc-ikm-soluk">{h.aciklama}</span>}
                {h.devam.map((x) => (
                  <em key={x.id} className="mono">{DEVAM_KISA[x.tur ?? ''] ?? x.tur}{saatVar(x) ? ` ${sayiMetni(sayi(x.saat))}` : ''}</em>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <p className="tc-ikm-kucuk">
        Çalışılan {sayiMetni(dakikaSaat(top.calismaDakika) ?? 0)} sa · Fazla {sayiMetni(dakikaSaat(top.fazlaDakika) ?? 0)} sa · İzin {top.izinGun} gün · Devamsız {top.devamsizGun} gün
        {k?.kilitli ? ' · Bordro kesinleşti' : ''}
      </p>
    </>
  );
}

// Mesailerim (v3 TmiMesailerim, IK-30..IK-34): yalnız görme; kayıtları İK girer, satır tıklanmaz.
export function Mesailerim(o: IkEkranOzellikleri) {
  const [ay, ayYaz] = useState(() => bugun().slice(0, 7));
  const e = o.ben;
  if (!e) return <BagliDegil baslik="Mesailerim" simge="clock" />;
  const devamlar = o.depo.tur('att');
  const oz = mesaiOzeti(devamlar, e.id, ay, (o.depo.ayarlar as Record<string, unknown>).yillikMesaiLimit);
  const sutunlar: Sutun<Devam>[] = [
    { anahtar: 'tarih', baslik: 'Tarih', hucre: (d) => tarih(d.tarih), kirilmaz: true },
    { anahtar: 'tur', baslik: 'Tür', hucre: (d) => d.tur },
    { anahtar: 'saat', baslik: 'Saat', hucre: (d) => (saatVar(d) ? sayiMetni(sayi(d.saat)) : '—'), hizala: 'sag', mono: true },
    {
      anahtar: 'onay', baslik: 'Onay', csv: (d) => d.onay ?? '',
      hucre: (d) => (d.onay === IZIN_BEKLIYOR ? <Rozet ton="uyari">Beklemede</Rozet> : <Rozet ton="tamam">Onaylandı</Rozet>),
    },
    { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (d) => d.aciklama ?? '' },
  ];
  return (
    <>
      <SayfaBasligi
        baslik="Mesailerim" simge="clock"
        alt="Devam ve fazla mesai kayıtlarınız. Kayıtları insan kaynakları girer; bir yanlışlık görürseniz İK birimine bildirin."
      />
      <div className="tc-ikm-arac"><AyYilSecici ay={ay} degistir={ayYaz} /></div>
      <div className="tc-ikm-sayilar">
        <SayiKarti baslik="Fazla mesai (saat)" simge="clock" sayi={oz.fazla} />
        <SayiKarti baslik="Resmî tatil çalışması (saat)" simge="flag" sayi={oz.resmiTatil} />
        <SayiKarti baslik="Devamsızlık (gün)" simge="alert" sayi={oz.devamsizGun} />
        <SayiKarti
          baslik={`${oz.yil} fazla mesai`} simge="gauge" metin={`${sayiMetni(oz.yilFazla)} / ${sayiMetni(oz.sinir)}`} altMetin={`Sınıra kalan ${sayiMetni(oz.kalan)} saat`}
          ton={oz.ton === 'hata' ? 'hata' : oz.ton === 'uyari' ? 'uyari' : 'bilgi'}
        />
      </div>
      <Kart baslik="Puantaj takvimi">
        <PuantajTakvimi personel={e} ay={ay} devamlar={devamlar} izinler={o.depo.tur('leave')} motor={o.motor} />
      </Kart>
      <Tablo
        etiket="Devam ve mesai kayıtlarım" sutunlar={sutunlar} satirlar={oz.kayitlar} satirAnahtari={(d) => d.id}
        bosMesaj="Bu ay kaydınız yok. Fazla mesai, tatil çalışması ve devamsızlık kayıtlarınız insan kaynakları girdikçe burada görünür."
      />
      <Not>
        Onay bekleyen kayıtlar da bordro hesabına girer; bordro kesinleşmeden önce insan kaynakları düzeltebilir. Yıllık fazla mesai
        sınırı {sayiMetni(oz.sinir)} saattir (4857 sayılı İş Kanunu md. 41).
      </Not>
    </>
  );
}
