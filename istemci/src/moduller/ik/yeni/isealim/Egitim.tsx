import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SayfaBasligi, SayiKarti, Secim, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { adSoyad, kisaTarih, paraKisa } from '../bicim.ts';
import { gorunumAdresi, type IkEkranOzellikleri } from '../gorunumler.ts';
import type { Egitim as EgitimKaydi } from '../tipler.ts';
import { KayitFormu } from './formlar.tsx';
import { EGITIM_DURUMLARI, egitimGostergeleri, egitimSuz, isgEksikler, sertifikaDurumu } from './kurallar.ts';
import { Bolum, MotorlaCiz, Not, TonluRozet, bugun, secenekler, type Hazirlik } from './ortak.tsx';

type Form = { kayit: EgitimKaydi | null } | null;

export function EgitimEkrani(o: IkEkranOzellikleri) {
  return <MotorlaCiz motor={o.motor}>{(h) => <Govde o={o} h={h} />}</MotorlaCiz>;
}

function SertifikaHucresi({ e, gun }: { e: EgitimKaydi; gun: string }) {
  const d = sertifikaDurumu(e.gecerlilik, gun);
  if (d === null) return <>—</>;
  if (d.tur === 'doldu') return <TonluRozet ton="bad">Süresi doldu</TonluRozet>;
  if (d.tur === 'yaklasiyor') return <TonluRozet ton="warn">{kisaTarih(d.tarih)}</TonluRozet>;
  return <>{kisaTarih(d.tarih)}</>;
}

const durumTonu = (d: string | undefined) => (d === 'Tamamlandı' ? 'ok' : d === 'İptal' ? null : 'info');

