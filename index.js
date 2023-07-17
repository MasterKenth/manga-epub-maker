import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import fs, { promises } from 'fs-extra'
import readline from 'readline'
import path from 'path'
import { Validator } from 'jsonschema'
import nodepub from 'nodepub'
import jimp from 'jimp'

const rChapterNo = /^.*?(\d+\.?\d*).*$/
const tmpDirName = '_epubtmp'
const validExtensions = ['.jpg', '.png']

const configSchema = {
  id: '/config',
  type: 'object',
  properties: {
    name: {
      type: 'string',
      required: true
    },
    author: {
      type: 'string',
      required: true
    },
    genre: {
      type: 'string',
      required: true
    },
    volumes: {
      type: 'array',
      items: {
        type: 'integer'
      }
    },
    volumeCovers: {
      type: 'array',
      items: {
        type: 'string'
      },
      required: true
    }
  }
}

function ask (question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false })
  return new Promise((resolve, reject) => {
    rl.question(question, ans => {
      rl.close()
      resolve(ans)
    })
  })
}

async function throwIfNo (question) {
  const ans = await ask(`${question} [y/n] `)
  if (ans.toLowerCase() !== 'yes' && ans.toLowerCase() !== 'y') {
    throw new Error('User cancelled')
  }
}

const _run = async () => {
  const args = yargs(hideBin(process.argv))
    .usage('$0', 'create epub file(s).')
    .demandOption(['input', 'config', 'out'])
    .alias('input', 'i')
    .alias('config', 'c')
    .alias('out', 'o')
    .describe('input', 'path to dir containing chapter folders')
    .describe('config', 'path to config json file')
    .describe('out', 'path to dir to place final file(s)')
    .describe('y', 'assume yes for questions')
    .argv

  const { input, config: configPath, out: outDir, y: assumeYes } = args

  const config = JSON.parse(await fs.readFile(configPath, 'utf8'))
  const validator = new Validator()
  const configValidation = validator.validate(config, configSchema)

  if (!configValidation.valid) {
    throw new Error(`invalid config\n${configValidation.toString()}`)
  }

  const tmpDir = path.join(path.resolve(path.dirname('')), tmpDirName, config.name)

  const chapterData = await Promise.all((await fs.readdir(input))
    .map(dir => ({ dir: dir, fullDir: path.join(input, dir) }))
    .map(async obj => ({ ...obj, files: await fs.readdir(obj.fullDir) })))
    .then(data => data
      .map(obj => ({ ...obj, match: obj.dir.match(rChapterNo) }))
      .map(obj => ({ ...obj, chNo: obj.match ? parseFloat(obj.match[1]) : -1 }))
      .map(obj => ({ ...obj, files: obj.files.map(f => ({ no: parseInt(path.parse(f).name, 10), file: f })) }))
      .sort((a, b) => a.chNo - b.chNo)
    )

  /** validate chapter number */
  {
    const invalidChapters = chapterData.filter(obj => obj.match === null)
    if (invalidChapters.length > 0) {
      const err = 'got invalid chapters (unable to determine order)\n' + invalidChapters.map(obj => obj.dir).join('\n')
      throw new Error(err)
    }
  }

  /** validate image names */
  {
    const invalidChapters = chapterData
      .map(obj => ({
        ...obj,
        invalidFiles: obj.files.filter(f => isNaN(f.no)).map(f => f.file)
      }))
      .filter(obj => obj.invalidFiles.length > 0)
    if (invalidChapters.length > 0) {
      const err = 'got invalid chapters (unable to determine image number)\n' + invalidChapters.map(obj => `${obj.dir} => ${obj.invalidFiles.join(', ')}`).join('\n')
      throw new Error(err)
    }
  }

  /** validate image formats */
  {
    const invalidChapters = chapterData
      .map(obj => ({
        ...obj,
        invalidFiles: obj.files.filter(f => !validExtensions.includes(path.extname(f.file)))
      }))
      .filter(obj => obj.invalidFiles.length > 0)
    if (invalidChapters.length > 0) {
      const err = 'got invalid chapters (invalid file formats)\n' + invalidChapters.map(obj => `${obj.dir} => ${obj.invalidFiles.join(', ')}`).join('\n')
      throw new Error(err)
    }
  }

  /** validate image order */
  {
    const invalidChapters = chapterData
      .map(obj => ({
        ...obj,
        firstIndex: obj.files[0].no,
        lastIndex: obj.files[obj.files.length - 1].no
      }))
      .map(obj => ({
        ...obj,
        delta: obj.files.length - (obj.lastIndex - obj.firstIndex + 1)
      }))
      .filter(obj => obj.delta !== 0)
    if (invalidChapters.length > 0) {
      const err = 'got invalid chapters (unable to determine image order)\n' + invalidChapters.map(obj =>
        `${obj.dir} => expected ${obj.files.length}, got delta ${obj.delta} (${obj.lastIndex} - ${obj.firstIndex} + 1 = ${obj.lastIndex - obj.firstIndex})\n\t` +
        obj.files.map(f => path.parse(f.file).name).join(', ')
      ).join('\n')
      throw new Error(err)
    }
  }

  console.log('\n----- listing determined chapters')
  console.log(chapterData.map(obj => `${obj.chNo} => ${obj.dir}`).join('\n'))

  const volumeData = (config.volumes
    ? chapterData.reduce((p, c) => {
        const n = [...p]
        const idx = config.volumes.findIndex(v => v > c.chNo)
        const i = idx < 0 ? config.volumes.length : idx
        n[i] = [...n[i] || [], c]
        return n
      }, new Array(config.volumes.length + 1).fill(null))
    : [chapterData])
    .filter(vol => vol)

  console.log('\n----- listing determined volumes')
  console.log(volumeData.map((vol, i) => `#${i + 1} => ch ${vol.map(obj => obj.chNo).join(', ')}`).join('\n'))

  if (!assumeYes) await throwIfNo('\nProceed?')

  const fullOutputData = volumeData.map((chs, i) => ({
    dir: path.join(tmpDir, `vol${i}`),
    cover: path.resolve(path.dirname(configPath), config.volumeCovers[i]),
    files: chs.reduce((p, c) => [...p, ...c.files.map(f => ({ ch: c.chNo, orig: path.join(c.fullDir, f.file) }))], [])
  }))
    .map(vol => ({
      ...vol,
      files: vol.files.map((f, i) => ({ ...f, tmp: path.join(vol.dir, `${i}${path.extname(f.orig)}`) }))
    }))
    .map(vol => ({
      ...vol,
      chapters: vol.files.reduce((p, c) => ({ ...p, [c.ch]: [...(p[c.ch] || []), c] }), {})
    }))

  console.log('tmp dir:', tmpDir)
  await fs.mkdirp(tmpDir)
  await Promise.all(fullOutputData.map(vol => fs.mkdirp(vol.dir)))

  console.log('copying')
  await Promise.all(
    fullOutputData.map(vol => Promise.all(
      vol.files.map(
        (f, i) => fs.copyFile(f.orig, f.tmp)
      )))
  )

  console.log('processing')
  await Promise.all(fullOutputData.map(vol => Promise.all(vol.files.map(f =>
    /** rotate landscape images */
    jimp.read(f.tmp)
      .then(image =>
        image.bitmap.width > image.bitmap.height
          ? image
              .rotate(90)
              .writeAsync(f.tmp)
              .then(() => console.log(`rotated ${f.tmp}`))
          : Promise.resolve())
  ))))

  console.log('creating epub')
  await Promise.all(fullOutputData.map(async (vol, i) => {
    const epubMeta = {
      id: `1337420-${i}`,
      title: `${config.name} vol ${i + 1}`,
      series: config.name,
      sequence: (i + 1),
      author: config.author,
      genre: config.genre,
      cover: vol.cover,
      images: vol.files.map(f => f.tmp)
    }

    const epub = nodepub.document(epubMeta)
    epub.addCSS('body { text-align: center; margin: 0; padding: 0; width: 100%; height: 100%; } img { object-fit: contain; margin: 0; padding: 0; width: 100%; height: 100%; }')

    Object.keys(vol.chapters).sort().forEach(chkey =>
      epub.addSection(
        `Chapter #${chkey}`,
        vol.chapters[chkey].map(f => `<img src="../images/${path.basename(f.tmp)}" alt="" />`).join('')
      )
    )

    await epub.writeEPUB(outDir, `${config.name} vol ${i + 1}`)
  }))

  await new Promise(resolve => setTimeout(resolve, 500))
  process.exit(0)
}
_run()
