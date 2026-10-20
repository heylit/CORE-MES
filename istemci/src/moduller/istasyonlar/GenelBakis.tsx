import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MakineDurumu, SurumluMakine } from '#paylasilan/sozlesme/istasyonlar.ts';
import { DurumKutusu, Girdi, IsaretKutusu, Rozet, SayiKarti, Simge } from '../../ortak/arayuz/index.ts';
import { MAKINE_DURUM_ADLARI } from './etiketler.ts';
import { aramayaUyar } from './ListeAraclari.tsx';
import { merkezRengi, saatMetni, yuzdeMetni } from './tesis.ts';
import type { TesisVerisi } from './tesisVerisi.ts';

// Makine etiketi durum rengini taşır; durum satırı olmayan makine "girilmemiş" görünür, çalışır sayılmaz.
export function MakineEtiketi({ makine, durum }: { makine: SurumluMakine; durum: MakineDurumu | undefined }) {
  const kod = durum?.durum ?? 'girilmemis';
  const ad = durum ? MAKINE_DURUM_ADLARI[durum.durum] : 'Durum girilmemiş';
  return (
    <span className="tc-ist-cip" data-durum={kod} title={`${makine.ad}: ${ad}${durum?.aciklama ? `, ${durum.aciklama}` : ''}`}>
      <span className="tc-ist-led" aria-hidden="true" />
      <span className="tc-ist-mono">{makine.kod}</span>
      <span className="tc-ist-gizli">{ad}</span>
    </span>
  );
}

