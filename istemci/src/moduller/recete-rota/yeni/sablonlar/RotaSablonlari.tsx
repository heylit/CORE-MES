import { useEffect, useRef, useState } from 'react';
import { DurumKutusu, Dugme, Girdi, OnayPenceresi, Rozet, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import type { Istasyon, Operasyon } from '../rotalar/kurallar.ts';
import { renkSinifi } from '../rotalar/ortak.tsx';
import { katalogSuresi, sade, type RotaSablonu } from '../rotalar/sablonSecimi.ts';
import { SablonHatti, type HatAdimi } from './SablonHatti.tsx';
import { useRotaSablonKomutu, useRotaSablonlari, type RotaSablonKomutu } from '../rotalar/sablonVerisi.ts';

// Rota şablonları (3273 a): şablon kartları ve düzenleme paneli (ad, öneri sözcükleri, yatay adım akışı, operasyon ekle). Kullanılmış şablon
// silinmez, kullanımdan kalkar (Risk K1); varsayılan şablon kullanımdan kalkmaz (K2). Değişiklik yalnız sonra açılan rotalara gelir.

interface DuzenAdimi { anahtar: string; operasyonTipiId: number; ad: string; kod: string }
type OpBul = (id: string) => Operasyon | undefined;
type IstBul = (id: string | null) => Istasyon | undefined;
type Duzenlenen = { tur: 'yeni' } | { tur: 'var'; id: number };

const sozcukListesi = (m: string): string[] => [...new Set(m.split(',').map((x) => x.trim()).filter((x) => x !== ''))];
let sayac = 0;
const anahtarVer = (): string => { sayac += 1; return `a${String(sayac)}`; };
const adimGovdesi = (l: readonly DuzenAdimi[]) => l.map((x) => ({ operasyonTipiId: x.operasyonTipiId, ad: x.ad }));
const sablonAdimlari = (s: RotaSablonu): DuzenAdimi[] =>
  [...s.adimlar].sort((a, b) => a.sira - b.sira).map((x) => ({ anahtar: anahtarVer(), operasyonTipiId: x.operasyonTipi.id, ad: x.ad, kod: x.operasyonTipi.kod }));

// Hat kartı: istasyon ve süre katalogdandır (şablon bunları saklamaz); katalogda olmayan tip kodu ve adıyla durur.
const hatAdimi = (anahtar: string, opId: number, ad: string, kodYedek: string, opBul: OpBul, istBul: IstBul): HatAdimi => {
  const op = opBul(String(opId));
  const ist = istBul(op?.stationId ?? null);
  return {
    anahtar, kod: op?.abbr ?? kodYedek, renk: renkSinifi(op?.stationId ?? null), ad, operasyon: op?.name ?? ad,
    istasyon: ist ? `${ist.code} ${ist.name}` : null, sure: op ? katalogSuresi(op) : 'katalogda yok',
  };
};
const sablonHatti = (s: RotaSablonu, opBul: OpBul, istBul: IstBul): HatAdimi[] =>
  [...s.adimlar].sort((a, b) => a.sira - b.sira).map((x) => hatAdimi(`${String(s.id)}-${String(x.sira)}`, x.operasyonTipi.id, x.ad, x.operasyonTipi.kod, opBul, istBul));

function DuzenlemePaneli({ s, opler, istasyonlar, kapat, sec }: {
  s: RotaSablonu | null; opler: readonly Operasyon[]; istasyonlar: readonly Istasyon[]; kapat: () => void; sec: (id: number) => void;
}) {
  const komut = useRotaSablonKomutu();
  const { bildir } = useBildirim();
  const opBul: OpBul = (id) => opler.find((o) => o.id === id);
  const istBul: IstBul = (id) => (id === null ? undefined : istasyonlar.find((i) => i.id === id));
  const [ad, setAd] = useState(s?.ad ?? '');
  const [sozcuk, setSozcuk] = useState(s?.oneriSozcukleri.join(', ') ?? '');
  const [aciklama, setAciklama] = useState(s?.aciklama ?? '');
  const [adimlar, setAdimlar] = useState<DuzenAdimi[]>(() => (s ? sablonAdimlari(s) : []));
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
    setAdimlar([...adimlar, { anahtar: anahtarVer(), operasyonTipiId: Number(o.id), ad: o.name, kod: o.code }]);
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
        <SablonHatti etiket="Adım akışı" adimlar={adimlar.map((x) => hatAdimi(x.anahtar, x.operasyonTipiId, x.ad, x.kod, opBul, istBul))}
          duzen={{ tasi, kaldir: (i) => { setAdimlar(adimlar.filter((_, k) => k !== i)); } }} />
      )}
      <h4>Operasyon ekle</h4>
      <div className="tc-rs-opler" role="group" aria-label="Operasyon ekle">
        {aktifOpler.map((o) => (
          <button key={o.id} type="button" className="tc-rs-opekle" aria-label={`${o.name} ekle`} title={o.name} onClick={() => { ekle(o); }}>
            <Simge ad="plus" boyut="k" /> {o.abbr ?? o.code} <span className="tc-rs-opekle-ad">{o.name}</span>
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
  const istasyonlar = o.veri.durum.stations ?? [];
  const opBul: OpBul = (id) => opler.find((x) => x.id === id);
  const istBul: IstBul = (id) => (id === null ? undefined : istasyonlar.find((x) => x.id === id));
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj="Rota şablonları okunamadı." />;
  // Arama ad, öneri sözcüğü, açıklama ve adımlarda (adım adı, operasyon kodu ve adı, istasyon) bakar; sözcükler ayrı ayrı ve birlikte eşleşir.
  const metin = (s: RotaSablonu, hat: readonly HatAdimi[]): string =>
    sade([s.ad, s.aciklama ?? '', ...s.oneriSozcukleri, ...hat.flatMap((x) => [x.kod, x.ad, x.operasyon, x.istasyon ?? ''])].join(' '));
  const kartlar = sorgu.data.map((s) => ({ s, hat: sablonHatti(s, opBul, istBul) }));
  const sozcukler = sade(ara).split(' ').filter((x) => x !== '');
  const liste = kartlar.filter(({ s, hat }) => { const m = metin(s, hat); return sozcukler.every((z) => m.includes(z)); });
  const secili = duzenlenen?.tur === 'var' ? sorgu.data.find((s) => s.id === duzenlenen.id) ?? null : null;
  const panelAcik = o.yetki.sablonYaz && (duzenlenen?.tur === 'yeni' || secili !== null);
  return (
    <div className="tc-rs" data-parca="R1">
      <div className="tc-rs-ust">
        <Girdi etiket="Ara" placeholder="ad, öneri sözcüğü, operasyon ya da istasyon" value={ara} onChange={(e) => { setAra(e.target.value); }} />
        {ara !== '' && <Dugme tur="ikincil" simge="x" onClick={() => { setAra(''); }}>Aramayı temizle</Dugme>}
        {o.yetki.sablonYaz && <Dugme tur="birincil" simge="plus" onClick={() => { setDuzenlenen({ tur: 'yeni' }); }}>Yeni şablon</Dugme>}
      </div>
      <p className="tc-rs-sayim" role="status" aria-live="polite">{ara === '' ? '' : `${String(liste.length)} şablon, ${String(sorgu.data.length)} içinden`}</p>
      {!o.yetki.sablonYaz && <p className="tc-rs-ipucu">Şablonları düzenleme yetkin yok; liste salt okunur.</p>}
      {panelAcik && (
        <DuzenlemePaneli key={secili ? `${String(secili.id)}-${String(secili.surum)}` : 'yeni'} s={secili} opler={opler} istasyonlar={istasyonlar}
          kapat={() => { setDuzenlenen(null); }} sec={(id) => { setDuzenlenen({ tur: 'var', id }); }} />
      )}
      {sorgu.data.length === 0 ? <DurumKutusu durum="bos" mesaj="Şablon yok." /> : (
        <>
          <ul className="tc-rs-liste" aria-label="Rota şablonları">
            {liste.map(({ s, hat }) => (
              <li key={s.id} className={`tc-rs-oge${s.aktif ? '' : ' tc-rs-pasif'}${secili?.id === s.id ? ' tc-rs-secili' : ''}`}>
                <div className="tc-rs-oge-bas">
                  <span className="tc-rs-ad">{s.ad}</span>
                  {s.varsayilan && <Rozet ton="bilgi">varsayılan</Rozet>}
                  {!s.aktif && <Rozet ton="pasif" gorunum="cizgi">kullanımdan kalktı</Rozet>}
                  <Rozet ton="pasif" gorunum="cizgi">{`${String(s.kullanim.revizyon)} rotada`}</Rozet>
                  {o.yetki.sablonYaz && (
                    <Dugme tur="ikincil" simge="edit" aria-label={`Düzenle: ${s.ad}`} title={`Düzenle: ${s.ad}`} aria-pressed={secili?.id === s.id}
                      onClick={() => { setDuzenlenen({ tur: 'var', id: s.id }); }}>
                      Düzenle
                    </Dugme>
                  )}
                </div>
                {(s.oneriSozcukleri.length > 0 || s.aciklama) && (
                  <p className="tc-rs-alt">
                    {s.oneriSozcukleri.length > 0 && <span>{`Öneri sözcükleri: ${s.oneriSozcukleri.join(', ')}`}</span>}
                    {s.aciklama && <span>{s.aciklama}</span>}
                  </p>
                )}
                <SablonHatti adimlar={hat} etiket={`${s.ad} adım akışı`} />
              </li>
            ))}
          </ul>
          {liste.length === 0 && (
            <p className="tc-rs-ipucu">Aramaya uyan şablon yok. <Dugme tur="ikincil" simge="x" onClick={() => { setAra(''); }}>Aramayı temizle</Dugme></p>
          )}
        </>
      )}
    </div>
  );
}
