#!/bin/bash
npm install -g coffee-script
npm install --dev
cake build
ln -s `pwd` node_modules/noflo
npm install jsdom
