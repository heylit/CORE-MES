import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Pencere } from '../../../../ortak/arayuz/index.ts';
import { yardimAra } from '../analiz/kurallar.ts';
import { IK_YARDIM } from '../analiz/yardim.ts';
import type { IkEkranOzellikleri, IkGorunum } from '../gorunumler.ts';
import { IzinFormu } from '../izin-devam/index.tsx';
import { IzinTalebi } from '../islemlerim/izin-talebi.tsx';
import { kisininIzinleri } from '../islemlerim/kurallar.ts';
import { PersonelFormu } from '../personel/index.tsx';
import { ekipKimlikleri } from '../rol.ts';
import { ikAra, type AramaIslemi, type AramaSayfasi, type AramaSonucu } from './kurallar.ts';
import './arama.css';

interface Ozellikler {
  acik: boolean;
  kapat: () => void;
  o: IkEkranOzellikleri;
  sayfalar: readonly AramaSayfasi[];
  gun: string;
  kilavuzAc: (konu: string, vurgu: string) => void;
}

const kilavuzda = (q: string) => yardimAra(IK_YARDIM, q).map((s) => ({ konu: s.konu.kimlik, baslik: s.konu.baslik, ozet: s.konu.ozet }));

// Bugünkü ekranın "Ara" penceresi: yazdıkça sonuç, ↑ ↓ ile gezinme, Enter ile açma. Formu açan işlemler pencere kapanınca açılır.
export function AramaPenceresi({ acik, kapat, o, sayfalar, gun, kilavuzAc }: Ozellikler) {
  const [q, qYaz] = useState('');
  const [secili, seciliYaz] = useState(0);
  const [islem, islemYaz] = useState<AramaIslemi | null>(null);
  const liste = useRef<HTMLDivElement>(null);
  const kutuKimlik = useId();
  const { depo, rol, ben, yetki } = o;

  const sonuclar = useMemo(() => ikAra({
    rol, sayfalar, gun,
    personeller: depo.tur('emp'), adaylar: depo.tur('cand'), departmanlar: depo.tur('dept'), pozisyonlar: depo.tur('job'),
    ekip: rol === 'yonetici' && ben ? ekipKimlikleri(depo.tur('emp'), depo.tur('dept'), ben.id) : new Set<string>(),
    yazabilir: { personel: yetki.personelYaz, izin: yetki.izinYaz, izinTalep: yetki.izinTalep && ben !== null },
    kilavuz: kilavuzda,
  }, q), [depo, rol, ben, yetki, sayfalar, gun, q]);

  useEffect(() => { if (!acik) { qYaz(''); seciliYaz(0); } }, [acik]);
  useEffect(() => { liste.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [secili]);

  const sec = (s: AramaSonucu | undefined) => {
    if (!s) return;
    kapat();
    const h = s.hedef;
    if (h.tur === 'gorunum') o.git(h.gorunum as IkGorunum, h.kimlik);
    else if (h.tur === 'kilavuz') kilavuzAc(h.konu, q);
    else islemYaz(h.islem);
  };
  const tus = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); seciliYaz((i) => Math.min(sonuclar.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); seciliYaz((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); sec(sonuclar[secili]); }
  };

  return (
    <>
      <Pencere acik={acik} kapat={kapat} baslik="Ara">
        <div className="tc-ik-ara">
          <label className="tc-gizli-etiket" htmlFor={kutuKimlik}>Ara</label>
          <input
            id={kutuKimlik} type="search" className="tc-alan-kutu" autoComplete="off" autoFocus
            placeholder="Ara: personel, aday, departman, işlem, sayfa ya da kılavuz"
            role="combobox" aria-expanded="true" aria-controls={`${kutuKimlik}-liste`}
            value={q} onChange={(e) => { qYaz(e.target.value); seciliYaz(0); }} onKeyDown={tus}
          />
          <div ref={liste} id={`${kutuKimlik}-liste`} className="tc-ik-ara-liste" role="listbox" aria-label="Arama sonuçları">
            {sonuclar.length
              ? sonuclar.map((s, i) => (
                <button
                  key={`${s.tur}-${s.baslik}-${i}`} type="button" role="option" aria-selected={i === secili}
                  className="tc-ik-ara-satir" onClick={() => { sec(s); }}
                >
                  <span className="tc-ik-ara-tur">{s.tur}</span>
                  <span className="tc-ik-ara-metin"><b>{s.baslik}</b>{s.alt && <small>{s.alt}</small>}</span>
                </button>
              ))
              : <p className="tc-ik-ara-bos">“{q}” için sonuç bulunamadı.</p>}
          </div>
          <p className="tc-ik-ara-yardim">Enter ile açın, ↑ ↓ ile gezinin, Esc ile kapatın.</p>
        </div>
      </Pencere>
      {islem === 'personel-ekle' && (
        <PersonelFormu acik onDolu={{}} kapat={() => { islemYaz(null); }} kaydedildi={(p) => { islemYaz(null); o.git('calisan', p.id); }} />
      )}
      {islem === 'izin-gir' && <IzinFormu o={o} acik kayit={null} onDolu={{}} kapat={() => { islemYaz(null); }} />}
      {islem === 'izin-talep' && ben && (
        <IzinTalebi acik kapat={() => { islemYaz(null); }} personel={ben} kendiIzinleri={kisininIzinleri(depo.tur('leave'), ben.id)} motor={o.motor} />
      )}
    </>
  );
}
