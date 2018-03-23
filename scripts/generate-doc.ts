import * as fs from "fs";
import { generateJSON } from "../src/index";
import * as pug from "pug";
import * as yargs from "yargs";

const template = "../templates/index.pug";

const templateFn = pug.compileFile(template);

const argv = require("yargs")
  .alias("o", "output")
  .describe("o", "destination for output")
  .help("help").argv;

const source = argv._[0];
const data = generateJSON(source);

const rendered = templateFn({ data });

fs.writeFileSync("data.json", JSON.stringify(data));
fs.writeFileSync("index.html", rendered);
