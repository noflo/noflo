#!/bin/bash
npm install -g coffee-script
cake build
ln -s `pwd` node_modules/noflo
