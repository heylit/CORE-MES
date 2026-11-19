import type { ApprovalLimit, Settings } from './tipler.ts';

// 3442-7a: onay ekranında "kim onaylayabilir". Basamak denetimi açıkken onaylayan, tutarın düştüğü basamağın ya da üst
// basamağın rolünü taşır; kapalıyken onay yetkisi olan herkes onaylar. Rolü boş basamak yetkiyle yetinir.
export function onaylayabilecekler(s: Pick<Settings, 'approvalLimits' | 'onayKademesi'>, ap: ApprovalLimit | null): string {
  if (!ap || s.onayKademesi !== true) return 'Basamak denetimi kapalı: onay yetkisi olan herkes onaylayabilir';
  if (!ap.rolId && !ap.rolAdi) return 'Bu basamakta rol yok: onay yetkisi olan herkes onaylayabilir';
  const sirali = [...(s.approvalLimits ?? [])].sort((a, b) => (a.max ?? Infinity) - (b.max ?? Infinity));
  const i = sirali.indexOf(ap);
  const ustler = i < 0 ? [ap] : sirali.slice(i);
  const adlar = [...new Set(ustler.map((l) => l.rolAdi).filter((x): x is string => !!x))];
  return adlar.length ? `Onaylayabilir: ${adlar.join(', ')}` : 'Onaylayabilir: basamağın rolünü taşıyan';
}
