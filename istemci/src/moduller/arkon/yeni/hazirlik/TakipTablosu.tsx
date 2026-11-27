import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Dugme, Menu, OnayPenceresi, Simge, type MenuOgesi } from '../../../../ortak/arayuz/index.ts';
import type { HazirlikCevabi, HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { paketleriGrupla, type GrupAdi, type PaketGrubu } from '../../../../../../arkon/web/src/data/paket-grup.ts';
import { tmiEmirId } from '../../../../../../arkon/web/src/data/tmi-adim.ts';
import { HAZIRLIK_MADDE_BILGISI } from '../../../uretim-emirleri/disari.ts';
import { YOK, sayi } from '../cekirdek/bicim.ts';
import { IS_DURUMLARI } from '../cekirdek/sabitler.ts';
import { baslamaDurumu, BASLAMA_DURUMLARI, type BaslamaDurumu, type HazirlikSatiri } from '../operator/HazirlikListesi.tsx';
import { BeklemeCipi, Cip } from './denetimler.tsx';
import { MADDE_SIRASI, hazirlikBeklenir, paketHazirligi } from './HazirlikTakibi.tsx';
import {
  PAKET_DURUMLARI, TAKIP_SUZGECLERI, calisiyorMu, geriCekilebilir, topluGeriCekilebilir, takipEmirleri,
  type AdimDilimi, type TakipSatiri, type TakipSuzgeci,
} from './kurallar.ts';
import { kmDoldurulabilir, kmPlanBagsiz } from './km-cizim.ts';
import { PlanCipi } from './PlanCipi.tsx';
import { topluGonderilebilir } from './toplu.ts';
import type { Pkg, Result, Ton } from './tipler.ts';

// 3111, 3606-2: Üretim Terminali Hazırlık'ın tek listesi. Emir (ya da seçilen grup) başlığı altında her adım tek satır: adım, paket,
// hazırlık (durum ve eksik maddelerin adı), üretim. Seçilenler terminale toplu gönderilir, benzer paketten ya da Kalite Merkezi'nden
// doldurulur, operatörden geri çekilir (pencereler TopluPencereler.tsx'te; yazma ve yetki öncekiyle aynı).
// Bütün maddeleri ızgarada görmek Adım Durumu sayfasındadır; burada yalnız eksik ve uyarılı maddeler adıyla görünür.
interface Ozellikler {
  paketler: readonly Pkg[];
  sonuclar: Readonly<Record<string, Result>>;
  hazirlik: ReadonlyMap<number, HazirlikCevabi>;
  // Okuma bitti mi (başarıyla ya da değil): bitmeden hücrenin yeri ayrılır, bittikten sonra veri yoksa hiçbir şey çizilmez.
  hazirlikOkundu: boolean;
  suz: TakipSuzgeci;
  suzYaz: (d: TakipSuzgeci) => void;
  // Süzgeç menüsündeki "Eksik madde" seçimi; boşsa süzülmez.
  eksikMadde: HazirlikMaddesi | '';
  grup: PaketGrubu;
  grupAdi?: GrupAdi;
  yayinlar: boolean;
  seciliId: string | null;
  // Madde çipi paketin ilgili sekmesini açar: talimat "Talimat ve adımlar", ötekiler "Terminale gönder" (maddeler orada).
  ac: (p: Pkg, sekme?: 'steps' | 'pub', tiklanan?: HTMLElement) => void;
  geriCekSor: (l: readonly Pkg[], toplu: boolean) => void;
  duzenler: boolean;
  gonderSor: (l: readonly Pkg[]) => void;
  benzerSor: (l: readonly Pkg[]) => void;
  kmDoldurSor: (l: readonly Pkg[]) => void;
  kmYenileSor: (l: readonly Pkg[]) => void;
}

const saat = (ms: number) => new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const DILIM_ADI: Readonly<Record<AdimDilimi, string>> = {
  bitti: 'Tamamlandı', calisiyor: 'Çalışıyor', durdu: 'Duraklatıldı ya da durdu', sirada: 'Sırada', taslak: 'Taslak', yok: 'Paket yok',
};
const BASLAMA_TONU: Readonly<Record<BaslamaDurumu, Ton>> = { durur: 'stop', uyari: 'hold', hazir: 'run' };
// Satırda en çok iki madde adı; kalanı "+N" (tamamı çipin başlığında). Durduranlar önce, sonra uyarılılar, sabit madde sırasıyla.
const AZAMI_MADDE = 2;
export function eksikMaddeler(l: readonly HazirlikSatiri[]): { madde: HazirlikMaddesi; durdurur: boolean }[] {
  return l.filter((x) => x.hal === 'eksik')
    .map((x) => ({ madde: x.madde, durdurur: !x.uyarir }))
    .sort((a, b) => Number(b.durdurur) - Number(a.durdurur) || MADDE_SIRASI[a.madde] - MADDE_SIRASI[b.madde]);
}

// Satırın hazırlık durumu (null: okunamadı ya da bitmiş iş). Durur, Uyarılı ve eksik madde süzgeçleri bunu ister.
const satirDurumu = (hz: ReadonlyMap<number, HazirlikCevabi>, x: TakipSatiri): BaslamaDurumu | null => {
  const h = x.paket ? paketHazirligi(hz, x.paket) : null;
  return h ? baslamaDurumu(h) : null;
};
// 3795: "Plan bağsız" süzgeci kontrol planı dolu ama Kalite Merkezi'ne bağlı olmayan paketleri gösterir (satırdaki işaret de bu süzgeci açar).
export function ekSuzgec(hz: ReadonlyMap<number, HazirlikCevabi>, d: TakipSuzgeci, eksikMadde: HazirlikMaddesi | ''): ((x: TakipSatiri) => boolean) | null {
  const durumSart = d === 'durur' || d === 'uyari' ? (x: TakipSatiri) => satirDurumu(hz, x) === d
    : d === 'kmBagsiz' ? (x: TakipSatiri) => !!x.paket && kmPlanBagsiz(x.paket) : null;
  if (eksikMadde === '') return durumSart;
  return (x) => {
    const h = x.paket ? paketHazirligi(hz, x.paket) : null;
    return !!h && h.some((m) => m.madde === eksikMadde && m.hal === 'eksik') && (durumSart === null || durumSart(x));
  };
}

export function TakipTablosu({
  paketler, sonuclar, hazirlik, hazirlikOkundu, suz, suzYaz, eksikMadde, grup, grupAdi, yayinlar, seciliId, ac, geriCekSor, duzenler, gonderSor, benzerSor, kmDoldurSor, kmYenileSor,
}: Ozellikler) {
  const gruplar = useMemo(() => paketleriGrupla(paketler, grup, grupAdi), [paketler, grup, grupAdi]);
  const durumu = (x: TakipSatiri) => satirDurumu(hazirlik, x);
  const emirGrubu = grup === 'emir';
  const emirler = useMemo(
    () => takipEmirleri(gruplar, sonuclar, hazirlik, suz, ekSuzgec(hazirlik, suz, eksikMadde), emirGrubu),
    [gruplar, sonuclar, hazirlik, suz, eksikMadde, emirGrubu],
  );
  // Çipteki sayı o süzgeçte görünecek iş sayısıdır ("Paket yok"ta paketsiz adım sayısı).
  const sayilar = useMemo(() => new Map(TAKIP_SUZGECLERI.map(([k]) => {
    const l = takipEmirleri(gruplar, sonuclar, hazirlik, k, ekSuzgec(hazirlik, k, eksikMadde), emirGrubu).flatMap((e) => e.satirlar);
    return [k, l.filter((x) => (k === 'paketsiz' ? !x.paket : !!x.paket)).length] as const;
  })), [gruplar, sonuclar, hazirlik, eksikMadde, emirGrubu]);
  const [secili, seciliYaz] = useState<ReadonlySet<string>>(() => new Set());
  // Seçilebilir: yayındaki başlamamış iş (geri çekme) ya da gönderilebilir iş (3362-1). Başlamış iş tek tek çekilir.
  const secilebilirMi = (p: Pkg, r: Result | null | undefined) => topluGeriCekilebilir(p, r) || topluGonderilebilir(p, r);
  const secilebilir = useMemo(() => new Set(emirler.flatMap((e) => e.satirlar.flatMap((s) => (s.paket && secilebilirMi(s.paket, s.sonuc) ? [s.paket.id] : [])))), [emirler]);
  const gecerli = [...secili].filter((id) => secilebilir.has(id));
  const isaretle = (ids: readonly string[], on: boolean) => seciliYaz((o) => { const y = new Set(o); for (const id of ids) { if (on) y.add(id); else y.delete(id); } return y; });
  const seciliPaketler = () => paketler.filter((p) => gecerli.includes(p.id));
  const sonucu = (p: Pkg) => sonuclar[p.id];
  const gonderilecek = seciliPaketler().filter((p) => topluGonderilebilir(p, sonucu(p)));
  const cekilecek = seciliPaketler().filter((p) => topluGeriCekilebilir(p, sonucu(p)));
  const doldurulacak = seciliPaketler().filter((p) => p.status === 'draft');
  const kmDoldurulacak = seciliPaketler().filter(kmDoldurulabilir);
  const kmYenilenecek = seciliPaketler().filter(kmPlanBagsiz);

  // Telefonda çubuk tek satır kalsın: tek birincil işlem görünür (gönder; gönderilecek yoksa geri çek), gerisi tek menüde.
  const cekGorunur = !gonderilecek.length && cekilecek.length > 0;
  const digerIslemler: MenuOgesi[] = [
    ...(cekilecek.length && !cekGorunur ? [{ anahtar: 'cek', baslik: `${String(cekilecek.length)} işi operatörden geri çek`, simge: 'rotate' as const, ton: 'tehlike' as const, sec: () => geriCekSor(cekilecek, true) }] : []),
    ...(duzenler && doldurulacak.length ? [{ anahtar: 'benzer', baslik: 'Benzer paketten al', simge: 'layers' as const, sec: () => benzerSor(doldurulacak) }] : []),
    ...(duzenler ? [{
      anahtar: 'km', baslik: 'Kalite Merkezi’nden doldur', simge: 'target' as const, sec: () => kmDoldurSor(kmDoldurulacak),
      pasif: !kmDoldurulacak.length, pasifNedeni: kmDoldurulacak.length ? undefined : 'Seçilenlerin hepsi dolu ya da Kalite Merkezi’ne bağlı',
    }] : []),
    ...(duzenler ? [{
      anahtar: 'kmYenile', baslik: 'Kalite Merkezi’nden yenile', simge: 'rotate' as const, sec: () => kmYenileSor(kmYenilenecek),
      pasif: !kmYenilenecek.length, pasifNedeni: kmYenilenecek.length ? undefined : 'Seçilenlerde Kalite Merkezi’ne bağsız plan yok',
    }] : []),
    { anahtar: 'kaldir', baslik: 'Seçimi kaldır', simge: 'x', sec: () => seciliYaz(new Set()) },
  ];

  return (
    <div className="tc-ay2-takip">
      <div className="tc-ay2-takip-cipler" role="group" aria-label="İş durumu">
        {TAKIP_SUZGECLERI.map(([k, l]) => {
          const n = sayilar.get(k) ?? 0;
          if (k === 'kmBagsiz' && n === 0 && suz !== k) return null;
          return (
            <button key={k} type="button" className="tc-ay2-takip-cip" aria-pressed={suz === k} data-sifir={n === 0 ? '' : undefined} data-ton={k === 'durur' && n ? 'stop' : undefined} onClick={() => suzYaz(k)}>
              {l} <span className="tc-ay2-takip-cip-sayi">{n}</span>
            </button>
          );
        })}
      </div>
      {yayinlar && gecerli.length ? (
        <div className="tc-ay2-takip-toplu" role="toolbar" aria-label="Seçilenler">
          <span role="status">{gecerli.length} iş seçili</span>
          {gonderilecek.length ? <Dugme tur="birincil" simge="next" title={`${String(gonderilecek.length)} işi terminale gönder`} onClick={() => gonderSor(gonderilecek)}>{gonderilecek.length} işi gönder</Dugme> : null}
          {cekGorunur ? <Dugme tur="tehlike" simge="rotate" title={`${String(cekilecek.length)} işi operatörden geri çek`} onClick={() => geriCekSor(cekilecek, true)}>{cekilecek.length} işi geri çek</Dugme> : null}
          <Menu etiket="Seçilenler için diğer işlemler" ipucu="Diğer işlemler" ogeler={digerIslemler} />
        </div>
      ) : null}
      {emirler.length === 0 ? <p className="tc-ay2-soluk tc-ay2-bos-satir">{paketler.length ? 'Bu durumda iş yok.' : 'Paket yok.'}</p> : null}
      <table className="tc-ay2-takip-tablo" aria-label="Hazırlık listesi">
        <thead>
          <tr>
            {yayinlar ? <th scope="col" className="tc-ay2-takip-kutu"><span className="tc-gizli-etiket">Seç</span></th> : null}
            <th scope="col">Adım</th><th scope="col">Paket</th><th scope="col">Hazırlık</th><th scope="col">Üretim</th>
            <th scope="col"><span className="tc-gizli-etiket">İşlem</span></th>
          </tr>
        </thead>
        {emirler.map((e) => {
          const emirde = e.satirlar.flatMap((s) => (s.paket && secilebilir.has(s.paket.id) ? [s.paket.id] : []));
          const hepsi = emirde.length > 0 && emirde.every((id) => secili.has(id));
          // "Hazır" sayısı açık adımların hazırlığıdır: paketsiz ve bitmiş adım paydadadır ama hazır sayılmaz (renk tek başına anlam taşımaz).
          const acikAdim = e.satirlar.filter((s) => !s.bitti);
          const hazir = acikAdim.filter((s) => durumu(s) === 'hazir').length;
          return (
          <tbody key={e.anahtar}>
            <tr className="tc-ay2-takip-emir">
              <th scope="rowgroup" colSpan={yayinlar ? 6 : 5}>
                <span className="tc-ay2-takip-emir-ic">
                  {yayinlar && emirde.length ? (
                    <label className="tc-ay2-takip-kutu-alan">
                      <input type="checkbox" className="tc-ay2-takip-emir-kutu" aria-label={`${e.no} işlerinin hepsini seç`} checked={hepsi} onChange={(o) => isaretle(emirde, o.target.checked)} />
                    </label>
                  ) : null}
                  <b className="tc-ay2-mono">{e.no}</b>{e.urun ? <span className="tc-ay2-soluk">{e.urun}</span> : null}
                  {e.rev ? <span className="tc-ay2-rev">Rev {e.rev}</span> : null}
                  {e.acil ? <Cip ton="stop">Acil</Cip> : null}
                  <BeklemeCipi neden={e.bekletme} />
                  <span className="tc-ay2-takip-ilerleme">
                    {e.termin ? <span>Termin {e.termin}</span> : null}
                    {hazirlikOkundu && acikAdim.length ? <span>{hazir}/{acikAdim.length} hazır</span> : null}
                    <span>{e.biten}/{e.dilimler.length} adım tamamlandı</span>
                    <span className="tc-ay2-takip-serit" role="img" aria-label={e.dilimler.map((d, i) => `${String(i + 1)}. adım ${DILIM_ADI[d]}`).join(', ')}>
                      {e.dilimler.map((d, i) => <i key={i} data-dilim={d} title={`${String(i + 1)}. adım · ${DILIM_ADI[d]}`} />)}
                    </span>
                  </span>
                </span>
              </th>
            </tr>
            {e.satirlar.map((s) => {
              const p = s.paket;
              if (!p) {
                return (
                  <tr key={s.anahtar} className="tc-ay2-takip-satir" data-paketsiz="">
                    {yayinlar ? <td className="tc-ay2-takip-kutu" /> : null}
                    <td data-etiket="Adım">{s.opNo !== null ? `Op ${String(s.opNo)} · ` : ''}{s.ad}</td>
                    <td data-etiket="Paket" colSpan={3}><Cip ton="stop">{s.bitti ? 'Paket yok · adım tamamlandı' : 'Paket yok'}</Cip></td>
                    <td />
                  </tr>
                );
              }
              const r = s.sonuc;
              const d = PAKET_DURUMLARI[s.durum];
              const h = paketHazirligi(hazirlik, p);
              const bd = h ? baslamaDurumu(h) : null;
              const eksik = h ? eksikMaddeler(h) : [];
              const emir = tmiEmirId(p);
              const toplu = yayinlar && secilebilir.has(p.id);
              const nOlcum = r ? Object.keys(r.meas || {}).length : 0;
              const nRed = r ? Object.values(r.meas || {}).filter((m) => !m.ok).length : 0;
              const acikNot = r ? (r.pins || []).filter((z) => z.status !== 'done').length : 0;
              const adi = `${p.no} Op ${String(s.opNo ?? '')}`;
              return (
                <tr key={s.anahtar} className="tc-ay2-takip-satir" aria-selected={seciliId === p.id} data-paket={p.id} onClick={(o) => ac(p, undefined, o.currentTarget)}>
                  {yayinlar ? (
                    <td className="tc-ay2-takip-kutu" onClick={(o) => o.stopPropagation()}>
                      <label className="tc-ay2-takip-kutu-alan">
                        <input
                          type="checkbox" aria-label={`${adi} seç`} checked={toplu && secili.has(p.id)} disabled={!toplu}
                          title={toplu ? undefined : geriCekilebilir(p) ? 'Başlamış iş tek tek geri çekilir' : 'İş bitti'}
                          onChange={(o) => isaretle([p.id], o.target.checked)}
                        />
                      </label>
                    </td>
                  ) : null}
                  <td data-etiket="Adım">
                    <button type="button" className="tc-ay2-takip-ac" onClick={(o) => { o.stopPropagation(); ac(p, undefined, o.currentTarget); }}>
                      <b>{p.op || (s.opNo !== null ? `Op ${String(s.opNo)}` : 'Operasyon girilmedi')}</b>
                      <small className="tc-ay2-mono">{p.machine || YOK}</small>
                    </button>
                  </td>
                  <td data-etiket="Paket">
                    <span className="tc-ay2-takip-cip-satir">
                      <Cip ton={d.ton}>{d.l.replace('Paket: ', '')}</Cip>
                      {p.dirty && p.status !== 'draft' ? <Cip ton="hold">Değişiklik var</Cip> : null}
                      <PlanCipi paket={p} />
                      {kmPlanBagsiz(p) ? (
                        <button
                          type="button" className="tc-ay2-takip-madde" data-ton="hold" title="Kontrol planı Kalite Merkezi’ne bağlı değil; bu paketleri listele"
                          aria-label={`${adi}: kontrol planı Kalite Merkezi’ne bağlı değil, bağsız planlı paketleri listele`}
                          onClick={(o) => { o.stopPropagation(); suzYaz('kmBagsiz'); }}
                        ><Simge ad="target" boyut="k" />Plan bağsız</button>
                      ) : null}
                      {acikNot ? <Cip ton="hazard">{acikNot} not</Cip> : null}
                    </span>
                  </td>
                  <td data-etiket="Hazırlık">
                    <span className="tc-ay2-takip-cip-satir">
                      {bd ? (
                        <Link className="tc-ay2-takip-hazirlik" to={`/adim-durumu${emir === null ? '' : `?emir=${String(emir)}`}`} onClick={(o) => o.stopPropagation()} title="Adım Durumu'nda aç">
                          <Cip ton={BASLAMA_TONU[bd]}>{BASLAMA_DURUMLARI[bd]}</Cip>
                        </Link>
                      ) : !hazirlikOkundu && hazirlikBeklenir(p) ? <span className="tc-ay2-takip-yer" aria-hidden="true" /> : YOK}
                      {eksik.slice(0, AZAMI_MADDE).map((m) => (
                        <button
                          key={m.madde} type="button" className="tc-ay2-takip-madde" data-ton={m.durdurur ? 'stop' : 'hold'}
                          title={`${HAZIRLIK_MADDE_BILGISI[m.madde].ad}: ${m.durdurur ? 'eksik, başlatmayı durdurur' : 'eksik, uyarıyla başlar'}`}
                          aria-label={`${HAZIRLIK_MADDE_BILGISI[m.madde].ad} eksik, ${adi} paketini aç`}
                          onClick={(o) => { o.stopPropagation(); ac(p, m.madde === 'talimat' ? 'steps' : 'pub', o.currentTarget); }}
                        ><Simge ad={m.durdurur ? 'x' : 'alert'} boyut="k" />{HAZIRLIK_MADDE_BILGISI[m.madde].kisa}</button>
                      ))}
                      {eksik.length > AZAMI_MADDE ? (
                        <button
                          type="button" className="tc-ay2-takip-madde" data-ton="idle"
                          title={eksik.slice(AZAMI_MADDE).map((m) => HAZIRLIK_MADDE_BILGISI[m.madde].ad).join(', ')}
                          aria-label={`${String(eksik.length - AZAMI_MADDE)} eksik madde daha, ${adi} paketini aç`}
                          onClick={(o) => { o.stopPropagation(); ac(p, 'pub', o.currentTarget); }}
                        >+{eksik.length - AZAMI_MADDE}</button>
                      ) : null}
                    </span>
                  </td>
                  <td data-etiket="Üretim" title={r ? `Son hareket ${saat(r.at)}` : undefined}>
                    <span className="tc-ay2-takip-uretim">
                      <b>{r && IS_DURUMLARI[r.state] ? IS_DURUMLARI[r.state].etiket : 'Başlamadı'}</b>
                      <small>
                        <span className="tc-ay2-mono">{r ? sayi(r.good) : YOK} / {p.target ? sayi(p.target) : YOK}</span>
                        {r && r.scrap ? <span className="tc-ay2-kirmizi tc-ay2-takip-tek"> · {sayi(r.scrap)} hurda</span> : null}
                        {nOlcum ? <span className="tc-ay2-takip-tek"> · {nOlcum}/{(p.plan || []).length} ölçüldü</span> : null}
                        {nRed ? <b className="tc-ay2-kirmizi tc-ay2-takip-tek"> · {nRed} red</b> : null}
                      </small>
                    </span>
                  </td>
                  <td className="tc-ay2-takip-islem">
                    {yayinlar && geriCekilebilir(p) ? (
                      <button
                        type="button" className="tc-ay2-arac" data-ton={calisiyorMu(r) ? 'stop' : undefined} title="Operatörden geri çek" aria-label={`${adi} operatörden geri çek`}
                        onClick={(o) => { o.stopPropagation(); geriCekSor([p], false); }}
                      ><Simge ad="rotate" /></button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          );
        })}
      </table>
    </div>
  );
}

// Tek ve toplu geri çekme aynı pencereden geçer (ayrıntıdaki düğme dahil). Başlamış iş ayrıca söylenir.
export function GeriCekPenceresi({ paketler, sonuclar, mesgul, kapat, onayla }: {
  paketler: readonly Pkg[] | null; sonuclar: Readonly<Record<string, Result>>; mesgul: boolean; kapat: () => void; onayla: (l: readonly Pkg[]) => void;
}) {
  const l = (paketler ?? []).filter(geriCekilebilir);
  const calisan = l.filter((p) => calisiyorMu(sonuclar[p.id])).length;
  const ad = (p: Pkg) => `${p.no} · ${p.op || (p.tmi?.opNo !== undefined ? `Op ${String(p.tmi.opNo)}` : 'Operasyon girilmedi')}`;
  return (
    <OnayPenceresi
      acik={paketler !== null} baslik="Operatörden geri çek" tehlikeli yukleniyor={mesgul}
      onayMetni={l.length > 1 ? `${String(l.length)} işi geri çek` : 'Geri çek'}
      onayla={() => { if (l.length) onayla(l); else kapat(); }} vazgec={kapat}
    >
      {l.length === 1 ? <p><b>{ad(l[0]!)}</b> operatör ekranından kalkar.</p> : null}
      {l.length > 1 ? (
        <>
          <p>{l.length} iş operatör ekranından kalkar:</p>
          <ul className="tc-ay2-takip-liste">{l.map((p) => <li key={p.id}>{ad(p)}</li>)}</ul>
        </>
      ) : null}
      {calisan ? <p className="tc-ay2-kirmizi tc-ay2-takip-uyari"><Simge ad="alert" boyut="k" /><span>{l.length === 1 ? 'Bu iş' : `${String(calisan)} iş`} şu an operatörde başlamış durumda; operatörün ekranından düşer.</span></p> : null}
      {l.length ? <p>Sayım, ölçüm ve gönderim geçmişi silinmez. Yeniden terminale gönderene kadar operatör göremez.</p> : <p>Geri çekilecek iş yok.</p>}
    </OnayPenceresi>
  );
}
