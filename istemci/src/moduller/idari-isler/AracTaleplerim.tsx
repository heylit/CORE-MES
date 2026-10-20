import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AracGoreviCevabi, AracGorevleriCevabi, AracTalebiAcGovdesi } from '#paylasilan/sozlesme/idari-isler.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Kart, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GorevKarti } from './GorevKarti.tsx';
import { SINIR, bugunTarihi } from './gorunum.ts';
import { useGorevKomutu, useKorumaliGonderim, yazmaIletisi } from './yazma.ts';
import './idari-isler.css';

// Araç talebim (247 a): çalışan kendi adına araç görevi ister; idari işler araç verip onaylar. Onaylanana kadar ya da araç çıkmadan
// geri çekilir.
export function AracTaleplerim() {
  const liste = useQuery({ queryKey: anahtarlar.aracTaleplerim, queryFn: () => api.get<AracGorevleriCevabi>('/idari-isler/arac-taleplerim') });
  const komut = useGorevKomutu();
  const { bildir } = useBildirim();
  const [bekleyen, bekleyenYaz] = useState<number | null>(null);

  const geriCek = async (id: number, surum: number) => {
    bekleyenYaz(id);
    try {
      await komut({ id, surum }, 'geri-cek');
      bildir('tamam', 'Araç talebi geri çekildi');
    } catch (h) {
      bildir('hata', yazmaIletisi(h, 'Geri çekilemedi'));
    } finally {
      bekleyenYaz(null);
    }
  };

  return (
    <section className="tc-ii">
      <TalepFormu />
      <Kart baslik="Araç taleplerim" sag={<Dugme simge="rotate" aria-label="Yenile" onClick={() => { void liste.refetch(); }} yukleniyor={liste.isFetching} />}>
        {liste.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Araç talepleri alınamadı')} yenile={() => { void liste.refetch(); }} />
        ) : liste.isPending ? (
          <DurumKutusu durum="yukleniyor" />
        ) : liste.data.gorevler.length === 0 ? (
          <DurumKutusu durum="bos" mesaj="Araç talebin yok." />
        ) : (
          <ul className="tc-ii-liste">
            {liste.data.gorevler.map((g) => (
              <li key={g.id} className="tc-ii-is">
                <GorevKarti gorev={g} />
                {(g.durum === 'bekliyor' || g.durum === 'onaylandi') && (
                  <Dugme simge="x" yukleniyor={bekleyen === g.id} onClick={() => void geriCek(g.id, g.surum)}>Geri çek</Dugme>
                )}
              </li>
            ))}
          </ul>
        )}
      </Kart>
    </section>
  );
}

function TalepFormu() {
  const istemci = useQueryClient();
  const gonderim = useKorumaliGonderim();
  const { bildir } = useBildirim();
  const [amac, amacYaz] = useState('');
  const [varis, varisYaz] = useState('');
  const [tarih, tarihYaz] = useState(bugunTarihi);
  const [donus, donusYaz] = useState(bugunTarihi);
  const [aciklama, aciklamaYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const [bekliyor, bekliyorYaz] = useState(false);

  const eksik = [
    ...(varis.trim() === '' ? ['gidilecek yer'] : []),
    ...(amac.trim() === '' ? ['amaç'] : []),
    ...(tarih === '' ? ['gidiş'] : []),
    ...(donus === '' ? ['dönüş'] : []),
  ];

  const gonder = async () => {
    bekliyorYaz(true);
    hataYaz(null);
    const govde: AracTalebiAcGovdesi = {
      amac: amac.trim(), varis: varis.trim(), tarih, donusTarihi: donus, ...(aciklama.trim() === '' ? {} : { aciklama: aciklama.trim() }),
    };
    try {
      await gonderim<AracGoreviCevabi>('/idari-isler/arac-gorevleri/ac', govde);
      bildir('tamam', 'Araç talebin iletildi');
      amacYaz(''); varisYaz(''); aciklamaYaz('');
      void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    } catch (h) {
      hataYaz(yazmaIletisi(h, 'Talep gönderilemedi'));
    } finally {
      bekliyorYaz(false);
    }
  };

  return (
    <Kart baslik="Araç iste">
      <div className="tc-ii-yigin">
        <Girdi etiket="Gidilecek yer" required maxLength={SINIR.varis} placeholder="Örnek: Deneme OSB, tedarikçi ziyareti" value={varis}
          onChange={(o) => varisYaz(o.target.value)} />
        <Girdi etiket="Amaç" required maxLength={SINIR.amac} value={amac} onChange={(o) => amacYaz(o.target.value)} />
        <div className="tc-ii-iki">
          <Girdi etiket="Gidiş" type="date" required value={tarih} onChange={(o) => tarihYaz(o.target.value)} />
          <Girdi etiket="Dönüş" type="date" required value={donus} onChange={(o) => donusYaz(o.target.value)} />
        </div>
        <CokSatir etiket="Açıklama (isteğe bağlı)" maxLength={SINIR.not} value={aciklama} onChange={(o) => aciklamaYaz(o.target.value)}
          ipucu="Saat, yolcu sayısı, yük" />
        {eksik.length > 0 && <p className="tc-ii-soluk">Eksik: {eksik.join(', ')}</p>}
        {hata !== null && <p className="tc-ii-hata" role="alert">{hata}</p>}
        <Dugme tur="birincil" simge="check" disabled={eksik.length > 0} yukleniyor={bekliyor} onClick={() => void gonder()}>Talep gönder</Dugme>
      </div>
    </Kart>
  );
}
