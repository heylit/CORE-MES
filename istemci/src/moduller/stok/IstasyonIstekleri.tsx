import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { IstasyonSepetiCevabi, IstekKabulGovdesi, IstekReddetGovdesi, ItirazGovdesi, MalzemeIstegi, Teslim } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Girdi, Rozet, Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { miktarGirdisi, miktarMetni, zamanMetni } from './gorunum.ts';
import { useStokKomutu } from './ortak.tsx';
import { useStatuAdi } from './statu.ts';
import { TeslimSatiri } from './TeslimSatiri.tsx';

// Teslim et'in başı (soru 96): istasyonumdan istenenler kabul edilip teslim gönderilir ya da nedeniyle reddedilir; okutarak alınanlara
// süre bitene kadar itiraz edilir. İtiraz geri almaz: malzeme alanın istasyonunda serbestse iade teslimi açılır.
export function IstasyonIstekleri({ istenenler, alinanlar }: { istenenler: MalzemeIstegi[]; alinanlar: Teslim[] }) {
  if (istenenler.length === 0 && alinanlar.length === 0) return null;
  return (
    <>
      {istenenler.length > 0 && (
        <>
          <h3 className="tc-stok-teslim-baslik">Benden istenenler</h3>
          <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Benden istenenler">{istenenler.map((i) => <IstenenSatir key={i.id} i={i} />)}</ul>
        </>
      )}
      {alinanlar.length > 0 && (
        <>
          <h3 className="tc-stok-teslim-baslik">Okutarak alınanlar</h3>
          <ul className="tc-stok-isler tc-stok-teslim-liste" aria-label="Okutarak alınanlar">{alinanlar.map((t) => <AlinanSatir key={t.id} t={t} />)}</ul>
        </>
      )}
    </>
  );
}

function IstenenSatir({ i }: { i: MalzemeIstegi }) {
  const statuAdi = useStatuAdi();
  const kaynakId = i.kaynakIstasyonId ?? null;
  const [miktar, setMiktar] = useState(() => miktarMetni(i.miktar).replace(/\./g, ''));
  const [satir, setSatir] = useState('0');
  const [redAcik, setRedAcik] = useState(false);
  const [neden, setNeden] = useState('');
  const [kimlik, setKimlik] = useState(yeniIstekKimligi);
  // Hangi parti ve statüden gideceği kaynak istasyonun sepetinden seçilir; kabul eden o istasyonun kapsamındadır.
  const sepet = useQuery({
    queryKey: ['stok', 'teslim-kutusu', 'sepet', kaynakId ?? 0],
    queryFn: () => api.get<IstasyonSepetiCevabi>(`/stok/teslim-kutusu/sepet?istasyonId=${kaynakId}`),
    enabled: kaynakId !== null,
  });
  const satirlar = (sepet.data?.satirlar ?? []).filter((x) => x.malzemeId === i.malzemeId && Number(x.miktar) > 0);
  const secili = satirlar[Number(satir)];
  const kabul = useStokKomutu((g: IstekKabulGovdesi) => api.post(`/stok/malzeme-istekleri/${i.id}/kabul-et`, g), `${i.no} kabul edildi; teslim gönderildi.`, () => setKimlik(yeniIstekKimligi()));
  const red = useStokKomutu((g: IstekReddetGovdesi) => api.post(`/stok/malzeme-istekleri/${i.id}/reddet`, g), `${i.no} reddedildi.`);
  return (
    <li className="tc-stok-is tc-stok-teslim-satir">
      <div>
        <strong>{i.malzemeAd ?? `Malzeme #${i.malzemeId}`} · {miktarMetni(i.miktar)}</strong>
        <span>{i.kaynakIstasyonAd ?? 'İstasyon'} → {i.istasyonAd ?? 'istasyonsuz'} · {i.kisiAd ?? '—'}</span>
        <span className="tc-stok-mono">{i.no} · {zamanMetni(i.acilis)}</span>
        {i.aciklama && <span>{i.aciklama}</span>}
        {satirlar.length === 0 ? <span className="tc-stok-not">{sepet.isPending ? 'Sepet okunuyor…' : 'Bu istasyonda serbest yok; reddedin ya da gelince kabul edin.'}</span> : (
          <div className="tc-stok-dugmeler">
            {satirlar.length > 1 && (
              <Secim etiket="Parti" value={satir} onChange={(o) => setSatir(o.target.value)}
                secenekler={satirlar.map((x, n) => ({ deger: String(n), baslik: `${x.partiEtiketi ?? 'Partisiz'} · ${statuAdi(x.statuId)} · ${miktarMetni(x.miktar)}` }))} />
            )}
            <Girdi etiket="Gönderilen miktar" inputMode="decimal" value={miktar} onChange={(o) => setMiktar(o.target.value)} />
            <Dugme tur="birincil" simge="check" yukleniyor={kabul.komut.isPending} disabled={!secili || miktar.trim() === ''} onClick={() => secili && kabul.komut.mutate({
              surum: i.surum, miktar: miktarGirdisi(miktar), partiId: secili.partiId, statuId: secili.statuId, kaynakKimligi: kimlik,
            })}>Kabul et</Dugme>
          </div>
        )}
        <div className="tc-stok-dugmeler">
          <Dugme simge="x" onClick={() => setRedAcik((a) => !a)} aria-expanded={redAcik}>Reddet</Dugme>
        </div>
        {redAcik && (
          <div className="tc-stok-dugmeler">
            <Girdi etiket="Red nedeni" maxLength={200} value={neden} onChange={(o) => setNeden(o.target.value)} />
            <Dugme tur="tehlike" yukleniyor={red.komut.isPending} disabled={neden.trim() === ''} onClick={() => red.komut.mutate({ surum: i.surum, neden })}>Reddi gönder</Dugme>
          </div>
        )}
      </div>
      <Rozet ton="uyari">Bekliyor</Rozet>
      {kabul.onayPenceresi}
    </li>
  );
}

function AlinanSatir({ t }: { t: Teslim }) {
  const [acik, setAcik] = useState(false);
  const [neden, setNeden] = useState('');
  const itiraz = useStokKomutu((g: ItirazGovdesi) => api.post(`/stok/teslimler/${t.id}/itiraz`, g), `${t.no} için itiraz yazıldı.`, () => setAcik(false));
  return (
    <TeslimSatiri t={t}>
      {t.itiraz ? <span>İtiraz: {t.itiraz.neden} · {t.itiraz.kisiAd ?? '—'}{t.itiraz.iadeTeslimId ? ' · iade teslimi açıldı' : ''}</span> : (
        <>
          {t.itirazSonu && <span>İtiraz süresi: {zamanMetni(t.itirazSonu)}</span>}
          <div className="tc-stok-dugmeler"><Dugme simge="x" onClick={() => setAcik((a) => !a)} aria-expanded={acik}>İtiraz et</Dugme></div>
          {acik && (
            <div className="tc-stok-dugmeler">
              <Girdi etiket="İtiraz nedeni" maxLength={200} value={neden} onChange={(o) => setNeden(o.target.value)} />
              <Dugme tur="tehlike" yukleniyor={itiraz.komut.isPending} disabled={neden.trim() === ''} onClick={() => itiraz.komut.mutate({ surum: t.surum, neden })}>İtirazı gönder</Dugme>
            </div>
          )}
        </>
      )}
    </TeslimSatiri>
  );
}
