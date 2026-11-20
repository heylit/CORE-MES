import { useNavigate } from 'react-router-dom';
import type { AyniDosyaCevabi, AyniDosyaYeri } from '#paylasilan/sozlesme/dosya.ts';
import { Dugme, Pencere, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';

// Aynı dosya uyarısı (kart 3468-1). Yüklemeden önce içerik özetiyle sorulur; sunucu yalnız kişinin görebildiği yerleri verir.
// Uyarıdır: kullanıcı "Yine de ..." ile sürdürür. Ortak Dosyalar bu pencereyi disari.ts üzerinden kullanır.

export function ayniDosyaYerleri(yol: '/cizimler/ayni-dosya' | '/ortak-dosyalar/ayni-dosya', ozet: string): Promise<AyniDosyaYeri[]> {
  return api.get<AyniDosyaCevabi>(`${yol}?ozet=${ozet}`).then((c) => c.yerler);
}

const DURUM_TONU: Record<string, RozetTonu> = { 'Yayında': 'tamam', 'Taslak': 'uyari', 'Son sürüm': 'bilgi' };

export function AyniDosyaPenceresi({ dosyaAdi, yerler, devamMetni, devam, vazgec }: {
  dosyaAdi: string; yerler: readonly AyniDosyaYeri[]; devamMetni: string; devam: () => void; vazgec: () => void;
}) {
  const yonlendir = useNavigate();
  return (
    <Pencere
      acik
      kapat={vazgec}
      baslik="Bu dosya zaten yüklü"
      alt={(
        <>
          <Dugme onClick={vazgec}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="upload" onClick={devam}>{devamMetni}</Dugme>
        </>
      )}
    >
      <div className="tc-cz-form">
        <p className="tc-cz-simgeli"><Simge ad="alert" /><span>Seçtiğiniz <b className="mono">{dosyaAdi}</b> içerik olarak birebir aynı olan dosyalar:</span></p>
        <ul className="tc-cz-ayni-liste">
          {yerler.map((y) => (
            <li key={`${y.yol}|${y.ayrinti}`}>
              <div className="tc-cz-rev-ust">
                <Simge ad={y.kaynak === 'cizimler' ? 'file' : 'layers'} />
                <b>{y.baslik}</b>
                {y.durum !== null && <Rozet ton={DURUM_TONU[y.durum] ?? 'pasif'}>{y.durum}</Rozet>}
              </div>
              <p className="tc-cz-ipucu">{y.ayrinti}</p>
              <div className="tc-cz-rev-arac">
                <Dugme simge="eye" onClick={() => { vazgec(); void yonlendir(y.yol); }} aria-label={`${y.baslik} aç`}>Aç</Dugme>
              </div>
            </li>
          ))}
        </ul>
        <p className="tc-cz-ipucu">Yalnız görmeye yetkiniz olan yerler listelenir.</p>
      </div>
    </Pencere>
  );
}
