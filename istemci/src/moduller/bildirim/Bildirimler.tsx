import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type {
  BildirimListeCevabi, BildirimListeDurumu, BildirimTercihDegistirGovdesi, BildirimTercihleriCevabi, BildirimTercihSatiri,
} from '#paylasilan/sozlesme/bildirim.ts';
import { DurumKutusu, Dugme, Kart, Sayfalama, Sekmeler, Simge, useBildirim, type Sekme } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { modulAdi, modulSimgesi, ONEM_ADI } from './gorunum.ts';
import { BildirimSatiri, BosListe, useBildirimKomutlari } from './ortak.tsx';
import './bildirim.css';

type Gorunum = 'gelen' | 'arsiv' | 'tercihler';
const SEKMELER: readonly Sekme<Gorunum>[] = [
  { anahtar: 'gelen', baslik: 'Gelenler', simge: 'bell' },
  { anahtar: 'arsiv', baslik: 'Arşiv', simge: 'layers' },
  { anahtar: 'tercihler', baslik: 'Tercihlerim', simge: 'gear' },
];
const YOL: Record<Gorunum, string> = { gelen: '/profil/bildirimler', arsiv: '/profil/bildirimler/arsiv', tercihler: '/profil/bildirimler/tercihler' };

type Suzgec = Exclude<BildirimListeDurumu, 'arsiv'>;
const SUZGECLER: readonly { anahtar: Suzgec; baslik: string }[] = [
  { anahtar: 'gelen', baslik: 'Hepsi' },
  { anahtar: 'okunmamis', baslik: 'Okunmamış' },
  { anahtar: 'onemli', baslik: 'Uyarı ve acil' },
];

function Cerceve({ gorunum, children }: { gorunum: Gorunum; children: React.ReactNode }) {
  const git = useNavigate();
  return (
    <div className="tc-bildirim-sayfa">
      <Sekmeler etiket="Bildirimler" sekmeler={SEKMELER} secili={gorunum} sec={(a) => { void git(YOL[a]); }} />
      {children}
    </div>
  );
}

function Liste({ durum, arsivde }: { durum: BildirimListeDurumu; arsivde: boolean }) {
  const [sayfa, sayfaYaz] = useState(1);
  const { arsivle } = useBildirimKomutlari();
  const liste = useQuery({
    queryKey: anahtarlar.liste(durum, sayfa),
    queryFn: () => api.get<BildirimListeCevabi>(`/bildirimler?durum=${durum}&sayfa=${sayfa}`),
  });
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;
  const v = liste.data;
  if (v.satirlar.length === 0) {
    return <BosListe metin={arsivde ? 'Arşiv boş.' : durum === 'okunmamis' ? 'Okunmamış bildirim yok.' : 'Bildirim yok.'} />;
  }
  return (
    <>
      <ul className="tc-bildirim-liste tc-bildirim-kutu">
        {v.satirlar.map((b) => <BildirimSatiri key={b.id} b={b} arsivle={arsivde ? undefined : () => arsivle.mutate(b.id)} />)}
      </ul>
      <Sayfalama sayfa={v.sayfa} sayfaBoyu={v.sayfaBoyu} toplam={v.toplam} satirSayisi={v.satirlar.length} degistir={sayfaYaz} />
    </>
  );
}

export function Gelenler() {
  const [suzgec, suzgecYaz] = useState<Suzgec>('gelen');
  const { tumu } = useBildirimKomutlari();
  return (
    <Cerceve gorunum="gelen">
      <div className="tc-bildirim-suzgec">
        {SUZGECLER.map((s) => (
          <button key={s.anahtar} type="button" className="tc-bildirim-cip" aria-pressed={suzgec === s.anahtar} onClick={() => suzgecYaz(s.anahtar)}>
            {s.baslik}
          </button>
        ))}
        <span className="tc-bildirim-ara" />
        <Dugme simge="check" onClick={() => tumu.mutate()} yukleniyor={tumu.isPending}>Tümünü okundu yap</Dugme>
      </div>
      <Liste key={suzgec} durum={suzgec} arsivde={false} />
      <p className="tc-bildirim-not">Satıra basınca okundu olur ve kayıt açılır. Kaldırdıklarınız Arşiv'de durur; bildirim silinmez.</p>
    </Cerceve>
  );
}

export function Arsiv() {
  return (
    <Cerceve gorunum="arsiv">
      <Liste durum="arsiv" arsivde />
    </Cerceve>
  );
}

