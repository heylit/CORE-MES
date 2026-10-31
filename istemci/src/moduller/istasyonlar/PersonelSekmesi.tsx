import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AtamaTuru, KisiIsMerkezleriCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { KisiGovdesi } from '#paylasilan/sozlesme/kisiler.ts';
import type { TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { Dugme, DurumKutusu, Girdi, Pencere, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { GecmisDugmesi } from '../denetim/disari.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { AranabilirSecim } from './AranabilirSecim.tsx';
import { Ekipler } from './Ekipler.tsx';
import { SatirHatasi } from './Hucreler.tsx';
import { CikarOnayi } from './KisiPaneli.tsx';
import { aramayaUyar } from './ListeAraclari.tsx';
import { istasyonSecenekleri, kisileriBirlestir, kisininMerkezi, merkezRengi, yuzdeMetni, type KisiAtamasi, type KisiOzeti } from './tesis.ts';
import { TAKVIM_ANAHTARI, type TesisVerisi, type TesisYaz } from './tesisVerisi.ts';

const ATAMA_YOLU: Record<AtamaTuru, (id: number) => string> = {
  istasyon: (id) => `/istasyonlar/${id}/kisiler`,
  makine: (id) => `/makineler/${id}/kisiler`,
  ekip: (id) => `/ekipler/${id}/uyeler`,
};

// Sözleşmedeki TEZGAH_SINIRI_EN_COK ile aynı; istemci sözleşmeden değer ithal etmez.
const TEZGAH_SINIRI_EN_COK = 20;

const basHarfler = (ad: string) => ad.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase('tr-TR')).join('');

// Kişi açma kisiler modülünün ucudur; düğme yalnız bugün kişi açabilene (kisiler.yaz) görünür, rol yetkileri değişmez
// (kullanıcı kararı, kart #1109).
function KisiAcPenceresi({ kapat }: { kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [ad, adYaz] = useState('');
  const [sicilNo, sicilYaz] = useState('');
  const [gorev, gorevYaz] = useState('');
  const kaydet = useMutation({
    // Tekrar korumalı: cevabı yitirilen gönderim aynı kimlikle yinelenir, ikinci kişi açılmaz.
    mutationFn: (govde: KisiGovdesi) => tekrarKorumaliGonder((deneme) => api.post('/kisiler', govde, deneme)),
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kisiSecenekleri });
      bildir('tamam', 'Kişi eklendi; atamasını ve yetkinliğini aşağıdan verin.');
      kapat();
    },
  });
  return (
    <Pencere acik baslik="Kişi ekle" kapat={kapat} alt={(
      <>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="check" yukleniyor={kaydet.isPending} disabled={ad.trim() === ''}
          onClick={() => kaydet.mutate({ ad: ad.trim(), sicilNo: sicilNo.trim() || null, gorev: gorev.trim() || null })}>
          Kaydet
        </Dugme>
      </>
    )}>
      <div className="tc-ist-kutular">
        <Girdi etiket="Ad soyad" required value={ad} onChange={(o) => adYaz(o.target.value)} autoComplete="off" />
        <Girdi etiket="Sicil no" value={sicilNo} onChange={(o) => sicilYaz(o.target.value)} autoComplete="off" />
        <Girdi etiket="Görev" value={gorev} onChange={(o) => gorevYaz(o.target.value)} autoComplete="off" />
      </div>
      {kaydet.isError && <p className="tc-ist-hata" role="alert">{hataIletisi(kaydet.error, 'Kişi kaydedilemedi.')}</p>}
    </Pencere>
  );
}