function Govde({ o, h }: { o: IkEkranOzellikleri; h: Hazirlik }) {
  const { depo, yetki } = o;
  const gun = bugun();
  const yil = gun.slice(0, 4);
  const [suzgec, suzgecYaz] = useState({ tur: '', durum: '', arama: '' });
  const [form, formYaz] = useState<Form>(null);
  const tumu = depo.tur('train');
  const liste = useMemo(() => egitimSuz(tumu, suzgec), [tumu, suzgec]);
  const aktifler = h.m.aktifler();
  const g = egitimGostergeleri(tumu, yil, aktifler.length);
  const eksik = isgEksikler(tumu, aktifler, gun);
  const duzenle = yetki.egitimYaz ? (e: EgitimKaydi) => { formYaz({ kayit: e }); } : undefined;

  useSayfaKomutlari('ik-egitim', [
    ...(yetki.egitimYaz ? [{ anahtar: 'yeni', baslik: 'Eğitim ekle', simge: 'plus' as const, aciklama: null, sozcukler: ['eğitim', 'yeni', 'isg'], calistir: () => { formYaz({ kayit: null }); } }] : []),
    ...(duzenle ? tumu : []).slice(0, 200).map((e) => ({
      anahtar: e.id, baslik: e.ad ?? 'Eğitim', simge: 'book' as const, aciklama: e.kurum ?? null, sozcukler: [e.ad ?? '', e.kurum ?? '', e.tur ?? ''],
      calistir: () => { formYaz({ kayit: e }); },
    })),
  ]);

  const sutunlar: Sutun<EgitimKaydi>[] = [
    { anahtar: 'ad', baslik: 'Eğitim', hucre: (e) => <span className="tc-ika-iki"><b>{e.ad ?? '—'}</b>{e.kurum && <small>{e.kurum}</small>}</span>, csv: (e) => e.ad ?? null },
    { anahtar: 'tur', baslik: 'Tür', hucre: (e) => e.tur ?? '' },
    { anahtar: 'tarih', baslik: 'Tarih', kirilmaz: true, hucre: (e) => kisaTarih(e.tarih), csv: (e) => e.tarih ?? null },
    { anahtar: 'sure', baslik: 'Süre', hizala: 'sag', hucre: (e) => (e.sure ? `${e.sure.toLocaleString('tr-TR')} sa` : '—'), csv: (e) => e.sure ?? null },
    { anahtar: 'katilimci', baslik: 'Katılımcı', hizala: 'sag', hucre: (e) => (e.katilimcilar ?? []).length },
    { anahtar: 'maliyet', baslik: 'Maliyet', hizala: 'sag', hucre: (e) => (e.maliyet ? paraKisa(e.maliyet) : '—'), csv: (e) => e.maliyet ?? null },
    { anahtar: 'sertifika', baslik: 'Sertifika', hucre: (e) => <SertifikaHucresi e={e} gun={gun} />, csv: (e) => e.gecerlilik ?? null },
    { anahtar: 'durum', baslik: 'Durum', hucre: (e) => <TonluRozet ton={durumTonu(e.durum)}>{e.durum ?? '—'}</TonluRozet>, csv: (e) => e.durum ?? null },
  ];

  return (
    <div className="tc-ika">
      <SayfaBasligi
        baslik="Eğitim" simge="book"
        alt="Zorunlu İSG eğitimleri, teknik ve kişisel gelişim programları, sertifika geçerlilikleri."
        {...(yetki.egitimYaz ? { birincil: { etiket: 'Eğitim ekle', simge: 'plus' as const, yap: () => { formYaz({ kayit: null }); } } } : {})}
      />
      <div className="tc-ika-sayilar">
        <SayiKarti baslik={`${yil} tamamlanan eğitim`} simge="check" sayi={g.tamamlanan} />
        <SayiKarti baslik="Toplam katılım saati" simge="clock" sayi={g.katilimSaati} />
        <SayiKarti baslik="Kişi başı eğitim saati" simge="user" sayi={g.kisiBasiSaat} />
        <SayiKarti baslik="Eğitim harcaması" simge="lira" metin={paraKisa(g.harcama)} />
      </div>
      <Tablo
        etiket="Eğitimler" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(e) => e.id} bosMesaj="Eğitim kaydı yok."
        {...(duzenle ? { satirSec: duzenle } : {})}
        arac={{
          arama: { deger: suzgec.arama, degistir: (v) => { suzgecYaz({ ...suzgec, arama: v }); }, etiket: 'Eğitim ara', yerTutucu: 'Eğitim ara' },
          csv: { ad: 'egitimler' },
          sag: (
            <span className="tc-ika-suzgecler">
              <Secim etiket="Tür" value={suzgec.tur} bosSecenek="Tüm türler" secenekler={secenekler(h.s.TRAIN_TYPES)} onChange={(e) => { suzgecYaz({ ...suzgec, tur: e.target.value }); }} />
              <Secim etiket="Durum" value={suzgec.durum} bosSecenek="Tüm durumlar" secenekler={secenekler(EGITIM_DURUMLARI)} onChange={(e) => { suzgecYaz({ ...suzgec, durum: e.target.value }); }} />
            </span>
          ),
        }}
      />
      <Bolum baslik={`Geçerli İSG eğitimi olmayan çalışanlar (${eksik.length})`}>
        {eksik.length
          ? <p className="tc-ika-cipler">{eksik.map((e) => <Link key={e.id} className="tc-ika-cip" to={gorunumAdresi('calisan', e.id)}>{adSoyad(e)}</Link>)}</p>
          : <Not>Tüm aktif çalışanların geçerli İSG eğitimi kaydı var.</Not>}
        <Not>“İSG (zorunlu)” türünde, tamamlanmış ve sertifika süresi dolmamış eğitimlere katılım esas alınır.</Not>
      </Bolum>
      <KayitFormu
        acik={form !== null} kapat={() => { formYaz(null); }} tur="train" kayit={form?.kayit ?? null}
        baslik={form?.kayit ? `${form.kayit.ad ?? 'Eğitim'}: düzenle` : 'Eğitim ekle'} depo={depo} m={h.m} s={h.s}
      />
    </div>
  );
}
