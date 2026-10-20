import { useState } from 'react';
import type { VardiyaPersoneliCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { Dugme, DurumKutusu, Rozet, Secim, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { useVardiyaYaz } from './komut.ts';
import { aramaUyar, degistir, hepsiniDegistir, reddedilenler } from './secim.ts';
import { usePersonel, useTakvim, useYazabilir } from './veri.ts';
import './vardiya.css';

type PersonelSatiri = VardiyaPersoneliCevabi['personel'][number];

// Süzgeç değerleri: boş hepsi, 'yok' iş merkezi ya da vardiyası olmayan kişi, öbürü kimlik.
const HEPSI = '';
const YOK = 'yok';
const uyar = (suzgec: string, deger: number | null) => suzgec === HEPSI || (suzgec === YOK ? deger === null : deger === Number(suzgec));

export function PersonelEkrani() {
  const takvim = useTakvim();
  const personel = usePersonel();
  const yaz = useYazabilir();
  const y = useVardiyaYaz();
  const { bildir } = useBildirim();
  const [arama, aramaYaz] = useState('');
  const [merkez, merkezYaz] = useState(HEPSI);
  const [vardiya, vardiyaYaz] = useState(HEPSI);
  const [secili, seciliYaz] = useState<ReadonlySet<number>>(new Set());
  const [reddedilen, reddedilenYaz] = useState<ReadonlySet<number>>(new Set());
  const [hedef, hedefYaz] = useState('');
  // Özetteki sayıya dokununca liste o hücrenin kişilerine süzülür (kişi birden çok iş merkezinde sayılabilir).
  const [kisiSuzgeci, kisiSuzgeciYaz] = useState<{ baslik: string; idler: ReadonlySet<number> } | null>(null);
  if (takvim.isPending || personel.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (takvim.isError || personel.isError) return <DurumKutusu durum="hata" yenile={() => { void takvim.refetch(); void personel.refetch(); }} />;
  const t = takvim.data;
  const liste = personel.data.personel;
  const merkezAdi = (id: number | null) => { const m = t.isMerkezleri.find((x) => x.id === id); return m ? `${m.kod} ${m.ad}` : null; };
  const secenekler = t.vardiyalar.map((v) => ({ deger: String(v.id), baslik: `${v.ad} ${v.baslangic}–${v.bitis}` }));
  const merkezler = t.isMerkezleri.filter((m) => m.aktif);
  const vardiyalar = t.vardiyalar.filter((v) => v.aktif);
  const gorunen = liste.filter((p) => (kisiSuzgeci === null || kisiSuzgeci.idler.has(p.kisiId))
    && uyar(merkez, p.isMerkeziId) && uyar(vardiya, p.vardiyaId) && aramaUyar(arama, p.ad, merkezAdi(p.isMerkeziId) ?? ''));
  const gorunenIdler = gorunen.map((p) => p.kisiId);
  const hepsiSecili = gorunen.length > 0 && gorunen.every((p) => secili.has(p.kisiId));
  // Seçim listede kalan kişilerle sınırlıdır: bu arada istasyon ataması kalkan kişi komuta gitmez.
  const seciliIdler = liste.filter((p) => secili.has(p.kisiId)).map((p) => p.kisiId);
  const suzgecVar = kisiSuzgeci !== null || arama !== '' || merkez !== HEPSI || vardiya !== HEPSI;
  // Sayılar vardiya modülünün tek tanımından gelir (İstasyonlar sayfası da aynısını gösterir).
  const kadro = (m: number, v: number | null) => t.kadro.find((k) => k.isMerkeziId === m && k.vardiyaId === v)?.kisiIdleri ?? [];
  const suz = (baslik: string, idler: readonly number[]) => { kisiSuzgeciYaz({ baslik, idler: new Set(idler) }); merkezYaz(HEPSI); vardiyaYaz(HEPSI); aramaYaz(''); };
  const topluUygula = () => y.mutate(
    { yol: '/kisi-vardiyalari/toplu-belirle', govde: { kisiIdleri: seciliIdler, vardiyaId: hedef === YOK ? null : Number(hedef) } },
    {
      onSuccess: () => { reddedilenYaz(new Set()); seciliYaz(new Set()); bildir('tamam', `${seciliIdler.length.toLocaleString('tr-TR')} kişinin vardiyası kaydedildi.`); },
      onError: (e) => reddedilenYaz(new Set(reddedilenler(e, 'kisiIdleri'))),
    },
  );

  const sutunlar: Sutun<PersonelSatiri>[] = [
    ...(yaz ? [{
      anahtar: 'sec', baslik: 'Seç', hucre: (p: PersonelSatiri) => (
        <input type="checkbox" className="tc-vr-kutu" aria-label={`${p.ad} seç`} checked={secili.has(p.kisiId)} onChange={() => seciliYaz(degistir(secili, p.kisiId))} />
      ),
    }] : []),
    {
      anahtar: 'ad', baslik: 'Personel', hucre: (p) => (
        <span className="tc-vr-ad">{p.ad}{reddedilen.has(p.kisiId) && <Rozet ton="hata">Yetkin yok, değişmedi</Rozet>}</span>
      ),
    },
    { anahtar: 'merkez', baslik: 'İş merkezi', hucre: (p) => merkezAdi(p.isMerkeziId) },
    {
      anahtar: 'vardiya', baslik: 'Vardiya', hucre: (p) => (
        // Sütun başlığı yeter; kişinin adı satırda zaten yazılı, etiketi yalnız ekran okuyucu okur.
        <select className="tc-alan-kutu" aria-label={`${p.ad} vardiyası`} value={p.vardiyaId === null ? '' : String(p.vardiyaId)} disabled={!yaz}
          onChange={(e) => y.mutate({ yol: `/kisi-vardiyalari/${String(p.kisiId)}/belirle`, govde: { vardiyaId: e.target.value === '' ? null : Number(e.target.value) } })}>
          <option value="">Seçilmedi</option>
          {secenekler.map((s) => <option key={s.deger} value={s.deger}>{s.baslik}</option>)}
        </select>
      ),
    },
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
        {yaz && (
          <div className="tc-vr-satir">
            <label className="tc-vr-sec">
              <input type="checkbox" className="tc-vr-kutu" checked={hepsiSecili} disabled={gorunen.length === 0} onChange={() => seciliYaz(hepsiniDegistir(secili, gorunenIdler))} />
              Görünenlerin hepsini seç ({gorunen.length.toLocaleString('tr-TR')})
            </label>
          </div>
        )}
        {yaz && seciliIdler.length > 0 && (
          <section className="tc-vr-toplu" aria-label="Toplu vardiya atama">
            <div className="tc-vr-baslik-satiri">
              <strong>{seciliIdler.length.toLocaleString('tr-TR')} kişi seçili</strong>
              <Dugme simge="x" onClick={() => { seciliYaz(new Set()); reddedilenYaz(new Set()); }}>Seçimi bırak</Dugme>
            </div>
            <div className="tc-vr-satir">
              <Secim etiket="Seçilenlerin vardiyası" value={hedef} bosSecenek="Vardiya seç" onChange={(e) => hedefYaz(e.target.value)}
                secenekler={[...vardiyalar.map((v) => ({ deger: String(v.id), baslik: `${v.ad} ${v.baslangic}–${v.bitis}` })), { deger: YOK, baslik: 'Seçilmedi (vardiyayı kaldır)' }]} />
              <Dugme tur="birincil" simge="check" disabled={hedef === '' || y.isPending} onClick={topluUygula}>Uygula</Dugme>
            </div>
            <p className="tc-vr-ipucu">Komut seçilenlerin hepsine birden uygulanır; yetkin olmayan bir kişi varsa hiçbiri değişmez ve satırında yazar.</p>
          </section>
        )}
        <Tablo etiket="Personel" sutunlar={sutunlar} satirlar={gorunen} satirAnahtari={(p) => p.kisiId}
          bosMesaj={liste.length === 0 ? 'Atanmış personel yok' : 'Süzgece uyan personel yok'} />
        <p className="tc-vr-ipucu">Kişinin iş merkezi en büyük yüzdeli istasyon atamasından, o yoksa makine ya da ekip atamasından gelir (İstasyonlar sayfası).</p>
      </section>
    </div>
  );
}
