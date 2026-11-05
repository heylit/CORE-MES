import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BildirimYayini, BildirimYayinHedefleriCevabi, BildirimYayinlaGovdesi, YayinHedefTuru, YayinSimgesi, YayinTuru,
} from '#paylasilan/sozlesme/bildirim.ts';
import { CokSatir, DurumKutusu, Dugme, Girdi, Kart, Pencere, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GORSEL_MIME, GorselHatasi, gorselYukle } from './gorsel.ts';
import {
  BASLIK_EN_COK, GORSEL_EN_COK_BAYT, HEDEF_EN_COK, METIN_EN_COK, SECILEBILEN_SIMGELER, YAYIN_TURU, YAYIN_TURU_SIRASI,
} from './gorunum.ts';

const HEDEFLER: readonly { tur: YayinHedefTuru; ad: string; simge: SimgeAdi }[] = [
  { tur: 'herkes', ad: 'Herkes', simge: 'users' },
  { tur: 'rol', ad: 'Rol', simge: 'gear' },
  { tur: 'istasyon', ad: 'İstasyon', simge: 'cpu' },
  { tur: 'kisi', ad: 'Kişi', simge: 'user' },
];

// datetime-local değeri bu cihazın saatiyle okunur; boşsa null (hemen ya da bitişsiz).
const yerelZaman = (deger: string): string | null => {
  if (deger === '') return null;
  const an = new Date(deger);
  return Number.isNaN(an.getTime()) ? null : an.toISOString();
};

interface Taslak {
  tur: YayinTuru;
  simge: YayinSimgesi;
  baslik: string;
  metin: string;
  hedefTuru: YayinHedefTuru;
  idler: number[];
  ortada: boolean;
  onayIstenir: boolean;
  yayinZamani: string;
  bitis: string;
}
const BOS: Taslak = {
  tur: 'uyari', simge: 'alert', baslik: '', metin: '', hedefTuru: 'herkes', idler: [], ortada: true, onayIstenir: false, yayinZamani: '', bitis: '',
};

function Cipler<T extends string>({ etiket, secenekler, secili, sec }: {
  etiket: string; secenekler: readonly { deger: T; ad: string; simge: SimgeAdi }[]; secili: T; sec: (d: T) => void;
}) {
  return (
    <div className="tc-alan">
      <span className="tc-alan-etiket" id={`hazirla-${etiket}`}>{etiket}</span>
      <div className="tc-bildirim-suzgec" role="radiogroup" aria-labelledby={`hazirla-${etiket}`}>
        {secenekler.map((s) => (
          <button key={s.deger} type="button" role="radio" aria-checked={secili === s.deger} className="tc-bildirim-cip" onClick={() => sec(s.deger)}>
            <Simge ad={s.simge} boyut="k" /> {s.ad}
          </button>
        ))}
      </div>
    </div>
  );
}

