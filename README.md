# manga-epub-maker

ePub maker written in NodeJS tailored for manga files.

This is a helper tool useful for creating Calibre-friendly ePub files from organized 
image folders such as those downloaded with [Hakuneko](https://hakuneko.download/).

The image folders are expected to be ordered by chapter (`<root>/<chapter n>/<image>`). 
The Chapter and image number are determined from the path/file name.

Chapter number is determined by this regex: `/^.*?(\d+\.?\d*).*$/`.
Image number is determined by simply parsing the filename (so `001.jpg` etc.).

## Usage

```
index.js

Options:
      --help     Show help                               [boolean]
      --version  Show version number                     [boolean]
  -i, --input    path to dir containing chapter folders [required]
  -c, --config   path to config json file               [required]
  -o, --out      path to dir to place final file(s)     [required]
  -y             assume yes for questions
```

### Usage example
`node index.js -i "C:\Mangas\Yakusoku No Neverland" -c "config.json" -o "C:\epub"`

### Config
The json config file controls how the ePub is generated.

| Property       | Type       | Required | Description                                                                                                                                                                                          |
| -------------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`         | `string`   | `true`   | The main name of the book/series                                                                                                                                                                     |
| `author`       | `string`   | `true`   | Author of the book/series                                                                                                                                                                            |
| `genre`        | `string`   | `true`   | Main genre of the book/series                                                                                                                                                                        |
| `volumes`      | `int[]`    | `false`  | If specified, each entry specifies the first chapter in the corresponding volume, starting from volume 2, e.g. `[8, 17]` means that volume 2 starts on chapter 8, and volume 3 starts on chapter 17. |
| `volumeCovers` | `string[]` | `true`   | Array of image path (relative to the config file) for cover images for each volume. Must match the amount of volumes (at least 1).                                                                   |

### Config example
```json
{
  "name": "The Promised Neverland",
  "author": "Kaiu Shirai",
  "genre": "Dark Fantasy",
  "volumes": [
    8,
    17,
    26,
    35,
    44,
    53,
    62,
    71,
    80,
    89,
    98,
    107,
    116,
    125,
    134,
    144,
    153,
    162,
    172
  ],
  "volumeCovers": [
    "volume_1.png",
    "volume_2.png",
    "volume_3.png",
    "volume_4.png",
    "volume_5.png",
    "volume_6.png",
    "volume_7.png",
    "volume_8.png",
    "volume_9.png",
    "volume_10.png",
    "volume_11.png",
    "volume_12.png",
    "volume_13.png",
    "volume_14.png",
    "volume_15.png",
    "volume_16.png",
    "volume_17.png",
    "volume_18.png",
    "volume_19.png",
    "volume_20.png"
  ]
}
```