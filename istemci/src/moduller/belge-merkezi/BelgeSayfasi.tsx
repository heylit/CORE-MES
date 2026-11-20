import { Suspense, lazy, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Bag, BelgeAyrintisi, BelgeSilmeCevabi, Kullanim, Revizyon } from '#paylasilan/sozlesme/belge-merkezi.ts';
import { Dugme, DurumKutusu, Kart, OnayPenceresi, Rozet, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../ortak/veri/api.ts';
import { useTekGonderim } from '../../ortak/veri/korumali-komut.ts';
import { anahtarlar } from './anahtarlar.ts';
import { revKoduMetni, revizyonAdi } from './revizyon-kodu.ts';
import { ikiliOku, kaydet } from './dosya-aktarimi.ts';
import { BelgeDuzenle, IstasyonaBagla, MalzemeBagla, RevizyonEkle, TurevEkle, TurevOlarakBagla } from './formlar.tsx';
import { KAYNAK_ESKI_ACIKLAMASI, KaynakEskiRozeti, KullanimRozeti, RevizyonTurevleri } from './Turev.tsx';
import { BAG_ADI, DURUM_ADI, DURUM_TONU, TUR_ADI, TUR_SIMGESI, boyutMetni, zamanMetni } from './gosterim.ts';
import { useKomut, useYetki } from './komut.ts';
import { useMenuSayaclari } from './menu-sayaclari.ts';
import { onizlemeTuruMu } from './onizleme-kurallari.ts';
import { useOnizleme } from './onizleme-akisi.ts';
import './belge-merkezi.css';

// pdf.js, three ve STEP okuyucusu yalnız belge açılınca iner.
const Goruntuleyici = lazy(() => import('./goruntu/Goruntuleyici.tsx'));

// Bağlı kayıt okunur adıyla görünür; adı gelmeyen kayıtta (sahibi ad vermiyor ya da kayıt silinmiş) kimlik yazılır.
const bagHedefi = (b: Pick<Bag, 'hedefAdi' | 'hedefId'>): string => b.hedefAdi ?? `#${String(b.hedefId)}`;

type Acik = 'duzenle' | 'revizyon' | 'bag' | 'istasyon' | 'arsiv' | 'belgeSil' | 'turevBagla' | 'turevKaldir' | { turevEkle: Revizyon; kullanim: Kullanim | null }
  | { sil: Revizyon } | { yayinla: Revizyon } | { bagKaldir: Bag } | null;

const DOSYA_MIME: Record<Revizyon['dosyaTuru'], string> = {
  pdf: 'application/pdf', png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', step: 'model/step', stl: 'model/stl', iges: 'model/iges',
  glb: 'model/gltf-binary', gltf: 'model/gltf+json', dxf: 'image/vnd.dxf', mp4: 'video/mp4',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain', csv: 'text/csv',
};

interface OnayOzellikleri {
  belge: BelgeAyrintisi;
  acik: Exclude<Acik, 'duzenle' | 'revizyon' | 'bag' | 'istasyon' | 'belgeSil' | 'turevBagla' | 'turevKaldir' | { turevEkle: Revizyon } | null>;
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
      ? [`/cizimler/${belge.id}/revizyonlar/${acik.sil.id}/sil`, `${revizyonAdi(acik.sil)} silinsin mi?`, 'Taslak revizyon ve dosya bağı silinir. Bu işlem geri alınamaz.', 'Sil', surum, true]
      : 'yayinla' in acik
        ? [`/cizimler/${belge.id}/revizyonlar/${acik.yayinla.id}/yayinla`, `${revizyonAdi(acik.yayinla)} yayınlansın mı?`, 'Yayındaki revizyon eskiye düşer; bu belgeyi gösteren ekranlar yeni revizyonu gösterir.', 'Yayınla', surum, false]
        : [`/cizimler/${belge.id}/bag-kaldir`, 'Bağı kaldır', `${BAG_ADI[acik.bagKaldir.hedefModul]} ${bagHedefi(acik.bagKaldir)} ile bağ kaldırılır.`, 'Kaldır',
          { hedefModul: acik.bagKaldir.hedefModul, hedefId: acik.bagKaldir.hedefId, ...surum }, true];
  const komut = useKomut(yol, (cevap) => {
    kapat();
    if (typeof acik === 'object' && 'yayinla' in acik) yayinlandi(cevap, acik.yayinla.id);
  });
  return (
    <OnayPenceresi acik baslik={baslik} onayMetni={onayMetni} tehlikeli={tehlikeli} yukleniyor={komut.yukleniyor} onayla={() => { komut.gonder(govde); }} vazgec={kapat}>
      <p>{metin}</p>
      {acik === 'arsiv' && belge.aktif && <ArsivEtkisi baglar={belge.baglar} />}
      {komut.hata !== null && <p className="tc-cz-hata" role="alert">{komut.hata}</p>}
    </OnayPenceresi>
  );
}

// 3324 a: arşivlenen çizim bağlı kayıtlarda görünmez; Arkon paketine alınmışsa o paketle iş başlatılamaz (Denetim #34).
function ArsivEtkisi({ baglar }: { baglar: readonly Bag[] }) {
  return (
    <>
      {baglar.length > 0 && (
        <>
          <p>Kullanıldığı yerler:</p>
          <ul className="tc-cz-silinecek">{baglar.map((b) => <li key={`${b.hedefModul}-${String(b.hedefId)}`}>{BAG_ADI[b.hedefModul]} {bagHedefi(b)}</li>)}</ul>
        </>
      )}
      <p className="tc-cz-uyari tc-cz-simgeli">
        <Simge ad="alert" /><span>Arşivlenen çizim bağlı kayıtlarda görünmez. Üretim Hazırlık paketine alınmışsa o paketle iş başlatılamaz; paket yenilenmelidir.</span>
      </p>
    </>
  );
}

// 3324 a: yalnız hiç yayına girmemiş belge silinir; onay silinecekleri sayar. Başarıda belgenin türünün listesine dönülür.
function BelgeSil({ belge, kapat }: { belge: BelgeAyrintisi; kapat: () => void }) {
  const istemci = useQueryClient();
  const yonlendir = useNavigate();
  const { bildir } = useBildirim();
  const listeyeDon = async (ileti: string) => {
    istemci.removeQueries({ queryKey: anahtarlar.ayrinti(belge.id) });
    await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
    bildir('tamam', ileti);
    void yonlendir(belge.aktif ? `/cizimler/${belge.tur}` : '/cizimler/arsiv', { replace: true });
  };
  const komut = useTekGonderim({
    mutationFn: () => api.post<BelgeSilmeCevabi>(`/cizimler/${belge.id}/sil`, { surum: belge.surum }),
    onSuccess: (cevap) => listeyeDon(`${cevap.ad} silindi`),
    // Komut tekrar korumalı değil: yanıtı kaybolan ilk istek belgeyi silmişse yinelenen istek 404 alır.
    // Öbür retlerde (bu arada yayınlandı ya da değişti) pencere kapanır, ileti bildirimde kalır ve belge yeniden okunur.
    onError: (e) => {
      if (e instanceof ApiHatasi && e.durum === 404) { void listeyeDon(`${belge.ad} zaten silinmiş`); return; }
      kapat();
      bildir('hata', hataIletisi(e, 'Belge silinemedi'));
      void istemci.invalidateQueries({ queryKey: anahtarlar.ayrinti(belge.id) });
    },
  });
  return (
    <OnayPenceresi
      acik baslik={`${belge.ad} silinsin mi?`} onayMetni="Sil" tehlikeli yukleniyor={komut.isPending}
      onayla={() => { komut.mutate(undefined); }} vazgec={kapat}
    >
      <p>Silinecekler:</p>
      <ul className="tc-cz-silinecek">
        {belge.revizyonlar.map((r) => <li key={r.id}>{revizyonAdi(r)} (taslak) ve dosyası <span className="mono">{r.dosyaAdi}</span></li>)}
        {belge.baglar.map((b) => <li key={`${b.hedefModul}-${String(b.hedefId)}`}>Bağ: {BAG_ADI[b.hedefModul]} {bagHedefi(b)}</li>)}
      </ul>
      <p className="tc-cz-hata tc-cz-simgeli"><Simge ad="alert" /><span>Bu işlem geri alınamaz.</span></p>
      <p className="tc-cz-ipucu">
        Belge hiç yayınlanmadığı için üretimde, Üretim Hazırlık'ta ve terminalde kullanılmamıştır. Kimin, ne zaman, hangi dosyayı sildiği denetim kaydında kalır.
      </p>
    </OnayPenceresi>
  );
}

// 3468-2: bağ kalkınca belge orijinal olur; dosyası ve revizyonları değişmez.
function TurevBaginiKaldir({ belge, kapat }: { belge: BelgeAyrintisi; kapat: () => void }) {
  const komut = useKomut(`/cizimler/${belge.id}/turev-bagini-kaldir`, kapat, 'Türev bağı kaldırılamadı');
  return (
    <OnayPenceresi acik baslik="Türev bağını kaldır" onayMetni="Kaldır" yukleniyor={komut.yukleniyor} onayla={() => { komut.gonder({ surum: belge.surum }); }} vazgec={kapat}>
      <p>Belge {belge.kaynak?.ad ?? 'orijinal'} belgesinin altından çıkar ve ayrı belge olarak kalır; dosyası ve revizyonları değişmez.</p>
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
      <Dugme simge="download" yukleniyor={inen} onClick={indir} aria-label={`${revizyonAdi(r)} dosyasını indir`}>İndir</Dugme>
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
  useMenuSayaclari();
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
  const yalnizTaslak = belge.revizyonlar.every((r) => r.durum === 'taslak');

  return (
    <section className="tc-cz">
      <header className="tc-cz-bas">
        <Dugme simge="back" onClick={() => { void yonlendir(-1); }} aria-label="Geri">Geri</Dugme>
        <h1 className="tc-cz-baslik"><Simge ad={TUR_SIMGESI[belge.tur]} />{belge.ad}</h1>
        <Rozet ton="bilgi">{TUR_ADI[belge.tur]}</Rozet>
        {!belge.aktif && <Rozet ton="pasif">Arşivde</Rozet>}
        {yalnizTaslak && <Rozet ton="uyari">Yalnız taslak</Rozet>}
        {belge.kaynak && <KullanimRozeti kullanim={belge.kaynak.kullanim} />}
        {belge.kaynak?.eski && <KaynakEskiRozeti />}
        <div className="tc-cz-bas-sag">
          {yazar && belge.kaynak && <Dugme simge="x" onClick={() => { acikYaz('turevKaldir'); }}>Türev bağını kaldır</Dugme>}
          {degisir && !belge.kaynak && (belge.turevler ?? []).length === 0 && <Dugme simge="layers" onClick={() => { acikYaz('turevBagla'); }}>Türev olarak bağla</Dugme>}
          {degisir && <Dugme simge="edit" onClick={() => { acikYaz('duzenle'); }}>Düzenle</Dugme>}
          {yazar && <Dugme simge="box" onClick={() => { acikYaz('arsiv'); }}>{belge.aktif ? 'Arşivle' : 'Arşivden çıkar'}</Dugme>}
          {yazar && yalnizTaslak && <Dugme tur="tehlike" simge="trash" onClick={() => { acikYaz('belgeSil'); }}>Belgeyi sil</Dugme>}
          {degisir && <Dugme tur="birincil" simge="upload" onClick={() => { acikYaz('revizyon'); }}>Yeni revizyon</Dugme>}
        </div>
      </header>
      {belge.kaynak && (
        <p className="tc-cz-turev-kaynak tc-cz-simgeli">
          <Simge ad="layers" />
          <span>
            Türev · Kaynak <Link to={`/cizimler/belge/${String(belge.kaynak.belgeId)}`}>{belge.kaynak.ad}</Link> <span className="mono">Rev {revKoduMetni(belge.kaynak.revKodu)}</span>
            {degisir && <> · <button type="button" className="tc-cz-baglanti" onClick={() => { acikYaz('turevBagla'); }}>Değiştir</button></>}
            {belge.kaynak.eski && <> <span className="tc-cz-uyari">{KAYNAK_ESKI_ACIKLAMASI}</span> <Link to={`/cizimler/belge/${String(belge.kaynak.belgeId)}`}>Orijinale git ve yenile</Link></>}
          </span>
        </p>
      )}
      {yazar && !yalnizTaslak && <p className="tc-cz-ipucu tc-cz-simgeli"><Simge ad="help" /><span>Yayınlanmış belge silinmez; izlenebilirlik kaydıdır. Kullanımdan kaldırmak için arşivleyin.</span></p>}

      <div className="tc-cz-duzen">
        <Kart baslik={gosterilen ? `${revizyonAdi(gosterilen)} · ${gosterilen.dosyaAdi}` : 'Görüntü'}>
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
                    <b className="mono" title={r.antetRev !== null ? 'Resmin revizyon kodu' : r.revKodu ? 'Malzeme kartının revizyonu' : 'Revizyon kodu girilmemiş'}>{revKoduMetni(r.revKodu)}</b>
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
                    {degisir && r.dosyaTuru === 'pdf' && (
                      <Dugme simge="edit" onClick={() => { void yonlendir(`/cizimler/belge/${belge.id}/duzenle/${r.id}`); }} aria-label={`${revizyonAdi(r)} PDF'ini düzenle`}>PDF düzenle</Dugme>
                    )}
                    {yayinlar && belge.aktif && r.durum !== 'yayinda' && <Dugme tur="birincil" simge="check" onClick={() => { acikYaz({ yayinla: r }); }}>Yayınla</Dugme>}
                    {yayinlar && belge.aktif && r.durum === 'yayinda' && onizlemeTuruMu(r.dosyaTuru) && r.onizlemeKareSayisi === 0 && (
                      <Dugme
                        simge="scan" yukleniyor={onizleme.uretilen === r.id} disabled={onizleme.uretilen !== null}
                        onClick={() => { void onizleme.uret(belge.id, r); }} aria-label={`${revizyonAdi(r)} için önizleme üret`}
                      >
                        Önizleme üret
                      </Dugme>
                    )}
                    {degisir && r.durum === 'taslak' && belge.revizyonlar.length > 1 && <Dugme tur="tehlike" simge="trash" onClick={() => { acikYaz({ sil: r }); }}>Sil</Dugme>}
                  </div>
                  {!belge.kaynak && (
                    <RevizyonTurevleri
                      revizyon={r} revizyonlar={belge.revizyonlar} turevler={belge.turevler ?? []} ekleyebilir={degisir}
                      turevEkle={(kullanim) => { acikYaz({ turevEkle: r, kullanim }); }}
                    />
                  )}
                </li>
              ))}
            </ul>
          </Kart>

          <Kart
            baslik="Bağlı kayıtlar"
            sag={degisir && (
              <div className="tc-cz-rev-arac">
                {belge.tur === '3b-model' && <Dugme simge="cpu" onClick={() => { acikYaz('istasyon'); }}>Makineyle eşleştir</Dugme>}
                {belge.tur !== 'irsaliye' && <Dugme simge="plus" onClick={() => { acikYaz('bag'); }}>Malzemeye bağla</Dugme>}
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
                      {/* İrsaliye mal kabulden kaldırılır (sunucu merkezBagKaldirmaReddi). */}
                      {yazar && b.hedefModul !== 'stok-mal-kabul' && <Dugme simge="x" aria-label="Bağı kaldır" onClick={() => { acikYaz({ bagKaldir: b }); }} />}
                    </li>
                  ))}
                </ul>
              )}
          </Kart>
        </div>
      </div>

      {acik === 'duzenle' && <BelgeDuzenle belge={belge} kapat={kapat} />}
      {acik === 'belgeSil' && <BelgeSil belge={belge} kapat={kapat} />}
      {acik === 'revizyon' && <RevizyonEkle belge={belge} kapat={kapat} />}
      {acik === 'bag' && <MalzemeBagla belge={belge} kapat={kapat} />}
      {acik === 'istasyon' && <IstasyonaBagla belge={belge} kapat={kapat} />}
      {acik === 'turevBagla' && <TurevOlarakBagla belge={belge} kapat={kapat} />}
      {acik === 'turevKaldir' && <TurevBaginiKaldir belge={belge} kapat={kapat} />}
      {typeof acik === 'object' && acik !== null && 'turevEkle' in acik && <TurevEkle kaynak={belge} revizyon={acik.turevEkle} ilkKullanim={acik.kullanim} kapat={kapat} />}
      {acik !== null && acik !== 'duzenle' && acik !== 'revizyon' && acik !== 'bag' && acik !== 'istasyon' && acik !== 'belgeSil' && acik !== 'turevBagla'
        && acik !== 'turevKaldir' && (acik === 'arsiv' || !('turevEkle' in acik)) && <Onay belge={belge} acik={acik} kapat={kapat} yayinlandi={yayinlandi} />}
    </section>
  );
}
