import { Suspense, lazy, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { Bag, BelgeAyrintisi, Revizyon } from '#paylasilan/sozlesme/cizimler.ts';
import { Dugme, DurumKutusu, Kart, OnayPenceresi, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ikiliOku, kaydet } from './dosya-aktarimi.ts';
import { BelgeDuzenle, IstasyonaBagla, MalzemeBagla, RevizyonEkle } from './formlar.tsx';
import { BAG_ADI, DURUM_ADI, DURUM_TONU, TUR_ADI, TUR_SIMGESI, boyutMetni, zamanMetni } from './gosterim.ts';
import { useKomut, useYetki } from './komut.ts';
import { onizlemeTuruMu } from './onizleme-kurallari.ts';
import { useOnizleme } from './onizleme-akisi.ts';
import './cizimler.css';

// pdf.js, three ve STEP okuyucusu yalnız belge açılınca iner.
const Goruntuleyici = lazy(() => import('./goruntu/Goruntuleyici.tsx'));

// Bağlı kayıt okunur adıyla görünür; adı gelmeyen kayıtta (sahibi ad vermiyor ya da kayıt silinmiş) kimlik yazılır.
const bagHedefi = (b: Pick<Bag, 'hedefAdi' | 'hedefId'>): string => b.hedefAdi ?? `#${String(b.hedefId)}`;

type Acik = 'duzenle' | 'revizyon' | 'bag' | 'istasyon' | 'arsiv' | { sil: Revizyon } | { yayinla: Revizyon } | { bagKaldir: Bag } | null;

const DOSYA_MIME: Record<Revizyon['dosyaTuru'], string> = {
  pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', step: 'model/step', stl: 'model/stl', iges: 'model/iges',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', dxf: 'image/vnd.dxf',
};

interface OnayOzellikleri {
  belge: BelgeAyrintisi;
  acik: Exclude<Acik, 'duzenle' | 'revizyon' | 'bag' | 'istasyon' | null>;
  kapat: () => void;
  // Yayınlama başarılı olunca, yayınlanan revizyonun güncel hâliyle.
  yayinlandi: (belge: BelgeAyrintisi, revizyonId: number) => void;
}

function Onay({ belge, acik, kapat, yayinlandi }: OnayOzellikleri) {
  const surum = { surum: belge.surum };
  const [yol, baslik, metin, onayMetni, govde, tehlikeli] = acik === 'arsiv'
    ? belge.aktif
      ? [`/cizimler/${belge.id}/arsivle`, 'Belgeyi arşivle', 'Belge listeden kalkar; dosyaları ve bağları korunur, arşivden geri alınabilir.', 'Arşivle', surum, true]
      : [`/cizimler/${belge.id}/arsivden-cikar`, 'Arşivden çıkar', 'Belge yeniden listede görünür.', 'Arşivden çıkar', surum, false]
    : 'sil' in acik
      ? [`/cizimler/${belge.id}/revizyonlar/${acik.sil.id}/sil`, `Revizyon ${acik.sil.harf} silinsin mi?`, 'Taslak revizyon ve dosya bağı silinir. Bu işlem geri alınamaz.', 'Sil', surum, true]
      : 'yayinla' in acik
        ? [`/cizimler/${belge.id}/revizyonlar/${acik.yayinla.id}/yayinla`, `Revizyon ${acik.yayinla.harf} yayınlansın mı?`, 'Yayındaki revizyon eskiye düşer; bu belgeyi gösteren ekranlar yeni revizyonu gösterir.', 'Yayınla', surum, false]
        : [`/cizimler/${belge.id}/bag-kaldir`, 'Bağı kaldır', `${BAG_ADI[acik.bagKaldir.hedefModul]} ${bagHedefi(acik.bagKaldir)} ile bağ kaldırılır.`, 'Kaldır',
          { hedefModul: acik.bagKaldir.hedefModul, hedefId: acik.bagKaldir.hedefId, ...surum }, true];
  const komut = useKomut(yol, (cevap) => {
    kapat();
    if (typeof acik === 'object' && 'yayinla' in acik) yayinlandi(cevap, acik.yayinla.id);
  });
  return (
    <OnayPenceresi acik baslik={baslik} onayMetni={onayMetni} tehlikeli={tehlikeli} yukleniyor={komut.yukleniyor} onayla={() => { komut.gonder(govde); }} vazgec={kapat}>
      <p>{metin}</p>
      {komut.hata !== null && <p className="tc-cz-hata" role="alert">{komut.hata}</p>}
    </OnayPenceresi>
  );
}

function IndirDugmesi({ belgeId, r }: { belgeId: number; r: Revizyon }) {
  const [inen, inenYaz] = useState(false);
  const [hata, hataYaz] = useState<string | null>(null);
  const indir = () => {
    inenYaz(true);
    hataYaz(null);
    ikiliOku(`/cizimler/${belgeId}/revizyonlar/${r.id}/dosya`)
      .then((veri) => { kaydet(veri, r.dosyaAdi, DOSYA_MIME[r.dosyaTuru]); }, (e: unknown) => { hataYaz(hataIletisi(e, 'Dosya indirilemedi')); })
      .finally(() => { inenYaz(false); });
  };
  return (
    <>
      <Dugme simge="download" yukleniyor={inen} onClick={indir} aria-label={`Revizyon ${r.harf} dosyasını indir`}>İndir</Dugme>
      {hata !== null && <span className="tc-cz-hata" role="alert">{hata}</span>}
    </>
  );
}

export function BelgeSayfasi() {
  const { id: ham } = useParams();
  const id = Number(ham);
  const gecerli = Number.isSafeInteger(id) && id > 0;
  const yonlendir = useNavigate();
  const { yazar, yayinlar } = useYetki();
  const [acik, acikYaz] = useState<Acik>(null);
  const [seciliId, seciliYaz] = useState<number | null>(null);
  const onizleme = useOnizleme();
  const sorgu = useQuery({
    queryKey: anahtarlar.ayrinti(id),
    queryFn: () => api.get<BelgeAyrintisi>(`/cizimler/${id}`),
    enabled: gecerli,
  });
  const belge = sorgu.data;
  const kapat = () => { acikYaz(null); };
  // Yayından sonra revizyonun önizlemesi (3B modelde dönen kareler, PDF ve fotoda küçük resim) arka planda üretilir; karesi olan (eskiden yayında olmuş) revizyon yeniden üretilmez.
  const yayinlandi = (guncel: BelgeAyrintisi, revizyonId: number) => {
    const r = guncel.revizyonlar.find((x) => x.id === revizyonId);
    if (r && onizlemeTuruMu(r.dosyaTuru) && r.onizlemeKareSayisi === 0) void onizleme.uret(guncel.id, r);
  };

  if (!gecerli) return <DurumKutusu durum="hata" mesaj="Belge bulunamadı" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Belge alınamadı')} yenile={() => { void sorgu.refetch(); }} />;
  if (!belge) return <DurumKutusu durum="yukleniyor" />;

  const gosterilen = belge.revizyonlar.find((r) => r.id === seciliId)
    ?? belge.revizyonlar.find((r) => r.durum === 'yayinda') ?? belge.revizyonlar[0];
  const degisir = yazar && belge.aktif;

  return (
    <section className="tc-cz">
      <header className="tc-cz-bas">
        <Dugme simge="back" onClick={() => { void yonlendir(-1); }} aria-label="Geri">Geri</Dugme>
        <h1 className="tc-cz-baslik"><Simge ad={TUR_SIMGESI[belge.tur]} />{belge.ad}</h1>
        <Rozet ton="bilgi">{TUR_ADI[belge.tur]}</Rozet>
        {!belge.aktif && <Rozet ton="pasif">Arşivde</Rozet>}
        <div className="tc-cz-bas-sag">
          {degisir && <Dugme simge="edit" onClick={() => { acikYaz('duzenle'); }}>Düzenle</Dugme>}
          {yazar && <Dugme simge="box" onClick={() => { acikYaz('arsiv'); }}>{belge.aktif ? 'Arşivle' : 'Arşivden çıkar'}</Dugme>}
          {degisir && <Dugme tur="birincil" simge="upload" onClick={() => { acikYaz('revizyon'); }}>Yeni revizyon</Dugme>}
        </div>
      </header>

      <div className="tc-cz-duzen">
        <Kart baslik={gosterilen ? `Revizyon ${gosterilen.harf} · ${gosterilen.dosyaAdi}` : 'Görüntü'}>
          {gosterilen
            ? (
              <Suspense fallback={<DurumKutusu durum="yukleniyor" mesaj="Görüntüleyici açılıyor" />}>
                <Goruntuleyici key={gosterilen.id} belgeId={belge.id} revizyonId={gosterilen.id} tur={gosterilen.dosyaTuru} ad={gosterilen.dosyaAdi} />
              </Suspense>
            )
            : <DurumKutusu durum="bos" mesaj="Revizyon yok" />}
        </Kart>

        <div className="tc-cz-yan">
          <Kart baslik="Bilgi">
            <dl className="tc-cz-liste">
              <dt>Açıklama</dt><dd>{belge.aciklama ?? 'yok'}</dd>
              <dt>Teknik resim no</dt><dd className="mono">{belge.resimNo ?? 'yok'}</dd>
              <dt>Açan</dt><dd>{belge.olusturanAd ?? 'bilinmiyor'} · <span className="mono">{zamanMetni(belge.olusturuldu)}</span></dd>
              <dt>Güncellendi</dt><dd className="mono">{zamanMetni(belge.guncellendi)}</dd>
            </dl>
          </Kart>

          <Kart baslik="Revizyonlar">
            <ul className="tc-cz-revizyonlar">
              {belge.revizyonlar.map((r) => (
                <li key={r.id} className={r.id === gosterilen?.id ? 'tc-cz-secili' : undefined}>
                  <div className="tc-cz-rev-ust">
                    <b className="mono">{r.harf}</b>
                    {r.antetRev !== null && r.antetRev !== r.harf && <span className="tc-cz-ipucu mono" title="Antet revizyonu">Antet {r.antetRev}</span>}
                    <Rozet ton={DURUM_TONU[r.durum]}>{DURUM_ADI[r.durum]}</Rozet>
                    <span className="tc-cz-dosya">{r.dosyaAdi}</span>
                    <span className="tc-cz-ipucu mono">{r.dosyaTuru.toUpperCase()} · {boyutMetni(r.boyut)}</span>
                  </div>
                  {r.not !== null && <p className="tc-cz-not">{r.not}</p>}
                  <p className="tc-cz-ipucu">
                    Yükleyen {r.yukleyenAd ?? 'bilinmiyor'} · <span className="mono">{zamanMetni(r.yuklendi)}</span>
                    {r.yayinlandi !== null && <> · Yayınlayan {r.yayinlayanAd ?? 'bilinmiyor'} · <span className="mono">{zamanMetni(r.yayinlandi)}</span></>}
                  </p>
                  <div className="tc-cz-rev-arac">
                    {r.id !== gosterilen?.id && <Dugme simge="eye" onClick={() => { seciliYaz(r.id); }}>Görüntüle</Dugme>}
                    <IndirDugmesi belgeId={belge.id} r={r} />
                    {yayinlar && belge.aktif && r.durum !== 'yayinda' && <Dugme tur="birincil" simge="check" onClick={() => { acikYaz({ yayinla: r }); }}>Yayınla</Dugme>}
                    {yayinlar && belge.aktif && r.durum === 'yayinda' && onizlemeTuruMu(r.dosyaTuru) && r.onizlemeKareSayisi === 0 && (
                      <Dugme
                        simge="scan" yukleniyor={onizleme.uretilen === r.id} disabled={onizleme.uretilen !== null}
                        onClick={() => { void onizleme.uret(belge.id, r); }} aria-label={`Revizyon ${r.harf} için önizleme üret`}
                      >
                        Önizleme üret
                      </Dugme>
                    )}
                    {degisir && r.durum === 'taslak' && belge.revizyonlar.length > 1 && <Dugme tur="tehlike" simge="trash" onClick={() => { acikYaz({ sil: r }); }}>Sil</Dugme>}
                  </div>
                </li>
              ))}
            </ul>
          </Kart>

          <Kart
            baslik="Bağlı kayıtlar"
            sag={degisir && (
              <div className="tc-cz-rev-arac">
                {belge.tur === '3b-model' && <Dugme simge="cpu" onClick={() => { acikYaz('istasyon'); }}>Makineyle eşleştir</Dugme>}
                <Dugme simge="plus" onClick={() => { acikYaz('bag'); }}>Malzemeye bağla</Dugme>
              </div>
            )}
          >
            {belge.baglar.length === 0
              ? <DurumKutusu durum="bos" mesaj="Bağlı kayıt yok" />
              : (
                <ul className="tc-cz-baglar">
                  {belge.baglar.map((b) => (
                    <li key={`${b.hedefModul}-${b.hedefId}`}>
                      <span><Simge ad="tag" />{BAG_ADI[b.hedefModul]} <b className="mono">{bagHedefi(b)}</b>{b.kapak && <Rozet ton="bilgi">Kapak</Rozet>}</span>
                      <span className="tc-cz-ipucu">{b.ekleyenAd ?? 'bilinmiyor'} · <span className="mono">{zamanMetni(b.eklendi)}</span></span>
                      {yazar && <Dugme simge="x" aria-label="Bağı kaldır" onClick={() => { acikYaz({ bagKaldir: b }); }} />}
                    </li>
                  ))}
                </ul>
              )}
          </Kart>
        </div>
      </div>

      {acik === 'duzenle' && <BelgeDuzenle belge={belge} kapat={kapat} />}
      {acik === 'revizyon' && <RevizyonEkle belge={belge} kapat={kapat} />}
      {acik === 'bag' && <MalzemeBagla belge={belge} kapat={kapat} />}
      {acik === 'istasyon' && <IstasyonaBagla belge={belge} kapat={kapat} />}
      {acik !== null && acik !== 'duzenle' && acik !== 'revizyon' && acik !== 'bag' && acik !== 'istasyon' && <Onay belge={belge} acik={acik} kapat={kapat} yayinlandi={yayinlandi} />}
    </section>
  );
}
