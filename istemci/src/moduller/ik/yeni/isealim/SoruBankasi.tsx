import { useState } from 'react';
import { CokSatir, Dugme, Girdi, OnayPenceresi, Pencere, Rozet, useBildirim } from '../../../../ortak/arayuz/index.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { useIkKomutu } from '../veri.ts';
import { satirlar, type SoruSeti } from './kurallar.ts';
import { Not, setler } from './parcalar.tsx';

// Panoya yazma; tarayıcı izin vermezse false (kullanıcı metni elle seçer).
export async function panoyaYaz(metin: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(metin);
    return true;
  } catch {
    return false;
  }
}

// Soru bankası: ayarlardaki mülakat soru setleri. Yazma ayar kaydıdır (ik.ayar-yaz); düğmeler yalnız o yetkiyle görünür.
export function SoruBankasi({ o }: { o: IkEkranOzellikleri }) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const yaz = o.yetki.ayarYaz;
  const liste = setler(o.depo);
  const [goster, gosterYaz] = useState<SoruSeti | null>(null);
  const [duzenle, duzenleYaz] = useState<SoruSeti | null>(null);
  const [sil, silYaz] = useState<SoruSeti | null>(null);

  const kaydet = async (yeni: SoruSeti[], ileti: string) => {
    try {
      await komut.ayarKaydet({ ...o.depo.ayarlar, soruSetleri: yeni });
      bildir('tamam', ileti);
      return true;
    } catch {
      return false;
    }
  };
  const kopyala = (s: SoruSeti) => {
    const id = `q-${Date.now().toString(36)}`;
    void kaydet([...liste, { ...s, id, ad: `${s.ad} (kopya)` }], 'Soru seti kopyalandı.');
  };

  return (
    <>
      <div className="tc-ika-arac">
        <span className="tc-ika-soluk tc-ika-bosluk">{`${liste.length} soru seti. Pozisyon formunun Mülakat bölümünden bir seti tek tıkla pozisyona ekleyebilirsiniz.`}</span>
        {yaz && <Dugme tur="birincil" simge="plus" onClick={() => { duzenleYaz({ id: '', ad: '', kategori: '', odak: '', sorular: '' }); }}>Yeni soru seti</Dugme>}
      </div>
      <div className="tc-ika-setler">
        {liste.map((s) => {
          const sorular = satirlar(s.sorular);
          return (
            <section key={s.id} className="tc-ika-kutu">
              <div className="tc-ika-kutu-bas"><h3>{s.ad}</h3><Rozet ton="pasif">{s.kategori || 'Genel'}</Rozet></div>
              {s.odak && <p className="tc-ika-soluk">{s.odak}</p>}
              <ol>{sorular.slice(0, 4).map((q) => <li key={q}>{q}</li>)}</ol>
              {sorular.length > 4 && <p className="tc-ika-soluk">{`ve ${sorular.length - 4} soru daha`}</p>}
              <div className="tc-ika-eylemler">
                <Dugme onClick={() => { gosterYaz(s); }}>Tümünü gör</Dugme>
                {yaz && <Dugme simge="edit" onClick={() => { duzenleYaz(s); }}>Düzenle</Dugme>}
                {yaz && <Dugme simge="file" onClick={() => { kopyala(s); }}>Kopyala</Dugme>}
              </div>
            </section>
          );
        })}
      </div>
      <section className="tc-ika-kutu">
        <h3>Yapılandırılmış mülakat için öneriler</h3>
        <p>Aynı pozisyondaki tüm adaylara aynı soruları sorun ve aynı kriterlerle puanlayın; karşılaştırma ancak böyle adil olur. Davranışsal sorularda adaydan somut bir örneği <b>durum, görev, eylem ve sonuç</b> sırasıyla anlatmasını isteyin.</p>
        <Not>Medeni hâl, çocuk sahibi olma planı, hamilelik, din, siyasi görüş, yaş veya sağlık durumu gibi işle ilgisi olmayan sorular sormayın (İş Kanunu md. 5; 6701 sayılı Kanun).</Not>
      </section>

      {goster && (
        <Pencere
          acik baslik={goster.ad} kapat={() => { gosterYaz(null); }}
          alt={<Dugme simge="file" onClick={() => { void panoyaYaz(satirlar(goster.sorular).map((q, i) => `${i + 1}. ${q}`).join('\n')).then((t) => { bildir(t ? 'tamam' : 'hata', t ? 'Sorular kopyalandı.' : 'Kopyalanamadı.'); }); }}>Soruları kopyala</Dugme>}
        >
          {goster.odak && <p className="tc-ika-soluk">{goster.odak}</p>}
          <ol>{satirlar(goster.sorular).map((q) => <li key={q}>{q}</li>)}</ol>
        </Pencere>
      )}
      {duzenle && (
        <SetFormu
          set={duzenle} kapat={() => { duzenleYaz(null); }}
          kaydet={async (s) => {
            const yeni = s.id ? liste.map((x) => (x.id === s.id ? s : x)) : [...liste, { ...s, id: `q-${Date.now().toString(36)}` }];
            if (await kaydet(yeni, 'Soru seti kaydedildi.')) duzenleYaz(null);
          }}
          sil={duzenle.id ? () => { silYaz(duzenle); duzenleYaz(null); } : undefined}
        />
      )}
      <OnayPenceresi
        acik={sil !== null} baslik={`${sil?.ad ?? ''} silinsin mi?`} onayMetni="Sil" tehlikeli
        onayla={() => { const s = sil; silYaz(null); if (s) void kaydet(liste.filter((x) => x.id !== s.id), 'Soru seti silindi.'); }}
        vazgec={() => { silYaz(null); }}
      />
    </>
  );
}

function SetFormu({ set, kapat, kaydet, sil }: { set: SoruSeti; kapat: () => void; kaydet: (s: SoruSeti) => Promise<void>; sil?: () => void }) {
  const [d, dYaz] = useState(set);
  const [hata, hataYaz] = useState<string | null>(null);
  const gonder = () => {
    if (!d.ad.trim()) { hataYaz('Set adı gerekli.'); return; }
    if (!satirlar(d.sorular).length) { hataYaz('En az bir soru yazın.'); return; }
    void kaydet({ ...d, ad: d.ad.trim() });
  };
  return (
    <Pencere
      acik baslik={set.id ? 'Soru setini düzenle' : 'Yeni soru seti'} kapat={kapat} tur="yan"
      alt={(
        <div className="tc-ika-form-alt">
          {sil && <Dugme tur="tehlike" simge="trash" onClick={sil}>Sil</Dugme>}
          <span className="tc-ika-bosluk" />
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" onClick={gonder}>Kaydet</Dugme>
        </div>
      )}
    >
      <div className="tc-ika-form">
        <Girdi etiket="Set adı" value={d.ad} hata={hata && !d.ad.trim() ? hata : undefined} onChange={(e) => { dYaz({ ...d, ad: e.target.value }); }} />
        <Girdi etiket="Kategori" value={d.kategori ?? ''} onChange={(e) => { dYaz({ ...d, kategori: e.target.value }); }} />
        <Girdi etiket="Odak" value={d.odak ?? ''} onChange={(e) => { dYaz({ ...d, odak: e.target.value }); }} />
        <CokSatir etiket="Sorular" ipucu="Her satıra bir soru." rows={10} value={d.sorular} hata={hata && d.ad.trim() ? hata : undefined} onChange={(e) => { dYaz({ ...d, sorular: e.target.value }); }} />
      </div>
    </Pencere>
  );
}
