#!/usr/bin/env node
// Note the bang line is needed for npm to correctly make this installable globally
// and executable !

// Note: this module expects option useGlobal: true --> repl.start({ useGlobal: true })
// Global is used to add a "rerequire" variable which points to the main function here
// and to assign a global variable name to the rerequired module
// see: https://nodejs.org/api/repl.html#repl_repl_start_options
'use strict'
require('repl').start({ useGlobal: true })
var fs = require('fs')

module.paths = global.module.paths
// copy over global module paths
// this gives us all the autogenerated */node_modules path hierarchy for the given PWD

var _modules = {} // { module: _var, ... }
// I store all the rerequired modules here.
// the key's value is the global variable associated with the module

const BOUND_DIR = process.cwd()
// get the cwd on startup. Since the startup cwd is stored in BOUND_DIR,
// the process can change dir (via process.chdir()) and rerequire will still be
// bound to the startup cwd.

global.rerequire = (module_name, var_name) => {
  let mod = null
  if (/^\.\.*\//.test(module_name)) { // relative path
    mod = require('path').resolve(BOUND_DIR, module_name)
  } else { // absolute path or module name
    mod = require.resolve(module_name)
  }
  // The problem is this file will be global installed in a far-away folder,
  // so it will not find the intended relative path using require.resolve --
  // So I'm using path.resolve with BOUND_DIR for relative paths ('./*' or  '../*')

  let _var = _modules[mod]

  if (_var) {
    console.log(`[rerequire]: attendez--I already have ${module_name} at variable ${_var}`)
    return false
  }

  if (!_var) {
    let fsTimeout

    _modules[mod] = var_name

    global[var_name] = require(mod)

    fs.watch(mod, (event, filename) => {
      // << This could be a source of bugs >>
      // fs.watch on linux uses inotify -- which will send two change events on each file save
      // I believe one of these is MODIFY and one is CLOSE_WRITE
      // I can't tell the difference from within Node, so I'm putting a timeout 1 sec

      // the timeout ensures that the fs has enough time to finish CLOSE_WRITE before
      // I try to read from it using require(mod).
      // it also ensures that the second call to fs will be blocked so the module
      // does not get rererequired (twice)
      if (!fsTimeout) {
        fsTimeout = setTimeout(() => fsTimeout = null, 1000)
        while (!fsTimeout) {}
      } else return

      // if (!fsTimeout && event === 'change') {
      if (event === 'change') {
        uncache(mod)
        global[var_name] = require(mod)
      }
    })

    console.log(`[rerequire]: bonjour--I've been re-requiring since 2016`)
    return true
  }
}

function uncache (mod) {
  // I am not 100% on how modules are loaded into Node,
  // but it looks like a required module is pointed to in
  // this module.children and global.require.cache --
  // So i will have to clear module.children and require.cache
  // in order for the object's memory to be recycled

  // this is the module.children clear
  module.children.forEach((child, i) => {
    if (child.id === mod) {
      module.children.splice(i, 1) // module.children is an array of object pointers
    }
  })

  // this is the require.cache clear
  // Extracted from: https://gist.github.com/thurt/404a2de66d89aa9a017c
  if ((mod = require.cache[mod]) !== undefined) {
    // Recursively go over the results
    (function run (mod) {
      // Go over each of the module's children and
      // run over it
      mod.children.forEach(function (child) {
        run(child)
      })

      delete require.cache[mod.id]
    })(mod)
  }
}
