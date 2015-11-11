'use strict'

var program = require('commander')
var fsUtil = require('fs')
var glob = require('glob')
var Linter = require('format-message-core/lib/linter')
var extractFromFiles = require('./extract-files')
var transformFiles = require('./transform-files')
var pkg = require('./package.json')

var existsSync = fsUtil.existsSync
var readFileSync = fsUtil.readFileSync

function flattenFiles (files) {
  var flat = []
  files = [].concat(files || [])
  files.forEach(function (pattern) {
    flat = flat.concat(glob.sync(pattern))
  })
  return flat
}

function addStdinToFiles (files, options, next) {
  if (files.length === 0) {
    var sourceFileName = options.filename
    var sourceCode = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('readable', function () {
      var chunk = process.stdin.read()
      if (chunk) {
        sourceCode += chunk
      }
    })
    process.stdin.on('end', function () {
      files.push({ sourceCode: sourceCode, sourceFileName: sourceFileName })
      next()
    })
  } else {
    next()
  }
}

/**
 * version
 **/
module.exports = program
  .version(pkg.version)
  .option('--color', 'use colors in errors and warnings')
  .option('--no-color', 'do not use colors in errors and warnings')

/**
 * format-message lint src/*.js
 *  find message patterns in files and verify there are no obvious problems
 **/
program
  .command('lint [files...]')
  .description('find message patterns in files and verify there are no obvious problems')
  .option('-n, --function-name [name]', 'find function calls with this name [formatMessage]', 'formatMessage')
  .option('--no-auto', 'disables auto-detecting the function name from import or require calls')
  .option('-k, --key-type [type]',
    'derived key from source pattern literal|normalized|underscored|underscored_crc32 [underscored_crc32]',
    'underscored_crc32'
  )
  .option('-t, --translations [path]',
    'location of the JSON file with message translations,' +
      ' if specified, translations are also checked for errors'
  )
  .option('-f, --filename [filename]', 'filename to use when reading from stdin - this will be used in source-maps, errors etc [stdin]', 'stdin')
  .action(function (files, options) {
    files = flattenFiles(files)

    var errors = []
    files.forEach(function (file) {
      if (!existsSync(file)) {
        errors.push(file + ' doesn\'t exist')
      }
    })
    if (options.translations) {
      if (!existsSync(options.translations)) {
        errors.push(options.translations + ' doesn\'t exist')
      }
      try {
        options.translations = JSON.parse(
          readFileSync(options.translations, 'utf8')
        )
      } catch (err) {
        errors.push(err.message)
      }
    }
    if (errors.length) {
      console.error(errors.join('. '))
      process.exit(2)
    }

    addStdinToFiles(files, options, function () {
      Linter.lintFiles(files, {
        functionName: options.functionName,
        autoDetectFunctionName: options.auto,
        translations: options.translations,
        keyType: options.keyType
      })
    })
  })

/**
 * format-message extract src/*.js
 *  find and list all message patterns in files
 **/
program
  .command('extract [files...]')
  .description('find and list all message patterns in files')
  .option('-g, --generate-id [type]',
    'generate missing ids from default message pattern (literal | normalized | underscored | underscored_crc32) [underscored_crc32]',
    'underscored_crc32'
  )
  .option('-l, --locale [locale]', 'BCP 47 language tags specifying the source default locale [en]', 'en')
  .option('-f, --filename [filename]', 'filename to use when reading from stdin - this will be used in errors', 'stdin')
  .option('-o, --out-file [out]', 'write messages to this file instead of to stdout')
  .option('--format [format]',
    'use the specified format instead of detecting from the --out-file extension (yaml | es6 | commonjs | json)'
  )
  .action(function (files, options) {
    files = flattenFiles(files)

    var errors = []
    files.forEach(function (file) {
      if (!existsSync(file)) {
        errors.push(file + ' doesn\'t exist')
      }
    })
    if (errors.length) {
      console.error(errors.join('. '))
      process.exit(2)
    }

    addStdinToFiles(files, options, function () {
      extractFromFiles(files, {
        generateId: options.generateId,
        locale: options.locale,
        outFile: options.outFile,
        format: options.format
      })
    })
  })

/**
 * format-message transform src/*.js
 *  transform formatMessage calls either adding generated ids or inlining and optimizing a translation
 **/
program
  .command('transform [files...]')
  .description('transform formatMessage calls either adding generated ids or inlining and optimizing a translation')
  .option('-g, --generate-id [type]',
    'generate missing ids from default message pattern (literal | normalized | underscored | underscored_crc32) [underscored_crc32]',
    'underscored_crc32'
  )
  .option('-i, --inline', 'inline the translation for the specified locale')
  .option('-l, --locale [locale]', 'BCP 47 language tags specifying the target locale [en]', 'en')
  .option('-t, --translations [path]', 'location of the JSON file with message translations')
  .option('-e, --missing-translation [behavior]',
    'behavior when --translations is specified, but a translated pattern is missing (error | warning | ignore) [error]',
    'error'
  )
  .option('-m, --missing-replacement [pattern]', 'pattern to inline when a translated pattern is missing, defaults to the source pattern')
  .option('--source-maps-inline', 'append sourceMappingURL comment to bottom of code')
  .option('-s, --source-maps', 'save source map alongside the compiled code')
  .option('-f, --filename [filename]', 'filename to use when reading from stdin - this will be used in source-maps, errors etc [stdin]', 'stdin')
  .option('-o, --out-file [out]', 'compile all input files into a single file')
  .option('-d, --out-dir [out]', 'compile an input directory of modules into an output directory')
  .option('-r, --root [path]', 'remove root path for source filename in output directory [cwd]')
  .action(function (files, options) {
    files = flattenFiles(files)

    var errors = []
    files.forEach(function (file) {
      if (!existsSync(file)) {
        errors.push(file + ' doesn\'t exist')
      }
    })
    if (options.outDir && !files.length) {
      errors.push('files required for --out-dir')
    }
    if (options.outFile && options.outDir) {
      errors.push('cannot have --out-file and --out-dir')
    }
    if (options.sourceMaps && !options.outFile && !options.outDir) {
      errors.push('--source-maps requires --out-file or --out-dir')
    }
    if (options.translations) {
      if (!existsSync(options.translations)) {
        errors.push(options.translations + ' doesn\'t exist')
      }
      try {
        options.translations = JSON.parse(
          readFileSync(options.translations, 'utf8')
        )
      } catch (err) {
        errors.push(err.message)
      }
    }
    if (
      options.missingTranslation !== 'error' &&
      options.missingTranslation !== 'warning' &&
      options.missingTranslation !== 'ignore'
    ) {
      errors.push('--missing-translation must be "error" "warning" or "ignore"')
    }
    if (errors.length) {
      console.error(errors.join('. '))
      process.exit(2)
    }

    addStdinToFiles(files, options, function () {
      transformFiles(files, {
        generateId: options.generateId,
        inline: options.inline,
        locale: options.locale,
        translations: options.translations,
        missingTranslation: options.missingTranslation,
        missingReplacement: options.missingReplacement,
        sourceMaps: options.sourceMapsInline ? 'inline' : options.sourceMaps,
        outFile: options.outFile,
        outDir: options.outDir,
        root: options.root || process.cwd()
      })
    })
  })
