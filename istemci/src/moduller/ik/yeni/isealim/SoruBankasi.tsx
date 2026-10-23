import { useState } from 'react';
import { CokSatir, Dugme, FormPenceresi, Girdi, Pencere, Rozet, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { useIkKomutu, yeniKimlik } from '../veri.ts';
import { satirlar } from './kurallar.ts';
import { Not, panoyaKopyala, type Hazirlik } from './ortak.tsx';

// Mülakat soru setleri İK ayarlarındadır (`soruSetleri`); yazma ayar ucuyla gider, bu yüzden düzenleme `ik.ayar-yaz` ister.

interface SoruSeti { id: string; ad: string; kategori: string; odak: string; sorular: string }

const metin = (v: unknown): string => (typeof v === 'string' ? v : '');
// Ayardaki setin kimliği çerçevedeki gibi `q_` önekli; rastgele kısım ortak üreticiden.
const setKimligi = (): string => `q_${yeniKimlik('job').slice('job_'.length)}`;

export function soruSetleriOku(ayar: unknown, varsayilan: unknown): SoruSeti[] {
  const liste = Array.isArray(ayar) ? ayar : Array.isArray(varsayilan) ? varsayilan : [];
  return liste.flatMap((q: unknown) => {
    if (q === null || typeof q !== 'object') return [];
    const o = q as Record<string, unknown>;
    return [{ id: metin(o['id']), ad: metin(o['ad']), kategori: metin(o['kategori']), odak: metin(o['odak']), sorular: metin(o['sorular']) }];
  });
}

export function SoruBankasi({ o, h }: { o: IkEkranOzellikleri; h: Hazirlik }) {
  const { depo, yetki } = o;
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const setler = soruSetleriOku(depo.ayarlar['soruSetleri'], h.s.DEFAULT_SETTINGS['soruSetleri']);
  const [gor, gorYaz] = useState<SoruSeti | null>(null);
  const [duzen, duzenYaz] = useState<SoruSeti | null>(null);
  const yazabilir = yetki.ayarYaz;

  const yaz = async (yeni: SoruSeti[], ileti: string) => {
    await komut.ayarKaydet({ ...depo.ayarlar, soruSetleri: yeni });
    bildir('tamam', ileti);
  };

  return (
    <div className="tc-ika-sorubank">
      <div className="tc-ika-satir">
        <Not>{setler.length} soru seti. Pozisyon formunun Mülakat bölümünden bir seti tek tıkla pozisyona ekleyebilirsiniz.</Not>
        {yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => { duzenYaz({ id: '', ad: '', kategori: '', odak: '', sorular: '' }); }}>Yeni soru seti</Dugme>}
      </div>
      <div className="tc-ika-kartlar">
        {setler.map((q) => {
          const qs = satirlar(q.sorular);
          return (
            <section key={q.id} className="tc-ika-kart">
              <header><b>{q.ad}</b><Rozet ton="pasif">{q.kategori || 'Genel'}</Rozet></header>
              {q.odak && <p className="tc-ika-soluk">{q.odak}</p>}
              <ol>{qs.slice(0, 4).map((x) => <li key={x}>{x}</li>)}</ol>
              {qs.length > 4 && <p className="tc-ika-soluk">ve {qs.length - 4} soru daha</p>}
              <div className="tc-ika-kart-eylem">
                <Dugme simge="eye" onClick={() => { gorYaz(q); }}>Tümünü gör</Dugme>
                {yazabilir && <Dugme simge="edit" onClick={() => { duzenYaz(q); }}>Düzenle</Dugme>}
                {yazabilir && (
                  <Dugme onClick={() => { void yaz([...setler, { ...q, id: setKimligi(), ad: `${q.ad} (kopya)` }], 'Soru seti kopyalandı.'); }}>Kopyala</Dugme>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <div className="tc-ika-aciklama">
        <h4>Yapılandırılmış mülakat için öneriler</h4>
        <p>Aynı pozisyondaki tüm adaylara aynı soruları sorun ve aynı kriterlerle puanlayın; karşılaştırma ancak böyle adil olur. Davranışsal sorularda adaydan somut bir örneği <b>durum, görev, eylem ve sonuç</b> sırasıyla anlatmasını isteyin.</p>
        <p className="tc-ika-soluk">Medeni hâl, çocuk sahibi olma planı, hamilelik, din, siyasi görüş, yaş veya sağlık durumu gibi işle ilgisi olmayan sorular sormayın (İş Kanunu md. 5; 6701 sayılı Kanun).</p>
      </div>
      <Pencere
        acik={gor !== null} kapat={() => { gorYaz(null); }} baslik={gor?.ad ?? ''}
        alt={(
          <>
            <Dugme simge="file" onClick={() => { void panoyaKopyala(satirlar(gor?.sorular).map((x, i) => `${i + 1}. ${x}`).join('\n')).then((ok) => { bildir(ok ? 'tamam' : 'hata', ok ? 'Sorular kopyalandı.' : 'Kopyalanamadı.'); }); }}>Soruları kopyala</Dugme>
            <Dugme tur="birincil" onClick={() => { gorYaz(null); }}>Kapat</Dugme>
          </>
        )}
      >
        {gor?.odak && <p className="tc-ika-soluk">{gor.odak}</p>}
        <ol>{satirlar(gor?.sorular).map((x) => <li key={x}>{x}</li>)}</ol>
      </Pencere>
      {duzen && <SetFormu set={duzen} kapat={() => { duzenYaz(null); }} setler={setler} yaz={yaz} />}
    </div>
  );
}

function SetFormu({ set, kapat, setler, yaz }: { set: SoruSeti; kapat: () => void; setler: SoruSeti[]; yaz: (s: SoruSeti[], ileti: string) => Promise<void> }) {
  const form = useForm<SoruSeti>({
    ilk: set,
    hataIletisi: 'Soru seti kaydedilemedi.',
    kaydet: async (d) => {
      const yeni = { ...d, id: d.id || setKimligi(), ad: d.ad.trim() || 'Adsız set', kategori: d.kategori.trim(), odak: d.odak.trim() };
      const liste = setler.some((x) => x.id === yeni.id) ? setler.map((x) => (x.id === yeni.id ? yeni : x)) : [...setler, yeni];
      await yaz(liste, 'Soru seti kaydedildi.');
    },
    basarili: kapat,
  });
  return (
    <>
      <FormPenceresi acik kapat={kapat} baslik={set.id ? 'Soru setini düzenle' : 'Yeni soru seti'} form={form}>
        <Girdi etiket="Set adı" {...form.alan('ad')} />
        <Girdi etiket="Kategori" placeholder="Ör. Satış" {...form.alan('kategori')} />
        <Girdi etiket="Odak" placeholder="Bu setin ölçtüğü yetkinlikler" {...form.alan('odak')} />
        <CokSatir etiket="Sorular" ipucu="Her satıra bir soru." rows={12} {...form.alan('sorular')} />
        {set.id && (
          <div className="tc-ika-form-sil">
            <Dugme tur="tehlike" simge="trash" onClick={() => { void yaz(setler.filter((x) => x.id !== set.id), 'Soru seti silindi.').then(kapat); }}>Sil</Dugme>
          </div>
        )}
      </FormPenceresi>
    </>
  );
}
