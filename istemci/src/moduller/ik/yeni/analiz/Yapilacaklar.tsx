import { useMemo, useState } from 'react';
import { DurumKutusu, Dugme, Rozet, SayiKarti } from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { tarih } from '../bicim.ts';
import type { IkEkranOzellikleri, IkGorunum } from '../gorunumler.ts';
import { ikSabitleri, MOTOR_HAZIRLANIYOR } from '../motor.ts';
import type { Izin } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { analizMotoru, analizVerisi, bugunGece } from './baglam.ts';
import { Baslik } from './Baslik.tsx';
import {
  GOREV_KATEGORILERI, gorevDurumuDegistir, gorevler, gunMetni, sonGunMetni, type Gorev, type GorevDugmesi, type GorevKovasi,
} from './kurallar.ts';
import { useYazma } from './yaz.ts';
import './analiz.css';

const KOVALAR: readonly (readonly [GorevKovasi, string, '' | 'gec' | 'bugun'])[] = [
  ['late', 'Gecikmiş', 'gec'], ['today', 'Bugün', 'bugun'], ['week', 'Bu hafta', ''], ['later', 'Yaklaşan', ''], ['none', 'Süresiz', ''],
];

export function Yapilacaklar(o: IkEkranOzellikleri) {
  const { depo, yetki, motor, git } = o;
  const komut = useIkKomutu();
  const yaz = useYazma();
  const bugun = useMemo(bugunGece, []);
  const sabit = ikSabitleri();
  const m = useMemo(() => (motor && sabit ? analizMotoru(motor, sabit, bugun) : null), [motor, sabit, bugun]);
  const v = useMemo(() => analizVerisi(depo), [depo]);
  const tum = useMemo(() => (m ? gorevler(v, m, bugun) : null), [v, m, bugun]);
  const [kip, setKip] = useState<'acik' | 'park'>('acik');
  const [kategori, setKategori] = useState('');

  useSayfaKomutlari('ik-gorev', [
    { anahtar: 'acik', baslik: 'Açık işler', simge: 'bell', aciklama: null, sozcukler: ['yapılacak', 'iş', 'görev'], calistir: () => { setKip('acik'); setKategori(''); } },
    { anahtar: 'park', baslik: 'Ertelenen ve gizlenen işler', simge: 'clock', aciklama: null, sozcukler: ['ertele', 'gizle', 'geri al'], calistir: () => { setKip('park'); setKategori(''); } },
  ]);
  const baslik = <Baslik baslik="Yapılacaklar" simge="bell" alt="Onay, bildirim ve takip gerektiren işler kayıtlardan kendiliğinden oluşur; iş tamamlanınca listeden düşer." dugmeler={[]} />;
  if (!tum) return <div className="tc-ikr">{baslik}<DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} /></div>;

  const acik = tum.filter((x) => !x.gizli && !x.ertelendi);
  const park = tum.filter((x) => x.gizli || x.ertelendi);
  const liste = (kip === 'acik' ? acik : park).filter((x) => !kategori || x.kategori === kategori);
  const kategoriler = GOREV_KATEGORILERI.filter((c) => acik.some((x) => x.kategori === c));
  const karar = yetki.izinYaz || yetki.izinOnay;

  const durumYaz = (anahtar: string, islem: 'ertele' | 'gizle' | 'geri') => {
    const ileti = islem === 'ertele' ? 'Bir hafta ertelendi.' : islem === 'gizle' ? 'İş listeden kaldırıldı. Ertelenen ve gizlenenler bölümünden geri alabilirsiniz.' : 'İş listeye geri alındı.';
    void yaz(() => komut.ayarKaydet({ ...depo.ayarlar, gorevler: gorevDurumuDegistir(v.gorevDurumu, anahtar, islem, bugunGece()) }), ileti);
  };
  const calistir = (d: GorevDugmesi) => {
    const e = d.eylem;
    if (e.tur === 'izin-karar') {
      const l = depo.al(e.izin) as Izin | null;
      if (l) void yaz(() => komut.kaydet({ ...l, durum: e.durum, karar: gunMetni(bugunGece()) }), e.durum === 'Onaylandı' ? 'İzin onaylandı.' : 'İzin reddedildi.');
    } else if (e.tur === 'git') git(e.gorunum as IkGorunum, e.kimlik);
    else if (e.tur === 'gorusme-degerlendir') { const g = depo.al(e.gorusme); const aday = g?.['candId']; if (typeof aday === 'string') git('aday', aday); }
    else git('ayarlar');
  };
  const gorunur = (d: GorevDugmesi) => d.eylem.tur !== 'izin-karar' || karar;

  const satir = (x: Gorev) => (
    <li key={x.anahtar} className={`tc-ikr-is${x.ton ? ` tc-ikr-is-${x.ton}` : ''}${x.kova === 'late' ? ' tc-ikr-is-gec' : ''}`}>
      <div className="tc-ikr-is-ana">
        <div className="tc-ikr-is-ust">
          <Rozet ton="pasif">{x.kategori}</Rozet>
          {x.son && <span className={`tc-ikr-is-son tc-ikr-is-son-${x.kova}`}>{sonGunMetni(x.son, bugun)}, {tarih(x.son)}</span>}
          {x.ertelendi && x.erteleme && <Rozet ton="bilgi">{tarih(x.erteleme)} tarihine ertelendi</Rozet>}
          {x.gizli && <Rozet ton="pasif">Gizlendi</Rozet>}
        </div>
        <b>{x.baslik}</b>
        <small>{x.aciklama}</small>
      </div>
      <div className="tc-ikr-dugmeler">
        {x.dugmeler.filter(gorunur).map((d) => (
          <Dugme key={d.etiket} tur={d.birincil ? 'birincil' : 'ikincil'} disabled={komut.calisiyor} onClick={() => { calistir(d); }}>{d.etiket}</Dugme>
        ))}
        {yetki.ayarYaz && (kip === 'acik'
          ? (
            <>
              <Dugme title="1 hafta ertele" disabled={komut.calisiyor} onClick={() => { durumYaz(x.anahtar, 'ertele'); }}>Ertele</Dugme>
              <Dugme title="Bu işi listeden kaldır" disabled={komut.calisiyor} onClick={() => { durumYaz(x.anahtar, 'gizle'); }}>Gizle</Dugme>
            </>
          )
          : <Dugme disabled={komut.calisiyor} onClick={() => { durumYaz(x.anahtar, 'geri'); }}>Listeye geri al</Dugme>)}
      </div>
    </li>
  );

  return (
    <div className="tc-ikr">
      {baslik}
      <div className="tc-ikr-sayilar" data-adet="4">
        <SayiKarti baslik="Gecikmiş" simge="alert" sayi={acik.filter((x) => x.kova === 'late').length} ton="hata" />
        <SayiKarti baslik="Bugün" simge="clock" sayi={acik.filter((x) => x.kova === 'today').length} ton="uyari" />
        <SayiKarti baslik="Bu hafta" simge="flag" sayi={acik.filter((x) => x.kova === 'week').length} />
        <SayiKarti baslik="Açık iş" simge="bell" sayi={acik.length} />
      </div>
      <div className="tc-ikr-arac tc-ikr-suzgec">
        <div className="tc-ikr-secim" role="group" aria-label="Kategori">
          <button type="button" aria-pressed={!kategori} onClick={() => { setKategori(''); }}>Tümü</button>
          {kategoriler.map((c) => (
            <button key={c} type="button" aria-pressed={kategori === c} onClick={() => { setKategori(c); }}>{c} ({acik.filter((x) => x.kategori === c).length})</button>
          ))}
        </div>
        <Dugme onClick={() => { setKip(kip === 'acik' ? 'park' : 'acik'); }}>{kip === 'acik' ? `Ertelenen ve gizlenenler (${park.length})` : 'Açık işlere dön'}</Dugme>
      </div>
      {!liste.length
        ? <DurumKutusu durum="bos" mesaj={kip === 'acik' ? 'Bekleyen iş yok. Yeni onaylar, bildirim süreleri ve takip gereken işler oluştukça burada görünür.' : 'Ertelenen veya gizlenen iş yok.'} />
        : kip === 'acik'
          ? KOVALAR.map(([k, ad, ton]) => {
            const g = liste.filter((x) => x.kova === k).sort((a, b) => (a.son ?? '9').localeCompare(b.son ?? '9'));
            return g.length
              ? (
                <section key={k} className="tc-ikr-is-grubu">
                  <h3 className={ton ? `tc-ikr-is-grubu-${ton}` : undefined}>{ad}<span className="tc-ikr-sayi">{g.length}</span></h3>
                  <ul className="tc-ikr-isler">{g.map(satir)}</ul>
                </section>
              )
              : null;
          })
          : <ul className="tc-ikr-isler">{liste.map(satir)}</ul>}
    </div>
  );
}