// Tesis yapısı kartlarla: iş merkezi > istasyon > makine, kişi ve ekip (kullanıcı kararı, kart #1109: sürükle bırak ağacın yerine).
export function GenelBakis({ v }: { v: TesisVerisi }) {
  const [ara, araYaz] = useState('');
  const [pasifler, pasiflerYaz] = useState(false);
  if (v.yukleniyor) return <DurumKutusu durum="yukleniyor" />;
  if (v.hata) return <DurumKutusu durum="hata" yenile={v.yenile} />;

  const gorunur = <T extends { aktif: boolean }>(k: T) => pasifler || k.aktif;
  const durum = (id: number) => v.durumlar?.find((d) => d.makineId === id);
  const aktifMakineler = v.makineler.filter((m) => m.aktif);
  const sayi = (k: MakineDurumu['durum']) => aktifMakineler.filter((m) => durum(m.id)?.durum === k).length;
  const atananlar = new Set([...(v.istasyonKisileri ?? []), ...(v.makineKisileri ?? []), ...(v.ekipUyeleri ?? [])]
    .filter((a) => !a.baslayacak).map((a) => a.kisiId));
  const atamaVar = v.istasyonKisileri !== null && v.makineKisileri !== null && v.ekipUyeleri !== null;
  const haftalik = v.takvim ? v.takvim.isMerkezleri.filter((m) => m.aktif).reduce((t, m) => t + m.haftalikDakika, 0) : null;
  const merkezHaftasi = (id: number) => v.takvim?.isMerkezleri.find((m) => m.id === id)?.haftalikDakika;

  const istasyonUyar = (i: (typeof v.istasyonlar)[number]) => aramayaUyar(ara, [i.kod, i.ad, i.sorumluAd])
    || v.makineler.some((m) => m.istasyonId === i.id && aramayaUyar(ara, [m.kod, m.ad]));
  const merkezler = v.merkezler.filter(gorunur).filter((m) => aramayaUyar(ara, [m.kod, m.ad])
    || v.istasyonlar.some((i) => i.isMerkeziId === m.id && gorunur(i) && istasyonUyar(i)));
  const bagsizMakineler = v.makineler.filter((m) => m.istasyonId === null && gorunur(m) && aramayaUyar(ara, [m.kod, m.ad]));
  const bagsizEkipler = (v.ekipler ?? []).filter((e) => e.istasyonId === null && gorunur(e) && aramayaUyar(ara, [e.kod, e.ad]));

  return (
    <div className="tc-ist-genel">
      <div className="tc-ist-kpi">
        <SayiKarti baslik="İş merkezi" simge="layers" sayi={v.merkezler.filter((m) => m.aktif).length}
          altMetin={`${v.istasyonlar.filter((i) => i.aktif).length} istasyon`} />
        <SayiKarti baslik="Makine" simge="cpu" sayi={aktifMakineler.length} hata={v.durumlar === null}
          altMetin={`${sayi('calisir')} çalışır, ${sayi('ariza')} arızada, ${sayi('bakim')} bakımda, ${aktifMakineler.filter((m) => !durum(m.id)).length} girilmemiş`} />
        <SayiKarti baslik="Atanmış kişi" simge="user" sayi={atamaVar ? atananlar.size : null} />
        <SayiKarti baslik="Haftalık vardiya" simge="clock" hata={v.takvim === null}
          {...(haftalik === null ? {} : { metin: `${saatMetni(haftalik)} sa` })} altMetin="aktif iş merkezlerinin toplamı" />
      </div>
      <div className="tc-ist-arac">
        <Girdi etiket="Ara" type="search" placeholder="Kod ya da ad" value={ara} onChange={(o) => araYaz(o.target.value)} />
        <IsaretKutusu etiket="Pasifleri göster" checked={pasifler} onChange={(o) => pasiflerYaz(o.target.checked)} />
      </div>
      {merkezler.length === 0 && bagsizMakineler.length === 0 && bagsizEkipler.length === 0 && (
        <DurumKutusu durum="bos" mesaj={v.merkezler.length === 0 ? 'İş merkezi yok. İş merkezleri ve istasyonlar bölümünden ekleyin.' : 'Aramaya uyan kayıt yok.'} />
      )}
      <div className="tc-ist-kartlar">
        {merkezler.map((m) => {
          const istasyonlar = v.istasyonlar.filter((i) => i.isMerkeziId === m.id && gorunur(i)
            && (aramayaUyar(ara, [m.kod, m.ad]) || istasyonUyar(i)));
          const hafta = merkezHaftasi(m.id);
          const kisiSayisi = new Set([...(v.istasyonKisileri ?? []).filter((a) => istasyonlar.some((i) => i.id === a.istasyonId)),
            ...(v.makineKisileri ?? []).filter((a) => v.makineler.some((x) => x.id === a.makineId && istasyonlar.some((i) => i.id === x.istasyonId)))]
            .filter((a) => !a.baslayacak).map((a) => a.kisiId)).size;
          return (
            <section key={m.id} className={`tc-ist-merkez-kart ${merkezRengi(m.id)}`} aria-label={`${m.kod} ${m.ad}`}>
              <header className="tc-ist-kart-bas">
                <h3><span className="tc-ist-mono">{m.kod}</span> {m.ad}</h3>
                {!m.aktif && <Rozet ton="pasif">Pasif</Rozet>}
              </header>
              <p className="tc-ist-kart-alt">
                <span>{hafta === undefined ? (v.takvim === null ? 'Vardiya alınamadı' : '…') : `${saatMetni(hafta)} sa/hafta`}</span>
                <span>{atamaVar ? `${kisiSayisi} kişi` : 'Kişi sayısı alınamadı'}</span>
                <Link to="/istasyonlar/vardiyalar">Vardiyalar</Link>
                <Link to="/istasyonlar/is-merkezleri">Düzenle</Link>
              </p>
              {istasyonlar.length === 0 && <p className="tc-ist-ipucu">İstasyon yok.</p>}
              {istasyonlar.map((i) => {
                const ayar = v.ayarlar?.find((a) => a.istasyonId === i.id);
                const makineler = v.makineler.filter((x) => x.istasyonId === i.id && gorunur(x));
                const kisiler = (v.istasyonKisileri ?? []).filter((a) => a.istasyonId === i.id);
                const ekipler = (v.ekipler ?? []).filter((e) => e.istasyonId === i.id && gorunur(e));
                return (
                  <div key={i.id} className="tc-ist-istasyon-blok" aria-label={`${i.kod} ${i.ad}`}>
                    <b><span className="tc-ist-mono">{i.kod}</span> {i.ad}{!i.aktif && ' (pasif)'}</b>
                    <small className="tc-ist-ipucu">
                      {ayar ? `verim ${yuzdeMetni(ayar.verimYuzde)}, ${Number(ayar.operatorIhtiyaci).toLocaleString('tr-TR')} operatör/makine` : 'verim %100, 1 operatör/makine (varsayılan)'}
                      {i.sorumluAd ? `, sorumlu ${i.sorumluAd}` : ''}
                    </small>
                    <div className="tc-ist-cipler">
                      {makineler.map((x) => <MakineEtiketi key={x.id} makine={x} durum={durum(x.id)} />)}
                      {kisiler.map((a) => (
                        <span key={`k${a.kisiId}`} className="tc-ist-cip">
                          <Simge ad="user" boyut="k" />{a.kisiAd} {yuzdeMetni(a.yuzde)}{a.baslayacak ? ' (başlayacak)' : ''}
                        </span>
                      ))}
                      {ekipler.map((e) => <span key={`e${e.id}`} className="tc-ist-cip tc-ist-cip-ekip"><Simge ad="user" boyut="k" />{e.ad}, {e.uyeSayisi} üye</span>)}
                      {makineler.length === 0 && kisiler.length === 0 && ekipler.length === 0 && <small className="tc-ist-ipucu">Makine ya da kişi yok</small>}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
        {(bagsizMakineler.length > 0 || bagsizEkipler.length > 0) && (
          <section className="tc-ist-merkez-kart tc-ist-renk-yok" aria-label="İstasyona bağlı olmayanlar">
            <header className="tc-ist-kart-bas"><h3>İstasyona bağlı olmayanlar</h3></header>
            <div className="tc-ist-cipler">
              {bagsizMakineler.map((x) => <MakineEtiketi key={x.id} makine={x} durum={durum(x.id)} />)}
              {bagsizEkipler.map((e) => <span key={`e${e.id}`} className="tc-ist-cip tc-ist-cip-ekip"><Simge ad="user" boyut="k" />{e.ad}</span>)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
