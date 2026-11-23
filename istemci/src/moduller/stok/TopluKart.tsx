import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RefakatKartlariCevabi, RefakatPartisiCevabi, SepetSatiri } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Kart, useBildirim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useDogrudanBasim } from '../etiket-merkezi/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { EmirOkutSecici } from './EmirSecici.tsx';
import { hataMetni, korumaliPost } from './ortak.tsx';
import './stok.css';

// Bir lotun sonucu: ya kart yeni açıldı (kartId), ya o emirde zaten açık kartı vardı (atlandi, kart açılmadı ve basılmadı), ya reddedildi (hata).
export type SatirSonucu = { satir: SepetSatiri; kartId: number | null; atlandi: string | null; hata: string | null };

const satirAdi = (s: SepetSatiri) => `${s.malzemeAd ?? `Kart ${s.malzemeId}`}${s.partiEtiketi ? ` · ${s.partiEtiketi}` : ''}`;

// Sepetteki kartsız lotlar tek emre tek dokunuşta karta döner: her lota bir kart (mevcut ac ucu lot başına çağrılır). Sunucu emirde lotun
// açık kartı varsa onu döndürür; istemci yeni mi var olan mı ayrımını açmadan önce okuduğu açık kart listesinden yapar: açık kartı olan lota
// çağrı gitmez ve basılmaz. Liste okunamaz ya da sınıra dayanırsa ayrım yapılamaz; kart açılır ama hiçbiri basılmaz, kullanıcıya söylenir.
// Biri reddedilirse öbürleri etkilenmez; sonuç sepet yenilense de görünür kalır (üst bileşen tutar), açılanlar bu cihazın varsayılan
// yazıcısına basılır (yoksa Etiket Merkezi'nde bekler).
export function TopluKartAc({ satirlar, secili, kartliSayisi, sonuc, sonucYaz }: {
  satirlar: readonly SepetSatiri[]; secili: readonly SepetSatiri[]; kartliSayisi: number; sonuc: readonly SatirSonucu[] | null; sonucYaz: (s: SatirSonucu[] | null) => void;
}) {
  const [emir, setEmir] = useState('');
  const basim = useDogrudanBasim('refakat-partisi');
  const { bildir } = useBildirim();
  const istemci = useQueryClient();
  const ac = useMutation({
    mutationFn: async (hedefler: readonly SepetSatiri[]): Promise<{ liste: SatirSonucu[]; ayirt: boolean }> => {
      const emirId = Number(emir);
      const onceki = await api.get<RefakatKartlariCevabi>('/stok/refakat-kartlari?durum=acik').catch(() => null);
      const ayirt = onceki !== null && !onceki.sinirda;
      const varOlan = new Map((onceki?.kartlar ?? []).filter((k) => k.refakat.uretimEmriId === emirId && k.refakat.partiId !== null).map((k) => [k.refakat.partiId, k.refakat.etiket]));
      const liste: SatirSonucu[] = [];
      for (const satir of hedefler) {
        const etiket = satir.partiId === null ? undefined : varOlan.get(satir.partiId);
        if (etiket !== undefined) { liste.push({ satir, kartId: null, atlandi: etiket, hata: null }); continue; }
        try {
          const c = await korumaliPost<RefakatPartisiCevabi>('/stok/refakat-partileri/ac', { uretimEmriId: emirId, sepetSatirId: satir.id });
          liste.push({ satir, kartId: c.refakat.id, atlandi: null, hata: null });
        } catch (h) {
          liste.push({ satir, kartId: null, atlandi: null, hata: hataMetni(h) });
        }
      }
      return { liste, ayirt };
    },
    onSuccess: async ({ liste, ayirt }) => {
      sonucYaz(liste);
      const idler = liste.flatMap((x) => (x.kartId === null ? [] : [x.kartId]));
      if (idler.length > 0 && !ayirt) bildir('bilgi', `${idler.length} refakat kartı açıldı; hangisinin yeni olduğu ayırt edilemediği için yazıcıya gönderilmedi. Kartları Etiket Merkezi'nden basın.`);
      else if (idler.length > 0) {
        if (basim.yazici !== null) basim.bas(idler);
        bildir('tamam', basim.yazici !== null ? `${idler.length} refakat kartı açıldı, yazıcıya gönderildi.` : `${idler.length} refakat kartı açıldı; bu cihazda varsayılan yazıcı yok, kartları Etiket Merkezi'nden basın.`);
      }
      await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    },
  });
  const basla = (hedefler: readonly SepetSatiri[]) => { sonucYaz(null); ac.mutate(hedefler); };
  const hatalilar = (sonuc ?? []).filter((x) => x.hata !== null);
  const atlananlar = (sonuc ?? []).filter((x) => x.atlandi !== null);
  return (
    <Kart baslik="Emre toplu refakat kartı">
      <div className="tc-stok-form tc-stok-toplu-kart">
        {satirlar.length > 0 && (
          <>
            <p className="tc-stok-not">Tek emir için kartsız lotların hepsine birer refakat kartı açılır; adet her kart için otomatiktir. Yalnız bazıları için, satırlardan lotu seçip "Sadece seçili lot" deyin.{kartliSayisi > 0 ? ` Kartı olan ${kartliSayisi} lot atlanır.` : ''}</p>
            <EmirOkutSecici deger={emir} degistir={setEmir} />
            <div className="tc-stok-eylem">
              <Dugme tur="birincil" simge="printer" disabled={emir === ''} yukleniyor={ac.isPending} onClick={() => basla(satirlar)}>{satirlar.length} lot için kart aç ve bas</Dugme>
              <Dugme tur="ikincil" simge="x" disabled={emir === '' || secili.length === 0} yukleniyor={ac.isPending} onClick={() => basla(secili)}>{secili.length > 0 ? `Sadece seçili lot (${secili.length})` : 'Sadece seçili lot'}</Dugme>
            </div>
            {emir === '' && <p className="tc-stok-not">Önce emri okutun ya da listeden seçin; düğmeler ondan sonra açılır.</p>}
            {emir !== '' && secili.length === 0 && <p className="tc-stok-not">"Sadece seçili lot" için önce satırlarda en az bir lotu işaretleyin.</p>}
          </>
        )}
        {hatalilar.length > 0 && (
          <ul className="tc-stok-bilgi tc-stok-bilgi-uyari" role="alert" aria-label="Açılamayan kartlar">
            {hatalilar.map((x) => <li key={x.satir.id}>{satirAdi(x.satir)}: {x.hata}</li>)}
          </ul>
        )}
        {atlananlar.length > 0 && (
          <ul className="tc-stok-bilgi" aria-label="Atlanan lotlar">
            {atlananlar.map((x) => <li key={x.satir.id}>{satirAdi(x.satir)}: bu emirde zaten açık kartı var ({x.atlandi}); yeni kart açılmadı, basılmadı.</li>)}
          </ul>
        )}
        {sonuc !== null && satirlar.length === 0 && <div className="tc-stok-eylem"><Dugme tur="ikincil" onClick={() => sonucYaz(null)}>Tamam</Dugme></div>}
      </div>
    </Kart>
  );
}
