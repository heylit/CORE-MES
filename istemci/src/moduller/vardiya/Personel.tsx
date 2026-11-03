import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { VardiyaPersoneliCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { Dugme, DurumKutusu, Rozet, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { aramaUyar } from './secim.ts';
import { usePersonel, useTakvim } from './veri.ts';
import './vardiya.css';

type PersonelSatiri = VardiyaPersoneliCevabi['personel'][number];

// Süzgeç değerleri: boş hepsi, 'yok' iş merkezi ya da vardiyası olmayan kişi, öbürü kimlik.
const HEPSI = '';
const YOK = 'yok';
const uyar = (suzgec: string, deger: number | null) => suzgec === HEPSI || (suzgec === YOK ? deger === null : deger === Number(suzgec));

// Kişinin vardiyası İstasyonlar > Personel'de yazılır (1927 a: tek giriş yeri); burada yalnız okunur.
export function PersonelEkrani() {
  const takvim = useTakvim();
  const personel = usePersonel();
  const istasyonlarVar = useOturum().data?.islemler.includes('sayfa.istasyonlar') ?? false;
  const [arama, aramaYaz] = useState('');
  const [merkez, merkezYaz] = useState(HEPSI);
  const [vardiya, vardiyaYaz] = useState(HEPSI);
  // Özetteki sayıya dokununca liste o hücrenin kişilerine süzülür (kişi birden çok iş merkezinde sayılabilir).
  const [kisiSuzgeci, kisiSuzgeciYaz] = useState<{ baslik: string; idler: ReadonlySet<number> } | null>(null);
  if (takvim.isPending || personel.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (takvim.isError || personel.isError) return <DurumKutusu durum="hata" yenile={() => { void takvim.refetch(); void personel.refetch(); }} />;
  const t = takvim.data;
  const liste = personel.data.personel;
  const merkezAdi = (id: number | null) => { const m = t.isMerkezleri.find((x) => x.id === id); return m ? `${m.kod} ${m.ad}` : null; };
  const secenekler = t.vardiyalar.map((v) => ({ deger: String(v.id), baslik: `${v.ad} ${v.baslangic}–${v.bitis}` }));
  const vardiyaAdi = (id: number | null) => secenekler.find((s) => s.deger === String(id))?.baslik ?? 'Seçilmedi';
  const merkezler = t.isMerkezleri.filter((m) => m.aktif);
  const vardiyalar = t.vardiyalar.filter((v) => v.aktif);
  const gorunen = liste.filter((p) => (kisiSuzgeci === null || kisiSuzgeci.idler.has(p.kisiId))
    && uyar(merkez, p.isMerkeziId) && uyar(vardiya, p.vardiyaId) && aramaUyar(arama, p.ad, merkezAdi(p.isMerkeziId) ?? ''));
  const suzgecVar = kisiSuzgeci !== null || arama !== '' || merkez !== HEPSI || vardiya !== HEPSI;
  // Sayılar vardiya modülünün tek tanımından gelir (İstasyonlar sayfası da aynısını gösterir).
  const kadro = (m: number, v: number | null) => t.kadro.find((k) => k.isMerkeziId === m && k.vardiyaId === v)?.kisiIdleri ?? [];
  const suz = (baslik: string, idler: readonly number[]) => { kisiSuzgeciYaz({ baslik, idler: new Set(idler) }); merkezYaz(HEPSI); vardiyaYaz(HEPSI); aramaYaz(''); };
  const sutunlar: Sutun<PersonelSatiri>[] = [
    {
      anahtar: 'ad', baslik: 'Personel', hucre: (p) => (
        <span className="tc-vr-ad">{p.ad}</span>
      ),
    },
    { anahtar: 'merkez', baslik: 'İş merkezi', hucre: (p) => merkezAdi(p.isMerkeziId) },
    { anahtar: 'vardiya', baslik: 'Vardiya', hucre: (p) => vardiyaAdi(p.vardiyaId) },
  ];
  return (
    <div className="tc-vr-sayfa">
      <section className="tc-vr-panel" aria-label="Vardiya başına personel">
        <h3>Vardiya başına personel</h3>
        <div className="tc-vr-matris-kap">
          <table className="tc-vr-matris">
            <thead><tr><th>İş merkezi</th>{vardiyalar.map((v) => <th key={v.id}>{v.ad}</th>)}<th>Seçilmedi</th></tr></thead>
            <tbody>
              {merkezler.map((m) => {
                const secilmedi = kadro(m.id, null);
                return (
                <tr key={m.id}>
                  <th>{m.kod} <small>{m.ad}</small></th>
                  {vardiyalar.map((v) => {
                    const kisiler = kadro(m.id, v.id);
                    const sayi = kisiler.length;
                    const calisiyor = t.matris.some((x) => x.isMerkeziId === m.id && x.vardiyaId === v.id);
                    return (
                      <td key={v.id} className={calisiyor && sayi === 0 ? 'tc-vr-eksik' : undefined}>
                        {sayi > 0 ? <button type="button" className="tc-vr-sayi-dugme" aria-label={`${m.kod} ${v.ad}: ${String(sayi)} kişiyi listele`} onClick={() => suz(`${m.kod} ${v.ad}`, kisiler)}>{sayi}</button>
                          : calisiyor ? 0 : '–'}
                      </td>
                    );
                  })}
                  <td>
                    {secilmedi.length > 0 ? <button type="button" className="tc-vr-sayi-dugme" aria-label={`${m.kod} vardiyası seçilmemiş: ${String(secilmedi.length)} kişiyi listele`} onClick={() => suz(`${m.kod} vardiyası seçilmemiş`, secilmedi)}>{secilmedi.length}</button> : 0}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="tc-vr-ipucu">Kırmızı hücre: o vardiya iş merkezinde çalışıyor ama kimse yok. İstasyon, makine ve ekip ataması sayılır; vardiyası seçilmeyen kişi iş merkezinin bütün açık vardiyalarında sayılır. Sayıya dokununca aşağıdaki liste o kişilere süzülür.</p>
      </section>
      <section className="tc-vr-panel" aria-label="Personelin vardiyası">
        <h3>Personelin vardiyası</h3>
        <div className="tc-vr-satir tc-vr-suzgec">
          <input className="tc-alan-kutu tc-vr-arama" type="search" aria-label="Personel ara" placeholder="Ad ya da iş merkezi ara" value={arama} onChange={(e) => aramaYaz(e.target.value)} />
          <Secim etiket="İş merkezi" value={merkez} onChange={(e) => merkezYaz(e.target.value)}
            secenekler={[{ deger: HEPSI, baslik: 'Hepsi' }, ...merkezler.map((m) => ({ deger: String(m.id), baslik: `${m.kod} ${m.ad}` })), { deger: YOK, baslik: 'İş merkezi yok' }]} />
          <Secim etiket="Vardiya" value={vardiya} onChange={(e) => vardiyaYaz(e.target.value)}
            secenekler={[{ deger: HEPSI, baslik: 'Hepsi' }, { deger: YOK, baslik: 'Seçilmedi' }, ...secenekler]} />
          {kisiSuzgeci && <Rozet>{kisiSuzgeci.baslik}</Rozet>}
          {suzgecVar && <Dugme simge="x" onClick={() => { kisiSuzgeciYaz(null); aramaYaz(''); merkezYaz(HEPSI); vardiyaYaz(HEPSI); }}>Süzgeci temizle</Dugme>}
        </div>
        <Tablo etiket="Personel" sutunlar={sutunlar} satirlar={gorunen} satirAnahtari={(p) => p.kisiId}
          bosMesaj={liste.length === 0 ? 'Atanmış personel yok' : 'Süzgece uyan personel yok'} />
        <p className="tc-vr-ipucu">
          Kişinin iş merkezi en büyük yüzdeli istasyon atamasından, o yoksa makine ya da ekip atamasından gelir. Kişinin vardiyası ve ataması İstasyonlar
          sayfasında yazılır{istasyonlarVar ? <>: <Link to="/istasyonlar/personel">İstasyonlar &gt; Personel</Link></> : ''}.
        </p>
      </section>
    </div>
  );
}
