import { useMemo, useState, type MouseEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dugme, Girdi, Pencere, Rozet, Secim, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { useYetki } from '../../ortak/veri/yetki.ts';
import type { GirisCevabi, RafGozleriCevabi, TakimSatiri } from '#paylasilan/sozlesme/takimhane.ts';
import { anahtarlar } from './anahtarlar.ts';
import { adetMetni } from './gosterim.ts';
import { IkiGorunum, KompaktListe } from './KompaktListe.tsx';
import {
  BAGSIZ_RAF, LISTE_SUZGECLERI, SATIR_DURUMU_ADI, SATIR_DURUMU_TONU, satirDurumu, satirEylemi, suz,
  type KutuphaneSatiri, type ListeSuzgeci,
} from './kutuphane.ts';
import './takimhane.css';

const SAYFA_BOYU = 50;

const gozMetni = (t: TakimSatiri | null) => {
  const ilk = t?.gozler[0];
  if (!ilk) return null;
  return t.gozler.length > 1 ? `${ilk.kod} +${String(t.gozler.length - 1)} göz` : ilk.kod;
};
const omurMetni = (t: TakimSatiri | null) => (t?.omurYuzde == null ? '—' : `%${String(t.omurYuzde)}`);

function DurumRozeti({ s }: { s: KutuphaneSatiri }) {
  const d = satirDurumu(s);
  return <Rozet ton={SATIR_DURUMU_TONU[d]}>{SATIR_DURUMU_ADI[d]}</Rozet>;
}

// Satır düğmesi yetkiye göre görünür; asıl denetim sunucudadır.
// Düğme satırın içindedir: tıklama satır seçimine (ayrıntı penceresi) geçmez.
function SatirDugmesi({ s, ac }: { s: KutuphaneSatiri; ac: (s: KutuphaneSatiri, e: 'giris' | 'bagla') => void }) {
  const yetki = useYetki();
  const e = satirEylemi(s);
  const tikla = (tur: 'giris' | 'bagla') => (olay: MouseEvent) => { olay.stopPropagation(); ac(s, tur); };
  if (e === 'bagla') return yetki.var('malzemeler.yaz') ? <Dugme simge="tag" onClick={tikla('bagla')}>Kaleme bağla</Dugme> : null;
  if (e === 'acilis') return yetki.var('stok.giris') ? <Dugme simge="plus" onClick={tikla('giris')}>Açılış gir</Dugme> : null;
  if (e === 'sayim') return yetki.herhangi('stok.sayim', 'stok.giris') ? <Dugme simge="box" onClick={tikla('giris')}>Sayım</Dugme> : null;
  return null;
}

// Takımhane listesi: CNC kütüphanesinin rafları; her adet bir Stok raf gözündedir. Raf başlıkları katlanır.
export function KutuphaneListesi({ satirlar, satirSec, ac }: {
  satirlar: readonly KutuphaneSatiri[];
  satirSec: (t: TakimSatiri) => void;
  ac: (s: KutuphaneSatiri, e: 'giris' | 'bagla') => void;
}) {
  const [suzgec, suzgecYaz] = useState<ListeSuzgeci>('kartli');
  const [raf, rafYaz] = useState('');
  const [ara, araYaz] = useState('');
  const [sayfa, sayfaYaz] = useState(1);
  const raflar = useMemo(() => [...new Set(satirlar.map((s) => s.raf))], [satirlar]);
  const liste = useMemo(() => suz(satirlar, { suzgec, raf, ara }), [satirlar, suzgec, raf, ara]);
  const gorunen = liste.slice((sayfa - 1) * SAYFA_BOYU, sayfa * SAYFA_BOYU);
  const degisti = <T,>(yaz: (v: T) => void) => (v: T) => { yaz(v); sayfaYaz(1); };
  const sutunlar: readonly Sutun<KutuphaneSatiri>[] = [
    {
      anahtar: 'kalem', baslik: 'Kalem',
      hucre: (s) => (
        <span className="tc-tkm-ad">
          <span>{s.ad}</span>
          <span className="tc-tkm-soluk mono">{[s.kod, s.takim && s.takim.kod !== s.kod ? s.takim.kod : null].filter(Boolean).join(' · ')}</span>
        </span>
      ),
    },
    { anahtar: 'goz', baslik: 'Raf gözü', mono: true, kirilmaz: true, hucre: (s) => gozMetni(s.takim) },
    { anahtar: 'raf', baslik: 'Rafta', hizala: 'sag', mono: true, hucre: (s) => (s.takim ? adetMetni(s.takim.konumlar.raf) : null) },
    { anahtar: 'tezgah', baslik: 'Tezgâhta', hizala: 'sag', mono: true, hucre: (s) => (s.takim ? adetMetni(s.takim.konumlar.tezgah) : null) },
    { anahtar: 'kisi', baslik: 'Kişide', hizala: 'sag', mono: true, hucre: (s) => (s.takim ? adetMetni(s.takim.konumlar.kisi) : null) },
    { anahtar: 'bileme', baslik: 'Bilemede', hizala: 'sag', mono: true, hucre: (s) => (s.takim ? adetMetni(s.takim.konumlar.bileme) : null) },
    { anahtar: 'omur', baslik: 'Ömür', hizala: 'sag', mono: true, hucre: (s) => omurMetni(s.takim) },
    { anahtar: 'durum', baslik: 'Durum', kartTamSatir: true, hucre: (s) => <DurumRozeti s={s} /> },
    { anahtar: 'eylem', baslik: '', csv: false, kartTamSatir: true, hucre: (s) => <SatirDugmesi s={s} ac={ac} /> },
  ];
  const rafSecimi = (
    <Secim
      etiket="Kütüphane rafı" value={raf} onChange={(e) => { degisti(rafYaz)(e.target.value); }} bosSecenek="Bütün raflar"
      secenekler={raflar.map((r) => ({ deger: r, baslik: r }))}
    />
  );
  const sayfalama = { sayfa, sayfaBoyu: SAYFA_BOYU, toplam: liste.length, degistir: sayfaYaz };
  return (
    <div className="tc-tkm-yigin">
      {rafSecimi}
      <IkiGorunum
        masa={(
          <Tablo
            etiket="Takım kütüphanesi" sutunlar={sutunlar} satirlar={gorunen} satirAnahtari={(s) => s.anahtar}
            satirSec={(s) => { if (s.takim) satirSec(s.takim); }} sayfalama={sayfalama}
            grup={{ yol: (s) => [s.raf], baslik: (y) => y[0] ?? '' }}
            bosMesaj={suzgec === 'kartli' ? 'Kartı olan takım yok. "Tümü" ile kütüphanenin bütün kalemleri görünür.' : 'Bu süzgeçte kalem yok.'}
            arac={{
              arama: { deger: ara, degistir: degisti(araYaz), etiket: 'Kalem ara', yerTutucu: 'Kod ya da ad' },
              suzgec: { etiket: 'Görünüm', secili: suzgec, sec: (v) => { degisti(suzgecYaz)(v as ListeSuzgeci); }, secenekler: LISTE_SUZGECLERI },
            }}
          />
        )}
        kompakt={(
          <>
            <div className="tc-tkm-dar-arac">
              <Girdi etiket="Kalem ara" placeholder="Kod ya da ad" value={ara} onChange={(e) => { degisti(araYaz)(e.target.value); }} />
              <div className="tc-tkm-cipler" role="group" aria-label="Görünüm">
                {LISTE_SUZGECLERI.map((o) => (
                  <button key={o.deger} type="button" aria-pressed={suzgec === o.deger} onClick={() => { degisti(suzgecYaz)(o.deger); }}>{o.baslik}</button>
                ))}
              </div>
            </div>
            {gorunen.length === 0 ? <p className="tc-tkm-bos">Bu süzgeçte kalem yok.</p> : (
              <KompaktListe
                etiket="Takım kütüphanesi" satirlar={gorunen} satirAnahtari={(s) => s.anahtar}
                baslik={(s) => (s.takim
                  ? <button type="button" className="tc-tkm-kompakt-dugme" onClick={() => { if (s.takim) satirSec(s.takim); }}>{s.ad}</button>
                  : s.ad)}
                sag={(s) => (s.takim ? `${adetMetni(s.takim.konumlar.raf)} rafta` : '—')}
                alt={(s) => [s.kod ?? s.takim?.kod, gozMetni(s.takim) ?? 'göz yok', s.raf === BAGSIZ_RAF ? null : s.raf].filter(Boolean).join(' · ')}
                ek={(s) => <><DurumRozeti s={s} /><SatirDugmesi s={s} ac={ac} /></>}
              />
            )}
            {liste.length > SAYFA_BOYU && (
              <div className="tc-tkm-eylemler">
                <Dugme simge="chev-left" disabled={sayfa === 1} onClick={() => { sayfaYaz(sayfa - 1); }}>Önceki</Dugme>
                <Dugme simge="chev-right" disabled={sayfa * SAYFA_BOYU >= liste.length} onClick={() => { sayfaYaz(sayfa + 1); }}>Sonraki</Dugme>
              </div>
            )}
          </>
        )}
      />
    </div>
  );
}

// Göz seçici: Stok'ta tanımlı aktif raf gözleri; bu takımın dolu olduğu gözler önce. Göz Stok > Raflar'da açılır.
function GozSecici({ kartKimlik, secili, sec }: { kartKimlik: number; secili: number | null; sec: (konum: number, dolu: boolean, kod: string) => void }) {
  const [ara, araYaz] = useState('');
  const gozler = useQuery({
    queryKey: anahtarlar.rafGozleri(kartKimlik, ara.trim()),
    queryFn: () => api.get<RafGozleriCevabi>(`/takimhane/raf-gozleri?kart=${String(kartKimlik)}${ara.trim() === '' ? '' : `&q=${encodeURIComponent(ara.trim())}`}`),
  });
  const liste = [...(gozler.data?.gozler ?? [])].sort((a, b) => Number(b.dolu) - Number(a.dolu) || a.kod.localeCompare(b.kod, 'tr'));
  return (
    <div className="tc-tkm-secim">
      <Girdi etiket="Raf gözü" placeholder="Göz kodu ara" value={ara} onChange={(e) => { araYaz(e.target.value); }} />
      {gozler.isError && <p role="alert" className="tc-tkm-soluk">{hataIletisi(gozler.error, 'Raf gözleri alınamadı.')}</p>}
      {gozler.data && liste.length === 0 && <p className="tc-tkm-soluk">Eşleşen raf gözü yok. Gözler Stok &gt; Raflar'da tanımlanır.</p>}
      <ul className="tc-tkm-gozler" aria-label="Raf gözleri">
        {liste.map((g) => (
          <li key={g.konumKimligi}>
            <button type="button" aria-pressed={secili === g.konumKimligi} onClick={() => { sec(g.konumKimligi, g.dolu, g.kod); }}>
              <span className="mono">{g.kod}</span>
              <Rozet ton={g.dolu ? 'bilgi' : 'pasif'}>{g.dolu ? 'dolu' : 'boş'}</Rozet>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Göze göre tek pencere: boş gözde açılış (Stok başlangıç belgesi), dolu gözde kör sayım (fark onaya düşer). Sistemdeki adet gösterilmez.
export function GirisPenceresi({ takim, kapat }: { takim: TakimSatiri | null; kapat: () => void }) {
  const istemci = useQueryClient();
  const bildirim = useBildirim();
  const [goz, gozYaz] = useState<{ konum: number; dolu: boolean; kod: string } | null>(null);
  const [adet, adetYaz] = useState('');
  const [istekKimligi] = useState(yeniIstekKimligi);
  const gonder = useMutation({
    mutationFn: () => api.post<GirisCevabi>('/takimhane/giris', {
      kartKimlik: takim?.kartKimlik, konumKimligi: goz?.konum, adet: Number(adet), istekKimligi,
    }, { istekKimligi }),
    onSuccess: (c) => {
      bildirim.bildir('tamam', c.tur === 'acilis'
        ? `Açılış yazıldı${c.belgeNo === null ? '' : ` (${c.belgeNo})`}.`
        : c.onayaGiden > 0 ? 'Sayım alındı; fark onaya düştü.' : 'Sayım alındı; fark yok.');
      void istemci.invalidateQueries({ queryKey: ['takimhane'] });
      kapat();
    },
    onError: (h) => { bildirim.bildir('hata', hataIletisi(h, 'Kaydedilemedi.')); },
  });
  const sayi = Number(adet);
  const sayim = goz?.dolu === true;
  const sebep = goz === null ? 'Raf gözü seçin.' : adet === '' || !Number.isInteger(sayi) || sayi < 0 ? 'Adet girin.' : !sayim && sayi === 0 ? 'Açılışta adet sıfırdan büyük olur.' : null;
  const baslik = goz === null ? 'Açılış / sayım' : sayim ? 'Sayım' : 'Açılış girişi';
  return (
    <Pencere acik={takim !== null} kapat={kapat} baslik={baslik} tur="orta">
      {takim && (
        <form className="tc-tkm-form" onSubmit={(e) => { e.preventDefault(); if (sebep === null) gonder.mutate(); }}>
          <p>{takim.ad} · <span className="mono tc-tkm-kod">{takim.kod}</span></p>
          <GozSecici kartKimlik={takim.kartKimlik} secili={goz?.konum ?? null} sec={(konum, dolu, kod) => { gozYaz({ konum, dolu, kod }); }} />
          <Girdi etiket={sayim ? 'Sayılan adet' : 'Adet'} type="number" inputMode="numeric" min={0} value={adet} onChange={(e) => { adetYaz(e.target.value); }} />
          {goz !== null && (
            <p className="tc-tkm-soluk">
              {sayim
                ? `${goz.kod} dolu: kör sayım. Sayım farkı onaya düşer; stok, fark onaylanınca değişir.`
                : `${goz.kod} boş: açılış olarak yazılır (Stok başlangıç belgesi, geri alınabilir).`}
            </p>
          )}
          <div className="tc-tkm-eylemler tc-tkm-eylem-sebepli">
            {sebep !== null && <p id="tkm-giris-sebep" className="tc-tkm-soluk">{sebep}</p>}
            <Dugme onClick={kapat}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="upload" type="submit" disabled={sebep !== null || gonder.isPending} aria-describedby={sebep === null ? undefined : 'tkm-giris-sebep'}>
              {sayim ? 'Sayımı gönder' : 'Açılış olarak yaz'}
            </Dugme>
          </div>
        </form>
      )}
    </Pencere>
  );
}

// Eski TKM kartı silinmez; bir kütüphane kalemine bağlanır ve o kalemin satırında görünür.
export function BaglaPenceresi({ takim, kalemler, kapat }: { takim: TakimSatiri | null; kalemler: readonly KutuphaneSatiri[]; kapat: () => void }) {
  const istemci = useQueryClient();
  const bildirim = useBildirim();
  const [ara, araYaz] = useState('');
  const [secili, seciliYaz] = useState<KutuphaneSatiri | null>(null);
  const [istekKimligi] = useState(yeniIstekKimligi);
  const bagla = useMutation({
    mutationFn: (kimlik: string) => api.post(`/takimhane/takimlar/${String(takim?.kartKimlik)}/kutuphane`, { kimlik }, { istekKimligi }),
    onSuccess: () => { bildirim.bildir('tamam', 'Kart kütüphane kalemine bağlandı.'); void istemci.invalidateQueries({ queryKey: ['takimhane'] }); kapat(); },
    onError: (h) => { bildirim.bildir('hata', hataIletisi(h, 'Bağlanamadı.')); },
  });
  const aranan = ara.trim().toLocaleLowerCase('tr');
  const sonuc = aranan === '' ? [] : kalemler.filter((k) => k.kimlik !== null && k.takim === null
    && `${k.kod ?? ''} ${k.ad}`.toLocaleLowerCase('tr').includes(aranan)).slice(0, 8);
  return (
    <Pencere acik={takim !== null} kapat={kapat} baslik="Kaleme bağla" tur="orta">
      {takim && (
        <div className="tc-tkm-form">
          <p>{takim.ad} · <span className="mono tc-tkm-kod">{takim.kod}</span>. Kart ve stoğu olduğu gibi kalır; yalnız kütüphane kalemine bağlanır.</p>
          {secili ? (
            <div className="tc-tkm-secili">
              <span className="tc-tkm-ad"><span>{secili.ad}</span><span className="tc-tkm-soluk mono">{secili.kod ?? secili.kimlik}</span></span>
              <Dugme simge="x" onClick={() => { seciliYaz(null); }}>Değiştir</Dugme>
            </div>
          ) : (
            <>
              <Girdi etiket="Kütüphane kalemi" placeholder="Kod ya da ad yazın" value={ara} onChange={(e) => { araYaz(e.target.value); }} />
              {sonuc.length > 0 && (
                <ul className="tc-tkm-sonuc" aria-label="Kütüphane kalemleri">
                  {sonuc.map((k) => (
                    <li key={k.anahtar}><button type="button" onClick={() => { seciliYaz(k); }}><span>{k.ad}</span><span className="tc-tkm-soluk">{k.raf}</span></button></li>
                  ))}
                </ul>
              )}
              {aranan !== '' && sonuc.length === 0 && <p className="tc-tkm-soluk">Kartı olmayan eşleşen kalem yok.</p>}
            </>
          )}
          <div className="tc-tkm-eylemler">
            <Dugme onClick={kapat}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="tag" disabled={secili?.kimlik == null || bagla.isPending} onClick={() => { if (secili?.kimlik) bagla.mutate(secili.kimlik); }}>Bağla</Dugme>
          </div>
        </div>
      )}
    </Pencere>
  );
}
