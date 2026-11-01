import { useMemo, useState } from 'react';
import { Rozet, SayiKarti, Secim, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { adSoyad, paraKisa, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ikSabitleri } from '../motor.ts';
import type { Egitim as EgitimKaydi } from '../tipler.ts';
import { EgitimFormu } from './formlar.tsx';
import { EGITIM_DURUMLARI, egitimleriSuz, egitimOzeti, isgEksikleri, sayi, sayiMetni, sertifikaDurumu } from './kurallar.ts';
import { aktifMi, Baslik, Bolum, bugun, Not } from './parcalar.tsx';

// Eğitim: zorunlu İSG, teknik ve kişisel gelişim programları, sertifika geçerlilikleri.
export function EgitimSayfasi(o: IkEkranOzellikleri) {
  const { depo, yetki, git } = o;
  const gun = bugun();
  const yil = gun.slice(0, 4);
  const [suzgec, suzgecYaz] = useState({ ara: '', tur: '', durum: '' });
  const [form, formYaz] = useState<{ kayit: EgitimKaydi | null } | null>(null);
  const tumu = depo.tur('train');
  const aktifler = depo.tur('emp').filter((p) => aktifMi(p, gun));
  const liste = useMemo(() => egitimleriSuz(tumu, suzgec), [tumu, suzgec]);
  const ozet = egitimOzeti(tumu, yil, aktifler.length);
  const eksik = isgEksikleri(tumu, aktifler, gun);
  const turler = ikSabitleri()?.TRAIN_TYPES ?? [];

  useSayfaKomutlari('ik-egitim', yetki.egitimYaz ? [{
    anahtar: 'ekle', baslik: 'Eğitim ekle', simge: 'plus', aciklama: null, sozcukler: ['eğitim', 'sertifika', 'isg'], calistir: () => { formYaz({ kayit: null }); },
  }] : null);

  const sertifika = (x: EgitimKaydi) => {
    const d = sertifikaDurumu(x.gecerlilik, gun);
    if (d === 'yok') return '—';
    if (d === 'doldu') return <Rozet ton="hata">Süresi doldu</Rozet>;
    if (d === 'yakin') return <Rozet ton="uyari">{tarih(x.gecerlilik)}</Rozet>;
    return tarih(x.gecerlilik);
  };
  const sutunlar: Sutun<EgitimKaydi>[] = [
    { anahtar: 'ad', baslik: 'Eğitim', hucre: (x) => <span className="tc-ika-iki-satir"><b>{x.ad ?? ''}</b><small>{x.kurum ?? ''}</small></span> },
    { anahtar: 'tur', baslik: 'Tür', hucre: (x) => x.tur ?? '' },
    { anahtar: 'tarih', baslik: 'Tarih', hucre: (x) => tarih(x.tarih) },
    { anahtar: 'sure', baslik: 'Süre', hizala: 'sag', hucre: (x) => (x.sure ? `${sayiMetni(sayi(x.sure))} sa` : '—') },
    { anahtar: 'kat', baslik: 'Katılımcı', hizala: 'sag', hucre: (x) => String((x.katilimcilar ?? []).length) },
    { anahtar: 'mal', baslik: 'Maliyet', hizala: 'sag', hucre: (x) => (x.maliyet ? paraKisa(x.maliyet) : '—') },
    { anahtar: 'ser', baslik: 'Sertifika', hucre: sertifika },
    { anahtar: 'durum', baslik: 'Durum', hucre: (x) => <Rozet ton={x.durum === 'Tamamlandı' ? 'tamam' : x.durum === 'İptal' ? 'pasif' : 'bilgi'}>{x.durum ?? ''}</Rozet> },
  ];

  return (
    <div className="tc-ika">
      <Baslik
        baslik="Eğitim" simge="lab" alt="Zorunlu İSG eğitimleri, teknik ve kişisel gelişim programları, sertifika geçerlilikleri."
        dugmeler={yetki.egitimYaz ? [{ anahtar: 'ekle', etiket: 'Eğitim ekle', simge: 'plus', birincil: true, yap: () => { formYaz({ kayit: null }); } }] : []}
      />
      <div className="tc-ika-sayilar">
        <SayiKarti baslik={`${yil} tamamlanan eğitim`} simge="check" sayi={ozet.tamamlanan} />
        <SayiKarti baslik="Toplam katılım saati" simge="clock" metin={sayiMetni(ozet.saat)} />
        <SayiKarti baslik="Kişi başı eğitim saati" simge="users" metin={sayiMetni(ozet.kisiBasi)} />
        <SayiKarti baslik="Eğitim harcaması" simge="lira" metin={paraKisa(ozet.harcama)} />
      </div>
      <Tablo<EgitimKaydi>
        etiket="Eğitimler" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(x) => x.id} bosMesaj="Eğitim kaydı yok."
        satirSec={yetki.egitimYaz ? (x) => { formYaz({ kayit: x }); } : undefined}
        arac={{
          arama: { deger: suzgec.ara, degistir: (ara) => { suzgecYaz({ ...suzgec, ara }); }, etiket: 'Eğitim ara', yerTutucu: 'Eğitim ara' },
          sag: (
            <span className="tc-ika-suzgecler">
              <Secim etiket="Tür" value={suzgec.tur} bosSecenek="Tüm türler" secenekler={turler.map((t) => ({ deger: t, baslik: t }))} onChange={(e) => { suzgecYaz({ ...suzgec, tur: e.target.value }); }} />
              <Secim etiket="Durum" value={suzgec.durum} bosSecenek="Tüm durumlar" secenekler={EGITIM_DURUMLARI.map((t) => ({ deger: t, baslik: t }))} onChange={(e) => { suzgecYaz({ ...suzgec, durum: e.target.value }); }} />
            </span>
          ),
        }}
      />
      <Bolum baslik={`Geçerli İSG eğitimi olmayan çalışanlar (${eksik.length})`}>
        {eksik.length ? (
          <p className="tc-ika-cipler">
            {eksik.map((p) => <button key={p.id} type="button" className="tc-ika-cip" onClick={() => { git('calisan', p.id); }}>{adSoyad(p)}</button>)}
          </p>
        ) : <p className="tc-ika-soluk">Tüm aktif çalışanların geçerli İSG eğitimi kaydı var.</p>}
        <Not>“İSG (zorunlu)” türünde, tamamlanmış ve sertifika süresi dolmamış eğitimlere katılım esas alınır.</Not>
      </Bolum>
      {form && <EgitimFormu o={o} kayit={form.kayit} kapat={() => { formYaz(null); }} />}
    </div>
  );
}
