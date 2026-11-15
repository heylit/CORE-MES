import { useEffect, useRef, useState } from 'react';
import { DurumKutusu, Dugme, Girdi, OnayPenceresi, Rozet, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import type { Operasyon } from '../rotalar/kurallar.ts';
import { renkSinifi } from '../rotalar/ortak.tsx';
import { OpCipi, OpSeridi, sablonSeridi } from '../rotalar/OpSeridi.tsx';
import { sade, type RotaSablonu } from '../rotalar/sablonSecimi.ts';
import { useRotaSablonKomutu, useRotaSablonlari, type RotaSablonKomutu } from '../rotalar/sablonVerisi.ts';

// Rota şablonları (3273 a): tablo ve yanında düzenleme paneli (ad, öneri sözcükleri, adım sırası, operasyon ekle). Kullanılmış şablon
// silinmez, kullanımdan kalkar (Risk K1); varsayılan şablon kullanımdan kalkmaz (K2). Değişiklik yalnız sonra açılan rotalara gelir.

interface DuzenAdimi { anahtar: string; operasyonTipiId: number; kod: string; renk: string; ad: string }
type Duzenlenen = { tur: 'yeni' } | { tur: 'var'; id: number };

const sozcukListesi = (m: string): string[] => [...new Set(m.split(',').map((x) => x.trim()).filter((x) => x !== ''))];
let sayac = 0;
const anahtarVer = (): string => { sayac += 1; return `a${String(sayac)}`; };
const adimGovdesi = (l: readonly DuzenAdimi[]) => l.map((x) => ({ operasyonTipiId: x.operasyonTipiId, ad: x.ad }));
const sablonAdimlari = (s: RotaSablonu, opBul: (id: string) => Operasyon | undefined): DuzenAdimi[] =>
  [...s.adimlar].sort((a, b) => a.sira - b.sira).map((x) => {
    const op = opBul(String(x.operasyonTipi.id));
    return { anahtar: anahtarVer(), operasyonTipiId: x.operasyonTipi.id, kod: op?.abbr ?? x.operasyonTipi.kod, renk: renkSinifi(op?.stationId ?? null), ad: x.ad };
  });

function DuzenlemePaneli({ s, opler, kapat, sec }: {
  s: RotaSablonu | null; opler: readonly Operasyon[]; kapat: () => void; sec: (id: number) => void;
}) {
  const komut = useRotaSablonKomutu();
  const { bildir } = useBildirim();
  const opBul = (id: string) => opler.find((o) => o.id === id);
  const [ad, setAd] = useState(s?.ad ?? '');
  const [sozcuk, setSozcuk] = useState(s?.oneriSozcukleri.join(', ') ?? '');
  const [aciklama, setAciklama] = useState(s?.aciklama ?? '');
  const [adimlar, setAdimlar] = useState<DuzenAdimi[]>(() => (s ? sablonAdimlari(s, opBul) : []));
  const [silOnayi, setSilOnayi] = useState(false);
  const kutu = useRef<HTMLElement>(null);
  // Dar ekranda panel tablonun altındadır: açılınca görünür yere gelir.
  useEffect(() => { kutu.current?.scrollIntoView?.({ block: 'nearest' }); }, []);
  const gonder = (k: RotaSablonKomutu, tamam: string, sonra?: (c: unknown) => void) => {
    komut.mutate(k, {
      onSuccess: (c) => { bildir('tamam', tamam); setSilOnayi(false); sonra?.(c); },
      onError: (h) => { bildir('hata', h.message); setSilOnayi(false); },
    });
  };
  const tasi = (i: number, yon: -1 | 1) => {
    const l = [...adimlar];
    const [x] = l.splice(i, 1);
    if (x) l.splice(i + yon, 0, x);
    setAdimlar(l);
  };
  const ekle = (o: Operasyon) => {
    setAdimlar([...adimlar, { anahtar: anahtarVer(), operasyonTipiId: Number(o.id), kod: o.abbr ?? o.code, renk: renkSinifi(o.stationId), ad: o.name }]);
  };
  const govde = { ad: ad.trim(), aciklama: aciklama.trim() || null, oneriSozcukleri: sozcukListesi(sozcuk), adimlar: adimGovdesi(adimlar) };
  const yeniId = (c: unknown): number | null => (c && typeof c === 'object' && 'sablon' in c ? (c as { sablon: { id: number } }).sablon.id : null);
  const kaydet = () => {
    if (s) gonder({ ad: 'kaydet', id: s.id, govde: { ...govde, surum: s.surum } }, `${govde.ad} şablonu kaydedildi.`);
    else gonder({ ad: 'ekle', govde }, `${govde.ad} şablonu eklendi; boş rotalarda önerilir.`, (c) => { const id = yeniId(c); if (id !== null) sec(id); });
  };
  const kullanildi = s?.kullanim.revizyon ?? 0;
  const aktifOpler = opler.filter((o) => o.aktif);
  return (
    <section ref={kutu} className="tc-rs-panel" aria-label={s ? `${s.ad} şablonunu düzenle` : 'Yeni şablon'}>
      <header className="tc-rs-panel-bas">
        <h3>{s ? s.ad : 'Yeni şablon'}</h3>
        {s && <Rozet ton="pasif" gorunum="cizgi">{`${String(kullanildi)} rotada`}</Rozet>}
        <Dugme tur="ikincil" simge="x" aria-label="Paneli kapat" onClick={kapat} />
      </header>
      <Girdi etiket="Ad" value={ad} maxLength={120} onChange={(e) => { setAd(e.target.value); }} />
      <Girdi etiket="Öneri sözcükleri" ipucu="Virgülle ayır; ürün adında geçerse şablon boş rotada önerilir." value={sozcuk}
        onChange={(e) => { setSozcuk(e.target.value); }} />
      <Girdi etiket="Açıklama" value={aciklama} maxLength={500} onChange={(e) => { setAciklama(e.target.value); }} />
      <h4>Adımlar</h4>
      {adimlar.length === 0 ? <p className="tc-rs-ipucu">Henüz adım yok; aşağıdan operasyon ekle.</p> : (
        <ol className="tc-rs-adimlar" aria-label="Adımlar">
          {adimlar.map((x, i) => (
            <li key={x.anahtar}>
              <span className="tc-rs-no">{String(i + 1)}</span>
              <OpCipi kod={x.kod} renk={x.renk} />
              <span className="tc-rs-adimad">{x.ad}</span>
              <span className="tc-rs-adimdugme">
                <Dugme tur="ikincil" simge="up" aria-label={`${x.ad} yukarı`} disabled={i === 0} onClick={() => { tasi(i, -1); }} />
                <Dugme tur="ikincil" simge="down" aria-label={`${x.ad} aşağı`} disabled={i === adimlar.length - 1} onClick={() => { tasi(i, 1); }} />
                <Dugme tur="ikincil" simge="x" aria-label={`${x.ad} kaldır`} onClick={() => { setAdimlar(adimlar.filter((y) => y.anahtar !== x.anahtar)); }} />
              </span>
            </li>
          ))}
        </ol>
      )}
      <h4>Operasyon ekle</h4>
      <div className="tc-rs-opler" role="group" aria-label="Operasyon ekle">
        {aktifOpler.map((o) => (
          <button key={o.id} type="button" className="tc-rs-opekle" aria-label={`${o.name} ekle`} title={o.name} onClick={() => { ekle(o); }}>
            <Simge ad="plus" boyut="k" /> {o.abbr ?? o.code}
          </button>
        ))}
      </div>
      {s && <p className="tc-rs-ipucu">{`Değişiklik bundan sonra açılan rotalara gelir; bu şablondan açılmış ${String(kullanildi)} rota değişmez.`}</p>}
      <span className="tc-rs-dugmeler">
        <Dugme tur="birincil" simge="check" disabled={govde.ad === '' || adimlar.length === 0} yukleniyor={komut.isPending} onClick={kaydet}>Kaydet</Dugme>
        {s && (
          <Dugme tur="ikincil" simge="layers"
            onClick={() => { gonder({ ad: 'ekle', govde: { ...govde, ad: `${govde.ad} (kopya)`.slice(0, 120) } }, `${s.ad} çoğaltıldı.`, (c) => { const id = yeniId(c); if (id !== null) sec(id); }); }}>
            Çoğalt
          </Dugme>
        )}
        {s && !s.varsayilan && s.aktif && (
          <Dugme tur="ikincil" simge="flag" onClick={() => { gonder({ ad: 'varsayilan-yap', id: s.id, govde: { surum: s.surum } }, `${s.ad} varsayılan şablon oldu.`); }}>Varsayılan yap</Dugme>
        )}
        {s && !s.varsayilan && (
          <Dugme tur="ikincil" simge={s.aktif ? 'lock' : 'check'}
            onClick={() => { gonder({ ad: 'durum', id: s.id, govde: { aktif: !s.aktif, surum: s.surum } }, s.aktif ? `${s.ad} kullanımdan kaldırıldı; boş rotada önerilmez.` : `${s.ad} yeniden kullanımda.`); }}>
            {s.aktif ? 'Kullanımdan kaldır' : 'Kullanıma al'}
          </Dugme>
        )}
        {s && !s.varsayilan && kullanildi === 0 && <Dugme tur="ikincil" simge="trash" className="tc-rs-sil" onClick={() => { setSilOnayi(true); }}>Sil</Dugme>}
      </span>
      {s && (
        <OnayPenceresi acik={silOnayi} baslik={`${s.ad} silinsin mi?`} onayMetni="Sil" tehlikeli yukleniyor={komut.isPending}
          vazgec={() => { setSilOnayi(false); }} onayla={() => { gonder({ ad: 'sil', id: s.id, govde: { surum: s.surum } }, `${s.ad} silindi.`, kapat); }}>
          <p>Bu şablondan hiç rota açılmadı; silinince geri gelmez.</p>
        </OnayPenceresi>
      )}
    </section>
  );
}

export function RotaSablonlari(o: EkranOzellikleri) {
  const sorgu = useRotaSablonlari();
  const [ara, setAra] = useState('');
  const [duzenlenen, setDuzenlenen] = useState<Duzenlenen | null>(null);
  const opler = o.veri.durum.opdefs ?? [];
  const opBul = (id: string) => opler.find((x) => x.id === id);
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj="Rota şablonları okunamadı." />;
  const q = sade(ara);
  const liste = sorgu.data.filter((s) => q === '' || sade(s.ad).includes(q) || s.oneriSozcukleri.some((z) => sade(z).includes(q))
    || s.adimlar.some((x) => sade(x.operasyonTipi.kod).includes(q)));
  const secili = duzenlenen?.tur === 'var' ? sorgu.data.find((s) => s.id === duzenlenen.id) ?? null : null;
  const panelAcik = o.yetki.sablonYaz && (duzenlenen?.tur === 'yeni' || secili !== null);
  return (
    <div className={`tc-rs${panelAcik ? ' tc-rs-iki' : ''}`} data-parca="R1">
      <div className="tc-rs-ust">
        <Girdi etiket="Ara" placeholder="ad, öneri sözcüğü ya da operasyon kodu" value={ara} onChange={(e) => { setAra(e.target.value); }} />
        {o.yetki.sablonYaz && <Dugme tur="birincil" simge="plus" onClick={() => { setDuzenlenen({ tur: 'yeni' }); }}>Yeni şablon</Dugme>}
      </div>
      {!o.yetki.sablonYaz && <p className="tc-rs-ipucu">Şablonları düzenleme yetkin yok; liste salt okunur.</p>}
      <div className="tc-rs-govde">
        {sorgu.data.length === 0 ? <DurumKutusu durum="bos" mesaj="Şablon yok." /> : (
          <div className="tc-rs-tablo-kap">
            <table className="tc-rs-tablo" aria-label="Rota şablonları">
              <thead>
                <tr><th scope="col">Şablon</th><th scope="col">Adımlar</th><th scope="col">Öneri sözcükleri</th><th scope="col">Kullanım</th>{o.yetki.sablonYaz && <th scope="col"><span className="tc-rs-gizli">İşlem</span></th>}</tr>
              </thead>
              <tbody>
                {liste.map((s) => (
                  <tr key={s.id} className={`${s.aktif ? '' : 'tc-rs-pasif'}${secili?.id === s.id ? ' tc-rs-secili' : ''}`}>
                    <th scope="row">
                      <span className="tc-rs-ad">{s.ad}</span>
                      {s.varsayilan && <Rozet ton="bilgi">varsayılan</Rozet>}
                      {!s.aktif && <Rozet ton="pasif" gorunum="cizgi">kullanımdan kalktı</Rozet>}
                    </th>
                    <td data-baslik="Adımlar"><OpSeridi ogeler={sablonSeridi(s, opBul)} etiket={`${s.ad} operasyonları`} /></td>
                    <td data-baslik="Öneri sözcükleri">{s.oneriSozcukleri.length > 0 ? s.oneriSozcukleri.join(', ') : '-'}</td>
                    <td data-baslik="Kullanım" className="tc-rs-sayi">{String(s.kullanim.revizyon)}</td>
                    {o.yetki.sablonYaz && (
                      <td className="tc-rs-islem">
                        <Dugme tur="ikincil" simge="edit" aria-label={`Düzenle: ${s.ad}`} aria-pressed={secili?.id === s.id}
                          onClick={() => { setDuzenlenen({ tur: 'var', id: s.id }); }}>
                          Düzenle
                        </Dugme>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {liste.length === 0 && <p className="tc-rs-ipucu">Aramaya uyan şablon yok.</p>}
          </div>
        )}
        {panelAcik && (
          <DuzenlemePaneli key={secili ? `${String(secili.id)}-${String(secili.surum)}` : 'yeni'} s={secili} opler={opler}
            kapat={() => { setDuzenlenen(null); }} sec={(id) => { setDuzenlenen({ tur: 'var', id }); }} />
        )}
      </div>
    </div>
  );
}
