import * as fs from 'fs'
import * as path from 'path'
import {generateJSON} from '../src/index'
// import * as pug from 'pug'
import * as handlebars from 'handlebars'
import * as yargs from 'yargs'
import * as sass from 'node-sass'
import * as MarkdownIt from 'markdown-it'
import * as hljs from 'highlight.js'

// const md = MarkdownIt()
const md = MarkdownIt({
  highlight: function(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          '<pre class="hljs"><code>' +
          hljs.highlight(lang, str, true).value +
          '</code></pre>'
        )
      } catch (__) {}
    }

    return (
      '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>'
    )
  }
})

handlebars.registerHelper('md', function(text) {
  return new handlebars.SafeString(md.render(text))
  // return md.render(options.fn(this))
})

function generateDocumentation(argv) {
  // const template = path.resolve(__dirname, '../templates/index.pug')
  const styleFile = path.resolve(__dirname, '../templates/style.scss')

  // const templateFn = pug.compileFile(template)

  const source = argv._[0]

  // Generate data and data.json
  const data = generateJSON(source)
  fs.writeFileSync(path.resolve(argv.o, 'data.json'), JSON.stringify(data))

  // Generate index.html
  const template = fs.readFileSync(
    path.resolve(__dirname, '../templates/index.handlebars'),
    'utf8'
  )
  const rendered = handlebars.compile(template)({data})
  fs.writeFileSync(path.resolve(argv.o, 'index.html'), rendered)

  // Generate styleFile
  const sassResult = sass.renderSync({file: styleFile})
  fs.writeFileSync(path.resolve(argv.o, 'style.css'), sassResult.css)
}

const argv = yargs
  .alias('o', 'output')
  .describe('o', 'directory for output')
  .default('o', 'dist')
  .help('help').argv

generateDocumentation(argv)
