#!/usr/bin/env bash
# CI kapsam süzgeci (kontrol.yml `kapsam` işi): değişen dosya listesini standart girdiden okur, hangi ağır işin koşacağını
# `ad=true|false` satırlarıyla yazar. Değişen her yol önce kendi satırında yazılır, kararlar en sondadır.
# Süzgeç bu işin içinde kalır, `on.paths`'e taşınmaz: dal koruması `kontrol` işini bekler, hiç açılmayan koşu onu kilitler.
# Eşleme tablosu belgeler/ci/kapsam.md'dedir; buradaki case sırası o tabloyla aynı tutulur.
# OLAY: pull_request | push | başka (her iş koşar). Çalışma dizini depo köküdür.
set -euo pipefail

hepsi() { printf 'sunucu=true\nistemci=true\nekran=true\n'; exit 0; }

case "${OLAY:-}" in pull_request|push) ;; *) hepsi ;; esac

degisenler=$(cat)
# Boş fark (ör. yalnız birleştirme commit'i) daraltılmaz: neden boş olduğu bilinmiyorsa her iş koşar.
[ -n "${degisenler//[[:space:]]/}" ] || hepsi

# Sunucu testleri istemci/src'den dosya ithal eder; ithal edilen klasörler koddan okunur, elle liste tutulmaz.
sunucunun_istemcisi=$(grep -rhoE "(\.\./)+istemci/src/[A-Za-z0-9_./-]+\.tsx?" sunucu araclar paylasilan --include=*.ts \
  | sed -E 's#^(\.\./)+##' | xargs -r -n1 dirname | sort -u || true)

sunucu=false; istemci=false; ekran=false
while IFS= read -r yol; do
  [ -z "$yol" ] && continue
  echo "$yol"
  # Ana dal arka kontroldür, daraltılmaz: belge dışında tek dosya bile değiştiyse her iş koşar. Ana dalda her yerdeki .md
  # belgedir; çekme isteği modül klasöründeki .md için testleri yine koşturur.
  if [ "$OLAY" = push ]; then
    case "$yol" in *.md|belgeler/*|kurulum/*) continue ;; *) hepsi ;; esac
  fi
  case "$yol" in
    belgeler/*|kurulum/*) ;;
    # Ortak parçalar: her iş bunlara dayanır.
    paylasilan/*|istemci/src/ortak/*|sunucu/cekirdek/*|package.json|package-lock.json|.github/*|araclar/*) hepsi ;;
    # Göç hem sunucu testlerinin hem ekran işinin veritabanını kurar.
    sunucu/gocler/*) sunucu=true; ekran=true ;;
    # Test robotu (ADR 0019) ekran işinde değil, sunucu test işinde ve Windows işinde koşar.
    ekran-testleri/benzetim/*) sunucu=true ;;
    ekran-testleri/*) ekran=true ;;
    sunucu/*) sunucu=true; ekran=true ;;
    arkon/*) sunucu=true; istemci=true; ekran=true ;;
    istemci/*) istemci=true; ekran=true
      for klasor in $sunucunun_istemcisi; do
        case "$yol" in "$klasor"/*) sunucu=true ;; esac
      done ;;
    */*) hepsi ;;
    *.md) ;;
    *) hepsi ;;
  esac
done <<< "$degisenler"
printf 'sunucu=%s\nistemci=%s\nekran=%s\n' "$sunucu" "$istemci" "$ekran"
