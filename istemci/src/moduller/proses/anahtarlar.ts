// Revizyon anahtarın son parçasıdır: yazma sonrası ['proses','parca',no] önekiyle bütün revizyonlar birlikte tazelenir.
export const anahtarlar = {
  parca: (malzemeNo: number, rev?: string | null) => (rev === undefined ? ['proses', 'parca', malzemeNo] as const : ['proses', 'parca', malzemeNo, rev] as const),
};
