// 15.4: terminaldeki çağrı yalnız ekran belleğindeydi; istasyon seçimi sayfayı yeniden yükleyince açık çağrı terminalden kayboluyor, Pano'da
// açık kalıyordu. Açık çağrı bu istasyonun çağrı kayıtlarından (calls: open, ack, esc, done) yeniden kurulur. Saf yardımcılar: ağ ve ekran yok.
export interface CagriSatiri { callId?: unknown; team?: unknown; phase?: unknown; at?: unknown; machine?: unknown; userName?: unknown; note?: unknown }
export interface AcikCagri { t0: number; ekip: string; ack: number | null; ustlenen: string | null; esc: boolean; not: string | null }

// Vardiyadan eski çağrı terminale geri getirilmez: kapatılmadan unutulmuş çağrı yeni vardiyanın üst çubuğunu tutmasın.
export const CAGRI_GERIYE_MS = 12 * 3600e3;

const metin = (d: unknown): string | null => (typeof d === 'string' && d !== '' ? d : null);

// Bu makinenin kapanmamış en yeni çağrısı; yoksa null. Çağrı kimliği açılış anıdır (operator.ts startCall: callId = String(t0)).
export function acikCagri(satirlar: readonly CagriSatiri[], makine: string, simdi: number): AcikCagri | null {
  const cagrilar = new Map<string, { t0: number | null; ekip: string | null; ack: number | null; ustlenen: string | null; esc: boolean; bitti: boolean; not: string | null }>();
  for (const s of satirlar) {
    const id = metin(s.callId);
    if (id === null || s.machine !== makine) continue;
    const c = cagrilar.get(id) ?? { t0: null, ekip: null, ack: null, ustlenen: null, esc: false, bitti: false, not: null };
    const at = typeof s.at === 'number' && Number.isFinite(s.at) ? s.at : null;
    if (s.phase === 'open') { c.t0 = Number.isSafeInteger(Number(id)) ? Number(id) : at; c.ekip = metin(s.team); c.not = metin(s.note); }
    else if (s.phase === 'ack') { c.ack = c.ack === null || (at !== null && at < c.ack) ? at : c.ack; c.ustlenen ??= metin(s.userName); }
    else if (s.phase === 'esc') c.esc = true;
    else if (s.phase === 'done') c.bitti = true;
    cagrilar.set(id, c);
  }
  let en: AcikCagri | null = null;
  for (const c of cagrilar.values()) {
    if (c.bitti || c.t0 === null || c.ekip === null || simdi - c.t0 > CAGRI_GERIYE_MS) continue;
    if (en === null || c.t0 > en.t0) en = { t0: c.t0, ekip: c.ekip, ack: c.ack, ustlenen: c.ustlenen, esc: c.esc, not: c.not };
  }
  return en;
}

// Üst çubuktaki çağrı takibinin beklediği biçim (operator.ts startCall ile aynı alanlar).
export function cagriyiKur<T extends { k: string; l: string }>(ekip: T, a: AcikCagri) {
  const msgs: { from: string; text: string; at: number }[] = [{ from: 'sys', text: ekip.l + ' ekibine iletildi' + (a.not ? ' · ' + a.not : ''), at: a.t0 }];
  if (a.ack !== null) msgs.push({ from: 'them', text: (a.ustlenen ?? 'Ekip') + ' çağrıyı aldı · geliyor', at: a.ack });
  return { ...ekip, t0: a.t0, stage: a.ack === null ? 0 : 1, who: a.ack === null ? null : a.ustlenen, note: a.not, esc: a.esc, times: a.ack === null ? [a.t0] : [a.t0, a.ack], msgs };
}
