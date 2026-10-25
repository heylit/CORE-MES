import { useBildirim } from '../../../../ortak/arayuz/index.ts';
import { useMesaj } from '../durum.tsx';
import { kisiAnahtari } from '../kurallar.ts';
import { dosyaAdi, gorevOlayi, icsIndir, icsTakvimi, toplantiOlayi } from '../takvim/ics.ts';
import { GOREV_DURUMLARI, TOPLANTI_YANITLARI } from '../ortak/index.ts';
import type { Gorev, GorevDurumu, IzSatiri, ToplantiYaniti } from '../tipler.ts';
import type { MesajYetkisi } from '../yetki.ts';

export type Katilim = ToplantiYaniti;

export const iz = (by: string, t: string): IzSatiri => ({ by, ts: Date.now(), t });
// Görev durumunu alan da değiştirir (225 a'nın "durum herkese"si); diğer alanlar ve silme `duzenleyebilir` ile.
export const durumDegistirebilir = (t: Pick<Gorev, 'to' | 'by'>, yetki: MesajYetkisi, ben: string): boolean =>
  yetki.yaz && (yetki.yonetici || t.to === ben || t.by === ben);
// Yazıcı hatayı ortak iletiyle gösterip yeniden atar; burada yalnız yutulur.
const sessiz = (p: Promise<unknown>) => { p.catch(() => undefined); };

// Kartların ve ayrıntı sayfalarının ortak işleri (prototipin setTaskStatus, vote, rsvp, calAdd, calAddTask).
export function useIsEylemleri() {
  const { ben, yaz, veri, ad } = useMesaj();
  const { bildir } = useBildirim();

  const toplantiIcs = (id: string) => {
    const mt = veri.toplantilar.find((t) => t.id === id);
    if (mt) icsIndir(`${dosyaAdi(mt.title)}.ics`, icsTakvimi([toplantiOlayi(mt, ad, Date.now())]));
  };

  return {
    gorevDurumu(id: string, s: GorevDurumu) {
      const t = veri.gorevler.find((g) => g.id === id);
      if (!t || t.status === s) return;
      sessiz(yaz.guncelle(`tasks/${id}`, {
        status: s, doneAt: s === 'done' ? Date.now() : null,
        last: iz(ben.id, s === 'done' ? 'görevi bitirdi' : `görevi “${GOREV_DURUMLARI[s].t}” yaptı`),
      }).then(() => { if (s === 'done') bildir('tamam', 'Görev bitti. Eline sağlık!'); }));
    },
    oyVer(id: string, d: 'ok' | 'no', not = '') {
      const a = veri.onaylar.find((o) => o.id === id);
      if (!a) return;
      sessiz(yaz.guncelle(`approvals/${id}`, {
        votes: { [kisiAnahtari(ben.id)]: { u: ben.id, d, note: not, ts: Date.now(), r: a.round || 1 } },
        last: iz(ben.id, d === 'ok' ? 'onayladı' : 'reddetti'),
      }).then(() => bildir('tamam', d === 'ok' ? 'Onayladın.' : 'Reddettin.')));
    },
    katilim(id: string, r: Katilim) {
      sessiz(yaz.guncelle(`toplantilar/${id}`, {
        rsvp: { [kisiAnahtari(ben.id)]: { u: ben.id, r, ts: Date.now() } },
        last: iz(ben.id, r === 'yes' ? 'katılacağını bildirdi' : r === 'no' ? 'katılamayacağını bildirdi' : 'belki katılacağını bildirdi'),
      }).then(() => bildir('tamam', `${TOPLANTI_YANITLARI[r].t} olarak yanıtladın.`,
        r === 'no' ? undefined : { eylem: { etiket: 'Takvimime ekle', yap: () => toplantiIcs(id) } })));
    },
    toplantiIcs,
    gorevIcs(id: string) {
      const t = veri.gorevler.find((g) => g.id === id);
      if (!t) return;
      const olay = gorevOlayi(t, `Mesai görevi. Veren: ${ad(t.by)}`, Date.now());
      if (olay === null) { bildir('bilgi', 'Önce son tarih ya da hatırlatma ekle.'); return; }
      icsIndir(`${dosyaAdi(t.title)}.ics`, icsTakvimi([olay]));
    },
  };
}
