import { useMemo, useState, type ReactNode } from 'react';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { CubukListesiKarti, Girdi, Rozet, SayiKarti, Secim, Sekmeler, Tablo, type Sutun, type TabloAraci } from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari, type SayfaKomutu } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { adSoyad, tarih, YOK } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import type { Devam } from '../tipler.ts';
import { DevamFormu } from './DevamFormu.tsx';
import { aktifPersonel, listeler, mesaiSiniriAyari } from './hesap.ts';
import { devamlariSuz, devamOzeti, mesaiSiniri, sayi, sayiYaz, yillikFazlaMesai } from './kurallar.ts';
import { AyYilSecici, Baslik } from './parcalar.tsx';
import { Puantaj } from './Puantaj.tsx';
import './izin-devam.css';

export type DevamSekmesi = 'kayitlar' | 'puantaj';
export const DEVAM_SEKMELERI = [{ anahtar: 'kayitlar', baslik: 'Kayıtlar' }, { anahtar: 'puantaj', baslik: 'Puantaj' }] as const;

// Devam ve mesai: aylik kayitlar ve toplamlar; Puantaj sekmesi gunluk giris-cikis matrisidir.
export function DevamVeMesai(o: IkEkranOzellikleri) {
  const bugun = tesisGunu(Date.now());
  const [sekme, sekmeYaz] = useState<DevamSekmesi>('kayitlar');
  const [ay, ayYaz] = useState(bugun.slice(0, 7));
  const sekmeler = <Sekmeler etiket="Görünüm" sekmeler={DEVAM_SEKMELERI} secili={sekme} sec={sekmeYaz} />;
  return sekme === 'puantaj'
    ? <Puantaj o={o} ay={ay} ayYaz={ayYaz} bugun={bugun} sekmeler={sekmeler} />
    : <Kayitlar o={o} ay={ay} ayYaz={ayYaz} bugun={bugun} sekmeler={sekmeler} sekmeYaz={sekmeYaz} />;
}

function Kayitlar({ o, ay, ayYaz, bugun, sekmeler, sekmeYaz }: { o: IkEkranOzellikleri; ay: string; ayYaz: (ay: string) => void; bugun: string; sekmeler: ReactNode; sekmeYaz: (s: DevamSekmesi) => void }) {
  const l = listeler();
  const [suzgec, suzgecYaz] = useState({ ara: '', tur: '' });
  const [yeni, yeniYaz] = useState(false);
  const kayitlar = o.depo.tur('att');
  const personeller = o.depo.tur('emp');
  const ad = (id: string | undefined) => { const p = personeller.find((x) => x.id === id); return p ? adSoyad(p) : ''; };
  const satirlar = useMemo(() => devamlariSuz(kayitlar, ay, suzgec, ad), [kayitlar, ay, suzgec, personeller]);
  const ozet = devamOzeti(kayitlar, ay);
  const yil = ay.slice(0, 4);
  const sinir = mesaiSiniri(o.motor ? mesaiSiniriAyari(o.motor) : null);
  const yillik = o.motor ? yillikFazlaMesai(kayitlar, aktifPersonel(o.motor), yil, sinir) : undefined;

  const komutlar: SayfaKomutu[] = [
    ...(o.yetki.devamYaz ? [{ anahtar: 'yeni', baslik: 'Devam kaydı ekle', simge: 'plus' as const, aciklama: null, sozcukler: ['devam', 'mesai', 'fazla', 'kayıt'], calistir: () => { yeniYaz(true); } }] : []),
    { anahtar: 'puantaj', baslik: 'Puantajı aç', simge: 'clock', aciklama: null, sozcukler: ['puantaj', 'giriş', 'çıkış'], calistir: () => { sekmeYaz('puantaj'); } },
  ];
  useSayfaKomutlari('ik-devam', komutlar);

  return (
    <section className="tc-iki">
      <Baslik
        baslik="Devam ve mesai" simge="clock" alt="Fazla mesai, tatil çalışması, geç kalma ve devamsızlık kayıtları. Mesai saatleri bordro hesabına otomatik aktarılır."
        dugmeler={[
          { anahtar: 'hesap', etiket: 'Mesai ücreti hesapla', simge: 'ruler', yap: () => { o.git('hesap'); } },
          ...(o.yetki.devamYaz ? [{ anahtar: 'yeni', etiket: 'Kayıt ekle', simge: 'plus' as const, birincil: true, yap: () => { yeniYaz(true); } }] : []),
        ]}
      />
      <div className="tc-iki-arac tc-iki-arac-satir">
        {sekmeler}
        <AyYilSecici ay={ay} degistir={ayYaz} bugun={bugun} />
        <Girdi etiket="Çalışan ara" type="search" placeholder="Çalışan ara" className="tc-iki-ara" value={suzgec.ara} onChange={(e) => { suzgecYaz({ ...suzgec, ara: e.target.value }); }} />
        <Secim etiket="Kayıt türü" bosSecenek="Tüm türler" secenekler={(l?.devamTurleri ?? []).map((t) => ({ deger: t, baslik: t }))} value={suzgec.tur} onChange={(e) => { suzgecYaz({ ...suzgec, tur: e.target.value }); }} />
      </div>
      <div className="tc-iki-sayilar" data-adet="4">
        <SayiKarti baslik="Fazla mesai (saat)" simge="clock" sayi={ozet.fazlaSaat} />
        <SayiKarti baslik="Resmî tatil çalışması (saat)" simge="flag" sayi={ozet.resmiTatilSaat} />
        <SayiKarti baslik="Geç kalma" simge="alert" sayi={ozet.gecKalma} />
        <SayiKarti baslik="Devamsızlık" simge="x" sayi={ozet.devamsizGun} />
      </div>
      <div className="tc-iki-ikili">
        <DevamListesi o={o} kayitlar={satirlar} />
        <CubukListesiKarti
          baslik={`${yil} yıllık fazla mesai`} simge="chart" birim="sa" enUst={sinir} bosMetin="Bu yıl fazla mesai kaydı yok."
          satirlar={yillik?.map((x) => ({ etiket: adSoyad(x.personel), deger: x.saat, ton: x.ton ?? undefined }))}
          altMetin={`Yıllık sınır ${sinir} saat. Turuncu çubuklar sınırın %85'ini, kırmızılar sınırı aşanları gösterir.`}
        />
      </div>
      <DevamFormu o={o} acik={yeni} kayit={null} onDolu={{}} kapat={() => { yeniYaz(false); }} />
    </section>
  );
}

