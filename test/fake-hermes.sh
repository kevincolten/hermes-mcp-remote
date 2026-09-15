#!/bin/sh
# Stand-in for the real CLI so the bridge can be exercised without Hermes.
echo "fake-hermes argv: $*"
while [ "$1" = "-p" ]; do shift 2; done
case "$1" in
  -z) shift; echo "answer to: $*";;
  status) echo "all good";;
  sleep) sleep "$2";;
  fail) echo "boom" >&2; exit 3;;
esac
