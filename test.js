/* global it, beforeEach, afterEach */
'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const broccoli = require('broccoli')
const postcssCompiler = require('./')
const postcss = require('postcss')
const rimraf = require('rimraf')
const glob = require('glob')
const async = require('async')

const basicOptionSet = {
  plugins: [
    {
      module: require('postcss-color-rebeccapurple')
    }
  ]
}

const testWarnOptionsSet = {
  errors: {
    showSourceCode: true,
    terminalColors: false
  },
  plugins: [
    {
      module: postcss.plugin('postcss-test-warn', function (opts) {
        return function (root, result) {
          result.warn('This is a warning.')
        }
      })
    }
  ]
}

const browsersOptionSet = {
  plugins: [
    {
      module: postcss.plugin('return-options', (options) => {
        return (root, result) => {
          result.warn(options.browsers.join(', '))
        }
      })
    }
  ],
  browsers: ['last 2 versions', 'ie > 9', 'ios >= 8', '> 5%']
}

const map = {
  inline: false,
  annotation: false
}

basicOptionSet.map = map
testWarnOptionsSet.map = map

let warnings = []
let warningStreamStub = {
  write: function (warning) {
    warnings.push(warning)
  }
}

beforeEach(function () {
  warnings = []
})

afterEach(function () {
  glob('tmp/*', function (err, files) {
    if (err) {
      console.error(err)
    } else {
      async.forEach(files, rimraf)
    }
  })
})

function processCss (outputTree) {
  let builder = new broccoli.Builder(outputTree) // eslint-disable-line no-new
  outputTree.warningStream = warningStreamStub

  return builder.build().then(function () {
    let content = fs.readFileSync(path.join(builder.outputPath, 'output.css'), 'utf8')
    let sourceMap = JSON.parse(fs.readFileSync(path.join(builder.outputPath, 'output.css.map'), 'utf8'))

    assert.strictEqual(content.trim(), 'body {\n  color: #639\n}')
    assert.strictEqual(sourceMap.mappings, 'AAAA;EACE,WAAoB;CACrB')
    assert.deepEqual(warnings, [])
  })
}

it('should process css', function () {
  let outputTree = postcssCompiler(['fixture/success'], 'fixture.css', 'output.css', basicOptionSet)
  return processCss(outputTree)
})

it('should expose warnings', function () {
  let outputTree = postcssCompiler(['fixture/warning'], 'fixture.css', 'output.css', testWarnOptionsSet)
  let builder = new broccoli.Builder(outputTree) // eslint-disable-line no-new
  outputTree.warningStream = warningStreamStub

  return builder.build().then((dir) => {
    let content = fs.readFileSync(path.join(builder.outputPath, 'output.css'), 'utf8')
    assert.strictEqual(content.trim(), 'a {}')
    assert.deepEqual(warnings, [ 'postcss-test-warn: This is a warning.' ])
  })
})

it('should expose syntax errors', function () {
  let outputTree = postcssCompiler(['fixture/syntax-error'], 'fixture.css', 'output.css', testWarnOptionsSet)
  let builder = new broccoli.Builder(outputTree) // eslint-disable-line no-new
  let count = 0

  outputTree.warningStream = warningStreamStub

  return builder.build()
    .catch((error) => {
      count++
      assert.strictEqual(error.broccoliPayload.originalError.name, 'CssSyntaxError')
      assert.strictEqual(error.broccoliPayload.originalError.message, `${error.broccoliPayload.originalError.input.file}:1:1: Unknown word\n> 1 | a }\n    | ^\n  2 | `)
    })
    .then(() => {
      assert.strictEqual(count, 1)
      assert.deepEqual(warnings, [])
    })
})

it('should expose non-syntax errors', function () {
  let outputTree = postcssCompiler(['fixture/missing-file'], 'fixture.css', 'output.css', testWarnOptionsSet)
  let count = 0

  outputTree.warningStream = warningStreamStub

  try {
    new broccoli.Builder(outputTree) // eslint-disable-line no-new
  } catch (err) {
    count++
    assert.strictEqual(err.name, 'BuilderError')
  }

  assert.strictEqual(count, 1)
  assert.deepEqual(warnings, [])
})

it('should use browser options', function () {
  let outputTree = postcssCompiler(['fixture/success'], 'fixture.css', 'output.css', browsersOptionSet)
  let builder = new broccoli.Builder(outputTree) // eslint-disable-line no-new
  outputTree.warningStream = warningStreamStub

  assert.strictEqual(outputTree.browsers.join(', '), 'last 2 versions, ie > 9, ios >= 8, > 5%')

  return builder.build().then((dir) => {
    assert.deepEqual(warnings, [ 'return-options: last 2 versions, ie > 9, ios >= 8, > 5%' ])
  })
})

it('supports an array of plugin instances', function () {
  let basicPlugin = basicOptionSet.plugins[0].module
  let basicOptions = basicOptionSet.plugins[0].options
  let pluginInstance = basicPlugin(basicOptions)

  let outputTree = postcssCompiler(['fixture/success'], 'fixture.css', 'output.css', {
    plugins: [
      pluginInstance
    ],
    map: map
  })
  return processCss(outputTree)
})
