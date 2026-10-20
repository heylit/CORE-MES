import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { KullanimCevabi, MalzemeAraCevabi, RotaListesiCevabi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, DurumKutusu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { gorunurSayfalar, useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { csvIndir } from './csv.ts';
import { DURUM_ETIKETI, turKisa } from './gorunum.ts';
import './kaynak.css';
import './rotalar.css';
import './sema.css';

type KartTuru = 'hammadde' | 'yarimamul' | 'mamul' | 'sarf' | 'demirbas';
type Tur = KartTuru | 'hepsi';
const TURLER: [Tur, string][] = [['hepsi', 'Tümü'], ['hammadde', 'Hammadde'], ['yarimamul', 'Yarımamul'], ['mamul', 'Mamul'], ['sarf', 'Sarf'], ['demirbas', 'Demirbaş']];
const TUR_ADI: Record<string, string> = { hammadde: 'Hammadde', yarimamul: 'Yarımamul', mamul: 'Mamul', sarf: 'Sarf', demirbas: 'Demirbaş' };
const ONAY_ADI: Record<string, string> = { taslak: 'Taslak', onayda: 'Onayda', aktif: 'Kullanımda', pasif: 'Pasif', iptal: 'İptal' };

// Prototipin Malzemeler bölümü (sade liste): tür sekmeleri, arama, kartın rotalarda kullanımı. Kart açma, düzenleme ve onay
// TMI'nin Malzeme Kartları sayfasındadır (kullanıcı kararı); bu bölüm kartları rota modülünün arama ucuyla yalnız okur.
export function MalzemelerEkrani() {
  const yonlendir = useNavigate();
  const oturum = useOturum();
  const kartSayfasi = oturum.data ? gorunurSayfalar(oturum.data).some((s) => s.yol === '/malzemeler') : false;
  const [tur, turYaz] = useState<Tur>('hepsi');
  // Hızlı git'ten gelen kart aramayla açılır (?ara=).
  const [parametre] = useSearchParams();
  const [metin, metinYaz] = useState(() => parametre.get('ara') ?? '');
  const [hepsi, hepsiYaz] = useState(false);
  const [sayfa, sayfaYaz] = useState(1);
  const [acik, acikYaz] = useState<number | null>(null);
  const sorgu = new URLSearchParams({ sayfa: String(sayfa) });
  if (tur !== 'hepsi') sorgu.set('tur', tur);
  if (metin.trim()) sorgu.set('metin', metin.trim());
  if (hepsi) sorgu.set('hepsi', 'true');
  const liste = useQuery({ queryKey: ['rotalar', 'malzemeler', sorgu.toString()], queryFn: () => api.get<MalzemeAraCevabi>(`/rota/malzeme-ara?${sorgu.toString()}`) });
  const idler = liste.data?.satirlar.map((m) => m.id) ?? [];
  const kullanim = useQuery({
    queryKey: ['rotalar', 'malzeme-kullanimi', idler.join(',')],
    queryFn: () => api.get<KullanimCevabi>(`/rota/malzeme-kullanimi?malzemeIdleri=${idler.join(',')}`),
    enabled: idler.length > 0,
  });
  const rotalar = useQuery({ queryKey: anahtarlar.liste, queryFn: () => api.get<RotaListesiCevabi>('/rota/urunler') });
  const rotasi = new Map((rotalar.data?.rotalar ?? []).map((r) => [r.urun.id, r]));
  const sayfaSayisi = liste.data ? Math.max(1, Math.ceil(liste.data.toplam / liste.data.sayfaBoyu)) : 1;
  return (
    <div className="tc-merkez">
      <section className="tc-sch2" aria-label="Malzemeler">
        <div className="tc-sec-head">
          <h2>Malzemeler</h2>
          <p className="tc-rota-ipucu">
            Hammadde, sarf ve mamul kartları ve rotalarda nerede kullanıldıkları. Yeni kart açmak, kartı düzenlemek ve onaylamak
            {kartSayfasi ? <> <Link to="/malzemeler">Malzeme Kartları</Link> sayfasındadır.</> : ' Malzeme Kartları sayfasındadır.'}
          </p>
        </div>
        <div className="tc-satir">
          <span className="tc-seg" role="group" aria-label="Malzeme türü">
            {TURLER.map(([k, ad]) => <button key={k} type="button" aria-pressed={tur === k} onClick={() => { turYaz(k); sayfaYaz(1); }}>{ad}</button>)}
          </span>
          <input className="tc-inp tc-inp-orta" type="search" aria-label="Kod ya da ad ara" placeholder="Kod ya da ad ara" value={metin}
            onChange={(e) => { metinYaz(e.target.value); sayfaYaz(1); }} />
          <label className="tc-isaret-satir"><input type="checkbox" checked={hepsi} onChange={(e) => { hepsiYaz(e.target.checked); sayfaYaz(1); }} /><span>Taslak, onayda ve pasif kartları da göster</span></label>
          <span className="tc-grow" />
          {liste.data && <small className="tc-rota-ipucu">{liste.data.toplam} kart</small>}
          {/* Ekrandaki sayfa aktarılır (süzgeç ve sayfa ekrandaki gibi). */}
          <Dugme simge="sort" disabled={!liste.data?.satirlar.length} onClick={() => csvIndir('malzemeler', ['Kod', 'Ad', 'Tür', 'Birim', 'Durum', 'Rotalarda (adım)'],
            (liste.data?.satirlar ?? []).map((m) => [m.stokKodu, m.ad, TUR_ADI[m.tur] ?? m.tur, m.stokBirimi, ONAY_ADI[m.onayDurumu] ?? m.onayDurumu,
              kullanim.data ? (kullanim.data.kullanimlar.filter((k) => k.malzemeId === m.id).length) : null]))}>CSV indir</Dugme>
        </div>
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />}
        {liste.data && (
          <div className="tc-kgrid tc-g-ml" role="table" aria-label="Malzeme listesi">
            <div className="tc-kgrid-bas" role="row"><span>Kod</span><span>Ad</span><span>Tür</span><span>Birim</span><span>Durum</span><span>Rotalarda</span></div>
            {liste.data.satirlar.length === 0 && <p className="tc-rota-ipucu">Bu süzgeçle kart yok.</p>}
            {liste.data.satirlar.map((m) => {
              const kul = (kullanim.data?.kullanimlar ?? []).filter((k) => k.malzemeId === m.id);
              const urunler = [...new Map(kul.map((k) => [`${k.urun.id}|${k.revizyon.id}`, k])).values()];
              const kendi = m.tur === 'mamul' ? rotasi.get(m.id) : undefined;
              return (
                <div key={m.id} className="tc-ml-blok">
                  <div className="tc-kgrid-satir" role="row" aria-label={m.stokKodu ?? m.ad}>
                    <span className="tc-ml-kod"><span className={`tc-slot tc-slot-${m.tur}`}>{turKisa(m.tur)}</span><b>{m.stokKodu ?? '—'}</b></span>
                    <span className="tc-ml-ad" title={m.ad}>{m.ad}</span>
                    <span>{TUR_ADI[m.tur]}</span>
                    <span>{m.stokBirimi ?? ''}</span>
                    <span className={`tc-ml-onay tc-ml-${m.onayDurumu}`}>{ONAY_ADI[m.onayDurumu]}</span>
                    <span className="tc-satir">
                      {urunler.length > 0
                        ? <button type="button" className="tc-baglanti" aria-expanded={acik === m.id} onClick={() => acikYaz(acik === m.id ? null : m.id)}>{urunler.length} rotada</button>
                        : <small className="tc-rota-ipucu">kullanılmıyor</small>}
                      {kendi && <button type="button" className="tc-btn-sm" onClick={() => { void yonlendir(`/rota/${m.id}`); }}>Kendi rotası{kendi.yururlukte ? ` · Rev ${kendi.yururlukte.harf}` : ''}</button>}
                    </span>
                  </div>
                  {acik === m.id && (
                    <ul className="tc-ml-kullanim" aria-label={`${m.stokKodu ?? m.ad} kullanımları`}>
                      {kul.map((k) => (
                        <li key={`${k.revizyon.id}|${k.opNo}|${k.rol}`}>
                          <b>{k.urun.stokKodu ?? k.urun.ad}</b> {k.urun.ad} · <span className={`tc-rvchip tc-rv-${k.revizyon.durum}`}>Rev {k.revizyon.harf} {DURUM_ETIKETI[k.revizyon.durum].toLocaleLowerCase('tr-TR')}</span>
                          {' '}· OP {k.opNo} {k.adimAdi} · {k.rol === 'bilesen' ? 'giren' : 'yan ürün'}
                          {' '}<button type="button" className="tc-baglanti" onClick={() => { void yonlendir(`/rota/${k.urun.id}`); }}>Akışta aç</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {sayfaSayisi > 1 && (
          <div className="tc-satir">
            <button type="button" className="tc-btn-sm" disabled={sayfa <= 1} onClick={() => sayfaYaz(sayfa - 1)}>Önceki</button>
            <small className="tc-rota-ipucu">Sayfa {sayfa} / {sayfaSayisi}</small>
            <button type="button" className="tc-btn-sm" disabled={sayfa >= sayfaSayisi} onClick={() => sayfaYaz(sayfa + 1)}>Sonraki</button>
          </div>
        )}
      </section>
    </div>
  );
}