function HedefSecimi({ secenek, tur, idler, degistir }: {
  secenek: BildirimYayinHedefleriCevabi; tur: YayinHedefTuru; idler: readonly number[]; degistir: (idler: number[]) => void;
}) {
  const [ara, araYaz] = useState('');
  const liste = useMemo(() => {
    const ham = tur === 'rol' ? secenek.roller : tur === 'istasyon' ? secenek.istasyonlar : tur === 'kisi' ? secenek.kisiler : [];
    const kucuk = ara.trim().toLocaleLowerCase('tr-TR');
    return kucuk === '' ? ham : ham.filter((h) => h.ad.toLocaleLowerCase('tr-TR').includes(kucuk));
  }, [secenek, tur, ara]);
  if (tur === 'herkes') {
    return <p className="tc-bildirim-not">Etkin ve girişi olan {secenek.herkesSayisi} kişiye gider (siz hariç).</p>;
  }
  const secili = new Set(idler);
  const dolu = idler.length >= HEDEF_EN_COK;
  return (
    <div className="tc-bildirim-hedef">
      <Girdi etiket="Ara" type="search" value={ara} onChange={(o) => araYaz(o.target.value)} />
      {liste.length === 0 ? <p className="tc-bildirim-not">Seçilecek kayıt yok.</p> : (
        <ul className="tc-bildirim-hedef-liste" aria-label="Hedefler">
          {liste.map((h) => (
            <li key={h.id}>
              <label className="tc-bildirim-hedef-satir">
                <input
                  type="checkbox"
                  checked={secili.has(h.id)}
                  disabled={!secili.has(h.id) && dolu}
                  onChange={(o) => degistir(o.target.checked ? [...idler, h.id] : idler.filter((i) => i !== h.id))}
                />
                <span>{h.ad}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="tc-bildirim-not">
        {idler.length} seçili{tur === 'istasyon' ? ' · o günkü istasyon atamasındaki kişiler alır' : ''}{dolu ? ` · en çok ${HEDEF_EN_COK}` : ''}
      </p>
    </div>
  );
}

function Onizleme({ t, gorselAdi, kapat }: { t: Taslak; gorselAdi: string | null; kapat: () => void }) {
  const tur = YAYIN_TURU[t.tur];
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Ortada önizleme"
      ust={(
        <header className="tc-bildirim-orta-ust" data-ton={tur.ton}>
          <span className={`tc-bildirim-simge tc-bildirim-${tur.ton}`}><Simge ad={t.simge} boyut="b" /></span>
          <div><span className="tc-bildirim-orta-tur">{tur.ad} · önizleme</span><h2>{t.baslik || 'Başlık'}</h2></div>
        </header>
      )}
      alt={(
        <div className="tc-bildirim-orta-alt">
          <Dugme tur="birincil" boyut="ana" simge="check" onClick={kapat}>{t.onayIstenir ? 'Okudum, anladım' : 'Kapat'}</Dugme>
        </div>
      )}
    >
      <div className="tc-bildirim-orta">
        {gorselAdi !== null && <p className="tc-bildirim-not"><Simge ad="upload" boyut="k" /> Görsel: {gorselAdi}</p>}
        {t.metin.trim() !== '' && <p className="tc-bildirim-orta-metin">{t.metin}</p>}
        {t.onayIstenir && <p className="tc-bildirim-not">Onayınız adınız ve saatiyle kaydedilir.</p>}
      </div>
    </Pencere>
  );
}

// Elle bildirim hazırlama (2147): yalnız bildirim.yayinla işlemi olana sekme olarak görünür; sunucu yetkiyi ve hedefi yeniden sınar.
export function Hazirla({ yayinlandi }: { yayinlandi: (y: BildirimYayini) => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [t, tYaz] = useState<Taslak>(BOS);
  const [gorsel, gorselYaz] = useState<File | null>(null);
  const [gorselHatasi, gorselHatasiYaz] = useState<string | null>(null);
  const [onizle, onizleYaz] = useState(false);
  const [istekKimligi, istekKimligiYaz] = useState(yeniIstekKimligi);
  const secenek = useQuery({ queryKey: anahtarlar.hedefler, queryFn: () => api.get<BildirimYayinHedefleriCevabi>('/bildirimler/yayinlar/hedefler') });
  const yaz = (ek: Partial<Taslak>) => tYaz((o) => ({ ...o, ...ek }));

  const yayinla = useMutation({
    mutationFn: async () => {
      const g = gorsel === null ? null : await gorselYukle(gorsel);
      const govde: BildirimYayinlaGovdesi = {
        tur: t.tur, simge: t.simge, baslik: t.baslik.trim(), metin: t.metin.trim() === '' ? null : t.metin.trim(), gorsel: g,
        hedef: { tur: t.hedefTuru, idler: t.hedefTuru === 'herkes' ? [] : t.idler },
        ortada: t.ortada, onayIstenir: t.onayIstenir, yayinZamani: yerelZaman(t.yayinZamani), bitis: yerelZaman(t.bitis),
      };
      return api.post<BildirimYayini>('/bildirimler/yayinlar/yayinla', govde, { istekKimligi });
    },
    onSuccess: (y) => {
      bildir('tamam', y.dagitildi === null ? 'Bildirim zamanlandı.' : `Bildirim ${String(y.aliciSayisi ?? 0)} kişiye gönderildi.`);
      tYaz(BOS);
      gorselYaz(null);
      istekKimligiYaz(yeniIstekKimligi());
      void istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      yayinlandi(y);
    },
    onError: (h) => bildir('hata', h instanceof GorselHatasi ? h.message : hataIletisi(h, 'Bildirim yayınlanamadı.')),
  });

  if (secenek.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (secenek.isError) return <DurumKutusu durum="hata" yenile={() => { void secenek.refetch(); }} />;

  const hedefEksik = t.hedefTuru !== 'herkes' && t.idler.length === 0;
  const eksik = t.baslik.trim() === '' || hedefEksik || gorselHatasi !== null;
  const gorselSec = (dosya: File | null) => {
    gorselHatasiYaz(null);
    if (dosya !== null && !(dosya.type in GORSEL_MIME)) gorselHatasiYaz('Görsel PNG, JPEG ya da WEBP olmalı.');
    else if (dosya !== null && dosya.size > GORSEL_EN_COK_BAYT) gorselHatasiYaz('Görsel 5 MB sınırını aşıyor.');
    gorselYaz(dosya);
  };
  return (
    <div className="tc-bildirim-izgara">
      <Kart baslik="Yeni bildirim">
        <form className="tc-bildirim-form" onSubmit={(o) => { o.preventDefault(); if (!eksik) yayinla.mutate(); }}>
          <Cipler
            etiket="Tür"
            secenekler={YAYIN_TURU_SIRASI.map((d) => ({ deger: d, ad: YAYIN_TURU[d].ad, simge: YAYIN_TURU[d].simge }))}
            secili={t.tur}
            sec={(tur) => yaz({ tur, simge: YAYIN_TURU[tur].simge })}
          />
          <Girdi etiket="Başlık" required maxLength={BASLIK_EN_COK} value={t.baslik} onChange={(o) => yaz({ baslik: o.target.value })} />
          <CokSatir etiket="Metin" ipucu={`İsteğe bağlı, en çok ${METIN_EN_COK} karakter`} maxLength={METIN_EN_COK} value={t.metin} onChange={(o) => yaz({ metin: o.target.value })} />
          <div className="tc-alan">
            <span className="tc-alan-etiket" id="hazirla-simge">Simge</span>
            <div className="tc-bildirim-simgeler" role="radiogroup" aria-labelledby="hazirla-simge">
              {SECILEBILEN_SIMGELER.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={t.simge === s} aria-label={s} className="tc-bildirim-simge-sec" onClick={() => yaz({ simge: s })}>
                  <Simge ad={s} />
                </button>
              ))}
            </div>
          </div>
          <div className="tc-alan">
            <label className="tc-alan-etiket" htmlFor="hazirla-gorsel">Görsel (isteğe bağlı; PNG, JPEG, WEBP; en çok 5 MB)</label>
            <input id="hazirla-gorsel" type="file" accept={Object.keys(GORSEL_MIME).join(',')} onChange={(o) => gorselSec(o.target.files?.[0] ?? null)} />
            {gorselHatasi !== null && <p className="tc-alan-alt" role="alert">{gorselHatasi}</p>}
            {gorsel !== null && <Dugme simge="x" onClick={() => gorselSec(null)}>Görseli kaldır</Dugme>}
          </div>
          <Cipler
            etiket="Kime"
            secenekler={HEDEFLER.map((h) => ({ deger: h.tur, ad: h.ad, simge: h.simge }))}
            secili={t.hedefTuru}
            sec={(hedefTuru) => yaz({ hedefTuru, idler: [] })}
          />
          <HedefSecimi secenek={secenek.data} tur={t.hedefTuru} idler={t.idler} degistir={(idler) => yaz({ idler })} />
          <label className="tc-bildirim-secenek">
            <input type="checkbox" role="switch" checked={t.ortada} onChange={(o) => yaz({ ortada: o.target.checked })} />
            <span><b>Ekran ortasında göster</b><small>Kapalıysa yalnız zil ve merkez</small></span>
          </label>
          <label className="tc-bildirim-secenek">
            <input type="checkbox" role="switch" checked={t.onayIstenir} onChange={(o) => yaz({ onayIstenir: o.target.checked })} />
            <span><b>"Okudum, anladım" onayı iste</b><small>Onaylayan kişi ve zaman kaydedilir</small></span>
          </label>
          <div className="tc-bildirim-zamanlar">
            <Girdi etiket="Yayın zamanı" ipucu="Boşsa hemen" type="datetime-local" value={t.yayinZamani} onChange={(o) => yaz({ yayinZamani: o.target.value })} />
            <Girdi etiket="Bitiş" ipucu="Bitişten sonra ortada çıkmaz, kayıt kalır" type="datetime-local" value={t.bitis} onChange={(o) => yaz({ bitis: o.target.value })} />
          </div>
          <div className="tc-bildirim-cekmece-alt">
            <Dugme tur="birincil" type="submit" simge="bell" yukleniyor={yayinla.isPending} disabled={eksik}>Yayınla</Dugme>
            <Dugme simge="eye" onClick={() => onizleYaz(true)}>Ortada önizle</Dugme>
          </div>
          {hedefEksik && <p className="tc-bildirim-not">En az bir hedef seçin.</p>}
        </form>
      </Kart>
      <Kart baslik="Nasıl çalışır">
        <ul className="tc-bildirim-maddeler">
          <li>Alıcılar yayın anında belirlenir; sonradan role ya da istasyona giren görmez.</li>
          <li>Yayınlanan bildirim düzenlenmez; Yayınlar sekmesinden geri çekilir. Geri çekilen ortada çıkmaz, merkezde üstü çizili kalır.</li>
          <li>Görsel sunucunun kendi diskinde durur; yalnız alıcılar ve siz görürsünüz.</li>
          <li>Ekran ortasında gösterilen bildirim, kişi oturum açıkken sırayla çıkar.</li>
        </ul>
      </Kart>
      {onizle && <Onizleme t={t} gorselAdi={gorsel?.name ?? null} kapat={() => onizleYaz(false)} />}
    </div>
  );
}