const OnayCipi = ({ onay }: { onay: string | undefined }) => (onay === 'Beklemede' ? <Rozet ton="uyari">Beklemede</Rozet> : <Rozet ton="tamam">Onaylandı</Rozet>);

// Bu sayfanin kayit listesi bugunku gibi iki sutunlu duzenin solunda, dar alanda da tablo olarak kalir (yatay kayar);
// ortak tablo dar alanda kart kipine gectigi icin burada kullanilmaz.
function DevamListesi({ o, kayitlar }: { o: IkEkranOzellikleri; kayitlar: readonly Devam[] }) {
  const [duzenle, duzenleYaz] = useState<Devam | null>(null);
  const personel = (id: string | undefined) => o.depo.tur('emp').find((p) => p.id === id) ?? null;
  const sec = o.yetki.devamYaz ? (a: Devam) => { duzenleYaz(a); } : null;
  return (
    <div className="tc-iki-liste">
      {kayitlar.length === 0 ? <p className="tc-iki-not">Kayıt yok.</p> : (
        <table className="tc-iki-tablo">
          <caption className="tc-iki-gizli">Devam ve mesai kayıtları</caption>
          <thead><tr><th scope="col">Çalışan</th><th scope="col">Tarih</th><th scope="col">Tür</th><th scope="col" data-sag="">Saat</th><th scope="col">Onay</th><th scope="col">Açıklama</th></tr></thead>
          <tbody>
            {kayitlar.map((a) => {
              const p = personel(a.empId);
              return (
                <tr key={a.id} data-secilir={sec ? '' : undefined} tabIndex={sec ? 0 : undefined}
                  onClick={sec ? () => { sec(a); } : undefined} onKeyDown={sec ? (e) => { if (e.key === 'Enter') sec(a); } : undefined}>
                  <td>{p ? <KisiHucresi personel={p} alt={p.pozisyon} /> : YOK}</td>
                  <td className="tc-iki-kirilmaz">{tarih(a.tarih)}</td>
                  <td>{a.tur ?? YOK}</td>
                  <td data-sag="">{a.saat === undefined ? YOK : sayiYaz(sayi(a.saat))}</td>
                  <td><OnayCipi onay={a.onay} /></td>
                  <td className="tc-ik-uzun-metin">{a.aciklama ?? ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <DevamFormu o={o} acik={duzenle !== null} kayit={duzenle} onDolu={{}} kapat={() => { duzenleYaz(null); }} />
    </div>
  );
}

export interface DevamTablosuOzellikleri { o: IkEkranOzellikleri; kayitlar: readonly Devam[]; kisiSutunu: boolean; arac?: TabloAraci<Devam> }

// Devam ve mesai kayitlari (bu sayfa ve kisi sayfasi): satir duzenlemeyi acar.
export function DevamTablosu({ o, kayitlar, kisiSutunu, arac }: DevamTablosuOzellikleri) {
  const [duzenle, duzenleYaz] = useState<Devam | null>(null);
  const personel = (id: string | undefined) => o.depo.tur('emp').find((p) => p.id === id) ?? null;
  const sutunlar: Sutun<Devam>[] = [
    ...(kisiSutunu ? [{
      anahtar: 'kisi', baslik: 'Çalışan',
      hucre: (a: Devam) => { const p = personel(a.empId); return p ? <KisiHucresi personel={p} alt={p.pozisyon} /> : '—'; },
      csv: (a: Devam) => { const p = personel(a.empId); return p ? adSoyad(p) : ''; },
    }] : []),
    { anahtar: 'tarih', baslik: 'Tarih', kirilmaz: true, hucre: (a) => tarih(a.tarih) },
    { anahtar: 'tur', baslik: 'Tür', hucre: (a) => a.tur ?? '—' },
    { anahtar: 'saat', baslik: 'Saat', hizala: 'sag', hucre: (a) => (a.saat === undefined ? YOK : sayiYaz(sayi(a.saat))), csv: (a) => (a.saat === undefined ? null : sayi(a.saat)) },
    { anahtar: 'onay', baslik: 'Onay', hucre: (a) => <OnayCipi onay={a.onay} />, csv: (a) => a.onay ?? 'Onaylandı' },
    { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (a) => <span className="tc-ik-uzun-metin">{a.aciklama ?? ''}</span> },
  ];
  return (
    <>
      <Tablo etiket="Devam ve mesai kayıtları" sutunlar={sutunlar} satirlar={kayitlar} satirAnahtari={(a) => a.id} bosMesaj="Kayıt yok." arac={arac}
        satirSec={o.yetki.devamYaz ? (a) => { duzenleYaz(a); } : undefined} />
      <DevamFormu o={o} acik={duzenle !== null} kayit={duzenle} onDolu={{}} kapat={() => { duzenleYaz(null); }} />
    </>
  );
}
