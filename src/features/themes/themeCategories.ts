export const THEME_CATEGORY_IDS = [
  'katwed-originals',
  'abstract',
  'music',
  'decades',
  'cinematic',
  'places-culture',
  'seasonal',
  'entertainment',
  'wildcards',
] as const

export type ThemeCategoryId = typeof THEME_CATEGORY_IDS[number]

export interface ThemeCategoryDefinition {
  id: ThemeCategoryId
  name: string
  description: string
}

export const themeCategories: readonly ThemeCategoryDefinition[] = [
  { id: 'katwed-originals', name: 'Katwed Originals', description: 'The signature Katwed visual language.' },
  { id: 'abstract', name: 'Abstract', description: 'Colour, shape and atmosphere without a literal setting.' },
  { id: 'music', name: 'Music', description: 'Visual identities rooted in musical scenes and performance.' },
  { id: 'decades', name: 'Decades', description: 'Era-led visual languages and graphic references.' },
  { id: 'cinematic', name: 'Cinematic', description: 'Genre-led worlds with a strong screen identity.' },
  { id: 'places-culture', name: 'Places & Culture', description: 'Visual languages inspired by places and traditions.' },
  { id: 'seasonal', name: 'Seasonal', description: 'Celebrations and moments in the calendar.' },
  { id: 'entertainment', name: 'Entertainment', description: 'Games, shows and playful spectacle.' },
  { id: 'wildcards', name: 'Wildcards', description: 'Distinctive ideas that resist a single category.' },
]

const categoriesById = new Map(themeCategories.map((category) => [category.id, category]))

export function isThemeCategoryId(value: unknown): value is ThemeCategoryId {
  return typeof value === 'string' && categoriesById.has(value as ThemeCategoryId)
}

export function getThemeCategory(value: unknown): ThemeCategoryDefinition | null {
  return isThemeCategoryId(value) ? categoriesById.get(value) ?? null : null
}
