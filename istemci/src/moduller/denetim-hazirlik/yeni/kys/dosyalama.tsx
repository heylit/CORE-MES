import { useRef, useState } from 'react';
import { Dugme, Girdi, Secim, Simge, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { csvMetni, guvenliAd, indir } from '../disa-aktar.ts';
import { tarihMetni } from '../tarih.ts';
import {
  anaListe, anaListeCsvSatirlari, DCRULES, DTYPES, elleDokumanEkle, elleDokumanKodu, klasorAgaci, klasorBetigi, klasorMetni, kodOneki, kokKlasor, RETAIN,
  type AnaListeSatiri,
} from './dokuman-metni.ts';
import { Bolum, KISI_LISTESI, useKopyala, useKysGecisi } from './ortak.tsx';
import { useYapiTasinaGit } from './yapi-taslari.tsx';

// Dosyalama (prototip kysDosya): doküman kodlama, klasör yapısı (.bat), kontrol kuralları, saklama süreleri, doküman ana listesi.

const BOS_EK = { type: 'TL', code: '', name: '', rev: '', owner: '', loc: '' };

export function Dosyalama() {
  const d = useDenetim();
  const K = d.profil.kys;
  const firma = d.profil.profile.firma;
  const pf = kodOneki(K);
  const yaz = d.yetki.yazabilir;
  const [kopyala, kopyaPenceresi] = useKopyala();
  const [ek, ekYaz] = useState(BOS_EK);
  const [, gecisYaz] = useKysGecisi();
  const tasaGit = useYapiTasinaGit();
  const satirlar = anaListe(K);
  const ekFormu = useRef<HTMLFormElement>(null);
  const adaOdaklan = () => { (ekFormu.current?.elements.namedItem('ad') as HTMLInputElement | null)?.focus(); };

  const ekle = () => {
    if (!ek.name.trim()) { d.bildir('Doküman adını girin', { ton: 'hata' }); adaOdaklan(); return; }
    const kod = (ek.code.trim() || elleDokumanKodu(K, ek.type)).slice(0, 40);
    d.degistir('Doküman ekleme', (t) => { elleDokumanEkle(t.kys, { ...ek, code: kod }); }, { bildirim: `${kod} eklendi` });
    ekYaz({ ...BOS_EK, type: ek.type });
    adaOdaklan();
  };

  const sutunlar: Sutun<AnaListeSatiri>[] = [
    { anahtar: 'code', baslik: 'Kod', hucre: (s) => s.code, mono: true, kirilmaz: true },
    { anahtar: 'name', baslik: 'Doküman', hucre: (s) => s.name },
    { anahtar: 'type', baslik: 'Tür', hucre: (s) => s.type },
    { anahtar: 'rev', baslik: 'Rev.', hucre: (s) => s.rev },
    { anahtar: 'date', baslik: 'Tarih', hucre: (s) => (s.date ? tarihMetni(s.date) : '') },
    { anahtar: 'owner', baslik: 'Sorumlu', hucre: (s) => s.owner },
    { anahtar: 'loc', baslik: 'Yer', hucre: (s) => s.loc },
    {
      anahtar: 'eylem', baslik: '', csv: false, hucre: (s) => (s.gen
        ? <Dugme simge="chev-right" aria-label="Doküman üreticide aç" title="Doküman üreticide aç"
          onClick={() => { gecisYaz({ dokuman: s.gen ?? '' }); d.ekranDegistir((e) => { e.kys.tab = 'uret'; }); }} />
        : s.src === 'el'
          ? (yaz ? <Dugme simge="x" aria-label="Sil" onClick={() => { d.degistir('Doküman silme', (t) => { t.kys.docs = t.kys.docs.filter((x) => x.id !== s.id); }, { bildirim: 'Doküman silindi' }); }} /> : null)
          : <Dugme simge="chev-right" aria-label="Yapı taşında düzenle" title="Yapı taşında düzenle" onClick={() => { tasaGit(s.bid ?? ''); }} />),
    },
  ];

  return (
    <>
      <div className="tc-dhk-iki">
        <Bolum baslik="Doküman kodlama" simge="file">
          <p className="tc-dhk-not">Her dokümanın tek ve değişmez bir kodu olur: <b>ÖNEK-TÜR-SIRA</b>. Revizyon kodun parçası değildir, ayrıca tutulur.</p>
          <div className="tc-dhk-form">
            <Girdi etiket="Firma öneki" value={K.prefix} placeholder="KYS" maxLength={10} readOnly={!yaz}
              onChange={(e) => { const v = e.target.value.slice(0, 10); d.degistir(null, (t) => { t.kys.prefix = v; }); }} />
            <div className="tc-dhk-alan"><span className="tc-dhk-etiket">Örnek</span><div className="tc-dhk-ornek mono">{`${pf}-TL-012 · Rev.03`}</div></div>
          </div>
          <dl className="tc-dhk-turler">
            {DTYPES.filter((t) => t[0] !== 'GT').map((t) => <div key={t[0]}><dt className="mono">{`${pf}-${t[0]}`}</dt><dd><b>{t[1]}</b><small>{t[2]}</small></dd></div>)}
          </dl>
        </Bolum>
        <Bolum baslik="Klasör yapısı" simge="layers" sag={(
          <>
            <Dugme simge="download" onClick={() => {
              indir(`${guvenliAd(`${kokKlasor(firma)}-klasorler`)}.bat`, klasorBetigi(K, firma), 'application/octet-stream');
              d.bildir('Klasör oluşturma dosyası indirildi');
            }}>Klasörleri oluşturan dosya (.bat)</Dugme>
            <Dugme simge="file" onClick={() => { kopyala(klasorMetni(K, firma), 'Klasör yapısı kopyalandı'); }}>Metni kopyala</Dugme>
          </>
        )}>
          <div className="tc-dhk-agac">
            <div className="tc-dhk-agac-kok"><Simge ad="layers" /><b>{kokKlasor(firma)}</b></div>
            <ul>
              {klasorAgaci(K).map(([ad, alt]) => (
                <li key={ad}><span><Simge ad="file" boyut="k" />{ad}</span>{alt.length > 0 && <ul>{alt.map((x) => <li key={x}>{x}</li>)}</ul>}</li>
              ))}
            </ul>
          </div>
          <p className="tc-dhk-not">
            Süreç klasörleri Süreçler sekmesindeki süreçlerden oluşturulur. .bat dosyasını KYS klasörünün açılacağı yere kopyalayıp çift tıklayın (Windows).
            Güvenlik uyarısı çıkarsa metni kopyalayıp klasörleri elle de açabilirsiniz.
          </p>
        </Bolum>
      </div>
      <div className="tc-dhk-iki">
        <Bolum baslik="Doküman kontrol kuralları" simge="lock">
          <ol className="tc-dhk-kurallar">{DCRULES.map((r) => <li key={r[0]}><b>{r[0]}</b><small>{r[1]}</small></li>)}</ol>
        </Bolum>
        <Bolum baslik="Kayıt saklama süreleri" simge="clock">
          <p className="tc-dhk-not">Öneridir. Müşteri sözleşmesi, yasal şartlar ve AS9100 müşteri şartları önceliklidir; saklama sürelerini doküman kontrol kuralınıza yazın.</p>
          <dl className="tc-dhk-saklama">{RETAIN.map((r) => <div key={r[0]}><dt>{r[0]}</dt><dd>{r[1]}</dd><dd className="tc-dhk-soluk">{r[2]}</dd></div>)}</dl>
        </Bolum>
      </div>
      <Bolum baslik="Doküman ana listesi" simge="list" sag={(
        <Dugme simge="download" disabled={!satirlar.length} onClick={() => {
          indir(`${guvenliAd(`dokuman-ana-listesi-${firma || 'firma'}`)}.csv`, csvMetni(anaListeCsvSatirlari(K)), 'text/csv');
          d.bildir('Ana liste indirildi');
        }}>Excel için indir (.csv)</Dugme>
      )}>
        <p className="tc-dhk-not">Yapı taşlarına girdiğiniz kodlar buraya otomatik gelir; diğer talimat, form ve listeleri aşağıdan ekleyin.</p>
        <Tablo etiket="Doküman ana listesi" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(s) => `${s.src}-${s.id ?? s.bid ?? s.code}`} bosMesaj="Henüz doküman yok." />
        {yaz && (
          <form ref={ekFormu} className="tc-dhk-ekle" aria-label="Doküman ekle" onSubmit={(e) => { e.preventDefault(); ekle(); }}>
            <Secim etiket="Tür" value={ek.type} onChange={(e) => { ekYaz({ ...ek, type: e.target.value }); }}
              secenekler={DTYPES.map((t) => ({ deger: t[0], baslik: `${t[0]} · ${t[1]}` }))} />
            <Girdi etiket="Kod" placeholder="Boşsa otomatik" value={ek.code} onChange={(e) => { ekYaz({ ...ek, code: e.target.value }); }} />
            <Girdi name="ad" etiket="Doküman adı" value={ek.name} onChange={(e) => { ekYaz({ ...ek, name: e.target.value }); }} />
            <Girdi etiket="Rev." value={ek.rev} onChange={(e) => { ekYaz({ ...ek, rev: e.target.value }); }} />
            <Girdi etiket="Sorumlu" list={KISI_LISTESI} value={ek.owner} onChange={(e) => { ekYaz({ ...ek, owner: e.target.value }); }} />
            <Girdi etiket="Yer (klasör / ERP)" value={ek.loc} onChange={(e) => { ekYaz({ ...ek, loc: e.target.value }); }} />
            <Dugme tur="birincil" simge="plus" type="submit">Ekle</Dugme>
          </form>
        )}
      </Bolum>
      {kopyaPenceresi}
    </>
  );
}
