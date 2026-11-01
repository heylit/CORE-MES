import { useState } from 'react';
import { ACILIYETLER, ACILIYET_ADLARI, SINIFLANDIRMA_SORU_METINLERI, SINIFLAR, SINIF_ADLARI, onerilenSinif, type Aciliyet, type Cevap, type SiniflandirmaSorusu, type Sinif } from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import type { SiniflandirGovdesi, TalepCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { Dugme, Girdi, Kart, Secim } from '../../../ortak/arayuz/index.ts';
import { useKomut } from '../komut.ts';
import { KOK } from '../gosterim.tsx';

type Cevaplar = Record<SiniflandirmaSorusu, Cevap | null>;
const BOS: Cevaplar = { cizim: null, fff: null, proses: null, sure: null };

// Prototipteki ayrım testi: soru, önceki cevaba göre açılır. Kapanan dalın cevabı gönderilmez.
function gorunenSorular(c: Cevaplar): SiniflandirmaSorusu[] {
  if (c.cizim === 'evet') return ['cizim', 'fff'];
  if (c.cizim === 'hayir') return c.proses === 'hayir' ? ['cizim', 'proses', 'sure'] : ['cizim', 'proses'];
  return ['cizim'];
}

function EvetHayir({ ad, soru, deger, degistir }: { ad: string; soru: string; deger: Cevap | null; degistir: (c: Cevap) => void }) {
  return (
    <div className="tc-dy-evet-hayir" role="radiogroup" aria-label={soru}>
      {(['evet', 'hayir'] as const).map((c) => (
        <label key={c}>
          <input type="radio" name={ad} value={c} checked={deger === c} onChange={() => { degistir(c); }} />
          {c === 'evet' ? 'Evet' : 'Hayır'}
        </label>
      ))}
    </div>
  );
}

export function Siniflandirma({ talep }: { talep: TalepCevabi }) {
  const [cevaplar, cevaplarYaz] = useState<Cevaplar>(BOS);
  const [secilenSinif, secilenSinifYaz] = useState<Sinif | null>(null);
  const [aciliyet, aciliyetYaz] = useState<Aciliyet>(talep.aciliyet);
  const [not, notYaz] = useState('');
  const komut = useKomut(`${KOK}/talepler/${talep.id}/siniflandir`, () => {}, 'Talep sınıflandırılamadı');
  const sorular = gorunenSorular(cevaplar);
  const oneri = onerilenSinif(cevaplar);
  // Seçim yapılmadıysa önerilen sınıf, öneri yoksa açanın ön tipi; o da yoksa D1 (prototipte listenin ilki).
  const sinif = secilenSinif ?? (oneri !== null && oneri !== 'planlama' ? oneri : talep.onSinif ?? 'D1');

  const cevapla = (soru: SiniflandirmaSorusu, c: Cevap) => {
    cevaplarYaz((onceki) => {
      const yeni = { ...onceki, [soru]: c };
      const acik = new Set(gorunenSorular(yeni));
      return { cizim: yeni.cizim, fff: acik.has('fff') ? yeni.fff : null, proses: acik.has('proses') ? yeni.proses : null, sure: acik.has('sure') ? yeni.sure : null };
    });
    secilenSinifYaz(null);
  };
  const gonder = () => {
    const govde: SiniflandirGovdesi = { sinif, aciliyet, cevaplar, not, surum: talep.surum };
    komut.gonder(govde);
  };

  return (
    <Kart baslik="Sınıflandırma">
      <div className="tc-dy-form">
        <p className="tc-dy-soluk">
          Sorular, değişikliğin tasarım mı, proses mi, yoksa yalnızca planlama verisi mi olduğunu ayırır. Planlama verisi (süre, tezgâh tercihi) ECO gerektirmez.
        </p>
        <ul className="tc-dy-sorular">
          {sorular.map((s) => (
            <li key={s}>
              <span>{SINIFLANDIRMA_SORU_METINLERI[s]}</span>
              <EvetHayir ad={`soru-${s}`} soru={SINIFLANDIRMA_SORU_METINLERI[s]} deger={cevaplar[s]} degistir={(c) => { cevapla(s, c); }} />
            </li>
          ))}
        </ul>
        {oneri === 'planlama' && (
          <p className="tc-dy-not tc-dy-not-uyari">
            Bu bir planlama parametresi değişikliği. ECO gerekmez; planlama parametresi olarak ilgili modülde sürümlenir.
            Bu cevaplarla talep sınıflandırılamaz; cevaplar yanlışsa düzeltin.
          </p>
        )}
        {oneri !== null && oneri !== 'planlama' && <p className="tc-dy-not tc-dy-not-tamam">Önerilen sınıf: <strong>{SINIF_ADLARI[oneri]}</strong></p>}
        <div className="tc-dy-satir tc-dy-satir-alt">
          <Secim etiket="Sınıf" value={sinif} onChange={(e) => { secilenSinifYaz(e.target.value as Sinif); }} secenekler={SINIFLAR.map((s) => ({ deger: s, baslik: SINIF_ADLARI[s] }))} />
          <Secim etiket="Aciliyet" value={aciliyet} onChange={(e) => { aciliyetYaz(e.target.value as Aciliyet); }} secenekler={ACILIYETLER.map((a) => ({ deger: a, baslik: ACILIYET_ADLARI[a] }))} />
          <Girdi etiket="Not" value={not} onChange={(e) => { notYaz(e.target.value); }} placeholder="İsteğe bağlı" maxLength={1000} />
          <Dugme tur="birincil" simge="check" yukleniyor={komut.yukleniyor} disabled={oneri === 'planlama'} onClick={gonder}>Sınıflandır</Dugme>
        </div>
        {komut.hata && <p className="tc-dy-hata" role="alert">{komut.hata}</p>}
      </div>
    </Kart>
  );
}
