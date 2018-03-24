import * as fs from 'fs'
import * as path from 'path'
import {generateJSON} from '../src/index'
import * as pug from 'pug'
import * as yargs from 'yargs'

function generateDocumentation(argv) {
  const template = path.resolve(__dirname, '../templates/index.pug')

  const templateFn = pug.compileFile(template)

  const source = argv._[0]
  const data = generateJSON(source)

  const rendered = templateFn({data})

  fs.writeFileSync('data.json', JSON.stringify(data))
  fs.writeFileSync('index.html', rendered)
}

const argv = yargs
  .alias('o', 'output')
  .describe('o', 'destination for output')
  .help('help').argv

generateDocumentation(argv)
