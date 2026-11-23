import { useDeferredValue, useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { BelgeListesiCevabi, BelgeSatiri, BelgeTuru } from '#paylasilan/sozlesme/belge-merkezi.ts';
import { Dugme, Girdi, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { revKoduMetni } from './revizyon-kodu.ts';
import { duzenlenmisMi, turevAdaylari } from './turev-adaylari.ts';

// 3609 "Türev ekle" kaynak seçimi: üç eşit sütun, kaydırma yok; dar ekranda ikon üstte, etiket altta. Ortak Sekmeler kaydırmalı
// şerittir; bu seçim üç sabit seçenek olduğundan modülün kendi radyo kartıdır (Kullanım seçimiyle aynı dil).
export type TurevKaynagiSecenegi = 'yukle' | 'duzenle' | 'kayitli';
const KAYNAKLAR: readonly { anahtar: TurevKaynagiSecenegi; baslik: string; simge: SimgeAdi }[] = [
  { anahtar: 'yukle', baslik: 'Yükle', simge: 'upload' },
  { anahtar: 'duzenle', baslik: 'PDF düzenle', simge: 'edit' },
  { anahtar: 'kayitli', baslik: 'Kayıtlı PDF', simge: 'search' },
];

export function KaynakSecimi({ secili, sec, duzenleKapali }: { secili: TurevKaynagiSecenegi; sec: (k: TurevKaynagiSecenegi) => void; duzenleKapali: boolean }) {
  return (
    <fieldset className="tc-cz-kaynaklar">
      <legend className="tc-gizli-etiket">Türev kaynağı</legend>
      {KAYNAKLAR.map((k) => {
        const soluk = k.anahtar === 'duzenle' && duzenleKapali;
        return (
          <label key={k.anahtar} className={`tc-cz-kaynak${k.anahtar === secili ? ' tc-cz-kaynak-secili' : ''}${soluk ? ' tc-cz-kaynak-soluk' : ''}`}>
            <input type="radio" name="turev-kaynagi" value={k.anahtar} checked={k.anahtar === secili} aria-disabled={soluk || undefined} onChange={() => { sec(k.anahtar); }} />
            <Simge ad={k.simge} />
            <span>{k.baslik}</span>
            {k.anahtar === secili && <span className="tc-cz-kaynak-tik"><Simge ad="check" boyut="k" /></span>}
          </label>
        );
      })}
    </fieldset>
  );
}

export function PdfDegilSebebi({ yukleyeGec }: { yukleyeGec: () => void }) {
  return (
    <div className="tc-cz-sebep" role="status">
      <p className="tc-cz-simgeli"><Simge ad="alert" />Bu revizyonun dosyası PDF değil; PDF düzenleyici yalnız PDF açar. Dosyayı bilgisayardan yükleyebilirsiniz.</p>
      <Dugme simge="upload" onClick={yukleyeGec}>Yükle'ye geç</Dugme>
    </div>
  );
}

const ILK_N = 20;

// 3609 "Çizim Merkezi'nden seç": daha önce kaydedilmiş (çoğu zaman PDF düzenleyiciden çıkmış) PDF aranır, tek seçilir.
// Seçim üst bileşendedir: alttaki "Bağla" düğmesi pencerenin altlığındadır.
export function TurevAdayiSecici({ kaynakId, tur, secili, sec }: {
  kaynakId: number; tur: BelgeTuru; secili: BelgeSatiri | null; sec: (s: BelgeSatiri | null) => void;
}) {
  const [ara, araYaz] = useState('');
  const aranan = useDeferredValue(ara.trim());
  const sorgu = `?kullanim=orijinal&tur=${tur}&sayfaBoyu=${String(ILK_N)}${aranan === '' ? '' : `&ara=${encodeURIComponent(aranan)}`}`;
  const adaylar = useQuery({
    queryKey: [...anahtarlar.kok, 'turev-adayi', sorgu],
    queryFn: () => api.get<BelgeListesiCevabi>(`/cizimler${sorgu}`),
    placeholderData: keepPreviousData,
  });
  const satirlar = turevAdaylari(adaylar.data?.satirlar ?? [], kaynakId);
  // Seçili PDF yeni arama sonucunda yoksa seçim düşer: Bağla görünmeyen bir belgeye açık kalmaz.
  const seciliKimlik = secili?.id ?? null;
  const sonucGecerli = adaylar.data !== undefined && !adaylar.isPlaceholderData;
  const listedeVar = satirlar.some((s) => s.id === seciliKimlik);
  useEffect(() => { if (seciliKimlik !== null && sonucGecerli && !listedeVar) sec(null); }, [seciliKimlik, sonucGecerli, listedeVar, sec]);
  const kesik = (adaylar.data?.toplam ?? 0) > (adaylar.data?.satirlar.length ?? 0);
  return (
    <div className="tc-cz-aday-kutu">
      <Girdi etiket="Kayıtlı PDF'i ara" type="search" value={ara} maxLength={80} onChange={(e) => { araYaz(e.target.value); }} ipucu="Belge adı ya da resim no. Düzenlenmiş olanlar üstte." />
      {adaylar.isPending && <p className="tc-cz-ipucu" role="status">Liste yükleniyor.</p>}
      {!adaylar.isPending && adaylar.isFetching && <p className="tc-cz-ipucu" role="status">Aranıyor.</p>}
      {adaylar.isError && (
        <div className="tc-cz-sebep" role="alert">
          <p className="tc-cz-simgeli"><Simge ad="alert" />Belge listesi alınamadı.</p>
          <Dugme simge="rotate" onClick={() => { void adaylar.refetch(); }}>Yeniden dene</Dugme>
        </div>
      )}
      {!adaylar.isError && adaylar.data !== undefined && satirlar.length === 0 && (
        <div className="tc-cz-sebep" role="status">
          <p>{aranan === '' ? 'Bağlanabilir PDF yok. Yalnız türevi olmayan, etkin, aynı türde PDF belgeler listelenir.' : 'Eşleşen PDF yok.'}</p>
          {aranan !== '' && <Dugme onClick={() => { araYaz(''); }}>Aramayı temizle</Dugme>}
        </div>
      )}
      {satirlar.length > 0 && (
        <>
          <p className="tc-gizli-etiket" role="status" aria-live="polite">{`${String(satirlar.length)} PDF listelendi`}</p>
          <ul className="tc-cz-aday-liste" role="radiogroup" aria-label="Kayıtlı PDF'ler">
            {satirlar.map((s) => (
              <li key={s.id}>
                <label className={s.id === secili?.id ? 'tc-cz-aday tc-cz-aday-secili' : 'tc-cz-aday'}>
                  <input type="radio" name="turev-adayi" checked={s.id === secili?.id} onChange={() => { sec(s); }} />
                  <span className="tc-cz-aday-ad">{s.ad}</span>
                  <span className="tc-cz-aday-alt">
                    {duzenlenmisMi(s.ad) && <Rozet ton="bilgi" gorunum="cizgi">Düzenlenmiş</Rozet>}
                    <span className="mono">Rev {revKoduMetni((s.yayindakiHarf === null ? s.sonRevKodu : s.yayindakiRevKodu) ?? null)}</span>
                    {s.yayindakiHarf === null && <Rozet ton="uyari">Taslak</Rozet>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {kesik && <p className="tc-cz-ipucu" role="status">İlk {ILK_N} sonuç gösteriliyor; aramayı daraltın.</p>}
    </div>
  );
}
