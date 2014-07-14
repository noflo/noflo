NoFlo: Flow-based programming for JavaScript [![Build Status](https://secure.travis-ci.org/noflo/noflo.png?branch=master)](http://travis-ci.org/noflo/noflo) [![Build status](https://ci.appveyor.com/api/projects/status/k4jbqlpohq81pvny)](https://ci.appveyor.com/project/bergie/noflo)
=========================================

NoFlo is an implementation of [flow-based programming](http://en.wikipedia.org/wiki/Flow-based_programming) for JavaScript running on both Node.js and the browser. From WikiPedia:

> In computer science, flow-based programming (FBP) is a programming paradigm that defines applications as networks of "black box" processes, which exchange data across predefined connections by message passing, where the connections are specified externally to the processes. These black box processes can be reconnected endlessly to form different applications without having to be changed internally. FBP is thus naturally component-oriented.

Developers used to the [Unix philosophy](http://en.wikipedia.org/wiki/Unix_philosophy) should be immediately familiar with FBP:

> This is the Unix philosophy: Write programs that do one thing and do it well. Write programs to work together. Write programs to handle text streams, because that is a universal interface.

It also fits well in Alan Kay's [original idea of object-oriented programming](http://userpage.fu-berlin.de/~ram/pub/pub_jf47ht81Ht/doc_kay_oop_en):

> I thought of objects being like biological cells and/or individual computers on a network, only able to communicate with messages (so messaging came at the very beginning -- it took a while to see how to do messaging in a programming language efficiently enough to be useful).

NoFlo has been written in [CoffeeScript](http://jashkenas.github.com/coffee-script) for simplicity. The system is heavily inspired by [J. Paul Morrison's](http://www.jpaulmorrison.com/) book [Flow-Based Programming](http://www.jpaulmorrison.com/fbp/#More). 

Read more at <http://noflojs.org/>.

## Requirements and installing

NoFlo is available for Node.js [via NPM](https://npmjs.org/package/noflo), so you can install it with:

    $ npm install -g noflo

You can customize and download the browser version of NoFlo at <http://noflojs.org/download/>.

### Installing from Git

NoFlo requires a reasonably recent version of [Node.js](http://nodejs.org/), and some [npm](http://npmjs.org/) packages. Ensure you have the `grunt-cli` package installed (`grunt` command should be available on command line) and NoFlo checked out from Git. Build NoFlo with:

    $ grunt build

You can also build NoFlo only for the desired target platform with either *grunt build:nodejs* or *grunt build:browser*.

Then you can install everything needed by a simple:

    $ npm link

NoFlo is available from [GitHub](https://github.com/noflo/noflo) under the MIT license.

## Changes

Please refer to the [Release Notes](https://github.com/noflo/noflo/releases) and the [CHANGES.md document](https://github.com/noflo/noflo/blob/master/CHANGES.md).

## Usage

Please refer to <http://noflojs.org/documentation/>. For visual programming with NoFlo, see <http://flowhub.io/documentation/>.

## Development

NoFlo development happens on GitHub. Just fork the [main repository](https://github.com/noflo/noflo), make modifications and send a pull request.

We have an extensive suite of tests available for NoFlo. Run them with:

    $ grunt test

or:

    $ npm test

### Platform-specific tests

By default, the tests are run for both Node.js and the browser. You can also run only the tests for a particular target platform:

    $ grunt test:nodejs

or:

    $ grunt test:browser

### Running tests automatically

The build system used for NoFlo is also able to watch for changes in the filesystem and run the tests automatically when something changes. To start the watcher, run:

    $ grunt watch

To quit thew watcher, just end the process with Ctrl-C.

## Discussion

There is an IRC channel `#fbp` on FreeNode, and questions can be posted with the [`noflo` tag on Stack Overflow](http://stackoverflow.com/questions/tagged/noflo). See <http://noflojs.org/support/> for other ways to get in touch.
