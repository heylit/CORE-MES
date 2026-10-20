import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type {
  SonYerlerCevabi, Talep, TalepAcGovdesi, TalepAciliyeti, TalepCevabi, TalepKategorisi,
} from '#paylasilan/sozlesme/idari-isler.ts';
import { CokSatir, Dugme, Girdi, Kart, KodOkuyucu, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ACILIYET, ACILIYETLER, KATEGORI, KATEGORILER, SINIR } from './gorunum.ts';
import { useKorumaliGonderim, yazmaIletisi } from './yazma.ts';
import './idari-isler.css';

type Adim = 'konu' | 'yer' | 'ayrinti';

// Talep aç: üç adım (konu, yer, açıklama). Yer QR ile okunur, son kullanılanlardan seçilir ya da yazılır.
export function TalepAc() {
  const gezin = useNavigate();
  const istemci = useQueryClient();
  const gonderim = useKorumaliGonderim();
  const [adim, adimYaz] = useState<Adim>('konu');
  const [kategori, kategoriYaz] = useState<TalepKategorisi | null>(null);
  const [yer, yerYaz] = useState('');
  const [okut, okutYaz] = useState(false);
  const [aciklama, aciklamaYaz] = useState('');
  const [aciliyet, aciliyetYaz] = useState<TalepAciliyeti>('normal');
  const [hata, hataYaz] = useState<string | null>(null);
  const [bekliyor, bekliyorYaz] = useState(false);
  const [acilan, acilanYaz] = useState<Talep | null>(null);
  const sonYerler = useQuery({ queryKey: anahtarlar.sonYerler, queryFn: () => api.get<SonYerlerCevabi>('/idari-isler/taleplerim/son-yerler') });

  const yerSec = (y: string) => { yerYaz(y.trim().slice(0, SINIR.yer)); okutYaz(false); adimYaz('ayrinti'); };
  const bastan = () => { adimYaz('konu'); kategoriYaz(null); yerYaz(''); aciklamaYaz(''); aciliyetYaz('normal'); hataYaz(null); acilanYaz(null); };

  const gonder = async () => {
    if (kategori === null) return;
    bekliyorYaz(true);
    hataYaz(null);
    const govde: TalepAcGovdesi = { kategori, yer: yer.trim(), aciliyet, ...(aciklama.trim() === '' ? {} : { aciklama: aciklama.trim() }) };
    try {
      acilanYaz((await gonderim<TalepCevabi>('/idari-isler/talepler/ac', govde)).talep);
      void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    } catch (h) {
      hataYaz(yazmaIletisi(h, 'Talep gönderilemedi'));
    } finally {
      bekliyorYaz(false);
    }
  };

  if (acilan !== null) {
    return (
      <section className="tc-ii">
        <Kart>
          <div className="tc-ii-tamam" role="status">
            <span className="tc-ii-tamam-simge" aria-hidden="true"><Simge ad="check" boyut="b" /></span>
            <h2 className="tc-ii-baslik">Talebin iletildi</h2>
            <p className="mono">{acilan.no}</p>
            <p className="tc-ii-soluk">İdari işler talebi görünce durumu Taleplerim'de değişir.</p>
            <span className="tc-ii-dugmeler">
              <Dugme tur="birincil" simge="plus" onClick={bastan}>Yeni talep</Dugme>
              <Dugme simge="list" onClick={() => { void gezin('/idari-isler/taleplerim'); }}>Taleplerim</Dugme>
            </span>
          </div>
        </Kart>
      </section>
    );
  }

  return (
    <section className="tc-ii">
      <ol className="tc-ii-adimlar" aria-label="Adımlar">
        {(['konu', 'yer', 'ayrinti'] as const).map((a, i) => (
          <li key={a} aria-current={adim === a ? 'step' : undefined}>{i + 1}. {a === 'konu' ? 'Konu' : a === 'yer' ? 'Yer' : 'Açıklama'}</li>
        ))}
      </ol>

      {adim === 'konu' && (
        <Kart baslik="Sorun ne?">
          <div className="tc-ii-konular">
            {KATEGORILER.map((k) => (
              <button key={k} type="button" className="tc-ii-konu-dugme" aria-pressed={kategori === k}
                onClick={() => { kategoriYaz(k); adimYaz('yer'); }}>
                <Simge ad={KATEGORI[k].simge} boyut="b" />
                <span>{KATEGORI[k].etiket}</span>
              </button>
            ))}
          </div>
        </Kart>
      )}

      {adim === 'yer' && (
        <Kart baslik="Nerede?" sag={<Dugme simge="back" onClick={() => adimYaz('konu')}>Geri</Dugme>}>
          <div className="tc-ii-yigin">
            {okut
              ? <KodOkuyucu okundu={yerSec} ipucu="Alandaki yer etiketini okut" />
              : <Dugme tur="birincil" boyut="ana" simge="scan" onClick={() => okutYaz(true)}>Yer etiketini okut</Dugme>}
            {(sonYerler.data?.yerler.length ?? 0) > 0 && (
              <div className="tc-ii-yigin">
                <h3 className="tc-ii-ara-baslik">Son kullandığın yerler</h3>
                <div className="tc-ii-yerler">
                  {sonYerler.data?.yerler.map((y) => <Dugme key={y} simge="target" onClick={() => yerSec(y)}>{y}</Dugme>)}
                </div>
              </div>
            )}
            <form className="tc-ii-elle" onSubmit={(o) => { o.preventDefault(); if (yer.trim() !== '') yerSec(yer); }}>
              <Girdi etiket="Ya da yer yaz" placeholder="Örnek: Salon 2, kompresör odası" maxLength={SINIR.yer} value={yer} onChange={(o) => yerYaz(o.target.value)} />
              <Dugme type="submit" simge="next" disabled={yer.trim() === ''}>Devam</Dugme>
            </form>
          </div>
        </Kart>
      )}

      {adim === 'ayrinti' && kategori !== null && (
        <Kart baslik="Ayrıntı" sag={<Dugme simge="back" onClick={() => adimYaz('yer')}>Geri</Dugme>}>
          <div className="tc-ii-yigin">
            <p className="tc-ii-ozet"><Simge ad={KATEGORI[kategori].simge} /> <strong>{KATEGORI[kategori].etiket}</strong> · {yer}</p>
            <CokSatir etiket="Açıklama (isteğe bağlı)" maxLength={SINIR.aciklama} value={aciklama} onChange={(o) => aciklamaYaz(o.target.value)} />
            <div className="tc-ii-secimler" role="radiogroup" aria-label="Aciliyet">
              {ACILIYETLER.map((a) => (
                <button key={a} type="button" role="radio" aria-checked={aciliyet === a} className="tc-ii-secim" data-acil={a === 'acil' ? '' : undefined}
                  onClick={() => aciliyetYaz(a)}>
                  <Simge ad={ACILIYET[a].simge} /> {ACILIYET[a].etiket}
                </button>
              ))}
            </div>
            {hata !== null && <p className="tc-ii-hata" role="alert">{hata}</p>}
            <Dugme tur="birincil" boyut="ana" simge="check" yukleniyor={bekliyor} onClick={() => void gonder()}>Gönder</Dugme>
          </div>
        </Kart>
      )}
    </section>
  );
}
