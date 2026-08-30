export const THEME_FONT_IDS = [
  'system-ui',
  'bricolage-grotesque',
  'space-grotesk',
  'oswald',
  'fraunces',
  'cinzel',
  'rye',
  'pixelify-sans',
  'orbitron',
  'limelight',
  'uncial-antiqua',
  'roboto-slab',
] as const

export type ThemeFontId = typeof THEME_FONT_IDS[number]
export type ThemeFontCategory = 'system' | 'expressive-sans' | 'geometric-sans' | 'condensed' |
  'serif' | 'slab-serif' | 'vintage' | 'pixel' | 'futuristic' | 'gothic' | 'western'

export interface ThemeFontDefinition {
  id: ThemeFontId
  name: string
  family: string
  category: ThemeFontCategory
  roleSuitability: { display: boolean; ui: boolean }
  source: string
  licence: { id: 'OFL-1.1' | 'Apache-2.0' | 'platform'; url: string; attribution: string }
  packageName: string | null
  files: readonly string[]
  weights: string
  styles: readonly ('normal' | 'italic')[]
}

const googleFontsSource = 'https://github.com/google/fonts'
const oflUrl = 'https://openfontlicense.org/open-font-license-official-text/'

export const themeFonts: readonly ThemeFontDefinition[] = [
  {
    id: 'system-ui', name: 'System UI',
    family: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    category: 'system', roleSuitability: { display: false, ui: true },
    source: 'The visitor’s operating system',
    licence: { id: 'platform', url: '', attribution: 'Platform-supplied fonts; no font file is redistributed by Katwed.' },
    packageName: null, files: [], weights: 'platform supplied', styles: ['normal'],
  },
  {
    id: 'bricolage-grotesque', name: 'Bricolage Grotesque',
    family: '"Bricolage Grotesque Variable", "Arial Rounded MT Bold", system-ui, sans-serif',
    category: 'expressive-sans', roleSuitability: { display: true, ui: true }, source: googleFontsSource,
    licence: { id: 'OFL-1.1', url: oflUrl, attribution: 'Copyright 2022 The Bricolage Grotesque Project Authors.' },
    packageName: '@fontsource-variable/bricolage-grotesque',
    files: ['bricolage-grotesque-latin-wght-normal.woff2'], weights: '200–800 variable', styles: ['normal'],
  },
  {
    id: 'space-grotesk', name: 'Space Grotesk', family: '"Space Grotesk Variable", system-ui, sans-serif',
    category: 'geometric-sans', roleSuitability: { display: true, ui: true }, source: googleFontsSource,
    licence: { id: 'OFL-1.1', url: oflUrl, attribution: 'Copyright 2020 The Space Grotesk Project Authors.' },
    packageName: '@fontsource-variable/space-grotesk', files: ['space-grotesk-latin-wght-normal.woff2'],
    weights: '300–700 variable', styles: ['normal'],
  },
  {
    id: 'oswald', name: 'Oswald', family: '"Oswald Variable", "Arial Narrow", sans-serif',
    category: 'condensed', roleSuitability: { display: true, ui: false }, source: googleFontsSource,
    licence: { id: 'OFL-1.1', url: oflUrl, attribution: 'Copyright 2016 The Oswald Project Authors.' },
    packageName: '@fontsource-variable/oswald', files: ['oswald-latin-wght-normal.woff2'],
    weights: '200–700 variable', styles: ['normal'],
  },
  {
    id: 'fraunces', name: 'Fraunces', family: '"Fraunces Variable", Georgia, serif',
    category: 'serif', roleSuitability: { display: true, ui: false }, source: googleFontsSource,
    licence: { id: 'OFL-1.1', url: oflUrl, attribution: 'Copyright 2020 The Fraunces Project Authors.' },
    packageName: '@fontsource-variable/fraunces', files: ['fraunces-latin-standard-normal.woff2'],
    weights: '100–900 variable', styles: ['normal'],
  },
  {
    id: 'cinzel', name: 'Cinzel', family: '"Cinzel Variable", Georgia, serif',
    category: 'serif', roleSuitability: { display: true, ui: false }, source: googleFontsSource,
    licence: { id: 'OFL-1.1', url: oflUrl, attribution: 'Copyright 2020 The Cinzel Project Authors.' },
    packageName: '@fontsource-variable/cinzel', files: ['cinzel-latin-wght-normal.woff2'],
    weights: '400–900 variable', styles: ['normal'],
  },
  {
    id: 'rye', name: 'Rye', family: '"Rye", Rockwell, serif', category: 'western',
    roleSuitability: { display: true, ui: false }, source: googleFontsSource,
    licence: { id: 'OFL-1.1', url: oflUrl, attribution: 'Copyright 2012 Sorkin Type Co; Reserved Font Name “Rye”.' },
    packageName: '@fontsource/rye', files: ['rye-latin-400-normal.woff2'], weights: '400', styles: ['normal'],
  },
  {
    id: 'pixelify-sans', name: 'Pixelify Sans', family: '"Pixelify Sans Variable", monospace',
    category: 'pixel', roleSuitability: { display: true, ui: false }, source: googleFontsSource,
    licence: { id: 'OFL-1.1', url: oflUrl, attribution: 'Copyright 2021 The Pixelify Sans Project Authors.' },
    packageName: '@fontsource-variable/pixelify-sans', files: ['pixelify-sans-latin-wght-normal.woff2'],
    weights: '400–700 variable', styles: ['normal'],
  },
  {
    id: 'orbitron', name: 'Orbitron', family: '"Orbitron Variable", system-ui, sans-serif',
    category: 'futuristic', roleSuitability: { display: true, ui: false }, source: googleFontsSource,
    licence: { id: 'OFL-1.1', url: oflUrl, attribution: 'Copyright 2018 The Orbitron Project Authors.' },
    packageName: '@fontsource-variable/orbitron', files: ['orbitron-latin-wght-normal.woff2'],
    weights: '400–900 variable', styles: ['normal'],
  },
  {
    id: 'limelight', name: 'Limelight', family: '"Limelight", Georgia, serif', category: 'vintage',
    roleSuitability: { display: true, ui: false }, source: googleFontsSource,
    licence: { id: 'OFL-1.1', url: oflUrl, attribution: 'Copyright 2010 Sorkin Type Co; Reserved Font Name “Limelight”.' },
    packageName: '@fontsource/limelight', files: ['limelight-latin-400-normal.woff2'], weights: '400', styles: ['normal'],
  },
  {
    id: 'uncial-antiqua', name: 'Uncial Antiqua', family: '"Uncial Antiqua", Georgia, serif',
    category: 'gothic', roleSuitability: { display: true, ui: false }, source: googleFontsSource,
    licence: { id: 'OFL-1.1', url: oflUrl, attribution: 'Copyright 2011 Brian J. Bonislawsky DBA Astigmatic; Reserved Font Name “Uncial Antiqua”.' },
    packageName: '@fontsource/uncial-antiqua', files: ['uncial-antiqua-latin-400-normal.woff2'],
    weights: '400', styles: ['normal'],
  },
  {
    id: 'roboto-slab', name: 'Roboto Slab', family: '"Roboto Slab Variable", Rockwell, serif',
    category: 'slab-serif', roleSuitability: { display: true, ui: true }, source: googleFontsSource,
    licence: { id: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0', attribution: 'Copyright 2018 The Roboto Slab Project Authors.' },
    packageName: '@fontsource-variable/roboto-slab', files: ['roboto-slab-latin-wght-normal.woff2'],
    weights: '100–900 variable', styles: ['normal'],
  },
]

const fontsById = new Map(themeFonts.map((font) => [font.id, font]))

export function isThemeFontId(value: unknown): value is ThemeFontId {
  return typeof value === 'string' && fontsById.has(value as ThemeFontId)
}

export function getThemeFont(value: unknown): ThemeFontDefinition | null {
  return isThemeFontId(value) ? fontsById.get(value) ?? null : null
}