function PersonelKarti({ k, v, y, yazabilir, kisitYazabilir, kendisi, vardiyaYazabilir, renk }: {
  k: KisiOzeti; v: TesisVerisi; y: TesisYaz; yazabilir: boolean; kisitYazabilir: boolean; kendisi: boolean; vardiyaYazabilir: boolean; renk: string;
}) {
  const istemci = useQueryClient();
  // Kişinin vardiyası vardiya modülünün ucudur; cevap takvimin tamamıdır ve iki ekranın ortak anahtarına yazılır.
  const vy = useMutation({
    mutationFn: (vardiyaId: number | null) => api.post<TakvimCevabi>(`/kisi-vardiyalari/${k.id}/belirle`, { vardiyaId }),
    onSuccess: (t) => { istemci.setQueryData(TAKVIM_ANAHTARI, t); },
  });
  const [hedef, hedefYaz] = useState('');
  const [yuzde, yuzdeYaz] = useState('100');
  const [cikarilan, cikarilanYaz] = useState<KisiAtamasi | null>(null);
  // Kısıt kişi başına okunur; yalnız yazabilen görür (uç kişinin kendisine, istasyonlar.yaz ya da arkon.amir taşıyana açıktır).
  // Kişi kendi kısıtını görür ama değiştiremez (245 a); amir başkasınınkini değiştirir (252 a).
  const kisit = useQuery({
    queryKey: anahtarlar.kisiKisiti(k.id),
    queryFn: () => api.get<KisiIsMerkezleriCevabi>(`/kisi-is-merkezleri/${k.id}`),
    enabled: kisitYazabilir,
  });
  const satir = `kisi:${k.id}`;
  const kapali = !yazabilir || y.mesgul;
  const yetkinlik = v.yetkinlikler?.find((x) => x.kisiId === k.id);
  const yetkin = yetkinlik?.istasyonIdleri ?? [];
  // Karar 146 a: geçerlilik bitişi ve dayanak çipin düzenle düğmesiyle girilir; süresi dolan yetkinlik iş başlatmaz.
  // Aynı düzenleyici ayar yetkinliğine de yazar (1303 a); yalnız uç yolu ve başlık değişir.
  const [duzenlenen, duzenlenenYaz] = useState<{ yol: string; baslik: string; bitis: string; dayanak: string; surum: number } | null>(null);
  const ayrinti = (istasyonId: number) => yetkinlik?.ayrintilar.find((a) => a.istasyonId === istasyonId);
  const ayrintiKaydet = () => {
    if (duzenlenen === null) return;
    y.gonder({
      yol: duzenlenen.yol,
      govde: { gecerlilikBitis: duzenlenen.bitis || null, dayanak: duzenlenen.dayanak || null, surum: duzenlenen.surum }, satir,
    });
    duzenlenenYaz(null);
  };
  const adi = (a: KisiAtamasi) => {
    if (a.tur === 'istasyon') { const i = v.istasyonlar.find((x) => x.id === a.hedefId); return i ? `${i.kod} istasyonu` : 'istasyon'; }
    if (a.tur === 'makine') { const m = v.makineler.find((x) => x.id === a.hedefId); return m ? `${m.kod} makinesi` : 'makine'; }
    const e = v.ekipler?.find((x) => x.id === a.hedefId); return e ? `${e.ad} ekibi` : 'ekip';
  };
  // Yüzlerce hedefte düz liste kaydırarak aranıyordu (kart #1296): seçici aranır, istasyonlar iş merkezine göre, makineler ve ekipler ayrı gruptadır.
  const istasyonlar = istasyonSecenekleri(v.merkezler, v.istasyonlar);
  const hedefler = [
    ...istasyonlar.map((i) => ({ ...i, deger: `istasyon:${i.deger}`, baslik: `İstasyon ${i.baslik}` })),
    ...v.makineler.filter((m) => m.aktif).map((m) => ({ deger: `makine:${m.id}`, baslik: `Makine ${m.kod} ${m.ad}`, grup: 'Makineler' })),
    ...(v.ekipler ?? []).filter((e) => e.aktif).map((e) => ({ deger: `ekip:${e.id}`, baslik: `Ekip ${e.kod} ${e.ad}`, grup: 'Ekipler' })),
  ];
  const yetkinlikYaz = (idler: number[]) => y.gonder({ yol: `/kisi-yetkinlikleri/${k.id}/belirle`, govde: { istasyonIdleri: idler }, satir });
  // 563 c: kişinin baktığı makineler yalnız yetkin olduğu istasyonlardan seçilir; istasyon yetkinliği kalkınca sunucu bunları da kaldırır.
  const makineYetkin = yetkinlik?.makineIdleri ?? [];
  const makineYaz = (idler: number[]) => y.gonder({ yol: `/kisi-yetkinlikleri/${k.id}/makineler/belirle`, govde: { makineIdleri: idler }, satir });
  const makineSecenekleri = v.makineler.filter((m) => m.aktif && m.istasyonId !== null && yetkin.includes(m.istasyonId) && !makineYetkin.includes(m.id))
    .map((m) => ({ deger: String(m.id), baslik: `${m.kod} ${m.ad}`, grup: v.istasyonlar.find((i) => i.id === m.istasyonId)?.kod ?? 'İstasyon' }));
  const enCok = yetkinlik?.enCok ?? null;
  // 1303 a: ayar yetkinliği makine bazındadır ve çalışma yetkinliğinden bağımsızdır; istasyon seçilirse sunucu bütün aktif makinelerini ekler.
  const ayar = yetkinlik?.ayar ?? [];
  const ayarIdleri = ayar.map((a) => a.makineId);
  const ayarYaz = (govde: { makineIdleri: number[]; istasyonIdleri?: number[] }) => y.gonder({ yol: `/kisi-yetkinlikleri/${k.id}/ayar/belirle`, govde, satir });
  const ayarSecenekleri = [
    ...v.makineler.filter((m) => m.aktif && !ayarIdleri.includes(m.id))
      .map((m) => ({ deger: `makine:${m.id}`, baslik: `${m.kod} ${m.ad}`, grup: v.istasyonlar.find((i) => i.id === m.istasyonId)?.kod ?? 'İstasyonsuz' })),
    ...istasyonlar.map((i) => ({ ...i, deger: `istasyon:${i.deger}`, baslik: `${i.baslik} (bütün makineleri)` })),
  ];
  const ayarEkle = (d: string) => {
    const [tur, id] = d.split(':');
    if (tur === 'makine') ayarYaz({ makineIdleri: [...ayarIdleri, Number(id)] });
    if (tur === 'istasyon') ayarYaz({ makineIdleri: ayarIdleri, istasyonIdleri: [Number(id)] });
  };
  const ata = () => {
    const [tur, id] = hedef.split(':') as [AtamaTuru, string];
    y.gonder({ yol: `${ATAMA_YOLU[tur](Number(id))}/ata`, govde: { kisiId: k.id, yuzde: yuzde.replace(',', '.') }, satir });
    hedefYaz('');
  };
  const vardiya = v.takvim?.kisiVardiyalari.find((x) => x.kisiId === k.id)?.vardiyaId ?? null;
  const vardiyalar: TakvimCevabi['vardiyalar'] = v.takvim?.vardiyalar ?? [];
  const kisitli = kisit.data?.isMerkeziIdleri ?? [];

  return (
    <article className="tc-ist-kisi" aria-label={k.ad}>
      <span className={`tc-ist-avatar ${renk}`} aria-hidden="true">{basHarfler(k.ad)}</span>
      <div className="tc-ist-kisi-govde">
        <div className="tc-ist-kisi-bas">
          <b>{k.ad}</b>
          {!k.aktif && <small className="tc-ist-ipucu">pasif</small>}
          <GecmisDugmesi kayitlar={[
            { tablo: 'kisi_is_merkezi', anahtar: { kisi_id: k.id } },
            { tablo: 'istasyonlar_kisi_tezgah_siniri', anahtar: { kisi_id: k.id } },
          ]} />
          {v.takvim && (
            <label className="tc-ist-kisi-alan">
              <span>Vardiya</span>
              <select className="tc-alan-kutu tc-ist-hucre" aria-label={`${k.ad} vardiyası`} value={vardiya ?? ''} disabled={!vardiyaYazabilir || vy.isPending}
                onChange={(o) => vy.mutate(o.target.value ? Number(o.target.value) : null)}>
                <option value="">Bütün vardiyalar</option>
                {vardiyalar.filter((x) => x.aktif || x.id === vardiya).map((x) => <option key={x.id} value={x.id}>{x.ad} {x.baslangic}-{x.bitis}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="tc-ist-kisi-satir">
          <span className="tc-ist-kisi-etiket">Atama</span>
          <span className="tc-ist-cipler">
            {k.atamalar.length === 0 && <small className="tc-ist-ipucu">Atanmamış</small>}
            {k.atamalar.map((a) => (
              <span key={`${a.tur}${a.hedefId}`} className="tc-ist-cip">
                {adi(a)} {yuzdeMetni(a.yuzde)}{a.baslayacak ? ' (başlayacak)' : ''}
                {yazabilir && (
                  <button type="button" className="tc-ist-cip-sil" aria-label={`${k.ad}: ${adi(a)} atamasını kaldır`} disabled={kapali}
                    onClick={() => cikarilanYaz(a)}>
                    <Simge ad="x" boyut="k" />
                  </button>
                )}
              </span>
            ))}
            {yazabilir && (
              <span className="tc-ist-ata-satir">
                <AranabilirSecim etiket={`${k.ad} için atanacak yer`} tur="hedef" deger={hedef} yerTutucu="+ Ata…" secenekler={hedefler} sec={hedefYaz} disabled={kapali} />
                {hedef !== '' && (
                  <>
                    <input className="tc-alan-kutu tc-ist-hucre tc-ist-sayi" aria-label={`${k.ad} atama yüzdesi`} inputMode="decimal" value={yuzde} onChange={(o) => yuzdeYaz(o.target.value)} />
                    <Dugme simge="check" disabled={kapali} onClick={ata}>Ata</Dugme>
                  </>
                )}
              </span>
            )}
          </span>
        </div>
        <div className="tc-ist-kisi-satir">
          <span className="tc-ist-kisi-etiket">Yetkinlik</span>
          <span className="tc-ist-cipler" role="group" aria-label={`${k.ad} yetkinliği`}>
            {v.yetkinlikler === null && <small className="tc-ist-ipucu">Alınamadı</small>}
            {/* Her istasyon için düğme yüzlerce düğme demekti (kart #1296): kişinin istasyonları çip, yenisi aranarak eklenir. */}
            {v.yetkinlikler && yetkin.length === 0 && <small className="tc-ist-ipucu">Yetkinlik girilmemiş</small>}
            {v.istasyonlar.filter((i) => yetkin.includes(i.id)).map((i) => { const a = ayrinti(i.id); return (
              <span key={i.id} className="tc-ist-cip" title={a?.dayanak ? `${i.ad}: ${a.dayanak}` : i.ad}>
                <span className="tc-ist-mono">{i.kod}</span>{!i.aktif && ' (pasif)'}
                {a?.gecerlilikBitis && (a.gecerli ? ` · ${a.gecerlilikBitis} bitiş` : <span className="tc-ist-dal-uyari"> süresi doldu ({a.gecerlilikBitis})</span>)}
                {yazabilir && a && (
                  <button type="button" className="tc-ist-cip-sil" aria-label={`${k.ad}: ${i.kod} yetkinliğinin bitişi ve dayanağı`} disabled={kapali}
                    onClick={() => duzenlenenYaz({
                      yol: `/kisi-yetkinlikleri/${k.id}/istasyonlar/${i.id}/ayrinti`, baslik: i.kod, bitis: a.gecerlilikBitis ?? '', dayanak: a.dayanak ?? '', surum: a.surum,
                    })}>
                    <Simge ad="edit" boyut="k" />
                  </button>
                )}
                {yazabilir && (
                  <button type="button" className="tc-ist-cip-sil" aria-label={`${k.ad}: ${i.kod} yetkinliğini kaldır`} disabled={kapali || !v.yetkinlikler}
                    onClick={() => yetkinlikYaz(yetkin.filter((x) => x !== i.id))}>
                    <Simge ad="x" boyut="k" />
                  </button>
                )}
              </span>
            ); })}
            {yazabilir && v.yetkinlikler && (
              <AranabilirSecim etiket={`${k.ad} için yetkinlik ekle`} tur="istasyon" deger="" yerTutucu="+ Yetkinlik…" disabled={kapali}
                secenekler={istasyonlar.filter((i) => !yetkin.includes(Number(i.deger)))} sec={(d) => { if (d !== '') yetkinlikYaz([...yetkin, Number(d)]); }} />
            )}
          </span>
        </div>
        {v.yetkinlikler && (yetkin.length > 0 || makineYetkin.length > 0 || enCok !== null) && (
          <div className="tc-ist-kisi-satir">
            <span className="tc-ist-kisi-etiket">Baktığı makineler</span>
            <span className="tc-ist-cipler" role="group" aria-label={`${k.ad} makine yetkinliği`}>
              {makineYetkin.length === 0 && <small className="tc-ist-ipucu">Makine seçilmemiş: plan istasyon yetkinliğine bakar</small>}
              {v.makineler.filter((m) => makineYetkin.includes(m.id)).map((m) => (
                <span key={m.id} className="tc-ist-cip" title={m.ad}>
                  <Simge ad="cpu" boyut="k" /> <span className="tc-ist-mono">{m.kod}</span>{!m.aktif && ' (pasif)'}
                  {yazabilir && (
                    <button type="button" className="tc-ist-cip-sil" aria-label={`${k.ad}: ${m.kod} makine yetkinliğini kaldır`} disabled={kapali}
                      onClick={() => makineYaz(makineYetkin.filter((x) => x !== m.id))}>
                      <Simge ad="x" boyut="k" />
                    </button>
                  )}
                </span>
              ))}
              {yazabilir && makineSecenekleri.length > 0 && (
                <AranabilirSecim etiket={`${k.ad} için makine ekle`} tur="makine" deger="" yerTutucu="+ Makine…" disabled={kapali}
                  secenekler={makineSecenekleri} sec={(d) => { if (d !== '') makineYaz([...makineYetkin, Number(d)]); }} />
              )}
              <label className="tc-ist-kisi-alan">
                <span>Aynı anda en çok</span>
                <select className="tc-alan-kutu tc-ist-hucre" aria-label={`${k.ad} aynı anda en çok tezgâh`} value={enCok ?? ''} disabled={kapali}
                  onChange={(o) => y.gonder({ yol: `/kisi-yetkinlikleri/${k.id}/tezgah-siniri`, govde: { enCok: o.target.value ? Number(o.target.value) : null }, satir })}>
                  <option value="">Sınırsız</option>
                  {Array.from({ length: TEZGAH_SINIRI_EN_COK }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} tezgâh</option>)}
                </select>
              </label>
            </span>
          </div>
        )}
        {v.yetkinlikler && (
          <div className="tc-ist-kisi-satir">
            <span className="tc-ist-kisi-etiket">Ayar yapabildiği makineler</span>
            <span className="tc-ist-cipler" role="group" aria-label={`${k.ad} ayar yetkinliği`}>
              {ayar.length === 0 && <small className="tc-ist-ipucu">Ayar yetkinliği girilmemiş</small>}
              {ayar.map((a) => { const m = v.makineler.find((x) => x.id === a.makineId); const kod = m?.kod ?? `#${a.makineId}`; return (
                <span key={a.makineId} className="tc-ist-cip" title={a.dayanak ? `${m?.ad ?? kod}: ${a.dayanak}` : m?.ad}>
                  <Simge ad="tool" boyut="k" /> <span className="tc-ist-mono">{kod}</span>{m && !m.aktif && ' (pasif)'}
                  {a.gecerlilikBitis && (a.gecerli ? ` · ${a.gecerlilikBitis} bitiş` : <span className="tc-ist-dal-uyari"> süresi doldu ({a.gecerlilikBitis})</span>)}
                  {yazabilir && (
                    <button type="button" className="tc-ist-cip-sil" aria-label={`${k.ad}: ${kod} ayar yetkinliğinin bitişi ve dayanağı`} disabled={kapali}
                      onClick={() => duzenlenenYaz({
                        yol: `/kisi-yetkinlikleri/${k.id}/ayar/${a.makineId}/ayrinti`, baslik: `${kod} ayar`, bitis: a.gecerlilikBitis ?? '', dayanak: a.dayanak ?? '', surum: a.surum,
                      })}>
                      <Simge ad="edit" boyut="k" />
                    </button>
                  )}
                  {yazabilir && (
                    <button type="button" className="tc-ist-cip-sil" aria-label={`${k.ad}: ${kod} ayar yetkinliğini kaldır`} disabled={kapali}
                      onClick={() => ayarYaz({ makineIdleri: ayarIdleri.filter((x) => x !== a.makineId) })}>
                      <Simge ad="x" boyut="k" />
                    </button>
                  )}
                </span>
              ); })}
              {yazabilir && (
                <AranabilirSecim etiket={`${k.ad} için ayar yetkinliği ekle`} tur="makine" deger="" yerTutucu="+ Ayar…" disabled={kapali}
                  secenekler={ayarSecenekleri} sec={(d) => { if (d !== '') ayarEkle(d); }} />
              )}
            </span>
          </div>
        )}
        {duzenlenen && (
          <div className="tc-ist-kisi-satir" role="group" aria-label={`${k.ad} yetkinlik ayrıntısı`}>
            <span className="tc-ist-kisi-etiket">{duzenlenen.baslik}</span>
            <span className="tc-ist-ata-satir">
              <Girdi etiket="Geçerlilik bitişi" type="date" value={duzenlenen.bitis} onChange={(o) => duzenlenenYaz({ ...duzenlenen, bitis: o.target.value })} ipucu="Boşsa süresiz." />
              <Girdi etiket="Dayanak" value={duzenlenen.dayanak} maxLength={300} onChange={(o) => duzenlenenYaz({ ...duzenlenen, dayanak: o.target.value })} ipucu="Eğitim ya da sertifika." />
              <Dugme simge="check" disabled={kapali} onClick={ayrintiKaydet}>Kaydet</Dugme>
              <Dugme simge="x" disabled={kapali} onClick={() => duzenlenenYaz(null)}>Vazgeç</Dugme>
            </span>
          </div>
        )}
        {kisitYazabilir && (
          <div className="tc-ist-kisi-satir">
            <span className="tc-ist-kisi-etiket">Çalışabildiği iş merkezleri</span>
            <span className="tc-ist-cipler" role="group" aria-label={`${k.ad} iş merkezi kısıtı`}>
              {kisit.isError && <small className="tc-ist-ipucu">Alınamadı</small>}
              {v.merkezler.filter((m) => m.aktif || kisitli.includes(m.id)).map((m) => (
                <button key={m.id} type="button" className="tc-ist-secmeli" aria-pressed={kisitli.includes(m.id)} disabled={kendisi || y.mesgul || !kisit.isSuccess}
                  onClick={() => y.gonder({ yol: `/kisi-is-merkezleri/${k.id}/belirle`, govde: { isMerkeziIdleri: kisitli.includes(m.id) ? kisitli.filter((x) => x !== m.id) : [...kisitli, m.id] }, satir })}>
                  {m.kod}
                </button>
              ))}
              {kisit.isSuccess && kisitli.length === 0 && <small className="tc-ist-ipucu">Hiçbiri seçili değil: her iş merkezinde çalışır</small>}
              {kendisi && <small className="tc-ist-ipucu">Kendi kısıtınızı değiştiremezsiniz</small>}
            </span>
          </div>
        )}
        <SatirHatasi ileti={y.hatalar[satir] ?? (vy.isError ? hataIletisi(vy.error, 'Vardiya kaydedilemedi.') : undefined)} />
      </div>
      {cikarilan && (
        <CikarOnayi tur={cikarilan.tur} hedefId={cikarilan.hedefId} kisi={{ kisiId: k.id, kisiAd: `${k.ad}: ${adi(cikarilan)}` }} mesgul={y.mesgul}
          vazgec={() => cikarilanYaz(null)}
          onayla={(govde) => { y.gonder({ yol: `${ATAMA_YOLU[cikarilan.tur](cikarilan.hedefId)}/${k.id}/cikar`, govde, satir }); cikarilanYaz(null); }} />
      )}
    </article>
  );
}

// Personel: kişiler atandıkları iş merkezine göre gruplu; atama, yetkinlik, iş merkezi kısıtı ve vardiya kartta yazılır.
// Ekipler aynı bölümün altındadır.
export function PersonelSekmesi({ v, y, yazabilir, kisitYazabilir, benId, kisiAcabilir, vardiyaYazabilir }: {
  v: TesisVerisi; y: TesisYaz; yazabilir: boolean; kisitYazabilir: boolean; benId: number; kisiAcabilir: boolean; vardiyaYazabilir: boolean;
}) {
  const [ara, araYaz] = useState('');
  const [kisiAc, kisiAcYaz] = useState(false);
  if (v.yukleniyor) return <DurumKutusu durum="yukleniyor" />;
  if (v.hata) return <DurumKutusu durum="hata" yenile={v.yenile} />;
  if (v.istasyonKisileri === null || v.makineKisileri === null || v.ekipUyeleri === null) {
    return <DurumKutusu durum="hata" mesaj="Kişi atamaları alınamadı." yenile={v.yenile} />;
  }

  const atamalar: KisiAtamasi[] = [
    ...(v.istasyonKisileri ?? []).map((a) => ({ tur: 'istasyon' as const, hedefId: a.istasyonId, ...a })),
    ...(v.makineKisileri ?? []).map((a) => ({ tur: 'makine' as const, hedefId: a.makineId, ...a })),
    ...(v.ekipUyeleri ?? []).map((a) => ({ tur: 'ekip' as const, hedefId: a.ekipId, ...a })),
  ];
  const kisiler = kisileriBirlestir(v.kisiler, atamalar).filter((k) => aramayaUyar(ara, [k.ad]));
  const merkezi = (k: KisiOzeti) => kisininMerkezi(k,
    (id) => v.istasyonlar.find((i) => i.id === id)?.isMerkeziId ?? null,
    (id) => v.makineler.find((m) => m.id === id)?.istasyonId ?? null,
    (id) => v.ekipler?.find((e) => e.id === id)?.istasyonId ?? null);
  const gruplar = [
    ...v.merkezler.map((m) => ({ id: m.id as number | null, baslik: `${m.kod} ${m.ad}`, kisiler: kisiler.filter((k) => merkezi(k) === m.id) })),
    { id: null, baslik: 'İş merkezi atanmamış', kisiler: kisiler.filter((k) => merkezi(k) === null) },
  ].filter((g) => g.kisiler.length > 0);
  const aktifVardiyalar = (v.takvim?.vardiyalar ?? []).filter((x) => x.aktif);
  // Sayılar vardiya modülünün tek tanımından gelir (Vardiya sayfası da aynısını gösterir).
  const kadro = v.takvim?.kadro ?? [];
  const kadroSayisi = (m: number, vardiyaId: number) => kadro.find((k) => k.isMerkeziId === m && k.vardiyaId === vardiyaId)?.kisiIdleri.length ?? 0;
  const kadroToplami = (m: number) => new Set(kadro.filter((k) => k.isMerkeziId === m).flatMap((k) => k.kisiIdleri)).size;
  const kadroMerkezleri = v.merkezler.filter((m) => kadroToplami(m.id) > 0);

  return (
    <div className="tc-ist-bolum">
      <div className="tc-ist-arac">
        <Girdi etiket="Kişi ara" type="search" placeholder="Kişi adı" value={ara} onChange={(o) => araYaz(o.target.value)} />
        {kisiAcabilir && <div className="tc-ist-arac-sag"><Dugme tur="birincil" simge="plus" onClick={() => kisiAcYaz(true)}>Kişi</Dugme></div>}
      </div>
      <p className="tc-ist-ipucu">
        Kişinin atamalarının toplamı 100'ü geçemez. Yetkinlik kişinin çalışabildiği istasyonlardır; plan yetkin olmadığı istasyondaki işi uyarır.
        Vardiyası seçilmeyen kişi iş merkezinin bütün açık vardiyalarında sayılır.
      </p>
      {v.takvim && aktifVardiyalar.length > 0 && kadroMerkezleri.length > 0 && (
        <section className="tc-ist-panel" aria-label="Vardiya başına personel">
          <h3 className="tc-ist-alt-baslik">Vardiya başına personel</h3>
          <div className="tc-ist-matris-kap">
            <table className="tc-ist-matris">
              <thead><tr><th scope="col">İş merkezi</th>{aktifVardiyalar.map((x) => <th key={x.id} scope="col">{x.ad}<br /><small>{x.baslangic}-{x.bitis}</small></th>)}<th scope="col">Toplam</th></tr></thead>
              <tbody>
                {kadroMerkezleri.map((m) => (
                  <tr key={m.id}>
                    <th scope="row">{m.kod} {m.ad}</th>
                    {aktifVardiyalar.map((x) => <td key={x.id}>{kadroSayisi(m.id, x.id)}</td>)}
                    <td><b>{kadroToplami(m.id)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {gruplar.length === 0 && <DurumKutusu durum="bos" mesaj={ara.trim() === '' ? 'Kişi yok.' : 'Aramaya uyan kişi yok.'} />}
      {gruplar.map((g) => (
        <section key={g.id ?? 'yok'} className={`tc-ist-panel ${merkezRengi(g.id)}`} aria-label={g.baslik}>
          <div className="tc-ist-grup-bas"><h3 className="tc-ist-alt-baslik">{g.baslik}</h3><small className="tc-ist-ipucu">{g.kisiler.length} kişi</small></div>
          {g.kisiler.map((k) => (
            <PersonelKarti key={k.id} k={k} v={v} y={y} yazabilir={yazabilir} kisitYazabilir={kisitYazabilir} kendisi={k.id === benId} vardiyaYazabilir={vardiyaYazabilir} renk={merkezRengi(g.id)} />
          ))}
        </section>
      ))}
      <section className="tc-ist-panel" aria-label="Ekipler">
        <h3 className="tc-ist-alt-baslik">Ekipler</h3>
        <Ekipler yazabilir={yazabilir} />
      </section>
      {kisiAc && <KisiAcPenceresi kapat={() => kisiAcYaz(false)} />}
    </div>
  );
}
