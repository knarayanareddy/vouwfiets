#!/usr/bin/env sh
# scripts/sync-bikes.sh - Synchronize data/bikes.json to js/bikes.js
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

JSON_FILE="$ROOT_DIR/data/bikes.json"
JS_FILE="$ROOT_DIR/js/bikes.js"

if [ ! -f "$JSON_FILE" ]; then
  echo "Error: $JSON_FILE not found." >&2
  exit 1
fi

perl -e '
  use strict;
  use warnings;
  my $json_file = $ARGV[0];
  my $js_file = $ARGV[1];
  open(my $in, "<:encoding(UTF-8)", $json_file) or die "Cannot open $json_file: $!";
  local $/;
  my $content = <$in>;
  close($in);
  # Strip trailing whitespace/newlines
  $content =~ s/\s+$//;
  die "Empty or invalid content in $json_file\n" unless length($content) > 10;
  open(my $out, ">:encoding(UTF-8)", $js_file) or die "Cannot open $js_file: $!";
  print $out "window.BIKES = " . $content . ";\n";
  close($out);
  print "Successfully synced $json_file -> $js_file\n";
' "$JSON_FILE" "$JS_FILE"
