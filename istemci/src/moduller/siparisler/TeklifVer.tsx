import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { TeklifAyrintiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Sekmeler, type Sekme } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { TEKLIF_DURUMU, miktarMetni, paraMetni, tarihMetni } from './gorunum.ts';
import { SayfaBasligi } from './SayfaBasligi.tsx';
import { TalepKademeleri } from './TalepKademeleri.tsx';
import { TeklifFormuPenceresi } from './TeklifFormuPenceresi.tsx';
import { TerminFiyat } from './TerminFiyat.tsx';
import { useFiyatGorur, useYazabilir } from './yazma.ts';
import './siparisler.css';

type Kademe = '1' | '2' | '3' | '4';
// Kaydedilen talep yeni adrese geçerken açılacak kademe yolun durumunda taşınır (sayfa yenilenmez).
interface YolDurumu { kademe?: Kademe }

const SEKMELER: readonly Sekme<Kademe>[] = [
  { anahtar: '1', baslik: '1 Müşteri ve konu' },
  { anahtar: '2', baslik: '2 Kalemler' },
  { anahtar: '3', baslik: '3 Termin ve fiyat' },
  { anahtar: '4', baslik: '4 Koşullar ve gönder' },
];

const surumVerilir = (t: TeklifAyrintiCevabi) => t.durum === 'yeni' || t.durum === 'onay-bekliyor' || t.durum === 'verildi' || t.durum === 'revizyon';

// 3301 (D): teklif tek sayfada dört kademede verilir; üstte kademe sekmeleri. Kalemlerde Devam talebi kaydeder (termin denemesi
// kayıtlı teklif ister), son kademe sürümü verir ve teklif formu aynı yerde açılır. Talep ilk sürümden sonra değişmez (TKL-03).
function Sayfa({ teklif, ilkKademe }: { teklif: TeklifAyrintiCevabi | null; ilkKademe: Kademe }) {
  const gezin = useNavigate();
  const yazabilir = useYazabilir();
  const fiyatGorur = useFiyatGorur();
  const [kademe, kademeYaz] = useState<Kademe>(ilkKademe);
  const [verilen, verilenYaz] = useState<TeklifAyrintiCevabi | null>(null);
  const [formAcik, formAcikYaz] = useState(true);

  const talepAcik = yazabilir && (teklif === null || teklif.durum === 'yeni');
  const fiyatVerir = yazabilir && fiyatGorur && (teklif === null || surumVerilir(teklif));
  const teklifYolu = teklif === null ? '/siparisler/teklifler' : `/siparisler/teklifler/${String(teklif.id)}`;

  if (verilen !== null) {
    const son = verilen.surumler.at(-1) ?? null;
    const bekler = verilen.durum === 'onay-bekliyor';
    return (
      <section className="tc-sp">
        <SayfaBasligi baslik={`Teklif ver: ${verilen.no}`} alt={verilen.baslik} geriYol={teklifYolu} geriMetni="Teklife dön" />
        <Kart baslik={bekler ? 'Onay bekliyor' : 'Teklif verildi'}>
          <div className="tc-sp-yigin">
            <p className={bekler ? 'tc-sp-bildirim tc-sp-bildirim-uyari' : 'tc-sp-bildirim tc-sp-bildirim-tamam'} role="status">
              <strong>{`Sürüm ${String(verilen.sonSurumNo ?? '')} ${bekler ? 'onay bekliyor' : 'verildi'}`}</strong>
              {bekler
                ? ' İskonto ya da termin onayı verilince teklif müşteriye gider; teklif formu onaydan sonra alınır.'
                : ` ${son === null ? '' : `Tutar ${paraMetni(son.toplam, verilen.paraBirimi)}${son.iskontoOrani === null ? '' : `, iskonto %${miktarMetni(son.iskontoOrani)}`}. `}Teklif formunu yazdırın ya da PDF alın.`}
            </p>
            <div className="tc-sp-alt-cubuk">
              {!bekler && son !== null && fiyatGorur && <Dugme simge="printer" onClick={() => formAcikYaz(true)}>Teklif formu</Dugme>}
              <Dugme tur="birincil" simge="next" onClick={() => { void gezin(teklifYolu); }}>Teklife git</Dugme>
            </div>
          </div>
        </Kart>
        {!bekler && son !== null && fiyatGorur && <TeklifFormuPenceresi acik={formAcik} kapat={() => formAcikYaz(false)} teklif={verilen} surum={son} />}
      </section>
    );
  }

  // Kaydedilmemiş talepte kademe 3-4, kilitli talepte kademe 1-2 içerik yerine nedenini yazar; sekmeler görünür kalır.
  const kilit = (k: Kademe): string | null => {
    if (k === '1' || k === '2') return talepAcik ? null : 'Talep ilk sürüm verildikten sonra değişmez; kalemleri teklif sayfasında görün.';
    if (!fiyatVerir) return 'Fiyatı fiyat yetkisi olan girip sürümü verir.';
    return teklif === null ? 'Önce kalemleri kaydedin: termin ve fiyat kayıtlı talep üstünde denenir.' : null;
  };
  const neden = kilit(kademe);
  const kaydedildi = (cevap: TeklifAyrintiCevabi) => {
    if (!fiyatVerir) { void gezin(`/siparisler/teklifler/${String(cevap.id)}`); return; }
    if (teklif === null) { void gezin(`/siparisler/teklifler/${String(cevap.id)}/teklif-ver`, { replace: true, state: { kademe: '3' } satisfies YolDurumu }); return; }
    kademeYaz('3');
  };
  const durum = teklif === null ? null : TEKLIF_DURUMU[teklif.durum];
  // Biten kademe tik taşır (ön izleme D); ötekiler başlıktaki numarayla okunur. Talep kaydedildiyse 1-2, koşullara geçildiyse 3 bitmiştir.
  const bitti = (k: Kademe): boolean => (k === '1' ? teklif !== null || kademe !== '1' : k === '2' ? teklif !== null : k === '3' ? kademe === '4' : false);
  const sekmeler = SEKMELER.map((x) => (bitti(x.anahtar) ? { ...x, simge: 'check' as const } : x));

  return (
    <section className="tc-sp">
      <SayfaBasligi
        baslik={teklif === null ? 'Yeni teklif' : `Teklif ver: ${teklif.no}`}
        alt={teklif === null
          ? 'Müşteri, kalemler, termin ve fiyat, koşullar: aynı sayfada sırayla.'
          : `${teklif.baslik} · ${teklif.firmaAd ?? `Firma ${String(teklif.firmaId)}`} · İstenen teslim ${tarihMetni(teklif.istenenTarih)}`}
        {...(durum === null ? {} : { ek: <Rozet ton={durum.ton}>{durum.etiket}</Rozet> })}
        geriYol={teklifYolu}
        geriMetni={teklif === null ? 'Tekliflere dön' : 'Teklife dön'}
      />
      <Sekmeler etiket="Teklif kademeleri" sekmeler={sekmeler} secili={kademe} sec={kademeYaz} />
      {neden !== null && (
        <Kart baslik={SEKMELER.find((s) => s.anahtar === kademe)?.baslik.slice(2) ?? ''}>
          <div className="tc-sp-kilitli">
            <p className="tc-sp-bildirim" role="status">{neden}</p>
            {(kademe === '1' || kademe === '2') && teklif !== null && (
              <ul className="tc-sp-surumler" aria-label="Talep kalemleri">
                {teklif.satirlar.map((s) => <li key={s.id}><span>{s.tanim}</span><span>{`${miktarMetni(s.miktar)}${s.birim ? ` ${s.birim}` : ''}`}</span></li>)}
              </ul>
            )}
          </div>
        </Kart>
      )}
      {/* Talep formu kademe 1-2 boyunca ayakta kalır: kademeler arasında girilen değer kaybolmaz. */}
      {talepAcik && (kademe === '1' || kademe === '2') && (
        <TalepKademeleri
          key={teklif === null ? 'yeni' : `${String(teklif.id)}-${String(teklif.surum)}`}
          teklif={teklif}
          kademe={kademe === '1' ? 1 : 2}
          kademeYaz={(k) => kademeYaz(k === 1 ? '1' : '2')}
          fiyatVerir={fiyatVerir}
          kaydedildi={kaydedildi}
        />
      )}
      {teklif !== null && fiyatVerir && (kademe === '3' || kademe === '4') && (
        <TerminFiyat
          key={teklif.surum}
          teklif={teklif}
          kademe={kademe === '3' ? 3 : 4}
          kademeYaz={(k) => kademeYaz(k === 3 ? '3' : '4')}
          geri={() => kademeYaz('2')}
          verildi={verilenYaz}
        />
      )}
    </section>
  );
}