function Anahtar({ acik, etiket, kilitli = false, degistir }: { acik: boolean; etiket: string; kilitli?: boolean; degistir?: (acik: boolean) => void }) {
  return (
    <label className="tc-bildirim-anahtar" title={etiket}>
      <input type="checkbox" role="switch" checked={acik} disabled={kilitli} aria-label={etiket} onChange={(o) => degistir?.(o.target.checked)} />
      <span aria-hidden="true" />
    </label>
  );
}

function TercihSatiri({ s, epostaVar, yaz, bekliyor }: {
  s: BildirimTercihSatiri; epostaVar: boolean; yaz: (g: BildirimTercihDegistirGovdesi) => void; bekliyor: boolean;
}) {
  const govde = (ek: Partial<BildirimTercihDegistirGovdesi>): BildirimTercihDegistirGovdesi => ({ tur: s.tur, mesaj: s.mesaj, eposta: s.eposta ?? false, ...ek });
  return (
    <li className="tc-bildirim-tercih">
      <span className={`tc-bildirim-simge tc-bildirim-${s.onem}`}><Simge ad={modulSimgesi(s.kaynakModul)} /></span>
      <span className="tc-bildirim-govde">
        <span className="tc-bildirim-baslik">{s.baslik}</span>
        <span className="tc-bildirim-kaynak">{modulAdi(s.kaynakModul)} · {ONEM_ADI[s.onem]}{s.varsayilan ? ' · varsayılan' : ''}</span>
      </span>
      <span className="tc-bildirim-kanallar">
        <span className="tc-bildirim-kanal"><Simge ad="bell" boyut="k" /><span>Uygulama</span><Anahtar acik kilitli etiket={`${s.baslik}: uygulama, hep açık`} /></span>
        <span className="tc-bildirim-kanal">
          <Simge ad="users" boyut="k" /><span>Mesaj</span>
          <Anahtar acik={s.mesaj} kilitli={bekliyor} etiket={`${s.baslik}: mesaj`} degistir={(mesaj) => yaz(govde({ mesaj }))} />
        </span>
        {epostaVar && (
          <span className="tc-bildirim-kanal">
            <Simge ad="upload" boyut="k" /><span>E-posta</span>
            <Anahtar acik={s.eposta ?? false} kilitli={bekliyor} etiket={`${s.baslik}: e-posta`} degistir={(eposta) => yaz(govde({ eposta }))} />
          </span>
        )}
      </span>
    </li>
  );
}

export function Tercihler() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const sorgu = useQuery({ queryKey: anahtarlar.tercihler, queryFn: () => api.get<BildirimTercihleriCevabi>('/bildirimler/tercihler') });
  const yaz = useMutation({
    mutationFn: (g: BildirimTercihDegistirGovdesi) => api.post<BildirimTercihleriCevabi>('/bildirimler/tercihler/degistir', g),
    onSuccess: (v) => istemci.setQueryData(anahtarlar.tercihler, v),
    onError: (h) => bildir('hata', hataIletisi(h, 'Tercih kaydedilemedi.')),
  });
  return (
    <Cerceve gorunum="tercihler">
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
        : sorgu.isError ? <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />
        : (
          <Kart baslik="Hangi olay hangi kanaldan gelsin">
            {(!sorgu.data.kanallar.mesaj || !sorgu.data.kanallar.eposta) && (
              <p className="tc-bildirim-serit">
                <Simge ad="alert" boyut="k" />
                Mesaj ve e-posta kanalları henüz açılmadı. Seçimleriniz saklanır, kanal açılınca geçerli olur; o zamana kadar bildirimler zile gelir.
              </p>
            )}
            {sorgu.data.satirlar.length === 0 ? <BosListe metin="Yetkinize göre size gelen bir olay türü yok. Size gelen bildirimler yine zilde görünür." /> : (
              <ul className="tc-bildirim-liste">
                {sorgu.data.satirlar.map((s) => (
                  <TercihSatiri key={s.tur} s={s} epostaVar={sorgu.data.epostaSecilebilir} yaz={(g) => yaz.mutate(g)} bekliyor={yaz.isPending} />
                ))}
              </ul>
            )}
            <p className="tc-bildirim-not">Uygulama bildirimi kapatılamaz: kayıt her zaman tutulur. Değişiklik anında kaydedilir.</p>
          </Kart>
        )}
    </Cerceve>
  );
}
