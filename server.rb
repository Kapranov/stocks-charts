#!/usr/bin/env bash

clear

echo -en "Serving at http://212.26.132.49:2273"
echo -en '\n\n'
ruby -run -e httpd . -p 2273
