import { useNavigate } from 'react-router-dom';
import { KARAR_KODU_ADLARI } from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import type { EtkiAnalizi as Etki } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { Kart, Rozet, SayiKarti, Tablo, type Sutun } from '../../../ortak/arayuz/index.ts';
import { tarihSaatMetni } from '../../../ortak/veri/zaman-metni.ts';
import { ModRozeti, malzemeMetni } from '../gosterim.tsx';

type EtkiEmri = NonNullable<Etki['emirler']>[number];

const FAI_METNI: Readonly<Record<Etki['fai'], string>> = {
  tam_ve_kismi: 'Yeni parça numarası için tam FAI, revizyon için kısmi FAI',
  kismi: 'Değişen karakteristikler için kısmi FAI',
  gerekmez: 'Gerekmez',
};
// Sahibi modül bağlı değilse bölüm null gelir; boş dizi "etkilenen yok" demektir.
const BAGLI_DEGIL = 'Bilinmiyor (bağlı değil)';

const SUTUNLAR: readonly Sutun<EtkiEmri>[] = [
  { anahtar: 'emir', baslik: 'Emir', hucre: (e) => e.emirNo, mono: true, kirilmaz: true },
  { anahtar: 'parca', baslik: 'Parça', hucre: (e) => `${malzemeMetni(e.malzeme)}${e.revizyon ? ` rev ${e.revizyon}` : ''}`, mono: true },
  { anahtar: 'seri', baslik: 'Seri', hucre: (e) => e.seriAraligi ?? '—', mono: true },
  {
    anahtar: 'durum', baslik: 'Durum',
    hucre: (e) => <span className="tc-dy-satir-ic">{e.durum}{e.donmus === true && <Rozet ton="uyari" gorunum="cizgi">Frozen</Rozet>}</span>,
    csv: (e) => e.durum,
  },
  {
    anahtar: 'oneri', baslik: 'Ön öneri',
    hucre: (e) => <div><strong>{KARAR_KODU_ADLARI[e.onerilenKod]}</strong><div className="tc-dy-kucuk tc-dy-soluk">{e.gerekce}</div></div>,
    csv: (e) => KARAR_KODU_ADLARI[e.onerilenKod],
  },
  { anahtar: 'mod', baslik: 'Mod', hucre: (e) => <ModRozeti mod={e.mod} />, csv: (e) => e.mod },
];

const toplam = (degerler: readonly (number | string)[]): number => degerler.reduce<number>((t, d) => t + Number(d), 0);

export function EtkiAnalizi({ etki }: { etki: Etki }) {
  const gezin = useNavigate();
  return (
    <Kart baslik="Etki analizi" baslikEki={<span className="tc-dy-kucuk tc-dy-soluk">{tarihSaatMetni(etki.zaman)} itibarıyla</span>}>
      <div className="tc-dy-sayilar">
        <SayiKarti baslik="Açık emir" simge="list" sayi={etki.emirler?.length ?? null} />
        <SayiKarti baslik="MRB adayı" simge="alert" sayi={etki.mrbAdayi} ton="hata" />
        <SayiKarti baslik="Stoktaki kalem" simge="box" sayi={etki.stok === null ? null : toplam(etki.stok.map((s) => s.miktar))} />
        <SayiKarti baslik="Sahadaki birim" simge="truck" sayi={etki.sahada === null ? null : toplam(etki.sahada.map((s) => s.adet))} />
        <SayiKarti baslik="Bitmiş, stokta" simge="tag" sayi={etki.stoktakiSeri} />
      </div>
      <dl className="tc-dy-dl">
        <dt>Kullanım yeri</dt>
        <dd>{etki.ustParcalar === null ? BAGLI_DEGIL : etki.ustParcalar.length === 0 ? 'Üst montaj yok' : etki.ustParcalar.map(malzemeMetni).join(', ')}</dd>
        <dt>İlk parça kontrolü</dt>
        <dd>{FAI_METNI[etki.fai]}</dd>
        <dt>Müşteri onayı</dt>
        <dd>{etki.musteriOnayiGerekir === null ? BAGLI_DEGIL : etki.musteriOnayiGerekir ? <Rozet ton="hata">Gerekli</Rozet> : 'Gerekmez'}</dd>
        <dt>Etkilenen NC programları</dt>
        <dd>
          {etki.ncProgramlari === null ? BAGLI_DEGIL : etki.ncProgramlari.length === 0 ? '—' : (
            <span className="tc-dy-cipler">{etki.ncProgramlari.map((n) => <span key={n} className="tc-dy-cip">{n}</span>)}</span>
          )}
        </dd>
        {etki.sahada !== null && etki.sahada.length > 0 && (
          <>
            <dt>Sahadaki konfigürasyon</dt>
            <dd>{etki.sahada.map((s) => `${malzemeMetni(s.malzeme)}${s.revizyon ? ` rev ${s.revizyon}` : ''}: ${s.adet} birim`).join(', ')}</dd>
          </>
        )}
        {etki.stok !== null && etki.stok.length > 0 && (
          <>
            <dt>Stok</dt>
            <dd>{etki.stok.map((s) => [`${malzemeMetni(s.malzeme)}${s.revizyon ? ` rev ${s.revizyon}` : ''}`, `${s.miktar} adet`, s.yer].filter((m) => m !== null).join(', ')).join('; ')}</dd>
          </>
        )}
      </dl>
      {etki.emirler === null ? <p className="tc-dy-soluk">Açık emirler: {BAGLI_DEGIL}</p> : (
        <Tablo
          etiket="Etkilenen emirler" sutunlar={SUTUNLAR} satirlar={etki.emirler} satirAnahtari={(e) => e.uretimEmriId}
          satirSec={(e) => { void gezin(`/uretim-emirleri/${e.uretimEmriId}`); }} bosMesaj="Açık emir yok."
        />
      )}
      <p className="tc-dy-kucuk tc-dy-soluk">
        Ön öneriler geçerlilik henüz belirlenmeden hesaplandı. ECO yayınlanırken seri veya tarih geçerliliğine göre yeniden hesaplanır.
      </p>
    </Kart>
  );
}
