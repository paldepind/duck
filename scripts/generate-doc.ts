import * as fs from 'fs'
import * as path from 'path'
import {generateJSON} from '../src/index'
// import * as pug from 'pug'
// @ts-ignore
import * as handlebars from 'handlebars'
// @ts-ignore
import * as yargs from 'yargs'
// @ts-ignore
import * as sass from 'node-sass'
// @ts-ignore
import * as MarkdownIt from 'markdown-it'
// @ts-ignore
import * as hljs from 'highlight.js'
import * as pug from 'pug'
import * as Prism from 'prismjs'

// const md = MarkdownIt()
const md = MarkdownIt({
  highlight: function(str: string, lang: string) {
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

function highlight(code: string): string {
  // hljs.highlight('typescript', code, true).value +
  return (
    // '<pre class="language-javascript"><code>' +
    Prism.highlight(code, Prism.languages.javascript, 'typescript')
    // + '</code></pre>'
  )
}

handlebars.registerHelper('md', function(text: string) {
  return new handlebars.SafeString(md.render(text))
  // return md.render(options.fn(this))
})

function generateDocumentation(argv: any) {
  // const template = path.resolve(__dirname, '../templates/index.pug')
  const styleFile = path.resolve(__dirname, '../templates/style.scss')
  const scriptFile = path.resolve(__dirname, '../templates/script.js')

  // const templateFn = pug.compileFile(template)

  const source = argv._[0]
  const output = argv.o

  if (!fs.existsSync(output)) {
    fs.mkdirSync(output)
  }
  // Generate data and data.json
  const data = generateJSON(source)
  fs.writeFileSync(path.resolve(output, 'data.json'), JSON.stringify(data))

  // Generate index.html
  const rendered = pug.renderFile(
    path.resolve(__dirname, '../templates/index.pug'),
    {data, md: (s: string) => md.render(s), highlight}
  )

  /*
  // Generate index.html
  const template = fs.readFileSync(
    path.resolve(__dirname, '../templates/index.handlebars'),
    'utf8'
  )
  const rendered = handlebars.compile(template)({data})
  */
  fs.writeFileSync(path.resolve(output, 'index.html'), rendered)

  // Generate styleFile
  const sassResult = sass.renderSync({file: styleFile})
  fs.writeFileSync(path.resolve(output, 'style.css'), sassResult.css)
  fs.copyFileSync(scriptFile, path.resolve(output, 'script.js'))
}

const argv = yargs
  .alias('o', 'output')
  .describe('o', 'directory for output')
  .default('o', 'dist')
  .help('help').argv

generateDocumentation(argv)