// /siparisler/teklifler/yeni: kademe 1'den; /:id/teklif-ver: kademe 3'ten (yeni sürüm); /:id/duzenle: kademe 1'den.
export function TeklifVer({ duzenle = false }: { duzenle?: boolean }) {
  const ham = useParams()['id'];
  const id = ham === undefined ? null : Number(ham);
  const yolDurumu = (useLocation().state ?? {}) as YolDurumu;
  const teklif = useQuery({
    queryKey: anahtarlar.teklif(id ?? 0),
    queryFn: () => api.get<TeklifAyrintiCevabi>(`/siparisler/teklifler/${String(id)}`),
    enabled: id !== null && Number.isInteger(id) && id > 0,
    refetchOnWindowFocus: false,
  });
  if (id === null) return <Sayfa teklif={null} ilkKademe="1" />;
  if (teklif.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (teklif.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(teklif.error, 'Teklif alınamadı')} yenile={() => { void teklif.refetch(); }} />;
  const t = teklif.data;
  if (duzenle && t.durum !== 'yeni') return <DurumKutusu durum="bos" mesaj="Talep yalnız ilk sürüm verilmeden düzenlenir." />;
  if (!duzenle && !surumVerilir(t)) return <DurumKutusu durum="bos" mesaj={`Bu teklife sürüm verilmez (${TEKLIF_DURUMU[t.durum].etiket}).`} />;
  return <Sayfa key={t.id} teklif={t} ilkKademe={yolDurumu.kademe ?? (duzenle ? '1' : '3')} />;
}
