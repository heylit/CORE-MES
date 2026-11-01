import { useState } from 'react';
import { Dugme, Girdi, Pencere, useBildirim } from '../../../../ortak/arayuz/index.ts';
import type { Pozisyon } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { yayindaIsaretle, gunEkle, type IlanKanali } from './kurallar.ts';
import { bugun, KanalBaglantisi } from './parcalar.tsx';
import { panoyaYaz } from './SoruBankasi.tsx';

// Yayın asistanı: yayınlanmamış her kanal için sırayla metni kopyala, siteyi aç, yayınladım olarak işaretle (bugünkü akış).
export function YayinAsistani({ pozisyon, kanallar, metin, kapat }: {
  pozisyon: () => Pozisyon | null; kanallar: readonly IlanKanali[]; metin: (k: IlanKanali) => string; kapat: () => void;
}) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const [sira, siraYaz] = useState(0);
  const [isaretli, isaretliYaz] = useState(0);
  const [link, linkYaz] = useState('');
  const [kopya, kopyaYaz] = useState<'' | 'tamam' | 'hata'>('');
  const k = kanallar[sira];
  const p = pozisyon();
  if (!k || !p) return null;

  const bitir = (n: number) => { kapat(); bildir('tamam', n ? `Yayın asistanı tamamlandı: ${n} kanal yayında.` : 'Yayın asistanı kapatıldı.'); };
  const ilerle = (n: number) => {
    linkYaz(''); kopyaYaz('');
    if (sira + 1 < kanallar.length) siraYaz(sira + 1); else bitir(n);
  };
  const yayinladim = async () => {
    const guncel = pozisyon();
    if (!guncel) return;
    const gun = bugun();
    const { pozisyon: yeni } = yayindaIsaretle(guncel, k.id, { tarih: gun, bitis: guncel.sonBasvuru || gunEkle(gun, 30), link: link.trim(), not: '' }, gun);
    try {
      await komut.kaydet(yeni);
    } catch {
      return;
    }
    isaretliYaz(isaretli + 1);
    ilerle(isaretli + 1);
  };
  const kapatirken = () => { kapat(); if (isaretli) bildir('tamam', `${isaretli} kanal yayında olarak işaretlendi.`); };

  return (
    <Pencere
      acik kapat={kapatirken} baslik={`Yayın asistanı: ${sira + 1}. kanal / ${kanallar.length}`}
      alt={(
        <div className="tc-ika-form-alt">
          <Dugme onClick={() => { ilerle(isaretli); }}>Bu kanalı atla</Dugme>
          <span className="tc-ika-bosluk" />
          <Dugme tur="birincil" simge="check" onClick={() => { void yayinladim(); }}>{sira + 1 < kanallar.length ? 'Yayınladım, sonraki kanal' : 'Yayınladım, bitir'}</Dugme>
        </div>
      )}
    >
      <div className="tc-ika-form">
        <div className="tc-ika-satir"><b>{k.ad}</b><span className="tc-ika-etiket">{`${p.ilanKodu ?? ''}${k.kod ? `-${k.kod}` : ''}`}</span></div>
        <ol className="tc-ika-asistan">
          <li>
            <span>İlan metnini kopyalayın.</span>
            <Dugme tur="birincil" simge="file" onClick={() => {
              void panoyaYaz(metin(k)).then((t) => { kopyaYaz(t ? 'tamam' : 'hata'); if (!t) bildir('hata', 'Otomatik kopyalanamadı. İlan metni sekmesinden kanalı seçip kopyalayın.'); });
            }}
            >
              {kopya === 'tamam' ? 'Kopyalandı' : kopya === 'hata' ? 'Kopyalanamadı' : 'Metni kopyala'}
            </Dugme>
          </li>
          <li>
            <span>{k.url ? 'Kanalın işveren panelini açın, oturum açıp ilanı yapıştırın ve yayınlayın.' : 'İlanı bu kanalda paylaşın (ör. şirket içi duyuru, web sitesi).'}</span>
            <KanalBaglantisi kanal={k} />
          </li>
          <li>
            <Girdi etiket="Yayınlanan ilanın bağlantısını ekleyin (isteğe bağlı)." type="url" placeholder="https://" value={link} onChange={(e) => { linkYaz(e.target.value); }} />
          </li>
        </ol>
        <div className="tc-ika-noktalar" aria-hidden="true">
          {kanallar.map((x, i) => <i key={x.id} data-durum={i < sira ? 'bitti' : i === sira ? 'simdi' : undefined} />)}
        </div>
      </div>
    </Pencere>
  );
}
