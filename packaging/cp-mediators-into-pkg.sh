#!/bin/bash
set -e

mkdir -p targets/trusty/usr/share
rm -rf targets/trusty/usr/share/*

echo "Cloning base mediators..."
git clone https://github.com/jembi/openhim-mediator-basicauth-map.git targets/trusty/usr/share/openhim-mediator-basicauth-map
echo "Done."

echo "Downloading module dependencies..."
(cd targets/trusty/usr/share/openhim-mediator-basicauth-map/ && npm install)
echo "Done."